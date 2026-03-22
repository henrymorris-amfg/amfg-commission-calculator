import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import { TrendingUp, AlertCircle, CheckCircle2, ArrowDown, Target, Clock, Zap } from "lucide-react";

const TIER_COLORS = {
  bronze: { text: "text-amber-600", bg: "bg-amber-500/10", border: "border-amber-500/30", badge: "bg-amber-500/20 text-amber-700" },
  silver: { text: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/30", badge: "bg-slate-500/20 text-slate-300" },
  gold:   { text: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30", badge: "bg-yellow-500/20 text-yellow-600" },
};

function TierBadge({ tier }: { tier: string }) {
  const cfg = TIER_COLORS[tier as keyof typeof TIER_COLORS] ?? TIER_COLORS.bronze;
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
      {tier.toUpperCase()}
    </span>
  );
}

function MetricBox({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-muted/40">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-base font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{unit}</p>
    </div>
  );
}

/** Returns weeks remaining until the end of the current quarter */
function useWeeksLeftInQuarter(): { weeksLeft: number; quarterLabel: string; isUrgent: boolean } {
  return useMemo(() => {
    const now = new Date();
    const month = now.getMonth(); // 0-indexed
    const quarterEnds = [2, 5, 8, 11];
    const quarterLabels = ["Q1", "Q2", "Q3", "Q4"];
    const qIdx = Math.floor(month / 3);
    const endMonth = quarterEnds[qIdx];
    const endYear = now.getFullYear();
    const quarterEnd = new Date(endYear, endMonth + 1, 0);
    const msLeft = quarterEnd.getTime() - now.getTime();
    const weeksLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24 * 7)));
    return {
      weeksLeft,
      quarterLabel: quarterLabels[qIdx],
      isUrgent: weeksLeft <= 4,
    };
  }, []);
}

export function TierForecastCard() {
  const { ae } = useAeAuth();
  const { weeksLeft, quarterLabel, isUrgent } = useWeeksLeftInQuarter();

  const { data: forecast, isLoading, error } = trpc.commissionStructure.tierForecast.useQuery(
    undefined,
    { enabled: !!ae, retry: false }
  );

  if (!ae) return null;

  if (isLoading) {
    return (
      <div className="rounded-xl p-5 bg-card border border-border animate-pulse">
        <div className="h-5 bg-muted rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded w-full"></div>
          <div className="h-4 bg-muted rounded w-5/6"></div>
          <div className="h-4 bg-muted rounded w-4/6"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl p-5 bg-card border border-border">
        <div className="flex items-center gap-2 text-destructive mb-1">
          <AlertCircle className="w-4 h-4" />
          <p className="text-sm font-medium">Could not load tier forecast</p>
        </div>
        <p className="text-xs text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  if (!forecast) return null;

  const tierCfg = TIER_COLORS[forecast.currentTier as keyof typeof TIER_COLORS] ?? TIER_COLORS.bronze;
  const at = forecast.actionableTargets;
  const allMet = at?.alreadyMeets.arr && at?.alreadyMeets.demos && at?.alreadyMeets.dials;
  const isGold = forecast.currentTier === "gold";

  // Check if tier will degrade in the next 3 months
  const willDegrade = forecast.forecastMonths.some((m) => m.projectedTier !== forecast.currentTier);

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className={`px-5 py-4 ${tierCfg.bg} border-b ${tierCfg.border}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className={`w-4 h-4 ${tierCfg.text}`} />
            <h3 className="text-sm font-semibold text-foreground">Your Tier Outlook</h3>
          </div>
          <TierBadge tier={forecast.currentTier} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {isGold ? "You're at the highest commission tier" : "Based on your 3-month rolling average"}
        </p>
      </div>

      {/* Urgency banner */}
      {willDegrade && !isGold && (
        <div
          className="px-5 py-3 flex items-start gap-3 border-b border-border/40"
          style={{
            background: "oklch(0.55 0.22 25 / 0.08)",
            borderColor: "oklch(0.55 0.22 25 / 0.25)",
          }}
        >
          <ArrowDown className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "oklch(0.70 0.22 25)" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "oklch(0.70 0.22 25)" }}>
              Your tier will drop if you do nothing
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {forecast.forecastMonths[0]?.month && (
                <>
                  By <span className="font-medium">{forecast.forecastMonths[0].month}</span>, you'll be{" "}
                  <span className="font-medium">{forecast.forecastMonths[0].projectedTier.toUpperCase()}</span> if you don't take action
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Success banner */}
      {isGold && (
        <div className="px-5 py-3 flex items-start gap-3 border-b border-border/40 bg-green-500/5 border-green-500/20">
          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-green-700">You're at Gold tier</p>
            <p className="text-xs text-muted-foreground mt-1">
              Maintain your current performance to stay at the highest commission rate
            </p>
          </div>
        </div>
      )}

      <div className="p-5 space-y-6">
        {/* Section 1: Current Status */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 bg-foreground rounded-full"></div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Your Current Performance</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MetricBox
              label="ARR"
              value={`$${Math.round(forecast.currentMetrics.arrUsd).toLocaleString()}`}
              unit="per month"
            />
            <MetricBox
              label="Demos"
              value={forecast.currentMetrics.demosPw.toFixed(1)}
              unit="per week"
            />
            <MetricBox
              label="Dials"
              value={Math.round(forecast.currentMetrics.dialsPw)}
              unit="per week"
            />
          </div>
        </div>

        {/* Section 2: Do Nothing Forecast */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 bg-foreground rounded-full"></div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">If You Do Nothing</p>
          </div>
          <div className="space-y-2">
            {forecast.forecastMonths.map((month, idx) => {
              const mCfg = TIER_COLORS[month.projectedTier as keyof typeof TIER_COLORS] ?? TIER_COLORS.bronze;
              const isSameTier = month.projectedTier === forecast.currentTier;
              return (
                <div
                  key={month.month}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-muted-foreground w-12">{month.month}</span>
                    <TierBadge tier={month.projectedTier} />
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      ${Math.round(month.projectedMetrics.arrUsd).toLocaleString()} ARR
                    </p>
                    {!isSameTier && (
                      <p className="text-xs font-semibold mt-0.5" style={{ color: mCfg.text.split("-")[1] }}>
                        ↓ Drop from {forecast.currentTier.toUpperCase()}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 3: Action Items */}
        {at && !isGold ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-foreground rounded-full"></div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                To Stay {forecast.currentTier.toUpperCase()} (or Reach {at.targetTier.toUpperCase()})
              </p>
            </div>
            <div className="space-y-2">
              {/* ARR */}
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Annual Recurring Revenue</span>
                  <span className={`text-sm font-bold ${at.alreadyMeets.arr ? "text-green-500" : "text-foreground"}`}>
                    ${Math.round(forecast.currentMetrics.arrUsd + at.extraNeeded.arrUsd).toLocaleString()}
                  </span>
                </div>
                {!at.alreadyMeets.arr && (
                  <p className="text-xs text-orange-500 font-medium mt-1">
                    Need +${Math.round(at.extraNeeded.arrUsd).toLocaleString()} more per month
                  </p>
                )}
                {at.alreadyMeets.arr && (
                  <p className="text-xs text-green-600 font-medium mt-1">✓ You already meet this target</p>
                )}
              </div>

              {/* Demos */}
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Demos per Week</span>
                  <span className={`text-sm font-bold ${at.alreadyMeets.demos ? "text-green-500" : "text-foreground"}`}>
                    {(forecast.currentMetrics.demosPw + at.extraNeeded.demosPw).toFixed(1)}
                  </span>
                </div>
                {!at.alreadyMeets.demos && (
                  <p className="text-xs text-orange-500 font-medium mt-1">
                    Need +{at.extraNeeded.demosPw.toFixed(1)} more demos per week
                  </p>
                )}
                {at.alreadyMeets.demos && (
                  <p className="text-xs text-green-600 font-medium mt-1">✓ You already meet this target</p>
                )}
              </div>

              {/* Dials */}
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Dials per Week</span>
                  <span className={`text-sm font-bold ${at.alreadyMeets.dials ? "text-green-500" : "text-foreground"}`}>
                    {Math.round(forecast.currentMetrics.dialsPw + at.extraNeeded.dialsPw)}
                  </span>
                </div>
                {!at.alreadyMeets.dials && (
                  <p className="text-xs text-orange-500 font-medium mt-1">
                    Need +{Math.round(at.extraNeeded.dialsPw)} more dials per week
                  </p>
                )}
                {at.alreadyMeets.dials && (
                  <p className="text-xs text-green-600 font-medium mt-1">✓ You already meet this target</p>
                )}
              </div>
            </div>
          </div>
        ) : isGold ? (
          <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
            <div className="flex items-start gap-2">
              <Zap className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-700">Maintain your current numbers</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Keep hitting ${Math.round(forecast.currentMetrics.arrUsd).toLocaleString()} ARR, {forecast.currentMetrics.demosPw.toFixed(1)} demos/week, and {Math.round(forecast.currentMetrics.dialsPw)} dials/week to stay at Gold
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
