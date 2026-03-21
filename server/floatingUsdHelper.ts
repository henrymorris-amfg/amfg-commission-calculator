/**
 * Floating USD Helper
 * 
 * For 3-month average calculations, we need to recalculate USD amounts using current FX rates
 * This ensures the 3-month average reflects real-time market conditions
 */

import { getCurrentFxRates } from "./fxService";

/**
 * Convert original currency amount to current USD using live FX rates
 * Used for floating 3-month average calculations
 */
export async function convertToCurrentUsd(
  originalAmount: number,
  originalCurrency: string
): Promise<number> {
  if (originalCurrency === "USD") {
    return originalAmount;
  }

  try {
    const rates = await getCurrentFxRates();
    const rate = rates[originalCurrency as keyof typeof rates];
    
    if (!rate) {
      console.warn(
        `[FloatingUSD] No rate found for ${originalCurrency}, using original amount`
      );
      return originalAmount;
    }

    const converted = Number((originalAmount * rate).toFixed(2));
    console.log(
      `[FloatingUSD] Converted ${originalAmount} ${originalCurrency} to ${converted} USD (rate: ${rate})`
    );
    return converted;
  } catch (error) {
    console.error("[FloatingUSD] Error converting to USD:", error);
    return originalAmount;
  }
}

/**
 * Recalculate 3-month average ARR using current FX rates
 * This is used for tier calculations to reflect real-time market conditions
 */
export async function recalculateFloatingArrUsd(
  deals: Array<{
    originalAmount: number;
    originalCurrency: string;
    arrUsd: number;
  }>
): Promise<number> {
  let totalUsd = 0;

  for (const deal of deals) {
    if (deal.originalCurrency !== "USD") {
      // Recalculate using current rates
      const currentUsd = await convertToCurrentUsd(
        deal.originalAmount,
        deal.originalCurrency
      );
      totalUsd += currentUsd;
    } else {
      // USD deals use stored amount
      totalUsd += deal.arrUsd;
    }
  }

  return Number(totalUsd.toFixed(2));
}
