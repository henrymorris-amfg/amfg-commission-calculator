/**
 * Locked FX Payout Helper
 * 
 * Recalculates payouts using the locked GBP rate from deal creation
 * This ensures deterministic, audit-able payouts that don't change with market rates
 */

import { calculateCommission, type Tier } from "../shared/commission";
import type { Deal } from "../drizzle/schema";

export interface LockedFxPayoutInput {
  deal: Deal;
  tier: Tier;
  activeStructure?: {
    monthlyPayoutMonths?: number;
    onboardingDeductionGbp?: number;
    onboardingArrReductionUsd?: number;
  };
}

/**
 * Recalculate payouts using the locked GBP rate from deal creation
 * Returns the commission result with GBP amounts locked to deal creation rates
 */
export function recalculatePayoutsWithLockedRate(
  input: LockedFxPayoutInput
) {
  const { deal, tier, activeStructure } = input;

  // Use locked FX rate from deal creation, fallback to fxRateAtEntry if not set
  const lockedFxRate =
    deal.fxRateLockedAtCreation || deal.fxRateAtEntry || 0.79;

  // Recalculate commission using locked rate
  const commResult = calculateCommission({
    tier,
    contractType: deal.contractType as "annual" | "monthly",
    arrUsd: Number(deal.arrUsd),
    isReferral: deal.isReferral,
    fxRateUsdToGbp: Number(lockedFxRate),
    monthlyPayoutMonths: activeStructure?.monthlyPayoutMonths,
  });

  return {
    commResult,
    lockedFxRate: Number(lockedFxRate),
    dealSignedDate: deal.dealSignedDate,
    fxRateLockDate: deal.fxRateLockDate,
  };
}

/**
 * Format payout information for display
 * Shows both locked rate and current market rate for comparison
 */
export function formatPayoutInfo(
  deal: Deal,
  lockedFxRate: number,
  currentFxRate?: number
) {
  return {
    dealId: deal.id,
    customerName: deal.customerName,
    originalCurrency: deal.originalCurrency,
    originalAmount: Number(deal.originalAmount),
    arrUsd: Number(deal.arrUsd),
    conversionRate: Number(deal.conversionRate),
    lockedFxRate: Number(deal.fxRateLockedAtCreation || deal.fxRateAtEntry),
    dealSignedDate: deal.dealSignedDate,
    fxRateLockDate: deal.fxRateLockDate,
    // Show difference if current rate is provided
    ...(currentFxRate && {
      currentFxRate,
      rateChange: ((currentFxRate - lockedFxRate) / lockedFxRate * 100).toFixed(2) + "%",
    }),
  };
}
