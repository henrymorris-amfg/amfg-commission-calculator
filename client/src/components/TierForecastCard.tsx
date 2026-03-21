import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import { TrendingUp, AlertCircle } from "lucide-react";

export function TierForecastCard() {
  const { ae } = useAeAuth();
  const { data: forecast, isLoading, error } = trpc.commissionStructure.tierForecast.useQuery(
    undefined,
    { enabled: !!ae, retry: false }
  );

  if (isLoading) {
    return (
      <div className="rounded-lg p-6 bg-card border border-border animate-pulse">
        <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded w-full"></div>
          <div className="h-4 bg-muted rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg p-6 bg-card border border-border">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">Could not load tier forecast</p>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
      </div>
    );
  }

  if (!forecast) return null;

  const nextMonth = forecast.forecastMonths[0];
  const targetMetrics = forecast.actionableTargets.requiredMetrics;

  return (
    <div className="rounded-lg p-6 bg-card border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-500" />
          3-Month Tier Forecast
        </h3>
        <span className="text-sm font-medium px-2 py-1 rounded bg-blue-500/10 text-blue-600">
          {forecast.currentTier.toUpperCase()}
        </span>
      </div>

      <div className="space-y-4">
        {/* Current Metrics */}
        <div className="p-3 bg-muted/50 rounded">
          <p className="text-xs font-medium text-muted-foreground mb-2">Current Metrics</p>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground">ARR</p>
              <p className="font-semibold">${forecast.currentMetrics.arrUsd.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Demos/wk</p>
              <p className="font-semibold">{forecast.currentMetrics.demosPw.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Dials/wk</p>
              <p className="font-semibold">{forecast.currentMetrics.dialsPw}</p>
            </div>
          </div>
        </div>

        {/* Target for Next Tier */}
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded">
          <p className="text-xs font-medium text-green-700 mb-2">
            To reach {forecast.actionableTargets.targetTier.toUpperCase()} in 3 months:
          </p>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground">Monthly ARR</p>
              <p className="font-semibold">${targetMetrics.monthlyAverageArrUsd.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Monthly Demos</p>
              <p className="font-semibold">{targetMetrics.monthlyAverageDemosPw.toFixed(1)}/wk</p>
            </div>
            <div>
              <p className="text-muted-foreground">Monthly Dials</p>
              <p className="font-semibold">{targetMetrics.monthlyAverageDialsPw}</p>
            </div>
          </div>
        </div>

        {/* Month-by-month projection */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Month-by-Month Projection</p>
          {forecast.forecastMonths.map((month) => (
            <div key={month.month} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{month.month}</span>
                <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-700">
                  {month.projectedTier.toUpperCase()}
                </span>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                ${month.projectedMetrics.arrUsd.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
