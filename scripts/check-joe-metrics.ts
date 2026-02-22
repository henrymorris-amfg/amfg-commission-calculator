/**
 * Check Joe's monthly metrics and understand the rolling average issue
 */
import "dotenv/config";
import { getDb } from "../server/db";
import { monthlyMetrics, deals, commissionPayouts } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { computeRollingAverages } from "../shared/commission";

const JOE_AE_ID = 30002;

async function main() {
  const db = await getDb();

  // Get all Joe's monthly metrics sorted by date
  const rows = await db
    .select()
    .from(monthlyMetrics)
    .where(eq(monthlyMetrics.aeId, JOE_AE_ID));

  const sorted = rows.sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month));

  console.log("=== Joe Payne Monthly Metrics ===");
  for (const r of sorted) {
    console.log(`${r.year}-${String(r.month).padStart(2, "0")}: ARR=$${r.arrUsd} demos=${r.demosTotal} dials=${r.dialsTotal}`);
  }

  // Simulate rolling averages for Dec 2025 (using last 3 months: Sep, Oct, Nov)
  console.log("\n=== Rolling averages for Dec 2025 deals ===");
  const decTarget = new Date(2025, 11, 1); // Dec 2025
  const last3ForDec = sorted
    .filter(m => new Date(m.year, m.month - 1, 1) < decTarget)
    .slice(-3)
    .map(m => ({
      year: m.year,
      month: m.month,
      arrUsd: Number(m.arrUsd),
      demosTotal: m.demosTotal,
      dialsTotal: m.dialsTotal,
      retentionRate: null,
    }));
  console.log("Last 3 months before Dec 2025:", last3ForDec.map(m => `${m.year}-${m.month}: ARR=$${m.arrUsd}`).join(", "));
  const decAvg = computeRollingAverages(last3ForDec);
  console.log(`Rolling avg: ARR=$${Math.round(decAvg.avgArrUsd)} demos=${decAvg.avgDemosPw.toFixed(1)}/wk dials=${decAvg.avgDialsPw.toFixed(0)}/wk`);

  // Simulate rolling averages for Jan 2026 (using last 3 months: Oct, Nov, Dec)
  console.log("\n=== Rolling averages for Jan 2026 deals ===");
  const janTarget = new Date(2026, 0, 1); // Jan 2026
  const last3ForJan = sorted
    .filter(m => new Date(m.year, m.month - 1, 1) < janTarget)
    .slice(-3)
    .map(m => ({
      year: m.year,
      month: m.month,
      arrUsd: Number(m.arrUsd),
      demosTotal: m.demosTotal,
      dialsTotal: m.dialsTotal,
      retentionRate: null,
    }));
  console.log("Last 3 months before Jan 2026:", last3ForJan.map(m => `${m.year}-${m.month}: ARR=$${m.arrUsd}`).join(", "));
  const janAvg = computeRollingAverages(last3ForJan);
  console.log(`Rolling avg: ARR=$${Math.round(janAvg.avgArrUsd)} demos=${janAvg.avgDemosPw.toFixed(1)}/wk dials=${janAvg.avgDialsPw.toFixed(0)}/wk`);

  // Check for the CNC Implementation deal in DB
  console.log("\n=== Joe's deals in DB (checking for Implementation) ===");
  const joeDeals = await db.select().from(deals).where(eq(deals.aeId, JOE_AE_ID));
  for (const d of joeDeals.sort((a, b) => a.startYear * 100 + a.startMonth - (b.startYear * 100 + b.startMonth))) {
    const flag = (d.customerName?.toLowerCase().includes("implementation") || 
                  d.customerName?.toLowerCase().includes("customer success")) ? " ⚠️ SHOULD BE EXCLUDED" : "";
    console.log(`${d.startYear}-${String(d.startMonth).padStart(2,"0")}: ${d.customerName} | ARR=$${d.arrUsd} | ${d.tierAtStart}${flag}`);
  }

  process.exit(0);
}

main().catch(console.error);
