import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import { MONTH_NAMES, TIER_COMMISSION_RATE } from "../../../shared/commission";
import { TrendingUp, PoundSterling, Calendar, Star, Wallet } from "lucide-react";

function fmtGbp(val: number) {
  return `£${val.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TIER_CONFIG = {
  bronze: { label: "Bronze", color: "oklch(0.65 0.12 55)", bg: "oklch(0.65 0.12 55 / 0.15)", border: "oklch(0.65 0.12 55 / 0.4)" },
  silver: { label: "Silver", color: "oklch(0.82 0.02 250)", bg: "oklch(0.75 0.02 250 / 0.15)", border: "oklch(0.75 0.02 250 / 0.4)" },
  gold:   { label: "Gold",   color: "oklch(0.88 0.14 75)",  bg: "oklch(0.82 0.14 75 / 0.15)",  border: "oklch(0.82 0.14 75 / 0.45)" },
};

export function EarningsHeroCard() {
  const { ae } = useAeAuth();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const { data: summary, isLoading } = trpc.commission.dashboardSummary.useQuery(
    undefined,
    { enabled: !!ae }
  );
  const { data: tierData } = trpc.tier.calculate.useQuery(
    { year: currentYear, month: currentMonth },
    { enabled: !!ae }
  );

  if (!ae) return null;

  const tier = (tierData?.tier ?? "bronze") as "bronze" | "silver" | "gold";
  const tierCfg = TIER_CONFIG[tier];
  const commRate = TIER_COMMISSION_RATE[tier] ?? 0.13;

  const stats = [
    {
      icon: <PoundSterling className="w-4 h-4" />,
      label: `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`,
      sublabel: "This month",
      value: isLoading ? "—" : fmtGbp(summary?.mtdGbp ?? 0),
      accent: "oklch(0.60 0.15 200)",
      accentBg: "oklch(0.60 0.15 200 / 0.1)",
    },
    {
      icon: <TrendingUp className="w-4 h-4" />,
      label: `YTD ${currentYear}`,
      sublabel: "Year to date",
      value: isLoading ? "—" : fmtGbp(summary?.ytdGbp ?? 0),
      accent: "oklch(0.55 0.18 145)",
      accentBg: "oklch(0.55 0.18 145 / 0.1)",
    },
    {
      icon: <Wallet className="w-4 h-4" />,
      label: "Pipeline",
      sublabel: "Future payouts locked in",
      value: isLoading ? "—" : fmtGbp(summary?.pipelineGbp ?? 0),
      accent: "oklch(0.78 0.14 75)",
      accentBg: "oklch(0.78 0.14 75 / 0.1)",
    },
    {
      icon: <Star className="w-4 h-4" />,
      label: "Best month",
      sublabel: "All time",
      value: isLoading ? "—" : fmtGbp(summary?.bestMonthGbp ?? 0),
      accent: "oklch(0.65 0.12 55)",
      accentBg: "oklch(0.65 0.12 55 / 0.1)",
    },
  ];

  return (
    <div
      className="rounded-2xl border p-5 sm:p-6"
      style={{ background: "oklch(0.17 0.018 250)", borderColor: "oklch(0.28 0.02 250)" }}
    >
      {/* Top row: greeting + tier badge */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">Earnings Overview</p>
          <h2 className="text-lg font-semibold text-foreground">Your Commission</h2>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold"
          style={{ background: tierCfg.bg, border: `1px solid ${tierCfg.border}`, color: tierCfg.color }}
        >
          <Calendar className="w-3.5 h-3.5" />
          {tierCfg.label} · {(commRate * 100).toFixed(0)}%
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl p-4 flex flex-col gap-2"
            style={{ background: s.accentBg, border: `1px solid ${s.accent}22` }}
          >
            <div className="flex items-center gap-1.5" style={{ color: s.accent }}>
              {s.icon}
              <span className="text-xs font-medium">{s.sublabel}</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-foreground leading-none">
              {s.value}
            </p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
