/**
 * Update all missing VOIP dials data for all AEs.
 * Uses the historical data retrieved from VOIP Studio API.
 * Run with: npx tsx scripts/fix-dials.ts
 */

import { drizzle } from "drizzle-orm/mysql2";
import { eq, and } from "drizzle-orm";
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

const DATABASE_URL = process.env.DATABASE_URL!;
const db = drizzle(DATABASE_URL);

// ─── Historical VOIP dials data (retrieved from VOIP Studio API) ──────────────

const VOIP_DATA: Record<number, Record<string, number>> = {
  // Henry Morris (AE ID 30000)
  30000: {
    "2025-1": 128, "2025-2": 225, "2025-3": 161, "2025-4": 155,
    "2025-5": 116, "2025-6": 162, "2025-7": 87, "2025-8": 208,
    "2025-9": 169, "2025-10": 260, "2025-11": 65, "2025-12": 33,
    "2026-1": 65, "2026-2": 127,
  },
  // Joe Payne (AE ID 30001)
  30001: {
    "2025-6": 455, "2025-7": 1308, "2025-8": 1220, "2025-9": 575,
    "2025-10": 779, "2025-11": 963, "2025-12": 385,
    "2026-1": 655, "2026-2": 629,
  },
  // Toby Greer (AE ID 30002)
  30002: {
    "2025-7": 53, "2025-8": 506, "2025-9": 456, "2025-10": 346,
    "2025-11": 272, "2025-12": 122, "2026-1": 225, "2026-2": 74,
  },
  // Julian Earl (AE ID 30003) — only Feb 2026 (join date)
  30003: {
    "2026-2": 732, // from earlier check
  },
};

const AE_NAMES: Record<number, string> = {
  30000: "Henry Morris",
  30001: "Joe Payne",
  30002: "Toby Greer",
  30003: "Julian Earl",
};

console.log("\n=== Updating VOIP dials data for all AEs ===\n");

for (const [aeIdStr, monthData] of Object.entries(VOIP_DATA)) {
  const aeId = parseInt(aeIdStr, 10);
  console.log(`\n--- ${AE_NAMES[aeId]} (AE ID: ${aeId}) ---`);

  for (const [key, dials] of Object.entries(monthData)) {
    const [yearStr, monthStr] = key.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const perWeek = (dials / 4.33).toFixed(0);

    // Check if row exists
    const existing = await db.select().from(monthlyMetrics)
      .where(and(eq(monthlyMetrics.aeId, aeId), eq(monthlyMetrics.year, year), eq(monthlyMetrics.month, month)))
      .limit(1);

    if (existing.length > 0) {
      // Update existing row
      await db.update(monthlyMetrics)
        .set({ dialsTotal: dials })
        .where(and(eq(monthlyMetrics.aeId, aeId), eq(monthlyMetrics.year, year), eq(monthlyMetrics.month, month)));
      console.log(`  ${key}: ${dials} dials (${perWeek}/wk) — updated`);
    } else {
      // Insert new row
      await db.insert(monthlyMetrics).values({
        aeId,
        year,
        month,
        arrUsd: "0",
        demosTotal: 0,
        demosFromPipedrive: 0,
        dialsTotal: dials,
        retentionRate: null,
      }).onDuplicateKeyUpdate({ set: { dialsTotal: dials } });
      console.log(`  ${key}: ${dials} dials (${perWeek}/wk) — inserted`);
    }
  }
}

console.log("\n=== Done! ===\n");
process.exit(0);
