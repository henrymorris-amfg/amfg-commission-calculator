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
  Download,
  Bell,
  BellRing,
  RefreshCw,
  ArrowUpCircle,
  ArrowDownCircle,
  Medal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exportTeamCommissionsToCSV } from "@/lib/csvExport";

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
  const { data: teamData, isLoading: teamLoading } = trpc.ae.listNames.useQuery(undefined, {
    enabled: !!ae && ae.isTeamLeader,
  });

  // Get team commissions for selected month
  const parsedMonth = selectedMonth ? parseInt(selectedMonth.split("-")[1]) : undefined;
  const parsedYear = selectedMonth ? parseInt(selectedMonth.split("-")[0]) : undefined;
  const { data: commissionsData, isLoading: commissionsLoading } = trpc.commissionStructure.teamCommissions.useQuery(
    { month: parsedMonth ?? 1, year: parsedYear ?? new Date().getFullYear() },
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

  // Tier change notification state
  const [showNotifHistory, setShowNotifHistory] = useState(false);
  const utils = trpc.useUtils();

  const { data: notifHistory, isLoading: notifLoading, refetch: refetchNotifs } = trpc.commissionStructure.allNotificationHistory.useQuery(
    { limit: 20 },
    { enabled: !!ae && ae.isTeamLeader && showNotifHistory }
  );

  const checkTierChanges = trpc.commissionStructure.checkTierChanges.useMutation({
    onSuccess: (data) => {
      if (data.notificationsSent > 0) {
        toast.success(`${data.notificationsSent} tier change notification${data.notificationsSent === 1 ? '' : 's'} sent`);
      } else if (data.changesDetected > 0) {
        toast.info(`${data.changesDetected} tier change${data.changesDetected === 1 ? '' : 's'} detected — notifications already sent or delivery failed`);
      } else {
        toast.info('No tier changes detected this month');
      }
      refetchNotifs();
    },
    onError: (err) => {
      toast.error(`Failed to check tier changes: ${err.message}`);
    },
  });

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

        {/* Month Selector and Export */}
        <div className="flex gap-4 items-center">
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
          <Button
            onClick={() => {
              if (commissionsData && selectedMonth) {
                const [year, month] = selectedMonth.split("-");
                exportTeamCommissionsToCSV(commissionsData, parseInt(month), parseInt(year));
              }
            }}
            disabled={!commissionsData || commissionsLoading}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
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
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-foreground">{commission.aeName}</p>
                              {commission.currentTier && (() => {
                                const tier = (commission.currentTier as string).toLowerCase() as keyof typeof TIER_CONFIG;
                                const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG.bronze;
                                return (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                                    style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}40` }}
                                  >
                                    <Medal className="w-3 h-3" />
                                    {cfg.label}
                                  </span>
                                );
                              })()}
                            </div>
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
                          {commission.payouts.map((payout: any, idx: number) => (
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

        {/* ─── Tier Change Notifications ─────────────────────────────── */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="p-4 flex items-center justify-between bg-card">
            <div className="flex items-center gap-3">
              <BellRing className="w-5 h-5 text-muted-foreground" />
              <div>
                <h2 className="text-base font-semibold text-foreground">Tier Change Notifications</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically checks daily at 8:05 AM GMT. Sends a notification when any AE's tier changes month-over-month.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  setShowNotifHistory((v) => !v);
                }}
              >
                <Bell className="w-4 h-4" />
                {showNotifHistory ? 'Hide History' : 'View History'}
              </Button>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => checkTierChanges.mutate({})}
                disabled={checkTierChanges.isPending}
              >
                <RefreshCw className={`w-4 h-4 ${checkTierChanges.isPending ? 'animate-spin' : ''}`} />
                {checkTierChanges.isPending ? 'Checking...' : 'Check Now'}
              </Button>
            </div>
          </div>

          {/* Notification History */}
          {showNotifHistory && (
            <div className="border-t border-border">
              {notifLoading ? (
                <div className="p-4 text-center text-muted-foreground text-sm">Loading history...</div>
              ) : !notifHistory || notifHistory.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No tier change notifications sent yet.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifHistory.map((notif) => {
                    const isPromotion =
                      ['bronze', 'silver', 'gold'].indexOf(notif.newTier) >
                      ['bronze', 'silver', 'gold'].indexOf(notif.previousTier);
                    const monthName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][notif.notificationMonth - 1];
                    return (
                      <div key={notif.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          {isPromotion ? (
                            <ArrowUpCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                          ) : (
                            <ArrowDownCircle className="w-5 h-5 text-amber-500 shrink-0" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              AE #{notif.aeId} — {notif.previousTier.toUpperCase()} → {notif.newTier.toUpperCase()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {monthName} {notif.notificationYear} •{' '}
                              {new Date(notif.sentAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              notif.deliveryStatus === 'sent'
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : notif.deliveryStatus === 'failed'
                                ? 'bg-red-500/10 text-red-600'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {notif.deliveryStatus}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
