import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import { TrendingUp, AlertCircle, CheckCircle2, ArrowRight, Target } from "lucide-react";

const TIER_COLORS = {
  bronze: { text: "text-amber-600", bg: "bg-amber-500/10", border: "border-amber-500/30", badge: "bg-amber-500/20 text-amber-700" },
  silver: { text: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/30", badge: "bg-slate-500/20 text-slate-300" },
  gold: { text: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30", badge: "bg-yellow-500/20 text-yellow-600" },
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
  unit = "",
}: {
  label: string;
  current: string;
  target: string;
  extra: string | null;
  alreadyMeets: boolean;
  unit?: string;
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
        <span className="text-foreground font-medium">{current}{unit}</span>
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <span className={alreadyMeets ? "text-green-500 font-semibold" : "text-foreground font-semibold"}>
          {target}{unit}
        </span>
        {!alreadyMeets && extra && (
          <span className="text-xs text-orange-500 font-medium">(+{extra})</span>
        )}
      </div>
    </div>
  );
}

export function TierForecastCard() {
  const { ae } = useAeAuth();
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
              {allMet && (
                <span className="ml-auto text-xs text-green-500 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> All targets met!
                </span>
              )}
            </div>
            <div className="space-y-0 rounded-lg border border-border/60 px-3 divide-y divide-border/40">
              <MetricRow
                label="ARR / month"
                current={`$${Math.round(forecast.currentMetrics.arrUsd).toLocaleString()}`}
                target={`$${at.thresholds.arrUsd.toLocaleString()}`}
                extra={at.extraNeeded.arrUsd > 0 ? `$${at.extraNeeded.arrUsd.toLocaleString()}` : null}
                alreadyMeets={at.alreadyMeets.arr}
              />
              <MetricRow
                label="Demos / week"
                current={forecast.currentMetrics.demosPw.toFixed(1)}
                target={at.thresholds.demosPw.toFixed(1)}
                extra={at.extraNeeded.demosPw > 0 ? at.extraNeeded.demosPw.toFixed(1) : null}
                alreadyMeets={at.alreadyMeets.demos}
              />
              <MetricRow
                label="Dials / week"
                current={Math.round(forecast.currentMetrics.dialsPw).toString()}
                target={at.thresholds.dialsPw.toString()}
                extra={at.extraNeeded.dialsPw > 0 ? at.extraNeeded.dialsPw.toString() : null}
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
                month.gapToNextTier.arrUsd > 0 ||
                month.gapToNextTier.demosPw > 0 ||
                month.gapToNextTier.dialsPw > 0;
              return (
                <div
                  key={month.month}
                  className="flex items-start justify-between p-2.5 rounded-lg bg-muted/30 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground w-8">{month.month}</span>
                    <TierBadge tier={month.projectedTier} />
                    {month.willUpgrade && (
                      <span className="text-xs text-green-500 font-medium">↑ upgrade</span>
                    )}
                  </div>
                  {hasGap && (
                    <div className="text-right text-xs text-muted-foreground space-y-0.5">
                      {month.gapToNextTier.arrUsd > 0 && (
                        <p>
                          <span className={`${mCfg.text} font-medium`}>
                            ${month.gapToNextTier.arrUsd.toLocaleString()}
                          </span>{" "}
                          ARR gap
                        </p>
                      )}
                      {month.gapToNextTier.demosPw > 0 && (
                        <p>
                          <span className={`${mCfg.text} font-medium`}>
                            {month.gapToNextTier.demosPw.toFixed(1)}
                          </span>{" "}
                          demos/wk gap
                        </p>
                      )}
                      {month.gapToNextTier.dialsPw > 0 && (
                        <p>
                          <span className={`${mCfg.text} font-medium`}>
                            {month.gapToNextTier.dialsPw}
                          </span>{" "}
                          dials/wk gap
                        </p>
                      )}
                    </div>
                  )}
                  {!hasGap && (
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
