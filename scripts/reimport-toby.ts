/**
 * Re-import Toby Greer's deals only, using the now-corrected monthly_metrics.
 * Run after revert-toby-arr.ts has restored correct ARR values.
 */

import { drizzle } from "drizzle-orm/mysql2";
import { eq, desc } from "drizzle-orm";
import {
  monthlyMetrics, deals, commissionPayouts, aeProfiles, commissionStructures,
} from "../drizzle/schema";
import {
  computeRollingAverages, computeAvgRetention, isNewJoiner,
  calculateTier, calculateCommission, addMonths, type Tier,
} from "../shared/commission";
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
const db = drizzle(DATABASE_URL);

const TOBY_AE_ID = 30004;
const TOBY_PD_ID = 24052953;
const TOBY_JOIN_DATE = new Date("2025-07-28");
const TARGET_PIPELINE_IDS = [20, 12, 10];

async function getFxRate(): Promise<number> {
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await res.json() as { rates: Record<string, number> };
    return data.rates.GBP ?? 0.79;
  } catch { return 0.79; }
}

async function toUsd(value: number, currency: string): Promise<number> {
  if (currency === "USD") return value;
  const usdToGbp = await getFxRate();
  if (currency === "GBP") return value / usdToGbp;
  if (currency === "EUR") {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await res.json() as { rates: Record<string, number> };
    const eurRate = data.rates.EUR ?? 0.92;
    return value / eurRate;
  }
  return value;
}

async function pipedriveGet(endpoint: string, params: Record<string, string | number> = {}) {
  const url = new URL(`https://api.pipedrive.com/v1/${endpoint}`);
  url.searchParams.set("api_token", PIPEDRIVE_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Pipedrive error: ${res.status}`);
  return res.json() as Promise<any>;
}

async function fetchWonDeals(pdUserId: number, fromDate: string, toDate: string) {
  const dealsById = new Map<number, any>();
  for (const pipelineId of TARGET_PIPELINE_IDS) {
    let start = 0;
    while (true) {
      const resp = await pipedriveGet("deals", { pipeline_id: pipelineId, user_id: pdUserId, status: "won", limit: 500, start });
      const data = resp.data || [];
      for (const d of data) {
        if (dealsById.has(d.id)) continue; // deduplicate across pipelines
        const wonDate = (d.won_time || d.close_time || "").substring(0, 10);
        if (wonDate >= fromDate && wonDate <= toDate) dealsById.set(d.id, d);
      }
      if (!resp.additional_data?.pagination?.more_items_in_collection || data.length === 0) break;
      start += 500;
    }
  }
  return Array.from(dealsById.values());
}

const today = new Date().toISOString().substring(0, 10);
const usdToGbp = await getFxRate();

const activeStructure = (await db.select().from(commissionStructures).where(eq(commissionStructures.isActive, 1)).limit(1))[0] ?? null;
const allMetrics = await db.select().from(monthlyMetrics).where(eq(monthlyMetrics.aeId, TOBY_AE_ID)).orderBy(desc(monthlyMetrics.year), desc(monthlyMetrics.month));

console.log(`\n=== Re-importing Toby Greer's deals ===`);
console.log(`FX rate: 1 USD = ${usdToGbp.toFixed(4)} GBP`);
console.log(`Monthly metrics in DB:`);
for (const m of [...allMetrics].sort((a,b) => a.year*100+a.month - (b.year*100+b.month))) {
  console.log(`  ${m.year}-${String(m.month).padStart(2,'0')}: ARR=$${Number(m.arrUsd).toLocaleString()} demos=${m.demosTotal} dials=${m.dialsTotal}`);
}

// Clear existing deals
const existing = await db.select({ id: deals.id }).from(deals).where(eq(deals.aeId, TOBY_AE_ID));
for (const d of existing) await db.delete(commissionPayouts).where(eq(commissionPayouts.dealId, d.id));
await db.delete(deals).where(eq(deals.aeId, TOBY_AE_ID));
console.log(`\nCleared ${existing.length} existing deals`);

// Fetch from Pipedrive
const pdDeals = await fetchWonDeals(TOBY_PD_ID, TOBY_JOIN_DATE.toISOString().substring(0, 10), today);
console.log(`Found ${pdDeals.length} unique won deals in Pipedrive`);

let imported = 0;
for (const pdDeal of pdDeals) {
  const wonDate = pdDeal.won_time || pdDeal.close_time;
  if (!wonDate) continue;
  const startYear = parseInt(wonDate.substring(0, 4));
  const startMonth = parseInt(wonDate.substring(5, 7));
  const startDay = parseInt(wonDate.substring(8, 10));
  const arrUsd = await toUsd(pdDeal.value || 0, pdDeal.currency || "USD");
  const targetDate = new Date(startYear, startMonth - 1, 1);

  const last3 = allMetrics
    .filter(m => new Date(m.year, m.month - 1, 1) < targetDate)
    .slice(0, 3)
    .map(m => ({ year: m.year, month: m.month, arrUsd: Number(m.arrUsd), demosTotal: m.demosTotal, dialsTotal: m.dialsTotal, retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null }));

  const last6 = allMetrics
    .filter(m => new Date(m.year, m.month - 1, 1) < targetDate)
    .slice(0, 6)
    .map(m => ({ year: m.year, month: m.month, arrUsd: Number(m.arrUsd), demosTotal: m.demosTotal, dialsTotal: m.dialsTotal, retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null }));

  const avgs = computeRollingAverages(last3);
  const avgRetention = computeAvgRetention(last6);
  const newJoiner = isNewJoiner(TOBY_JOIN_DATE, targetDate);
  const tierResult = calculateTier({ ...avgs, avgRetentionRate: avgRetention, isNewJoiner: newJoiner, isTeamLeader: false });
  const tier = tierResult.tier as Tier;

  const commResult = calculateCommission({
    contractType: "annual", arrUsd, tier,
    onboardingFeePaid: true, isReferral: false, fxRateUsdToGbp: usdToGbp,
    monthlyPayoutMonths: activeStructure ? Number(activeStructure.monthlyPayoutMonths) : undefined,
    onboardingDeductionGbp: activeStructure ? Number(activeStructure.onboardingDeductionGbp) : undefined,
    onboardingArrReductionUsd: activeStructure ? Number(activeStructure.onboardingArrReductionUsd) : undefined,
  });

  const [insertResult] = await db.insert(deals).values({
    aeId: TOBY_AE_ID, customerName: pdDeal.title, contractType: "annual",
    startYear, startMonth, startDay, arrUsd: String(Math.round(arrUsd)),
    onboardingFeePaid: true, isReferral: false, tierAtStart: tier,
    fxRateAtEntry: String(usdToGbp), commissionStructureId: activeStructure?.id ?? null,
    pipedriveId: pdDeal.id, notes: `Imported from Pipedrive`,
  });
  const dealId = (insertResult as any).insertId;

  for (let i = 0; i < commResult.payoutSchedule.length; i++) {
    const p = commResult.payoutSchedule[i];
    const payoutDate = addMonths(startYear, startMonth, i);
    await db.insert(commissionPayouts).values({
      dealId, aeId: TOBY_AE_ID, payoutYear: payoutDate.year, payoutMonth: payoutDate.month,
      payoutNumber: p.payoutNumber, grossCommissionUsd: String(p.grossCommissionUsd),
      referralDeductionUsd: String(p.referralDeductionUsd), onboardingDeductionGbp: String(p.onboardingDeductionGbp),
      netCommissionUsd: String(p.netCommissionUsd), fxRateUsed: String(usdToGbp), netCommissionGbp: String(p.netCommissionGbp),
    });
  }

  console.log(`  ✓ ${pdDeal.title} (${wonDate.substring(0,7)}) → ${tier.toUpperCase()} | ARR=$${Math.round(arrUsd).toLocaleString()} | demos=${avgs.avgDemosPw.toFixed(1)}/wk dials=${avgs.avgDialsPw.toFixed(0)}/wk newJoiner=${newJoiner}`);
  imported++;
}

console.log(`\nImported: ${imported} deals`);
process.exit(0);
