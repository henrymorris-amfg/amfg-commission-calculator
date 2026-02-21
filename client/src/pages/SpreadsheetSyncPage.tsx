import React, { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  RefreshCw,
  UserPlus,
  Users,
  Clock,
  Play,
  CalendarClock,
  Zap,
} from "lucide-react";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface MonthlyAggregate {
  aeName: string;
  calYear: number;
  calMonth: number;
  totalDials: number;
  totalDemos: number;
  weeksCount: number;
  isTeamLead: boolean;
}

interface ImportResult {
  createdAes: string[];
  updatedMetrics: string[];
  totalImported: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uniqueStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((s) => {
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SpreadsheetSyncPage() {
  const { ae } = useAeAuth();
  const [, navigate] = useLocation();
  const [monthsToImport, setMonthsToImport] = useState(4);
  const [defaultPin, setDefaultPin] = useState("1234");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Auto-sync status
  const syncStatusQuery = trpc.spreadsheetSync.syncStatus.useQuery(undefined, {
    refetchInterval: 60_000, // refresh every minute
    retry: false,
  });

  // Manual trigger mutation
  const triggerSyncMutation = trpc.spreadsheetSync.triggerSync.useMutation({
    onSuccess: (data) => {
      syncStatusQuery.refetch();
      if (data.success) {
        toast.success(
          `Sync complete — ${data.spreadsheet.recordsUpdated} spreadsheet records, ` +
          `${data.pipedrive.recordsUpdated} Pipedrive records updated.`
        );
      } else {
        toast.warning("Sync completed with some errors. Check the status panel for details.");
      }
    },
    onError: (err) => {
      toast.error(`Sync failed: ${err.message}`);
    },
  });

  // Preview query
  const previewQuery = trpc.spreadsheetSync.preview.useQuery(
    { months: monthsToImport },
    { enabled: false, retry: false }
  );

  // Import mutation
  const importMutation = trpc.spreadsheetSync.import.useMutation({
    onSuccess: (data) => {
      setImportResult(data);
      const aeCount = uniqueStrings(data.updatedMetrics.map((m) => m.split(" ")[0])).length;
      toast.success(
        `Import complete — ${data.totalImported} month records updated across ${aeCount} AEs.`
      );
    },
    onError: (err) => {
      toast.error(`Import failed: ${err.message}`);
    },
  });

  // Redirect non-team-leaders (after all hooks)
  if (ae && !ae.isTeamLeader) {
    navigate("/dashboard");
    return null;
  }

  const handlePreview = () => {
    previewQuery.refetch();
  };

  const handleImport = () => {
    importMutation.mutate({
      months: monthsToImport,
      defaultPin,
      defaultJoinDate: "2024-01-01",
    });
  };

  const previewData = previewQuery.data;

  // Group aggregates by AE name for the preview table
  const byAe: Record<string, MonthlyAggregate[]> = {};
  if (previewData) {
    for (const agg of previewData.aggregates) {
      if (!byAe[agg.aeName]) byAe[agg.aeName] = [];
      byAe[agg.aeName].push(agg);
    }
  }

  const sortedAeNames = Object.keys(byAe).sort();

  // Get unique months for column headers
  const allMonths: Array<{ year: number; month: number; key: string }> = [];
  if (previewData) {
    const seen = new Set<string>();
    for (const a of previewData.aggregates) {
      const key = `${a.calYear}-${a.calMonth}`;
      if (!seen.has(key)) {
        seen.add(key);
        allMonths.push({ year: a.calYear, month: a.calMonth, key });
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
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Spreadsheet Sync</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-xl">
              Pull dials and demos data from the{" "}
              <span className="text-foreground font-medium">Sales Report</span> Google Sheet
              and auto-populate monthly activity metrics for each AE. ARR and retention
              rate must still be entered manually or synced from Pipedrive.
            </p>
          </div>
          <Badge variant="outline" className="text-xs shrink-0 border-primary/30 text-primary">
            Team Leader Only
          </Badge>
        </div>

        {/* Auto-sync status card */}
        <AutoSyncStatusCard
          status={syncStatusQuery.data ?? null}
          isLoading={syncStatusQuery.isLoading}
          isTriggerPending={triggerSyncMutation.isPending}
          onTrigger={() => triggerSyncMutation.mutate()}
        />

        {/* Info card */}
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="flex gap-3">
            <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">How this works</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The Sales Report sheet is updated every Monday by 7pm with the previous week's
                dials and demos per AE. This sync reads the last{" "}
                <strong className="text-foreground">{monthsToImport} months</strong> of weekly
                data, aggregates it into monthly totals, and writes it into each AE's activity
                metrics. New AEs found in the sheet will have profiles created automatically
                with the default PIN you set below.
              </p>
              <p className="text-xs text-muted-foreground">
                Spreadsheet:{" "}
                <a
                  href="https://docs.google.com/spreadsheets/d/11HPOZ7mkkN-OwhlALdGWicQUzCI0Fkuq_tz9tl1N1qc/edit?gid=321906789"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Sales Report (Google Sheets)
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <h2 className="text-base font-semibold text-foreground">Import Settings</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Months to import
              </label>
              <div className="flex gap-2">
                {[2, 3, 4, 6].map((n) => (
                  <button
                    key={n}
                    onClick={() => setMonthsToImport(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                      monthsToImport === n
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
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1.5 hover:text-foreground transition-colors"
              >
                Advanced settings
                {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showAdvanced && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Default PIN for new AEs
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={defaultPin}
                    onChange={(e) => setDefaultPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    className="w-full h-9 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="1234"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    New AEs will use this PIN to log in for the first time.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              onClick={handlePreview}
              disabled={previewQuery.isFetching}
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
              disabled={importMutation.isPending || !previewData}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {importMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Import to Database
            </Button>
          </div>
        </div>

        {/* Error state */}
        {previewQuery.error && (
          <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-5 flex gap-3">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">Failed to fetch sheet data</p>
              <p className="text-xs text-muted-foreground mt-1">{previewQuery.error.message}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Make sure the Google Drive integration is connected and the Sales Report sheet
                is accessible.
              </p>
            </div>
          </div>
        )}

        {/* Import success */}
        {importResult && (
          <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <h2 className="text-base font-semibold text-foreground">Import Complete</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-secondary/50 p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{importResult.totalImported}</p>
                <p className="text-xs text-muted-foreground mt-1">Month records updated</p>
              </div>
              <div className="rounded-xl bg-secondary/50 p-4 text-center">
                <p className="text-2xl font-bold text-foreground">
                  {uniqueStrings(importResult.updatedMetrics.map((m) => m.split(" ")[0])).length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">AEs updated</p>
              </div>
              <div className="rounded-xl bg-secondary/50 p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{importResult.createdAes.length}</p>
                <p className="text-xs text-muted-foreground mt-1">New AE profiles created</p>
              </div>
            </div>
            {importResult.createdAes.length > 0 && (
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <UserPlus className="w-3.5 h-3.5 text-primary" />
                  <p className="text-xs font-medium text-primary">New AE profiles created</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {importResult.createdAes.map((name) => (
                    <Badge key={name} variant="outline" className="text-xs border-primary/30 text-primary">
                      {name}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  These AEs have been created with the default PIN{" "}
                  <span className="font-mono text-foreground">{defaultPin}</span>. Ask them to
                  log in and update their PIN.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Preview table */}
        {previewData && !previewQuery.isFetching && (
          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            {/* Summary bar */}
            <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">
                  Preview — Last {monthsToImport} Months
                </span>
              </div>
              <div className="flex flex-wrap gap-2 ml-auto">
                <Badge variant="outline" className="text-xs">
                  Week {previewData.latestWeek} latest
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {previewData.aggregates.length} month records
                </Badge>
                {previewData.newAeNames.length > 0 && (
                  <Badge className="text-xs bg-amber-500/15 text-amber-400 border-amber-500/30">
                    {previewData.newAeNames.length} new AE{previewData.newAeNames.length > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
            </div>

            {/* New AE warning */}
            {previewData.newAeNames.length > 0 && (
              <div className="px-5 py-3 bg-amber-500/5 border-b border-amber-500/20 flex gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-300">
                  <strong>New AEs will be created:</strong>{" "}
                  {previewData.newAeNames.join(", ")}. They will be assigned the default PIN{" "}
                  <span className="font-mono">{defaultPin}</span> and a join date of 1 Jan 2024.
                  You can update their details after import.
                </p>
              </div>
            )}

            {/* Table */}
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
                        className="text-center px-3 py-3 text-xs font-medium text-muted-foreground min-w-[100px]"
                        colSpan={2}
                      >
                        {MONTH_NAMES[month - 1]} {year}
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b border-border bg-secondary/10">
                    <th className="text-left px-5 py-2 text-xs font-medium text-muted-foreground">
                      &nbsp;
                    </th>
                    {allMonths.map(({ key }) => (
                      <React.Fragment key={key}>
                        <th className="text-center px-2 py-2 text-xs text-muted-foreground/70">
                          Dials
                        </th>
                        <th className="text-center px-2 py-2 text-xs text-muted-foreground/70">
                          Demos
                        </th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedAeNames.map((aeName) => {
                    const isNew = previewData.newAeNames.includes(aeName);
                    const monthData = byAe[aeName];
                    const monthMap = new Map<string, MonthlyAggregate>(
                      monthData.map((m) => [`${m.calYear}-${m.calMonth}`, m])
                    );

                    return (
                      <tr
                        key={aeName}
                        className="border-b border-border/50 hover:bg-secondary/30 transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                              <span className="text-xs font-semibold text-primary">
                                {aeName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{aeName}</p>
                              {isNew && (
                                <p className="text-xs text-amber-400">New profile</p>
                              )}
                            </div>
                          </div>
                        </td>
                        {allMonths.map(({ year, month, key }) => {
                          const data = monthMap.get(`${year}-${month}`);
                          return (
                            <React.Fragment key={key}>
                              <td className="text-center px-2 py-3 text-sm">
                                {data ? (
                                  <span className="font-medium text-foreground">
                                    {Math.round(data.totalDials)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                              <td className="text-center px-2 py-3 text-sm">
                                {data ? (
                                  <span className="font-medium text-foreground">
                                    {Math.round(data.totalDemos)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer note */}
            <div className="px-5 py-3 border-t border-border bg-secondary/10">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Note:</strong> ARR and retention rate are
                not available in this sheet — they will remain at their current values (or 0 for
                new AEs). Use the Activity Metrics page or the Pipedrive sync (coming soon) to
                fill those in.
              </p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!previewData && !previewQuery.isFetching && !previewQuery.error && (
          <div className="rounded-2xl bg-card border border-border p-10 text-center">
            <FileSpreadsheet className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No preview loaded yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Click "Preview Data" to fetch and review the latest data from the Sales Report
              before importing.
            </p>
            <Button onClick={handlePreview} variant="outline" size="sm" className="gap-2">
              <RefreshCw className="w-3.5 h-3.5" />
              Preview Data
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Auto-Sync Status Card ────────────────────────────────────────────────────

interface SyncStatusData {
  schedule: {
    cronExpression: string;
    description: string;
    nextRunAt: string | null;
  };
  lastRun: {
    timestamp: string;
    spreadsheet: { success: boolean; recordsUpdated: number; latestWeek: number; error: string | null };
    pipedrive: { success: boolean; recordsUpdated: number; skippedAes: string[]; error: string | null };
  } | null;
}

function AutoSyncStatusCard({
  status,
  isLoading,
  isTriggerPending,
  onTrigger,
}: {
  status: SyncStatusData | null;
  isLoading: boolean;
  isTriggerPending: boolean;
  onTrigger: () => void;
}) {
  function formatRelativeTime(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days = Math.floor(diff / 86_400_000);
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  function formatNextRun(isoString: string | null): string {
    if (!isoString) return "Unknown";
    const d = new Date(isoString);
    return d.toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  }

  const lastRunOk =
    status?.lastRun?.spreadsheet.success && status?.lastRun?.pipedrive.success;
  const lastRunPartial =
    status?.lastRun &&
    (status.lastRun.spreadsheet.success !== status.lastRun.pipedrive.success);

  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Weekly Auto-Sync</p>
          <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">
            Active
          </Badge>
        </div>
        <Button
          onClick={onTrigger}
          disabled={isTriggerPending}
          size="sm"
          variant="outline"
          className="gap-2 text-xs"
        >
          {isTriggerPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          {isTriggerPending ? "Running..." : "Run Now"}
        </Button>
      </div>

      {/* Body */}
      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Schedule */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Clock className="w-3 h-3" />
            Schedule
          </div>
          {isLoading ? (
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">
                Every Monday at 8pm UTC
              </p>
              <p className="text-xs text-muted-foreground">
                After the 7pm Sales Report update
              </p>
            </>
          )}
        </div>

        {/* Next run */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <CalendarClock className="w-3 h-3" />
            Next run
          </div>
          {isLoading ? (
            <div className="h-4 w-40 rounded bg-muted animate-pulse" />
          ) : (
            <p className="text-sm font-medium text-foreground">
              {formatNextRun(status?.schedule.nextRunAt ?? null)}
            </p>
          )}
        </div>

        {/* Last run */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Zap className="w-3 h-3" />
            Last run
          </div>
          {isLoading ? (
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          ) : status?.lastRun ? (
            <>
              <div className="flex items-center gap-1.5">
                {lastRunOk ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                ) : lastRunPartial ? (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                )}
                <p className="text-sm font-medium text-foreground">
                  {formatRelativeTime(status.lastRun.timestamp)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Sheet: {status.lastRun.spreadsheet.recordsUpdated} records
                {status.lastRun.spreadsheet.latestWeek > 0 &&
                  ` (wk ${status.lastRun.spreadsheet.latestWeek})`}
                {" · "}
                Pipedrive: {status.lastRun.pipedrive.recordsUpdated} records
              </p>
              {(status.lastRun.spreadsheet.error || status.lastRun.pipedrive.error) && (
                <p className="text-xs text-destructive mt-0.5">
                  {status.lastRun.spreadsheet.error || status.lastRun.pipedrive.error}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Not run yet since last deploy</p>
          )}
        </div>
      </div>
    </div>
  );
}
