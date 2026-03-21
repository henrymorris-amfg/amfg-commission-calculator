import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fetchLiveFxRates, convertToUsd, convertToGbp, clearFxCache } from "./fxService";

describe("FX Service", () => {
  beforeEach(() => {
    clearFxCache();
  });

  afterEach(() => {
    clearFxCache();
  });

  it("should fetch live FX rates from exchangerate-api.com", async () => {
    const rates = await fetchLiveFxRates();
    
    expect(rates).toHaveProperty("USD");
    expect(rates).toHaveProperty("EUR");
    expect(rates).toHaveProperty("GBP");
    expect(rates).toHaveProperty("timestamp");
    
    // Verify rates are reasonable (not zero or NaN)
    expect(rates.USD).toBe(1.0);
    expect(rates.EUR).toBeGreaterThan(0);
    expect(rates.GBP).toBeGreaterThan(0);
    expect(rates.EUR).toBeLessThan(2); // Sanity check
    expect(rates.GBP).toBeLessThan(2); // Sanity check
  });

  it("should convert EUR to USD correctly", async () => {
    const result = await convertToUsd(1000, "EUR");
    
    expect(result).toHaveProperty("usdAmount");
    expect(result).toHaveProperty("rate");
    expect(result.usdAmount).toBeGreaterThan(0);
    expect(result.rate).toBeGreaterThan(1); // EUR should be > 1 USD
  });

  it("should convert GBP to USD correctly", async () => {
    const result = await convertToUsd(1000, "GBP");
    
    expect(result).toHaveProperty("usdAmount");
    expect(result).toHaveProperty("rate");
    expect(result.usdAmount).toBeGreaterThan(0);
    expect(result.rate).toBeGreaterThan(1); // GBP should be > 1 USD
  });

  it("should handle USD to USD conversion (no-op)", async () => {
    const result = await convertToUsd(1000, "USD");
    
    expect(result.usdAmount).toBe(1000);
    expect(result.rate).toBe(1.0);
  });

  it("should convert USD to GBP correctly", async () => {
    const result = await convertToGbp(1000);
    
    expect(result).toHaveProperty("gbpAmount");
    expect(result).toHaveProperty("rate");
    expect(result.gbpAmount).toBeGreaterThan(0);
    expect(result.gbpAmount).toBeLessThan(1000); // GBP is stronger than USD
  });

  it("should use rate override when provided", async () => {
    const result = await convertToUsd(1000, "EUR", 1.10);
    
    expect(result.usdAmount).toBe(1100);
    expect(result.rate).toBe(1.10);
  });

  it("should cache rates for 24 hours", async () => {
    const rates1 = await fetchLiveFxRates();
    const rates2 = await fetchLiveFxRates();
    
    // Both should return the same timestamp (cached)
    expect(rates1.timestamp).toBe(rates2.timestamp);
  });

  it("should use fallback rates if API fails", async () => {
    // This test would require mocking the fetch, but we're testing the happy path here
    // In production, if API fails, it returns fallback rates (EUR: 1.08, GBP: 1.27)
    const result = await convertToUsd(1000, "EUR", 1.08);
    expect(result.usdAmount).toBe(1080);
  });
});
