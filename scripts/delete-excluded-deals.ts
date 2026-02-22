/**
 * Delete all deals from the DB that should be excluded:
 * - Titles containing "implementation", "customer success", "onboarding"
 */
import "dotenv/config";
import { getDb } from "../server/db";
import { deals, commissionPayouts } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const EXCLUSION_KEYWORDS = [
  "implementation",
  "customer success",
  "onboarding",
];

function shouldExclude(title: string): boolean {
  const lower = title.toLowerCase();
  return EXCLUSION_KEYWORDS.some((kw) => lower.includes(kw));
}

async function main() {
  const db = await getDb();

  const allDeals = await db.select().from(deals);
  let deletedCount = 0;

  for (const deal of allDeals) {
    if (shouldExclude(deal.customerName ?? "")) {
      console.log(`Deleting: "${deal.customerName}" (AE ID: ${deal.aeId}, id=${deal.id})`);
      await db.delete(commissionPayouts).where(eq(commissionPayouts.dealId, deal.id));
      await db.delete(deals).where(eq(deals.id, deal.id));
      deletedCount++;
    }
  }

  console.log(`\nDeleted ${deletedCount} excluded deal(s).`);
  process.exit(0);
}

main().catch(console.error);
