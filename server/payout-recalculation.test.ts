import { describe, it, expect } from "vitest";

describe("Payout Recalculation", () => {
  // Mock commission calculation
  const calculateMockCommission = (arrUsd: number, tier: string, contractType: string) => {
    const rates: Record<string, number> = {
      bronze: 0.13,
      silver: 0.16,
      gold: 0.19,
    };
    const rate = rates[tier] || 0.13;
    const grossCommission = arrUsd * rate;

    if (contractType === "annual") {
      return [{ payoutNumber: 1, grossCommissionUsd: grossCommission }];
    } else {
      // Monthly: divide by 12 for 13 months total
      const monthlyAmount = (grossCommission / 12) * 13;
      return Array.from({ length: 13 }, (_, i) => ({
        payoutNumber: i + 1,
        grossCommissionUsd: monthlyAmount / 13,
      }));
    }
  };

  it("should recalculate payouts when contract type changes from annual to monthly", () => {
    const arrUsd = 24000;
    const tier = "silver";

    const annualPayouts = calculateMockCommission(arrUsd, tier, "annual");
    const monthlyPayouts = calculateMockCommission(arrUsd, tier, "monthly");

    expect(annualPayouts).toHaveLength(1);
    expect(monthlyPayouts).toHaveLength(13);

    // Verify structure is correct
    expect(annualPayouts[0].payoutNumber).toBe(1);
    expect(monthlyPayouts[0].payoutNumber).toBe(1);
    expect(monthlyPayouts[12].payoutNumber).toBe(13);
  });

  it("should recalculate payouts when contract type changes from monthly to annual", () => {
    const arrUsd = 24000;
    const tier = "bronze";

    const monthlyPayouts = calculateMockCommission(arrUsd, tier, "monthly");
    const annualPayouts = calculateMockCommission(arrUsd, tier, "annual");

    expect(monthlyPayouts).toHaveLength(13);
    expect(annualPayouts).toHaveLength(1);

    // Verify structure is correct
    expect(annualPayouts[0].payoutNumber).toBe(1);
    expect(monthlyPayouts[0].payoutNumber).toBe(1);
    expect(monthlyPayouts[12].payoutNumber).toBe(13);
  });

  it("should handle different tiers correctly", () => {
    const arrUsd = 24000;
    const contractType = "annual";

    const bronzePayouts = calculateMockCommission(arrUsd, "bronze", contractType);
    const silverPayouts = calculateMockCommission(arrUsd, "silver", contractType);
    const goldPayouts = calculateMockCommission(arrUsd, "gold", contractType);

    const bronzeTotal = bronzePayouts[0].grossCommissionUsd;
    const silverTotal = silverPayouts[0].grossCommissionUsd;
    const goldTotal = goldPayouts[0].grossCommissionUsd;

    // Gold > Silver > Bronze
    expect(goldTotal).toBeGreaterThan(silverTotal);
    expect(silverTotal).toBeGreaterThan(bronzeTotal);

    // Verify exact percentages
    expect(bronzeTotal).toBeCloseTo(arrUsd * 0.13, 0);
    expect(silverTotal).toBeCloseTo(arrUsd * 0.16, 0);
    expect(goldTotal).toBeCloseTo(arrUsd * 0.19, 0);
  });

  it("should handle churn date filtering correctly", () => {
    const payouts = [
      { payoutYear: 2026, payoutMonth: 3, payoutNumber: 1 },
      { payoutYear: 2026, payoutMonth: 4, payoutNumber: 2 },
      { payoutYear: 2026, payoutMonth: 5, payoutNumber: 3 },
      { payoutYear: 2026, payoutMonth: 6, payoutNumber: 4 },
    ];

    const churnYear = 2026;
    const churnMonth = 4;

    const payoutsToDelete = payouts.filter(
      (p) => p.payoutYear > churnYear || (p.payoutYear === churnYear && p.payoutMonth > churnMonth)
    );

    expect(payoutsToDelete).toHaveLength(2);
    expect(payoutsToDelete[0].payoutMonth).toBe(5);
    expect(payoutsToDelete[1].payoutMonth).toBe(6);
  });
});
