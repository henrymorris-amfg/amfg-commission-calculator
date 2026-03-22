import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import { TrendingUp, AlertCircle, CheckCircle2, ArrowRight, Target, Clock } from "lucide-react";

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

function MetricRow({
  label,
  current,
  target,
  extra,
  alreadyMeets,
}: {
  label: string;
  current: string;
  target: string;
  extra: string | null;
  alreadyMeets: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        {alreadyMeets ? (
          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
        ) : (
          <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40 shrink-0" />
        )}
        <span className="text-sm text-muted-foreground truncate">{label}</span>
      </div>
      <div className="flex items-center gap-2 text-sm shrink-0 ml-2">
        <span className="text-foreground font-medium">{current}</span>
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <span className={alreadyMeets ? "text-green-500 font-semibold" : "text-foreground font-semibold"}>
          {target}
        </span>
        {!alreadyMeets && extra && (
          <span className="text-xs text-orange-500 font-medium">(+{extra})</span>
        )}
      </div>
    </div>
  );
}

/** Returns weeks remaining until the end of the current quarter */
function useWeeksLeftInQuarter(): { weeksLeft: number; quarterLabel: string; isUrgent: boolean } {
  return useMemo(() => {
    const now = new Date();
    const month = now.getMonth(); // 0-indexed
    // Quarter end months (0-indexed): Q1=Feb(2), Q2=May(5), Q3=Aug(8), Q4=Nov(11)
    const quarterEnds = [2, 5, 8, 11];
    const quarterLabels = ["Q1", "Q2", "Q3", "Q4"];
    const qIdx = Math.floor(month / 3);
    const endMonth = quarterEnds[qIdx];
    const endYear = now.getFullYear();
    // Last day of the quarter-end month
    const quarterEnd = new Date(endYear, endMonth + 1, 0); // day 0 of next month = last day of endMonth
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

  // Build urgency message: "6 weeks left in Q2 · need +93 dials/week above current pace"
  const urgencyParts: string[] = [];
  if (at && !allMet) {
    if (!at.alreadyMeets.dials && at.extraNeeded.dialsPw > 0)
      urgencyParts.push(`+${at.extraNeeded.dialsPw} dials/wk`);
    if (!at.alreadyMeets.demos && at.extraNeeded.demosPw > 0)
      urgencyParts.push(`+${at.extraNeeded.demosPw.toFixed(1)} demos/wk`);
    if (!at.alreadyMeets.arr && at.extraNeeded.arrUsd > 0)
      urgencyParts.push(`+$${at.extraNeeded.arrUsd.toLocaleString()} ARR/mo`);
  }

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className={`px-5 py-4 ${tierCfg.bg} border-b ${tierCfg.border}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className={`w-4 h-4 ${tierCfg.text}`} />
            <h3 className="text-sm font-semibold text-foreground">3-Month Tier Forecast</h3>
          </div>
          <TierBadge tier={forecast.currentTier} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Based on your rolling 3-month averages
        </p>
      </div>

      {/* Urgency banner */}
      {at && !allMet && (
        <div
          className="px-5 py-2.5 flex items-center gap-2 border-b border-border/40"
          style={{
            background: isUrgent
              ? "oklch(0.55 0.22 25 / 0.08)"
              : "oklch(0.60 0.15 200 / 0.06)",
            borderColor: isUrgent
              ? "oklch(0.55 0.22 25 / 0.25)"
              : "oklch(0.60 0.15 200 / 0.2)",
          }}
        >
          <Clock
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: isUrgent ? "oklch(0.70 0.22 25)" : "oklch(0.65 0.12 200)" }}
          />
          <p
            className="text-xs font-medium"
            style={{ color: isUrgent ? "oklch(0.70 0.22 25)" : "oklch(0.65 0.12 200)" }}
          >
            <span className="font-bold">{weeksLeft} week{weeksLeft !== 1 ? "s" : ""} left in {quarterLabel}</span>
            {urgencyParts.length > 0 && (
              <> · need {urgencyParts.join(", ")} above current pace to reach{" "}
                <span className="font-bold">{at.targetTier.toUpperCase()}</span>
              </>
            )}
          </p>
        </div>
      )}

      {/* All met banner */}
      {at && allMet && (
        <div className="px-5 py-2.5 flex items-center gap-2 border-b border-border/40 bg-green-500/5 border-green-500/20">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
          <p className="text-xs font-medium text-green-600">
            <span className="font-bold">{weeksLeft} weeks left in {quarterLabel}</span> · all targets met — on track for {at.targetTier.toUpperCase()}!
          </p>
        </div>
      )}

      <div className="p-5 space-y-5">
        {/* Current metrics summary */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-2 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground mb-0.5">ARR/month</p>
            <p className="text-sm font-semibold text-foreground">
              ${Math.round(forecast.currentMetrics.arrUsd).toLocaleString()}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground mb-0.5">Demos/wk</p>
            <p className="text-sm font-semibold text-foreground">
              {forecast.currentMetrics.demosPw.toFixed(1)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground mb-0.5">Dials/wk</p>
            <p className="text-sm font-semibold text-foreground">
              {Math.round(forecast.currentMetrics.dialsPw)}
            </p>
          </div>
        </div>

        {/* Actionable targets */}
        {at ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                To reach{" "}
                <span className={TIER_COLORS[at.targetTier as keyof typeof TIER_COLORS]?.text ?? ""}>
                  {at.targetTier.toUpperCase()}
                </span>
              </p>
            </div>
            <div className="space-y-0 rounded-lg border border-border/60 px-3 divide-y divide-border/40">
              <MetricRow
                label="ARR / month"
                current={`$${Math.round(forecast.currentMetrics.arrUsd).toLocaleString()}`}
                target={`$${(forecast.currentMetrics.arrUsd + at.extraNeeded.arrUsd).toLocaleString()}`}
                extra={at.extraNeeded.arrUsd > 0 ? `$${at.extraNeeded.arrUsd.toLocaleString()}` : null}
                alreadyMeets={at.alreadyMeets.arr}
              />
              <MetricRow
                label="Demos / week"
                current={forecast.currentMetrics.demosPw.toFixed(1)}
                target={`${(forecast.currentMetrics.demosPw + at.extraNeeded.demosPw).toFixed(1)}`}
                extra={at.extraNeeded.demosPw > 0 ? at.extraNeeded.demosPw.toFixed(1) : null}
                alreadyMeets={at.alreadyMeets.demos}
              />
              <MetricRow
                label="Dials / week"
                current={Math.round(forecast.currentMetrics.dialsPw).toString()}
                target={`${Math.round(forecast.currentMetrics.dialsPw + at.extraNeeded.dialsPw)}`}
                extra={at.extraNeeded.dialsPw > 0 ? Math.round(at.extraNeeded.dialsPw).toString() : null}
                alreadyMeets={at.alreadyMeets.dials}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <CheckCircle2 className="w-4 h-4 text-yellow-500" />
            <p className="text-sm font-medium text-yellow-600">
              You're at Gold — maximum commission rate!
            </p>
          </div>
        )}

        {/* Month-by-month projection */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            3-Month Projection
          </p>
          <div className="space-y-1.5">
            {forecast.forecastMonths.map((month) => {
              const mCfg = TIER_COLORS[month.projectedTier as keyof typeof TIER_COLORS] ?? TIER_COLORS.bronze;
              const hasGap =
                month.gapToGold.arrUsd > 0 ||
                month.gapToGold.demosPw > 0 ||
                month.gapToGold.dialsPw > 0;
              return (
                <div
                  key={month.month}
                  className="flex items-start justify-between p-2.5 rounded-lg bg-muted/30 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground w-8">{month.month}</span>
                    <TierBadge tier={month.projectedTier} />
                    {month.projectedTier !== forecast.currentTier && (
                      <span className="text-xs text-orange-500 font-medium">↓ {month.projectedTier}</span>
                    )}
                  </div>
                  {hasGap ? (
                    <div className="text-right text-xs text-muted-foreground space-y-0.5">
                      {month.gapToGold.arrUsd > 0 && (
                        <p>
                          <span className={`${mCfg.text} font-medium`}>
                            ${month.gapToGold.arrUsd.toLocaleString()}
                          </span>{" "}
                          to Gold
                        </p>
                      )}
                      {month.gapToGold.demosPw > 0 && (
                        <p>
                          <span className={`${mCfg.text} font-medium`}>
                            {month.gapToGold.demosPw.toFixed(1)}
                          </span>{" "}
                          demos/wk
                        </p>
                      )}
                      {month.gapToGold.dialsPw > 0 && (
                        <p>
                          <span className={`${mCfg.text} font-medium`}>
                            {Math.round(month.gapToGold.dialsPw)}
                          </span>{" "}
                          dials/wk
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-green-500 font-medium">On track ✓</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
