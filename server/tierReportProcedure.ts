/**
 * tRPC Procedure for Tier Report
 * Generates and sends monthly tier reports
 */

import { z } from "zod";
import { protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { sendTierReportEmail, calculateTier, getTierRate } from "./tierReportEmailService";
import { AETierData } from "./tierReportEmail";

export const sendMonthlyTierReport = protectedProcedure
  .input(
    z.object({
      reportMonth: z.number().min(1).max(12),
      reportYear: z.number().min(2020),
    })
  )
  .mutation(async ({ ctx, input }) => {
    // Only team leaders can send reports
    if (ctx.user.role !== "admin") {
      throw new Error("Only team leaders can send tier reports");
    }

    const { reportMonth, reportYear } = input;

    // Calculate previous month
    let previousMonth = reportMonth - 1;
    let previousYear = reportYear;
    if (previousMonth < 1) {
      previousMonth = 12;
      previousYear -= 1;
    }

    try {
      // Get all AEs with their commission data for the report month
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const aeCommissions = await (db as any).query.aeProfiles.findMany({
        columns: {
          id: true,
          name: true,
          tier: true,
        },
      });

      const tierData: AETierData[] = [];

      for (const ae of aeCommissions) {
        // Get current month commission
        const currentMonthPayouts = await (db as any).query.commissionPayouts.findMany({
          where: (payouts: any, { eq, and }: any) =>
            and(
              eq(payouts.aeId, ae.id),
              eq(payouts.payoutMonth, reportMonth),
              eq(payouts.payoutYear, reportYear)
            ),
        });

        const currentCommission = currentMonthPayouts.reduce(
          (sum: number, p: any) => sum + (p.netCommissionGbp || 0),
          0
        );

        // Get previous month commission
        const previousMonthPayouts = await (db as any).query.commissionPayouts.findMany({
          where: (payouts: any, { eq, and }: any) =>
            and(
              eq(payouts.aeId, ae.id),
              eq(payouts.payoutMonth, previousMonth),
              eq(payouts.payoutYear, previousYear)
            ),
        });

        const previousCommission = previousMonthPayouts.reduce(
          (sum: number, p: any) => sum + (p.netCommissionGbp || 0),
          0
        );

        // Calculate tiers based on commission
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
        reportMonth,
        reportYear,
        previousMonth,
        previousYear
      );

      if (!emailSent) {
        throw new Error("Failed to send tier report email");
      }

      return {
        success: true,
        message: `Tier report sent for ${reportMonth}/${reportYear}`,
        aeCount: tierData.length,
      };
    } catch (error) {
      console.error("[TierReport] Error in sendMonthlyTierReport:", error);
      throw error;
    }
  });
