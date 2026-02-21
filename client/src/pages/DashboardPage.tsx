import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MONTH_NAMES, TIER_COMMISSION_RATE, STANDARD_TARGETS, TEAM_LEADER_TARGETS } from "../../../shared/commission";
import {
  Award,
  TrendingUp,
  DollarSign,
  Plus,
  ArrowRight,
  Zap,
  Target,
  Clock,
  Calculator,
  ChevronUp,
  Minus,
  Building2,
  Phone,
  PhoneCall,
  Activity,
} from "lucide-react";
import { format } from "date-fns";

const TIER_CONFIG = {
  bronze: {
    label: "Bronze",
    color: "oklch(0.65 0.12 55)",
    bg: "oklch(0.65 0.12 55 / 0.12)",
    border: "oklch(0.65 0.12 55 / 0.35)",
    description: "Keep pushing — Silver is within reach.",
  },
  silver: {
    label: "Silver",
    color: "oklch(0.82 0.02 250)",
    bg: "oklch(0.75 0.02 250 / 0.12)",
    border: "oklch(0.75 0.02 250 / 0.35)",
    description: "Strong performance. Gold is your next target.",
  },
  gold: {
    label: "Gold",
    color: "oklch(0.88 0.14 75)",
    bg: "oklch(0.82 0.14 75 / 0.12)",
    border: "oklch(0.82 0.14 75 / 0.4)",
    description: "Outstanding! You're at the top tier.",
  },
};

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { ae, isLoading } = useAeAuth();
  const now = new Date();
  const [selectedYear] = useState(now.getFullYear());
  const [selectedMonth] = useState(now.getMonth() + 1);

  // Forecast state
  const [forecastArr, setForecastArr] = useState("");
  const [forecastType, setForecastType] = useState<"annual" | "monthly">("annual");

  const { data: tierData, isLoading: tierLoading } = trpc.tier.calculate.useQuery(
    { year: selectedYear, month: selectedMonth },
    { enabled: !!ae }
  );

  const { data: deals = [], isLoading: dealsLoading } = trpc.deals.list.useQuery(
    undefined,
    { enabled: !!ae }
  );

  const { data: fxData } = trpc.commission.fxRate.useQuery(undefined, { enabled: !!ae });

  const { data: summary = [] } = trpc.commission.monthlySummary.useQuery(
    undefined,
    { enabled: !!ae }
  );

  useEffect(() => {
    if (!isLoading && !ae) navigate("/");
  }, [ae, isLoading]);

  // ── Forecast calculation (useMemo MUST be above early return) ────────────────
  const forecastArrNum = parseFloat(forecastArr.replace(/,/g, "")) || 0;
  const forecastGbp = useMemo(() => {
    if (!forecastArrNum || forecastArrNum <= 0) return null;
    const fxRate = fxData?.usdToGbp ?? 0.79;
    const commRate = TIER_COMMISSION_RATE[tierData?.tier ?? "bronze"];
    if (forecastType === "annual") {
      return forecastArrNum * commRate * fxRate;
    } else {
      const perMonth = (forecastArrNum / 12) * commRate * fxRate;
      return { perMonth, total: perMonth * 13 };
    }
  }, [forecastArrNum, forecastType, fxData, tierData]);

  if (isLoading || !ae) return null;

  const tier = tierData?.tier ?? "bronze";
  const tierConfig = TIER_CONFIG[tier];
  const commRate = TIER_COMMISSION_RATE[tier];
  const fxRate = fxData?.usdToGbp ?? 0.79;

  const currentMonthSummary = summary.find(
    (s) => s.year === selectedYear && s.month === selectedMonth
  );
  const currentMonthGbp = currentMonthSummary?.totalGbp ?? 0;
  const ytdGbp = summary
    .filter((s) => s.year === selectedYear)
    .reduce((sum, s) => sum + s.totalGbp, 0);

  const joinDate = new Date(ae.joinDate);
  const monthsIn = Math.floor((now.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  const isNewJoiner = monthsIn < 6;

  const recentDeals = deals.slice(0, 5);

  // ── Tier progress calculations ──────────────────────────────────────────────
  const targets = ae.isTeamLeader ? TEAM_LEADER_TARGETS : STANDARD_TARGETS;

  // Determine next tier targets
  const nextTier = tier === "bronze" ? "silver" : tier === "silver" ? "gold" : null;
  const nextTargets = nextTier ? targets[nextTier] : null;

  // Progress items toward next tier
  const progressItems = nextTargets && tierData
    ? [
        {
          label: "Avg Monthly ARR",
          current: tierData.avgArrUsd,
          target: nextTargets.arrUsd,
          format: (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
          exempt: isNewJoiner,
          exemptLabel: "Exempt (new joiner)",
        },
        {
          label: "Demos / week",
          current: tierData.avgDemosPw,
          target: nextTargets.demosPw,
          format: (v: number) => v.toFixed(1),
          exempt: false,
        },
        {
          label: "Dials / week",
          current: tierData.avgDialsPw,
          target: nextTargets.dialsPw,
          format: (v: number) => v.toFixed(0),
          exempt: false,
        },
        {
          label: "Retention Rate",
          current: tierData.avgRetentionRate,
          target: nextTargets.retentionMin,
          format: (v: number) => `${v.toFixed(1)}%`,
          exempt: isNewJoiner,
          exemptLabel: "Exempt (new joiner)",
        },
      ]
    : [];

   return (
    <AppLayout>
      <div className="p-4 sm:p-8 pb-24 md:pb-8 space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-muted-foreground text-sm mb-1">
              {format(now, "EEEE, MMMM d, yyyy")}
            </p>
            <h1 className="text-3xl sm:text-4xl text-foreground">
              Hello, {ae.name.split(" ")[0]}
            </h1>
            <p className="text-muted-foreground mt-1">
              Here's your commission overview for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}.
            </p>
          </div>
          <Button
            onClick={() => navigate("/deals")}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 self-start"
          >
            <Plus className="w-4 h-4" />
            Log Deal
          </Button>
        </div>

        {/* Badges */}
        <div className="flex gap-2 flex-wrap">
          {isNewJoiner && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ background: "oklch(0.60 0.15 200 / 0.15)", border: "1px solid oklch(0.60 0.15 200 / 0.4)", color: "oklch(0.75 0.12 200)" }}>
              <Zap className="w-3 h-3" />
              New Joiner — Month {monthsIn + 1} of 6
            </span>
          )}
          {ae.isTeamLeader && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ background: "oklch(0.78 0.12 75 / 0.15)", border: "1px solid oklch(0.78 0.12 75 / 0.4)", color: "oklch(0.88 0.14 75)" }}>
              <Award className="w-3 h-3" />
              Team Leader
            </span>
          )}
          {fxData && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ background: "oklch(0.20 0.018 250)", border: "1px solid oklch(0.28 0.02 250)", color: "oklch(0.65 0.01 250)" }}>
              <Clock className="w-3 h-3" />
              Live FX: 1 USD = £{fxRate.toFixed(4)}
            </span>
          )}
        </div>

        {/* Live Dials from VOIP Studio */}
        <LiveDialsWidget />

        {/* Tier Card + Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Tier Card */}
          <div className="lg:col-span-1 rounded-2xl p-6 relative overflow-hidden"
            style={{ background: tierConfig.bg, border: `1px solid ${tierConfig.border}` }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 -translate-y-8 translate-x-8"
              style={{ background: `radial-gradient(circle, ${tierConfig.color}, transparent)` }} />
            <div className="relative">
              <p className="text-xs font-medium tracking-widest uppercase mb-3"
                style={{ color: tierConfig.color }}>
                Current Tier — {MONTH_NAMES[selectedMonth - 1]}
              </p>
              {tierLoading ? (
                <div className="h-12 w-24 rounded-lg bg-muted animate-pulse" />
              ) : (
                <>
                  <h2 className="text-5xl font-bold mb-1" style={{ color: tierConfig.color }}>
                    {tierConfig.label}
                  </h2>
                  <p className="text-3xl font-bold text-foreground">{(commRate * 100).toFixed(0)}%</p>
                  <p className="text-sm text-muted-foreground mt-2">{tierConfig.description}</p>
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="lg:col-span-2 grid grid-cols-2 gap-4">
            {[
              {
                label: `${MONTH_NAMES[selectedMonth - 1]} Earnings`,
                value: `£${currentMonthGbp.toFixed(2)}`,
                icon: DollarSign,
                sub: "Commission this month",
                color: "oklch(0.82 0.14 75)",
              },
              {
                label: "YTD Earnings",
                value: `£${ytdGbp.toFixed(2)}`,
                icon: TrendingUp,
                sub: `Jan–${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`,
                color: "oklch(0.60 0.15 200)",
              },
              {
                label: "Active Deals",
                value: String(deals.length),
                icon: Target,
                sub: "Total logged contracts",
                color: "oklch(0.65 0.12 55)",
              },
              {
                label: "Commission Rate",
                value: `${(commRate * 100).toFixed(0)}%`,
                icon: Award,
                sub: `${tierConfig.label} tier rate`,
                color: tierConfig.color as string,
              },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-2xl p-5 bg-card border border-border">
                  <div className="flex items-start justify-between mb-3">
                    <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: `${stat.color}20` }}>
                      <Icon className="w-4 h-4" style={{ color: stat.color }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Tier Progress Indicators ─────────────────────────────────────────── */}
        <div className="rounded-2xl bg-card border border-border p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {nextTier
                  ? `Progress to ${TIER_CONFIG[nextTier].label}`
                  : "You've reached the top tier"}
              </h3>
              {nextTier && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Based on your 3-month rolling averages
                </p>
              )}
            </div>
            <button
              onClick={() => navigate("/metrics")}
              className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
            >
              Update metrics <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {tierLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : tier === "gold" ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <div className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: "oklch(0.82 0.14 75 / 0.15)", border: "1px solid oklch(0.82 0.14 75 / 0.4)" }}>
                <Award className="w-6 h-6" style={{ color: "oklch(0.88 0.14 75)" }} />
              </div>
              <p className="text-sm font-medium text-foreground">Gold tier achieved</p>
              <p className="text-xs text-muted-foreground">You're earning the maximum 19% commission rate.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {progressItems.map((item) => {
                const pct = item.exempt ? 100 : Math.min(100, item.target > 0 ? (item.current / item.target) * 100 : 0);
                const met = item.exempt || item.current >= item.target;
                const remaining = item.target - item.current;
                const progressColor = met
                  ? "oklch(0.55 0.18 145)"
                  : pct >= 75
                  ? "oklch(0.82 0.14 75)"
                  : "oklch(0.65 0.12 55)";

                return (
                  <div key={item.label} className="rounded-xl p-4 border border-border bg-secondary/30 space-y-3">
                    <div className="flex items-start justify-between">
                      <p className="text-xs text-muted-foreground font-medium">{item.label}</p>
                      {met ? (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: "oklch(0.55 0.18 145 / 0.15)", color: "oklch(0.70 0.18 145)" }}>
                          ✓
                        </span>
                      ) : (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: "oklch(0.55 0.22 25 / 0.15)", color: "oklch(0.70 0.22 25)" }}>
                          {Math.round(pct)}%
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-lg font-bold text-foreground">{item.format(item.current)}</span>
                        <span className="text-xs text-muted-foreground">/ {item.format(item.target)}</span>
                      </div>
                      <ProgressBar value={item.exempt ? item.target : item.current} max={item.target} color={progressColor} />
                    </div>

                    {item.exempt ? (
                      <p className="text-xs" style={{ color: "oklch(0.75 0.12 200)" }}>{item.exemptLabel}</p>
                    ) : met ? (
                      <p className="text-xs flex items-center gap-1" style={{ color: "oklch(0.70 0.18 145)" }}>
                        <ChevronUp className="w-3 h-3" /> Target met
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Need <span className="text-foreground font-medium">{item.format(remaining)}</span> more
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Commission Forecast Calculator ───────────────────────────────────── */}
        <div className="rounded-2xl bg-card border border-border p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "oklch(0.60 0.15 200 / 0.15)" }}>
              <Calculator className="w-4 h-4" style={{ color: "oklch(0.75 0.12 200)" }} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Commission Forecast</h3>
              <p className="text-xs text-muted-foreground">
                See what you'd earn from a deal at your current <span className="font-medium" style={{ color: tierConfig.color }}>{tierConfig.label}</span> tier ({(commRate * 100).toFixed(0)}%)
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            {/* Contract type toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden flex-shrink-0">
              {(["annual", "monthly"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setForecastType(t)}
                  className={`px-4 py-2 text-sm font-medium transition-colors capitalize ${
                    forecastType === t
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* ARR input */}
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">$</span>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="Enter deal ARR (USD)"
                value={forecastArr}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  setForecastArr(raw ? Number(raw).toLocaleString() : "");
                }}
                className="pl-7 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Result */}
          {forecastArrNum > 0 && forecastGbp !== null ? (
            <div className="rounded-xl p-5 border"
              style={{ background: tierConfig.bg, borderColor: tierConfig.border }}>
              {forecastType === "annual" ? (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Upfront payout on annual contract</p>
                    <p className="text-3xl font-bold text-foreground">
                      £{(forecastGbp as number).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ${forecastArrNum.toLocaleString()} × {(commRate * 100).toFixed(0)}% × {fxRate.toFixed(4)} FX
                    </p>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg"
                    style={{ background: "oklch(0.20 0.018 250)" }}>
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Paid upfront</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Monthly payout (× 13 months)</p>
                      <p className="text-3xl font-bold text-foreground">
                        £{((forecastGbp as { perMonth: number; total: number }).perMonth).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-base font-normal text-muted-foreground ml-1">/mo</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total over 13 months</p>
                      <p className="text-xl font-bold" style={{ color: tierConfig.color }}>
                        £{((forecastGbp as { perMonth: number; total: number }).total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    (${forecastArrNum.toLocaleString()} ÷ 12) × {(commRate * 100).toFixed(0)}% × {fxRate.toFixed(4)} FX per month
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl p-5 border border-dashed border-border flex items-center justify-center gap-2 text-muted-foreground">
              <Minus className="w-4 h-4" />
              <p className="text-sm">Enter a deal ARR above to see your estimated payout</p>
            </div>
          )}
        </div>

        {/* Tier Criteria Breakdown */}
        {tierData && (
          <div className="rounded-2xl bg-card border border-border p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-foreground">Tier Criteria — {MONTH_NAMES[selectedMonth - 1]}</h3>
              <button
                onClick={() => navigate("/metrics")}
                className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
              >
                Update metrics <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  label: "Avg ARR / Month",
                  value: `$${tierData.avgArrUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                  met: tierData.meetsArr,
                  note: tierData.isNewJoiner ? "Exempt (new joiner)" : undefined,
                },
                {
                  label: "Demos Done / wk",
                  value: tierData.avgDemosPw.toFixed(1),
                  met: tierData.meetsDemos,
                },
                {
                  label: "Dials / wk",
                  value: tierData.avgDialsPw.toFixed(0),
                  met: tierData.meetsDials,
                },
                {
                  label: "Retention Rate",
                  value: `${tierData.avgRetentionRate.toFixed(1)}%`,
                  met: tierData.meetsRetention,
                  note: tierData.isNewJoiner ? "Exempt (new joiner)" : undefined,
                },
              ].map((c) => (
                <div key={c.label} className="rounded-xl p-4 border"
                  style={{
                    borderColor: c.note ? "oklch(0.60 0.15 200 / 0.3)" : c.met ? "oklch(0.55 0.18 145 / 0.3)" : "oklch(0.55 0.22 25 / 0.3)",
                    background: c.note ? "oklch(0.60 0.15 200 / 0.05)" : c.met ? "oklch(0.55 0.18 145 / 0.05)" : "oklch(0.55 0.22 25 / 0.05)",
                  }}>
                  <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
                  <p className="text-xl font-bold text-foreground">{c.value}</p>
                  {c.note ? (
                    <p className="text-xs mt-1" style={{ color: "oklch(0.75 0.12 200)" }}>{c.note}</p>
                  ) : (
                    <p className="text-xs mt-1" style={{ color: c.met ? "oklch(0.70 0.18 145)" : "oklch(0.70 0.22 25)" }}>
                      {c.met ? "✓ Met" : "✗ Not met"}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {tierData.reasons.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Why not Gold/Silver:</p>
                <ul className="space-y-1">
                  {tierData.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-muted-foreground flex-shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Recent Deals */}
        <div className="rounded-2xl bg-card border border-border p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-foreground">Recent Deals</h3>
            <button
              onClick={() => navigate("/deals")}
              className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {dealsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : recentDeals.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground text-sm mb-3">No deals logged yet.</p>
              <Button
                size="sm"
                onClick={() => navigate("/deals")}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Log your first deal
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentDeals.map((deal) => {
                const tc = TIER_CONFIG[deal.tierAtStart as keyof typeof TIER_CONFIG];
                return (
                  <div key={deal.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tc.color }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{deal.customerName}</p>
                        <p className="text-xs text-muted-foreground">
                          {MONTH_NAMES[deal.startMonth - 1]} {deal.startYear} · {deal.contractType}
                          {deal.isReferral && " · Referral"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-sm font-semibold text-foreground">
                        ${deal.arrUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-xs font-medium" style={{ color: tc.color }}>{tc.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pipedrive Won Deals */}
        <PipedriveDealsWidget />
      </div>
    </AppLayout>
  );
}

/* ─── Live Dials Widget (VOIP Studio) ──────────────────────────────────────── */

function LiveDialsWidget() {
  const todayQuery = trpc.voipSync.myDialsToday.useQuery(undefined, {
    retry: false,
    throwOnError: false,
    refetchInterval: 60_000, // refresh every 60 seconds
  });
  const weekQuery = trpc.voipSync.myDialsThisWeek.useQuery(undefined, {
    retry: false,
    throwOnError: false,
    refetchInterval: 120_000, // refresh every 2 minutes
  });

  if (todayQuery.isLoading && weekQuery.isLoading) return null;
  if (todayQuery.isError && weekQuery.isError) return null;
  if (todayQuery.data && !todayQuery.data.found && weekQuery.data && !weekQuery.data.found) return null;

  const today = todayQuery.data?.found ? todayQuery.data : null;
  const week = weekQuery.data?.found ? weekQuery.data : null;

  return (
    <div className="rounded-2xl bg-card border border-border p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "oklch(0.55 0.18 145 / 0.15)" }}>
          <Phone className="w-4 h-4" style={{ color: "oklch(0.70 0.18 145)" }} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Live Dials</h3>
          <p className="text-xs text-muted-foreground">Real-time data from VoIPstudio</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Dials */}
        <div className="rounded-xl p-4 border border-border bg-secondary/30">
          <div className="flex items-start justify-between mb-2">
            <p className="text-xs text-muted-foreground font-medium">Today's Dials</p>
            <PhoneCall className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold text-foreground">{today?.totalDials ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {today ? `${today.connected} connected` : "Loading..."}
          </p>
        </div>

        {/* Today's Connection Rate */}
        <div className="rounded-xl p-4 border border-border bg-secondary/30">
          <div className="flex items-start justify-between mb-2">
            <p className="text-xs text-muted-foreground font-medium">Connect Rate</p>
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold text-foreground">
            {today ? `${today.connectionRate.toFixed(1)}%` : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Today</p>
        </div>

        {/* This Week's Dials */}
        <div className="rounded-xl p-4 border border-border bg-secondary/30">
          <div className="flex items-start justify-between mb-2">
            <p className="text-xs text-muted-foreground font-medium">This Week</p>
            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold text-foreground">{week?.totalDials ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {week ? `${week.connected} connected` : "Loading..."}
          </p>
        </div>

        {/* This Week's Talk Time */}
        <div className="rounded-xl p-4 border border-border bg-secondary/30">
          <div className="flex items-start justify-between mb-2">
            <p className="text-xs text-muted-foreground font-medium">Talk Time</p>
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold text-foreground">
            {week?.totalTalkTimeFormatted ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {week ? `${week.connectionRate.toFixed(1)}% connect rate` : "This week"}
          </p>
        </div>
      </div>
    </div>
  );
}

function PipedriveDealsWidget() {
  const myDealsQuery = trpc.pipedriveSync.myDeals.useQuery(
    { months: 3 },
    { retry: false, throwOnError: false }
  );

  if (myDealsQuery.isLoading) return null;
  if (myDealsQuery.isError) return null;
  if (!myDealsQuery.data?.pipedriveUserFound) return null;

  const { deals, monthlyArr } = myDealsQuery.data;
  if (deals.length === 0) return null;

  const totalArr = monthlyArr.reduce((s, m) => s + m.totalArrUsd, 0);

  return (
    <div className="rounded-2xl bg-card border border-border p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Won Deals (Pipedrive)</h3>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Last 3 months</p>
          <p className="text-sm font-bold text-foreground">
            ${totalArr.toLocaleString(undefined, { maximumFractionDigits: 0 })} ARR
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {deals.slice(0, 8).map((deal) => (
          <div
            key={deal.id}
            className="flex items-center justify-between px-4 py-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{deal.title}</p>
                <p className="text-xs text-muted-foreground">
                  {deal.wonDate} &middot; {deal.pipeline}
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-4">
              <p className="text-sm font-semibold text-foreground">
                {deal.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} {deal.currency}
              </p>
            </div>
          </div>
        ))}
      </div>
      {deals.length > 8 && (
        <p className="text-xs text-muted-foreground text-center mt-3">
          +{deals.length - 8} more deals
        </p>
      )}
    </div>
  );
}
