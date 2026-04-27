import { describe, it, expect } from "vitest";
import { recalculatePayoutsWithLockedRate, formatPayoutInfo } from "./lockedFxPayoutHelper";
import type { Deal } from "../drizzle/schema";

describe("Locked FX Payout Helper", () => {
  const mockDeal: Deal = {
    id: 1,
    aeId: 1,
    customerName: "Test Customer",
    contractType: "annual",
    startYear: 2026,
    startMonth: 3,
    startDay: 1,
    originalAmount: "22000",
    originalCurrency: "EUR",
    arrUsd: "25410",
    conversionRate: "1.155",
    onboardingFeePaid: true,
    isReferral: false,
    tierAtStart: "silver",
    fxRateAtWon: "0.79",
    fxRateAtEntry: "0.79",
    fxRateLockedAtCreation: "0.78", // Locked at deal creation
    dealSignedDate: new Date("2026-03-01"),
    fxRateLockDate: new Date("2026-03-01"),
    commissionStructureId: 1,
    pipedriveId: null,
    billingFrequency: "annual",
    pipedriveWonTime: null,
    contractStartDate: null,
    isChurned: false,
    churnMonth: null,
    churnYear: null,
    churnReason: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("should recalculate payouts using locked FX rate", () => {
    const result = recalculatePayoutsWithLockedRate({
      deal: mockDeal,
      tier: "silver",
    });

    expect(result.commResult).toBeDefined();
    expect(result.commResult.payoutSchedule).toHaveLength(1); // Annual = 1 payout
    expect(result.lockedFxRate).toBe(0.78);
    expect(result.dealSignedDate).toEqual(new Date("2026-03-01"));
  });

  it("should use fxRateAtEntry as fallback if locked rate not set", () => {
    const dealWithoutLocked = { ...mockDeal, fxRateLockedAtCreation: null };

    const result = recalculatePayoutsWithLockedRate({
      deal: dealWithoutLocked,
      tier: "silver",
    });

    expect(result.lockedFxRate).toBe(0.79); // Falls back to fxRateAtEntry
  });

  it("should calculate correct GBP payout with locked rate", () => {
    const result = recalculatePayoutsWithLockedRate({
      deal: mockDeal,
      tier: "silver",
    });

    const payout = result.commResult.payoutSchedule[0];
    const expectedGrossUsd = 25410 * 0.16; // ARR * Silver rate
    const expectedGbp = expectedGrossUsd * 0.78; // Using locked rate

    expect(payout.grossCommissionUsd).toBeCloseTo(expectedGrossUsd, 0);
    expect(payout.netCommissionGbp).toBeCloseTo(expectedGbp, 0);
  });

  it("should handle monthly contracts with locked rate", () => {
    const monthlyDeal = {
      ...mockDeal,
      contractType: "monthly" as const,
    };

    const result = recalculatePayoutsWithLockedRate({
      deal: monthlyDeal,
      tier: "gold",
    });

    expect(result.commResult.payoutSchedule.length).toBeGreaterThan(1); // Monthly = 13 payouts
  });

  it("should not apply onboarding deduction (removed policy)", () => {
    const dealWithoutOnboarding = {
      ...mockDeal,
      onboardingFeePaid: false,
    };

    const result = recalculatePayoutsWithLockedRate({
      deal: dealWithoutOnboarding,
      tier: "bronze",
      activeStructure: {
        onboardingDeductionGbp: 500,
        onboardingArrReductionUsd: 5000,
      },
    });

    const firstPayout = result.commResult.payoutSchedule[0];
    expect(firstPayout.onboardingDeductionGbp).toBe(0); // No deduction applied
  });

  it("should format payout info correctly (no onboarding deduction)", () => {
    const formatted = formatPayoutInfo(mockDeal, 0.78, 0.80);

    expect(formatted.dealId).toBe(1);
    expect(formatted.customerName).toBe("Test Customer");
    expect(formatted.originalCurrency).toBe("EUR");
    expect(formatted.lockedFxRate).toBe(0.78);
    expect(formatted.currentFxRate).toBe(0.80);
    expect(formatted.rateChange).toContain("2.56%"); // (0.80 - 0.78) / 0.78 * 100
  });

  it("should handle referral deals with locked rate", () => {
    const referralDeal = { ...mockDeal, isReferral: true };

    const result = recalculatePayoutsWithLockedRate({
      deal: referralDeal,
      tier: "silver",
    });

    const payout = result.commResult.payoutSchedule[0];
    expect(payout.referralDeductionUsd).toBeGreaterThan(0);
    expect(payout.netCommissionUsd).toBeLessThan(payout.grossCommissionUsd);
  });

  it("should apply correct tier rate", () => {
    const bronzeDeal = { ...mockDeal, tierAtStart: "bronze" as const };
    const silverDeal = { ...mockDeal, tierAtStart: "silver" as const };
    const goldDeal = { ...mockDeal, tierAtStart: "gold" as const };

    const bronzeResult = recalculatePayoutsWithLockedRate({
      deal: bronzeDeal,
      tier: "bronze",
    });
    const silverResult = recalculatePayoutsWithLockedRate({
      deal: silverDeal,
      tier: "silver",
    });
    const goldResult = recalculatePayoutsWithLockedRate({
      deal: goldDeal,
      tier: "gold",
    });

    const bronzeGross = bronzeResult.commResult.payoutSchedule[0].grossCommissionUsd;
    const silverGross = silverResult.commResult.payoutSchedule[0].grossCommissionUsd;
    const goldGross = goldResult.commResult.payoutSchedule[0].grossCommissionUsd;

    expect(bronzeGross).toBeLessThan(silverGross);
    expect(silverGross).toBeLessThan(goldGross);
  });
});
