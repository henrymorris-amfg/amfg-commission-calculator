import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import { STANDARD_TARGETS, TEAM_LEADER_TARGETS } from "../../../shared/commission";
import { Phone, Video, Activity, Clock } from "lucide-react";

function ProgressPill({
  value,
  target,
  label,
  unit = "",
  color,
}: {
  value: number;
  target: number;
  label: string;
  unit?: string;
  color: string;
}) {
  const pct = Math.min(100, target > 0 ? (value / target) * 100 : 0);
  const met = value >= target;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <span
          className="text-xs font-semibold"
          style={{ color: met ? "oklch(0.70 0.18 145)" : color }}
        >
          {value}{unit}
          <span className="text-muted-foreground font-normal"> / {target}{unit}</span>
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: met ? "oklch(0.55 0.18 145)" : color,
          }}
        />
      </div>
    </div>
  );
}

export function WeeklyActivityStrip() {
  const { ae } = useAeAuth();

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
  const { data: tierData } = trpc.tier.calculate.useQuery(
    { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
    { enabled: !!ae }
  );

  if (!ae) return null;

  // If both VOIP queries failed or returned not-found, don't show the strip
  const today = todayQuery.data?.found ? todayQuery.data : null;
  const week = weekQuery.data?.found ? weekQuery.data : null;
  if (!today && !week && !todayQuery.isLoading && !weekQuery.isLoading) return null;

  const tier = (tierData?.tier ?? "bronze") as "bronze" | "silver" | "gold";
  const targets = ae.isTeamLeader ? TEAM_LEADER_TARGETS : STANDARD_TARGETS;
  // Use the current tier's targets as the weekly dial goal (gold target if gold, else silver)
  const dialTarget = tier === "gold" ? targets.gold.dialsPw : targets.silver.dialsPw;
  const demoTarget = tier === "gold" ? targets.gold.demosPw : targets.silver.demosPw;

  const weekDials = week?.totalDials ?? 0;
  const todayDials = today?.totalDials ?? 0;
  const connectionRate = today?.connectionRate ?? week?.connectionRate ?? 0;
  const talkTime = week?.totalTalkTimeFormatted ?? today?.totalTalkTimeFormatted ?? "—";

  // Demos this week: use the current month's demosFromPipedrive as a proxy (weekly estimate)
  // We don't have a real-time demo count per week, so we show a placeholder with note
  const isLoading = todayQuery.isLoading || weekQuery.isLoading;

  return (
    <div
      className="rounded-2xl border p-5 sm:p-6"
      style={{ background: "oklch(0.17 0.018 250)", borderColor: "oklch(0.28 0.02 250)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "oklch(0.55 0.18 145 / 0.15)" }}
          >
            <Activity className="w-3.5 h-3.5" style={{ color: "oklch(0.70 0.18 145)" }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">This Week's Activity</h3>
            <p className="text-xs text-muted-foreground">Live from VoIPstudio · refreshes every minute</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">Live</span>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stat tiles row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div
              className="rounded-xl p-3"
              style={{ background: "oklch(0.20 0.018 250)", border: "1px solid oklch(0.28 0.02 250)" }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <Phone className="w-3 h-3 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Today's Dials</p>
              </div>
              <p className="text-xl font-bold text-foreground">{todayDials}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {today ? `${today.connected} connected` : "—"}
              </p>
            </div>

            <div
              className="rounded-xl p-3"
              style={{ background: "oklch(0.20 0.018 250)", border: "1px solid oklch(0.28 0.02 250)" }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <Phone className="w-3 h-3 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Week Dials</p>
              </div>
              <p
                className="text-xl font-bold"
                style={{ color: weekDials >= dialTarget ? "oklch(0.70 0.18 145)" : "var(--foreground)" }}
              >
                {weekDials}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">target {dialTarget}</p>
            </div>

            <div
              className="rounded-xl p-3"
              style={{ background: "oklch(0.20 0.018 250)", border: "1px solid oklch(0.28 0.02 250)" }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <Activity className="w-3 h-3 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Connect Rate</p>
              </div>
              <p className="text-xl font-bold text-foreground">
                {connectionRate > 0 ? `${connectionRate.toFixed(1)}%` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">today</p>
            </div>

            <div
              className="rounded-xl p-3"
              style={{ background: "oklch(0.20 0.018 250)", border: "1px solid oklch(0.28 0.02 250)" }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Talk Time</p>
              </div>
              <p className="text-xl font-bold text-foreground">{talkTime}</p>
              <p className="text-xs text-muted-foreground mt-0.5">this week</p>
            </div>
          </div>

          {/* Progress bars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              className="rounded-xl p-3 space-y-2"
              style={{ background: "oklch(0.20 0.018 250)", border: "1px solid oklch(0.28 0.02 250)" }}
            >
              <ProgressPill
                value={weekDials}
                target={dialTarget}
                label="Dials this week"
                color="oklch(0.60 0.15 200)"
              />
            </div>
            <div
              className="rounded-xl p-3 space-y-2"
              style={{ background: "oklch(0.20 0.018 250)", border: "1px solid oklch(0.28 0.02 250)" }}
            >
              <ProgressPill
                value={tierData?.avgDemosPw ? Math.round(tierData.avgDemosPw) : 0}
                target={demoTarget}
                label="Demos/wk (3-mo avg)"
                color="oklch(0.78 0.14 75)"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
