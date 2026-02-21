import { describe, expect, it } from "vitest";
import {
  calculateTier,
  calculateCommission,
  computeRollingAverages,
  computeAvgRetention,
  isNewJoiner,
  TIER_COMMISSION_RATE,
  STANDARD_TARGETS,
  TEAM_LEADER_TARGETS,
} from "../shared/commission";

// ─── Tier Calculation Tests ───────────────────────────────────────────────────

describe("calculateTier", () => {
  const goldInputs = {
    avgArrUsd: 25_000,
    avgDemosPw: 4,
    avgDialsPw: 200,
    avgRetentionRate: 71,
    isNewJoiner: false,
    isTeamLeader: false,
  };

  it("returns gold when all gold criteria are met", () => {
    const result = calculateTier(goldInputs);
    expect(result.tier).toBe("gold");
  });

  it("returns silver when ARR is below gold but above silver", () => {
    const result = calculateTier({ ...goldInputs, avgArrUsd: 22_000 });
    expect(result.tier).toBe("silver");
  });

  it("returns silver when demos are below gold but above silver", () => {
    const result = calculateTier({ ...goldInputs, avgDemosPw: 3.5 });
    expect(result.tier).toBe("silver");
  });

  it("returns silver when dials are below gold but above silver", () => {
    const result = calculateTier({ ...goldInputs, avgDialsPw: 150 });
    expect(result.tier).toBe("silver");
  });

  it("returns silver when retention is at silver threshold (61%)", () => {
    const result = calculateTier({ ...goldInputs, avgRetentionRate: 65 });
    expect(result.tier).toBe("silver");
  });

  it("returns bronze when retention is below silver threshold", () => {
    const result = calculateTier({ ...goldInputs, avgRetentionRate: 55 });
    expect(result.tier).toBe("bronze");
  });

  it("returns bronze when all criteria are below silver", () => {
    const result = calculateTier({
      avgArrUsd: 5_000,
      avgDemosPw: 1,
      avgDialsPw: 50,
      avgRetentionRate: 50,
      isNewJoiner: false,
      isTeamLeader: false,
    });
    expect(result.tier).toBe("bronze");
  });

  it("all criteria must be met — gold demos but silver ARR = silver", () => {
    const result = calculateTier({ ...goldInputs, avgArrUsd: 20_000, avgDemosPw: 4, avgDialsPw: 200 });
    expect(result.tier).toBe("silver");
  });

  // New Joiner Tests
  it("new joiner can reach gold without ARR criteria", () => {
    const result = calculateTier({
      avgArrUsd: 0,
      avgDemosPw: 4,
      avgDialsPw: 200,
      avgRetentionRate: 0,
      isNewJoiner: true,
      isTeamLeader: false,
    });
    expect(result.tier).toBe("gold");
  });

  it("new joiner still needs activity metrics for gold", () => {
    const result = calculateTier({
      avgArrUsd: 0,
      avgDemosPw: 3, // Only silver level demos
      avgDialsPw: 200,
      avgRetentionRate: 0,
      isNewJoiner: true,
      isTeamLeader: false,
    });
    expect(result.tier).toBe("silver");
  });

  it("new joiner with no activity metrics = bronze", () => {
    const result = calculateTier({
      avgArrUsd: 0,
      avgDemosPw: 0,
      avgDialsPw: 0,
      avgRetentionRate: 0,
      isNewJoiner: true,
      isTeamLeader: false,
    });
    expect(result.tier).toBe("bronze");
  });

  // Team Leader Tests
  it("team leader gold requires halved ARR ($12,500)", () => {
    const result = calculateTier({
      avgArrUsd: 12_500,
      avgDemosPw: 2,
      avgDialsPw: 100,
      avgRetentionRate: 71,
      isNewJoiner: false,
      isTeamLeader: true,
    });
    expect(result.tier).toBe("gold");
  });

  it("team leader silver requires halved ARR ($10,000)", () => {
    const result = calculateTier({
      avgArrUsd: 10_000,
      avgDemosPw: 2,
      avgDialsPw: 50,
      avgRetentionRate: 65,
      isNewJoiner: false,
      isTeamLeader: true,
    });
    expect(result.tier).toBe("silver");
  });

  it("team leader below halved targets = bronze", () => {
    const result = calculateTier({
      avgArrUsd: 8_000,
      avgDemosPw: 1,
      avgDialsPw: 40,
      avgRetentionRate: 50,
      isNewJoiner: false,
      isTeamLeader: true,
    });
    expect(result.tier).toBe("bronze");
  });
});

// ─── Commission Calculation Tests ─────────────────────────────────────────────

describe("calculateCommission", () => {
  const fxRate = 0.79;

  it("annual gold contract: correct commission", () => {
    const result = calculateCommission({
      contractType: "annual",
      arrUsd: 24_000,
      tier: "gold",
      onboardingFeePaid: true,
      isReferral: false,
      fxRateUsdToGbp: fxRate,
    });
    expect(result.rate).toBe(0.19);
    expect(result.payoutSchedule).toHaveLength(1);
    expect(result.totalGrossUsd).toBeCloseTo(24_000 * 0.19);
    expect(result.totalNetGbp).toBeCloseTo(24_000 * 0.19 * fxRate);
  });

  it("monthly silver contract: 13 payouts", () => {
    const result = calculateCommission({
      contractType: "monthly",
      arrUsd: 12_000,
      tier: "silver",
      onboardingFeePaid: true,
      isReferral: false,
      fxRateUsdToGbp: fxRate,
    });
    expect(result.rate).toBe(0.16);
    expect(result.payoutSchedule).toHaveLength(13);
    const monthlyPayout = (12_000 / 12) * 0.16;
    expect(result.payoutSchedule[0].grossCommissionUsd).toBeCloseTo(monthlyPayout);
    expect(result.totalGrossUsd).toBeCloseTo(monthlyPayout * 13);
  });

  it("referral deal: 50% commission reduction", () => {
    const result = calculateCommission({
      contractType: "annual",
      arrUsd: 24_000,
      tier: "gold",
      onboardingFeePaid: true,
      isReferral: true,
      fxRateUsdToGbp: fxRate,
    });
    const gross = 24_000 * 0.19;
    expect(result.payoutSchedule[0].referralDeductionUsd).toBeCloseTo(gross * 0.5);
    expect(result.payoutSchedule[0].netCommissionUsd).toBeCloseTo(gross * 0.5);
  });

  it("missing onboarding fee: ARR reduced by $5k and £500 deducted from first payout", () => {
    const result = calculateCommission({
      contractType: "annual",
      arrUsd: 24_000,
      tier: "gold",
      onboardingFeePaid: false,
      isReferral: false,
      fxRateUsdToGbp: fxRate,
    });
    // Effective ARR = 24000 - 5000 = 19000
    expect(result.effectiveArrUsd).toBe(19_000);
    const grossUsd = 19_000 * 0.19;
    const netGbp = grossUsd * fxRate - 500;
    expect(result.payoutSchedule[0].onboardingDeductionGbp).toBe(500);
    expect(result.payoutSchedule[0].netCommissionGbp).toBeCloseTo(netGbp);
  });

  it("missing onboarding fee on monthly: £500 deducted only on first payout", () => {
    const result = calculateCommission({
      contractType: "monthly",
      arrUsd: 12_000,
      tier: "bronze",
      onboardingFeePaid: false,
      isReferral: false,
      fxRateUsdToGbp: fxRate,
    });
    expect(result.payoutSchedule[0].onboardingDeductionGbp).toBe(500);
    // All subsequent payouts should have no onboarding deduction
    for (let i = 1; i < result.payoutSchedule.length; i++) {
      expect(result.payoutSchedule[i].onboardingDeductionGbp).toBe(0);
    }
  });

  it("bronze rate is 13%", () => {
    expect(TIER_COMMISSION_RATE.bronze).toBe(0.13);
  });

  it("silver rate is 16%", () => {
    expect(TIER_COMMISSION_RATE.silver).toBe(0.16);
  });

  it("gold rate is 19%", () => {
    expect(TIER_COMMISSION_RATE.gold).toBe(0.19);
  });

  it("commission is non-negative even with large deductions", () => {
    const result = calculateCommission({
      contractType: "annual",
      arrUsd: 1_000,
      tier: "bronze",
      onboardingFeePaid: false,
      isReferral: true,
      fxRateUsdToGbp: 0.79,
    });
    for (const p of result.payoutSchedule) {
      expect(p.netCommissionGbp).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Rolling Average Tests ─────────────────────────────────────────────────────

describe("computeRollingAverages", () => {
  it("divides total demos and dials by 12 weeks", () => {
    const months = [
      { year: 2026, month: 1, arrUsd: 50_000, demosTotal: 15, dialsTotal: 435, retentionRate: null },
      { year: 2026, month: 2, arrUsd: 0, demosTotal: 16, dialsTotal: 830, retentionRate: null },
      { year: 2026, month: 3, arrUsd: 10_000, demosTotal: 13, dialsTotal: 590, retentionRate: null },
    ];
    const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(months);
    expect(avgArrUsd).toBeCloseTo((50_000 + 0 + 10_000) / 3);
    expect(avgDemosPw).toBeCloseTo((15 + 16 + 13) / 12);
    expect(avgDialsPw).toBeCloseTo((435 + 830 + 590) / 12);
  });

  it("returns zeros for empty input", () => {
    const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages([]);
    expect(avgArrUsd).toBe(0);
    expect(avgDemosPw).toBe(0);
    expect(avgDialsPw).toBe(0);
  });

  it("matches the Gold example from the commission doc", () => {
    const months = [
      { year: 2026, month: 3, arrUsd: 50_000, demosTotal: 15, dialsTotal: 435, retentionRate: null },
      { year: 2026, month: 4, arrUsd: 0, demosTotal: 16, dialsTotal: 830, retentionRate: null },
      { year: 2026, month: 5, arrUsd: 10_000, demosTotal: 13, dialsTotal: 590, retentionRate: null },
    ];
    const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(months);
    // Doc says: (50+0+10)/3 = 20k ARR, (15+16+13)/12 = 3.67 demos, (435+830+590)/12 = 155 dials
    expect(avgArrUsd).toBeCloseTo(20_000);
    expect(avgDemosPw).toBeCloseTo(3.667, 1);
    expect(avgDialsPw).toBeCloseTo(155, 0);
  });
});

// ─── Retention Average Tests ───────────────────────────────────────────────────

describe("computeAvgRetention", () => {
  it("averages retention over provided months", () => {
    const months = [
      { year: 2026, month: 1, arrUsd: 0, demosTotal: 0, dialsTotal: 0, retentionRate: 70 },
      { year: 2026, month: 2, arrUsd: 0, demosTotal: 0, dialsTotal: 0, retentionRate: 72 },
      { year: 2026, month: 3, arrUsd: 0, demosTotal: 0, dialsTotal: 0, retentionRate: 68 },
    ];
    const avg = computeAvgRetention(months);
    expect(avg).toBeCloseTo((70 + 72 + 68) / 3);
  });

  it("ignores months with null retention", () => {
    const months = [
      { year: 2026, month: 1, arrUsd: 0, demosTotal: 0, dialsTotal: 0, retentionRate: 70 },
      { year: 2026, month: 2, arrUsd: 0, demosTotal: 0, dialsTotal: 0, retentionRate: null },
    ];
    const avg = computeAvgRetention(months);
    expect(avg).toBe(70);
  });

  it("returns 0 for empty input", () => {
    expect(computeAvgRetention([])).toBe(0);
  });
});

// ─── New Joiner Tests ──────────────────────────────────────────────────────────

describe("isNewJoiner", () => {
  it("returns true within first 6 months", () => {
    const joinDate = new Date();
    joinDate.setMonth(joinDate.getMonth() - 3);
    expect(isNewJoiner(joinDate)).toBe(true);
  });

  it("returns false after 6 months", () => {
    const joinDate = new Date();
    joinDate.setMonth(joinDate.getMonth() - 7);
    expect(isNewJoiner(joinDate)).toBe(false);
  });

  it("returns true at exactly 5 months", () => {
    const joinDate = new Date();
    joinDate.setMonth(joinDate.getMonth() - 5);
    expect(isNewJoiner(joinDate)).toBe(true);
  });
});
