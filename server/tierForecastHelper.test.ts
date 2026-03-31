import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { calculateTierForecast } from "./tierForecastHelper";

describe("tierForecastHelper", () => {
  beforeEach(() => {
    // Mock current date to March 31, 2026 for consistent testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 31)); // March 31, 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("calculateTierForecast", () => {
    it("should correctly degrade forecast as old high-ARR months roll off", () => {
      // Simulate Toby Greer's data:
      // Jan 2026: $0 ARR
      // Feb 2026: $15,006 ARR
      // Mar 2026: $0 ARR
      // Current 3-month rolling avg: ($0 + $15,006 + $0) / 3 = $5,002
      //
      // Projected months (assuming no new deals):
      // Apr 2026: rolling window Feb/Mar/Apr = ($15,006 + $0 + $0) / 3 = $5,002
      // May 2026: rolling window Mar/Apr/May = ($0 + $0 + $0) / 3 = $0
      // Jun 2026: rolling window Apr/May/Jun = ($0 + $0 + $0) / 3 = $0

      const allMonthsData = [
        { year: 2026, month: 1, arrUsd: 0, demosTotal: 15, dialsTotal: 225 },
        { year: 2026, month: 2, arrUsd: 15006, demosTotal: 9, dialsTotal: 74 },
        { year: 2026, month: 3, arrUsd: 0, demosTotal: 12, dialsTotal: 0 },
        // Projected months (no new deals)
        { year: 2026, month: 4, arrUsd: 0, demosTotal: 0, dialsTotal: 0 },
        { year: 2026, month: 5, arrUsd: 0, demosTotal: 0, dialsTotal: 0 },
        { year: 2026, month: 6, arrUsd: 0, demosTotal: 0, dialsTotal: 0 },
      ];

      const currentMetrics = {
        arrUsd: 5002, // 3-month average of Jan/Feb/Mar
        demosPw: 2.07, // (15 + 9 + 12) / 3 / 4.33
        dialsPw: 77.76, // (225 + 74 + 0) / 3 / 4.33
      };

      const forecast = calculateTierForecast("silver", currentMetrics, allMonthsData, false);

      // Verify the forecast shows degradation
      expect(forecast.forecastMonths).toHaveLength(3);

      // April: Feb/Mar/Apr rolling window = ($15,006 + $0 + $0) / 3 = $5,002
      expect(forecast.forecastMonths[0].month).toBe("Apr");
      expect(forecast.forecastMonths[0].projectedMetrics.arrUsd).toBe(5002);

      // May: Mar/Apr/May rolling window = ($0 + $0 + $0) / 3 = $0
      expect(forecast.forecastMonths[1].month).toBe("May");
      expect(forecast.forecastMonths[1].projectedMetrics.arrUsd).toBe(0);

      // June: Apr/May/Jun rolling window = ($0 + $0 + $0) / 3 = $0
      expect(forecast.forecastMonths[2].month).toBe("Jun");
      expect(forecast.forecastMonths[2].projectedMetrics.arrUsd).toBe(0);

      // Verify that the forecast shows degradation (April > May = June)
      const aprArr = forecast.forecastMonths[0].projectedMetrics.arrUsd;
      const mayArr = forecast.forecastMonths[1].projectedMetrics.arrUsd;
      const junArr = forecast.forecastMonths[2].projectedMetrics.arrUsd;

      expect(aprArr).toBeGreaterThan(mayArr);
      expect(mayArr).toBe(junArr);
    });

    it("should handle months with actual deals correctly", () => {
      // Scenario: AE has deals that span multiple months
      // Include historical months so the rolling window is complete
      // Jan 2026: $20,000 ARR (deal signed earlier, continuing)
      // Feb 2026: $20,000 ARR (deal continues)
      // Mar 2026: $20,000 ARR (deal continues)
      // Apr 2026: $20,000 ARR (deal continues)
      // May 2026: $20,000 ARR (deal continues)
      // Jun 2026: $20,000 ARR (deal continues)

      const allMonthsData = [
        { year: 2026, month: 1, arrUsd: 20000, demosTotal: 10, dialsTotal: 100 },
        { year: 2026, month: 2, arrUsd: 20000, demosTotal: 0, dialsTotal: 0 },
        { year: 2026, month: 3, arrUsd: 20000, demosTotal: 0, dialsTotal: 0 },
        { year: 2026, month: 4, arrUsd: 20000, demosTotal: 0, dialsTotal: 0 },
        { year: 2026, month: 5, arrUsd: 20000, demosTotal: 0, dialsTotal: 0 },
        { year: 2026, month: 6, arrUsd: 20000, demosTotal: 0, dialsTotal: 0 },
      ];

      const currentMetrics = {
        arrUsd: 20000,
        demosPw: 2.31,
        dialsPw: 23.09,
      };

      const forecast = calculateTierForecast("gold", currentMetrics, allMonthsData, false);

      // All months should maintain the same ARR (no degradation)
      // Each rolling window: (20000 + 20000 + 20000) / 3 = 20000
      expect(forecast.forecastMonths[0].projectedMetrics.arrUsd).toBe(20000);
      expect(forecast.forecastMonths[1].projectedMetrics.arrUsd).toBe(20000);
      expect(forecast.forecastMonths[2].projectedMetrics.arrUsd).toBe(20000);
    });

    it("should correctly round dials/week to whole numbers", () => {
      // Build a complete 6-month dataset
      // Jan-Jun 2026: 225, 74, 0, 0, 0, 0 dials
      // Current rolling avg (Jan/Feb/Mar): (225 + 74 + 0) / 3 / 4.33 = 69.05 dials/week
      // Apr rolling window (Feb/Mar/Apr): (74 + 0 + 0) / 3 / 4.33 = 5.7 dials/week
      // May rolling window (Mar/Apr/May): (0 + 0 + 0) / 3 / 4.33 = 0 dials/week

      const allMonthsData = [
        { year: 2026, month: 1, arrUsd: 0, demosTotal: 0, dialsTotal: 225 },
        { year: 2026, month: 2, arrUsd: 0, demosTotal: 0, dialsTotal: 74 },
        { year: 2026, month: 3, arrUsd: 0, demosTotal: 0, dialsTotal: 0 },
        { year: 2026, month: 4, arrUsd: 0, demosTotal: 0, dialsTotal: 0 },
        { year: 2026, month: 5, arrUsd: 0, demosTotal: 0, dialsTotal: 0 },
        { year: 2026, month: 6, arrUsd: 0, demosTotal: 0, dialsTotal: 0 },
      ];

      const currentMetrics = {
        arrUsd: 0,
        demosPw: 0,
        dialsPw: 69.05, // (225 + 74 + 0) / 3 / 4.33
      };

      const forecast = calculateTierForecast("bronze", currentMetrics, allMonthsData, false);

      // April rolling window: (74 + 0 + 0) / 3 / 4.33 = 5.7, rounded to 6
      expect(forecast.forecastMonths[0].projectedMetrics.dialsPw).toBe(6);

      // May and June should show 0 dials/week
      expect(forecast.forecastMonths[1].projectedMetrics.dialsPw).toBe(0);
      expect(forecast.forecastMonths[2].projectedMetrics.dialsPw).toBe(0);
    });
  });
});
