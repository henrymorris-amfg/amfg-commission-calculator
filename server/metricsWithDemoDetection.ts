import { getDb } from "./db";
import { duplicateDemoFlags, crmHygieneIssues } from "../drizzle/schema";
import type { DuplicateDemoFlag, CrmHygieneIssue } from "../drizzle/schema";
import { eq, and, gte, lte } from "drizzle-orm";

/**
 * Get valid demo count for 3-month rolling average (excluding duplicates)
 */
export async function getValidDemoCount(
  aeId: number,
  month: number,
  year: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const flaggedDemos = await db
    .select()
    .from(duplicateDemoFlags)
    .where(eq(duplicateDemoFlags.aeId, aeId));

  const hygieneIssues = await db
    .select()
    .from(crmHygieneIssues)
    .where(eq(crmHygieneIssues.aeId, aeId));

  const flaggedActivityIds = new Set([
    ...flaggedDemos.map((f: DuplicateDemoFlag) => f.pipedriveActivityId),
    ...hygieneIssues.map((h: CrmHygieneIssue) => h.pipedriveActivityId),
  ]);

  return flaggedActivityIds.size;
}

/**
 * Get demo metrics breakdown for an AE in a month
 */
export async function getDemoMetricsBreakdown(
  aeId: number,
  month: number,
  year: number
) {
  const db = await getDb();
  if (!db) {
    return {
      flaggedDemos: 0,
      hygieneIssues: 0,
      totalExcluded: 0,
      breakdown: { duplicates: [], hygiene: [] },
    };
  }

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const flaggedDemos = await db
    .select()
    .from(duplicateDemoFlags)
    .where(
      and(
        eq(duplicateDemoFlags.aeId, aeId),
        gte(duplicateDemoFlags.demoDate, startDate),
        lte(duplicateDemoFlags.demoDate, endDate)
      )
    );

  const hygieneIssues = await db
    .select()
    .from(crmHygieneIssues)
    .where(
      and(
        eq(crmHygieneIssues.aeId, aeId),
        gte(crmHygieneIssues.demoDate, startDate),
        lte(crmHygieneIssues.demoDate, endDate)
      )
    );

  return {
    flaggedDemos: flaggedDemos.length,
    hygieneIssues: hygieneIssues.length,
    totalExcluded: flaggedDemos.length + hygieneIssues.length,
    breakdown: {
      duplicates: flaggedDemos.map((f: DuplicateDemoFlag) => ({
        id: f.id,
        organization: f.organizationName,
        demoDate: f.demoDate,
      })),
      hygiene: hygieneIssues.map((h: CrmHygieneIssue) => ({
        id: h.id,
        organization: h.organizationName ?? "",
        issueType: h.issueType,
        demoDate: h.demoDate,
      })),
    },
  };
}

/**
 * Calculate valid demo average for a month with demo detection
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

  const validDemos = Math.max(0, totalDemosInMonth - metrics.totalExcluded);
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
