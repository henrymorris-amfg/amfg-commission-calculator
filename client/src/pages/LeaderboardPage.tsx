import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Trophy, Medal, Phone, Video, TrendingUp, Crown } from "lucide-react";
import { MONTH_NAMES } from "../../../shared/commission";

type Period = "current_quarter" | "last_quarter" | "ytd" | "all_time";

const PERIOD_LABELS: Record<Period, string> = {
  current_quarter: "This Quarter",
  last_quarter: "Last Quarter",
  ytd: "Year to Date",
  all_time: "All Time (24 mo)",
};

const TIER_COLORS = {
  bronze: { text: "oklch(0.65 0.12 55)", bg: "oklch(0.65 0.12 55 / 0.15)", border: "oklch(0.65 0.12 55 / 0.35)" },
  silver: { text: "oklch(0.82 0.02 250)", bg: "oklch(0.75 0.02 250 / 0.15)", border: "oklch(0.75 0.02 250 / 0.35)" },
  gold:   { text: "oklch(0.88 0.14 75)",  bg: "oklch(0.82 0.14 75 / 0.15)",  border: "oklch(0.82 0.14 75 / 0.4)"  },
};

function fmtArr(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Podium slot heights (2nd, 1st, 3rd)
const PODIUM_ORDER = [1, 0, 2]; // indices into top3 array: 2nd place, 1st place, 3rd place
const PODIUM_HEIGHTS = ["h-28", "h-36", "h-24"];
const PODIUM_SIZES = ["w-16 h-16 text-lg", "w-20 h-20 text-xl", "w-14 h-14 text-base"];
const PODIUM_RANK_COLORS = [
  "oklch(0.75 0.02 250)", // silver (2nd)
  "oklch(0.88 0.14 75)",  // gold (1st)
  "oklch(0.65 0.12 55)",  // bronze (3rd)
];
const PODIUM_RANK_LABELS = ["2nd", "1st", "3rd"];
const PODIUM_ICONS = [
  <Medal key="2" className="w-4 h-4" />,
  <Crown key="1" className="w-5 h-5" />,
  <Medal key="3" className="w-4 h-4" />,
];

export default function LeaderboardPage() {
  const [, navigate] = useLocation();
  const { ae, isLoading: authLoading } = useAeAuth();
  const [period, setPeriod] = useState<Period>("current_quarter");

  useEffect(() => {
    if (!authLoading && !ae) navigate("/");
  }, [ae, authLoading]);

  const { data, isLoading } = trpc.leaderboard.get.useQuery(
    { period },
    { enabled: !!ae }
  );

  if (authLoading || !ae) return null;

  const entries = data?.entries ?? [];
  const top3 = entries.slice(0, 3);

  // Period label
  const now = new Date();
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
  let periodSubLabel = "";
  if (data) {
    const from = `${MONTH_NAMES[data.fromMonth - 1].slice(0, 3)} ${data.fromYear}`;
    const to = `${MONTH_NAMES[data.toMonth - 1].slice(0, 3)} ${data.toYear}`;
    periodSubLabel = from === to ? from : `${from} – ${to}`;
  }

  return (
    <AppLayout>
      <div className="p-4 sm:p-8 pb-24 md:pb-8 space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-5 h-5" style={{ color: "oklch(0.88 0.14 75)" }} />
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Leaderboard</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Ranked by ARR signed · {periodSubLabel}
            </p>
          </div>

          {/* Period selector */}
          <div className="flex rounded-xl border border-border overflow-hidden self-start">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  period === p
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Podium */}
        {isLoading ? (
          <div className="h-64 rounded-2xl bg-card border border-border animate-pulse" />
        ) : top3.length >= 2 ? (
          <div
            className="rounded-2xl border p-6 sm:p-8"
            style={{ background: "oklch(0.17 0.018 250)", borderColor: "oklch(0.28 0.02 250)" }}
          >
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest text-center mb-8">
              Top Performers
            </p>

            {/* Podium visual */}
            <div className="flex items-end justify-center gap-4 sm:gap-8 mb-6">
              {PODIUM_ORDER.map((entryIdx, podiumSlot) => {
                const entry = top3[entryIdx];
                if (!entry) return <div key={podiumSlot} className="w-24" />;
                const tc = TIER_COLORS[entry.tier as keyof typeof TIER_COLORS] ?? TIER_COLORS.bronze;
                const rankColor = PODIUM_RANK_COLORS[podiumSlot];
                const isMe = entry.isCurrentAe;

                return (
                  <div key={entry.aeId} className="flex flex-col items-center gap-2">
                    {/* Avatar */}
                    <div
                      className={`rounded-full flex items-center justify-center font-bold border-2 ${PODIUM_SIZES[podiumSlot]} ${isMe ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                      style={{
                        background: tc.bg,
                        borderColor: rankColor,
                        color: rankColor,
                      }}
                    >
                      {getInitials(entry.name)}
                    </div>

                    {/* Name + tier */}
                    <div className="text-center">
                      <p className={`font-semibold text-foreground ${podiumSlot === 1 ? "text-sm" : "text-xs"}`}>
                        {entry.name.split(" ")[0]}
                        {isMe && <span className="text-primary ml-1">·you</span>}
                      </p>
                      <p className="text-xs font-medium capitalize" style={{ color: tc.text }}>
                        {entry.tier}
                      </p>
                    </div>

                    {/* ARR */}
                    <p
                      className={`font-bold ${podiumSlot === 1 ? "text-xl" : "text-base"}`}
                      style={{ color: rankColor }}
                    >
                      {fmtArr(entry.totalArrUsd)}
                    </p>

                    {/* Podium block */}
                    <div
                      className={`w-20 sm:w-24 ${PODIUM_HEIGHTS[podiumSlot]} rounded-t-xl flex flex-col items-center justify-start pt-2 gap-1`}
                      style={{ background: `${rankColor}18`, border: `1px solid ${rankColor}40` }}
                    >
                      <div className="flex items-center gap-1" style={{ color: rankColor }}>
                        {PODIUM_ICONS[podiumSlot]}
                        <span className="text-sm font-bold">{PODIUM_RANK_LABELS[podiumSlot]}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Top 3 stats summary */}
            <div className="grid grid-cols-3 gap-3 mt-2">
              {PODIUM_ORDER.map((entryIdx, podiumSlot) => {
                const entry = top3[entryIdx];
                if (!entry) return <div key={podiumSlot} />;
                const rankColor = PODIUM_RANK_COLORS[podiumSlot];
                return (
                  <div
                    key={entry.aeId}
                    className="rounded-xl p-3 text-center"
                    style={{ background: `${rankColor}0a`, border: `1px solid ${rankColor}25` }}
                  >
                    <p className="text-xs text-muted-foreground mb-1">{entry.name.split(" ")[0]}</p>
                    <div className="flex justify-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Video className="w-3 h-3" />{entry.totalDemos}
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Phone className="w-3 h-3" />{entry.totalDials.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Full ranked table */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "oklch(0.17 0.018 250)", borderColor: "oklch(0.28 0.02 250)" }}
        >
          <div className="px-5 py-4 border-b" style={{ borderColor: "oklch(0.28 0.02 250)" }}>
            <h3 className="text-sm font-semibold text-foreground">Full Rankings</h3>
          </div>

          {isLoading ? (
            <div className="p-5 space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">No data for this period yet.</p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div
                className="grid grid-cols-12 gap-2 px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b"
                style={{ borderColor: "oklch(0.24 0.018 250)" }}
              >
                <div className="col-span-1">#</div>
                <div className="col-span-4">Name</div>
                <div className="col-span-2 text-right">ARR Signed</div>
                <div className="col-span-2 text-right">Demos</div>
                <div className="col-span-2 text-right">Dials</div>
                <div className="col-span-1 text-right">Deals</div>
              </div>

              {/* Rows */}
              <div className="divide-y" style={{ borderColor: "oklch(0.22 0.018 250)" }}>
                {entries.map((entry) => {
                  const tc = TIER_COLORS[entry.tier as keyof typeof TIER_COLORS] ?? TIER_COLORS.bronze;
                  const isMe = entry.isCurrentAe;
                  const rankColor =
                    entry.rank === 1 ? PODIUM_RANK_COLORS[1] :
                    entry.rank === 2 ? PODIUM_RANK_COLORS[0] :
                    entry.rank === 3 ? PODIUM_RANK_COLORS[2] :
                    undefined;

                  return (
                    <div
                      key={entry.aeId}
                      className={`grid grid-cols-12 gap-2 px-5 py-3.5 items-center text-sm transition-colors ${
                        isMe ? "bg-primary/5" : "hover:bg-secondary/30"
                      }`}
                    >
                      {/* Rank */}
                      <div className="col-span-1">
                        {rankColor ? (
                          <span
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ background: `${rankColor}20`, color: rankColor }}
                          >
                            {entry.rank}
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-medium">{entry.rank}</span>
                        )}
                      </div>

                      {/* Name + tier */}
                      <div className="col-span-4 flex items-center gap-2 min-w-0">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: tc.bg, color: tc.text, border: `1px solid ${tc.border}` }}
                        >
                          {getInitials(entry.name)}
                        </div>
                        <div className="min-w-0">
                          <p className={`font-medium truncate ${isMe ? "text-primary" : "text-foreground"}`}>
                            {entry.name}
                            {isMe && <span className="text-xs ml-1 opacity-70">(you)</span>}
                          </p>
                          <p className="text-xs capitalize" style={{ color: tc.text }}>
                            {entry.tier}{entry.isTeamLeader ? " · TL" : ""}
                          </p>
                        </div>
                      </div>

                      {/* ARR */}
                      <div className="col-span-2 text-right">
                        <p className="font-semibold text-foreground">{fmtArr(entry.totalArrUsd)}</p>
                        <p className="text-xs text-muted-foreground">{entry.dealCount} deal{entry.dealCount !== 1 ? "s" : ""}</p>
                      </div>

                      {/* Demos */}
                      <div className="col-span-2 text-right">
                        <p className="font-medium text-foreground">{entry.totalDemos}</p>
                        <p className="text-xs text-muted-foreground">demos</p>
                      </div>

                      {/* Dials */}
                      <div className="col-span-2 text-right">
                        <p className="font-medium text-foreground">{entry.totalDials.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">dials</p>
                      </div>

                      {/* Deal count */}
                      <div className="col-span-1 text-right">
                        <p className="font-medium text-foreground">{entry.dealCount}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer note */}
        <p className="text-xs text-muted-foreground text-center">
          ARR signed is based on logged deals for the selected period. Dials and demos are from monthly activity metrics.
        </p>
      </div>
    </AppLayout>
  );
}
