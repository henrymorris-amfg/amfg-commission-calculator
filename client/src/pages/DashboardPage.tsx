import { useState, useMemo, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { FlaggedDemosAlert } from "@/components/FlaggedDemosAlert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MONTH_NAMES, TIER_COMMISSION_RATE } from "../../../shared/commission";
import {
  PoundSterling,
  TrendingUp,
  Wallet,
  Clock,
  Calculator,
  Phone,
  Activity,
  ArrowRight,
  RefreshCw,
  Plus,
  Award,
  Minus,
  DollarSign,
} from "lucide-react";
import { format } from "date-fns";

/* ─── Tier Config ─────────────────────────────────────────────────────────── */
const TIER_CONFIG = {
  bronze: {
    label: "Bronze",
    color: "oklch(0.65 0.12 55)",
    bg: "oklch(0.65 0.12 55 / 0.12)",
    border: "oklch(0.65 0.12 55 / 0.35)",
  },
  silver: {
    label: "Silver",
    color: "oklch(0.82 0.02 250)",
    bg: "oklch(0.75 0.02 250 / 0.12)",
    border: "oklch(0.75 0.02 250 / 0.35)",
  },
  gold: {
    label: "Gold",
    color: "oklch(0.88 0.14 75)",
    bg: "oklch(0.82 0.14 75 / 0.12)",
    border: "oklch(0.82 0.14 75 / 0.4)",
  },
};

function fmtGbp(val: number) {
  return `£${val.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { ae, isLoading } = useAeAuth();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: summary, isLoading: summaryLoading } = trpc.commission.dashboardSummary.useQuery(
    undefined,
    { enabled: !!ae }
  );

  const { data: tierData, isLoading: tierLoading } = trpc.tier.calculate.useQuery(
    { year: currentYear, month: currentMonth },
    { enabled: !!ae }
  );

  const { data: deals = [], isLoading: dealsLoading } = trpc.deals.list.useQuery(
    undefined,
    { enabled: !!ae }
  );

  const { data: fxData } = trpc.commission.fxRate.useQuery(undefined, { enabled: !!ae });

  // VOIP live data
  const todayQuery = trpc.voipSync.myDialsToday.useQuery(undefined, {
    enabled: !!ae,
    retry: false,
    throwOnError: false,
    refetchInterval: 60_000,
  });
  const weekQuery = trpc.voipSync.myDialsThisWeek.useQuery(undefined, {
    enabled: !!ae,
    retry: false,
    throwOnError: false,
    refetchInterval: 120_000,
  });

  // ── Sync Now ───────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const importDealsMutation = trpc.pipedriveSync.importDeals.useMutation({
    onSuccess: (data) => {
      toast.success(`Sync complete — ${data.totalImported} deals imported.`);
      utils.tier.calculate.invalidate();
      utils.commission.dashboardSummary.invalidate();
      utils.deals.list.invalidate();
    },
    onError: (err) => toast.error(`Deal import failed: ${err.message}`),
  });
  const syncMutation = trpc.pipedriveSync.import.useMutation({
    onSuccess: () => importDealsMutation.mutate({ months: 6, useJoinDate: true }),
    onError: (err) => toast.error(`Sync failed: ${err.message}`),
  });
  const handleSyncNow = useCallback(() => {
    syncMutation.mutate({ months: 4, mergeMode: "replace", useJoinDate: true });
  }, [syncMutation]);

  // ── Forecast state ─────────────────────────────────────────────────────────
  const [forecastArr, setForecastArr] = useState("");
  const [forecastType, setForecastType] = useState<"annual" | "monthly">("annual");
  const forecastArrNum = parseFloat(forecastArr.replace(/,/g, "")) || 0;
  const tier = (tierData?.tier ?? "bronze") as "bronze" | "silver" | "gold";
  const commRate = TIER_COMMISSION_RATE[tier];
  const fxRate = fxData?.usdToGbp ?? 0.79;

  const forecastGbp = useMemo(() => {
    if (!forecastArrNum || forecastArrNum <= 0) return null;
    if (forecastType === "annual") {
      return forecastArrNum * commRate * fxRate;
    } else {
      const perMonth = (forecastArrNum / 12) * commRate * fxRate;
      return { perMonth, total: perMonth * 13 };
    }
  }, [forecastArrNum, forecastType, commRate, fxRate]);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading && !ae) navigate("/");
  }, [ae, isLoading]);

  if (isLoading || !ae) return null;

  const tierConfig = TIER_CONFIG[tier];
  const today = todayQuery.data?.found ? todayQuery.data : null;
  const week = weekQuery.data?.found ? weekQuery.data : null;
  const recentDeals = deals.slice(0, 5);

  return (
    <AppLayout>
      <div className="p-4 sm:p-8 pb-24 md:pb-8 space-y-6 max-w-5xl">
        {/* Flagged Demos Alert */}
        <FlaggedDemosAlert />

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Hey, {ae.name.split(" ")[0]}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {format(now, "EEEE, MMMM d, yyyy")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncNow}
              disabled={syncMutation.isPending}
              className="gap-1.5 border-border text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              {syncMutation.isPending ? "Syncing…" : "Sync"}
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/deals")}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Log Deal
            </Button>
          </div>
        </div>

        {/* ═══ SECTION 1: Commission Earnings ═══════════════════════════════ */}
        <div className="rounded-2xl border p-5"
          style={{ background: "oklch(0.17 0.018 250)", borderColor: "oklch(0.28 0.02 250)" }}>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4 font-medium">Commission Earnings</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "This Month", value: summaryLoading ? "—" : fmtGbp(summary?.mtdGbp ?? 0), icon: PoundSterling, accent: "oklch(0.60 0.15 200)" },
              { label: "Year to Date", value: summaryLoading ? "—" : fmtGbp(summary?.ytdGbp ?? 0), icon: TrendingUp, accent: "oklch(0.55 0.18 145)" },
              { label: "Locked-in", value: summaryLoading ? "—" : fmtGbp(summary?.pipelineGbp ?? 0), icon: Wallet, accent: "oklch(0.78 0.14 75)" },
              { label: "All Time", value: summaryLoading ? "—" : fmtGbp(summary?.allTimeGbp ?? 0), icon: Clock, accent: "oklch(0.65 0.12 55)" },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="rounded-xl p-4"
                  style={{ background: `${s.accent.replace(")", " / 0.08)")}`, border: `1px solid ${s.accent.replace(")", " / 0.2)")}` }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon className="w-3.5 h-3.5" style={{ color: s.accent }} />
                    <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-foreground">{s.value}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ SECTION 2: VOIP Activity ════════════════════════════════════ */}
        {(today || week || todayQuery.isLoading || weekQuery.isLoading) && (
          <div className="rounded-2xl border p-5"
            style={{ background: "oklch(0.17 0.018 250)", borderColor: "oklch(0.28 0.02 250)" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4" style={{ color: "oklch(0.70 0.18 145)" }} />
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Live Activity</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-muted-foreground">Live</span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="Today's Dials" value={today?.totalDials ?? "—"} sub={today ? `${today.connected} connected` : ""} icon={Phone} />
              <StatTile label="This Week" value={week?.totalDials ?? "—"} sub={week ? `${week.connected} connected` : ""} icon={Activity} />
              <StatTile label="Connect Rate" value={today ? `${today.connectionRate.toFixed(1)}%` : "—"} sub="today" icon={Activity} />
              <StatTile label="Talk Time" value={week?.totalTalkTimeFormatted ?? "—"} sub="this week" icon={Clock} />
            </div>
          </div>
        )}

        {/* ═══ SECTION 3: Current Tier ═════════════════════════════════════ */}
        <div className="rounded-2xl border overflow-hidden"
          style={{ borderColor: tierConfig.border }}>
          <div className="px-5 py-4 flex items-center justify-between"
            style={{ background: tierConfig.bg }}>
            <div className="flex items-center gap-3">
              <Award className="w-5 h-5" style={{ color: tierConfig.color }} />
              <div>
                <h3 className="text-lg font-bold" style={{ color: tierConfig.color }}>{tierConfig.label}</h3>
                <p className="text-xs text-muted-foreground">{(commRate * 100).toFixed(0)}% commission rate</p>
              </div>
            </div>
            <span className="text-2xl font-black" style={{ color: tierConfig.color }}>
              {(commRate * 100).toFixed(0)}%
            </span>
          </div>
          <div className="px-5 py-4" style={{ background: "oklch(0.17 0.018 250)" }}>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3 font-medium">Rolling Averages</p>
            {tierLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl p-3 bg-secondary/40 border border-border/50 text-center">
                  <p className="text-lg font-bold text-foreground">{tierData?.avgDemosPw?.toFixed(1) ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">demos/wk</p>
                </div>
                <div className="rounded-xl p-3 bg-secondary/40 border border-border/50 text-center">
                  <p className="text-lg font-bold text-foreground">{tierData?.avgDialsPw?.toFixed(0) ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">dials/wk</p>
                </div>
                <div className="rounded-xl p-3 bg-secondary/40 border border-border/50 text-center">
                  <p className="text-lg font-bold text-foreground">
                    ${tierData?.avgArrUsd ? tierData.avgArrUsd.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">ARR/mo</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ SECTION 4: Recent Deals ═════════════════════════════════════ */}
        <div className="rounded-2xl border p-5"
          style={{ background: "oklch(0.17 0.018 250)", borderColor: "oklch(0.28 0.02 250)" }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Recent Deals</p>
            <button
              onClick={() => navigate("/deals")}
              className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {dealsLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : recentDeals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-sm mb-3">No deals logged yet.</p>
              <Button size="sm" onClick={() => navigate("/deals")} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Log your first deal
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentDeals.map((deal) => {
                const tc = TIER_CONFIG[deal.tierAtStart as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.bronze;
                return (
                  <div key={deal.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors border border-border/30">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tc.color }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{deal.customerName}</p>
                        <p className="text-xs text-muted-foreground">
                          {MONTH_NAMES[deal.startMonth - 1]} {deal.startYear} · {deal.contractType}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-sm font-semibold text-foreground">
                        ${Number(deal.arrUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-xs font-medium" style={{ color: tc.color }}>{tc.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══ SECTION 5: Commission Forecast ══════════════════════════════ */}
        <div className="rounded-2xl border p-5"
          style={{ background: "oklch(0.17 0.018 250)", borderColor: "oklch(0.28 0.02 250)" }}>
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="w-4 h-4" style={{ color: "oklch(0.75 0.12 200)" }} />
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Commission Forecast</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Estimate your payout at <span className="font-medium" style={{ color: tierConfig.color }}>{tierConfig.label}</span> ({(commRate * 100).toFixed(0)}%)
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
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

          {forecastArrNum > 0 && forecastGbp !== null ? (
            <div className="rounded-xl p-4 border"
              style={{ background: tierConfig.bg, borderColor: tierConfig.border }}>
              {forecastType === "annual" ? (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Upfront payout (annual contract)</p>
                    <p className="text-2xl font-bold text-foreground">
                      {fmtGbp(forecastGbp as number)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ${forecastArrNum.toLocaleString()} × {(commRate * 100).toFixed(0)}% × {fxRate.toFixed(4)} FX
                    </p>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50">
                    <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Paid upfront</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Monthly payout (× 13 months)</p>
                      <p className="text-2xl font-bold text-foreground">
                        {fmtGbp((forecastGbp as { perMonth: number; total: number }).perMonth)}
                        <span className="text-sm font-normal text-muted-foreground ml-1">/mo</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total over 13 months</p>
                      <p className="text-lg font-bold" style={{ color: tierConfig.color }}>
                        {fmtGbp((forecastGbp as { perMonth: number; total: number }).total)}
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
            <div className="rounded-xl p-4 border border-dashed border-border flex items-center justify-center gap-2 text-muted-foreground">
              <Minus className="w-4 h-4" />
              <p className="text-sm">Enter a deal ARR above to see your estimated payout</p>
            </div>
          )}
        </div>

        {/* FX rate footer */}
        {fxData && (
          <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground/50">
            <Clock className="w-3 h-3" />
            <span>Live FX: 1 USD = {fxData.usdToGbp?.toFixed(4)} GBP</span>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

/* ─── Stat Tile Helper ────────────────────────────────────────────────────── */
function StatTile({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl p-3 bg-secondary/30 border border-border/30">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3 h-3 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
