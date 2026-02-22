/**
 * Fix Henry Morris's ARR data and clean up Julian Earl's incorrect historical data.
 * Run with: npx tsx scripts/fix-henry-arr.ts
 */

import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, lt } from "drizzle-orm";
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
const DATABASE_URL = process.env.DATABASE_URL!;

const db = drizzle(DATABASE_URL);

// ─── FX Rate ──────────────────────────────────────────────────────────────────

async function toUsd(value: number, currency: string): Promise<number> {
  if (currency === "USD") return value;
  // Use a hardcoded recent rate as fallback since FX API may be unreliable
  const GBP_TO_USD = 1.0 / 0.742; // ~1.348
  const EUR_TO_USD = 1.0 / 0.92;  // ~1.087
  if (currency === "GBP") return value * GBP_TO_USD;
  if (currency === "EUR") return value * EUR_TO_USD;
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

const today = new Date().toISOString().substring(0, 10);

// ─── Fix Henry Morris ARR ─────────────────────────────────────────────────────

console.log("\n=== Fixing Henry Morris ARR data ===\n");

try {
  const wonDeals = await fetchAllWonDealsForUser(15871239, "2025-01-01", today);
  console.log(`Found ${wonDeals.length} won deals for Henry`);

  const arrByMonth = new Map<string, number>();
  for (const deal of wonDeals) {
    const wonDate = (deal.won_time || deal.close_time || "").substring(0, 10);
    if (!wonDate) continue;
    const year = parseInt(wonDate.substring(0, 4), 10);
    const month = parseInt(wonDate.substring(5, 7), 10);
    const key = `${year}-${month}`;
    const valueUsd = await toUsd(deal.value || 0, deal.currency || "USD");
    arrByMonth.set(key, (arrByMonth.get(key) || 0) + valueUsd);
    console.log(`  Deal: ${deal.title} (${wonDate}) = $${Math.round(valueUsd)} USD (${deal.currency} ${deal.value})`);
  }

  console.log("\nUpdating monthly_metrics for Henry:");
  for (const [key, arrUsd] of Array.from(arrByMonth.entries()).sort()) {
    const [yearStr, monthStr] = key.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    await db.update(monthlyMetrics)
      .set({ arrUsd: String(Math.round(arrUsd)) })
      .where(and(eq(monthlyMetrics.aeId, 30000), eq(monthlyMetrics.year, year), eq(monthlyMetrics.month, month)));

    console.log(`  ${key}: arr=$${Math.round(arrUsd)}`);
  }
} catch (err) {
  console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
}

// ─── Clean up Julian Earl's incorrect pre-join data ───────────────────────────

console.log("\n=== Cleaning up Julian Earl's incorrect historical data ===\n");

// Julian joined Feb 4, 2026. Delete any rows before Feb 2026.
// But keep Feb 2026 onwards.
try {
  // Delete rows where year < 2026, or (year = 2026 and month < 2)
  const rowsBefore = await db.select().from(monthlyMetrics)
    .where(eq(monthlyMetrics.aeId, 30003));
  
  console.log(`Julian has ${rowsBefore.length} total rows`);
  
  for (const row of rowsBefore) {
    if (row.year < 2026 || (row.year === 2026 && row.month < 2)) {
      console.log(`  Deleting pre-join row: ${row.year}-${String(row.month).padStart(2,'0')} (arr=$${row.arrUsd} demos=${row.demosTotal} dials=${row.dialsTotal})`);
      await db.delete(monthlyMetrics)
        .where(and(eq(monthlyMetrics.aeId, 30003), eq(monthlyMetrics.year, row.year), eq(monthlyMetrics.month, row.month)));
    } else {
      console.log(`  Keeping: ${row.year}-${String(row.month).padStart(2,'0')} (arr=$${row.arrUsd} demos=${row.demosTotal} dials=${row.dialsTotal})`);
    }
  }
} catch (err) {
  console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
}

console.log("\n=== Done! ===\n");
process.exit(0);
