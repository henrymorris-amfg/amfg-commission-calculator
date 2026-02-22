/**
 * Fix Joe Payne's November 2025 ARR:
 * - Bridge - EU sro: EUR 6,000 won 2025-11-20
 * - Then delete the CNC Implementation deal from the DB and re-import all Joe's deals
 */
import "dotenv/config";
import { getDb } from "../server/db";
import { monthlyMetrics, deals, commissionPayouts } from "../drizzle/schema";
import { eq, and, like } from "drizzle-orm";

const JOE_AE_ID = 30002;

async function main() {
  // Step 1: Get current EUR→USD rate
  let eurToUsd = 1.08; // fallback
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    if (res.ok) {
      const data = await res.json() as { rates: Record<string, number> };
      const eurRate = data.rates["EUR"];
      if (eurRate) eurToUsd = 1 / eurRate;
    }
  } catch {
    console.log("FX API unavailable, using fallback EUR→USD = 1.08");
  }

  const bridgeArrUsd = Math.round(6000 * eurToUsd);
  console.log(`Bridge - EU sro ARR: EUR 6,000 → USD ${bridgeArrUsd} (rate: ${eurToUsd.toFixed(4)})`);

  // Step 2: Update Joe's November 2025 monthly_metrics with the correct ARR
  const db = await getDb();

  const existing = await db
    .select()
    .from(monthlyMetrics)
    .where(
      and(
        eq(monthlyMetrics.aeId, JOE_AE_ID),
        eq(monthlyMetrics.year, 2025),
        eq(monthlyMetrics.month, 11)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(monthlyMetrics)
      .set({ arrUsd: String(bridgeArrUsd) })
      .where(
        and(
          eq(monthlyMetrics.aeId, JOE_AE_ID),
          eq(monthlyMetrics.year, 2025),
          eq(monthlyMetrics.month, 11)
        )
      );
    console.log(`Updated Nov 2025 ARR from $${existing[0].arrUsd} → $${bridgeArrUsd}`);
  } else {
    await db.insert(monthlyMetrics).values({
      aeId: JOE_AE_ID,
      year: 2025,
      month: 11,
      arrUsd: String(bridgeArrUsd),
      demosTotal: 16,
      dialsTotal: 963,
      retentionRate: null,
    });
    console.log(`Inserted Nov 2025 row with ARR $${bridgeArrUsd}`);
  }

  // Step 3: Delete the CNC Implementation deal from the DB (pipedriveId lookup)
  // The deal title contains "Implementation" so it should be excluded going forward,
  // but we need to remove the already-imported record.
  const implementationDeals = await db
    .select()
    .from(deals)
    .where(eq(deals.aeId, JOE_AE_ID));

  let deletedCount = 0;
  for (const deal of implementationDeals) {
    const name = deal.customerName?.toLowerCase() ?? "";
    if (
      name.includes("implementation") ||
      name.includes("customer success") ||
      name.includes("onboarding")
    ) {
      console.log(`Deleting excluded deal: "${deal.customerName}" (id=${deal.id})`);
      await db.delete(commissionPayouts).where(eq(commissionPayouts.dealId, deal.id));
      await db.delete(deals).where(eq(deals.id, deal.id));
      deletedCount++;
    }
  }
  console.log(`Deleted ${deletedCount} excluded deal(s)`);

  // Step 4: Show updated Nov 2025 metrics
  const updated = await db
    .select()
    .from(monthlyMetrics)
    .where(
      and(
        eq(monthlyMetrics.aeId, JOE_AE_ID),
        eq(monthlyMetrics.year, 2025),
        eq(monthlyMetrics.month, 11)
      )
    )
    .limit(1);

  console.log("\nJoe's Nov 2025 metrics after fix:");
  console.log(updated[0]);

  console.log("\nDone! Now re-import deals via the app's Data Audit page or reimport-deals.ts script.");
}

main().catch(console.error);
