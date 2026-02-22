/**
 * Back-fills historical monthly_metrics for all AEs using:
 * - Pipedrive won deals ARR (aggregated by month)
 * - Pipedrive completed demo activities (by month)
 * - VOIP Studio outbound dials (by month)
 *
 * Only inserts rows that don't already exist (won't overwrite Nov 2025+)
 */
import mysql from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL;

// ─── AE IDs in our DB ────────────────────────────────────────────────────────
const AE_DB_IDS = {
  "Henry Morris": 1,
  "Joe Payne": 30001,
  "Toby Greer": 30003,
  "Julian Earl": 30004,
};

// ─── Historical data collected from APIs ─────────────────────────────────────
// Format: [aeDbId, year, month, arrUsd, demosTotal, dialsTotal]
const HISTORICAL_DATA = [
  // Henry Morris — Jan 2025 to Oct 2025 (Nov 2025+ already in DB)
  [1, 2025, 1,  7140,   13, 128],
  [1, 2025, 2,  27780,  15, 225],
  [1, 2025, 3,  9540,   9,  161],
  [1, 2025, 4,  7140,   8,  155],
  [1, 2025, 5,  2500,   12, 116],
  [1, 2025, 6,  38300,  7,  162],
  [1, 2025, 7,  0,      11, 87],
  [1, 2025, 8,  2340,   8,  208],
  [1, 2025, 9,  63300,  6,  169],
  [1, 2025, 10, 0,      20, 260],

  // Joe Payne — Jul 2025 to Oct 2025 (Nov 2025+ already in DB, joined Jun 2025)
  [30001, 2025, 7,  13000,  10, 1308],
  [30001, 2025, 8,  8100,   18, 1220],
  [30001, 2025, 9,  15900,  19, 575],
  [30001, 2025, 10, 27950,  26, 779],

  // Toby Greer — Aug 2025 to Oct 2025 (Nov 2025+ already in DB, joined Jul 2025)
  [30003, 2025, 8,  10907,  11, 506],
  [30003, 2025, 9,  0,      17, 456],
  [30003, 2025, 10, 11293,  20, 346],
];

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  let inserted = 0;
  let skipped = 0;

  for (const [aeId, year, month, arrUsd, demosTotal, dialsTotal] of HISTORICAL_DATA) {
    // Check if row already exists
    const [existing] = await conn.execute(
      "SELECT id FROM monthly_metrics WHERE aeId = ? AND year = ? AND month = ?",
      [aeId, year, month]
    );
    if (existing.length > 0) {
      console.log(`  SKIP: AE ${aeId} ${year}-${String(month).padStart(2,"0")} already exists`);
      skipped++;
      continue;
    }

    await conn.execute(
      `INSERT INTO monthly_metrics (aeId, year, month, arrUsd, demosTotal, demosFromPipedrive, dialsTotal, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [aeId, year, month, arrUsd, demosTotal, demosTotal, dialsTotal]
    );
    console.log(`  INSERT: AE ${aeId} ${year}-${String(month).padStart(2,"0")} ARR=$${arrUsd.toLocaleString()} demos=${demosTotal} dials=${dialsTotal}`);
    inserted++;
  }

  await conn.end();
  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped`);
}

main().catch(console.error);
