/**
 * Fix VOIP dials data with CORRECT AE IDs.
 * 
 * Correct AE IDs from database:
 *   ID:1     = Henry Morris
 *   ID:30002 = Joe Payne
 *   ID:30003 = Julian Earl
 *   ID:30004 = Toby Greer
 * 
 * The previous fix-dials.ts used wrong IDs (30000, 30001, 30002, 30003).
 * This script corrects the dials data for all AEs.
 */

import { upsertMonthlyMetric, getMetricsForAe } from "../server/db";

// ─── Correct VOIP dials data ──────────────────────────────────────────────────
// Data source: VOIP Studio API historical CDR data

const VOIP_DATA: Record<number, Record<string, number>> = {
  // Henry Morris (correct ID: 1)
  1: {
    "2025-1": 128, "2025-2": 225, "2025-3": 161, "2025-4": 155,
    "2025-5": 116, "2025-6": 162, "2025-7": 87, "2025-8": 208,
    "2025-9": 169, "2025-10": 260, "2025-11": 65, "2025-12": 33,
    "2026-1": 65, "2026-2": 127,
  },
  // Joe Payne (correct ID: 30002)
  // Joe's actual VOIP dials from VOIP Studio (user ID 639053)
  30002: {
    "2025-6": 455, "2025-7": 1308, "2025-8": 1220, "2025-9": 575,
    "2025-10": 779, "2025-11": 963, "2025-12": 385,
    "2026-1": 655, "2026-2": 629,
  },
  // Julian Earl (correct ID: 30003)
  // Julian's actual VOIP dials from VOIP Studio (user ID 416028)
  30003: {
    "2026-2": 732,
  },
  // Toby Greer (correct ID: 30004)
  // Toby's actual VOIP dials from VOIP Studio (user ID 250708)
  30004: {
    "2025-7": 53, "2025-8": 506, "2025-9": 456, "2025-10": 346,
    "2025-11": 272, "2025-12": 122, "2026-1": 225, "2026-2": 74,
  },
};

const AE_NAMES: Record<number, string> = {
  1: "Henry Morris",
  30002: "Joe Payne",
  30003: "Julian Earl",
  30004: "Toby Greer",
};

async function main() {
  console.log("\n=== Fixing VOIP dials data with CORRECT AE IDs ===\n");

  for (const [aeIdStr, monthData] of Object.entries(VOIP_DATA)) {
    const aeId = parseInt(aeIdStr, 10);
    console.log(`\n--- ${AE_NAMES[aeId]} (AE ID: ${aeId}) ---`);

    // First, get existing metrics so we preserve ARR and demos
    const existing = await getMetricsForAe(aeId, 24);
    const existingMap = new Map(existing.map((m) => [`${m.year}-${m.month}`, m]));

    for (const [key, dials] of Object.entries(monthData)) {
      const [yearStr, monthStr] = key.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const perWeek = (dials / 4.33).toFixed(0);

      const existingRow = existingMap.get(`${year}-${month}`);

      await upsertMonthlyMetric({
        aeId,
        year,
        month,
        arrUsd: existingRow ? String(existingRow.arrUsd) : "0",
        demosTotal: existingRow ? existingRow.demosTotal : 0,
        demosFromPipedrive: existingRow ? existingRow.demosFromPipedrive : 0,
        dialsTotal: dials,
        retentionRate: existingRow?.retentionRate ?? null,
      });

      console.log(`  ${key}: ${dials} dials (${perWeek}/wk) — ${existingRow ? "updated" : "inserted"}`);
    }
  }

  // Also clear any dials that were incorrectly written to wrong IDs
  // The wrong IDs were 30000, 30001 — these don't correspond to real AEs
  // but the data written to 30002 (Joe) with Toby's dials needs to be corrected
  // (already handled above by overwriting Joe's row with his correct dials)

  console.log("\n=== Verifying final state ===\n");
  for (const [aeIdStr, name] of Object.entries(AE_NAMES)) {
    const aeId = parseInt(aeIdStr, 10);
    const metrics = await getMetricsForAe(aeId, 24);
    console.log(`\n${name} (ID:${aeId}):`);
    for (const m of metrics) {
      console.log(`  ${m.year}-${String(m.month).padStart(2,"0")} | demos:${m.demosTotal} | dials:${m.dialsTotal} | arr:$${m.arrUsd}`);
    }
  }

  console.log("\n=== Done! ===\n");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
