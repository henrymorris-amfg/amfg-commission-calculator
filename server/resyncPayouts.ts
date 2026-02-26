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
    const payoutsDeleted = deleteResult.rowCount || 0;

    // Get all active deals with commission structure
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
        commissionPercentage: commissionStructures.commissionPercentage,
        onboardingFeeGbp: commissionStructures.onboardingFeeGbp,
      })
      .from(deals)
      .leftJoin(commissionStructures, eq(deals.commissionStructureId, commissionStructures.id))
      .where(eq(deals.isActive, true));

    let payoutsCreated = 0;
    let totalCommissionGbp = 0;

    // Process each deal
    for (const deal of allDeals) {
      const payouts = calculatePayouts(deal);

      for (const payout of payouts) {
        await db.insert(commissionPayouts).values({
          aeId: deal.aeId,
          dealId: deal.id,
          payoutMonth: payout.month,
          payoutYear: payout.year,
          netCommissionGbp: payout.netGbp,
          netCommissionUsd: payout.netUsd,
          payoutNumber: payout.payoutNumber,
          totalPayouts: payout.totalPayouts,
          fxRateUsed: payout.fxRate,
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
  netGbp: number;
  netUsd: number;
  payoutNumber: number;
  totalPayouts: number;
  fxRate: number;
}

function calculatePayouts(deal: any): PayoutRecord[] {
  const payouts: PayoutRecord[] = [];

  if (!deal.contractStartDate || !deal.arrUsd) {
    return payouts;
  }

  const startDate = new Date(deal.contractStartDate);
  const startMonth = startDate.getMonth() + 1;
  const startYear = startDate.getFullYear();

  // Determine commission rate based on tier
  const commissionRate =
    deal.tierAtStart === "gold"
      ? 0.19
      : deal.tierAtStart === "silver"
        ? 0.16
        : 0.13; // bronze

  const baseCommissionUsd = deal.arrUsd * commissionRate;
  const fxRate = deal.fxRateAtWon || 0.738; // fallback rate
  let baseCommissionGbp = baseCommissionUsd * fxRate;

  // Apply referral discount (50%)
  if (deal.isReferral) {
    baseCommissionGbp *= 0.5;
  }

  // Onboarding fee deduction
  const onboardingDeductionGbp = deal.onboardingFeePaid ? (deal.onboardingFeeGbp || 500) : 0;

  if (deal.contractType === "annual") {
    // Annual: single payout in start month
    const netGbp = Math.max(0, baseCommissionGbp - onboardingDeductionGbp);
    const netUsd = netGbp / fxRate;

    payouts.push({
      month: startMonth,
      year: startYear,
      netGbp,
      netUsd,
      payoutNumber: 1,
      totalPayouts: 1,
      fxRate,
    });
  } else if (deal.contractType === "monthly") {
    // Monthly: 13 payouts (current + 12 future)
    const monthlyCommissionGbp = baseCommissionGbp / 12;
    const monthlyCommissionUsd = baseCommissionUsd / 12;

    for (let i = 0; i < 13; i++) {
      let payoutMonth = startMonth + i;
      let payoutYear = startYear;

      // Handle month/year overflow
      if (payoutMonth > 12) {
        payoutMonth -= 12;
        payoutYear += 1;
      }

      // First payout: deduct onboarding fee
      let netGbp = monthlyCommissionGbp;
      let netUsd = monthlyCommissionUsd;

      if (i === 0 && onboardingDeductionGbp > 0) {
        netGbp -= onboardingDeductionGbp;
        netUsd = netGbp / fxRate;
      }

      payouts.push({
        month: payoutMonth,
        year: payoutYear,
        netGbp: Math.max(0, netGbp),
        netUsd: Math.max(0, netUsd),
        payoutNumber: i + 1,
        totalPayouts: 13,
        fxRate,
      });
    }
  }

  return payouts;
}
