/**
 * Resync Payouts Procedure
 * Recalculates all commission payouts from scratch
 * Team leader only
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
  // Only team leaders can resync
  if (!aeId || aeId !== 1) { // Assuming aeId 1 is the team leader
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only team leaders can resync payouts",
    });
  }

  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  try {
    // Delete all existing payouts
    const deleteResult = await db.delete(commissionPayouts);
    const payoutsDeleted = (deleteResult as any).rowCount ?? 0;

    // Get all deals with their commission structure (no isActive filter — all deals in DB are valid)
    const allDeals = await db
      .select({
        id: deals.id,
        aeId: deals.aeId,
        customerName: deals.customerName,
        contractType: deals.contractType,
        contractStartDate: deals.contractStartDate,
        arrUsd: deals.arrUsd,
        tierAtStart: deals.tierAtStart,
        isReferral: deals.isReferral,
        onboardingFeePaid: deals.onboardingFeePaid,
        fxRateAtWon: deals.fxRateAtWon,
        bronzeRate: commissionStructures.bronzeRate,
        silverRate: commissionStructures.silverRate,
        goldRate: commissionStructures.goldRate,
        onboardingDeductionGbp: commissionStructures.onboardingDeductionGbp,
      })
      .from(deals)
      .leftJoin(commissionStructures, eq(deals.commissionStructureId, commissionStructures.id));

    let payoutsCreated = 0;
    let totalCommissionGbp = 0;

    // Process each deal
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

    console.log(`[resyncPayouts] Deleted ${payoutsDeleted}, created ${payoutsCreated}`);

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

function calculatePayouts(deal: {
  id: number;
  aeId: number;
  customerName: string;
  contractType: string;
  contractStartDate: Date | null;
  arrUsd: string;
  tierAtStart: string;
  isReferral: boolean;
  onboardingFeePaid: boolean;
  fxRateAtWon: string | null;
  bronzeRate: string | null;
  silverRate: string | null;
  goldRate: string | null;
  onboardingDeductionGbp: string | null;
}): PayoutRecord[] {
  const payouts: PayoutRecord[] = [];

  if (!deal.contractStartDate || !deal.arrUsd) {
    return payouts;
  }

  const startDate = new Date(deal.contractStartDate);
  const startMonth = startDate.getMonth() + 1;
  const startYear = startDate.getFullYear();

  const arrUsd = parseFloat(deal.arrUsd);

  // Determine commission rate based on tier (use versioned rates if available)
  const commissionRate =
    deal.tierAtStart === "gold"
      ? parseFloat(deal.goldRate ?? "0.19")
      : deal.tierAtStart === "silver"
        ? parseFloat(deal.silverRate ?? "0.16")
        : parseFloat(deal.bronzeRate ?? "0.13"); // bronze

  const grossCommissionUsd = arrUsd * commissionRate;
  const fxRate = deal.fxRateAtWon ? parseFloat(deal.fxRateAtWon) : 0.738; // fallback rate

  // Referral deduction (50% of gross USD)
  const referralDeductionUsd = deal.isReferral ? grossCommissionUsd * 0.5 : 0;
  const netAfterReferralUsd = grossCommissionUsd - referralDeductionUsd;
  const netAfterReferralGbp = netAfterReferralUsd * fxRate;

  // Onboarding fee deduction (GBP, first payout only)
  const onboardingDeductionGbp = deal.onboardingFeePaid
    ? parseFloat(deal.onboardingDeductionGbp ?? "500")
    : 0;

  if (deal.contractType === "annual") {
    // Annual: single lump-sum payout 1 month AFTER contract start date
    let payoutMonth = startMonth + 1;
    let payoutYear = startYear;
    if (payoutMonth > 12) { payoutMonth -= 12; payoutYear += 1; }

    const netGbp = Math.max(0, netAfterReferralGbp - onboardingDeductionGbp);
    const netUsd = netGbp / fxRate;

    payouts.push({
      month: payoutMonth,
      year: payoutYear,
      grossUsd: grossCommissionUsd,
      netGbp,
      netUsd,
      payoutNumber: 1,
      fxRate,
      referralDeductionUsd,
      onboardingDeductionGbp,
    });
  } else if (deal.contractType === "monthly") {
    // Monthly: 12 payouts starting 1 month AFTER contract start date
    const monthlyGrossUsd = grossCommissionUsd / 12;
    const monthlyReferralDeductionUsd = referralDeductionUsd / 12;
    const monthlyNetUsd = netAfterReferralUsd / 12;
    const monthlyNetGbp = netAfterReferralGbp / 12;

    for (let i = 1; i <= 12; i++) {
      let payoutMonth = startMonth + i;
      let payoutYear = startYear;

      // Handle month/year overflow
      while (payoutMonth > 12) {
        payoutMonth -= 12;
        payoutYear += 1;
      }

      // First payout: deduct onboarding fee
      const thisOnboardingDeduction = i === 0 ? onboardingDeductionGbp : 0;
      const netGbp = Math.max(0, monthlyNetGbp - thisOnboardingDeduction);
      const netUsd = netGbp / fxRate;

      payouts.push({
        month: payoutMonth,
        year: payoutYear,
        grossUsd: monthlyGrossUsd,
        netGbp,
        netUsd,
        payoutNumber: i,
        fxRate,
        referralDeductionUsd: monthlyReferralDeductionUsd,
        onboardingDeductionGbp: thisOnboardingDeduction,
      });
    }
  }

  return payouts;
}
