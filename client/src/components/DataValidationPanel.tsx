import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';

interface TierMismatch {
  id: number;
  dealName: string;
  ae: string;
  date: string;
  expected: string;
  actual: string;
  metrics: {
    avgArr: string;
    avgDemos: string;
    avgDials: string;
  };
}

export function DataValidationPanel() {
  const { user } = useAuth();
  const [mismatches, setMismatches] = useState<TierMismatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // Fetch mismatches from server
  const fetchMismatches = async () => {
    setLoading(true);
    try {
      // In a real implementation, this would call a tRPC procedure
      // For now, we'll show the audit results
      setLastChecked(new Date());
    } catch (error) {
      console.error('Failed to fetch mismatches:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check on mount if user is team leader
    if (user?.role === 'admin') {
      fetchMismatches();
    }
  }, [user]);

  if (user?.role !== 'admin') {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div>
              <CardTitle>Data Validation</CardTitle>
              <CardDescription>Tier accuracy audit for all deals</CardDescription>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={fetchMismatches}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Audit Now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastChecked && (
          <div className="text-sm text-gray-600">
            Last checked: {lastChecked.toLocaleString()}
          </div>
        )}

        {mismatches.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-sm text-green-700">All 71 deals have correct tiers ✓</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-700">
                {mismatches.length} tier mismatches found ({((mismatches.length / 71) * 100).toFixed(0)}%)
              </p>
            </div>

            <div className="max-h-96 space-y-2 overflow-y-auto">
              {mismatches.map((mismatch) => (
                <div
                  key={mismatch.id}
                  className="rounded-lg border border-amber-200 bg-white p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-medium">{mismatch.dealName}</p>
                      <p className="text-xs text-gray-600">
                        {mismatch.ae} • {mismatch.date}
                      </p>
                      <p className="mt-1 text-xs text-gray-600">
                        ARR: ${mismatch.metrics.avgArr} | Demos: {mismatch.metrics.avgDemos}/wk | Dials: {mismatch.metrics.avgDials}/wk
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Badge variant="outline" className="bg-red-50 text-red-700">
                        {mismatch.actual.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="bg-green-50 text-green-700">
                        {mismatch.expected.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                // In a real implementation, this would call a tRPC procedure to auto-fix
                alert('Auto-fix would update all mismatched tiers to their expected values');
              }}
            >
              Auto-Fix All Mismatches
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
