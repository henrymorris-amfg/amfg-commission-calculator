/**
 * Revert Toby's ARR to the correct deduplicated values.
 * The fix-toby script incorrectly tripled ARR by summing across 3 pipelines.
 * Correct values (deduplicated by deal ID):
 *   Aug 2025: $10,907
 *   Oct 2025: $11,293
 *   Dec 2025: $27,085
 *   Feb 2026: $15,306
 */

import { config } from "dotenv";
config({ path: "/home/ubuntu/amfg-commission/.env" });

import { getDb, upsertMonthlyMetric, getMetricsForMonth } from "../server/db";
import { aeProfiles } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const CORRECT_ARR: Record<string, number> = {
  "2025-8":  10907,
  "2025-10": 11293,
  "2025-12": 27085,
  "2026-2":  15306,
};

// Months with no deals — ARR should be 0
const ZERO_ARR_MONTHS = ["2025-9", "2025-11", "2026-1"];

async function main() {
  const db = await getDb();
  if (!db) { console.error("No DB"); process.exit(1); }

  const profiles = await db.select().from(aeProfiles);
  const toby = profiles.find(p => p.name === "Toby Greer");
  if (!toby) { console.error("Toby not found"); process.exit(1); }

  console.log(`Reverting Toby Greer (ID: ${toby.id}) ARR to correct values...`);

  for (const [ym, arrUsd] of Object.entries(CORRECT_ARR)) {
    const [yearStr, monthStr] = ym.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const existing = await getMetricsForMonth(toby.id, year, month);
    if (!existing) {
      console.log(`  ${ym}: no row exists, skipping`);
      continue;
    }
    await upsertMonthlyMetric({
      aeId: toby.id,
      year,
      month,
      arrUsd: String(arrUsd),
      demosTotal: existing.demosTotal,
      dialsTotal: existing.dialsTotal,
      retentionRate: existing.retentionRate ?? null,
    });
    console.log(`  ${ym}: ARR reverted to $${arrUsd.toLocaleString()} (was $${Number(existing.arrUsd).toLocaleString()})`);
  }

  for (const ym of ZERO_ARR_MONTHS) {
    const [yearStr, monthStr] = ym.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const existing = await getMetricsForMonth(toby.id, year, month);
    if (!existing) continue;
    if (Number(existing.arrUsd) !== 0) {
      await upsertMonthlyMetric({
        aeId: toby.id,
        year,
        month,
        arrUsd: "0",
        demosTotal: existing.demosTotal,
        dialsTotal: existing.dialsTotal,
        retentionRate: existing.retentionRate ?? null,
      });
      console.log(`  ${ym}: ARR reset to $0 (was $${Number(existing.arrUsd).toLocaleString()})`);
    }
  }

  console.log("\nDone. Toby's ARR is now correct.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
