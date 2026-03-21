import { describe, it, expect, beforeEach } from "vitest";
import { convertToCurrentUsd, recalculateFloatingArrUsd } from "./floatingUsdHelper";
import { clearFxCache } from "./fxService";

describe("Floating USD Helper", () => {
  beforeEach(() => {
    clearFxCache();
  });

  it("should convert EUR to current USD", async () => {
    const usdAmount = await convertToCurrentUsd(1000, "EUR");
    
    expect(usdAmount).toBeGreaterThan(1000); // EUR should convert to more USD
    expect(usdAmount).toBeLessThan(1300); // Sanity check
  });

  it("should convert GBP to current USD", async () => {
    const usdAmount = await convertToCurrentUsd(1000, "GBP");
    
    expect(usdAmount).toBeGreaterThan(1200); // GBP is strong
    expect(usdAmount).toBeLessThan(1500); // Sanity check
  });

  it("should return USD unchanged", async () => {
    const usdAmount = await convertToCurrentUsd(1000, "USD");
    
    expect(usdAmount).toBe(1000);
  });

  it("should recalculate floating ARR for mixed currency deals", async () => {
    const deals = [
      { originalAmount: 1000, originalCurrency: "USD", arrUsd: 1000 },
      { originalAmount: 1000, originalCurrency: "EUR", arrUsd: 1080 },
      { originalAmount: 1000, originalCurrency: "GBP", arrUsd: 1270 },
    ];

    const floatingTotal = await recalculateFloatingArrUsd(deals);
    
    // Should be higher than stored total (3350) due to current rates
    expect(floatingTotal).toBeGreaterThan(3000);
    expect(floatingTotal).toBeLessThan(5000); // Sanity check
  });

  it("should handle single USD deal", async () => {
    const deals = [
      { originalAmount: 5000, originalCurrency: "USD", arrUsd: 5000 },
    ];

    const floatingTotal = await recalculateFloatingArrUsd(deals);
    
    expect(floatingTotal).toBe(5000);
  });

  it("should handle single EUR deal", async () => {
    const deals = [
      { originalAmount: 5000, originalCurrency: "EUR", arrUsd: 5400 },
    ];

    const floatingTotal = await recalculateFloatingArrUsd(deals);
    
    expect(floatingTotal).toBeGreaterThan(5000);
  });
});
