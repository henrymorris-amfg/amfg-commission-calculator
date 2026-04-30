/**
 * Resync Payouts Procedure
 * Recalculates all commission payouts from scratch using the correct rules:
 *
 * ANNUAL deals:
 *   - 1 payout only
 *   - Payout date = contract start date + 1 month
 *   - Commission = tier% × ARR (full annual value)
 *
 * MONTHLY deals:
 *   - 13 payouts (months 1–13 after contract start)
 *   - Payout date = contract start date + N months (N = 1..13)
 *   - Commission per month = (tier% × ARR) / 12
 *
 * Tier% is determined by tierAtStart stored on the deal (the AE's tier when the contract started).
 * Source of truth for deal type: billingFrequency column (falls back to contractType if null).
 */

import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { eq } from "drizzle-orm";
import { commissionPayouts, deals, commissionStructures } from "../drizzle/schema";

export async function resyncAllPayouts(aeId: number | null): Promise<{
  success: boolean;
  payoutsDeleted: number;
  payoutsCreated: number;
  totalCommissionGbp: number;
}> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  try {
    // Delete all existing payouts
    const deleteResult = await db.delete(commissionPayouts);
    const payoutsDeleted = (deleteResult as any).rowCount ?? 0;

    // Get all deals with their commission structure
    const allDeals = await db
      .select({
        id: deals.id,
        aeId: deals.aeId,
        customerName: deals.customerName,
        // billingFrequency is the authoritative field from Pipedrive sync
        // contractType is the legacy field — use billingFrequency first
        billingFrequency: deals.billingFrequency,
        contractType: deals.contractType,
        contractStartDate: deals.contractStartDate,
        startYear: deals.startYear,
        startMonth: deals.startMonth,
        arrUsd: deals.arrUsd,
        tierAtStart: deals.tierAtStart,
        isReferral: deals.isReferral,
        onboardingFeePaid: deals.onboardingFeePaid,
        fxRateAtWon: deals.fxRateAtWon,
        fxRateAtEntry: deals.fxRateAtEntry,
        bronzeRate: commissionStructures.bronzeRate,
        silverRate: commissionStructures.silverRate,
        goldRate: commissionStructures.goldRate,
        onboardingDeductionGbp: commissionStructures.onboardingDeductionGbp,
        monthlyPayoutMonths: commissionStructures.monthlyPayoutMonths,
      })
      .from(deals)
      .leftJoin(commissionStructures, eq(deals.commissionStructureId, commissionStructures.id));

    let payoutsCreated = 0;
    let totalCommissionGbp = 0;

    for (const deal of allDeals) {
      const payoutRecords = calculatePayouts(deal);

      for (const payout of payoutRecords) {
        await db.insert(commissionPayouts).values({
          aeId: deal.aeId,
          dealId: deal.id,
          payoutMonth: payout.month,
          payoutYear: payout.year,
          grossCommissionUsd: String(payout.grossUsd),
          netCommissionGbp: String(payout.netGbp),
          netCommissionUsd: String(payout.netUsd),
          payoutNumber: payout.payoutNumber,
          fxRateUsed: String(payout.fxRate),
          referralDeductionUsd: String(payout.referralDeductionUsd),
          onboardingDeductionGbp: String(payout.onboardingDeductionGbp),
        });

        payoutsCreated++;
        totalCommissionGbp += payout.netGbp;
      }
    }

    console.log(`[resyncPayouts] Deleted ${payoutsDeleted}, created ${payoutsCreated}, total GBP: ${totalCommissionGbp.toFixed(2)}`);

    return {
      success: true,
      payoutsDeleted,
      payoutsCreated,
      totalCommissionGbp,
    };
  } catch (error) {
    console.error("[resyncPayouts] Error:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Resync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

interface PayoutRecord {
  month: number;
  year: number;
  grossUsd: number;
  netGbp: number;
  netUsd: number;
  payoutNumber: number;
  fxRate: number;
  referralDeductionUsd: number;
  onboardingDeductionGbp: number;
}

/**
 * Add N months to a (year, month) pair. Returns { year, month }.
 */
function addMonthsToYearMonth(year: number, month: number, n: number): { year: number; month: number } {
  const total = (month - 1) + n; // 0-indexed months
  return {
    year: year + Math.floor(total / 12),
    month: (total % 12) + 1,
  };
}

export function calculatePayouts(deal: {
  id: number;
  aeId: number;
  customerName: string;
  billingFrequency: string | null;
  contractType: string;
  contractStartDate: Date | null;
  startYear: number;
  startMonth: number;
  arrUsd: string;
  tierAtStart: string;
  isReferral: boolean;
  onboardingFeePaid: boolean;
  fxRateAtWon: string | null;
  fxRateAtEntry: string | null;
  bronzeRate: string | null;
  silverRate: string | null;
  goldRate: string | null;
  onboardingDeductionGbp: string | null;
  monthlyPayoutMonths: number | null;
}): PayoutRecord[] {
  const payouts: PayoutRecord[] = [];

  // Determine payout start year/month from contractStartDate (preferred) or startYear/startMonth
  let startYear: number;
  let startMonth: number;

  if (deal.contractStartDate) {
    const d = new Date(deal.contractStartDate);
    startYear = d.getFullYear();
    startMonth = d.getMonth() + 1; // 1-indexed
  } else {
    startYear = deal.startYear;
    startMonth = deal.startMonth;
  }

  if (!startYear || !startMonth || !deal.arrUsd) {
    return payouts;
  }

  // Source of truth: billingFrequency (from Pipedrive) takes precedence over legacy contractType
  const dealType = (deal.billingFrequency ?? deal.contractType ?? "annual").toLowerCase();

  const arrUsd = parseFloat(deal.arrUsd);
  if (isNaN(arrUsd) || arrUsd <= 0) return payouts;

  // Commission rate based on tier at contract start
  const commissionRate =
    deal.tierAtStart === "gold"
      ? parseFloat(deal.goldRate ?? "0.19")
      : deal.tierAtStart === "silver"
        ? parseFloat(deal.silverRate ?? "0.16")
        : parseFloat(deal.bronzeRate ?? "0.13"); // bronze / default

  // Full annual commission amount
  const grossAnnualCommissionUsd = arrUsd * commissionRate;

  // FX rate stored as USD per GBP (e.g. 1.35 means £1 = $1.35)
  // To convert USD → GBP: divide USD by fxRate
  // Prefer fxRateAtWon (locked at deal won time), fallback to fxRateAtEntry
  const fxRateUsdPerGbp = deal.fxRateAtWon
    ? parseFloat(deal.fxRateAtWon)
    : deal.fxRateAtEntry
      ? parseFloat(deal.fxRateAtEntry)
      : 1.35; // last-resort fallback (~current USD/GBP)

  // Referral deduction (50% of gross, applied to full annual amount)
  const referralDeductionUsd = deal.isReferral ? grossAnnualCommissionUsd * 0.5 : 0;
  const netAnnualAfterReferralUsd = grossAnnualCommissionUsd - referralDeductionUsd;

  // Onboarding fee deduction (GBP, first payout only)
  const onboardingDeductionGbp = deal.onboardingFeePaid
    ? parseFloat(deal.onboardingDeductionGbp ?? "500")
    : 0;

  if (dealType === "annual") {
    // ─── ANNUAL: single payout 1 month after contract start ───────────────────
    const { year: payoutYear, month: payoutMonth } = addMonthsToYearMonth(startYear, startMonth, 1);

    // USD → GBP: divide by fxRateUsdPerGbp
    const netGbp = Math.max(0, (netAnnualAfterReferralUsd / fxRateUsdPerGbp) - onboardingDeductionGbp);
    const netUsd = netGbp * fxRateUsdPerGbp;

    payouts.push({
      month: payoutMonth,
      year: payoutYear,
      grossUsd: grossAnnualCommissionUsd,
      netGbp,
      netUsd,
      payoutNumber: 1,
      fxRate: fxRateUsdPerGbp,
      referralDeductionUsd,
      onboardingDeductionGbp,
    });

  } else if (dealType === "monthly") {
    // ─── MONTHLY: 13 payouts, monthly from 1 month after contract start ───────
    // Commission per month = (tier% × ARR) / 12
    const numPayouts = deal.monthlyPayoutMonths ?? 13;
    const monthlyGrossUsd = grossAnnualCommissionUsd / 12;
    const monthlyReferralDeductionUsd = referralDeductionUsd / 12;
    const monthlyNetAfterReferralUsd = netAnnualAfterReferralUsd / 12;

    for (let i = 1; i <= numPayouts; i++) {
      const { year: payoutYear, month: payoutMonth } = addMonthsToYearMonth(startYear, startMonth, i);

      // Onboarding deduction applied to first payout only
      const thisOnboardingDeduction = i === 1 ? onboardingDeductionGbp : 0;
      // USD → GBP: divide by fxRateUsdPerGbp
      const netGbp = Math.max(0, (monthlyNetAfterReferralUsd / fxRateUsdPerGbp) - thisOnboardingDeduction);
      const netUsd = netGbp * fxRateUsdPerGbp;

      payouts.push({
        month: payoutMonth,
        year: payoutYear,
        grossUsd: monthlyGrossUsd,
        netGbp,
        netUsd,
        payoutNumber: i,
        fxRate: fxRateUsdPerGbp,
        referralDeductionUsd: monthlyReferralDeductionUsd,
        onboardingDeductionGbp: thisOnboardingDeduction,
      });
    }
  }

  return payouts;
}
