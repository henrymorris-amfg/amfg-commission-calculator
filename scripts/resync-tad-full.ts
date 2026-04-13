/**
 * Full targeted resync for Tad Tamulevicius.
 * 
 * Tad's Pipedrive display name is "Tad" (ID: 25357905), not "Tad Tamulevicius",
 * so the standard name-matching sync misses him. This script uses his Pipedrive
 * user ID directly to pull demos and ARR, then updates both:
 *   1. pipedrive_demo_activities (raw demo records)
 *   2. monthly_metrics (demosTotal + demosFromPipedrive)
 * 
 * Run with: npx tsx scripts/resync-tad-full.ts
 */

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

import { drizzle } from "drizzle-orm/mysql2";
import { eq, sql } from "drizzle-orm";
import { aeProfiles, pipedriveDemoActivities, monthlyMetrics } from "../drizzle/schema";

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;
const TAD_PD_USER_ID = 25357905;
const TAD_AE_ID = 60001;

if (!PIPEDRIVE_API_KEY || !DATABASE_URL) {
  console.error("ERROR: Missing PIPEDRIVE_API_KEY or DATABASE_URL");
  process.exit(1);
}

const db = drizzle(DATABASE_URL);

// ─── Pipedrive helpers ────────────────────────────────────────────────────────

async function pipedriveGetAll(endpoint: string, params: Record<string, string | number> = {}): Promise<any[]> {
  const url = new URL(`https://api.pipedrive.com/v1/${endpoint}`);
  url.searchParams.set("api_token", PIPEDRIVE_API_KEY);
  url.searchParams.set("limit", "500");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  let allData: any[] = [];
  let start = 0;
  while (true) {
    url.searchParams.set("start", String(start));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Pipedrive API error: ${res.status} for ${endpoint}`);
    const json = await res.json() as any;
    const data = json.data ?? [];
    allData = allData.concat(data);
    if (!json.additional_data?.pagination?.more_items_in_collection || data.length === 0) break;
    start += 500;
  }
  return allData;
}

async function getFxRate(): Promise<number> {
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await res.json() as any;
    return data.rates?.GBP ?? 0.79;
  } catch { return 0.79; }
}

async function toUsd(value: number, currency: string): Promise<number> {
  if (currency === "USD") return value;
  const usdToGbp = await getFxRate();
  if (currency === "GBP") return value / usdToGbp;
  return value;
}

// ─── Verify Tad's profile ─────────────────────────────────────────────────────

const [tad] = await db.select().from(aeProfiles).where(eq(aeProfiles.id, TAD_AE_ID));
if (!tad) {
  console.error(`ERROR: No AE profile found with id=${TAD_AE_ID}`);
  process.exit(1);
}
console.log(`\nFound Tad: id=${tad.id}, name="${tad.name}", joined=${new Date(tad.joinDate).toISOString().substring(0, 10)}`);

const fromDate = new Date(tad.joinDate).toISOString().substring(0, 10);
const toDate = new Date().toISOString().substring(0, 10);
console.log(`Syncing from ${fromDate} to ${toDate}\n`);

// ─── 1. Sync demos ────────────────────────────────────────────────────────────

console.log("=== Step 1: Fetching completed demos from Pipedrive ===");
const allActivities = await pipedriveGetAll("activities", {
  user_id: TAD_PD_USER_ID,
  type: "demo",
  done: 1,
});

const completedDemos = allActivities.filter((d: any) => {
  if (!d.marked_as_done_time) return false;
  const doneDate = d.marked_as_done_time.substring(0, 10);
  return doneDate >= fromDate && doneDate <= toDate;
});

console.log(`Found ${completedDemos.length} completed demos since join date`);

// Upsert into pipedrive_demo_activities
if (completedDemos.length > 0) {
  const records = completedDemos.map((d: any) => {
    const doneTime = d.marked_as_done_time as string;
    return {
      aeId: TAD_AE_ID,
      pipedriveActivityId: String(d.id),
      subject: d.subject || "(no subject)",
      orgName: d.org_name ?? null,
      dealId: d.deal_id ?? null,
      dealTitle: d.deal_title ?? null,
      doneDate: new Date(doneTime),
      year: parseInt(doneTime.substring(0, 4), 10),
      month: parseInt(doneTime.substring(5, 7), 10),
      isValid: true,
      flagReason: null,
    };
  });

  const BATCH = 50;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    await db.insert(pipedriveDemoActivities)
      .values(batch)
      .onDuplicateKeyUpdate({
        set: {
          subject: sql`VALUES(subject)`,
          orgName: sql`VALUES(orgName)`,
          dealId: sql`VALUES(dealId)`,
          dealTitle: sql`VALUES(dealTitle)`,
          doneDate: sql`VALUES(doneDate)`,
          year: sql`VALUES(year)`,
          month: sql`VALUES(month)`,
        },
      });
  }
  console.log(`✓ Upserted ${records.length} demo records into pipedrive_demo_activities`);
}

// Aggregate demos by month
const demosByMonth = new Map<string, number>();
for (const d of completedDemos) {
  const doneTime = d.marked_as_done_time as string;
  const year = parseInt(doneTime.substring(0, 4), 10);
  const month = parseInt(doneTime.substring(5, 7), 10);
  const key = `${year}-${month}`;
  demosByMonth.set(key, (demosByMonth.get(key) || 0) + 1);
}

console.log("\nDemos by month:");
for (const [key, count] of Array.from(demosByMonth.entries()).sort()) {
  const weeksInMonth = 4.33;
  console.log(`  ${key}: ${count} demos (${(count / weeksInMonth).toFixed(1)}/wk)`);
}

// ─── 2. Sync ARR from won deals ───────────────────────────────────────────────

console.log("\n=== Step 2: Fetching won deals from Pipedrive ===");
const TARGET_PIPELINE_IDS = [20, 12, 10];
const DEAL_EXCLUSION_KEYWORDS = ["implementation", "customer success", " cs ", "onboarding", "- cs"];

function isDealExcluded(title: string): boolean {
  const lower = " " + title.toLowerCase() + " ";
  return DEAL_EXCLUSION_KEYWORDS.some((kw) => lower.includes(kw));
}

const dealsById = new Map<number, any>();
for (const pipelineId of TARGET_PIPELINE_IDS) {
  const deals = await pipedriveGetAll("deals", {
    pipeline_id: pipelineId,
    user_id: TAD_PD_USER_ID,
    status: "won",
  });
  for (const d of deals) {
    if (dealsById.has(d.id)) continue;
    if (isDealExcluded(d.title)) continue;
    const wonDate = (d.won_time || d.close_time || "").substring(0, 10);
    if (wonDate >= fromDate && wonDate <= toDate) dealsById.set(d.id, d);
  }
}

const wonDeals = Array.from(dealsById.values());
console.log(`Found ${wonDeals.length} won deals since join date`);

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

// ─── 3. Update monthly_metrics ────────────────────────────────────────────────

console.log("\n=== Step 3: Updating monthly_metrics ===");

// Get all months that have data
const allMonths = new Set([...arrByMonth.keys(), ...demosByMonth.keys()]);

// Also preserve existing rows (dials data)
const existingRows = await db.select().from(monthlyMetrics).where(eq(monthlyMetrics.aeId, TAD_AE_ID));
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
    aeId: TAD_AE_ID,
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
  console.log(`  ${key}: arr=$${Math.round(arrUsd).toLocaleString()} demos=${demosTotal}(${perWeek}/wk) dials=${dialsTotal}(${dialsPerWeek}/wk)`);
}

console.log("\n✓ Tad's data fully resynced!\n");
process.exit(0);
