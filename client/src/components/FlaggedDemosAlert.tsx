import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

export function FlaggedDemosAlert() {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const utils = trpc.useUtils();

  // Query for flagged demos for current AE
  const { data: flags, isLoading } = trpc.demo.getUnacknowledgedFlags.useQuery(undefined, {
    retry: false,
    throwOnError: false,
  });

  const acknowledgeFlag = trpc.demo.acknowledgeDuplicateFlag.useMutation({
    onSuccess: () => {
      utils.demo.getUnacknowledgedFlags.invalidate();
    },
  });

  const acknowledgeHygiene = trpc.demo.acknowledgeHygieneIssue.useMutation({
    onSuccess: () => {
      utils.demo.getUnacknowledgedFlags.invalidate();
    },
  });

  if (isLoading) {
    return null;
  }

  const allFlags = [
    ...(flags?.duplicateDemos || []).map((f) => ({
      id: f.id,
      type: "duplicate" as const,
      organizationName: f.organizationName,
      bookedDate: f.demoDate,
      message: `Duplicate demo for ${f.organizationName}`,
    })),
    ...(flags?.hygieneIssues || []).map((h) => ({
      id: h.id,
      type: "hygiene" as const,
      organizationName: h.organizationName,
      bookedDate: h.demoDate,
      message: `CRM hygiene issue: ${h.issueType}`,
    })),
  ];

  const visibleFlags = allFlags.filter((f) => !dismissed.has(f.id));

  if (visibleFlags.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {visibleFlags.map((flag) => (
        <Alert
          key={flag.id}
          className={
            flag.type === "duplicate"
              ? "border-amber-200 bg-amber-50"
              : "border-red-200 bg-red-50"
          }
        >
          <AlertCircle
            className={
              flag.type === "duplicate"
                ? "h-4 w-4 text-amber-600"
                : "h-4 w-4 text-red-600"
            }
          />
          <AlertTitle
            className={
              flag.type === "duplicate"
                ? "text-amber-900"
                : "text-red-900"
            }
          >
            {flag.type === "duplicate"
              ? "⚠️ Duplicate Demo Detected"
              : "⚠️ CRM Hygiene Issue"}
          </AlertTitle>
          <AlertDescription
            className={
              flag.type === "duplicate"
                ? "text-amber-800"
                : "text-red-800"
            }
          >
            <p className="mb-2">{flag.message}</p>
            {flag.type === "duplicate" && (
              <p className="text-sm">
                This demo is excluded from your 3-month rolling average because
                you already completed a demo for this organization within the
                last 6 months.
              </p>
            )}
            {flag.type === "hygiene" && (
              <p className="text-sm">
                This demo is not linked to a deal. Please update the activity
                in Pipedrive to link it to the correct deal so it counts toward
                your metrics.
              </p>
            )}
          </AlertDescription>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (flag.type === "duplicate") {
                  acknowledgeFlag.mutate({ flagId: flag.id });
                } else {
                  acknowledgeHygiene.mutate({ issueId: flag.id });
                }
                setDismissed((prev) => new Set(Array.from(prev).concat(flag.id)));
              }}
              disabled={acknowledgeFlag.isPending || acknowledgeHygiene.isPending}
              className="gap-1"
            >
              <CheckCircle2 className="h-4 w-4" />
              Acknowledge
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDismissed((prev) => new Set(Array.from(prev).concat(flag.id)))}
              className="gap-1"
            >
              <X className="h-4 w-4" />
              Dismiss
            </Button>
          </div>
        </Alert>
      ))}
    </div>
  );
}
