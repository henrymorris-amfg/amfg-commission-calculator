import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { MONTH_NAMES } from "../../../shared/commission";
import {
  TrendingUp,
  Calendar,
  Medal,
  Target,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const TIER_COLORS = {
  bronze: "oklch(0.65 0.12 55)",
  silver: "oklch(0.82 0.02 250)",
  gold: "oklch(0.88 0.14 75)",
};

const TIER_RATES = {
  bronze: 0.13,
  silver: 0.16,
  gold: 0.19,
};

function fmt(gbp: number) {
  return `£${gbp.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CommissionForecastPage() {
  const [, navigate] = useLocation();
  const { ae, isLoading } = useAeAuth();
  const [forecastMonths, setForecastMonths] = useState(6);

  // Get current payouts to calculate forecast
  const { data: payoutData, isLoading: payoutLoading } = trpc.commission.payoutCalendar.useQuery(
    undefined,
    { enabled: !!ae }
  );

  useEffect(() => {
    if (!isLoading && !ae) navigate("/");
  }, [ae, isLoading, navigate]);

  if (isLoading || !ae) return null;

  // Calculate forecast based on current deals
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const forecastData: Array<{
    month: number;
    year: number;
    monthName: string;
    projectedCommission: number;
    projectedTier: string;
    dealCount: number;
  }> = [];

  if (payoutData?.months) {
    for (let i = 0; i < forecastMonths; i++) {
      let month = currentMonth + i;
      let year = currentYear;

      while (month > 12) {
        month -= 12;
        year += 1;
      }

      const monthData = payoutData.months.find(
        (m) => m.year === year && m.month === month
      );

      if (monthData) {
        forecastData.push({
          month,
          year,
          monthName: MONTH_NAMES[month - 1],
          projectedCommission: monthData.totalGbp,
          projectedTier: monthData.status === "current" ? "current" : monthData.status === "future" ? "projected" : "past",
          dealCount: monthData.payouts.length,
        });
      }
    }
  }

  // Calculate tier progression
  const avgCommission = forecastData.length > 0
    ? forecastData.reduce((sum, m) => sum + m.projectedCommission, 0) / forecastData.length
    : 0;

  let projectedTier = "bronze";
  if (avgCommission > 3000) projectedTier = "gold";
  else if (avgCommission > 2000) projectedTier = "silver";

  const currentTier = "bronze"; // tier is computed server-side from rolling averages
  const tierProgression = currentTier === "bronze" ? 1 : currentTier === "silver" ? 2 : 3;
  const projectedTierLevel = projectedTier === "bronze" ? 1 : projectedTier === "silver" ? 2 : 3;

  return (
    <AppLayout>
      <div className="p-4 sm:p-8 pb-24 md:pb-8 space-y-6 max-w-6xl">
        {/* Header */}
        <div>
          <p className="text-muted-foreground text-sm mb-1 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Earnings Projection
          </p>
          <h1 className="text-3xl sm:text-4xl text-foreground">Commission Forecast</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Projected earnings for the next {forecastMonths} months based on your current deals.
          </p>
        </div>

        {/* Tier Projection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border border-border rounded-lg p-6 bg-card">
            <div className="space-y-4">
              <div>
                <p className="text-muted-foreground text-sm mb-2">Current Tier</p>
                <div className="flex items-center gap-3">
                  <Medal
                    className="w-6 h-6"
                    style={{ color: TIER_COLORS[currentTier as keyof typeof TIER_COLORS] }}
                  />
                  <p className="text-2xl font-bold text-foreground capitalize">{currentTier}</p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {TIER_RATES[currentTier as keyof typeof TIER_RATES] * 100}% commission rate
              </div>
            </div>
          </div>

          <div className="border border-border rounded-lg p-6 bg-card">
            <div className="space-y-4">
              <div>
                <p className="text-muted-foreground text-sm mb-2">Projected Tier</p>
                <div className="flex items-center gap-3">
                  <Medal
                    className="w-6 h-6"
                    style={{ color: TIER_COLORS[projectedTier as keyof typeof TIER_COLORS] }}
                  />
                  <p className="text-2xl font-bold text-foreground capitalize">{projectedTier}</p>
                  {projectedTierLevel > tierProgression && (
                    <ArrowUp className="w-5 h-5 text-green-500 ml-auto" />
                  )}
                  {projectedTierLevel < tierProgression && (
                    <ArrowDown className="w-5 h-5 text-red-500 ml-auto" />
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {TIER_RATES[projectedTier as keyof typeof TIER_RATES] * 100}% commission rate
              </div>
            </div>
          </div>
        </div>

        {/* Forecast Chart */}
        <div className="border border-border rounded-lg p-6 bg-card">
          <h2 className="text-lg font-semibold text-foreground mb-6">6-Month Earnings Projection</h2>

          {payoutLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading forecast data...</div>
          ) : forecastData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No forecast data available</div>
          ) : (
            <div className="space-y-4">
              {forecastData.map((month, idx) => {
                const maxCommission = Math.max(...forecastData.map((m) => m.projectedCommission));
                const barWidth = maxCommission > 0 ? (month.projectedCommission / maxCommission) * 100 : 0;

                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">
                          {month.monthName} {month.year}
                        </p>
                        <p className="text-xs text-muted-foreground">{month.dealCount} active deals</p>
                      </div>
                      <p className="font-semibold text-foreground">{fmt(month.projectedCommission)}</p>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Average */}
              <div className="border-t border-border pt-4 mt-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground">Average Monthly Commission</p>
                  <p className="text-lg font-bold text-primary">{fmt(avgCommission)}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Insights */}
        <div className="border border-border rounded-lg p-6 bg-card">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Target className="w-5 h-5" />
            Insights
          </h2>

          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
              <p className="text-muted-foreground">
                Your average monthly commission over the next {forecastMonths} months is projected to be{" "}
                <span className="font-semibold text-foreground">{fmt(avgCommission)}</span>.
              </p>
            </div>

            {projectedTierLevel > tierProgression && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                <p className="text-muted-foreground">
                  You're on track to advance to <span className="font-semibold text-foreground capitalize">{projectedTier}</span> tier! This will increase your commission rate to{" "}
                  <span className="font-semibold text-foreground">
                    {TIER_RATES[projectedTier as keyof typeof TIER_RATES] * 100}%
                  </span>
                  .
                </p>
              </div>
            )}

            {projectedTierLevel < tierProgression && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0" />
                <p className="text-muted-foreground">
                  Your projected tier is lower than your current tier. Focus on closing more deals to maintain your{" "}
                  <span className="font-semibold text-foreground capitalize">{currentTier}</span> status.
                </p>
              </div>
            )}

            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
              <p className="text-muted-foreground">
                This forecast is based on your current active deals and assumes no changes to deal status or ARR amounts.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
