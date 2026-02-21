import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { MONTH_NAMES, TIER_COMMISSION_RATE } from "../../../shared/commission";
import {
  Award,
  TrendingUp,
  DollarSign,
  Calendar,
  Plus,
  ArrowRight,
  Zap,
  Target,
  Clock,
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

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { ae, isLoading } = useAeAuth();
  const now = new Date();
  const [selectedYear] = useState(now.getFullYear());
  const [selectedMonth] = useState(now.getMonth() + 1);

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

  if (isLoading || !ae) return null;

  const tier = tierData?.tier ?? "bronze";
  const tierConfig = TIER_CONFIG[tier];
  const commRate = TIER_COMMISSION_RATE[tier];

  // Current month earnings
  const currentMonthKey = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
  const currentMonthSummary = summary.find(
    (s) => s.year === selectedYear && s.month === selectedMonth
  );
  const currentMonthGbp = currentMonthSummary?.totalGbp ?? 0;

  // YTD earnings
  const ytdGbp = summary
    .filter((s) => s.year === selectedYear)
    .reduce((sum, s) => sum + s.totalGbp, 0);

  // New joiner check
  const joinDate = new Date(ae.joinDate);
  const monthsIn = Math.floor((now.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  const isNewJoiner = monthsIn < 6;

  const recentDeals = deals.slice(0, 5);

  return (
    <AppLayout>
      <div className="p-8 space-y-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-muted-foreground text-sm mb-1">
              {format(now, "EEEE, MMMM d, yyyy")}
            </p>
            <h1 className="text-4xl text-foreground">
              Hello, {ae.name.split(" ")[0]}
            </h1>
            <p className="text-muted-foreground mt-1">
              Here's your commission overview for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}.
            </p>
          </div>
          <Button
            onClick={() => navigate("/deals")}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
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
              Live FX: 1 USD = £{fxData.usdToGbp.toFixed(4)}
            </span>
          )}
        </div>

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
                  <h2 className="text-5xl font-bold mb-1" style={{ color: tierConfig.color, fontFamily: "inherit" }}>
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
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tc.color }} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{deal.customerName}</p>
                        <p className="text-xs text-muted-foreground">
                          {MONTH_NAMES[deal.startMonth - 1]} {deal.startYear} · {deal.contractType}
                          {deal.isReferral && " · Referral"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
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
      </div>
    </AppLayout>
  );
}
