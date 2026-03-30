import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export function DataQualityWidget() {
  const { ae } = useAeAuth();

  const { data: deals = [], isLoading } = trpc.deals.list.useQuery(
    undefined,
    { enabled: !!ae }
  );

  const stats = useMemo(() => {
    const total = deals.length;
    const withCorrectDates = deals.filter(
      (d) => d.contractStartDate && d.contractStartDate !== d.pipedriveWonTime
    ).length;
    const withIncorrectDates = total - withCorrectDates;
    const qualityScore = total > 0 ? Math.round((withCorrectDates / total) * 100) : 0;
    const totalArrAtRisk = deals
      .filter((d) => !d.contractStartDate || d.contractStartDate === d.pipedriveWonTime)
      .reduce((sum, d) => sum + (Number(d.arrUsd) || 0), 0);

    return {
      total,
      withCorrectDates,
      withIncorrectDates,
      qualityScore,
      totalArrAtRisk,
    };
  }, [deals]);

  if (!ae) return null;

  const isHealthy = stats.qualityScore >= 90;
  const isWarning = stats.qualityScore >= 70 && stats.qualityScore < 90;

  return (
    <div
      className="rounded-xl border p-5 overflow-hidden"
      style={{
        background: isHealthy
          ? "oklch(0.17 0.018 120 / 0.5)"
          : isWarning
            ? "oklch(0.20 0.018 55 / 0.5)"
            : "oklch(0.20 0.018 25 / 0.5)",
        borderColor: isHealthy
          ? "oklch(0.28 0.02 120)"
          : isWarning
            ? "oklch(0.28 0.02 55)"
            : "oklch(0.28 0.02 25)",
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          {isHealthy ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : (
            <AlertTriangle
              className="w-5 h-5"
              style={{
                color: isWarning ? "oklch(0.70 0.22 55)" : "oklch(0.70 0.22 25)",
              }}
            />
          )}
          <h3 className="text-sm font-semibold text-foreground">Data Quality</h3>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-foreground">{stats.qualityScore}%</p>
          <p className="text-xs text-muted-foreground">quality score</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-3 bg-muted rounded w-full animate-pulse" />
          <div className="h-3 bg-muted rounded w-2/3 animate-pulse" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Progress bar */}
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${stats.qualityScore}%`,
                background: isHealthy
                  ? "oklch(0.60 0.15 120)"
                  : isWarning
                    ? "oklch(0.70 0.22 55)"
                    : "oklch(0.70 0.22 25)",
              }}
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-muted/40">
              <p className="text-muted-foreground">Correct Dates</p>
              <p className="font-bold text-foreground">{stats.withCorrectDates}</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/40">
              <p className="text-muted-foreground">Need Correction</p>
              <p className="font-bold text-foreground">{stats.withIncorrectDates}</p>
            </div>
          </div>

          {/* ARR at risk */}
          {stats.withIncorrectDates > 0 && (
            <div
              className="p-3 rounded-lg border"
              style={{
                background: isWarning
                  ? "oklch(0.70 0.22 55 / 0.08)"
                  : "oklch(0.70 0.22 25 / 0.08)",
                borderColor: isWarning
                  ? "oklch(0.70 0.22 55 / 0.25)"
                  : "oklch(0.70 0.22 25 / 0.25)",
              }}
            >
              <p className="text-xs text-muted-foreground mb-1">ARR at Risk</p>
              <p className="font-bold text-foreground">
                £{Math.round(stats.totalArrAtRisk).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.withIncorrectDates} deal{stats.withIncorrectDates !== 1 ? "s" : ""} need contract start date correction
              </p>
            </div>
          )}

          {/* Status message */}
          {isHealthy ? (
            <p className="text-xs text-green-600 font-medium">✓ Data quality is excellent</p>
          ) : isWarning ? (
            <p className="text-xs font-medium" style={{ color: "oklch(0.70 0.22 55)" }}>
              ⚠ Review {stats.withIncorrectDates} deal{stats.withIncorrectDates !== 1 ? "s" : ""} in Pipedrive
            </p>
          ) : (
            <p className="text-xs font-medium" style={{ color: "oklch(0.70 0.22 25)" }}>
              ✕ Critical: {stats.withIncorrectDates} deal{stats.withIncorrectDates !== 1 ? "s" : ""} need immediate correction
            </p>
          )}
        </div>
      )}
    </div>
  );
}
