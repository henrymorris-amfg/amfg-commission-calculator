/**
 * Tier Forecast Helper — Actionable Month-by-Month Targets
 *
 * For each of the next 3 months, answers:
 *   "What do I need to hit THIS month to maintain/improve my tier?"
 *
 * Key design:
 * - The rolling 3-month average shifts each month: the oldest month drops off,
 *   the new month's activity is added.
 * - For each future month we solve backwards: given the 2 months that will remain
 *   in the window, what does the new month need to contribute so the average
 *   meets the target tier threshold?
 * - "Do nothing" projection is shown alongside the target so the AE can see
 *   the gap clearly.
 */
import {
  STANDARD_TARGETS,
  TEAM_LEADER_TARGETS,
  Tier,
  calculateTier,
  computeRollingAverages,
  MONTH_NAMES,
} from "../shared/commission";

/** @deprecated use MonthTarget instead */
export interface MonthProjection {
  month: string;
  projectedTier: Tier;
  projectedMetrics: { arrUsd: number; demosPw: number; dialsPw: number };
  gapToCurrentTier: { arrUsd: number; demosPw: number; dialsPw: number };
  gapToGold: { arrUsd: number; demosPw: number; dialsPw: number };
}

export interface MonthTarget {
  /** e.g. "May 2026" */
  label: string;
  year: number;
  month: number; // 1-12

  /** What happens if the AE does nothing (0 new activity) */
  doNothing: {
    projectedTier: Tier;
    avgArrUsd: number;
    avgDemosPw: number;
    avgDialsPw: number;
  };

  /** Minimum targets to MAINTAIN current tier this month */
  maintainCurrent: {
    tier: Tier;
    /** Minimum demos to do in this calendar month */
    demosNeeded: number;
    /** Minimum dials to do in this calendar month */
    dialsNeeded: number;
    /** Minimum new ARR to close in this calendar month */
    arrNeeded: number;
    /** Whether each metric is already covered by the rolling window */
    alreadyMet: { demos: boolean; dials: boolean; arr: boolean };
  };

  /** Targets to IMPROVE to the next tier this month (null if already at Gold) */
  improveTo: {
    tier: Tier;
    demosNeeded: number;
    dialsNeeded: number;
    arrNeeded: number;
    alreadyMet: { demos: boolean; dials: boolean; arr: boolean };
  } | null;
}

export interface TierForecast {
  currentTier: Tier;
  currentMetrics: {
    arrUsd: number;
    demosPw: number;
    dialsPw: number;
  };
  forecastMonths: MonthTarget[];
  actionableTargets: {
    targetTier: Tier;
    extraNeeded: { arrUsd: number; demosPw: number; dialsPw: number };
    alreadyMeets: { arr: boolean; demos: boolean; dials: boolean };
  };
}

/** Solve: what does month N need to contribute so the 3-month average meets the threshold? */
function solveNeeded(sumOfOther2: number, targetAvg: number, divisor: number): number {
  return Math.max(0, targetAvg * divisor - sumOfOther2);
}

export function calculateTierForecast(
  currentTier: Tier,
  currentMetrics: { arrUsd: number; demosPw: number; dialsPw: number },
  allMonthsData: Array<{ year: number; month: number; arrUsd: number; demosTotal: number; dialsTotal: number }>,
  isTeamLeader: boolean = false,
  joinDate?: Date | null
): TierForecast {
  const targets = isTeamLeader ? TEAM_LEADER_TARGETS : STANDARD_TARGETS;
  const tierOrder: Tier[] = ["bronze", "silver", "gold"];
  const currentTierIdx = tierOrder.indexOf(currentTier);
  const nextTier: Tier = currentTierIdx < 2 ? tierOrder[currentTierIdx + 1] : "gold";

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Build a fast lookup map
  const monthMap = new Map<string, { arrUsd: number; demosTotal: number; dialsTotal: number }>();
  for (const m of allMonthsData) {
    monthMap.set(`${m.year}-${String(m.month).padStart(2, "0")}`, {
      arrUsd: m.arrUsd, demosTotal: m.demosTotal, dialsTotal: m.dialsTotal,
    });
  }

  /** Get the 3-month window [month-2, month-1, month] for a given target month */
  const getWindow = (year: number, month: number) => {
    const result: Array<{ year: number; month: number; arrUsd: number; demosTotal: number; dialsTotal: number }> = [];
    for (let offset = 2; offset >= 0; offset--) {
      let m = month - offset;
      let y = year;
      while (m < 1) { m += 12; y -= 1; }
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const data = monthMap.get(key) ?? { arrUsd: 0, demosTotal: 0, dialsTotal: 0 };
      result.push({ year: y, month: m, ...data });
    }
    return result;
  };

  const forecastMonths: MonthTarget[] = [];

  for (let i = 1; i <= 3; i++) {
    let projYear = currentYear;
    let projMonth = currentMonth + i;
    if (projMonth > 12) { projMonth -= 12; projYear += 1; }

    const label = `${MONTH_NAMES[projMonth - 1]} ${projYear}`;
    const window = getWindow(projYear, projMonth);
    const other2 = window.slice(0, 2);
    const sumOther2Arr = other2.reduce((s, m) => s + m.arrUsd, 0);
    const sumOther2Demos = other2.reduce((s, m) => s + m.demosTotal, 0);
    const sumOther2Dials = other2.reduce((s, m) => s + m.dialsTotal, 0);

    // "Do nothing" projection: 0 new activity in projMonth
    const doNothingWindow = [...other2, { year: projYear, month: projMonth, arrUsd: 0, demosTotal: 0, dialsTotal: 0 }];
    const doNothingRolling = computeRollingAverages(
      doNothingWindow.map(m => ({ year: m.year, month: m.month, arrUsd: m.arrUsd, demosTotal: m.demosTotal, dialsTotal: m.dialsTotal })),
      joinDate
    );
    const doNothingTierResult = calculateTier({
      avgArrUsd: doNothingRolling.avgArrUsd,
      avgDemosPw: doNothingRolling.avgDemosPw,
      avgDialsPw: doNothingRolling.avgDialsPw,
      avgRetentionRate: null,
      isNewJoiner: false,
      isTeamLeader,
    });

    // Solve for MAINTAIN current tier
    const maintainTierTargets = currentTier === "gold" ? targets.gold : currentTier === "silver" ? targets.silver : null;
    let maintainDemosNeeded = 0;
    let maintainDialsNeeded = 0;
    let maintainArrNeeded = 0;
    if (maintainTierTargets) {
      maintainDemosNeeded = Math.ceil(solveNeeded(sumOther2Demos, maintainTierTargets.demosPw, 12));
      maintainDialsNeeded = Math.ceil(solveNeeded(sumOther2Dials, maintainTierTargets.dialsPw, 12));
      maintainArrNeeded = Math.ceil(solveNeeded(sumOther2Arr, maintainTierTargets.arrUsd, 3));
    }

    // Solve for IMPROVE to next tier
    let improveTo: MonthTarget["improveTo"] = null;
    if (currentTier !== "gold") {
      const improveTierTargets = targets[nextTier as "silver" | "gold"];
      const improveDemosNeeded = Math.ceil(solveNeeded(sumOther2Demos, improveTierTargets.demosPw, 12));
      const improveDialsNeeded = Math.ceil(solveNeeded(sumOther2Dials, improveTierTargets.dialsPw, 12));
      const improveArrNeeded = Math.ceil(solveNeeded(sumOther2Arr, improveTierTargets.arrUsd, 3));
      improveTo = {
        tier: nextTier,
        demosNeeded: improveDemosNeeded,
        dialsNeeded: improveDialsNeeded,
        arrNeeded: improveArrNeeded,
        alreadyMet: {
          demos: improveDemosNeeded === 0,
          dials: improveDialsNeeded === 0,
          arr: improveArrNeeded === 0,
        },
      };
    }

    forecastMonths.push({
      label,
      year: projYear,
      month: projMonth,
      doNothing: {
        projectedTier: doNothingTierResult.tier,
        avgArrUsd: doNothingRolling.avgArrUsd,
        avgDemosPw: doNothingRolling.avgDemosPw,
        avgDialsPw: doNothingRolling.avgDialsPw,
      },
      maintainCurrent: {
        tier: currentTier,
        demosNeeded: maintainDemosNeeded,
        dialsNeeded: maintainDialsNeeded,
        arrNeeded: maintainArrNeeded,
        alreadyMet: {
          demos: maintainDemosNeeded === 0,
          dials: maintainDialsNeeded === 0,
          arr: maintainArrNeeded === 0,
        },
      },
      improveTo,
    });
  }

  // Legacy actionableTargets
  const legacyNextTierTargets = targets[nextTier as "silver" | "gold"];
  const actionableTargets = {
    targetTier: nextTier,
    extraNeeded: {
      arrUsd: Math.max(0, legacyNextTierTargets.arrUsd - currentMetrics.arrUsd),
      demosPw: Math.max(0, legacyNextTierTargets.demosPw - currentMetrics.demosPw),
      dialsPw: Math.max(0, legacyNextTierTargets.dialsPw - currentMetrics.dialsPw),
    },
    alreadyMeets: {
      arr: currentMetrics.arrUsd >= legacyNextTierTargets.arrUsd,
      demos: currentMetrics.demosPw >= legacyNextTierTargets.demosPw,
      dials: currentMetrics.dialsPw >= legacyNextTierTargets.dialsPw,
    },
  };

  return { currentTier, currentMetrics, forecastMonths, actionableTargets };
}


