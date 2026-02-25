/**
 * Grace Period Utility
 * 
 * New AEs receive a 6-month grace period where their ARR is assumed at $25,000/month
 * for tier calculation purposes. This utility helps identify which months are within
 * the grace period vs. actual performance.
 */

const GRACE_PERIOD_MONTHS = 6;
const GRACE_PERIOD_ARR = 25_000;

/**
 * Calculate if a given month is within the grace period
 * @param aeStartDate - Date when AE joined (e.g., "2025-06-01")
 * @param checkYear - Year to check
 * @param checkMonth - Month to check (1-12)
 * @returns true if the month is within grace period, false otherwise
 */
export function isInGracePeriod(
  aeStartDate: Date | string,
  checkYear: number,
  checkMonth: number
): boolean {
  const startDate = typeof aeStartDate === 'string' ? new Date(aeStartDate) : aeStartDate;
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth() + 1; // Convert to 1-12

  // Calculate the month number from start
  const checkMonthNumber = (checkYear - startYear) * 12 + (checkMonth - startMonth);

  // Grace period is months 0-5 (first 6 months)
  return checkMonthNumber >= 0 && checkMonthNumber < GRACE_PERIOD_MONTHS;
}

/**
 * Get grace period end date for an AE
 * @param aeStartDate - Date when AE joined
 * @returns Date when grace period ends
 */
export function getGracePeriodEndDate(aeStartDate: Date | string): Date {
  const startDate = typeof aeStartDate === 'string' ? new Date(aeStartDate) : aeStartDate;
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + GRACE_PERIOD_MONTHS);
  return endDate;
}

/**
 * Get grace period months for an AE
 * @param aeStartDate - Date when AE joined
 * @returns Array of {year, month} objects representing grace period months
 */
export function getGracePeriodMonths(aeStartDate: Date | string): Array<{ year: number; month: number }> {
  const startDate = typeof aeStartDate === 'string' ? new Date(aeStartDate) : aeStartDate;
  const months: Array<{ year: number; month: number }> = [];

  for (let i = 0; i < GRACE_PERIOD_MONTHS; i++) {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + i);
    months.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    });
  }

  return months;
}

/**
 * Get the ARR value to use for tier calculation
 * If month is in grace period, return $25k; otherwise return actual ARR
 * @param actualArr - Actual ARR for the month
 * @param aeStartDate - Date when AE joined
 * @param year - Year of the month
 * @param month - Month (1-12)
 * @returns ARR value to use for tier calculation
 */
export function getArrForTierCalculation(
  actualArr: number,
  aeStartDate: Date | string,
  year: number,
  month: number
): number {
  return isInGracePeriod(aeStartDate, year, month) ? GRACE_PERIOD_ARR : actualArr;
}

/**
 * Format grace period status for display
 * @param aeStartDate - Date when AE joined
 * @param year - Year to check
 * @param month - Month to check (1-12)
 * @returns Human-readable status string
 */
export function getGracePeriodStatus(
  aeStartDate: Date | string,
  year: number,
  month: number
): string {
  if (isInGracePeriod(aeStartDate, year, month)) {
    const startDate = typeof aeStartDate === 'string' ? new Date(aeStartDate) : aeStartDate;
    const startMonth = startDate.getMonth() + 1;
    const startYear = startDate.getFullYear();
    const monthNumber = (year - startYear) * 12 + (month - startMonth);
    return `Grace Period (Month ${monthNumber + 1}/6)`;
  }
  return 'Actual Performance';
}
