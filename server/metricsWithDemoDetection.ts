import { db } from "./db";
import { duplicate_demo_flags, crm_hygiene_issues } from "../drizzle/schema";
import { eq, and, gte, lte } from "drizzle-orm";

/**
 * Get valid demo count for 3-month rolling average (excluding duplicates)
 * @param aeId - AE ID
 * @param month - Month (1-12)
 * @param year - Year
 * @returns Valid demo count for the month
 */
export async function getValidDemoCount(
  aeId: number,
  month: number,
  year: number
): Promise<number> {
  // Get all flagged demos for this AE
  const flaggedDemos = await db
    .select()
    .from(duplicate_demo_flags)
    .where(eq(duplicate_demo_flags.bookedByAeId, aeId));

  // Get all hygiene issues for this AE
  const hygieneIssues = await db
    .select()
    .from(crm_hygiene_issues)
    .where(eq(crm_hygiene_issues.aeId, aeId));

  // Combine flagged demo IDs and hygiene issue IDs
  const flaggedActivityIds = new Set([
    ...flaggedDemos.map((f) => f.activityId),
    ...hygieneIssues.map((h) => h.activityId),
  ]);

  // Get total demos for the month from monthly_metrics
  // This would need to be fetched from your metrics source
  // For now, return a placeholder that indicates flagged demos should be excluded
  return flaggedActivityIds.size;
}

/**
 * Get demo metrics breakdown for an AE in a month
 * @param aeId - AE ID
 * @param month - Month (1-12)
 * @param year - Year
 * @returns { totalDemos, validDemos, flaggedDemos, hygieneIssues }
 */
export async function getDemoMetricsBreakdown(
  aeId: number,
  month: number,
  year: number
) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  // Get flagged demos for this month
  const flaggedDemos = await db
    .select()
    .from(duplicate_demo_flags)
    .where(
      and(
        eq(duplicate_demo_flags.bookedByAeId, aeId),
        gte(duplicate_demo_flags.bookedDate, startDate),
        lte(duplicate_demo_flags.bookedDate, endDate)
      )
    );

  // Get hygiene issues for this month
  const hygieneIssues = await db
    .select()
    .from(crm_hygiene_issues)
    .where(
      and(
        eq(crm_hygiene_issues.aeId, aeId),
        gte(crm_hygiene_issues.bookedDate, startDate),
        lte(crm_hygiene_issues.bookedDate, endDate)
      )
    );

  // Get total demos from metrics (would need to fetch from actual source)
  // For now, return the breakdown
  return {
    flaggedDemos: flaggedDemos.length,
    hygieneIssues: hygieneIssues.length,
    totalExcluded: flaggedDemos.length + hygieneIssues.length,
    breakdown: {
      duplicates: flaggedDemos.map((f) => ({
        id: f.id,
        organization: f.organizationName,
        bookedDate: f.bookedDate,
      })),
      hygiene: hygieneIssues.map((h) => ({
        id: h.id,
        ae: h.aeName,
        organization: h.organizationName,
        issueType: h.issueType,
        bookedDate: h.bookedDate,
      })),
    },
  };
}

/**
 * Calculate 3-month rolling average with demo detection
 * @param aeId - AE ID
 * @param currentMonth - Current month (1-12)
 * @param currentYear - Current year
 * @param totalDemosInMonth - Total demos booked in the month
 * @returns { totalDemos, validDemos, excludedDemos, percentage }
 */
export async function calculateValidDemoAverage(
  aeId: number,
  currentMonth: number,
  currentYear: number,
  totalDemosInMonth: number
) {
  const metrics = await getDemoMetricsBreakdown(
    aeId,
    currentMonth,
    currentYear
  );

  const validDemos = totalDemosInMonth - metrics.totalExcluded;
  const percentage =
    totalDemosInMonth > 0
      ? Math.round((validDemos / totalDemosInMonth) * 100)
      : 100;

  return {
    totalDemos: totalDemosInMonth,
    validDemos,
    excludedDemos: metrics.totalExcluded,
    percentage,
    breakdown: metrics.breakdown,
  };
}
