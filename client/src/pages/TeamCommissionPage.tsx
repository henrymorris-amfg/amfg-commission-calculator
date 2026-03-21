import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { MONTH_NAMES } from "../../../shared/commission";
import {
  Users,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Wallet,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TIER_CONFIG = {
  bronze: { label: "Bronze", color: "oklch(0.65 0.12 55)", bg: "oklch(0.65 0.12 55 / 0.12)" },
  silver: { label: "Silver", color: "oklch(0.82 0.02 250)", bg: "oklch(0.75 0.02 250 / 0.12)" },
  gold: { label: "Gold", color: "oklch(0.88 0.14 75)", bg: "oklch(0.82 0.14 75 / 0.12)" },
};

function fmt(gbp: number) {
  return `£${gbp.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TeamCommissionPage() {
  const [, navigate] = useLocation();
  const { ae, isLoading } = useAeAuth();
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [expandedAes, setExpandedAes] = useState<Set<number>>(new Set());

  // Get team members (only for team leaders)
  const { data: teamData, isLoading: teamLoading } = trpc.ae.getTeamMembers.useQuery(undefined, {
    enabled: !!ae && ae.isTeamLeader,
  });

  // Get team commissions for selected month
  const { data: commissionsData, isLoading: commissionsLoading } = trpc.commission.teamCommissions.useQuery(
    selectedMonth ? { month: parseInt(selectedMonth.split("-")[1]), year: parseInt(selectedMonth.split("-")[0]) } : undefined,
    { enabled: !!ae && ae.isTeamLeader && !!selectedMonth }
  );

  useEffect(() => {
    if (!isLoading && (!ae || !ae.isTeamLeader)) {
      navigate("/");
    }
  }, [ae, isLoading, navigate]);

  // Set default month to current
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    setSelectedMonth(`${year}-${month}`);
  }, []);

  if (isLoading || !ae || !ae.isTeamLeader) return null;

  const commissions = commissionsData?.commissions ?? [];
  const totalTeamGbp = commissions.reduce((sum, c) => sum + c.totalNetGbp, 0);
  const totalTeamUsd = commissions.reduce((sum, c) => sum + c.totalNetUsd, 0);

  const toggleAe = (aeId: number) => {
    setExpandedAes((prev) => {
      const next = new Set(prev);
      if (next.has(aeId)) next.delete(aeId);
      else next.add(aeId);
      return next;
    });
  };

  // Generate month options (last 12 months)
  const monthOptions = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    monthOptions.push({
      value: `${year}-${month}`,
      label: `${MONTH_NAMES[date.getMonth()]} ${year}`,
    });
  }

  return (
    <AppLayout>
      <div className="p-4 sm:p-8 pb-24 md:pb-8 space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-muted-foreground text-sm mb-1 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Team Management
            </p>
            <h1 className="text-3xl sm:text-4xl text-foreground">Team Commission Summary</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              View all team members' commissions for the selected month.
            </p>
          </div>
        </div>

        {/* Month Selector */}
        <div className="flex gap-4">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Team Summary */}
        {commissionsLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading team data...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="border border-border rounded-lg p-4 bg-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm">Team Members</p>
                    <p className="text-2xl font-bold text-foreground">{commissions.length}</p>
                  </div>
                  <Users className="w-8 h-8 text-muted-foreground opacity-50" />
                </div>
              </div>

              <div className="border border-border rounded-lg p-4 bg-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm">Total Payouts (GBP)</p>
                    <p className="text-2xl font-bold text-foreground">{fmt(totalTeamGbp)}</p>
                  </div>
                  <Wallet className="w-8 h-8 text-muted-foreground opacity-50" />
                </div>
              </div>

              <div className="border border-border rounded-lg p-4 bg-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm">Total Payouts (USD)</p>
                    <p className="text-2xl font-bold text-foreground">
                      ${totalTeamUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-muted-foreground opacity-50" />
                </div>
              </div>
            </div>

            {/* Team Members List */}
            <div className="space-y-3">
              {commissions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No commissions for this month
                </div>
              ) : (
                commissions.map((commission) => {
                  const isExpanded = expandedAes.has(commission.aeId);
                  return (
                    <div key={commission.aeId} className="border border-border rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleAe(commission.aeId)}
                        className="w-full p-4 flex items-center justify-between hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className="flex-1 text-left">
                            <p className="font-semibold text-foreground">{commission.aeName}</p>
                            <p className="text-sm text-muted-foreground">
                              {commission.dealCount} deals • {commission.payoutCount} payouts
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-semibold text-foreground">{fmt(commission.totalNetGbp)}</p>
                            <p className="text-sm text-muted-foreground">
                              ${commission.totalNetUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            </p>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="border-t border-border bg-muted/30 p-4 space-y-3">
                          {commission.payouts.map((payout, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <div>
                                <p className="text-foreground font-medium">{payout.customerName}</p>
                                <p className="text-xs text-muted-foreground">
                                  Payout #{payout.payoutNumber} • Tier: {payout.tier}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-foreground font-medium">{fmt(payout.netCommissionGbp)}</p>
                                <p className="text-xs text-muted-foreground">
                                  ${payout.netCommissionUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
