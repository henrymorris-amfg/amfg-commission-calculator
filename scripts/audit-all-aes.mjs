/**
 * Full audit script: validates Pipedrive won deals, monthly ARR, demos, and VOIP dials
 * for all 4 active AEs against the live APIs and the database.
 */

import { readFileSync } from "fs";

// Load env from process.env (injected by the platform)
const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY || "";
const VOIP_API_KEY = process.env.VOIP_STUDIO_API_KEY || "";

const BASE_URL = "http://localhost:3000";
const token = Buffer.from(JSON.stringify({ aeId: 1, ts: Date.now() })).toString("base64url");

// ─── Helpers ────────────────────────────────────────────────────────────────

async function pipedriveGet(path, params = {}) {
  const url = new URL(`https://api.pipedrive.com/v1${path}`);
  url.searchParams.set("api_token", PIPEDRIVE_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!data.success) throw new Error(`Pipedrive error: ${JSON.stringify(data.error)}`);
  return data;
}

async function pipedriveGetAll(path, params = {}) {
  const items = [];
  let start = 0;
  while (true) {
    const data = await pipedriveGet(path, { ...params, start, limit: 500 });
    if (data.data) items.push(...data.data);
    if (!data.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }
  return items;
}

// voipGet defined below with correct base URL

async function callTrpc(procedure, input) {
  const url = `${BASE_URL}/api/trpc/${procedure}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-AE-Token": token },
    body: JSON.stringify({ json: input }),
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result?.data?.json ?? data.result?.data;
}

// ─── FX rates ───────────────────────────────────────────────────────────────

async function getFxRates() {
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await res.json();
    return data.rates ?? {};
  } catch {
    return { GBP: 0.79, EUR: 0.92 };
  }
}

async function toUsd(value, currency, rates) {
  if (!value || value === 0) return 0;
  if (currency === "USD") return value;
  const rate = rates[currency];
  if (!rate) return value;
  return value / rate;
}

// ─── Pipedrive user lookup ───────────────────────────────────────────────────

async function findPipedriveUserId(name) {
  const users = await pipedriveGetAll("/users");
  const lower = name.toLowerCase();
  const exact = users.find(u => u.name?.toLowerCase() === lower);
  if (exact) return { id: exact.id, name: exact.name };
  const partial = users.find(u => u.name?.toLowerCase().includes(lower.split(" ")[0].toLowerCase()));
  if (partial) return { id: partial.id, name: partial.name };
  return null;
}

// ─── Pipedrive won deals ─────────────────────────────────────────────────────

const TARGET_PIPELINES = ["Machining", "Closing SMB", "Closing Enterprise"];

async function fetchWonDeals(userId, months = 12) {
  const allPipelines = await pipedriveGetAll("/pipelines");
  const targetIds = allPipelines
    .filter(p => TARGET_PIPELINES.includes(p.name))
    .map(p => p.id);

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const allDeals = await pipedriveGetAll("/deals", {
    user_id: userId,
    status: "won",
  });

  return allDeals.filter(d => {
    if (!targetIds.includes(d.pipeline_id)) return false;
    const wonDate = new Date(d.won_time || d.close_time || d.update_time);
    return wonDate >= cutoff;
  });
}

// ─── Pipedrive demos ─────────────────────────────────────────────────────────

async function fetchDemos(userId, months = 6) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const activities = await pipedriveGetAll("/activities", {
    user_id: userId,
    type: "demo",
    done: 1,
  });

  return activities.filter(a => {
    const d = new Date(a.due_date || a.update_time);
    return d >= cutoff;
  });
}

// ─── VOIP dials ──────────────────────────────────────────────────────────────

const VOIP_BASE = "https://l7api.com/v1.2/voipstudio";

async function voipGet(endpoint, params = {}) {
  const url = new URL(`${VOIP_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    headers: { "X-Auth-Token": VOIP_API_KEY },
  });
  if (!res.ok) throw new Error(`VOIP error: ${res.status}`);
  return res.json();
}

async function fetchVoipUsers() {
  const data = await voipGet("users", { limit: 100 });
  return (data.data || []).filter(u => u.active !== false).map(u => ({
    id: u.id,
    name: `${u.first_name} ${u.last_name}`.trim(),
    extension: u.ext || "",
  }));
}

function buildFilter(filters) {
  return JSON.stringify(filters);
}

async function fetchVoipStats(userId, months = 3) {
  const results = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
    try {
      const totalFilter = buildFilter([
        { property: "calldate", operator: "gte", value: `${from} 00:00:00` },
        { property: "calldate", operator: "lte", value: `${to} 23:59:59` },
        { property: "type", operator: "eq", value: "O" },
        { property: "user_id", operator: "eq", value: userId },
      ]);
      const totalData = await voipGet("cdrs", { filter: totalFilter, limit: 1 });
      const connFilter = buildFilter([
        { property: "calldate", operator: "gte", value: `${from} 00:00:00` },
        { property: "calldate", operator: "lte", value: `${to} 23:59:59` },
        { property: "type", operator: "eq", value: "O" },
        { property: "user_id", operator: "eq", value: userId },
        { property: "disposition", operator: "eq", value: "CONNECTED" },
      ]);
      const connData = await voipGet("cdrs", { filter: connFilter, limit: 1 });
      results.push({ year, month, totalDials: totalData.total || 0, connected: connData.total || 0 });
    } catch (e) {
      results.push({ year, month, totalDials: 0, connected: 0, error: e.message });
    }
  }
  return results;
}

// ─── Database state ──────────────────────────────────────────────────────────

async function getDbMetrics(aeId) {
  // Use per-AE token to query metrics
  const aeToken = Buffer.from(JSON.stringify({ aeId, ts: Date.now() })).toString("base64url");
  const url = `${BASE_URL}/api/trpc/metrics.list`;
  const res = await fetch(url, {
    headers: { "X-AE-Token": aeToken },
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result?.data?.json ?? [];
}

async function getDbDeals(aeId) {
  const aeToken = Buffer.from(JSON.stringify({ aeId, ts: Date.now() })).toString("base64url");
  const url = `${BASE_URL}/api/trpc/deals.list`;
  const res = await fetch(url, {
    headers: { "X-AE-Token": aeToken },
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result?.data?.json ?? [];
}

// ─── Main audit ──────────────────────────────────────────────────────────────

const AES = [
  { name: "Henry Morris", aeId: 1 },
  { name: "Joe Payne", aeId: 30002 },
  { name: "Toby Greer", aeId: 30004 },
  { name: "Julian Earl", aeId: 30003 },
];

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function monthKey(y, m) { return `${y}-${String(m).padStart(2,"0")}`; }

console.log("=".repeat(80));
console.log("AMFG Commission Calculator — Full Data Audit");
console.log(`Run at: ${new Date().toLocaleString()}`);
console.log("=".repeat(80));

const rates = await getFxRates();
const voipUsers = await fetchVoipUsers();
console.log(`\nFX rates loaded. VOIP users found: ${voipUsers.length}`);

// Map VOIP users by display name
const voipByName = {};
for (const u of voipUsers) {
  const name = (u.display_name || u.name || "").toLowerCase();
  voipByName[name] = u;
}

const report = [];

for (const ae of AES) {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`AE: ${ae.name} (DB id: ${ae.aeId})`);
  console.log("─".repeat(70));

  const aeReport = { name: ae.name, aeId: ae.aeId, issues: [] };

  // ── Pipedrive user match ──
  const pdUser = await findPipedriveUserId(ae.name);
  if (!pdUser) {
    console.log(`  ⚠️  NOT FOUND in Pipedrive`);
    aeReport.pipedriveMatch = null;
    aeReport.issues.push("Not found in Pipedrive");
  } else {
    console.log(`  ✓ Pipedrive match: "${pdUser.name}" (id: ${pdUser.id})`);
    aeReport.pipedriveMatch = pdUser;
  }

  // ── VOIP user match ──
  const nameLower = ae.name.toLowerCase();
  const firstName = ae.name.split(" ")[0].toLowerCase();
  const voipUser = voipByName[nameLower] ||
    Object.values(voipByName).find(u => {
      const n = (u.display_name || u.name || "").toLowerCase();
      return n.includes(firstName);
    });
  if (!voipUser) {
    console.log(`  ⚠️  NOT FOUND in VOIP Studio`);
    aeReport.voipMatch = null;
    aeReport.issues.push("Not found in VOIP Studio");
  } else {
    const ext = voipUser.extension || voipUser.sip_username || voipUser.username;
    console.log(`  ✓ VOIP match: "${voipUser.display_name || voipUser.name}" (ext: ${ext})`);
    aeReport.voipMatch = { ...voipUser, ext };
  }

  // ── Pipedrive won deals (last 12 months) ──
  let pdDeals = [];
  if (pdUser) {
    pdDeals = await fetchWonDeals(pdUser.id, 12);
    console.log(`\n  Pipedrive won deals (last 12 months): ${pdDeals.length}`);

    // Group by month
    const pdByMonth = {};
    for (const d of pdDeals) {
      const wonDate = new Date(d.won_time || d.close_time);
      const y = wonDate.getFullYear();
      const m = wonDate.getMonth() + 1;
      const key = monthKey(y, m);
      if (!pdByMonth[key]) pdByMonth[key] = { year: y, month: m, deals: [], arrUsd: 0 };
      const arrUsd = await toUsd(d.value || 0, d.currency || "USD", rates);
      pdByMonth[key].deals.push({ title: d.title, arrUsd: Math.round(arrUsd), currency: d.currency, rawValue: d.value });
      pdByMonth[key].arrUsd += arrUsd;
    }

    const sortedMonths = Object.values(pdByMonth).sort((a,b) => a.year*100+a.month - (b.year*100+b.month));
    for (const m of sortedMonths) {
      console.log(`    ${MONTH_NAMES[m.month-1]} ${m.year}: ${m.deals.length} deals, $${Math.round(m.arrUsd).toLocaleString()} ARR`);
      for (const d of m.deals) {
        console.log(`      - ${d.title} ($${d.arrUsd.toLocaleString()} USD${d.currency !== "USD" ? ` from ${d.rawValue} ${d.currency}` : ""})`);
      }
    }
    aeReport.pdByMonth = pdByMonth;
    aeReport.pdDeals = pdDeals;
  }

  // ── Pipedrive demos (last 6 months) ──
  let pdDemos = [];
  if (pdUser) {
    pdDemos = await fetchDemos(pdUser.id, 6);
    console.log(`\n  Pipedrive completed demos (last 6 months): ${pdDemos.length}`);
    const demosByMonth = {};
    for (const d of pdDemos) {
      const dt = new Date(d.due_date || d.update_time);
      const key = monthKey(dt.getFullYear(), dt.getMonth()+1);
      demosByMonth[key] = (demosByMonth[key] || 0) + 1;
    }
    for (const [k, v] of Object.entries(demosByMonth).sort()) {
      const [y, m] = k.split("-");
      console.log(`    ${MONTH_NAMES[parseInt(m)-1]} ${y}: ${v} demos`);
    }
    aeReport.pdDemos = pdDemos;
    aeReport.demosByMonth = demosByMonth;
  }

  // ── VOIP dials (last 3 months) ──
  let voipStats = [];
  if (aeReport.voipMatch) {
    const ext = aeReport.voipMatch.ext;
    voipStats = await fetchVoipStats(ext, 3);
    console.log(`\n  VOIP dials (last 3 months, ext: ${ext}):`);
    for (const s of voipStats) {
      const connRate = s.totalDials > 0 ? ((s.connected/s.totalDials)*100).toFixed(1) : "0.0";
      console.log(`    ${MONTH_NAMES[s.month-1]} ${s.year}: ${s.totalDials} dials, ${s.connected} connected (${connRate}%)`);
    }
    aeReport.voipStats = voipStats;
  }

  // ── Database state ──
  let dbMetrics = [];
  try {
    const result = await getDbMetrics(ae.aeId);
    dbMetrics = result || [];
  } catch (e) {
    console.log(`  ⚠️  Could not fetch DB metrics: ${e.message}`);
  }

  let dbDeals = [];
  try {
    const result = await getDbDeals(ae.aeId);
    dbDeals = result || [];
  } catch (e) {
    console.log(`  ⚠️  Could not fetch DB deals: ${e.message}`);
  }

  console.log(`\n  DB monthly metrics: ${dbMetrics.length} rows`);
  const recentMetrics = dbMetrics
    .sort((a,b) => b.year*100+b.month - (a.year*100+a.month))
    .slice(0, 6);
  for (const m of recentMetrics) {
    console.log(`    ${MONTH_NAMES[m.month-1]} ${m.year}: ARR $${(m.arrUsd||0).toLocaleString()}, demos ${m.demosTotal||0}, dials ${m.dialsTotal||0}`);
  }

  console.log(`\n  DB deals: ${dbDeals.length} records`);
  aeReport.dbMetrics = recentMetrics;
  aeReport.dbDeals = dbDeals;

  // ── Cross-validation ──
  console.log(`\n  VALIDATION:`);

  // Check deals match
  if (pdUser) {
    const dbPdIds = new Set(dbDeals.map(d => d.pipedriveId).filter(Boolean));
    const pdIds = new Set(pdDeals.map(d => String(d.id)));
    const missingInDb = pdDeals.filter(d => !dbPdIds.has(String(d.id)));
    const extraInDb = dbDeals.filter(d => d.pipedriveId && !pdIds.has(d.pipedriveId));

    if (missingInDb.length === 0) {
      console.log(`  ✓ All ${pdDeals.length} Pipedrive won deals are in the commission calculator`);
    } else {
      console.log(`  ⚠️  ${missingInDb.length} Pipedrive deals NOT in commission calculator:`);
      for (const d of missingInDb) {
        const arrUsd = await toUsd(d.value || 0, d.currency || "USD", rates);
        console.log(`      - ${d.title} ($${Math.round(arrUsd).toLocaleString()} USD)`);
      }
      aeReport.issues.push(`${missingInDb.length} Pipedrive deals missing from commission calculator`);
    }
    if (extraInDb.length > 0) {
      console.log(`  ⚠️  ${extraInDb.length} DB deals reference Pipedrive IDs not in current query (may be older than 12 months)`);
    }
  }

  // Check dials match DB
  if (voipStats.length > 0) {
    for (const vs of voipStats) {
      const dbRow = dbMetrics.find(m => m.year === vs.year && m.month === vs.month);
      if (!dbRow) {
        console.log(`  ⚠️  ${MONTH_NAMES[vs.month-1]} ${vs.year}: VOIP shows ${vs.totalDials} dials but NO DB row`);
        aeReport.issues.push(`${MONTH_NAMES[vs.month-1]} ${vs.year}: dials missing from DB`);
      } else if (dbRow.dialsTotal !== vs.totalDials) {
        console.log(`  ⚠️  ${MONTH_NAMES[vs.month-1]} ${vs.year}: VOIP=${vs.totalDials} dials vs DB=${dbRow.dialsTotal} dials`);
        if (Math.abs((dbRow.dialsTotal||0) - vs.totalDials) > 5) {
          aeReport.issues.push(`${MONTH_NAMES[vs.month-1]} ${vs.year}: dials mismatch (VOIP: ${vs.totalDials}, DB: ${dbRow.dialsTotal})`);
        }
      } else {
        console.log(`  ✓ ${MONTH_NAMES[vs.month-1]} ${vs.year}: dials match (${vs.totalDials})`);
      }
    }
  }

  // Check demos match DB
  if (aeReport.demosByMonth) {
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const key = monthKey(y, m);
      const pdCount = aeReport.demosByMonth[key] || 0;
      const dbRow = dbMetrics.find(r => r.year === y && r.month === m);
      const dbCount = dbRow?.demosTotal || 0;
      if (pdCount !== dbCount) {
        console.log(`  ⚠️  ${MONTH_NAMES[m-1]} ${y}: Pipedrive demos=${pdCount} vs DB demos=${dbCount}`);
        if (Math.abs(pdCount - dbCount) > 1) {
          aeReport.issues.push(`${MONTH_NAMES[m-1]} ${y}: demos mismatch (Pipedrive: ${pdCount}, DB: ${dbCount})`);
        }
      } else {
        console.log(`  ✓ ${MONTH_NAMES[m-1]} ${y}: demos match (${pdCount})`);
      }
    }
  }

  // 3-month rolling averages
  const last3 = dbMetrics
    .sort((a,b) => b.year*100+b.month - (a.year*100+a.month))
    .slice(0, 3);
  if (last3.length > 0) {
    const totalArr = last3.reduce((s,m) => s + (m.arrUsd||0), 0);
    const totalDials = last3.reduce((s,m) => s + (m.dialsTotal||0), 0);
    const totalDemos = last3.reduce((s,m) => s + (m.demosTotal||0), 0);
    const avgArr = totalArr / last3.length;
    const avgDialsPw = totalDials / 12;
    const avgDemosPw = totalDemos / 12;
    console.log(`\n  3-MONTH ROLLING AVERAGES (from DB):`);
    console.log(`    Avg monthly ARR: $${Math.round(avgArr).toLocaleString()}`);
    console.log(`    Avg dials/week:  ${avgDialsPw.toFixed(1)}`);
    console.log(`    Avg demos/week:  ${avgDemosPw.toFixed(2)}`);
    aeReport.rollingAvg = { avgArr, avgDialsPw, avgDemosPw };
  }

  report.push(aeReport);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(80)}`);
console.log("SUMMARY");
console.log("=".repeat(80));
for (const ae of report) {
  const status = ae.issues.length === 0 ? "✅ OK" : `⚠️  ${ae.issues.length} issue(s)`;
  console.log(`\n${ae.name}: ${status}`);
  if (ae.issues.length > 0) {
    for (const issue of ae.issues) console.log(`  - ${issue}`);
  }
  if (ae.rollingAvg) {
    const r = ae.rollingAvg;
    console.log(`  Avg monthly ARR: $${Math.round(r.avgArr).toLocaleString()} | Dials/wk: ${r.avgDialsPw.toFixed(1)} | Demos/wk: ${r.avgDemosPw.toFixed(2)}`);
  }
}
console.log(`\n${"=".repeat(80)}`);
