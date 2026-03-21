/**
 * Tier Forecast Helper
 * Calculates 3-month forward-looking tier projections with actionable targets
 */

import { STANDARD_TARGETS, TEAM_LEADER_TARGETS, Tier } from "../shared/commission";

export interface TierForecast {
  currentTier: Tier;
  currentMetrics: {
    arrUsd: number;
    demosPw: number;
    dialsPw: number;
  };
  forecastMonths: Array<{
    month: string;
    projectedTier: Tier;
    projectedMetrics: {
      arrUsd: number;
      demosPw: number;
      dialsPw: number;
    };
    gapToNextTier: {
      arrUsd: number;
      demosPw: number;
      dialsPw: number;
    };
  }>;
  actionableTargets: {
    targetTier: Tier;
    monthsToReach: number;
    requiredMetrics: {
      totalArrUsd: number;
      totalDemosPw: number;
      totalDialsPw: number;
      monthlyAverageArrUsd: number;
      monthlyAverageDemosPw: number;
      monthlyAverageDialsPw: number;
    };
  };
}

export function calculateTierForecast(
  currentTier: Tier,
  currentMetrics: { arrUsd: number; demosPw: number; dialsPw: number },
  isTeamLeader: boolean = false,
  historicalGrowthRate: number = 0.05 // 5% default monthly growth
): TierForecast {
  const targets = isTeamLeader ? TEAM_LEADER_TARGETS : STANDARD_TARGETS;
  const tierOrder: Tier[] = ["bronze", "silver", "gold"];
  const currentTierIndex = tierOrder.indexOf(currentTier);

  // Project next 3 months
  const forecastMonths = [];
  let projectedArrUsd = currentMetrics.arrUsd;
  let projectedDemosPw = currentMetrics.demosPw;
  let projectedDialsPw = currentMetrics.dialsPw;

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();

  for (let i = 1; i <= 3; i++) {
    // Apply growth rate
    projectedArrUsd *= 1 + historicalGrowthRate;
    projectedDemosPw *= 1 + historicalGrowthRate;
    projectedDialsPw *= 1 + historicalGrowthRate;

    const forecastMonth = new Date(now);
    forecastMonth.setMonth(forecastMonth.getMonth() + i);
    const monthName = monthNames[forecastMonth.getMonth()];

    // Determine projected tier based on metrics
    let projectedTier: Tier = "bronze";
    if (
      projectedArrUsd >= targets.gold.arrUsd &&
      projectedDemosPw >= targets.gold.demosPw &&
      projectedDialsPw >= targets.gold.dialsPw
    ) {
      projectedTier = "gold";
    } else if (
      projectedArrUsd >= targets.silver.arrUsd &&
      projectedDemosPw >= targets.silver.demosPw &&
      projectedDialsPw >= targets.silver.dialsPw
    ) {
      projectedTier = "silver";
    }

    // Calculate gap to next tier
    const nextTier = projectedTier === "bronze" ? "silver" : projectedTier === "silver" ? "gold" : null;
    const nextTargets = nextTier ? targets[nextTier] : null;

    forecastMonths.push({
      month: monthName,
      projectedTier,
      projectedMetrics: {
        arrUsd: Math.round(projectedArrUsd),
        demosPw: Math.round(projectedDemosPw * 10) / 10,
        dialsPw: Math.round(projectedDialsPw),
      },
      gapToNextTier: nextTargets
        ? {
            arrUsd: Math.max(0, nextTargets.arrUsd - projectedArrUsd),
            demosPw: Math.max(0, nextTargets.demosPw - projectedDemosPw),
            dialsPw: Math.max(0, nextTargets.dialsPw - projectedDialsPw),
          }
        : { arrUsd: 0, demosPw: 0, dialsPw: 0 },
    });
  }

  // Calculate actionable targets for next tier
  const targetTier = currentTierIndex < 2 ? tierOrder[currentTierIndex + 1] : currentTier;
  const targetMetrics = targetTier === "silver" ? targets.silver : targets.gold;

  const totalMonthsToReach = 3;
  const monthlyAverageArrUsd = targetMetrics.arrUsd / totalMonthsToReach;
  const monthlyAverageDemosPw = targetMetrics.demosPw / totalMonthsToReach;
  const monthlyAverageDialsPw = targetMetrics.dialsPw / totalMonthsToReach;

  return {
    currentTier,
    currentMetrics,
    forecastMonths,
    actionableTargets: {
      targetTier,
      monthsToReach: totalMonthsToReach,
      requiredMetrics: {
        totalArrUsd: targetMetrics.arrUsd,
        totalDemosPw: targetMetrics.demosPw,
        totalDialsPw: targetMetrics.dialsPw,
        monthlyAverageArrUsd: Math.round(monthlyAverageArrUsd),
        monthlyAverageDemosPw: Math.round(monthlyAverageDemosPw * 10) / 10,
        monthlyAverageDialsPw: Math.round(monthlyAverageDialsPw),
      },
    },
  };
}

/**
 * Format tier forecast for display
 */
export function formatTierForecast(forecast: TierForecast): string {
  const lines = [
    `📊 Tier Forecast from ${forecast.currentTier.toUpperCase()}`,
    `Current: $${forecast.currentMetrics.arrUsd.toLocaleString()} ARR | ${forecast.currentMetrics.demosPw.toFixed(1)} demos/wk | ${forecast.currentMetrics.dialsPw} dials/wk`,
    ``,
    `🎯 To reach ${forecast.actionableTargets.targetTier.toUpperCase()} in 3 months:`,
    `   • Monthly ARR: $${forecast.actionableTargets.requiredMetrics.monthlyAverageArrUsd.toLocaleString()}`,
    `   • Monthly Demos: ${forecast.actionableTargets.requiredMetrics.monthlyAverageDemosPw.toFixed(1)}/wk`,
    `   • Monthly Dials: ${forecast.actionableTargets.requiredMetrics.monthlyAverageDialsPw}`,
  ];

  forecast.forecastMonths.forEach((month) => {
    lines.push(`\n${month.month}: ${month.projectedTier.toUpperCase()} tier`);
    if (month.gapToNextTier.arrUsd > 0) {
      lines.push(
        `   Gap to next: $${month.gapToNextTier.arrUsd.toLocaleString()} ARR | ${month.gapToNextTier.demosPw.toFixed(1)} demos | ${month.gapToNextTier.dialsPw} dials`
      );
    }
  });

  return lines.join("\n");
}
