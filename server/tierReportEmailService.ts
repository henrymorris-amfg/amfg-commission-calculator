/**
 * Tier Report Email Service
 * Sends tier reports via Manus notification API
 */

import { notifyOwner } from "./_core/notification";
import { generateTierReportHTML, generateTierReportPlainText, AETierData } from "./tierReportEmail";
import { MONTH_NAMES } from "../shared/commission";

export async function sendTierReportEmail(
  aeData: AETierData[],
  reportMonth: number,
  reportYear: number,
  previousMonth: number,
  previousYear: number
): Promise<boolean> {
  try {
    const monthName = MONTH_NAMES[reportMonth - 1];
    const previousMonthName = MONTH_NAMES[previousMonth - 1];

    const subject = `Commission Tier Report - ${monthName} ${reportYear}`;
    const plainTextContent = generateTierReportPlainText(
      aeData,
      reportMonth,
      reportYear,
      previousMonth,
      previousYear
    );

    // Send via Manus notification system
    // This will be sent to the owner (configured in Manus)
    const result = await notifyOwner({
      title: subject,
      content: plainTextContent,
    });

    if (!result) {
      console.error("[TierReport] Failed to send tier report via notifyOwner");
      return false;
    }

    console.log(`[TierReport] Successfully sent tier report for ${monthName} ${reportYear}`);
    return true;
  } catch (error) {
    console.error("[TierReport] Error sending tier report:", error);
    return false;
  }
}

/**
 * Calculate tier for an AE based on average commission
 */
export function calculateTier(avgCommission: number): string {
  if (avgCommission >= 3000) return "gold";
  if (avgCommission >= 2000) return "silver";
  return "bronze";
}

/**
 * Get commission rate for tier
 */
export function getTierRate(tier: string): number {
  const rates: Record<string, number> = {
    bronze: 0.13,
    silver: 0.16,
    gold: 0.19,
  };
  return rates[tier] || 0.13;
}
