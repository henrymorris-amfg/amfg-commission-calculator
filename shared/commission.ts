// ─── Commission Tier Constants ────────────────────────────────────────────────

export type Tier = "bronze" | "silver" | "gold";

export const TIER_COMMISSION_RATE: Record<Tier, number> = {
  bronze: 0.13,
  silver: 0.16,
  gold: 0.19,
};

// Standard targets (non-team-leader)
export const STANDARD_TARGETS = {
  silver: { arrUsd: 20_000, demosPw: 3, dialsPw: 100, retentionMin: 61 },
  gold: { arrUsd: 25_000, demosPw: 4, dialsPw: 200, retentionMin: 71 },
};

// Team leader targets (halved, rounded up)
export const TEAM_LEADER_TARGETS = {
  silver: { arrUsd: 10_000, demosPw: 2, dialsPw: 50, retentionMin: 61 },
  gold: { arrUsd: 12_500, demosPw: 2, dialsPw: 100, retentionMin: 71 },
};

// Retention rate thresholds
export const RETENTION_BRONZE_MAX = 60; // <60% = bronze
export const RETENTION_SILVER_MIN = 61; // 61-70% = silver eligible
export const RETENTION_GOLD_MIN = 71;   // 71%+ = gold eligible

// Payout rules
export const MONTHLY_CONTRACT_PAYOUT_MONTHS = 12;
export const ANNUAL_CONTRACT_PAYOUT_MONTHS = 1; // paid upfront in full

// Deductions
export const ONBOARDING_DEDUCTION_GBP = 500;
export const ONBOARDING_MIN_FEE_USD = 1000;

// New joiner grace period
export const NEW_JOINER_GRACE_MONTHS = 6;

// ─── Tier Calculation ─────────────────────────────────────────────────────────

export interface TierInputs {
  // 3-month rolling averages
  avgArrUsd: number;       // monthly average ARR over last 3 months
  avgDemosPw: number;      // demos done per week (total last 3 months / 12)
  avgDialsPw: number;      // dials per week (total last 3 months / 12)
  // 6-month average retention rate — null means no data yet (check is skipped)
  avgRetentionRate: number | null;
  // Profile flags
  isNewJoiner: boolean;    // within first 6 months
  isTeamLeader: boolean;
}

export interface TierResult {
  tier: Tier;
  reasons: string[];
  meetsArr: boolean;
  meetsDemos: boolean;
  meetsDials: boolean;
  meetsRetention: boolean;
  targets: typeof STANDARD_TARGETS.gold;
}

export function calculateTier(inputs: TierInputs): TierResult {
  const targets = inputs.isTeamLeader ? TEAM_LEADER_TARGETS : STANDARD_TARGETS;

  // Retention check is skipped (passes automatically) when no data is available
  const retentionAvailable = inputs.avgRetentionRate != null;

  // Check each criterion at gold level
  // New joiners get $25k ARR counted per month (grace period) - they only need to hit dials/demos targets
  const meetsArrGold = inputs.isNewJoiner || inputs.avgArrUsd >= targets.gold.arrUsd;
  const meetsDemosGold = inputs.avgDemosPw >= targets.gold.demosPw;
  const meetsDialsGold = inputs.avgDialsPw >= targets.gold.dialsPw;
  const meetsRetentionGold =
    !retentionAvailable || inputs.isNewJoiner || (inputs.avgRetentionRate ?? 0) >= RETENTION_GOLD_MIN;

  // Check each criterion at silver level
  // New joiners with $25k ARR can also qualify for silver if they hit silver dials/demos targets
  const meetsArrSilver = inputs.isNewJoiner || inputs.avgArrUsd >= targets.silver.arrUsd;
  const meetsDemosSilver = inputs.avgDemosPw >= targets.silver.demosPw;
  const meetsDialsSilver = inputs.avgDialsPw >= targets.silver.dialsPw;
  const meetsRetentionSilver =
    !retentionAvailable || inputs.isNewJoiner || (inputs.avgRetentionRate ?? 0) >= RETENTION_SILVER_MIN;

  const reasons: string[] = [];

  if (meetsArrGold && meetsDemosGold && meetsDialsGold && meetsRetentionGold) {
    return {
      tier: "gold",
      reasons,
      meetsArr: meetsArrGold,
      meetsDemos: meetsDemosGold,
      meetsDials: meetsDialsGold,
      meetsRetention: meetsRetentionGold,
      targets: targets.gold,
    };
  }

  if (!meetsArrGold) reasons.push(`ARR $${inputs.avgArrUsd.toFixed(0)} below Gold target $${targets.gold.arrUsd.toLocaleString()}`);
  if (!meetsDemosGold) reasons.push(`Demos ${inputs.avgDemosPw.toFixed(1)}/wk below Gold target ${targets.gold.demosPw}/wk`);
  if (!meetsDialsGold) reasons.push(`Dials ${inputs.avgDialsPw.toFixed(0)}/wk below Gold target ${targets.gold.dialsPw}/wk`);
  if (!meetsRetentionGold && retentionAvailable) reasons.push(`Retention ${(inputs.avgRetentionRate ?? 0).toFixed(1)}% below Gold target ${RETENTION_GOLD_MIN}%`);

  if (meetsArrSilver && meetsDemosSilver && meetsDialsSilver && meetsRetentionSilver) {
    return {
      tier: "silver",
      reasons,
      meetsArr: meetsArrSilver,
      meetsDemos: meetsDemosSilver,
      meetsDials: meetsDialsSilver,
      meetsRetention: meetsRetentionSilver,
      targets: targets.silver,
    };
  }

  if (!meetsArrSilver) reasons.push(`ARR $${inputs.avgArrUsd.toFixed(0)} below Silver target $${targets.silver.arrUsd.toLocaleString()}`);
  if (!meetsDemosSilver) reasons.push(`Demos ${inputs.avgDemosPw.toFixed(1)}/wk below Silver target ${targets.silver.demosPw}/wk`);
  if (!meetsDialsSilver) reasons.push(`Dials ${inputs.avgDialsPw.toFixed(0)}/wk below Silver target ${targets.silver.dialsPw}/wk`);
  if (!meetsRetentionSilver && retentionAvailable) reasons.push(`Retention ${(inputs.avgRetentionRate ?? 0).toFixed(1)}% below Silver target ${RETENTION_SILVER_MIN}%`);

  return {
    tier: "bronze",
    reasons,
    meetsArr: meetsArrSilver,
    meetsDemos: meetsDemosSilver,
    meetsDials: meetsDialsSilver,
    meetsRetention: meetsRetentionSilver,
    targets: targets.silver,
  };
}

// ─── Rolling Average Helpers ──────────────────────────────────────────────────

export interface MonthData {
  year: number;
  month: number; // 1–12
  arrUsd: number;
  demosTotal: number;
  dialsTotal: number;
  retentionRate?: number | null;
}

/**
 * Compute the number of weeks an AE has been active across the given months.
 * For the first (oldest) month, only count weeks from the join date onwards.
 * Subsequent months count as full 4-week months.
 * Result is capped at 12 weeks (3 full months).
 */
export function computeActiveWeeks(
  months: MonthData[],
  joinDate: Date | null
): number {
  if (months.length === 0) return 12;
  if (!joinDate) return Math.min(months.length * 4, 12);

  // Sort ascending so oldest month is first
  const sorted = [...months].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );

  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const MS_PER_WEEK = 7 * MS_PER_DAY;

  // Compute the span from the effective start to the end of the last month
  const firstMonth = sorted[0];
  const lastMonth = sorted[sorted.length - 1];

  // Effective start: whichever is later — join date or start of first month
  const firstMonthStart = new Date(firstMonth.year, firstMonth.month - 1, 1);
  const effectiveStart = joinDate > firstMonthStart ? joinDate : firstMonthStart;

  // Effective end: last day of the last month in the range
  const lastMonthEnd = new Date(lastMonth.year, lastMonth.month, 0, 23, 59, 59, 999);

  const totalWeeks = Math.max(0.5, (lastMonthEnd.getTime() - effectiveStart.getTime()) / MS_PER_WEEK);

  return Math.min(totalWeeks, 12); // cap at 12 weeks (3 months)
}

/**
 * Compute 3-month rolling averages for ARR, demos pw, dials pw.
 * For new starters (< 3 months tenure): divide by actual weeks worked since join date.
 * For established AEs (>= 3 months tenure): divide by 12 weeks (standard 3-month average).
 * Pass joinDate to correctly prorate the first partial month for new joiners.
 */
export function computeRollingAverages(
  last3Months: MonthData[],
  joinDate?: Date | null
): {
  avgArrUsd: number;
  avgDemosPw: number;
  avgDialsPw: number;
} {
  if (last3Months.length === 0) {
    return { avgArrUsd: 0, avgDemosPw: 0, avgDialsPw: 0 };
  }

  // Exclude months that are entirely before the join date from the ARR divisor.
  // This prevents new joiners' ARR average being diluted by empty pre-join months
  // that fall within the rolling window (e.g. AE joined March 16, Feb is in prev-3 but empty).
  const activeMths = joinDate
    ? last3Months.filter((m) => {
        // A month is "active" if its last day is on or after the join date
        const monthEnd = new Date(m.year, m.month, 0); // last day of month
        return monthEnd >= joinDate;
      })
    : last3Months;
  const activeN = activeMths.length > 0 ? activeMths.length : last3Months.length;

  const totalArr = last3Months.reduce((s, m) => s + m.arrUsd, 0);
  const totalDemos = last3Months.reduce((s, m) => s + m.demosTotal, 0);
  const totalDials = last3Months.reduce((s, m) => s + m.dialsTotal, 0);
  const n = last3Months.length;

  // Use activeN (post-join months only) to decide whether to use exact weeks.
  // This prevents pre-join empty months (e.g. Jan/Feb for someone who joined March 16)
  // from inflating the divisor: if activeN < 3, we use actual weeks worked, not 12.
  let weeks = 12; // default for 3 full months of data
  if (joinDate != null && activeN < 3) {
    // New starter with fewer than 3 active months: use exact weeks worked since join date
    weeks = computeActiveWeeks(activeMths.length > 0 ? activeMths : last3Months, joinDate);
  } else if (joinDate != null && activeN >= 3) {
    // Established AE with 3+ active months: use standard 12 weeks
    weeks = 12;
  } else if (joinDate == null) {
    // No join date provided: default to n * 4 weeks, capped at 12
    weeks = Math.min(n * 4, 12);
  }
  
  return {
    // Divide ARR by active months only (months on/after join date) to avoid dilution
    avgArrUsd: totalArr / activeN,
    avgDemosPw: totalDemos / weeks,
    avgDialsPw: totalDials / weeks,
  };
}

/**
 * Compute 6-month average retention rate.
 * Returns null when no retention data is available (check will be skipped in tier calculation).
 */
export function computeAvgRetention(last6Months: MonthData[]): number | null {
  const withRetention = last6Months.filter((m) => m.retentionRate != null);
  if (withRetention.length === 0) return null;
  const total = withRetention.reduce((s, m) => s + (m.retentionRate ?? 0), 0);
  return total / withRetention.length;
}

// ─── Commission Calculation ───────────────────────────────────────────────────

export interface CommissionInput {
  contractType: "annual" | "monthly";
  arrUsd: number;
  tier: Tier;
  onboardingFeePaid: boolean;
  isReferral: boolean;
  fxRateUsdToGbp: number; // e.g. 0.79 means 1 USD = 0.79 GBP
  // Optional overrides from versioned commission structure
  monthlyPayoutMonths?: number;         // default: MONTHLY_CONTRACT_PAYOUT_MONTHS
  onboardingDeductionGbp?: number;      // default: ONBOARDING_DEDUCTION_GBP
  onboardingArrReductionUsd?: number;   // default: 5000
}

export interface PayoutScheduleItem {
  payoutNumber: number; // 1-based
  grossCommissionUsd: number;
  referralDeductionUsd: number;
  onboardingDeductionGbp: number;
  netCommissionUsd: number;
  netCommissionGbp: number;
}

export interface CommissionResult {
  tier: Tier;
  rate: number;
  payoutSchedule: PayoutScheduleItem[];
  totalGrossUsd: number;
  totalNetUsd: number;
  totalNetGbp: number;
  effectiveArrUsd: number; // ARR after onboarding deduction if applicable
}

export function calculateCommission(input: CommissionInput): CommissionResult {
  const rate = TIER_COMMISSION_RATE[input.tier];

  // Use versioned overrides if provided, otherwise fall back to constants
  const arrReductionUsd = input.onboardingArrReductionUsd ?? 5_000;
  const deductionGbp = input.onboardingDeductionGbp ?? ONBOARDING_DEDUCTION_GBP;
  const payoutMonths = input.monthlyPayoutMonths ?? MONTHLY_CONTRACT_PAYOUT_MONTHS;

  // If onboarding fee not paid, ARR is reduced for commission calculation
  const effectiveArrUsd = input.onboardingFeePaid
    ? input.arrUsd
    : Math.max(0, input.arrUsd - arrReductionUsd);

  const numPayouts =
    input.contractType === "annual"
      ? ANNUAL_CONTRACT_PAYOUT_MONTHS
      : payoutMonths;

  // For annual: full year ARR paid upfront in one payout
  // For monthly: monthly ARR (annual / 12) paid each month for 13 months
  const payoutAmountUsd =
    input.contractType === "annual"
      ? effectiveArrUsd * rate
      : (effectiveArrUsd / 12) * rate;

  const payoutSchedule: PayoutScheduleItem[] = [];

  for (let i = 1; i <= numPayouts; i++) {
    const grossCommissionUsd = payoutAmountUsd;

    // Referral: 50% reduction on commission
    const referralDeductionUsd = input.isReferral ? grossCommissionUsd * 0.5 : 0;

    // Onboarding deduction: on first payout only (uses versioned amount)
    const onboardingDeductionGbp =
      !input.onboardingFeePaid && i === 1 ? deductionGbp : 0;

    const netCommissionUsd = grossCommissionUsd - referralDeductionUsd;
    const netCommissionGbp =
      netCommissionUsd * input.fxRateUsdToGbp - onboardingDeductionGbp;

    payoutSchedule.push({
      payoutNumber: i,
      grossCommissionUsd,
      referralDeductionUsd,
      onboardingDeductionGbp,
      netCommissionUsd,
      netCommissionGbp: Math.max(0, netCommissionGbp),
    });
  }

  const totalGrossUsd = payoutSchedule.reduce((s, p) => s + p.grossCommissionUsd, 0);
  const totalNetUsd = payoutSchedule.reduce((s, p) => s + p.netCommissionUsd, 0);
  const totalNetGbp = payoutSchedule.reduce((s, p) => s + p.netCommissionGbp, 0);

  return {
    tier: input.tier,
    rate,
    payoutSchedule,
    totalGrossUsd,
    totalNetUsd,
    totalNetGbp,
    effectiveArrUsd,
  };
}

// ─── New Joiner Check ─────────────────────────────────────────────────────────

export function isNewJoiner(joinDate: Date, forDate: Date = new Date()): boolean {
  const diffMs = forDate.getTime() - joinDate.getTime();
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.44);
  return diffMonths < NEW_JOINER_GRACE_MONTHS;
}

// ─── Month helpers ────────────────────────────────────────────────────────────

export function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + n, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
