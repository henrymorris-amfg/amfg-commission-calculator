import { getDb } from "../db";
import { deals, aeProfiles, commissionPayouts } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

async function checkJoeAllDeals() {
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
    console.log(`Joe Payne (ID: ${joeId}) - All 2026 Deals\n`);

    // Get all 2026 deals
    const allDeals = await db
      .select()
      .from(deals)
      .where(and(eq(deals.aeId, joeId), eq(deals.startYear, 2026)));

    console.log(`Total 2026 Deals: ${allDeals.length}\n`);

    // Group by month
    const byMonth: Record<number, typeof allDeals> = {};
    for (const deal of allDeals) {
      if (!byMonth[deal.startMonth]) {
        byMonth[deal.startMonth] = [];
      }
      byMonth[deal.startMonth].push(deal);
    }

    // Print by month
    for (const month of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const monthDeals = byMonth[month] || [];
      if (monthDeals.length > 0) {
        const monthName = new Date(2026, month - 1, 1).toLocaleString("en-US", {
          month: "long",
        });
        console.log(`${monthName} 2026 (${monthDeals.length} deals):`);

        let monthArr = 0;
        for (const deal of monthDeals) {
          console.log(`  - ${deal.customerName}: $${Number(deal.arrUsd).toLocaleString()} (${deal.tierAtStart})`);
          monthArr += Number(deal.arrUsd);
        }
        console.log(`  Month Total: $${monthArr.toLocaleString()}\n`);
      }
    }

    // Get total commission by payout month
    console.log("\nCommission by Payout Month:");
    const allPayouts = await db
      .select()
      .from(commissionPayouts)
      .where(and(eq(commissionPayouts.aeId, joeId), eq(commissionPayouts.payoutYear, 2026)));

    const byPayoutMonth: Record<number, typeof allPayouts> = {};
    for (const payout of allPayouts) {
      if (!byPayoutMonth[payout.payoutMonth]) {
        byPayoutMonth[payout.payoutMonth] = [];
      }
      byPayoutMonth[payout.payoutMonth].push(payout);
    }

    let totalCommissionUsd = 0;
    for (const month of [1, 2, 3, 4]) {
      const monthPayouts = byPayoutMonth[month] || [];
      const monthTotal = monthPayouts.reduce((sum, p) => sum + Number(p.netCommissionUsd), 0);
      const monthName = new Date(2026, month - 1, 1).toLocaleString("en-US", {
        month: "long",
      });
      console.log(`  ${monthName}: $${monthTotal.toLocaleString()}`);
      totalCommissionUsd += monthTotal;
    }

    console.log(`\nQ1 Total Commission: $${totalCommissionUsd.toLocaleString()}`);

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkJoeAllDeals().then(() => process.exit(0));
