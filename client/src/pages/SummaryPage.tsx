import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { MONTH_NAMES } from "../../../shared/commission";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ChevronDown, ChevronUp, TrendingUp, PoundSterling } from "lucide-react";

const TIER_CONFIG = {
  bronze: { label: "Bronze", color: "oklch(0.65 0.12 55)" },
  silver: { label: "Silver", color: "oklch(0.82 0.02 250)" },
  gold: { label: "Gold", color: "oklch(0.88 0.14 75)" },
};

export default function SummaryPage() {
  const [, navigate] = useLocation();
  const { ae, isLoading } = useAeAuth();
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const { data: summary = [], isLoading: summaryLoading } = trpc.commission.monthlySummary.useQuery(
    undefined,
    { enabled: !!ae }
  );

  const { data: fxData } = trpc.commission.fxRate.useQuery(undefined, { enabled: !!ae });

  useEffect(() => {
    if (!isLoading && !ae) navigate("/");
  }, [ae, isLoading]);

  if (isLoading || !ae) return null;

  const totalGbp = summary.reduce((s, m) => s + m.totalGbp, 0);
  const totalUsd = summary.reduce((s, m) => s + m.totalUsd, 0);

  // Chart data — last 12 months
  const chartData = [...summary]
    .sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month))
    .slice(-12)
    .map((m) => ({
      name: `${MONTH_NAMES[m.month - 1].slice(0, 3)} ${String(m.year).slice(2)}`,
      gbp: parseFloat(m.totalGbp.toFixed(2)),
      year: m.year,
      month: m.month,
    }));

  const maxGbp = Math.max(...chartData.map((d) => d.gbp), 1);

  return (
    <AppLayout>
      <div className="p-8 space-y-8 max-w-5xl">
        {/* Header */}
        <div>
          <h1 className="text-4xl text-foreground">Commission Summary</h1>
          <p className="text-muted-foreground mt-1">
            Your total earnings breakdown by month.
          </p>
        </div>

        {/* Top Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              label: "Total Earned (GBP)",
              value: `£${totalGbp.toFixed(2)}`,
              sub: "All time net commission",
              icon: PoundSterling,
              color: "oklch(0.88 0.14 75)",
            },
            {
              label: "Total Earned (USD)",
              value: `$${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
              sub: "Before FX conversion",
              icon: TrendingUp,
              color: "oklch(0.60 0.15 200)",
            },
            {
              label: "Months Active",
              value: String(summary.length),
              sub: "Months with commission",
              icon: TrendingUp,
              color: "oklch(0.65 0.12 55)",
            },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-2xl bg-card border border-border p-5">
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

        {/* Chart */}
        {chartData.length > 0 && (
          <div className="rounded-2xl bg-card border border-border p-6">
            <h3 className="text-base font-semibold text-foreground mb-6">Monthly Commission (GBP)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barSize={28}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: "oklch(0.55 0.01 250)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "oklch(0.55 0.01 250)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `£${v}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.16 0.018 250)",
                    border: "1px solid oklch(0.25 0.02 250)",
                    borderRadius: "12px",
                    color: "oklch(0.96 0.005 60)",
                    fontSize: "12px",
                  }}
                  formatter={(v: number) => [`£${v.toFixed(2)}`, "Commission"]}
                  cursor={{ fill: "oklch(0.20 0.018 250)" }}
                />
                <Bar dataKey="gbp" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={`oklch(0.78 0.12 75 / ${0.4 + 0.6 * (entry.gbp / maxGbp)})`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Monthly Breakdown */}
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-base font-semibold text-foreground">Monthly Breakdown</h3>
          </div>

          {summaryLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : summary.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-sm">No commission data yet. Log some deals first.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {summary.map((month) => {
                const key = `${month.year}-${month.month}`;
                const isExpanded = expandedMonth === key;
                return (
                  <div key={key}>
                    <div
                      className="flex items-center justify-between px-6 py-4 hover:bg-secondary/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedMonth(isExpanded ? null : key)}
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {MONTH_NAMES[month.month - 1]} {month.year}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {month.payouts.length} payout{month.payouts.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-muted-foreground">USD</p>
                          <p className="text-sm text-muted-foreground">
                            ${month.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">GBP</p>
                          <p className="text-base font-bold text-primary">
                            £{month.totalGbp.toFixed(2)}
                          </p>
                        </div>
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-6 pb-5 bg-secondary/20">
                        <div className="pt-4 border-t border-border space-y-2">
                          {month.payouts.map((p, i) => {
                            const tc = TIER_CONFIG[p.tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.bronze;
                            return (
                              <div key={i} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-card border border-border">
                                <div className="flex items-center gap-3">
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tc.color }} />
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{p.customerName}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Payout #{p.payoutNumber} · <span style={{ color: tc.color }}>{tc.label}</span>
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-muted-foreground">${p.netCommissionUsd.toFixed(2)}</p>
                                  <p className="text-sm font-bold" style={{ color: tc.color }}>
                                    £{p.netCommissionGbp.toFixed(2)}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                          <div className="flex justify-between items-center pt-2 px-1">
                            <p className="text-sm font-semibold text-foreground">Month Total</p>
                            <p className="text-base font-bold text-primary">£{month.totalGbp.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FX Note */}
        {fxData && (
          <p className="text-xs text-muted-foreground text-center">
            Commission amounts are calculated using the FX rate at the time each deal was logged.
            Current rate: 1 USD = £{fxData.usdToGbp.toFixed(4)} GBP.
          </p>
        )}
      </div>
    </AppLayout>
  );
}
