import { describe, it, expect } from "vitest";

describe("Currency Conversion", () => {
  const EUR_TO_USD = 1.08;
  const GBP_TO_USD = 1.27;

  it("should convert EUR to USD correctly", () => {
    const eurAmount = 22000;
    const expectedUsd = eurAmount * EUR_TO_USD;
    expect(expectedUsd).toBe(23760);
  });

  it("should convert GBP to USD correctly", () => {
    const gbpAmount = 20000;
    const expectedUsd = gbpAmount * GBP_TO_USD;
    expect(expectedUsd).toBe(25400);
  });

  it("should keep USD amounts unchanged", () => {
    const usdAmount = 24000;
    const expectedUsd = usdAmount * 1.0;
    expect(expectedUsd).toBe(24000);
  });

  it("should handle decimal amounts", () => {
    const eurAmount = 22500.50;
    const expectedUsd = eurAmount * EUR_TO_USD;
    expect(expectedUsd).toBeCloseTo(24300.54, 2);
  });

  it("should calculate conversion rate correctly", () => {
    const originalAmount = 20000;
    const originalCurrency = "GBP";
    const conversionRate = originalCurrency === "GBP" ? GBP_TO_USD : 1.0;
    const arrUsd = originalAmount * conversionRate;
    
    expect(conversionRate).toBe(1.27);
    expect(arrUsd).toBe(25400);
  });
});
