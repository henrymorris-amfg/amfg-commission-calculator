import React, { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Phone,
  PhoneCall,
  Activity,
  Clock,
  Download,
  CheckCircle,
  AlertTriangle,
  Users,
  Loader2,
} from "lucide-react";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function VoipSyncPage() {
  const [, navigate] = useLocation();
  const { ae, isLoading } = useAeAuth();
  const [months, setMonths] = useState(2);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    recordsUpdated: number;
    aesUpdated: number;
    unmatchedAes: string[];
  } | null>(null);

  // Date range for team stats
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const weekStart = monday.toISOString().substring(0, 10);
  const today = now.toISOString().substring(0, 10);

  // Hooks — all called unconditionally
  const statusQuery = trpc.voipSync.status.useQuery(undefined, {
    retry: false,
    throwOnError: false,
    enabled: !!ae,
  });
  const previewQuery = trpc.voipSync.preview.useQuery(
    { months },
    { enabled: false, retry: false, throwOnError: false }
  );
  const teamStatsQuery = trpc.voipSync.teamDialStats.useQuery(
    { dateFrom: weekStart, dateTo: today },
    { retry: false, throwOnError: false, enabled: !!ae }
  );
  const importMutation = trpc.voipSync.import.useMutation();

  // useMemo hooks — MUST be above any early return
  const previewData = previewQuery.data;

  // Group monthly data by AE
  const aeMonthlyMap = useMemo(() => {
    if (!previewData?.monthlyData) return new Map<string, NonNullable<typeof previewData>["monthlyData"]>();
    const map = new Map<string, typeof previewData.monthlyData>();
    for (const d of previewData.monthlyData) {
      const existing = map.get(d.aeName) || [];
      existing.push(d);
      map.set(d.aeName, existing);
    }
    return map;
  }, [previewData]);

  // Get unique months from preview data
  const uniqueMonths = useMemo(() => {
    if (!previewData?.monthlyData) return [] as Array<{ year: number; month: number }>;
    const seen = new Set<string>();
    const result: Array<{ year: number; month: number }> = [];
    for (const d of previewData.monthlyData) {
      const key = `${d.year}-${d.month}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ year: d.year, month: d.month });
      }
    }
    return result.sort((a, b) => a.year - b.year || a.month - b.month);
  }, [previewData]);

  useEffect(() => {
    if (!isLoading && !ae) navigate("/");
    if (!isLoading && ae && !ae.isTeamLeader) navigate("/dashboard");
  }, [ae, isLoading]);

  if (isLoading || !ae || !ae.isTeamLeader) return null;

  const handleImport = async () => {
    try {
      const result = await importMutation.mutateAsync({ months });
      setImportResult(result);
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-8 pb-24 md:pb-8 space-y-6 max-w-6xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">VOIP Studio Sync</h1>
          <p className="text-muted-foreground mt-1">
            Pull real dialling data from VoIPstudio — dials, connection rates, and talk time per AE.
          </p>
        </div>

        {/* Connection Status */}
        <div className="rounded-2xl bg-card border border-border p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: statusQuery.data?.connected ? "oklch(0.55 0.18 145 / 0.15)" : "oklch(0.55 0.22 25 / 0.15)" }}>
              <Phone className="w-5 h-5" style={{ color: statusQuery.data?.connected ? "oklch(0.70 0.18 145)" : "oklch(0.70 0.22 25)" }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {statusQuery.isLoading ? "Checking connection..." :
                  statusQuery.data?.connected ? `Connected — ${statusQuery.data.userCount} users found` :
                    "Not connected"}
              </p>
              {statusQuery.data?.connected && (
                <p className="text-xs text-muted-foreground">
                  Users: {statusQuery.data.users.map((u) => `${u.name} (ext ${u.extension})`).join(", ")}
                </p>
              )}
              {statusQuery.data && !statusQuery.data.connected && (
                <p className="text-xs text-red-400">{statusQuery.data.error}</p>
              )}
            </div>
          </div>
        </div>

        {/* This Week's Team Stats */}
        {teamStatsQuery.data && teamStatsQuery.data.stats.length > 0 && (
          <div className="rounded-2xl bg-card border border-border p-6">
            <div className="flex items-center gap-2 mb-5">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">This Week's Team Stats</h3>
              <span className="ml-auto text-xs text-muted-foreground">{weekStart} → {today}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">AE</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">
                      <span className="flex items-center justify-end gap-1"><PhoneCall className="w-3 h-3" /> Dials</span>
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">Connected</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">
                      <span className="flex items-center justify-end gap-1"><Activity className="w-3 h-3" /> Rate</span>
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">
                      <span className="flex items-center justify-end gap-1"><Clock className="w-3 h-3" /> Talk Time</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {teamStatsQuery.data.stats
                    .sort((a, b) => b.totalDials - a.totalDials)
                    .map((s) => (
                      <tr key={s.aeId} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                        <td className="py-3 px-4 font-medium text-foreground">{s.aeName}</td>
                        <td className="py-3 px-4 text-right font-bold text-foreground">{s.totalDials}</td>
                        <td className="py-3 px-4 text-right text-muted-foreground">{s.connected}</td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-medium" style={{
                            color: s.connectionRate >= 70 ? "oklch(0.70 0.18 145)" :
                              s.connectionRate >= 50 ? "oklch(0.82 0.14 75)" : "oklch(0.70 0.22 25)"
                          }}>
                            {s.connectionRate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-muted-foreground">{s.totalTalkTimeFormatted}</td>
                      </tr>
                    ))}
                  {/* Totals row */}
                  <tr className="bg-secondary/50 font-semibold">
                    <td className="py-3 px-4 text-foreground">Team Total</td>
                    <td className="py-3 px-4 text-right text-foreground">
                      {teamStatsQuery.data.stats.reduce((s, r) => s + r.totalDials, 0)}
                    </td>
                    <td className="py-3 px-4 text-right text-foreground">
                      {teamStatsQuery.data.stats.reduce((s, r) => s + r.connected, 0)}
                    </td>
                    <td className="py-3 px-4 text-right text-foreground">
                      {(() => {
                        const totalDials = teamStatsQuery.data!.stats.reduce((s, r) => s + r.totalDials, 0);
                        const totalConn = teamStatsQuery.data!.stats.reduce((s, r) => s + r.connected, 0);
                        return totalDials > 0 ? `${((totalConn / totalDials) * 100).toFixed(1)}%` : "—";
                      })()}
                    </td>
                    <td className="py-3 px-4 text-right text-muted-foreground">
                      {(() => {
                        const totalSecs = teamStatsQuery.data!.stats.reduce((s, r) => s + r.totalTalkTimeSecs, 0);
                        const hrs = Math.floor(totalSecs / 3600);
                        const mins = Math.floor((totalSecs % 3600) / 60);
                        return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {teamStatsQuery.data.unmatchedAes.length > 0 && (
              <div className="mt-4 flex items-start gap-2 p-3 rounded-lg"
                style={{ background: "oklch(0.82 0.14 75 / 0.1)", border: "1px solid oklch(0.82 0.14 75 / 0.3)" }}>
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.82 0.14 75)" }} />
                <p className="text-xs" style={{ color: "oklch(0.82 0.14 75)" }}>
                  <strong>Not found in VoIPstudio:</strong> {teamStatsQuery.data.unmatchedAes.join(", ")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Monthly Import Section */}
        <div className="rounded-2xl bg-card border border-border p-6">
          <div className="flex items-center gap-2 mb-5">
            <Download className="w-4 h-4 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Monthly Data Import</h3>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="flex rounded-lg border border-border overflow-hidden flex-shrink-0">
              {[2, 3, 4, 6].map((m) => (
                <button
                  key={m}
                  onClick={() => setMonths(m)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    months === m
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {m} months
                </button>
              ))}
            </div>
            <Button
              onClick={() => previewQuery.refetch()}
              disabled={previewQuery.isFetching}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            >
              {previewQuery.isFetching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Pulling data...
                </>
              ) : (
                <>
                  <Phone className="w-4 h-4" />
                  Preview Data
                </>
              )}
            </Button>
          </div>

          {/* Preview Table */}
          {previewData && (
            <>
              <div className="overflow-x-auto mb-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">AE</th>
                      {uniqueMonths.map((m) => (
                        <th key={`${m.year}-${m.month}`} className="text-center py-3 px-2 text-xs font-medium text-muted-foreground" colSpan={3}>
                          {MONTH_NAMES[m.month - 1]} {m.year}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-border/50">
                      <th className="py-1 px-4" />
                      {uniqueMonths.map((m) => (
                        <React.Fragment key={`sub-${m.year}-${m.month}`}>
                          <th className="py-1 px-2 text-xs text-muted-foreground text-center">Dials</th>
                          <th className="py-1 px-2 text-xs text-muted-foreground text-center">Rate</th>
                          <th className="py-1 px-2 text-xs text-muted-foreground text-center">Talk</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(aeMonthlyMap.entries()).map(([aeName, months_data]) => (
                      <tr key={aeName} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                        <td className="py-3 px-4 font-medium text-foreground">{aeName}</td>
                        {uniqueMonths.map((m) => {
                          const d = months_data.find((x) => x.year === m.year && x.month === m.month);
                          return (
                            <React.Fragment key={`${aeName}-${m.year}-${m.month}`}>
                              <td className="py-3 px-2 text-center font-bold text-foreground">
                                {d ? d.totalDials : "—"}
                              </td>
                              <td className="py-3 px-2 text-center">
                                {d ? (
                                  <span style={{
                                    color: d.connectionRate >= 70 ? "oklch(0.70 0.18 145)" :
                                      d.connectionRate >= 50 ? "oklch(0.82 0.14 75)" : "oklch(0.70 0.22 25)"
                                  }}>
                                    {d.connectionRate.toFixed(1)}%
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="py-3 px-2 text-center text-muted-foreground text-xs">
                                {d ? d.totalTalkTimeFormatted : "—"}
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {previewData.unmatchedAes.length > 0 && (
                <div className="mb-5 flex items-start gap-2 p-3 rounded-lg"
                  style={{ background: "oklch(0.82 0.14 75 / 0.1)", border: "1px solid oklch(0.82 0.14 75 / 0.3)" }}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.82 0.14 75)" }} />
                  <p className="text-xs" style={{ color: "oklch(0.82 0.14 75)" }}>
                    <strong>Not found in VoIPstudio:</strong> {previewData.unmatchedAes.join(", ")}
                    <br />These AEs' dials will not be updated.
                  </p>
                </div>
              )}

              <Button
                onClick={handleImport}
                disabled={importMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white gap-2"
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Import to Database
                  </>
                )}
              </Button>
            </>
          )}

          {/* Import Result */}
          {importResult && (
            <div className="mt-5 flex items-start gap-3 p-4 rounded-lg"
              style={{ background: "oklch(0.55 0.18 145 / 0.08)", border: "1px solid oklch(0.55 0.18 145 / 0.3)" }}>
              <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.70 0.18 145)" }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: "oklch(0.70 0.18 145)" }}>Import complete</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {importResult.recordsUpdated} records updated across {importResult.aesUpdated} AEs.
                </p>
                {importResult.unmatchedAes.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Skipped (not in VoIPstudio): {importResult.unmatchedAes.join(", ")}
                  </p>
                )}
              </div>
            </div>
          )}

          {importMutation.isError && (
            <div className="mt-5 flex items-start gap-3 p-4 rounded-lg"
              style={{ background: "oklch(0.55 0.22 25 / 0.08)", border: "1px solid oklch(0.55 0.22 25 / 0.3)" }}>
              <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.70 0.22 25)" }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: "oklch(0.70 0.22 25)" }}>Import failed</p>
                <p className="text-xs text-muted-foreground mt-1">{importMutation.error.message}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
