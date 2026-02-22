/**
 * Validate Toby Greer and Julian Earl new joiner tiers.
 * Checks each deal's tier assignment against the correct historical metrics.
 */

import { config } from "dotenv";
config({ path: "/home/ubuntu/amfg-commission/.env" });

import { getDb } from "../server/db";
import { deals, monthlyMetrics, aeProfiles } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  calculateTier,
  computeRollingAverages,
  computeAvgRetention,
  isNewJoiner,
} from "../shared/commission";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

async function main() {
  const db = await getDb();
  if (!db) { console.error("No DB"); process.exit(1); }

  const profiles = await db.select().from(aeProfiles);
  const targets = ["Toby Greer", "Julian Earl"];

  for (const aeName of targets) {
    const ae = profiles.find(p => p.name === aeName);
    if (!ae) { console.log(`${aeName}: not found`); continue; }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`AE: ${ae.name} (ID: ${ae.id})`);
    console.log(`Join date: ${ae.joinDate} | Team leader: ${ae.isTeamLeader}`);

    // Get all deals for this AE
    const aeDeals = await db.select().from(deals).where(eq(deals.aeId, ae.id));
    console.log(`Deals: ${aeDeals.length}`);

    // Get all metrics for this AE
    const metrics = await db.select().from(monthlyMetrics)
      .where(eq(monthlyMetrics.aeId, ae.id));

    console.log(`\nMonthly metrics:`);
    for (const m of metrics.sort((a,b) => a.year*100+a.month - (b.year*100+b.month))) {
      const demosPerWeek = m.demosTotal / 12;
      const dialsPerWeek = m.dialsTotal / 12;
      console.log(`  ${MONTH_NAMES[m.month-1]} ${m.year}: ARR=$${Number(m.arrUsd).toLocaleString()} demos=${m.demosTotal}(${demosPerWeek.toFixed(1)}/wk) dials=${m.dialsTotal}(${dialsPerWeek.toFixed(1)}/wk)`);
    }

    if (aeDeals.length === 0) {
      console.log(`\nNo deals to validate.`);
      continue;
    }

    console.log(`\nDeal tier validation:`);
    // Sort by start date (year, month, day)
    const sortedDeals = aeDeals.sort((a,b) => {
      const aVal = a.startYear * 10000 + a.startMonth * 100 + a.startDay;
      const bVal = b.startYear * 10000 + b.startMonth * 100 + b.startDay;
      return aVal - bVal;
    });

    for (const deal of sortedDeals) {
      const dealYear = deal.startYear;
      const dealMonth = deal.startMonth;
      const dealDay = deal.startDay;
      const dealDate = new Date(dealYear, dealMonth - 1, dealDay);

      // Build MonthData array from metrics up to and including deal month
      const relevantMetrics = metrics
        .filter(m => m.year * 100 + m.month <= dealYear * 100 + dealMonth)
        .sort((a,b) => b.year*100+b.month - (a.year*100+a.month))
        .slice(0, 3); // last 3 months for rolling avg

      const last6Months = metrics
        .filter(m => m.year * 100 + m.month <= dealYear * 100 + dealMonth)
        .sort((a,b) => b.year*100+b.month - (a.year*100+a.month))
        .slice(0, 6);

      const monthData = relevantMetrics.map(m => ({
        year: m.year,
        month: m.month,
        arrUsd: Number(m.arrUsd),
        demosTotal: m.demosTotal,
        dialsTotal: m.dialsTotal,
        retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
      }));

      const retentionData = last6Months.map(m => ({
        year: m.year,
        month: m.month,
        arrUsd: Number(m.arrUsd),
        demosTotal: m.demosTotal,
        dialsTotal: m.dialsTotal,
        retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
      }));

      const joinDate = new Date(ae.joinDate);
      const newJoiner = isNewJoiner(joinDate, dealDate);
      const avgs = computeRollingAverages(monthData);
      const avgRetention = computeAvgRetention(retentionData);

      const tierResult = calculateTier({
        avgArrUsd: avgs.avgArrUsd,
        avgDemosPw: avgs.avgDemosPw,
        avgDialsPw: avgs.avgDialsPw,
        avgRetentionRate: avgRetention,
        isNewJoiner: newJoiner,
        isTeamLeader: ae.isTeamLeader,
      });

      const tier = tierResult.tier;
      const stored = deal.tierAtStart;
      const match = stored === tier ? "✓" : "✗ MISMATCH";

      console.log(
        `  ${(deal.customerName ?? "").substring(0,30).padEnd(30)} | ${MONTH_NAMES[dealMonth-1]} ${dealYear} | ` +
        `newJoiner=${newJoiner} | ARR=$${Math.round(avgs.avgArrUsd).toLocaleString()} demos=${avgs.avgDemosPw.toFixed(1)}/wk dials=${avgs.avgDialsPw.toFixed(1)}/wk | ` +
        `tier=${tier} stored=${stored} ${match}`
      );
      if (match.includes("MISMATCH")) {
        console.log(`    Reasons: ${tierResult.reasons.join("; ")}`);
      }
    }
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
