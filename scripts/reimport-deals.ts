/**
 * Re-import all Pipedrive deals for all AEs with corrected tier calculations.
 * This clears existing deals and re-imports them using the updated monthly_metrics.
 * Run with: npx tsx scripts/reimport-deals.ts
 */

import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, desc } from "drizzle-orm";
import {
  monthlyMetrics,
  deals,
  commissionPayouts,
  aeProfiles,
  commissionStructures,
} from "../drizzle/schema";
import {
  computeRollingAverages,
  computeAvgRetention,
  isNewJoiner,
  calculateTier,
  calculateCommission,
  addMonths,
  type Tier,
} from "../shared/commission";

// Load env
import { config } from "dotenv";
config();

if (!process.env.DATABASE_URL) {
  try {
    const { readFileSync } = await import("fs");
    const envContent = readFileSync("/home/ubuntu/.user_env", "utf-8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;

if (!PIPEDRIVE_API_KEY || !DATABASE_URL) {
  console.error("ERROR: Missing PIPEDRIVE_API_KEY or DATABASE_URL");
  process.exit(1);
}

const db = drizzle(DATABASE_URL);

// ─── FX Rate ──────────────────────────────────────────────────────────────────

async function getFxRate(): Promise<number> {
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    if (!res.ok) throw new Error("FX API error");
    const data = (await res.json()) as { rates: Record<string, number> };
    return data.rates.GBP ?? 0.79;
  } catch {
    return 0.79;
  }
}

async function toUsd(value: number, currency: string): Promise<number> {
  if (currency === "USD") return value;
  const usdToGbp = await getFxRate();
  if (currency === "GBP") return value / usdToGbp;
  return value; // fallback
}

// ─── Pipedrive helpers ────────────────────────────────────────────────────────

async function pipedriveGet(endpoint: string, params: Record<string, string | number> = {}) {
  const url = new URL(`https://api.pipedrive.com/v1/${endpoint}`);
  url.searchParams.set("api_token", PIPEDRIVE_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Pipedrive API error: ${res.status} for ${endpoint}`);
  return res.json() as Promise<any>;
}

async function fetchWonDealsForUser(pipedriveUserId: number, fromDate: string, toDate: string) {
  const TARGET_PIPELINE_IDS = [20, 12, 10];
  const PIPELINE_NAMES: Record<number, string> = {
    20: "Machining",
    12: "Closing SMB",
    10: "Closing Enterprise",
  };

  const dealsById = new Map<number, any>();

  for (const pipelineId of TARGET_PIPELINE_IDS) {
    let start = 0;
    const limit = 500;

    while (true) {
      const resp = await pipedriveGet("deals", {
        pipeline_id: pipelineId,
        user_id: pipedriveUserId,
        status: "won",
        limit,
        start,
      });

      const data = resp.data || [];
      for (const d of data) {
        if (dealsById.has(d.id)) continue;
        // Skip implementation/CS/onboarding deals — these are not new ARR
        const titleLower = (d.title || "").toLowerCase();
        if (
          titleLower.includes("implementation") ||
          titleLower.includes("customer success") ||
          titleLower.includes("onboarding")
        ) continue;
        const wonDate = d.won_time || d.close_time;
        if (!wonDate) continue;
        const date = wonDate.substring(0, 10);
        if (date >= fromDate && date <= toDate) {
          dealsById.set(d.id, { ...d, pipelineName: PIPELINE_NAMES[pipelineId] || `Pipeline ${pipelineId}` });
        }
      }

      const more = resp.additional_data?.pagination?.more_items_in_collection;
      if (!more || data.length === 0) break;
      start += limit;
    }
  }

  return Array.from(dealsById.values());
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getMetricsForAe(aeId: number, limit = 24) {
  return db
    .select()
    .from(monthlyMetrics)
    .where(eq(monthlyMetrics.aeId, aeId))
    .orderBy(desc(monthlyMetrics.year), desc(monthlyMetrics.month))
    .limit(limit);
}

async function getActiveStructure() {
  const result = await db
    .select()
    .from(commissionStructures)
    .where(eq(commissionStructures.isActive, 1))
    .limit(1);
  return result[0] || null;
}

async function clearDealsForAe(aeId: number) {
  // Get deal IDs first
  const aeDeals = await db.select({ id: deals.id }).from(deals).where(eq(deals.aeId, aeId));
  for (const deal of aeDeals) {
    await db.delete(commissionPayouts).where(eq(commissionPayouts.dealId, deal.id));
  }
  await db.delete(deals).where(eq(deals.aeId, aeId));
  return aeDeals.length;
}

// ─── AE configuration ─────────────────────────────────────────────────────────

// CORRECT AE IDs from database (verified 2026-02-22):
//   ID:1     = Henry Morris  (team leader)
//   ID:30002 = Joe Payne
//   ID:30003 = Julian Earl
//   ID:30004 = Toby Greer
const AE_CONFIG = [
  { aeId: 1,     name: "Henry Morris", joinDateStr: "2025-01-01", joinDate: new Date("2025-01-01"), pipedriveId: 15871239, isTeamLeader: true },
  { aeId: 30002, name: "Joe Payne",    joinDateStr: "2025-06-16", joinDate: new Date("2025-06-16"), pipedriveId: 23861740, isTeamLeader: false },
  { aeId: 30004, name: "Toby Greer",   joinDateStr: "2025-07-28", joinDate: new Date("2025-07-28"), pipedriveId: 24052953, isTeamLeader: false },
  { aeId: 30003, name: "Julian Earl",  joinDateStr: "2026-02-04", joinDate: new Date("2026-02-04"), pipedriveId: 25094488, isTeamLeader: false },
];

const today = new Date().toISOString().substring(0, 10);
const usdToGbp = await getFxRate();
const activeStructure = await getActiveStructure();

console.log(`\n=== Re-importing all deals with corrected tiers ===`);
console.log(`FX rate: 1 USD = ${usdToGbp.toFixed(4)} GBP`);
console.log(`Active commission structure: ${activeStructure ? `ID ${activeStructure.id}` : "none"}\n`);

for (const ae of AE_CONFIG) {
  console.log(`\n--- ${ae.name} (AE ID: ${ae.aeId}) ---`);

  // Clear existing deals
  const cleared = await clearDealsForAe(ae.aeId);
  console.log(`  Cleared ${cleared} existing deals`);

  // Fetch won deals from Pipedrive
  const pdDeals = await fetchWonDealsForUser(ae.pipedriveId, ae.joinDateStr, today);
  console.log(`  Found ${pdDeals.length} won deals in Pipedrive`);

  if (pdDeals.length === 0) continue;

  // Get all metrics for this AE (for tier calculation)
  const allMetrics = await getMetricsForAe(ae.aeId, 24);

  let imported = 0;
  let errors = 0;

  for (const pdDeal of pdDeals) {
    try {
      const wonDate = pdDeal.won_time || pdDeal.close_time;
      if (!wonDate) continue;

      // Use won_time as contract start date
      const startYear = parseInt(wonDate.substring(0, 4), 10);
      const startMonth = parseInt(wonDate.substring(5, 7), 10);
      const startDay = parseInt(wonDate.substring(8, 10), 10);

      const arrUsd = await toUsd(pdDeal.value || 0, pdDeal.currency || "USD");

      // Get the 3 months BEFORE the contract start date for tier calculation
      const targetDate = new Date(startYear, startMonth - 1, 1);

      const last3 = allMetrics
        .filter((m) => new Date(m.year, m.month - 1, 1) < targetDate)
        .slice(0, 3)
        .map((m) => ({
          year: m.year,
          month: m.month,
          arrUsd: Number(m.arrUsd),
          demosTotal: m.demosTotal,
          dialsTotal: m.dialsTotal,
          retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
        }));

      const last6 = allMetrics
        .filter((m) => new Date(m.year, m.month - 1, 1) < targetDate)
        .slice(0, 6)
        .map((m) => ({
          year: m.year,
          month: m.month,
          arrUsd: Number(m.arrUsd),
          demosTotal: m.demosTotal,
          dialsTotal: m.dialsTotal,
          retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
        }));

      const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3);
      const avgRetentionRate = computeAvgRetention(last6);
      const newJoiner = isNewJoiner(ae.joinDate, targetDate);

      const tierResult = calculateTier({
        avgArrUsd,
        avgDemosPw,
        avgDialsPw,
        avgRetentionRate,
        isNewJoiner: newJoiner,
        isTeamLeader: ae.isTeamLeader,
      });

      const tier = tierResult.tier as Tier;

      // Calculate commission
      const commResult = calculateCommission({
        contractType: "annual",
        arrUsd,
        tier,
        onboardingFeePaid: true,
        isReferral: false,
        fxRateUsdToGbp: usdToGbp,
        monthlyPayoutMonths: activeStructure ? Number(activeStructure.monthlyPayoutMonths) : undefined,
        onboardingDeductionGbp: activeStructure ? Number(activeStructure.onboardingDeductionGbp) : undefined,
        onboardingArrReductionUsd: activeStructure ? Number(activeStructure.onboardingArrReductionUsd) : undefined,
      });

      // Insert deal
      const [insertResult] = await db.insert(deals).values({
        aeId: ae.aeId,
        customerName: pdDeal.title,
        contractType: "annual",
        startYear,
        startMonth,
        startDay,
        arrUsd: String(Math.round(arrUsd)),
        onboardingFeePaid: true,
        isReferral: false,
        tierAtStart: tier,
        fxRateAtEntry: String(usdToGbp),
        commissionStructureId: activeStructure?.id ?? null,
        pipedriveId: pdDeal.id,
        notes: `Imported from Pipedrive. Pipeline: ${pdDeal.pipelineName}`,
      });

      const dealId = (insertResult as any).insertId;

      // Insert payout schedule
      const payouts = commResult.payoutSchedule.map((p, i) => {
        const payoutDate = addMonths(startYear, startMonth, i);
        return {
          dealId,
          aeId: ae.aeId,
          payoutYear: payoutDate.year,
          payoutMonth: payoutDate.month,
          payoutNumber: p.payoutNumber,
          grossCommissionUsd: String(p.grossCommissionUsd),
          referralDeductionUsd: String(p.referralDeductionUsd),
          onboardingDeductionGbp: String(p.onboardingDeductionGbp),
          netCommissionUsd: String(p.netCommissionUsd),
          fxRateUsed: String(usdToGbp),
          netCommissionGbp: String(p.netCommissionGbp),
        };
      });

      for (const payout of payouts) {
        await db.insert(commissionPayouts).values(payout);
      }

      const debugInfo = `demos=${avgDemosPw.toFixed(1)}/wk dials=${avgDialsPw.toFixed(0)}/wk arr=$${Math.round(avgArrUsd)} newJoiner=${newJoiner}`;
      console.log(`  ✓ ${pdDeal.title} (${wonDate.substring(0, 7)}) → ${tier.toUpperCase()} | ${debugInfo}`);
      imported++;
    } catch (err) {
      console.error(`  ✗ ${pdDeal.title}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  console.log(`  Imported: ${imported}, Errors: ${errors}`);
}

console.log("\n=== Done! ===\n");
process.exit(0);
