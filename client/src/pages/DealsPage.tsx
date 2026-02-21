import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MONTH_NAMES, TIER_COMMISSION_RATE } from "../../../shared/commission";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Users,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";

const TIER_CONFIG = {
  bronze: { label: "Bronze", color: "oklch(0.65 0.12 55)" },
  silver: { label: "Silver", color: "oklch(0.82 0.02 250)" },
  gold: { label: "Gold", color: "oklch(0.88 0.14 75)" },
};

export default function DealsPage() {
  const [, navigate] = useLocation();
  const { ae, isLoading } = useAeAuth();
  const utils = trpc.useUtils();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [contractType, setContractType] = useState<"annual" | "monthly">("annual");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [arrUsd, setArrUsd] = useState("");
  const [onboardingFeePaid, setOnboardingFeePaid] = useState(true);
  const [isReferral, setIsReferral] = useState(false);
  const [tierOverride, setTierOverride] = useState<"" | "bronze" | "silver" | "gold">("");
  const [expandedDeal, setExpandedDeal] = useState<number | null>(null);

  const { data: deals = [], isLoading: dealsLoading } = trpc.deals.list.useQuery(
    undefined,
    { enabled: !!ae }
  );

  const { data: fxData } = trpc.commission.fxRate.useQuery(undefined, { enabled: !!ae });

  const { data: expandedPayouts } = trpc.deals.getPayouts.useQuery(
    { dealId: expandedDeal! },
    { enabled: expandedDeal != null }
  );

  const createDealMutation = trpc.deals.create.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Deal logged! Tier: ${data.tier.toUpperCase()} (${(TIER_COMMISSION_RATE[data.tier] * 100).toFixed(0)}%) · FX: ${data.fxRate.toFixed(4)}`
      );
      utils.deals.list.invalidate();
      utils.commission.monthlySummary.invalidate();
      setShowForm(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteDealMutation = trpc.deals.delete.useMutation({
    onSuccess: () => {
      toast.success("Deal deleted.");
      utils.deals.list.invalidate();
      utils.commission.monthlySummary.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (!isLoading && !ae) navigate("/");
  }, [ae, isLoading]);

  const resetForm = () => {
    setCustomerName("");
    setContractType("annual");
    setStartDate(format(new Date(), "yyyy-MM-dd"));
    setArrUsd("");
    setOnboardingFeePaid(true);
    setIsReferral(false);
    setTierOverride("");
  };

  const handleCreate = () => {
    if (!customerName.trim()) return toast.error("Customer name is required.");
    const arr = parseFloat(arrUsd);
    if (!arr || arr <= 0) return toast.error("ARR must be a positive number.");
    const [sy, sm, sd] = startDate.split("-").map(Number);
    createDealMutation.mutate({
      customerName: customerName.trim(),
      contractType,
      startYear: sy,
      startMonth: sm,
      startDay: sd,
      arrUsd: arr,
      onboardingFeePaid,
      isReferral,
      tierOverride: tierOverride || undefined,
    });
  };

  if (isLoading || !ae) return null;

  return (
    <AppLayout>
      <div className="p-8 space-y-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl text-foreground">Deals</h1>
            <p className="text-muted-foreground mt-1">
              Log contracts and track your commission schedule.
            </p>
          </div>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
          >
            <Plus className="w-4 h-4" />
            {showForm ? "Cancel" : "Log Deal"}
          </Button>
        </div>

        {/* FX Rate */}
        {fxData && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live exchange rate: 1 USD = £{fxData.usdToGbp.toFixed(4)} GBP
            <span className="text-muted-foreground/60">· Updated {format(new Date(fxData.fetchedAt), "HH:mm")}</span>
          </div>
        )}

        {/* Deal Entry Form */}
        {showForm && (
          <div className="rounded-2xl bg-card border border-border p-6 space-y-6">
            <h3 className="text-lg font-semibold text-foreground">New Deal</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Customer Name *</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Acme Manufacturing Ltd"
                  className="bg-input border-border focus:border-primary h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Contract Start Date *</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-input border-border focus:border-primary h-11"
                />
                <p className="text-xs text-muted-foreground">Tier is determined by this month, not signature date.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Contract Type *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["annual", "monthly"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setContractType(t)}
                      className={`h-11 rounded-xl border text-sm font-medium transition-all ${
                        contractType === t
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "bg-input border-border text-muted-foreground hover:border-border/80"
                      }`}
                    >
                      {t === "annual" ? "Annual (upfront)" : "Monthly (×13)"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {contractType === "annual"
                    ? "Commission paid upfront on full year ARR."
                    : "Commission paid monthly for 13 months from start."}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Annual ARR (USD) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    type="number"
                    min="0"
                    value={arrUsd}
                    onChange={(e) => setArrUsd(e.target.value)}
                    placeholder="e.g. 24000"
                    className="pl-7 bg-input border-border focus:border-primary h-11"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Annual contract value in USD (from Customer Sheet)</p>
              </div>
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setOnboardingFeePaid(!onboardingFeePaid)}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left ${
                  onboardingFeePaid
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-destructive/30 bg-destructive/5"
                }`}
              >
                {onboardingFeePaid
                  ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                  : <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {onboardingFeePaid ? "Onboarding Fee Paid" : "Onboarding Fee NOT Paid"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {onboardingFeePaid
                      ? "Standard £1k/€1k/$1k fee charged"
                      : "£500 deducted + ARR reduced by $5k"}
                  </p>
                </div>
              </button>

              <button
                onClick={() => setIsReferral(!isReferral)}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left ${
                  isReferral
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <Users className={`w-5 h-5 flex-shrink-0 ${isReferral ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {isReferral ? "Referral Deal" : "Not a Referral"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isReferral ? "Commission reduced by 50%" : "Full commission applies"}
                  </p>
                </div>
              </button>
            </div>

            {/* Tier Override */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Tier Override (optional)</Label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTierOverride("")}
                  className={`flex-1 h-10 rounded-xl border text-sm font-medium transition-all ${
                    tierOverride === "" ? "bg-secondary border-primary/30 text-foreground" : "bg-input border-border text-muted-foreground"
                  }`}
                >
                  Auto-detect
                </button>
                {(["bronze", "silver", "gold"] as const).map((t) => {
                  const tc = TIER_CONFIG[t];
                  return (
                    <button
                      key={t}
                      onClick={() => setTierOverride(t)}
                      className={`flex-1 h-10 rounded-xl border text-sm font-medium transition-all ${
                        tierOverride === t ? "text-foreground" : "text-muted-foreground"
                      }`}
                      style={tierOverride === t ? {
                        background: `${tc.color}15`,
                        borderColor: `${tc.color}40`,
                        color: tc.color,
                      } : {}}
                    >
                      {tc.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave as Auto-detect to use your calculated tier for the contract start month.
              </p>
            </div>

            <Button
              onClick={handleCreate}
              disabled={createDealMutation.isPending}
              className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2"
            >
              {createDealMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Calculating commission...
                </span>
              ) : (
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" />Log Deal & Calculate Commission</span>
              )}
            </Button>
          </div>
        )}

        {/* Deals List */}
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-base font-semibold text-foreground">
              All Deals <span className="text-muted-foreground font-normal text-sm ml-1">({deals.length})</span>
            </h3>
          </div>

          {dealsLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : deals.length === 0 ? (
            <div className="text-center py-16">
              <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground text-sm mb-3">No deals logged yet.</p>
              <Button
                size="sm"
                onClick={() => setShowForm(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Log your first deal
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {deals.map((deal) => {
                const tc = TIER_CONFIG[deal.tierAtStart as keyof typeof TIER_CONFIG];
                const isExpanded = expandedDeal === deal.id;
                const commRate = TIER_COMMISSION_RATE[deal.tierAtStart as keyof typeof TIER_COMMISSION_RATE];
                const effectiveArr = deal.onboardingFeePaid ? deal.arrUsd : Math.max(0, deal.arrUsd - 5000);
                const grossComm = deal.contractType === "annual"
                  ? effectiveArr * commRate
                  : (effectiveArr / 12) * commRate;
                const totalGross = deal.contractType === "annual" ? grossComm : grossComm * 13;
                const referralAdj = deal.isReferral ? totalGross * 0.5 : 0;
                const netUsd = totalGross - referralAdj;
                const netGbp = netUsd * deal.fxRateAtEntry - (deal.onboardingFeePaid ? 0 : 500);

                return (
                  <div key={deal.id}>
                    <div
                      className="flex items-center justify-between px-6 py-4 hover:bg-secondary/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedDeal(isExpanded ? null : deal.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: tc.color }} />
                        <div>
                          <p className="text-sm font-semibold text-foreground">{deal.customerName}</p>
                          <p className="text-xs text-muted-foreground">
                            {MONTH_NAMES[deal.startMonth - 1]} {deal.startYear}
                            {" · "}{deal.contractType}
                            {deal.isReferral && " · Referral"}
                            {!deal.onboardingFeePaid && " · No onboarding fee"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-muted-foreground">ARR</p>
                          <p className="text-sm font-semibold text-foreground">
                            ${deal.arrUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Est. Total Commission</p>
                          <p className="text-sm font-bold" style={{ color: tc.color }}>
                            £{Math.max(0, netGbp).toFixed(2)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium px-2 py-1 rounded-full"
                            style={{ background: `${tc.color}15`, color: tc.color }}>
                            {tc.label}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete deal for ${deal.customerName}?`)) {
                                deleteDealMutation.mutate({ dealId: deal.id });
                              }
                            }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Payout Schedule */}
                    {isExpanded && (
                      <div className="px-6 pb-5 bg-secondary/20">
                        <div className="pt-4 border-t border-border">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            {[
                              { label: "Commission Rate", value: `${(commRate * 100).toFixed(0)}%` },
                              { label: "Effective ARR", value: `$${effectiveArr.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                              { label: "FX Rate (at entry)", value: `£${deal.fxRateAtEntry.toFixed(4)}` },
                              { label: "Payouts", value: deal.contractType === "annual" ? "1 (upfront)" : "13 monthly" },
                            ].map((item) => (
                              <div key={item.label} className="rounded-xl bg-card border border-border p-3">
                                <p className="text-xs text-muted-foreground">{item.label}</p>
                                <p className="text-sm font-bold text-foreground mt-0.5">{item.value}</p>
                              </div>
                            ))}
                          </div>

                          {expandedPayouts && expandedPayouts.length > 0 && (
                            <div className="rounded-xl border border-border overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border bg-muted/30">
                                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Payout #</th>
                                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Month</th>
                                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Gross (USD)</th>
                                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Deductions</th>
                                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Net (GBP)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expandedPayouts.map((p) => (
                                    <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors">
                                      <td className="px-4 py-2.5 text-muted-foreground">#{p.payoutNumber}</td>
                                      <td className="px-4 py-2.5 text-foreground font-medium">
                                        {MONTH_NAMES[p.payoutMonth - 1]} {p.payoutYear}
                                      </td>
                                      <td className="px-4 py-2.5 text-right text-foreground">
                                        ${p.grossCommissionUsd.toFixed(2)}
                                      </td>
                                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                                        {p.referralDeductionUsd > 0 && (
                                          <span className="text-destructive">-${p.referralDeductionUsd.toFixed(2)} ref</span>
                                        )}
                                        {p.onboardingDeductionGbp > 0 && (
                                          <span className="text-destructive ml-1">-£{p.onboardingDeductionGbp.toFixed(0)} ob</span>
                                        )}
                                        {p.referralDeductionUsd === 0 && p.onboardingDeductionGbp === 0 && "—"}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-bold" style={{ color: tc.color }}>
                                        £{p.netCommissionGbp.toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-border bg-muted/20">
                                    <td colSpan={4} className="px-4 py-2.5 text-sm font-semibold text-foreground">Total</td>
                                    <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: tc.color }}>
                                      £{expandedPayouts.reduce((s, p) => s + p.netCommissionGbp, 0).toFixed(2)}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
