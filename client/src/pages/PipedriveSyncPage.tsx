import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  DollarSign,
  Info,
  Loader2,
  RefreshCw,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

interface ImportResult {
  success: boolean;
  updatedMetrics: string[];
  skippedAes: string[];
  totalImported: number;
}

export default function PipedriveSyncPage() {
  const { ae } = useAeAuth();
  const [, navigate] = useLocation();
  const [monthsToSync, setMonthsToSync] = useState(4);
  const [mergeMode, setMergeMode] = useState<"replace" | "add">("replace");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Redirect non-team-leaders
  if (ae && !ae.isTeamLeader) {
    navigate("/dashboard");
    return null;
  }

  // Status check
  const statusQuery = trpc.pipedriveSync.status.useQuery(undefined, {
    retry: false,
  });

  // Preview query
  const previewQuery = trpc.pipedriveSync.preview.useQuery(
    { months: monthsToSync },
    { enabled: false, retry: false }
  );

  // Import mutation
  const importMutation = trpc.pipedriveSync.import.useMutation({
    onSuccess: (data) => {
      setImportResult(data);
      toast.success(
        `Pipedrive sync complete — ${data.totalImported} month records updated.`
      );
    },
    onError: (err) => {
      toast.error(`Sync failed: ${err.message}`);
    },
  });

  const handlePreview = () => {
    previewQuery.refetch();
  };

  const handleImport = () => {
    importMutation.mutate({ months: monthsToSync, mergeMode });
  };

  const previewData = previewQuery.data;

  // Compute summary stats from preview
  const totalDeals = previewData?.results.reduce((s, r) => s + r.totalDeals, 0) ?? 0;
  const totalArr = previewData?.results.reduce((s, r) => s + r.totalArrUsd, 0) ?? 0;
  const notFoundAes = previewData?.results.filter((r) => r.notFound) ?? [];
  const foundAes = previewData?.results.filter((r) => !r.notFound) ?? [];

  // Collect all unique months for column headers
  const allMonths: Array<{ year: number; month: number; key: string }> = [];
  if (previewData) {
    const seen = new Set<string>();
    for (const r of previewData.results) {
      for (const m of r.monthlyArr) {
        const key = `${m.calYear}-${m.calMonth}`;
        if (!seen.has(key)) {
          seen.add(key);
          allMonths.push({ year: m.calYear, month: m.calMonth, key });
        }
      }
    }
    allMonths.sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month));
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Zap className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Pipedrive Sync</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-xl">
              Pull won deal ARR from Pipedrive and auto-populate monthly metrics for each AE.
              Reads from the <strong className="text-foreground">Machining</strong>,{" "}
              <strong className="text-foreground">Closing SMB</strong>, and{" "}
              <strong className="text-foreground">Closing Enterprise</strong> pipelines.
            </p>
          </div>
          <Badge variant="outline" className="text-xs shrink-0 border-primary/30 text-primary">
            Team Leader Only
          </Badge>
        </div>

        {/* API Status */}
        <div
          className={`rounded-2xl border p-4 flex items-center gap-3 ${
            statusQuery.data?.working
              ? "bg-green-500/5 border-green-500/20"
              : statusQuery.data?.configured === false
              ? "bg-destructive/5 border-destructive/20"
              : "bg-card border-border"
          }`}
        >
          {statusQuery.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : statusQuery.data?.working ? (
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          )}
          <div>
            {statusQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Checking Pipedrive connection...</p>
            ) : statusQuery.data?.working ? (
              <p className="text-sm text-foreground">
                Connected to Pipedrive as{" "}
                <strong>{statusQuery.data.user}</strong>
              </p>
            ) : statusQuery.data?.configured === false ? (
              <p className="text-sm text-destructive">
                PIPEDRIVE_API_KEY is not configured. Add it to your environment variables.
              </p>
            ) : (
              <p className="text-sm text-destructive">
                Pipedrive API key is set but the connection failed. Check the key is valid.
              </p>
            )}
          </div>
        </div>

        {/* Info card */}
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="flex gap-3">
            <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">How this works</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                For each AE registered in the commission calculator, Manus looks up their name
                in Pipedrive, fetches all won deals in the target pipelines for the selected
                date range, converts values to USD using live FX rates, and aggregates total
                ARR per calendar month. The ARR is then written into each AE's monthly metrics
                — preserving their existing dials and demos data.
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <h2 className="text-base font-semibold text-foreground">Sync Settings</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Months to sync
              </label>
              <div className="flex gap-2">
                {[2, 3, 4, 6].map((n) => (
                  <button
                    key={n}
                    onClick={() => setMonthsToSync(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                      monthsToSync === n
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Merge mode
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMergeMode("replace")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                    mergeMode === "replace"
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  Replace
                </button>
                <button
                  onClick={() => setMergeMode("add")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                    mergeMode === "add"
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  Add to existing
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {mergeMode === "replace"
                  ? "Sets ARR to the Pipedrive total, overwriting any existing value."
                  : "Adds Pipedrive ARR on top of the existing value in the database."}
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              onClick={handlePreview}
              disabled={previewQuery.isFetching || !statusQuery.data?.working}
              variant="outline"
              className="gap-2"
            >
              {previewQuery.isFetching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Preview Data
            </Button>
            <Button
              onClick={handleImport}
              disabled={
                importMutation.isPending ||
                !previewData ||
                !statusQuery.data?.working
              }
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {importMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowDownToLine className="w-4 h-4" />
              )}
              Sync to Database
            </Button>
          </div>
        </div>

        {/* Error state */}
        {previewQuery.error && (
          <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-5 flex gap-3">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">Failed to fetch Pipedrive data</p>
              <p className="text-xs text-muted-foreground mt-1">{previewQuery.error.message}</p>
            </div>
          </div>
        )}

        {/* Import success */}
        {importResult && (
          <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <h2 className="text-base font-semibold text-foreground">Sync Complete</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-secondary/50 p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{importResult.totalImported}</p>
                <p className="text-xs text-muted-foreground mt-1">Month records updated</p>
              </div>
              <div className="rounded-xl bg-secondary/50 p-4 text-center">
                <p className="text-2xl font-bold text-foreground">
                  {importResult.updatedMetrics.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">ARR entries written</p>
              </div>
              <div className="rounded-xl bg-secondary/50 p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{importResult.skippedAes.length}</p>
                <p className="text-xs text-muted-foreground mt-1">AEs not found in Pipedrive</p>
              </div>
            </div>
            {importResult.skippedAes.length > 0 && (
              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  <p className="text-xs font-medium text-amber-400">
                    AEs not matched in Pipedrive
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {importResult.skippedAes.map((name) => (
                    <Badge
                      key={name}
                      variant="outline"
                      className="text-xs border-amber-500/30 text-amber-400"
                    >
                      {name}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  These AEs could not be matched to a Pipedrive user. Check their name in the
                  commission calculator matches their name in Pipedrive exactly.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Preview loading */}
        {previewQuery.isFetching && (
          <div className="rounded-2xl bg-card border border-border p-10 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Fetching won deals from Pipedrive for all AEs...
            </p>
            <p className="text-xs text-muted-foreground mt-1">This may take a few seconds.</p>
          </div>
        )}

        {/* Preview data */}
        {previewData && !previewQuery.isFetching && (
          <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl bg-card border border-border p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">AEs matched</p>
                </div>
                <p className="text-xl font-bold text-foreground">{foundAes.length}</p>
              </div>
              <div className="rounded-2xl bg-card border border-border p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Won deals</p>
                </div>
                <p className="text-xl font-bold text-foreground">{totalDeals}</p>
              </div>
              <div className="rounded-2xl bg-card border border-border p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Total ARR (USD)</p>
                </div>
                <p className="text-xl font-bold text-foreground">{formatUsd(totalArr)}</p>
              </div>
              <div className="rounded-2xl bg-card border border-border p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Not in Pipedrive</p>
                </div>
                <p className="text-xl font-bold text-foreground">{notFoundAes.length}</p>
              </div>
            </div>

            {/* Main preview table */}
            <div className="rounded-2xl bg-card border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold text-foreground">
                  Preview — Won Deals ARR by AE
                </p>
                <div className="flex gap-2 ml-auto flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {previewData.fromDate} → {previewData.toDate}
                  </Badge>
                  {previewData.targetPipelines.map((p) => (
                    <Badge key={p.id} variant="outline" className="text-xs border-primary/30 text-primary">
                      {p.name}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">
                        AE Name
                      </th>
                      {allMonths.map(({ year, month, key }) => (
                        <th
                          key={key}
                          className="text-right px-4 py-3 text-xs font-medium text-muted-foreground min-w-[110px]"
                        >
                          {MONTH_NAMES[month - 1]} {year}
                        </th>
                      ))}
                      <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">
                        Total
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">
                        Deals
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.results.map((r) => {
                      const monthMap = new Map(
                        r.monthlyArr.map((m) => [`${m.calYear}-${m.calMonth}`, m])
                      );
                      return (
                        <tr
                          key={r.aeId}
                          className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${
                            r.notFound ? "opacity-50" : ""
                          }`}
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                                <span className="text-xs font-semibold text-primary">
                                  {r.aeName.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{r.aeName}</p>
                                {r.notFound && (
                                  <p className="text-xs text-amber-400">Not found in Pipedrive</p>
                                )}
                              </div>
                            </div>
                          </td>
                          {allMonths.map(({ year, month, key }) => {
                            const data = monthMap.get(`${year}-${month}`);
                            return (
                              <td key={key} className="text-right px-4 py-3 text-sm">
                                {data ? (
                                  <div>
                                    <span className="font-medium text-foreground">
                                      {formatUsd(data.totalArrUsd)}
                                    </span>
                                    <span className="text-xs text-muted-foreground ml-1">
                                      ({data.dealCount}d)
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="text-right px-5 py-3 text-sm font-semibold text-foreground">
                            {r.totalArrUsd > 0 ? formatUsd(r.totalArrUsd) : "—"}
                          </td>
                          <td className="text-center px-4 py-3 text-sm text-muted-foreground">
                            {r.totalDeals > 0 ? r.totalDeals : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals row */}
                    <tr className="border-t-2 border-border bg-secondary/20">
                      <td className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Total
                      </td>
                      {allMonths.map(({ year, month, key }) => {
                        const monthTotal = previewData.results.reduce((sum, r) => {
                          const data = r.monthlyArr.find(
                            (m) => m.calYear === year && m.calMonth === month
                          );
                          return sum + (data?.totalArrUsd ?? 0);
                        }, 0);
                        return (
                          <td key={key} className="text-right px-4 py-3 text-sm font-semibold text-foreground">
                            {monthTotal > 0 ? formatUsd(monthTotal) : "—"}
                          </td>
                        );
                      })}
                      <td className="text-right px-5 py-3 text-sm font-bold text-foreground">
                        {formatUsd(totalArr)}
                      </td>
                      <td className="text-center px-4 py-3 text-sm font-semibold text-foreground">
                        {totalDeals}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-border bg-secondary/10">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Note:</strong> Values are converted to USD
                  using live exchange rates. Deal counts shown as{" "}
                  <span className="font-mono">(Nd)</span> next to each value. Dials and demos
                  data are preserved — only ARR is updated by this sync.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!previewData && !previewQuery.isFetching && !previewQuery.error && (
          <div className="rounded-2xl bg-card border border-border p-10 text-center">
            <Zap className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No preview loaded yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Click "Preview Data" to fetch won deals from Pipedrive and review before syncing.
            </p>
            <Button
              onClick={handlePreview}
              disabled={!statusQuery.data?.working}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Preview Data
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
