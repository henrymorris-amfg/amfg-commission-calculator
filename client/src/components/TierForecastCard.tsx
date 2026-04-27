import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import {
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Phone,
  BarChart2,
  DollarSign,
  ArrowRight,
  Activity,
} from "lucide-react";
import { MONTH_NAMES } from "../../../shared/commission";

const TIER_COLORS = {
  bronze: {
    text: "text-amber-600",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    badge: "bg-amber-500/20 text-amber-700",
  },
  silver: {
    text: "text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/30",
    badge: "bg-slate-500/20 text-slate-300",
  },
  gold: {
    text: "text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    badge: "bg-yellow-500/20 text-yellow-600",
  },
};

function TierBadge({ tier }: { tier: string }) {
  const cfg = TIER_COLORS[tier as keyof typeof TIER_COLORS] ?? TIER_COLORS.bronze;
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}
    >
      {tier.toUpperCase()}
    </span>
  );
}

/** A single metric row with target and current progress */
function MetricRow({
  icon: Icon,
  label,
  needed,
  current,
  unit,
  alreadyMet,
  isUpgrade,
}: {
  icon: React.ElementType;
  label: string;
  needed: number;
  current: number;
  unit: string;
  alreadyMet: boolean;
  isUpgrade?: boolean;
}) {
  const percentage = Math.min(100, (current / needed) * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon
            className={`w-4 h-4 shrink-0 ${
              alreadyMet
                ? "text-green-500"
                : isUpgrade
                  ? "text-blue-400"
                  : "text-muted-foreground"
            }`}
          />
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        {alreadyMet ? (
          <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Done
          </span>
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">
            {current.toLocaleString()} / {needed.toLocaleString()} {unit}
          </span>
        )}
      </div>
      {!alreadyMet && (
        <div className="w-full bg-muted/40 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full transition-all ${
              isUpgrade ? "bg-blue-400" : "bg-foreground/60"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function TierForecastCard() {
  const { ae } = useAeAuth();
  const [showUpgrade, setShowUpgrade] = useState(false);

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

  const tierCfg =
    TIER_COLORS[forecast.currentTier as keyof typeof TIER_COLORS] ??
    TIER_COLORS.bronze;
  const isGold = forecast.currentTier === "gold";
  const tracking = (forecast as any).currentMonthTracking;
  const currentMonth = forecast.forecastMonths[0]; // First month is current month

  if (!currentMonth || !tracking) return null;

  const maintain = currentMonth.maintainCurrent;
  const improve = currentMonth.improveTo;
  const allMaintainMet =
    maintain?.alreadyMet?.demos &&
    maintain?.alreadyMet?.dials &&
    maintain?.alreadyMet?.arr;
  const allImproveMet =
    improve?.alreadyMet?.demos &&
    improve?.alreadyMet?.dials &&
    improve?.alreadyMet?.arr;

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className={`px-5 py-4 ${tierCfg.bg} border-b ${tierCfg.border}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className={`w-4 h-4 ${tierCfg.text}`} />
            <h3 className="text-sm font-semibold text-foreground">
              Your Tier Outlook
            </h3>
          </div>
          <TierBadge tier={forecast.currentTier} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          What you need to do this month to maintain or improve
        </p>
      </div>

      {/* Current month live tracking */}
      <div className="px-5 py-4 border-b border-border/40 bg-muted/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              {MONTH_NAMES[tracking.month - 1]} {tracking.year} — Live Progress
            </p>
          </div>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              TIER_COLORS[
                tracking.trackingTier as keyof typeof TIER_COLORS
              ]?.badge
            }`}
          >
            {tracking.trackingTier.toUpperCase()}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-base font-bold text-foreground">
              {tracking.demosTotal}
            </p>
            <p className="text-xs text-muted-foreground">demos</p>
          </div>
          <div>
            <p className="text-base font-bold text-foreground">
              {tracking.dialsTotal.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">dials</p>
          </div>
          <div>
            <p className="text-base font-bold text-foreground">
              ${Math.round(tracking.arrUsd).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">ARR</p>
          </div>
        </div>
      </div>

      {/* Maintain current tier */}
      {maintain && (
        <div className="px-5 py-4 border-b border-border/40">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 rounded-full bg-foreground/60"></div>
            <p className="text-sm font-bold text-foreground">
              To stay {forecast.currentTier.toUpperCase()}
            </p>
            {allMaintainMet && (
              <span className="text-xs text-green-600 font-semibold flex items-center gap-1 ml-auto">
                <CheckCircle2 className="w-3 h-3" /> On track
              </span>
            )}
          </div>
          <div className="space-y-3">
            <MetricRow
              icon={BarChart2}
              label="Demos this month"
              needed={maintain.demosNeeded}
              current={tracking.demosTotal}
              unit="demos"
              alreadyMet={maintain.alreadyMet?.demos}
            />
            <MetricRow
              icon={Phone}
              label="Dials this month"
              needed={maintain.dialsNeeded}
              current={tracking.dialsTotal}
              unit="dials"
              alreadyMet={maintain.alreadyMet?.dials}
            />
            <MetricRow
              icon={DollarSign}
              label="New ARR to close"
              needed={maintain.arrNeeded}
              current={Math.round(tracking.arrUsd)}
              unit="USD"
              alreadyMet={maintain.alreadyMet?.arr}
            />
          </div>
        </div>
      )}

      {/* Improve to next tier (if not Gold) */}
      {!isGold && improve && (
        <div className="px-5 py-4">
          <button
            onClick={() => setShowUpgrade(!showUpgrade)}
            className="w-full flex items-center justify-between mb-4 hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-blue-400" />
              <p className="text-sm font-bold text-blue-400">
                Or reach {improve.tier.toUpperCase()}
              </p>
              {allImproveMet && (
                <span className="text-xs text-blue-600 font-semibold flex items-center gap-1 ml-auto">
                  <CheckCircle2 className="w-3 h-3" /> Done
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {showUpgrade ? "Hide" : "Show"}
            </span>
          </button>

          {showUpgrade && (
            <div className="space-y-3 pt-3 border-t border-border/40">
              <MetricRow
                icon={BarChart2}
                label="Demos this month"
                needed={improve.demosNeeded}
                current={tracking.demosTotal}
                unit="demos"
                alreadyMet={improve.alreadyMet?.demos}
                isUpgrade
              />
              <MetricRow
                icon={Phone}
                label="Dials this month"
                needed={improve.dialsNeeded}
                current={tracking.dialsTotal}
                unit="dials"
                alreadyMet={improve.alreadyMet?.dials}
                isUpgrade
              />
              <MetricRow
                icon={DollarSign}
                label="New ARR to close"
                needed={improve.arrNeeded}
                current={Math.round(tracking.arrUsd)}
                unit="USD"
                alreadyMet={improve.alreadyMet?.arr}
                isUpgrade
              />
            </div>
          )}
        </div>
      )}

      {/* Gold tier message */}
      {isGold && allMaintainMet && (
        <div className="px-5 py-4 flex items-start gap-3 bg-green-500/5 border-t border-green-500/20">
          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
          <p className="text-sm text-green-700 font-medium">
            You're on track to stay Gold this month. Keep up your current activity.
          </p>
        </div>
      )}
    </div>
  );
}
