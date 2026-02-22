/**
 * Fix demo data for all AEs by pulling full history from Pipedrive.
 * Run with: npx tsx scripts/fix-demos.ts
 */

import { drizzle } from "drizzle-orm/mysql2";
import { eq, and } from "drizzle-orm";
import { monthlyMetrics } from "../drizzle/schema";

// Load env
import { config } from "dotenv";
config();

// Also load from /home/ubuntu/.user_env if DATABASE_URL not set
if (!process.env.DATABASE_URL) {
  try {
    const { readFileSync } = await import("fs");
    const envContent = readFileSync("/home/ubuntu/.user_env", "utf-8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;

if (!PIPEDRIVE_API_KEY || !DATABASE_URL) {
  console.error("ERROR: Missing PIPEDRIVE_API_KEY or DATABASE_URL");
  process.exit(1);
}

const db = drizzle(DATABASE_URL);

// ─── Pipedrive helpers ────────────────────────────────────────────────────────

async function pipedriveGet(endpoint: string, params: Record<string, string | number> = {}) {
  const url = new URL(`https://api.pipedrive.com/v1/${endpoint}`);
  url.searchParams.set("api_token", PIPEDRIVE_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Pipedrive API error: ${res.status} for ${endpoint}`);
  return res.json() as Promise<any>;
}

async function fetchAllDemosForUser(pipedriveUserId: number, fromDate: string, toDate: string) {
  const all: any[] = [];
  let start = 0;
  const limit = 500;

  while (true) {
    const resp = await pipedriveGet("activities", {
      user_id: pipedriveUserId,
      type: "demo",
      done: 1,
      limit,
      start,
    });

    const data = resp.data || [];
    all.push(...data);

    const more = resp.additional_data?.pagination?.more_items_in_collection;
    if (!more || data.length === 0) break;
    start += limit;
  }

  // Filter by date range using marked_as_done_time
  return all.filter((a) => {
    const doneTime = a.marked_as_done_time || a.due_date;
    if (!doneTime) return false;
    const doneDate = doneTime.substring(0, 10);
    return doneDate >= fromDate && doneDate <= toDate;
  });
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

async function updateDemosForMonth(aeId: number, year: number, month: number, demosTotal: number) {
  const existing = await db
    .select()
    .from(monthlyMetrics)
    .where(and(eq(monthlyMetrics.aeId, aeId), eq(monthlyMetrics.year, year), eq(monthlyMetrics.month, month)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(monthlyMetrics)
      .set({ demosTotal, demosFromPipedrive: demosTotal })
      .where(and(eq(monthlyMetrics.aeId, aeId), eq(monthlyMetrics.year, year), eq(monthlyMetrics.month, month)));
    return "updated";
  } else {
    await db.insert(monthlyMetrics).values({
      aeId,
      year,
      month,
      arrUsd: "0",
      demosTotal,
      demosFromPipedrive: demosTotal,
      dialsTotal: 0,
      retentionRate: null,
    }).onDuplicateKeyUpdate({ set: { demosTotal, demosFromPipedrive: demosTotal } });
    return "inserted";
  }
}

// ─── AE configuration ─────────────────────────────────────────────────────────

const AE_CONFIG = [
  { aeId: 30000, name: "Henry Morris", joinDate: "2025-01-01", pipedriveId: 15871239 },
  { aeId: 30001, name: "Joe Payne", joinDate: "2025-06-16", pipedriveId: 23861740 },
  { aeId: 30002, name: "Toby Greer", joinDate: "2025-07-28", pipedriveId: 24052953 },
  { aeId: 30003, name: "Julian Earl", joinDate: "2026-02-04", pipedriveId: 25094488 },
];

const today = new Date().toISOString().substring(0, 10);

console.log("\n=== Fixing demo data for all AEs ===\n");

for (const ae of AE_CONFIG) {
  console.log(`\n--- ${ae.name} (AE ID: ${ae.aeId}) ---`);
  console.log(`  Join date: ${ae.joinDate}`);

  try {
    const demos = await fetchAllDemosForUser(ae.pipedriveId, ae.joinDate, today);
    console.log(`  Total completed demos found: ${demos.length}`);

    const byMonth = aggregateDemosByMonth(demos);

    if (byMonth.size === 0) {
      console.log("  No demos found for this AE.");
      continue;
    }

    for (const [key, count] of Array.from(byMonth.entries()).sort()) {
      const [yearStr, monthStr] = key.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const perWeek = (count / 4.33).toFixed(1);

      const action = await updateDemosForMonth(ae.aeId, year, month, count);
      console.log(`  ${key}: ${count} demos (${perWeek}/wk) — ${action}`);
    }
  } catch (err) {
    console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log("\n=== Done! ===\n");
process.exit(0);
