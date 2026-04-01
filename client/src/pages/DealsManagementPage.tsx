import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { AdminEditContractStartDate } from "@/components/AdminEditContractStartDate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function DealsManagementPage() {
  const auth = useAeAuth();
  const user = auth as any;
  const [selectedAeId, setSelectedAeId] = useState<number | null>(null);

  // Get all AEs
  const { data: allAes, isLoading: isLoadingAes } = trpc.ae.listNames.useQuery() as any;

  // Get deals for selected AE
  const { data: deals, isLoading: isLoadingDeals, refetch } = trpc.deals.list.useQuery(
    { aeId: selectedAeId ?? 0 } as any,
    { enabled: selectedAeId !== null }
  ) as any;

  // Only team leaders can access this page
  if (!auth || !(auth as any).isTeamLeader) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-6 text-center">
            <p className="text-amber-400 font-medium">Team Leader Access Required</p>
            <p className="text-sm text-muted-foreground mt-2">Only team leaders can edit deal contract start dates.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Deals Management</h1>
          <p className="text-muted-foreground mt-2">Edit contract start dates and view deal details</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* AE Selector */}
          <div className="lg:col-span-1">
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-sm">Select AE</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {isLoadingAes ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : !allAes || allAes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No AEs found</p>
                ) : (
                  allAes.map((ae: any) => (
                    <button
                      key={ae.id}
                      onClick={() => setSelectedAeId(ae.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedAeId === ae.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <div className="font-medium">{ae.name}</div>
                      <div className="text-xs opacity-70">
                        {ae.isTeamLeader && <Badge variant="secondary" className="mt-1">TL</Badge>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Deals List */}
          <div className="lg:col-span-3">
            {selectedAeId === null ? (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <p className="text-muted-foreground">Select an AE to view their deals</p>
              </div>
            ) : isLoadingDeals ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : !deals || deals.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <p className="text-muted-foreground">No deals found for this AE</p>
              </div>
            ) : (
              <div className="space-y-3">
                {deals.map((deal: any) => (
                  <div
                    key={deal.id}
                    className="bg-card border border-border rounded-lg p-4 flex items-center justify-between hover:border-primary/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{deal.customerName}</div>
                      <div className="text-xs text-muted-foreground mt-1 space-y-1">
                        <div>
                          <span className="font-medium">Contract Start:</span> {deal.startYear}-
                          {String(deal.startMonth).padStart(2, "0")}-{String(deal.startDay).padStart(2, "0")}
                        </div>
                        <div>
                          <span className="font-medium">ARR:</span> ${Number(typeof deal.arrUsd === 'string' ? deal.arrUsd : deal.arrUsd).toLocaleString()} USD
                        </div>
                        <div>
                          <span className="font-medium">Type:</span> {deal.contractType === "annual" ? "Annual" : "Monthly"}
                        </div>
                        {deal.isChurned && (
                          <div>
                            <Badge variant="destructive" className="mt-2">Churned</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <AdminEditContractStartDate
                        deal={{
                          id: deal.id,
                          customerName: deal.customerName,
                          startYear: deal.startYear,
                          startMonth: deal.startMonth,
                          startDay: deal.startDay,
                          arrUsd: typeof deal.arrUsd === 'string' ? deal.arrUsd : String(deal.arrUsd),
                        }}
                        onSuccess={() => refetch()}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
