import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import { useLocation } from "wouter";
import { MONTH_NAMES } from "../../../shared/commission";
import { ArrowRight, CalendarClock, ChevronRight } from "lucide-react";

function fmtGbp(val: number) {
  return `£${val.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Returns "in X days" / "in X weeks" / "in X months" relative to today */
function relativeTime(year: number, month: number): string {
  const now = new Date();
  // Use the 1st of the payout month as the reference date
  const target = new Date(year, month - 1, 1);
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "this month";
  if (diffDays < 14) return `in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
  if (diffDays < 60) return `in ${Math.round(diffDays / 7)} week${Math.round(diffDays / 7) === 1 ? "" : "s"}`;
  return `in ${Math.round(diffDays / 30)} month${Math.round(diffDays / 30) === 1 ? "" : "s"}`;
}

// Accent colours cycling through the 3 slots
const SLOT_COLORS = [
  { color: "oklch(0.55 0.18 145)", bg: "oklch(0.55 0.18 145 / 0.08)", border: "oklch(0.55 0.18 145 / 0.25)" },
  { color: "oklch(0.60 0.15 200)", bg: "oklch(0.60 0.15 200 / 0.08)", border: "oklch(0.60 0.15 200 / 0.25)" },
  { color: "oklch(0.78 0.14 75)",  bg: "oklch(0.78 0.14 75 / 0.08)",  border: "oklch(0.78 0.14 75 / 0.25)"  },
];

export function NextPayoutsWidget() {
  const { ae } = useAeAuth();
  const [, navigate] = useLocation();

  const { data: summary, isLoading } = trpc.commission.dashboardSummary.useQuery(
    undefined,
    { enabled: !!ae }
  );

  if (!ae) return null;

  const next3 = summary?.next3Months ?? [];

  return (
    <div
      className="rounded-2xl border p-5 sm:p-6"
      style={{ background: "oklch(0.17 0.018 250)", borderColor: "oklch(0.28 0.02 250)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-base font-semibold text-foreground">Upcoming Payouts</h3>
        </div>
        <button
          onClick={() => navigate("/payout-calendar")}
          className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
        >
          Full calendar <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : next3.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No upcoming payouts scheduled.</p>
          <p className="text-xs text-muted-foreground mt-1">Log a deal to see future commission payouts here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {next3.map((m, idx) => {
            const slot = SLOT_COLORS[idx % SLOT_COLORS.length];
            const dealCount = m.payouts.length;
            // Show up to 2 deal names, then "+N more"
            const dealNames = m.payouts.slice(0, 2).map((p) => p.customerName);
            const extra = dealCount - dealNames.length;

            return (
              <div
                key={`${m.year}-${m.month}`}
                className="flex items-center justify-between rounded-xl px-4 py-3 cursor-pointer hover:opacity-90 transition-opacity"
                style={{ background: slot.bg, border: `1px solid ${slot.border}` }}
                onClick={() => navigate("/payout-calendar")}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Month pill */}
                  <div
                    className="flex-shrink-0 rounded-lg px-2.5 py-1.5 text-center min-w-[52px]"
                    style={{ background: `${slot.color}22`, border: `1px solid ${slot.color}44` }}
                  >
                    <p className="text-xs font-bold leading-none" style={{ color: slot.color }}>
                      {MONTH_NAMES[m.month - 1].slice(0, 3).toUpperCase()}
                    </p>
                    <p className="text-xs text-muted-foreground leading-none mt-0.5">
                      {String(m.year).slice(2)}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {dealNames.join(", ")}
                      {extra > 0 && <span className="text-muted-foreground"> +{extra} more</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dealCount} payout{dealCount !== 1 ? "s" : ""} · {relativeTime(m.year, m.month)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <p className="text-base font-bold text-foreground">{fmtGbp(m.totalGbp)}</p>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pipeline total */}
      {!isLoading && (summary?.pipelineGbp ?? 0) > 0 && (
        <div
          className="mt-3 flex items-center justify-between rounded-xl px-4 py-2.5"
          style={{ background: "oklch(0.20 0.018 250)", border: "1px solid oklch(0.28 0.02 250)" }}
        >
          <p className="text-xs text-muted-foreground">Total pipeline (all future payouts)</p>
          <p className="text-sm font-semibold text-foreground">{fmtGbp(summary?.pipelineGbp ?? 0)}</p>
        </div>
      )}
    </div>
  );
}
