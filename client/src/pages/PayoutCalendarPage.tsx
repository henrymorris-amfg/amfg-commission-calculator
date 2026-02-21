import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { MONTH_NAMES } from "../../../shared/commission";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  TrendingUp,
  Wallet,
  CheckCircle2,
  Circle,
  Banknote,
} from "lucide-react";

const TIER_CONFIG = {
  bronze: { label: "Bronze", color: "oklch(0.65 0.12 55)", bg: "oklch(0.65 0.12 55 / 0.12)", border: "oklch(0.65 0.12 55 / 0.3)" },
  silver: { label: "Silver", color: "oklch(0.82 0.02 250)", bg: "oklch(0.75 0.02 250 / 0.12)", border: "oklch(0.75 0.02 250 / 0.3)" },
  gold:   { label: "Gold",   color: "oklch(0.88 0.14 75)",  bg: "oklch(0.82 0.14 75 / 0.12)",  border: "oklch(0.82 0.14 75 / 0.35)" },
};

function fmt(gbp: number) {
  return `£${gbp.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PayoutCalendarPage() {
  const [, navigate] = useLocation();
  const { ae, isLoading } = useAeAuth();
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "future" | "past">("all");

  const { data, isLoading: calLoading } = trpc.commission.payoutCalendar.useQuery(
    undefined,
    { enabled: !!ae }
  );

  useEffect(() => {
    if (!isLoading && !ae) navigate("/");
  }, [ae, isLoading]);

  // Auto-expand current month on load
  useEffect(() => {
    if (data?.months) {
      const current = data.months.find((m) => m.status === "current");
      if (current) {
        const key = `${current.year}-${current.month}`;
        setExpandedMonths(new Set([key]));
      }
    }
  }, [data]);

  if (isLoading || !ae) return null;

  const months = data?.months ?? [];
  const filtered = months.filter((m) => {
    if (filter === "future") return m.status === "future" || m.status === "current";
    if (filter === "past") return m.status === "past";
    return true;
  });

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  return (
    <AppLayout>
      <div className="p-4 sm:p-8 pb-24 md:pb-8 space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <p className="text-muted-foreground text-sm mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            Commission Forecast
          </p>
          <h1 className="text-3xl sm:text-4xl text-foreground">Payout Calendar</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Your month-by-month commission schedule — past receipts and upcoming payouts.
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: "This Month",
              value: fmt(data?.currentMonthGbp ?? 0),
              icon: Wallet,
              color: "oklch(0.82 0.14 75)",
              sub: `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`,
            },
            {
              label: "Future Pipeline",
              value: fmt(data?.totalFutureGbp ?? 0),
              icon: TrendingUp,
              color: "oklch(0.60 0.15 200)",
              sub: "Scheduled upcoming payouts",
            },
            {
              label: "Total Received",
              value: fmt(data?.totalPastGbp ?? 0),
              icon: CheckCircle2,
              color: "oklch(0.55 0.18 145)",
              sub: "All past months",
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

        {/* Filter Tabs */}
        <div className="flex rounded-lg border border-border overflow-hidden w-fit">
          {(["all", "future", "past"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm font-medium transition-colors capitalize ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {f === "future" ? "Upcoming" : f === "past" ? "Past" : "All"}
            </button>
          ))}
        </div>

        {/* Timeline */}
        {calLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Calendar className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No payouts found</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Log your first deal to see your payout schedule appear here.
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[22px] top-6 bottom-6 w-px bg-border hidden sm:block" />

            <div className="space-y-3">
              {filtered.map((month) => {
                const key = `${month.year}-${month.month}`;
                const isExpanded = expandedMonths.has(key);
                const isCurrent = month.status === "current";
                const isPast = month.status === "past";
                const isFuture = month.status === "future";

                const dotColor = isCurrent
                  ? "oklch(0.82 0.14 75)"
                  : isPast
                  ? "oklch(0.55 0.18 145)"
                  : "oklch(0.60 0.15 200)";

                return (
                  <div key={key} className="sm:pl-12 relative">
                    {/* Timeline dot */}
                    <div
                      className="absolute left-[14px] top-5 w-4 h-4 rounded-full border-2 hidden sm:flex items-center justify-center"
                      style={{
                        borderColor: dotColor,
                        background: isCurrent ? dotColor : isPast ? `${dotColor}30` : "var(--background)",
                      }}
                    >
                      {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
                    </div>

                    {/* Month card */}
                    <div
                      className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                        isCurrent
                          ? "border-[oklch(0.82_0.14_75_/_0.4)] bg-[oklch(0.82_0.14_75_/_0.06)]"
                          : "border-border bg-card"
                      }`}
                    >
                      {/* Month header (always visible) */}
                      <button
                        onClick={() => toggleMonth(key)}
                        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-secondary/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Status icon */}
                          <div className="flex-shrink-0">
                            {isPast ? (
                              <CheckCircle2 className="w-4 h-4" style={{ color: "oklch(0.55 0.18 145)" }} />
                            ) : isCurrent ? (
                              <Clock className="w-4 h-4" style={{ color: "oklch(0.82 0.14 75)" }} />
                            ) : (
                              <Circle className="w-4 h-4" style={{ color: "oklch(0.60 0.15 200)" }} />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-foreground">
                                {MONTH_NAMES[month.month - 1]} {month.year}
                              </span>
                              {isCurrent && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                  style={{ background: "oklch(0.82 0.14 75 / 0.2)", color: "oklch(0.88 0.14 75)" }}>
                                  THIS MONTH
                                </span>
                              )}
                              {isFuture && (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                                  style={{ background: "oklch(0.60 0.15 200 / 0.15)", color: "oklch(0.75 0.12 200)" }}>
                                  UPCOMING
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {month.payouts.length} payout{month.payouts.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                          <span className={`text-lg font-bold ${isPast ? "text-muted-foreground" : "text-foreground"}`}>
                            {fmt(month.totalGbp)}
                          </span>
                          {isExpanded
                            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </button>

                      {/* Expanded deal breakdown */}
                      {isExpanded && (
                        <div className="border-t border-border px-5 py-3 space-y-2">
                          {month.payouts.map((payout, idx) => {
                            const tc = TIER_CONFIG[payout.tierAtStart as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.bronze;
                            return (
                              <div key={idx}
                                className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-secondary/40">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ background: tc.color }} />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">
                                      {payout.customerName}
                                    </p>
                                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                      <span className="text-xs text-muted-foreground capitalize">
                                        {payout.contractType}
                                      </span>
                                      {payout.contractType === "monthly" && (
                                        <span className="text-xs text-muted-foreground">
                                          · Payment {payout.payoutNumber}/{payout.totalPayouts}
                                        </span>
                                      )}
                                      <span className="text-xs px-1.5 py-0.5 rounded"
                                        style={{ background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>
                                        {tc.label}
                                      </span>
                                      {payout.isReferral && (
                                        <span className="text-xs px-1.5 py-0.5 rounded"
                                          style={{ background: "oklch(0.55 0.22 300 / 0.15)", color: "oklch(0.70 0.18 300)", border: "1px solid oklch(0.55 0.22 300 / 0.3)" }}>
                                          Referral
                                        </span>
                                      )}
                                      {!payout.onboardingFeePaid && (
                                        <span className="text-xs px-1.5 py-0.5 rounded"
                                          style={{ background: "oklch(0.55 0.22 25 / 0.15)", color: "oklch(0.70 0.22 25)", border: "1px solid oklch(0.55 0.22 25 / 0.3)" }}>
                                          No onboarding fee
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                  <Banknote className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-sm font-semibold text-foreground">
                                    {fmt(payout.netCommissionGbp)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}

                          {/* Month subtotal */}
                          <div className="flex items-center justify-between pt-2 border-t border-border">
                            <span className="text-xs text-muted-foreground font-medium">Month total</span>
                            <span className="text-sm font-bold text-foreground">{fmt(month.totalGbp)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Running future total callout */}
        {(data?.totalFutureGbp ?? 0) > 0 && (filter === "all" || filter === "future") && (
          <div className="rounded-2xl p-5 border"
            style={{ background: "oklch(0.60 0.15 200 / 0.08)", borderColor: "oklch(0.60 0.15 200 / 0.3)" }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "oklch(0.60 0.15 200 / 0.2)" }}>
                <TrendingUp className="w-4 h-4" style={{ color: "oklch(0.75 0.12 200)" }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {fmt(data?.totalFutureGbp ?? 0)} in scheduled future payouts
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This is the total commission locked in from all your active monthly contracts,
                  based on the tier rate applied when each deal was signed.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
