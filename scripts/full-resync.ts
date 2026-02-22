/**
 * Full data resync for all AEs:
 * 1. Pull ARR from Pipedrive won deals (all time)
 * 2. Pull dials from VOIP Studio (all time)
 * 3. Pull demos from Pipedrive completed activities (all time)
 * 4. Merge all data into monthly_metrics
 * 
 * Run with: npx tsx scripts/full-resync.ts
 */

import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, desc } from "drizzle-orm";
import { monthlyMetrics } from "../drizzle/schema";
import { config } from "dotenv";
config();

if (!process.env.DATABASE_URL) {
  const { readFileSync } = await import("fs");
  const envContent = readFileSync("/home/ubuntu/.user_env", "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY!;
const VOIP_API_KEY = process.env.VOIP_STUDIO_API_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;

if (!PIPEDRIVE_API_KEY || !DATABASE_URL) {
  console.error("ERROR: Missing PIPEDRIVE_API_KEY or DATABASE_URL");
  process.exit(1);
}

const db = drizzle(DATABASE_URL);

// ─── FX Rate ──────────────────────────────────────────────────────────────────

async function getFxRate(): Promise<number> {
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    if (!res.ok) throw new Error("FX API error");
    const data = (await res.json()) as { rates: Record<string, number> };
    return data.rates.GBP ?? 0.79;
  } catch {
    return 0.79;
  }
}

async function toUsd(value: number, currency: string): Promise<number> {
  if (currency === "USD") return value;
  const usdToGbp = await getFxRate();
  if (currency === "GBP") return value / usdToGbp;
  return value;
}

// ─── Pipedrive helpers ────────────────────────────────────────────────────────

async function pipedriveGet(endpoint: string, params: Record<string, string | number> = {}) {
  const url = new URL(`https://api.pipedrive.com/v1/${endpoint}`);
  url.searchParams.set("api_token", PIPEDRIVE_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Pipedrive API error: ${res.status} for ${endpoint}`);
  return res.json() as Promise<any>;
}

async function fetchAllWonDealsForUser(pipedriveUserId: number, fromDate: string, toDate: string) {
  const TARGET_PIPELINE_IDS = [20, 12, 10];
  const dealsById = new Map<number, any>();

  for (const pipelineId of TARGET_PIPELINE_IDS) {
    let start = 0;
    while (true) {
      const resp = await pipedriveGet("deals", {
        pipeline_id: pipelineId,
        user_id: pipedriveUserId,
        status: "won",
        limit: 500,
        start,
      });
      const data = resp.data || [];
      for (const d of data) {
        if (dealsById.has(d.id)) continue;
        const wonDate = (d.won_time || d.close_time || "").substring(0, 10);
        if (wonDate >= fromDate && wonDate <= toDate) dealsById.set(d.id, d);
      }
      if (!resp.additional_data?.pagination?.more_items_in_collection || data.length === 0) break;
      start += 500;
    }
  }
  return Array.from(dealsById.values());
}

async function fetchAllDemosForUser(pipedriveUserId: number, fromDate: string, toDate: string) {
  const all: any[] = [];
  let start = 0;
  while (true) {
    const resp = await pipedriveGet("activities", {
      user_id: pipedriveUserId,
      type: "demo",
      done: 1,
      limit: 500,
      start,
    });
    const data = resp.data || [];
    all.push(...data);
    if (!resp.additional_data?.pagination?.more_items_in_collection || data.length === 0) break;
    start += 500;
  }
  return all.filter((a) => {
    const doneTime = a.marked_as_done_time || a.due_date;
    if (!doneTime) return false;
    const doneDate = doneTime.substring(0, 10);
    return doneDate >= fromDate && doneDate <= toDate;
  });
}

// ─── VOIP Studio helpers ──────────────────────────────────────────────────────

async function fetchVoipDials(voipUserId: string, year: number, month: number): Promise<number> {
  if (!VOIP_API_KEY) return 0;
  try {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

    const url = `https://api.voipstudio.com/v1/reports/calls?user_id=${voipUserId}&start_date=${startDate}&end_date=${endDate}&limit=1000`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${VOIP_API_KEY}` },
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as any;
    return data.total || data.data?.length || 0;
  } catch {
    return 0;
  }
}

// ─── Aggregate helpers ────────────────────────────────────────────────────────

function aggregateArrByMonth(deals: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const deal of deals) {
    const wonDate = (deal.won_time || deal.close_time || "").substring(0, 10);
    if (!wonDate) continue;
    const year = parseInt(wonDate.substring(0, 4), 10);
    const month = parseInt(wonDate.substring(5, 7), 10);
    const key = `${year}-${month}`;
    // We'll compute USD value later
    map.set(key, (map.get(key) || 0) + 1); // just count for now
  }
  return map;
}

function aggregateDemosByMonth(demos: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const demo of demos) {
    const doneTime = demo.marked_as_done_time || demo.due_date;
    if (!doneTime) continue;
    const year = parseInt(doneTime.substring(0, 4), 10);
    const month = parseInt(doneTime.substring(5, 7), 10);
    const key = `${year}-${month}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

// ─── AE configuration ─────────────────────────────────────────────────────────

const AE_CONFIG = [
  { aeId: 30000, name: "Henry Morris", joinDateStr: "2025-01-01", pipedriveId: 15871239 },
  { aeId: 30001, name: "Joe Payne", joinDateStr: "2025-06-16", pipedriveId: 23861740 },
  { aeId: 30002, name: "Toby Greer", joinDateStr: "2025-07-28", pipedriveId: 24052953 },
  { aeId: 30003, name: "Julian Earl", joinDateStr: "2026-02-04", pipedriveId: 25094488 },
];

const today = new Date().toISOString().substring(0, 10);

console.log("\n=== Full data resync for all AEs ===\n");

for (const ae of AE_CONFIG) {
  console.log(`\n--- ${ae.name} (AE ID: ${ae.aeId}) ---`);

  try {
    // 1. Fetch all won deals for ARR
    const wonDeals = await fetchAllWonDealsForUser(ae.pipedriveId, ae.joinDateStr, today);
    console.log(`  Won deals: ${wonDeals.length}`);

    // 2. Aggregate ARR by month
    const arrByMonth = new Map<string, number>();
    for (const deal of wonDeals) {
      const wonDate = (deal.won_time || deal.close_time || "").substring(0, 10);
      if (!wonDate) continue;
      const year = parseInt(wonDate.substring(0, 4), 10);
      const month = parseInt(wonDate.substring(5, 7), 10);
      const key = `${year}-${month}`;
      const valueUsd = await toUsd(deal.value || 0, deal.currency || "USD");
      arrByMonth.set(key, (arrByMonth.get(key) || 0) + valueUsd);
    }

    // 3. Fetch all completed demos
    const demos = await fetchAllDemosForUser(ae.pipedriveId, ae.joinDateStr, today);
    const demosByMonth = aggregateDemosByMonth(demos);
    console.log(`  Completed demos: ${demos.length}`);

    // 4. Merge all data - collect all months that have any data
    const allMonths = new Set([...arrByMonth.keys(), ...demosByMonth.keys()]);

    // Also add months from existing DB rows (to preserve dials data)
    const existingRows = await db.select().from(monthlyMetrics)
      .where(eq(monthlyMetrics.aeId, ae.aeId))
      .orderBy(desc(monthlyMetrics.year), desc(monthlyMetrics.month));
    
    for (const row of existingRows) {
      allMonths.add(`${row.year}-${row.month}`);
    }

    const existingByKey = new Map(existingRows.map(r => [`${r.year}-${r.month}`, r]));

    for (const key of Array.from(allMonths).sort()) {
      const [yearStr, monthStr] = key.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);

      const arrUsd = arrByMonth.get(key) || 0;
      const demosTotal = demosByMonth.get(key) || 0;
      const existing = existingByKey.get(key);
      const dialsTotal = existing?.dialsTotal || 0;
      const retentionRate = existing?.retentionRate ?? null;
      const connectedDials = existing?.connectedDials ?? 0;
      const connectionRate = existing?.connectionRate ?? null;
      const talkTimeSecs = existing?.talkTimeSecs ?? 0;

      await db.insert(monthlyMetrics).values({
        aeId: ae.aeId,
        year,
        month,
        arrUsd: String(Math.round(arrUsd)),
        demosTotal,
        demosFromPipedrive: demosTotal,
        dialsTotal,
        retentionRate,
        connectedDials,
        connectionRate,
        talkTimeSecs,
      }).onDuplicateKeyUpdate({
        set: {
          arrUsd: String(Math.round(arrUsd)),
          demosTotal,
          demosFromPipedrive: demosTotal,
        },
      });

      const perWeek = (demosTotal / 4.33).toFixed(1);
      const dialsPerWeek = (dialsTotal / 4.33).toFixed(0);
      console.log(`  ${key}: arr=$${Math.round(arrUsd)} demos=${demosTotal}(${perWeek}/wk) dials=${dialsTotal}(${dialsPerWeek}/wk)`);
    }
  } catch (err) {
    console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log("\n=== Done! ===\n");
process.exit(0);
