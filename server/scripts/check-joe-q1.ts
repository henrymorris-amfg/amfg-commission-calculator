import { getDb } from "../db";
import { deals, aeProfiles, commissionPayouts } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

async function checkJoeQ1() {
  const db = await getDb();
  if (!db) {
    console.error("Failed to connect to database");
    process.exit(1);
  }

  try {
    // Find Joe Payne
    const joe = await db
      .select()
      .from(aeProfiles)
      .where(eq(aeProfiles.name, "Joe Payne"));

    if (!joe.length) {
      console.error("Joe Payne not found");
      process.exit(1);
    }

    const joeId = joe[0].id;
    console.log(`Joe Payne (ID: ${joeId})\n`);

    // Get Q1 2026 deals (Jan, Feb, Mar)
    const q1Deals = await db
      .select()
      .from(deals)
      .where(
        and(
          eq(deals.aeId, joeId),
          eq(deals.startYear, 2026),
          eq(deals.startMonth, 1)
        )
      );

    console.log(`Q1 2026 Deals for Joe (${q1Deals.length} deals):\n`);

    let totalArr = 0;
    for (const deal of q1Deals) {
      const payouts = await db
        .select()
        .from(commissionPayouts)
        .where(
          and(
            eq(commissionPayouts.dealId, deal.id),
            eq(commissionPayouts.payoutYear, 2026),
            eq(commissionPayouts.payoutMonth, 1)
          )
        );

      const payout = payouts[0];
      console.log(`- ${deal.customerName}`);
      console.log(`  Start: ${deal.startYear}-${String(deal.startMonth).padStart(2, '0')}-${String(deal.startDay).padStart(2, '0')}`);
      console.log(`  ARR: $${Number(deal.arrUsd).toLocaleString()}`);
      console.log(`  Tier: ${deal.tierAtStart}`);
      console.log(`  Churned: ${deal.isChurned}`);
      console.log(`  Q1 Payout: £${payout?.netCommissionGbp || 0} ($${payout?.netCommissionUsd || 0})`);
      console.log();
      
      totalArr += Number(deal.arrUsd);
    }

    console.log(`\nTotal Q1 ARR: $${totalArr.toLocaleString()}`);

    // Get total Q1 commission
    const q1Payouts = await db
      .select()
      .from(commissionPayouts)
      .where(
        and(
          eq(commissionPayouts.aeId, joeId),
          eq(commissionPayouts.payoutYear, 2026),
          eq(commissionPayouts.payoutMonth, 1)
        )
      );

    const totalCommissionGbp = q1Payouts.reduce((sum, p) => sum + Number(p.netCommissionGbp), 0);
    const totalCommissionUsd = q1Payouts.reduce((sum, p) => sum + Number(p.netCommissionUsd), 0);

    console.log(`Total Q1 Commission: £${totalCommissionGbp.toLocaleString()} ($${totalCommissionUsd.toLocaleString()})`);

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkJoeQ1().then(() => process.exit(0));
