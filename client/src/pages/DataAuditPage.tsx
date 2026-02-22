import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  XCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MetricRow = {
  year: number;
  month: number;
  arrUsd: number;
  demosTotal: number;
  dialsTotal: number;
  retentionRate: number | null;
  connectedDials: number;
  connectionRate: number | null;
};

type AeData = {
  aeId: number;
  aeName: string;
  joinDate: Date | string;
  isTeamLeader: boolean;
  metrics: MetricRow[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthLabel(year: number, month: number) {
  return `${MONTH_NAMES[month - 1]} ${String(year).slice(2)}`;
}

function getMonthsSinceJoin(joinDate: Date | string): Array<{ year: number; month: number }> {
  const join = new Date(joinDate);
  const now = new Date();
  const months: Array<{ year: number; month: number }> = [];
  let y = join.getFullYear();
  let m = join.getMonth() + 1;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    months.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

type CellStatus = "ok" | "missing" | "partial" | "future";

function getCellStatus(metric: MetricRow | undefined, field: "arr" | "demos" | "dials"): CellStatus {
  if (!metric) return "missing";
  if (field === "arr") return metric.arrUsd > 0 ? "ok" : "missing";
  if (field === "demos") return metric.demosTotal > 0 ? "ok" : "missing";
  if (field === "dials") return metric.dialsTotal > 0 ? "ok" : "missing";
  return "missing";
}

function cellBg(status: CellStatus): string {
  switch (status) {
    case "ok": return "bg-emerald-500/10 text-emerald-400";
    case "missing": return "bg-red-500/10 text-red-400";
    case "partial": return "bg-amber-500/10 text-amber-400";
    default: return "text-muted-foreground/40";
  }
}

function formatK(n: number): string {
  if (n === 0) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DataAuditPage() {
  const { ae, isLoading } = useAeAuth();
  const [, navigate] = useLocation();
  const [selectedAe, setSelectedAe] = useState<number | "all">("all");
  const [view, setView] = useState<"arr" | "demos" | "dials">("demos");

  const auditQuery = trpc.dataAudit.allMetrics.useQuery(undefined, {
    retry: false,
    enabled: !!ae,
  });

  const [importResult, setImportResult] = useState<{
    imported: string[];
    skipped: string[];
    errors: string[];
    totalImported: number;
  } | null>(null);

  const reimportMutation = trpc.pipedriveSync.importDeals.useMutation({
    onSuccess: (data) => {
      setImportResult(data);
      auditQuery.refetch();
      toast.success(`Re-import complete — ${data.totalImported} deal${data.totalImported !== 1 ? "s" : ""} imported`);
    },
    onError: (err) => {
      toast.error(`Re-import failed: ${err.message}`);
    },
  });

  useEffect(() => {
    if (!isLoading && !ae) navigate("/");
    if (!isLoading && ae && !ae.isTeamLeader) navigate("/dashboard");
  }, [ae, isLoading]);

  if (isLoading || !ae || !ae.isTeamLeader) return null;

  const data: AeData[] = auditQuery.data ?? [];
  const filteredData = selectedAe === "all"
    ? data
    : data.filter((d) => d.aeId === selectedAe);

  // Build a unified list of all months across all AEs
  const allMonthSet = new Set<string>();
  for (const ae of data) {
    for (const m of ae.metrics) {
      allMonthSet.add(`${m.year}-${m.month}`);
    }
  }
  const allMonths = Array.from(allMonthSet)
    .map((k) => {
      const [y, m] = k.split("-").map(Number);
      return { year: y, month: m };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month);

  // Count data gaps per AE
  const gapCounts = data.map((ae) => {
    const expectedMonths = getMonthsSinceJoin(ae.joinDate);
    const metricMap = new Map(ae.metrics.map((m) => [`${m.year}-${m.month}`, m]));
    let gaps = 0;
    for (const { year, month } of expectedMonths) {
      const m = metricMap.get(`${year}-${month}`);
      if (!m || (m.arrUsd === 0 && m.demosTotal === 0 && m.dialsTotal === 0)) gaps++;
    }
    return { aeId: ae.aeId, aeName: ae.aeName, gaps, total: expectedMonths.length };
  });

  const totalGaps = gapCounts.reduce((s, g) => s + g.gaps, 0);

  return (
    <AppLayout>
      <div className="max-w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-primary" />
              Data Audit
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monthly metrics for all AEs — spot missing ARR, demos, or dials at a glance.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {!auditQuery.isLoading && (
              <>
                {totalGaps === 0 ? (
                  <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    All data complete
                  </Badge>
                ) : (
                  <Badge className="bg-red-500/15 text-red-400 border-red-500/30 gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {totalGaps} month{totalGaps !== 1 ? "s" : ""} missing data
                  </Badge>
                )}
              </>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setImportResult(null);
                reimportMutation.mutate({ useJoinDate: true });
              }}
              disabled={reimportMutation.isPending}
              className="gap-2"
            >
              {reimportMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {reimportMutation.isPending ? "Re-importing…" : "Re-import All Deals"}
            </Button>
          </div>
        </div>

        {/* Loading */}
        {auditQuery.isLoading && (
          <div className="rounded-2xl bg-card border border-border p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading metrics for all AEs…</p>
          </div>
        )}

        {/* Error */}
        {auditQuery.error && (
          <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-5">
            <p className="text-sm font-medium text-destructive">Failed to load audit data</p>
            <p className="text-xs text-muted-foreground mt-1">{auditQuery.error.message}</p>
          </div>
        )}

        {auditQuery.data && (
          <>
            {/* Gap summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {gapCounts.map((g) => (
                <button
                  key={g.aeId}
                  onClick={() => setSelectedAe(selectedAe === g.aeId ? "all" : g.aeId)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    selectedAe === g.aeId
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <p className="text-sm font-semibold text-foreground">{g.aeName.split(" ")[0]}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{g.aeName.split(" ").slice(1).join(" ")}</p>
                  <div className="mt-2 flex items-baseline gap-1">
                    {g.gaps === 0 ? (
                      <span className="text-emerald-400 text-xs font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Complete
                      </span>
                    ) : (
                      <span className="text-red-400 text-xs font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {g.gaps} gap{g.gaps !== 1 ? "s" : ""}
                      </span>
                    )}
                    <span className="text-muted-foreground text-xs">/ {g.total}mo</span>
                  </div>
                </button>
              ))}
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-medium">Show:</span>
              <div className="flex rounded-lg border border-border overflow-hidden">
                {(["demos", "dials", "arr"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-4 py-1.5 text-xs font-medium transition-colors capitalize ${
                      view === v
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    {v === "arr" ? "ARR" : v === "demos" ? "Demos Done" : "Dials"}
                  </button>
                ))}
              </div>
              {selectedAe !== "all" && (
                <button
                  onClick={() => setSelectedAe("all")}
                  className="text-xs text-primary hover:underline"
                >
                  Show all AEs
                </button>
              )}
            </div>

            {/* Main audit table */}
            <div className="rounded-2xl bg-card border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground sticky left-0 bg-card z-10 min-w-[120px]">
                      AE
                    </th>
                    {allMonths.map(({ year, month }) => (
                      <th
                        key={`${year}-${month}`}
                        className="text-center px-2 py-3 font-medium text-muted-foreground min-w-[56px]"
                      >
                        {monthLabel(year, month)}
                      </th>
                    ))}
                    <th className="text-center px-3 py-3 font-semibold text-muted-foreground min-w-[64px]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((aeRow) => {
                    const metricMap = new Map(
                      aeRow.metrics.map((m) => [`${m.year}-${m.month}`, m])
                    );
                    const expectedMonths = new Set(
                      getMonthsSinceJoin(aeRow.joinDate).map((m) => `${m.year}-${m.month}`)
                    );

                    let total = 0;
                    if (view === "arr") {
                      total = aeRow.metrics.reduce((s, m) => s + m.arrUsd, 0);
                    } else if (view === "demos") {
                      total = aeRow.metrics.reduce((s, m) => s + m.demosTotal, 0);
                    } else {
                      total = aeRow.metrics.reduce((s, m) => s + m.dialsTotal, 0);
                    }

                    return (
                      <tr key={aeRow.aeId} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-foreground sticky left-0 bg-card z-10">
                          <div className="flex items-center gap-1.5">
                            <span>{aeRow.aeName}</span>
                            {aeRow.isTeamLeader && (
                              <TrendingUp className="w-3 h-3 text-primary shrink-0" />
                            )}
                          </div>
                          <div className="text-muted-foreground text-[10px] mt-0.5">
                            Joined {new Date(aeRow.joinDate).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}
                          </div>
                        </td>
                        {allMonths.map(({ year, month }) => {
                          const key = `${year}-${month}`;
                          const metric = metricMap.get(key);
                          const isExpected = expectedMonths.has(key);

                          if (!isExpected) {
                            // Before join date — show as N/A
                            return (
                              <td key={key} className="text-center px-2 py-2.5 text-muted-foreground/20">
                                —
                              </td>
                            );
                          }

                          const status = getCellStatus(metric, view);
                          let displayValue = "—";
                          if (metric) {
                            if (view === "arr") displayValue = formatK(metric.arrUsd);
                            else if (view === "demos") displayValue = metric.demosTotal > 0 ? String(metric.demosTotal) : "0";
                            else displayValue = metric.dialsTotal > 0 ? String(metric.dialsTotal) : "0";
                          }

                          return (
                            <td key={key} className="text-center px-2 py-2.5">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium min-w-[36px] ${cellBg(status)}`}
                                title={
                                  status === "missing"
                                    ? `${aeRow.aeName}: ${view} data missing for ${monthLabel(year, month)}`
                                    : undefined
                                }
                              >
                                {displayValue}
                              </span>
                            </td>
                          );
                        })}
                        <td className="text-center px-3 py-2.5 font-semibold text-foreground">
                          {view === "arr" ? formatK(total) : total.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Re-import result panel */}
            {importResult && (
              <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Re-import Results</h3>
                  <button onClick={() => setImportResult(null)} className="text-muted-foreground hover:text-foreground">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{importResult.totalImported}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Imported</p>
                  </div>
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-center">
                    <p className="text-2xl font-bold text-amber-400">{importResult.skipped.length}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Skipped</p>
                  </div>
                  <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-center">
                    <p className="text-2xl font-bold text-red-400">{importResult.errors.length}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Errors</p>
                  </div>
                </div>
                {importResult.imported.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-emerald-400">Imported deals:</p>
                    <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                      {importResult.imported.map((s, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {importResult.errors.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-red-400">Errors:</p>
                    <ul className="space-y-0.5">
                      {importResult.errors.map((s, i) => (
                        <li key={i} className="text-xs text-red-400 flex items-start gap-1.5">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/30" />
                Data present
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded bg-red-500/20 border border-red-500/30" />
                Missing / zero
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground/40">—</span>
                Before join date
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
