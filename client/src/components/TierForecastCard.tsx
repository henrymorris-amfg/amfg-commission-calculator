import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import {
  TrendingUp, AlertCircle, CheckCircle2, ChevronDown, ChevronUp,
  Target, Phone, BarChart2, DollarSign, ArrowRight
} from "lucide-react";

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

/** A single metric row with a progress-style indicator */
function MetricRow({
  icon: Icon,
  label,
  needed,
  unit,
  alreadyMet,
  isUpgrade,
}: {
  icon: React.ElementType;
  label: string;
  needed: number;
  unit: string;
  alreadyMet: boolean;
  isUpgrade?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-lg ${alreadyMet ? "bg-green-500/5 border border-green-500/20" : isUpgrade ? "bg-blue-500/5 border border-blue-500/15" : "bg-muted/30 border border-border/40"}`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${alreadyMet ? "text-green-500" : isUpgrade ? "text-blue-400" : "text-muted-foreground"}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {alreadyMet ? (
        <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Already met
        </span>
      ) : (
        <span className={`text-sm font-bold ${isUpgrade ? "text-blue-400" : "text-foreground"}`}>
          {needed.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
        </span>
      )}
    </div>
  );
}

export function TierForecastCard() {
  const { ae } = useAeAuth();
  const [expandedMonth, setExpandedMonth] = useState<number>(0); // default expand first month

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
  const isGold = forecast.currentTier === "gold";

  // Check if any month has a tier drop on "do nothing"
  const willDegrade = forecast.forecastMonths.some(
    (m) => (m as any).doNothing?.projectedTier !== forecast.currentTier
  );

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
          Month-by-month targets to maintain or improve your tier
        </p>
      </div>

      {/* Degradation warning */}
      {willDegrade && (
        <div className="px-5 py-3 flex items-start gap-3 border-b border-border/40 bg-orange-500/5 border-orange-500/20">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-orange-500" />
          <p className="text-sm text-orange-600 font-medium">
            Your tier will drop if you do nothing — hit the targets below to stay on track.
          </p>
        </div>
      )}

      {/* Current metrics summary */}
      <div className="px-5 py-3 border-b border-border/40 bg-muted/20">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Current 3-Month Rolling Average</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-base font-bold text-foreground">${Math.round(forecast.currentMetrics.arrUsd).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">ARR/month</p>
          </div>
          <div>
            <p className="text-base font-bold text-foreground">{forecast.currentMetrics.demosPw.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">demos/week</p>
          </div>
          <div>
            <p className="text-base font-bold text-foreground">{Math.round(forecast.currentMetrics.dialsPw)}</p>
            <p className="text-xs text-muted-foreground">dials/week</p>
          </div>
        </div>
      </div>

      {/* Month-by-month accordion */}
      <div className="divide-y divide-border/40">
        {forecast.forecastMonths.map((monthData: any, idx: number) => {
          const isExpanded = expandedMonth === idx;
          const doNothing = monthData.doNothing;
          const maintain = monthData.maintainCurrent;
          const improve = monthData.improveTo;
          const willDropThisMonth = doNothing?.projectedTier !== forecast.currentTier;
          const allMaintainMet = maintain?.alreadyMet?.demos && maintain?.alreadyMet?.dials && maintain?.alreadyMet?.arr;

          return (
            <div key={monthData.label ?? idx}>
              {/* Month header — clickable to expand */}
              <button
                className="w-full px-5 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors text-left"
                onClick={() => setExpandedMonth(isExpanded ? -1 : idx)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground w-24">{monthData.label}</span>
                  {/* Do-nothing outcome pill */}
                  {doNothing && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">if idle:</span>
                      <TierBadge tier={doNothing.projectedTier} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {allMaintainMet ? (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> On track
                    </span>
                  ) : willDropThisMonth ? (
                    <span className="text-xs text-orange-500 font-medium">Action needed</span>
                  ) : null}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-5 pb-4 space-y-4">
                  {/* Maintain current tier */}
                  {maintain && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1 h-3.5 rounded-full bg-foreground/60"></div>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                          To stay {forecast.currentTier.toUpperCase()} — hit these in {monthData.label?.split(" ")[0]}
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <MetricRow
                          icon={BarChart2}
                          label="Demos this month"
                          needed={maintain.demosNeeded}
                          unit="demos"
                          alreadyMet={maintain.alreadyMet?.demos}
                        />
                        <MetricRow
                          icon={Phone}
                          label="Dials this month"
                          needed={maintain.dialsNeeded}
                          unit="dials"
                          alreadyMet={maintain.alreadyMet?.dials}
                        />
                        <MetricRow
                          icon={DollarSign}
                          label="New ARR to close"
                          needed={maintain.arrNeeded}
                          unit="USD"
                          alreadyMet={maintain.alreadyMet?.arr}
                        />
                      </div>
                    </div>
                  )}

                  {/* Improve to next tier */}
                  {improve && !isGold && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
                        <p className="text-xs font-bold text-blue-400 uppercase tracking-wide">
                          To reach {improve.tier.toUpperCase()} — hit these instead
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <MetricRow
                          icon={BarChart2}
                          label="Demos this month"
                          needed={improve.demosNeeded}
                          unit="demos"
                          alreadyMet={improve.alreadyMet?.demos}
                          isUpgrade
                        />
                        <MetricRow
                          icon={Phone}
                          label="Dials this month"
                          needed={improve.dialsNeeded}
                          unit="dials"
                          alreadyMet={improve.alreadyMet?.dials}
                          isUpgrade
                        />
                        <MetricRow
                          icon={DollarSign}
                          label="New ARR to close"
                          needed={improve.arrNeeded}
                          unit="USD"
                          alreadyMet={improve.alreadyMet?.arr}
                          isUpgrade
                        />
                      </div>
                    </div>
                  )}

                  {/* Gold — just show maintain targets */}
                  {isGold && allMaintainMet && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-green-700 font-medium">
                        You're on track to stay Gold in {monthData.label} — keep up your current activity.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
