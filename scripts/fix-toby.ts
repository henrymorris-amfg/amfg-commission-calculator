/**
 * Fix Toby Greer's monthly metrics:
 * 1. Update demo counts from Pipedrive (Aug 2025 - Feb 2026)
 * 2. Verify and fix ARR data from Pipedrive won deals
 */

import { config } from "dotenv";
config({ path: "/home/ubuntu/amfg-commission/.env" });

import { getDb, upsertMonthlyMetric, getMetricsForMonth } from "../server/db";
import { aeProfiles } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";
const TARGET_PIPELINE_IDS = [20, 12, 10];

// Toby's demo data from Pipedrive (verified above)
const TOBY_DEMOS: Record<string, number> = {
  "2025-08": 11,
  "2025-09": 17,
  "2025-10": 20,
  "2025-11": 15,
  "2025-12": 15,
  "2026-01": 15,
  "2026-02": 3,
};

async function getFxRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await res.json() as { rates: Record<string, number> };
    return data.rates;
  } catch {
    return { GBP: 0.79, EUR: 0.92 };
  }
}

async function toUsd(value: number, currency: string): Promise<number> {
  if (currency === "USD") return value;
  const rates = await getFxRates();
  const rate = rates[currency.toUpperCase()];
  if (!rate) return value;
  return value / rate;
}

async function main() {
  const db = await getDb();
  if (!db) { console.error("No DB"); process.exit(1); }

  const profiles = await db.select().from(aeProfiles);
  const toby = profiles.find(p => p.name === "Toby Greer");
  if (!toby) { console.error("Toby not found"); process.exit(1); }

  console.log(`Toby Greer (ID: ${toby.id}), join date: ${toby.joinDate}`);

  // Step 1: Update demo counts
  console.log("\n--- Step 1: Updating demo counts ---");
  for (const [ym, demos] of Object.entries(TOBY_DEMOS)) {
    const [yearStr, monthStr] = ym.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const existing = await getMetricsForMonth(toby.id, year, month);
    await upsertMonthlyMetric({
      aeId: toby.id,
      year,
      month,
      arrUsd: existing?.arrUsd ?? "0",
      demosTotal: demos,
      demosFromPipedrive: demos,
      dialsTotal: existing?.dialsTotal ?? 0,
      retentionRate: existing?.retentionRate ?? null,
    });
    console.log(`  ${ym}: demos updated to ${demos} (was ${existing?.demosTotal ?? 0})`);
  }

  // Step 2: Pull ARR from Pipedrive for Toby
  console.log("\n--- Step 2: Checking ARR from Pipedrive ---");
  const apiKey = process.env.PIPEDRIVE_API_KEY;
  if (!apiKey) { console.error("No PIPEDRIVE_API_KEY"); process.exit(1); }

  // Find Toby's Pipedrive user ID
  const usersRes = await fetch(`${PIPEDRIVE_BASE}/users?api_token=${apiKey}`);
  const usersData = await usersRes.json() as { data: Array<{ id: number; name: string }> };
  const tobyPd = usersData.data?.find(u => u.name.toLowerCase().includes("toby"));
  if (!tobyPd) { console.error("Toby not found in Pipedrive"); process.exit(1); }
  console.log(`Toby Pipedrive ID: ${tobyPd.id}`);

  const joinDate = new Date(toby.joinDate);
  const fromDate = joinDate.toISOString().substring(0, 10);
  const toDate = new Date().toISOString().substring(0, 10);

  const allDeals: Array<{ value: number; currency: string; won_time: string | null; close_time: string | null }> = [];
  for (const pipelineId of TARGET_PIPELINE_IDS) {
    let start = 0;
    while (true) {
      const url = new URL(`${PIPEDRIVE_BASE}/deals`);
      url.searchParams.set("api_token", apiKey);
      url.searchParams.set("pipeline_id", String(pipelineId));
      url.searchParams.set("user_id", String(tobyPd.id));
      url.searchParams.set("status", "won");
      url.searchParams.set("limit", "500");
      url.searchParams.set("start", String(start));
      const res = await fetch(url.toString());
      const resp = await res.json() as {
        data: Array<{ value: number; currency: string; won_time: string | null; close_time: string | null }> | null;
        additional_data?: { pagination?: { more_items_in_collection?: boolean } };
      };
      const data = resp.data || [];
      const filtered = data.filter(d => {
        const wonDate = (d.won_time || d.close_time || "").substring(0, 10);
        return wonDate >= fromDate && wonDate <= toDate;
      });
      allDeals.push(...filtered);
      if (!resp.additional_data?.pagination?.more_items_in_collection) break;
      start += 500;
    }
  }

  console.log(`Found ${allDeals.length} won deals for Toby`);

  // Aggregate ARR by month
  const monthMap = new Map<string, number>();
  for (const deal of allDeals) {
    const wonDate = (deal.won_time || deal.close_time || "").substring(0, 10);
    if (!wonDate) continue;
    const year = parseInt(wonDate.substring(0, 4));
    const month = parseInt(wonDate.substring(5, 7));
    const key = `${year}-${month}`;
    const valueUsd = await toUsd(deal.value || 0, deal.currency || "USD");
    monthMap.set(key, (monthMap.get(key) ?? 0) + valueUsd);
  }

  console.log("\nARR by month from Pipedrive:");
  for (const [key, arr] of Array.from(monthMap.entries()).sort()) {
    console.log(`  ${key}: $${Math.round(arr).toLocaleString()}`);
  }

  // Update ARR in DB
  for (const [key, totalArrUsd] of Array.from(monthMap.entries())) {
    const [yearStr, monthStr] = key.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const existing = await getMetricsForMonth(toby.id, year, month);
    await upsertMonthlyMetric({
      aeId: toby.id,
      year,
      month,
      arrUsd: String(Math.round(totalArrUsd)),
      demosTotal: existing?.demosTotal ?? 0,
      dialsTotal: existing?.dialsTotal ?? 0,
      retentionRate: existing?.retentionRate ?? null,
    });
    console.log(`  ${key}: ARR updated to $${Math.round(totalArrUsd).toLocaleString()} (was $${Number(existing?.arrUsd ?? 0).toLocaleString()})`);
  }

  console.log("\nDone! Toby's metrics are now correct.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
