/**
 * Tier Forecast Helper
 * Calculates 3-month forward-looking tier projections with actionable targets.
 *
 * Key design:
 * - "actionableTargets" shows the GAP between current metrics and next tier threshold
 *   (not the raw threshold divided by 3), so AEs know exactly what extra effort is needed.
 * - "gapToNextTier" per month shows the remaining gap at that projected point in time.
 * - "alreadyMeets" flags indicate whether the AE is already meeting each criterion.
 */
import { STANDARD_TARGETS, TEAM_LEADER_TARGETS, Tier } from "../shared/commission";

export interface TierForecast {
  currentTier: Tier;
  currentMetrics: {
    arrUsd: number;
    demosPw: number;
    dialsPw: number;
  };
  nextTier: Tier | null; // null if already at gold
  nextTierTargets: {
    arrUsd: number;
    demosPw: number;
    dialsPw: number;
  } | null;
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
    willUpgrade: boolean; // true if this month projects a tier upgrade vs current
  }>;
  /** Actionable targets: what the AE needs to sustain to hit next tier */
  actionableTargets: {
    targetTier: Tier;
    monthsToReach: number;
    /** The next tier's absolute threshold values */
    thresholds: {
      arrUsd: number;
      demosPw: number;
      dialsPw: number;
    };
    /** Extra effort needed per month on top of current performance (0 if already meeting) */
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
  } | null; // null if already at gold
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

  // Determine next tier
  const nextTier: Tier | null = currentTierIndex < 2 ? tierOrder[currentTierIndex + 1] : null;
  const nextTierTargets = nextTier ? targets[nextTier as "silver" | "gold"] : null;

  // Project next 3 months
  const forecastMonths: TierForecast["forecastMonths"] = [];
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

    // Calculate gap to next tier at this projected point
    const projNextTier = projectedTier === "bronze" ? "silver" : projectedTier === "silver" ? "gold" : null;
    const projNextTargets = projNextTier ? targets[projNextTier as "silver" | "gold"] : null;

    forecastMonths.push({
      month: monthName,
      projectedTier,
      projectedMetrics: {
        arrUsd: Math.round(projectedArrUsd),
        demosPw: Math.round(projectedDemosPw * 10) / 10,
        dialsPw: Math.round(projectedDialsPw),
      },
      gapToNextTier: projNextTargets
        ? {
            arrUsd: Math.max(0, Math.round(projNextTargets.arrUsd - projectedArrUsd)),
            demosPw: Math.max(0, Math.round((projNextTargets.demosPw - projectedDemosPw) * 10) / 10),
            dialsPw: Math.max(0, Math.round(projNextTargets.dialsPw - projectedDialsPw)),
          }
        : { arrUsd: 0, demosPw: 0, dialsPw: 0 },
      willUpgrade:
        tierOrder.indexOf(projectedTier) > currentTierIndex,
    });
  }

  // Build actionable targets
  const actionableTargets: TierForecast["actionableTargets"] = nextTierTargets && nextTier
    ? {
        targetTier: nextTier,
        monthsToReach: 3,
        thresholds: {
          arrUsd: nextTierTargets.arrUsd,
          demosPw: nextTierTargets.demosPw,
          dialsPw: nextTierTargets.dialsPw,
        },
        extraNeeded: {
          arrUsd: Math.max(0, Math.round(nextTierTargets.arrUsd - currentMetrics.arrUsd)),
          demosPw: Math.max(0, Math.round((nextTierTargets.demosPw - currentMetrics.demosPw) * 10) / 10),
          dialsPw: Math.max(0, Math.round(nextTierTargets.dialsPw - currentMetrics.dialsPw)),
        },
        alreadyMeets: {
          arr: currentMetrics.arrUsd >= nextTierTargets.arrUsd,
          demos: currentMetrics.demosPw >= nextTierTargets.demosPw,
          dials: currentMetrics.dialsPw >= nextTierTargets.dialsPw,
        },
      }
    : null;

  return {
    currentTier,
    currentMetrics,
    nextTier,
    nextTierTargets: nextTierTargets
      ? {
          arrUsd: nextTierTargets.arrUsd,
          demosPw: nextTierTargets.demosPw,
          dialsPw: nextTierTargets.dialsPw,
        }
      : null,
    forecastMonths,
    actionableTargets,
  };
}

/**
 * Format tier forecast for display (used in notifications/emails)
 */
export function formatTierForecast(forecast: TierForecast): string {
  const lines = [
    `📊 Tier Forecast from ${forecast.currentTier.toUpperCase()}`,
    `Current: $${forecast.currentMetrics.arrUsd.toLocaleString()} ARR | ${forecast.currentMetrics.demosPw.toFixed(1)} demos/wk | ${forecast.currentMetrics.dialsPw} dials/wk`,
    ``,
  ];

  if (forecast.actionableTargets) {
    const at = forecast.actionableTargets;
    lines.push(`🎯 To reach ${at.targetTier.toUpperCase()}:`);
    lines.push(`   Target: $${at.thresholds.arrUsd.toLocaleString()} ARR | ${at.thresholds.demosPw}/wk demos | ${at.thresholds.dialsPw}/wk dials`);
    if (at.extraNeeded.arrUsd > 0) lines.push(`   Need +$${at.extraNeeded.arrUsd.toLocaleString()} more ARR/month`);
    if (at.extraNeeded.demosPw > 0) lines.push(`   Need +${at.extraNeeded.demosPw.toFixed(1)} more demos/week`);
    if (at.extraNeeded.dialsPw > 0) lines.push(`   Need +${at.extraNeeded.dialsPw} more dials/week`);
    if (at.alreadyMeets.arr && at.alreadyMeets.demos && at.alreadyMeets.dials) {
      lines.push(`   ✅ Already meeting all ${at.targetTier.toUpperCase()} targets!`);
    }
    lines.push(``);
  } else {
    lines.push(`🏆 Already at GOLD tier — maximum commission rate!`);
    lines.push(``);
  }

  forecast.forecastMonths.forEach((month) => {
    const upgrade = month.willUpgrade ? " ⬆️" : "";
    lines.push(`${month.month}: ${month.projectedTier.toUpperCase()} tier${upgrade}`);
    if (month.gapToNextTier.arrUsd > 0 || month.gapToNextTier.demosPw > 0 || month.gapToNextTier.dialsPw > 0) {
      lines.push(
        `   Gap: $${month.gapToNextTier.arrUsd.toLocaleString()} ARR | ${month.gapToNextTier.demosPw.toFixed(1)} demos | ${month.gapToNextTier.dialsPw} dials`
      );
    }
  });

  return lines.join("\n");
}
