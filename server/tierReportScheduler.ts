/**
 * Tier Report Scheduler
 * Sends monthly tier reports on the 10th at 9 AM GMT
 */

import * as cron from "node-cron";
import { sendTierReportEmail, calculateTier, getTierRate } from "./tierReportEmailService";
import { getDb } from "./db";
import { AETierData } from "./tierReportEmail";

let scheduledJob: cron.ScheduledTask | null = null;

export function initializeTierReportScheduler(): void {
  if (scheduledJob) {
    console.log("[TierReportScheduler] Scheduler already initialized");
    return;
  }

  // Schedule for 10th of each month at 9 AM GMT
  // Cron format: second minute hour day month dayOfWeek
  // 0 9 10 * * = 9:00 AM on the 10th of every month
  const cronExpression = "0 9 10 * *";

  scheduledJob = cron.schedule(cronExpression, async () => {
    console.log("[TierReportScheduler] Running monthly tier report at", new Date().toISOString());
    await sendMonthlyTierReportJob();
  });

  console.log("[TierReportScheduler] Initialized - will run at 9 AM GMT on the 10th of each month");
}

export function stopTierReportScheduler(): void {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    console.log("[TierReportScheduler] Stopped");
  }
}

async function sendMonthlyTierReportJob(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.error("[TierReportScheduler] Database connection failed");
      return;
    }

    // Get previous month (since we report on the 10th of current month for previous month)
    const now = new Date();
    let reportMonth = now.getMonth(); // 0-11
    let reportYear = now.getFullYear();

    // Convert to 1-12 format
    reportMonth = reportMonth + 1;

    // Calculate previous month
    let previousMonth = reportMonth - 1;
    let previousYear = reportYear;
    if (previousMonth < 1) {
      previousMonth = 12;
      previousYear -= 1;
    }

    console.log(
      `[TierReportScheduler] Generating report for ${previousMonth}/${previousYear}`
    );

    // Get all AEs
    const aeCommissions = await (db as any).query.aeProfiles.findMany({
      columns: {
        id: true,
        name: true,
        tier: true,
      },
    });

    const tierData: AETierData[] = [];

    // Calculate comparison month (month before previous month)
    let comparisonMonth = previousMonth - 1;
    let comparisonYear = previousYear;
    if (comparisonMonth < 1) {
      comparisonMonth = 12;
      comparisonYear -= 1;
    }

    for (const ae of aeCommissions) {
      // Get current month (which is previous month for reporting) commission
      const currentMonthPayouts = await (db as any).query.commissionPayouts.findMany({
        where: (payouts: any, { eq, and }: any) =>
          and(
            eq(payouts.aeId, ae.id),
            eq(payouts.payoutMonth, previousMonth),
            eq(payouts.payoutYear, previousYear)
          ),
      });

      const currentCommission = currentMonthPayouts.reduce(
        (sum: number, p: any) => sum + (p.netCommissionGbp || 0),
        0
      );

      const previousMonthPayouts = await (db as any).query.commissionPayouts.findMany({
        where: (payouts: any, { eq, and }: any) =>
          and(
            eq(payouts.aeId, ae.id),
            eq(payouts.payoutMonth, comparisonMonth),
            eq(payouts.payoutYear, comparisonYear)
          ),
      });

      const previousCommission = previousMonthPayouts.reduce(
        (sum: number, p: any) => sum + (p.netCommissionGbp || 0),
        0
      );

      // Calculate tiers
      const currentTier = calculateTier(currentCommission);
      const previousTier = calculateTier(previousCommission);

      tierData.push({
        id: ae.id,
        name: ae.name,
        currentTier,
        currentRate: getTierRate(currentTier),
        previousTier,
        previousRate: getTierRate(previousTier),
        totalCommissionGbp: currentCommission,
        dealCount: currentMonthPayouts.length,
      });
    }

    // Send email
    const emailSent = await sendTierReportEmail(
      tierData,
      previousMonth,
      previousYear,
      comparisonMonth as number,
      comparisonYear as number
    );

    if (emailSent) {
      console.log(
        `[TierReportScheduler] Successfully sent tier report for ${previousMonth}/${previousYear}`
      );
    } else {
      console.error(
        `[TierReportScheduler] Failed to send tier report for ${previousMonth}/${previousYear}`
      );
    }
  } catch (error) {
    console.error("[TierReportScheduler] Error in sendMonthlyTierReportJob:", error);
  }
}
