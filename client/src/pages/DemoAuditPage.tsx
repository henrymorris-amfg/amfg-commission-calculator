/**
 * Demo Audit Page — Admin only
 *
 * Shows a full list of all Pipedrive demos marked done, segmented by AE.
 * Supports filtering by AE and date range, and CSV download.
 * Also shows duplicate flags and CRM hygiene issues.
 */

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Users,
  Calendar,
  Video,
  Trash2,
  AlertCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function DemoAuditPage() {
  const { ae, isLoading } = useAeAuth();
  const [, navigate] = useLocation();
  const [selectedAeId, setSelectedAeId] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [activeTab, setActiveTab] = useState("demos");

  // Fetch all AE profiles for the filter dropdown
  const { data: aeProfiles } = trpc.ae.listNames.useQuery();

  // Fetch all demo activities with filters
  const {
    data: demoActivities,
    isLoading: demosLoading,
    refetch: refetchDemos,
  } = trpc.demo.getAllDemoActivities.useQuery({
    aeId: selectedAeId !== "all" ? parseInt(selectedAeId) : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  // Fetch all flags (duplicate demos + hygiene issues)
  const {
    data: allFlags,
    isLoading: flagsLoading,
    refetch: refetchFlags,
  } = trpc.demo.getAllFlags.useQuery();

  const utils = trpc.useUtils();

  const bulkAcknowledge = trpc.demo.bulkAcknowledgeFlags.useMutation({
    onSuccess: () => {
      utils.demo.getAllFlags.invalidate();
      toast.success("Flags acknowledged.");
    },
    onError: () => toast.error("Failed to acknowledge flags."),
  });

  const bulkDelete = trpc.demo.bulkDeleteFlags.useMutation({
    onSuccess: () => {
      utils.demo.getAllFlags.invalidate();
      toast.success("Issues resolved.");
    },
    onError: () => toast.error("Failed to resolve issues."),
  });

  // Full Pipedrive resync (re-pulls demo activities from Pipedrive for all AEs)
  const fullResync = trpc.pipedriveSync.import.useMutation({
    onSuccess: (data) => {
      toast.success(`Pipedrive resync complete — ${data.updatedMetrics?.length ?? 0} months updated.`);
      refetchDemos();
      refetchFlags();
    },
    onError: (err) => toast.error(`Resync failed: ${err.message}`),
  });

  // Manual trigger for demo detection
  const triggerDetection = trpc.demo.triggerDetection.useMutation({
    onSuccess: () => {
      toast.success("Demo detection triggered — results will appear shortly.");
      refetchFlags();
    },
    onError: () => toast.error("Failed to trigger demo detection."),
  });

  // Group demos by AE for the segmented view
  type DemoActivity = NonNullable<typeof demoActivities>[number];
  const demosByAe = useMemo(() => {
    if (!demoActivities) return new Map<string, DemoActivity[]>();
    const map = new Map<string, DemoActivity[]>();
    for (const demo of demoActivities) {
      const key = demo.aeName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(demo);
    }
    return map;
  }, [demoActivities]);

  // CSV download
  function downloadCsv() {
    if (!demoActivities || demoActivities.length === 0) {
      toast.error("No data to export.");
      return;
    }

    const headers = ["AE Name", "Date Done", "Subject / Deal Name", "Organisation", "Deal ID", "Deal Title", "Valid", "Flag Reason"];
    const rows = demoActivities.map(d => [
      d.aeName,
      formatDate(d.doneDate),
      d.subject,
      d.orgName ?? "",
      d.dealId ?? "",
      d.dealTitle ?? "",
      d.isValid ? "Yes" : "No",
      d.flagReason ?? "",
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const dateStr = new Date().toISOString().substring(0, 10);
    const aeSuffix = selectedAeId !== "all"
      ? `_${aeProfiles?.find((a: { id: number; name: string }) => a.id === parseInt(selectedAeId))?.name?.replace(/\s+/g, "_") ?? selectedAeId}`
      : "_all_aes";
    link.download = `demos_done${aeSuffix}_${dateStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded.");
  }

  const totalDemos = demoActivities?.length ?? 0;
  const totalFlags = (allFlags?.duplicateDemos?.length ?? 0) + (allFlags?.hygieneIssues?.length ?? 0);

  // For flags tab: filter by selected AE
  const filteredDuplicates = (allFlags?.duplicateDemos ?? []).filter(f =>
    selectedAeId === "all" || f.aeId.toString() === selectedAeId
  );
  const filteredHygiene = (allFlags?.hygieneIssues ?? []).filter(h =>
    selectedAeId === "all" || h.aeId.toString() === selectedAeId
  );

  if (isLoading || !ae) return null;

  return (
    <AppLayout>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Demo Audit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Full list of Pipedrive demos marked done, segmented by AE
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetchDemos(); refetchFlags(); }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fullResync.mutate({ months: 12, useJoinDate: true, mergeMode: "replace" })}
            disabled={fullResync.isPending}
          >
            {fullResync.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            {fullResync.isPending ? "Resyncing..." : "Full Pipedrive Resync"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadCsv}
            disabled={!demoActivities || demoActivities.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => triggerDetection.mutate()}
            disabled={triggerDetection.isPending}
          >
            {triggerDetection.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <AlertTriangle className="h-4 w-4 mr-2" />
            )}
            Run Detection
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Video className="h-8 w-8 text-primary opacity-80" />
              <div>
                <p className="text-2xl font-bold">{totalDemos}</p>
                <p className="text-xs text-muted-foreground">Demos in view</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-primary opacity-80" />
              <div>
                <p className="text-2xl font-bold">{demosByAe.size}</p>
                <p className="text-xs text-muted-foreground">AEs with demos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-amber-500 opacity-80" />
              <div>
                <p className="text-2xl font-bold">{totalFlags}</p>
                <p className="text-xs text-muted-foreground">Active flags</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <Label className="text-xs text-muted-foreground">AE</Label>
              <Select value={selectedAeId} onValueChange={setSelectedAeId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All AEs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All AEs</SelectItem>
                  {aeProfiles?.map(ae => (
                    <SelectItem key={ae.id} value={String(ae.id)}>
                      {ae.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> From
              </Label>
              <Input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="h-9 w-40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> To
              </Label>
              <Input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="h-9 w-40"
              />
            </div>
            {(fromDate || toDate || selectedAeId !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-muted-foreground"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                  setSelectedAeId("all");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Demos List | Flags */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="demos">
            Demos Done
            {totalDemos > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{totalDemos}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="flags">
            Flags
            {totalFlags > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">{totalFlags}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Demos Done Tab */}
        <TabsContent value="demos" className="mt-4 space-y-4">
          {demosLoading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Loading demos...
              </CardContent>
            </Card>
          ) : !demoActivities || demoActivities.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Video className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-40" />
                <p className="text-muted-foreground text-sm">
                  No demo activities found. Run a Pipedrive sync to populate this list.
                </p>
              </CardContent>
            </Card>
          ) : (
            // Segmented by AE
            Array.from(demosByAe.entries()).map(([aeName, demos]) => (
              <Card key={aeName}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">{aeName}</CardTitle>
                    <Badge variant="secondary">{demos.length} demo{demos.length !== 1 ? "s" : ""}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Date Done</TableHead>
                        <TableHead>Subject / Deal Name</TableHead>
                        <TableHead>Organisation</TableHead>
                        <TableHead>Deal Title</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {demos
                        .slice()
                        .sort((a: DemoActivity, b: DemoActivity) => new Date(b.doneDate).getTime() - new Date(a.doneDate).getTime())
                        .map(demo => (
                          <TableRow key={demo.id}>
                            <TableCell className="pl-6 text-sm tabular-nums">
                              {formatDate(demo.doneDate)}
                            </TableCell>
                            <TableCell className="text-sm font-medium max-w-[220px] truncate">
                              {demo.subject}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                              {demo.orgName ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                              {demo.dealTitle ?? "—"}
                            </TableCell>
                            <TableCell>
                              {demo.isValid ? (
                                <Badge variant="outline" className="text-green-600 border-green-600/30 bg-green-600/5 text-xs">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Valid
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-amber-600 border-amber-600/30 bg-amber-600/5 text-xs">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  {demo.flagReason ?? "Flagged"}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Flags Tab */}
        <TabsContent value="flags" className="mt-4 space-y-4">
          {flagsLoading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Loading flags...
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Duplicate Demos */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        Duplicate Demos ({filteredDuplicates.length})
                      </CardTitle>
                      <CardDescription>Demos from same organisation within 6 months</CardDescription>
                    </div>
                    {filteredDuplicates.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => bulkAcknowledge.mutate({ flagIds: filteredDuplicates.map(f => f.id) })}
                        disabled={bulkAcknowledge.isPending}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Acknowledge All
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredDuplicates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No duplicate demos found.</p>
                  ) : (
                    <div className="space-y-2">
                      {filteredDuplicates.map(flag => (
                        <div key={flag.id} className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
                          <div>
                            <p className="font-medium text-sm">{flag.organizationName}</p>
                            <p className="text-xs text-muted-foreground">{flag.aeName} · {formatDate(flag.demoDate)}</p>
                            {flag.notes && <p className="text-xs text-muted-foreground mt-0.5">{flag.notes}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            {flag.isAcknowledged && (
                              <Badge variant="outline" className="text-green-600 border-green-600/30 text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Acknowledged
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-xs">Duplicate</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* CRM Hygiene Issues */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        CRM Hygiene Issues ({filteredHygiene.length})
                      </CardTitle>
                      <CardDescription>Demos not properly linked to deals</CardDescription>
                    </div>
                    {filteredHygiene.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => bulkDelete.mutate({ issueIds: filteredHygiene.map(h => h.id) })}
                        disabled={bulkDelete.isPending}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Resolve All
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredHygiene.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hygiene issues found.</p>
                  ) : (
                    <div className="space-y-2">
                      {filteredHygiene.map(issue => (
                        <div key={issue.id} className="flex items-center justify-between rounded border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3">
                          <div>
                            <p className="font-medium text-sm">{issue.aeName}</p>
                            <p className="text-sm text-muted-foreground">{issue.organizationName} · {issue.issueType.replace(/_/g, " ")}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(issue.demoDate)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {issue.isAcknowledged && (
                              <Badge variant="outline" className="text-green-600 border-green-600/30 text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Acknowledged
                              </Badge>
                            )}
                            <Badge variant="destructive" className="text-xs capitalize">
                              {issue.issueType.replace(/_/g, " ")}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {filteredDuplicates.length === 0 && filteredHygiene.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <CheckCircle2 className="h-10 w-10 mx-auto text-green-500 mb-3 opacity-60" />
                    <p className="text-muted-foreground text-sm">No active flags. All demos look clean.</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </AppLayout>
  );
}
