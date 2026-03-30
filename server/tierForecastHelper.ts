/**
 * Tier Forecast Helper — Degrading Forecast
 * Shows what happens to tier if AE does NOTHING for the next 3 months.
 *
 * Key design:
 * - Assumes 0 new deals/activities for the next 3 months
 * - Rolling 3-month window shifts, old high-ARR months roll off
 * - Shows projected tier for each month + exact activities needed to stay at current tier or reach Gold
 */
import { STANDARD_TARGETS, TEAM_LEADER_TARGETS, Tier, calculateTier } from "../shared/commission";

export interface MonthProjection {
  month: string; // "April", "May", "June"
  projectedTier: Tier;
  projectedMetrics: {
    arrUsd: number;
    demosPw: number;
    dialsPw: number;
  };
  gapToCurrentTier: {
    arrUsd: number;
    demosPw: number;
    dialsPw: number;
  };
  gapToGold: {
    arrUsd: number;
    demosPw: number;
    dialsPw: number;
  };
}

export interface TierForecast {
  currentTier: Tier;
  currentMetrics: {
    arrUsd: number;
    demosPw: number;
    dialsPw: number;
  };
  weeksLeftInQuarter: number;
  forecastMonths: MonthProjection[];
  /** What the AE needs to do to stay at current tier or reach Gold */
  actionableTargets: {
    targetTier: Tier;
    /** Extra effort needed per month on top of current performance */
    extraNeeded: {
      arrUsd: number;
      demosPw: number;
      dialsPw: number;
    };
    /** Whether the AE is already meeting each threshold */
    alreadyMeets: {
      arr: boolean;
      demos: boolean;
      dials: boolean;
    };
  };
}

export function calculateTierForecast(
  currentTier: Tier,
  currentMetrics: { arrUsd: number; demosPw: number; dialsPw: number },
  allMonthsData: Array<{ year: number; month: number; arrUsd: number; demosTotal: number; dialsTotal: number }>,
  isTeamLeader: boolean = false
): TierForecast {
  const targets = isTeamLeader ? TEAM_LEADER_TARGETS : STANDARD_TARGETS;
  const tierOrder: Tier[] = ["bronze", "silver", "gold"];
  const currentTierIndex = tierOrder.indexOf(currentTier);

  // Determine next tier
  const nextTier: Tier = currentTierIndex < 2 ? tierOrder[currentTierIndex + 1] : "gold";
  const nextTierTargets = targets[nextTier as "silver" | "gold"];

  // Calculate weeks left in quarter
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();
  const quarterStart = Math.floor((currentMonth - 1) / 3) * 3 + 1; // 1, 4, 7, 10
  const quarterEnd = quarterStart + 2;
  const daysLeftInQuarter = new Date(currentYear, quarterEnd, 0).getDate() - now.getDate();
  const weeksLeftInQuarter = Math.ceil(daysLeftInQuarter / 7);

  // Project next 3 months with degrading metrics (0% growth, just rolling window)
  const forecastMonths: MonthProjection[] = [];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Create a map of (year, month) -> metrics for fast lookup
  const monthMap = new Map<string, { arrUsd: number; demosTotal: number; dialsTotal: number }>();
  for (const m of allMonthsData) {
    const key = `${m.year}-${String(m.month).padStart(2, "0")}`;
    monthMap.set(key, { arrUsd: m.arrUsd, demosTotal: m.demosTotal, dialsTotal: m.dialsTotal });
  }


  // Helper: get the 3-month rolling window ending in a given month
  const getRollingWindow = (
    year: number,
    month: number
  ): { arrUsd: number; demosTotal: number; dialsTotal: number }[] => {
    const window = [];
    for (let i = 2; i >= 0; i--) {
      let y = year;
      let m = month - i;
      while (m < 1) {
        m += 12;
        y -= 1;
      }
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const data = monthMap.get(key) || { arrUsd: 0, demosTotal: 0, dialsTotal: 0 };
      window.push(data);
    }
    return window;
  };

  // For each of the next 3 months, calculate the rolling window and projected tier
  for (let i = 1; i <= 3; i++) {
    const projectionDate = new Date(now);
    projectionDate.setMonth(projectionDate.getMonth() + i);
    const projectionMonth = projectionDate.getMonth() + 1;
    const projectionYear = projectionDate.getFullYear();
    const monthName = monthNames[projectionDate.getMonth()];

    // Get the 3-month rolling window ending in this projection month
    const window = getRollingWindow(projectionYear, projectionMonth);


    // Calculate rolling averages from the window
    const totalArr = window.reduce((sum, m) => sum + m.arrUsd, 0);
    const totalDemos = window.reduce((sum, m) => sum + m.demosTotal, 0);
    const totalDials = window.reduce((sum, m) => sum + m.dialsTotal, 0);


    const projectedArrUsd = totalArr / 3;
    const projectedDemosPw = totalDemos / (3 * 4.33); // Demos per week over 3-month period
    const projectedDialsPw = totalDials / (3 * 4.33); // Dials per week over 3-month period

    // Determine projected tier using the same logic as calculateTier
    const tierResult = calculateTier({
      avgArrUsd: projectedArrUsd,
      avgDemosPw: projectedDemosPw,
      avgDialsPw: projectedDialsPw,
      avgRetentionRate: null,
      isNewJoiner: false,
      isTeamLeader,
    });
    const projectedTier = tierResult.tier;

    // Get the targets for the current tier (for gap calculation)
    const bronzeTargets = { arrUsd: 15000, demosPw: 2, dialsPw: 100, retentionMin: 0 };
    const currentTierTargets =
      currentTier === "silver" ? targets.silver : currentTier === "gold" ? targets.gold : bronzeTargets;

    // Calculate gaps
    const gapToCurrentTier = {
      arrUsd: Math.max(0, currentTierTargets.arrUsd - projectedArrUsd),
      demosPw: Math.max(0, currentTierTargets.demosPw - projectedDemosPw),
      dialsPw: Math.max(0, currentTierTargets.dialsPw - projectedDialsPw),
    };

    const gapToGold = {
      arrUsd: Math.max(0, targets.gold.arrUsd - projectedArrUsd),
      demosPw: Math.max(0, targets.gold.demosPw - projectedDemosPw),
      dialsPw: Math.max(0, targets.gold.dialsPw - projectedDialsPw),
    };

    forecastMonths.push({
      month: monthName,
      projectedTier,
      projectedMetrics: {
        arrUsd: Math.round(projectedArrUsd),
        demosPw: Math.round(projectedDemosPw * 100) / 100,
        dialsPw: Math.round(projectedDialsPw),
      },
      gapToCurrentTier,
      gapToGold,
    });
  }

  // Calculate actionable targets
  const bronzeTargets = { arrUsd: 15000, demosPw: 2, dialsPw: 100, retentionMin: 0 };
  const currentTierTargets =
    currentTier === "silver" ? targets.silver : currentTier === "gold" ? targets.gold : bronzeTargets;
  const actionableTargets = {
    targetTier: nextTier,
    extraNeeded: {
      arrUsd: Math.max(0, nextTierTargets.arrUsd - currentMetrics.arrUsd),
      demosPw: Math.max(0, nextTierTargets.demosPw - currentMetrics.demosPw),
      dialsPw: Math.max(0, nextTierTargets.dialsPw - currentMetrics.dialsPw),
    },
    alreadyMeets: {
      arr: currentMetrics.arrUsd >= nextTierTargets.arrUsd,
      demos: currentMetrics.demosPw >= nextTierTargets.demosPw,
      dials: currentMetrics.dialsPw >= nextTierTargets.dialsPw,
    },
  };

  return {
    currentTier,
    currentMetrics,
    weeksLeftInQuarter,
    forecastMonths,
    actionableTargets,
  };
}
