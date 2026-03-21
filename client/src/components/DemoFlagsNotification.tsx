import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

interface DemoFlag {
  id: number;
  organizationName: string;
  demoDate: Date;
  notes?: string;
  type: "duplicate" | "hygiene";
}

interface HygieneIssue extends DemoFlag {
  explanation?: string;
  issueType?: string;
}

export function DemoFlagsNotification() {
  const [flags, setFlags] = useState<DemoFlag[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Fetch unacknowledged flags
  const { data: flagsData, isLoading } = trpc.demo.getUnacknowledgedFlags.useQuery();

  // Acknowledge mutations
  const acknowledgeDuplicate = trpc.demo.acknowledgeDuplicateFlag.useMutation();
  const acknowledgeHygiene = trpc.demo.acknowledgeHygieneIssue.useMutation();

  useEffect(() => {
    if (flagsData) {
      const allFlags = [
        ...flagsData.duplicateDemos,
        ...flagsData.hygieneIssues,
      ];
      setFlags(allFlags);
    }
  }, [flagsData]);

  const handleAcknowledge = async (flag: DemoFlag) => {
    try {
      if (flag.type === "duplicate") {
        await acknowledgeDuplicate.mutateAsync({ flagId: flag.id });
      } else {
        await acknowledgeHygiene.mutateAsync({ issueId: flag.id });
      }

      // Remove from list
      setFlags(flags.filter((f) => f.id !== flag.id));
      setExpandedId(null);
    } catch (error) {
      console.error("Failed to acknowledge flag:", error);
    }
  };

  if (isLoading || flags.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-amber-700 flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        {flags.length} Demo Issue{flags.length !== 1 ? "s" : ""} to Review
      </div>

      {flags.map((flag) => (
        <Card
          key={flag.id}
          className={`p-4 border-l-4 ${
            flag.type === "duplicate"
              ? "border-l-orange-500 bg-orange-50"
              : "border-l-red-500 bg-red-50"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold px-2 py-1 rounded bg-white">
                  {flag.type === "duplicate" ? "DUPLICATE DEMO" : "CRM HYGIENE"}
                </span>
              </div>

              <p className="font-medium text-sm text-gray-900">
                {flag.organizationName}
              </p>

              <p className="text-xs text-gray-600 mt-1">
                Demo on {new Date(flag.demoDate).toLocaleDateString()}
              </p>

              {expandedId === flag.id && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-sm text-gray-700 mb-3">
                    {flag.type === "duplicate"
                      ? flag.notes ||
                        "This demo is a duplicate within the last 6 months for this organization. Duplicate demos are excluded from your 3-month rolling average to ensure accurate commission calculations."
                      : (flag as HygieneIssue).explanation ||
                        "This demo is not properly linked to a deal. Demos should be attached to specific deals for accurate tracking. Please link this demo to the correct deal in Pipedrive."}
                  </p>

                  {flag.type === "hygiene" && (
                    <div className="bg-white p-2 rounded text-xs text-gray-600 mt-2">
                      <p className="font-semibold mb-1">Why this matters:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Demos must be linked to deals for commission tracking</li>
                        <li>Organization/person/lead-only demos don't count toward metrics</li>
                        <li>Proper CRM hygiene ensures accurate reporting</li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setExpandedId(expandedId === flag.id ? null : flag.id)
                }
                className="text-gray-600 hover:text-gray-900"
              >
                {expandedId === flag.id ? "Hide" : "Details"}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAcknowledge(flag)}
                disabled={
                  acknowledgeDuplicate.isPending ||
                  acknowledgeHygiene.isPending
                }
                className="text-green-600 hover:text-green-700"
              >
                <CheckCircle2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
