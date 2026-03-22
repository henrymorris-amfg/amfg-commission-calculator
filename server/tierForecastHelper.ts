/**
 * Tier Forecast Helper — Degrading Forecast
 * Shows what happens to tier if AE does NOTHING for the next 3 months.
 *
 * Key design:
 * - Assumes 0 new deals/activities for the next 3 months
 * - Rolling 3-month window shifts, old high-ARR months roll off
 * - Shows projected tier for each month + exact activities needed to stay at current tier or reach Gold
 */
import { STANDARD_TARGETS, TEAM_LEADER_TARGETS, Tier } from "../shared/commission";

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
  last3MonthsData: Array<{ arrUsd: number; demosTotal: number; dialsTotal: number }>,
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

  // Build a map of all historical data by (year, month)
  // For now, we'll use a simplified approach: assume the oldest month in last3MonthsData will roll off
  const sortedData = [...last3MonthsData].sort((a, b) => {
    // Assuming data is already sorted newest-first, reverse it
    return 0; // Placeholder — in real usage, sort by date
  });

  // For each of the next 3 months, simulate the rolling window
  for (let i = 1; i <= 3; i++) {
    const projectionDate = new Date(now);
    projectionDate.setMonth(projectionDate.getMonth() + i);
    const projectionMonth = projectionDate.getMonth() + 1;
    const projectionYear = projectionDate.getFullYear();
    const monthName = monthNames[projectionDate.getMonth()];

    // Simulate rolling window: remove oldest month, add a new month with 0 metrics
    // For simplicity, we'll just remove the oldest month's contribution and add 0
    let projectedArrUsd = currentMetrics.arrUsd;
    let projectedDemosPw = currentMetrics.demosPw;
    let projectedDialsPw = currentMetrics.dialsPw;

    // If we have 3 months of data, remove the oldest month's contribution
    if (last3MonthsData.length === 3) {
      const oldestMonth = last3MonthsData[2]; // Assuming index 2 is oldest
      const oldestArrUsd = oldestMonth.arrUsd;
      const oldestDemosPw = oldestMonth.demosTotal / 4.33; // Approximate demos per week
      const oldestDialsPw = oldestMonth.dialsTotal / 4.33; // Approximate dials per week

      // Remove oldest month, add new month with 0 metrics
      projectedArrUsd = (projectedArrUsd * 3 - oldestArrUsd) / 2; // 2 months left
      projectedDemosPw = (projectedDemosPw * 3 - oldestDemosPw) / 2;
      projectedDialsPw = (projectedDialsPw * 3 - oldestDialsPw) / 2;
    }

    // Determine projected tier
    let projectedTier: Tier = "bronze";
    const bronzeTargets = { arrUsd: 15000, demosPw: 2, dialsPw: 100, retentionMin: 0 };
    const currentTierTargets = currentTier === "silver" ? targets.silver : currentTier === "gold" ? targets.gold : bronzeTargets;

    if (
      projectedArrUsd >= nextTierTargets.arrUsd &&
      projectedDemosPw >= nextTierTargets.demosPw &&
      projectedDialsPw >= nextTierTargets.dialsPw
    ) {
      projectedTier = nextTier;
    } else if (
      projectedArrUsd >= currentTierTargets.arrUsd &&
      projectedDemosPw >= currentTierTargets.demosPw &&
      projectedDialsPw >= currentTierTargets.dialsPw
    ) {
      projectedTier = currentTier;
    }

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
        dialsPw: Math.round(projectedDialsPw * 100) / 100,
      },
      gapToCurrentTier,
      gapToGold,
    });
  }

  // Calculate actionable targets
  const bronzeTargets = { arrUsd: 15000, demosPw: 2, dialsPw: 100, retentionMin: 0 };
  const currentTierTargets = currentTier === "silver" ? targets.silver : currentTier === "gold" ? targets.gold : bronzeTargets;
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
