import { getDb } from "../db";
import { deals, aeProfiles } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

async function findMissingDates() {
  const db = await getDb();
  if (!db) {
    console.error("Failed to connect to database");
    process.exit(1);
  }

  try {
    // Get all deals
    const allDeals = await db.select().from(deals);
    
    // Find deals with missing/suspicious contract start dates
    const dealsWithIssues = [];
    
    for (const deal of allDeals) {
      // Check if contract start date looks suspicious (e.g., null)
      if (!deal.contractStartDate) {
        const ae = await db.select().from(aeProfiles).where(eq(aeProfiles.id, deal.aeId));
        dealsWithIssues.push({
          dealId: deal.id,
          customerName: deal.customerName,
          aeName: ae[0]?.name,
          startDate: `${deal.startYear}-${String(deal.startMonth).padStart(2, '0')}-${String(deal.startDay).padStart(2, '0')}`,
          contractStartDate: deal.contractStartDate,
          arrUsd: deal.arrUsd,
          isChurned: deal.isChurned,
        });
      }
    }
    
    console.log(`Found ${dealsWithIssues.length} deals with missing/suspicious contract start dates:\n`);
    
    // Group by AE
    const byAe: Record<string, typeof dealsWithIssues> = {};
    for (const deal of dealsWithIssues) {
      if (!byAe[deal.aeName || "Unknown"]) {
        byAe[deal.aeName || "Unknown"] = [];
      }
      byAe[deal.aeName || "Unknown"].push(deal);
    }
    
    // Print by AE
    for (const [aeName, aeDeals] of Object.entries(byAe)) {
      console.log(`\n${aeName} (${aeDeals.length} deals):`);
      for (const deal of aeDeals) {
        console.log(`  - ${deal.customerName}: Start ${deal.startDate}, Contract Start: ${deal.contractStartDate || 'NULL'}`);
      }
    }
    
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

findMissingDates().then(() => process.exit(0));
