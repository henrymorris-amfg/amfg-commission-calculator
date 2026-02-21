import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MONTH_NAMES } from "../../../shared/commission";
import { Save, ChevronLeft, ChevronRight, Info } from "lucide-react";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

export default function MetricsPage() {
  const [, navigate] = useLocation();
  const { ae, isLoading } = useAeAuth();

  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(CURRENT_MONTH);

  const [arrUsd, setArrUsd] = useState("");
  const [demosTotal, setDemosTotal] = useState("");
  const [dialsTotal, setDialsTotal] = useState("");
  const [retentionRate, setRetentionRate] = useState("");

  const utils = trpc.useUtils();

  const { data: existing, isLoading: metricLoading } = trpc.metrics.getForMonth.useQuery(
    { year, month },
    { enabled: !!ae }
  );

  const { data: allMetrics = [] } = trpc.metrics.list.useQuery(undefined, { enabled: !!ae });

  const upsertMutation = trpc.metrics.upsert.useMutation({
    onSuccess: () => {
      toast.success(`Metrics saved for ${MONTH_NAMES[month - 1]} ${year}`);
      utils.metrics.list.invalidate();
      utils.metrics.getForMonth.invalidate({ year, month });
      utils.tier.calculate.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Populate form when existing data loads
  useEffect(() => {
    if (existing) {
      setArrUsd(String(existing.arrUsd));
      setDemosTotal(String(existing.demosTotal));
      setDialsTotal(String(existing.dialsTotal));
      setRetentionRate(existing.retentionRate != null ? String(existing.retentionRate) : "");
    } else if (!metricLoading) {
      setArrUsd("");
      setDemosTotal("");
      setDialsTotal("");
      setRetentionRate("");
    }
  }, [existing, metricLoading, year, month]);

  useEffect(() => {
    if (!isLoading && !ae) navigate("/");
  }, [ae, isLoading]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const handleSave = () => {
    const arr = parseFloat(arrUsd) || 0;
    const demos = parseInt(demosTotal) || 0;
    const dials = parseInt(dialsTotal) || 0;
    const retention = retentionRate ? parseFloat(retentionRate) : undefined;

    if (retention !== undefined && (retention < 0 || retention > 100)) {
      return toast.error("Retention rate must be between 0 and 100.");
    }

    upsertMutation.mutate({ year, month, arrUsd: arr, demosTotal: demos, dialsTotal: dials, retentionRate: retention });
  };

  if (isLoading || !ae) return null;

  // Compute rolling averages for preview
  const sortedMetrics = [...allMetrics].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return b.month - a.month;
  });

  const targetDate = new Date(year, month - 1, 1);
  const last3 = sortedMetrics
    .filter((m) => new Date(m.year, m.month - 1, 1) < targetDate)
    .slice(0, 3);

  const last6 = sortedMetrics
    .filter((m) => new Date(m.year, m.month - 1, 1) < targetDate)
    .slice(0, 6);

  const avgArr = last3.length > 0 ? last3.reduce((s, m) => s + m.arrUsd, 0) / last3.length : null;
  const avgDemosPw = last3.length > 0 ? last3.reduce((s, m) => s + m.demosTotal, 0) / 12 : null;
  const avgDialsPw = last3.length > 0 ? last3.reduce((s, m) => s + m.dialsTotal, 0) / 12 : null;
  const withRetention = last6.filter((m) => m.retentionRate != null);
  const avgRetention = withRetention.length > 0
    ? withRetention.reduce((s, m) => s + (m.retentionRate ?? 0), 0) / withRetention.length
    : null;

  return (
    <AppLayout>
      <div className="p-8 space-y-8 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-4xl text-foreground">Activity Metrics</h1>
          <p className="text-muted-foreground mt-1">
            Enter your monthly totals. Averages are calculated automatically.
          </p>
        </div>

        {/* Month Selector */}
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="w-9 h-9 rounded-xl border border-border bg-card hover:bg-secondary flex items-center justify-center transition-colors">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex-1 text-center">
            <p className="text-xl font-semibold text-foreground">{MONTH_NAMES[month - 1]} {year}</p>
            {existing && <p className="text-xs text-primary mt-0.5">Data saved</p>}
          </div>
          <button onClick={nextMonth} className="w-9 h-9 rounded-xl border border-border bg-card hover:bg-secondary flex items-center justify-center transition-colors">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Form */}
          <div className="rounded-2xl bg-card border border-border p-6 space-y-5">
            <h3 className="text-base font-semibold text-foreground">Monthly Totals</h3>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">New ARR Signed (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  min="0"
                  value={arrUsd}
                  onChange={(e) => setArrUsd(e.target.value)}
                  placeholder="0"
                  className="pl-7 bg-input border-border focus:border-primary h-11"
                />
              </div>
              <p className="text-xs text-muted-foreground">Total new ARR signed this month (excluding onboarding fees)</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Total Demos Done</Label>
              <Input
                type="number"
                min="0"
                value={demosTotal}
                onChange={(e) => setDemosTotal(e.target.value)}
                placeholder="0"
                className="bg-input border-border focus:border-primary h-11"
              />
              <p className="text-xs text-muted-foreground">Total demos done this month (divided by 12 weeks for pw average)</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Total Dials</Label>
              <Input
                type="number"
                min="0"
                value={dialsTotal}
                onChange={(e) => setDialsTotal(e.target.value)}
                placeholder="0"
                className="bg-input border-border focus:border-primary h-11"
              />
              <p className="text-xs text-muted-foreground">Total dials this month (divided by 12 weeks for pw average)</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Retention Rate (%)</Label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={retentionRate}
                  onChange={(e) => setRetentionRate(e.target.value)}
                  placeholder="e.g. 71.5"
                  className="pr-8 bg-input border-border focus:border-primary h-11"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
              <p className="text-xs text-muted-foreground">6-month average annualised retention score</p>
            </div>

            <Button
              onClick={handleSave}
              disabled={upsertMutation.isPending}
              className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2"
            >
              {upsertMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Saving...
                </span>
              ) : (
                <span className="flex items-center gap-2"><Save className="w-4 h-4" />Save Metrics</span>
              )}
            </Button>
          </div>

          {/* Rolling Averages Preview */}
          <div className="space-y-4">
            <div className="rounded-2xl bg-card border border-border p-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-base font-semibold text-foreground">Rolling Averages</h3>
                <div className="group relative">
                  <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Used to determine your tier for <span className="text-foreground font-medium">{MONTH_NAMES[month - 1]} {year}</span>.
                Based on the 3 months prior.
              </p>

              {last3.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No prior months entered yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {[
                    {
                      label: "Avg ARR / Month",
                      value: avgArr != null ? `$${avgArr.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—",
                      target: "$20k (Silver) / $25k (Gold)",
                    },
                    {
                      label: "Demos Done / wk",
                      value: avgDemosPw != null ? avgDemosPw.toFixed(1) : "—",
                      target: "3/wk (Silver) / 4/wk (Gold)",
                    },
                    {
                      label: "Dials / wk",
                      value: avgDialsPw != null ? avgDialsPw.toFixed(0) : "—",
                      target: "100/wk (Silver) / 200/wk (Gold)",
                    },
                    {
                      label: "Avg Retention (6mo)",
                      value: avgRetention != null ? `${avgRetention.toFixed(1)}%` : "—",
                      target: "61%+ (Silver) / 71%+ (Gold)",
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.target}</p>
                      </div>
                      <p className="text-sm font-bold text-primary">{item.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent months table */}
            <div className="rounded-2xl bg-card border border-border p-6">
              <h3 className="text-base font-semibold text-foreground mb-4">Recent Months</h3>
              {sortedMetrics.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No data yet.</p>
              ) : (
                <div className="space-y-2">
                  {sortedMetrics.slice(0, 6).map((m) => (
                    <div key={`${m.year}-${m.month}`}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors cursor-pointer ${m.year === year && m.month === month ? "bg-primary/10 border border-primary/20" : "bg-secondary/50 hover:bg-secondary"}`}
                      onClick={() => { setYear(m.year); setMonth(m.month); }}
                    >
                      <span className="font-medium text-foreground">{MONTH_NAMES[m.month - 1]} {m.year}</span>
                      <span className="text-muted-foreground text-xs">
                        ${m.arrUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} ARR · {m.demosTotal} demos · {m.dialsTotal} dials
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
