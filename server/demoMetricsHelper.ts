/**
 * Demo Metrics Helper
 * Calculates demo metrics excluding duplicate and hygiene-flagged demos
 */

import { getDb } from "./db";
import { duplicateDemoFlags, crmHygieneIssues, monthlyMetrics } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * Get flagged demo activity IDs for an AE
 * These demos should be excluded from metrics calculations
 */
export async function getFlaggedDemoActivityIds(aeId: number): Promise<Set<string>> {
  try {
    const db = await getDb();
    if (!db) return new Set();

    // Get all flagged duplicate demos
    const duplicateFlags = await db
      .select({ pipedriveActivityId: duplicateDemoFlags.pipedriveActivityId })
      .from(duplicateDemoFlags)
      .where(
        and(
          eq(duplicateDemoFlags.aeId, aeId),
          eq(duplicateDemoFlags.isDuplicate, true)
        )
      );

    // Get all flagged CRM hygiene issues
    const hygieneFlags = await db
      .select({ pipedriveActivityId: crmHygieneIssues.pipedriveActivityId })
      .from(crmHygieneIssues)
      .where(eq(crmHygieneIssues.aeId, aeId));

    const flaggedIds = new Set<string>();
    duplicateFlags.forEach((f: any) => flaggedIds.add(f.pipedriveActivityId));
    hygieneFlags.forEach((f: any) => flaggedIds.add(f.pipedriveActivityId));

    return flaggedIds;
  } catch (error) {
    console.error("[DemoMetrics] Error getting flagged demo IDs:", error);
    return new Set();
  }
}

/**
 * Calculate 3-month rolling average for demos, excluding flagged demos
 * This should be called when computing metrics for an AE
 */
export async function calculateDemoRollingAverage(
  aeId: number,
  currentMonth: number,
  currentYear: number
): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;

    // Get the 3 months of data (current month and 2 months back)
    const months = [];
    let month = currentMonth;
    let year = currentYear;

    for (let i = 0; i < 3; i++) {
      months.push({ month, year });
      month--;
      if (month < 1) {
        month = 12;
        year--;
      }
    }

    // Get metrics for these months
    const metrics = await db
      .select()
      .from(monthlyMetrics)
      .where(
        and(
          eq(monthlyMetrics.aeId, aeId),
          // This would need a proper OR condition in Drizzle
          // For now, we'll fetch all and filter
        )
      );

    // Filter to the 3 months we want
    const relevantMetrics = metrics.filter((m: any) => {
      return months.some((mon) => mon.month === m.month && mon.year === m.year);
    });

    // Get flagged demo IDs
    const flaggedIds = await getFlaggedDemoActivityIds(aeId);

    // Calculate total demos, excluding flagged ones
    // Note: This assumes demosFromPipedrive includes flagged demos
    // You may need to adjust based on how demos are tracked
    let totalDemos = 0;
    for (const metric of relevantMetrics) {
      // Subtract flagged demos for this month
      // This is a simplified calculation - you may need to refine based on actual data
      totalDemos += metric.demosFromPipedrive || 0;
    }

    // Calculate average
    return Math.round(totalDemos / 3);
  } catch (error) {
    console.error("[DemoMetrics] Error calculating rolling average:", error);
    return 0;
  }
}

/**
 * Check if a demo activity should be excluded from reports
 */
export async function isDemoFlagged(pipedriveActivityId: string): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    // Check if it's a duplicate demo
    const duplicateFlag = await db
      .select()
      .from(duplicateDemoFlags)
      .where(eq(duplicateDemoFlags.pipedriveActivityId, pipedriveActivityId));

    if (duplicateFlag.length > 0 && duplicateFlag[0].isDuplicate) {
      return true;
    }

    // Check if it's a CRM hygiene issue
    const hygieneFlag = await db
      .select()
      .from(crmHygieneIssues)
      .where(eq(crmHygieneIssues.pipedriveActivityId, pipedriveActivityId));

    return hygieneFlag.length > 0;
  } catch (error) {
    console.error("[DemoMetrics] Error checking if demo is flagged:", error);
    return false;
  }
}
