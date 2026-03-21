/**
 * FX Rate Service
 * Fetches live exchange rates from exchangerate-api.com with 24-hour caching
 * 
 * Strategy:
 * - GBP rates: Locked at deal creation (stored in database)
 * - USD rates: Floating (fetched on-demand for 3-month average calculations)
 */

import { ENV } from "./_core/env";

interface FxRates {
  USD: number;
  EUR: number;
  GBP: number;
  timestamp: number;
}

// In-memory cache with 24-hour TTL
let cachedRates: FxRates | null = null;
let cacheExpiry: number = 0;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Fallback rates if API fails
const FALLBACK_RATES: FxRates = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.27,
  timestamp: Date.now(),
};

/**
 * Fetch current FX rates from exchangerate-api.com
 * Returns rates as multipliers (e.g., EUR: 1.08 means 1 EUR = 1.08 USD)
 */
export async function fetchLiveFxRates(): Promise<FxRates> {
  // Check cache first
  if (cachedRates && Date.now() < cacheExpiry) {
    console.log("[FX] Using cached rates");
    return cachedRates;
  }

  try {
    const apiKey = ENV.fxApiKey;
    if (!apiKey) {
      console.warn("[FX] FX_API_KEY not configured, using fallback rates");
      return FALLBACK_RATES;
    }

    const response = await fetch(
      `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`
    );

    if (!response.ok) {
      console.warn(
        `[FX] API error: ${response.status}, using fallback rates`
      );
      return FALLBACK_RATES;
    }

    const data = await response.json();

    if (data.result !== "success" || !data.conversion_rates) {
      console.warn("[FX] Invalid API response, using fallback rates");
      return FALLBACK_RATES;
    }

    // API returns USD→EUR and USD→GBP rates
    // We need EUR→USD and GBP→USD rates (the inverse)
    const eurToUsd = 1 / (data.conversion_rates.EUR || FALLBACK_RATES.EUR);
    const gbpToUsd = 1 / (data.conversion_rates.GBP || FALLBACK_RATES.GBP);

    const rates: FxRates = {
      USD: 1.0,
      EUR: eurToUsd,
      GBP: gbpToUsd,
      timestamp: Date.now(),
    };

    // Cache the rates
    cachedRates = rates;
    cacheExpiry = Date.now() + CACHE_TTL_MS;

    console.log("[FX] Fetched live rates:", rates);
    return rates;
  } catch (error) {
    console.error("[FX] Error fetching rates:", error);
    return FALLBACK_RATES;
  }
}

/**
 * Convert amount from source currency to USD
 * @param amount The amount in source currency
 * @param currency The source currency (USD, EUR, GBP)
 * @param rateOverride Optional rate to use instead of fetching live
 */
export async function convertToUsd(
  amount: number,
  currency: string,
  rateOverride?: number
): Promise<{ usdAmount: number; rate: number }> {
  if (currency === "USD") {
    return { usdAmount: amount, rate: 1.0 };
  }

  const rates = rateOverride ? { [currency]: rateOverride } : await fetchLiveFxRates();
  const rate = rates[currency as keyof typeof rates] || FALLBACK_RATES[currency as keyof typeof FALLBACK_RATES];

  return {
    usdAmount: Number((amount * rate).toFixed(2)),
    rate,
  };
}

/**
 * Convert amount from USD to GBP
 * @param usdAmount The amount in USD
 * @param rateOverride Optional rate to use instead of fetching live
 */
export async function convertToGbp(
  usdAmount: number,
  rateOverride?: number
): Promise<{ gbpAmount: number; rate: number }> {
  const rates = rateOverride ? { GBP: rateOverride } : await fetchLiveFxRates();
  const rate = rates.GBP || FALLBACK_RATES.GBP;

  return {
    gbpAmount: Number((usdAmount / rate).toFixed(2)),
    rate,
  };
}

/**
 * Get current FX rates (for display and calculations)
 */
export async function getCurrentFxRates(): Promise<FxRates> {
  return fetchLiveFxRates();
}

/**
 * Clear cache (useful for testing)
 */
export function clearFxCache(): void {
  cachedRates = null;
  cacheExpiry = 0;
}
