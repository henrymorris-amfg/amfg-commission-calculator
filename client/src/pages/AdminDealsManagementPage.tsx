import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Edit2, Save, X, Loader2, CheckCircle } from "lucide-react";
import { useState, useMemo } from "react";

export default function AdminDealsManagementPage() {
  const [, navigate] = useLocation();
  const { ae, isLoading: authLoading } = useAeAuth();
  const [selectedAeId, setSelectedAeId] = useState<number | null>(null);
  const [editingDealId, setEditingDealId] = useState<number | null>(null);
  const [editingDate, setEditingDate] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterChurned, setFilterChurned] = useState<"all" | "active" | "churned">("all");

  // Check if user is admin (team leader or Henry Morris specifically)
  // Henry Morris (ID 2) is the owner and should have access
  const isAdmin = ae && (ae.isTeamLeader || ae.id === 2);

  // Get all AEs for dropdown
  const { data: allAes, isLoading: aesLoading } = trpc.ae.listNames.useQuery();

  // Get deals for selected AE
  const { data: deals, isLoading: dealsLoading, refetch: refetchDeals } = trpc.deals.list.useQuery(
    { aeId: selectedAeId ?? 0 } as any,
    { enabled: selectedAeId !== null }
  ) as any;

  // Update contract start date mutation
  const updateDate = trpc.deals.updateContractStartDate.useMutation({
    onSuccess: () => {
      refetchDeals();
      setEditingDealId(null);
      setEditingDate("");
    },
    onError: (err) => {
      alert(`Failed to update: ${err.message}`);
    },
  });

  // Redirect if not admin
  if (!authLoading && !isAdmin) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <h2 className="text-xl font-semibold text-red-500 mb-2">Access Denied</h2>
            <p className="text-red-500/80">This page is only available to team leaders.</p>
            <Button onClick={() => navigate("/dashboard")} className="mt-4">Back to Dashboard</Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Filter and search deals
  const filteredDeals = useMemo(() => {
    if (!deals) return [];
    return deals.filter((deal: any) => {
      const matchesSearch = deal.customerName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter =
        filterChurned === "all" ||
        (filterChurned === "active" && !deal.isChurned) ||
        (filterChurned === "churned" && deal.isChurned);
      return matchesSearch && matchesFilter;
    });
  }, [deals, searchTerm, filterChurned]);

  const handleEditClick = (dealId: number, currentDate: string) => {
    setEditingDealId(dealId);
    setEditingDate(currentDate);
  };

  const handleSave = async () => {
    if (!editingDealId || !editingDate) return;
    const [year, month, day] = editingDate.split('-').map(Number);
    await updateDate.mutateAsync({
      dealId: editingDealId,
      startYear: year,
      startMonth: month,
      startDay: day,
    });
  };

  const handleCancel = () => {
    setEditingDealId(null);
    setEditingDate("");
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Deals Management</h1>
          <p className="text-muted-foreground">
            Edit contract start dates for deals. Changes automatically recalculate payouts and metrics.
          </p>
        </div>

        {/* Admin Badge */}
        <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500" />
          <p className="text-sm text-amber-600">
            <strong>Admin Only:</strong> This page is restricted to administrators. Changes affect all AE metrics and payouts.
          </p>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* AE Selector */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Select AE</label>
            <Select value={selectedAeId?.toString() || ""} onValueChange={(v) => setSelectedAeId(parseInt(v))}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an AE..." />
              </SelectTrigger>
              <SelectContent>
                {aesLoading ? (
                  <div className="p-2 text-sm text-muted-foreground">Loading...</div>
                ) : (
                  allAes?.map((ae: any) => (
                    <SelectItem key={ae.id} value={ae.id.toString()}>
                      {ae.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Search */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Search Customer</label>
            <Input
              placeholder="Search by customer name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filter Churned */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Status</label>
            <Select value={filterChurned} onValueChange={(v: any) => setFilterChurned(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Deals</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="churned">Churned Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Deals Table */}
        {selectedAeId && (
          <div className="rounded-lg border border-border overflow-hidden">
            {dealsLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">Loading deals...</p>
              </div>
            ) : filteredDeals.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-muted-foreground">No deals found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Customer</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Current Start Date</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">ARR USD</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Tier</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeals.map((deal: any) => (
                      <tr key={deal.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 text-sm text-foreground font-medium">{deal.customerName}</td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {editingDealId === deal.id ? (
                            <Input
                              type="date"
                              value={editingDate}
                              onChange={(e) => setEditingDate(e.target.value)}
                              className="max-w-xs"
                            />
                          ) : (
                            deal.contractStartDate
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">${Number(deal.arrUsd).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className="px-2 py-1 rounded-full text-xs font-semibold"
                            style={{
                              background:
                                deal.tierAtStart === "gold"
                                  ? "oklch(0.82 0.14 75 / 0.12)"
                                  : deal.tierAtStart === "silver"
                                    ? "oklch(0.75 0.02 250 / 0.12)"
                                    : "oklch(0.65 0.12 55 / 0.12)",
                              color:
                                deal.tierAtStart === "gold"
                                  ? "oklch(0.88 0.14 75)"
                                  : deal.tierAtStart === "silver"
                                    ? "oklch(0.82 0.02 250)"
                                    : "oklch(0.65 0.12 55)",
                            }}
                          >
                            {deal.tierAtStart}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {deal.isChurned ? (
                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-600">
                              Churned
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-600">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {editingDealId === deal.id ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={handleSave}
                                disabled={updateDate.isPending}
                                className="gap-1"
                              >
                                {updateDate.isPending ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4" />
                                    Save
                                  </>
                                )}
                              </Button>
                              <Button size="sm" variant="outline" onClick={handleCancel}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditClick(deal.id, deal.contractStartDate)}
                              className="gap-1"
                            >
                              <Edit2 className="w-4 h-4" />
                              Edit
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!selectedAeId && (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">Select an AE from the dropdown above to view their deals.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
