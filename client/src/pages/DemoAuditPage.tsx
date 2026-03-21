import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function DemoAuditPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );
  const [selectedAe, setSelectedAe] = useState<string>("all");

  // Fetch all AEs for filter dropdown
  const { data: allAes } = trpc.ae.list.useQuery();

  // Fetch flagged demos for the selected period
  const { data: allFlags, isLoading: loadingFlags } =
    trpc.demo.getAllFlags.useQuery(undefined, {
      retry: false,
      throwOnError: false,
    });

  // Fetch hygiene issues
  const { data: allHygieneIssues, isLoading: loadingHygiene } =
    trpc.demo.getAllHygieneIssues.useQuery(undefined, {
      retry: false,
      throwOnError: false,
    });

  const bulkAcknowledge = trpc.demo.bulkAcknowledgeFlags.useMutation({
    onSuccess: () => {
      trpc.useUtils().demo.getAllFlags.invalidate();
    },
  });

  const bulkDelete = trpc.demo.bulkDeleteFlags.useMutation({
    onSuccess: () => {
      trpc.useUtils().demo.getAllFlags.invalidate();
    },
  });

  // Filter flags by selected AE and month
  const filteredDuplicates = (allFlags || []).filter((f) => {
    const flagMonth = new Date(f.bookedDate).toISOString().slice(0, 7);
    const monthMatch = flagMonth === selectedMonth;
    const aeMatch = selectedAe === "all" || f.bookedByAeId.toString() === selectedAe;
    return monthMatch && aeMatch;
  });

  const filteredHygiene = (allHygieneIssues || []).filter((h) => {
    const flagMonth = new Date(h.bookedDate).toISOString().slice(0, 7);
    const monthMatch = flagMonth === selectedMonth;
    const aeMatch = selectedAe === "all" || h.aeId.toString() === selectedAe;
    return monthMatch && aeMatch;
  });

  const isLoading = loadingFlags || loadingHygiene;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Demo Audit</h1>
          <p className="text-gray-600">
            Review and manage flagged duplicate demos and CRM hygiene issues
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium">Month</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium">AE</label>
              <Select value={selectedAe} onValueChange={setSelectedAe}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All AEs</SelectItem>
                  {allAes?.map((ae) => (
                    <SelectItem key={ae.id} value={ae.id.toString()}>
                      {ae.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Duplicate Demos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  Duplicate Demos ({filteredDuplicates.length})
                </CardTitle>
                <CardDescription>
                  Demos from same organization within 6 months
                </CardDescription>
              </div>
              {filteredDuplicates.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    bulkAcknowledge.mutate({
                      flagIds: filteredDuplicates.map((f) => f.id),
                    });
                  }}
                  disabled={bulkAcknowledge.isPending}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Acknowledge All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-gray-500">Loading...</p>
            ) : filteredDuplicates.length === 0 ? (
              <p className="text-gray-500">No duplicate demos found</p>
            ) : (
              <div className="space-y-3">
                {filteredDuplicates.map((flag) => (
                  <div
                    key={flag.id}
                    className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 p-3"
                  >
                    <div>
                      <p className="font-medium">{flag.organizationName}</p>
                      <p className="text-sm text-gray-600">
                        Booked: {new Date(flag.bookedDate).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="secondary">Duplicate</Badge>
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
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  CRM Hygiene Issues ({filteredHygiene.length})
                </CardTitle>
                <CardDescription>
                  Demos not properly linked to deals
                </CardDescription>
              </div>
              {filteredHygiene.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    bulkDelete.mutate({
                      issueIds: filteredHygiene.map((h) => h.id),
                    });
                  }}
                  disabled={bulkDelete.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Resolve All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-gray-500">Loading...</p>
            ) : filteredHygiene.length === 0 ? (
              <p className="text-gray-500">No hygiene issues found</p>
            ) : (
              <div className="space-y-3">
                {filteredHygiene.map((issue) => (
                  <div
                    key={issue.id}
                    className="flex items-center justify-between rounded border border-red-200 bg-red-50 p-3"
                  >
                    <div>
                      <p className="font-medium">{issue.aeName}</p>
                      <p className="text-sm text-gray-600">
                        {issue.organizationName} • {issue.issueType}
                      </p>
                      <p className="text-xs text-gray-500">
                        Booked: {new Date(issue.bookedDate).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="destructive">{issue.issueType}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
