import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TierMonth {
  year: number;
  month: number;
  tier: "bronze" | "silver" | "gold";
  rate: number;
  avgArr: number;
}

interface TierHistoryProps {
  months: TierMonth[];
}

const TIER_COLORS = {
  bronze: "bg-amber-600",
  silver: "bg-slate-400",
  gold: "bg-yellow-500",
};

const TIER_LABELS = {
  bronze: "Bronze (13%)",
  silver: "Silver (16%)",
  gold: "Gold (19%)",
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export function TierHistory({ months }: TierHistoryProps) {
  const sortedMonths = useMemo(() => {
    return [...months].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }, [months]);

  if (sortedMonths.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tier History</CardTitle>
          <CardDescription>No tier history available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tier History</CardTitle>
        <CardDescription>
          Monthly tier progression based on 3-month rolling average
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Timeline view */}
          <div className="flex gap-2 overflow-x-auto pb-4">
            {sortedMonths.map((m, idx) => (
              <div key={idx} className="flex flex-col items-center gap-2 min-w-fit">
                <div
                  className={`w-12 h-12 rounded-lg ${TIER_COLORS[m.tier]} flex items-center justify-center text-white font-bold text-sm`}
                  title={`${MONTH_NAMES[m.month - 1]} ${m.year}: ${TIER_LABELS[m.tier]}`}
                >
                  {m.tier.charAt(0).toUpperCase()}
                </div>
                <div className="text-xs text-center whitespace-nowrap">
                  <div className="font-medium">{MONTH_NAMES[m.month - 1]}</div>
                  <div className="text-gray-500">{m.year}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Detailed table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Month</th>
                  <th className="text-left py-2 px-3">Tier</th>
                  <th className="text-right py-2 px-3">Rate</th>
                  <th className="text-right py-2 px-3">Avg ARR</th>
                </tr>
              </thead>
              <tbody>
                {sortedMonths.map((m, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">
                      {MONTH_NAMES[m.month - 1]} {m.year}
                    </td>
                    <td className="py-2 px-3">
                      <Badge className={`${TIER_COLORS[m.tier]} text-white`}>
                        {m.tier.charAt(0).toUpperCase() + m.tier.slice(1)}
                      </Badge>
                    </td>
                    <td className="text-right py-2 px-3 font-medium">
                      {m.rate}%
                    </td>
                    <td className="text-right py-2 px-3">
                      ${(m.avgArr / 1000).toFixed(1)}k
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
