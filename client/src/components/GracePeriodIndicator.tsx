import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface GracePeriodIndicatorProps {
  inGracePeriod: boolean;
  gracePeriodStatus: string;
  year: number;
  month: number;
  arrUsd: number;
  actualArr?: number;
}

/**
 * Grace Period Indicator Component
 * 
 * Displays a visual indicator showing whether a month's metrics are within
 * the 6-month grace period (where ARR is assumed at $25k) or actual performance.
 */
export function GracePeriodIndicator({
  inGracePeriod,
  gracePeriodStatus,
  year,
  month,
  arrUsd,
  actualArr,
}: GracePeriodIndicatorProps) {
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const monthLabel = `${monthNames[month - 1]} ${year}`;

  if (inGracePeriod) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5"></span>
                Grace Period
              </Badge>
              <Info className="w-4 h-4 text-amber-600" />
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-2">
              <p className="font-semibold">{monthLabel} - {gracePeriodStatus}</p>
              <p className="text-sm">
                ARR is assumed at <strong>$25,000</strong> for tier calculation purposes during the 6-month grace period.
              </p>
              {actualArr !== undefined && (
                <p className="text-sm text-amber-100">
                  Actual ARR: <strong>${actualArr.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
                </p>
              )}
              <p className="text-xs text-amber-100 mt-2">
                This recognizes the ramp-up period required for new AEs to build their revenue base.
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5"></span>
              Actual Performance
            </Badge>
            <Info className="w-4 h-4 text-green-600" />
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-2">
            <p className="font-semibold">{monthLabel} - {gracePeriodStatus}</p>
            <p className="text-sm">
              ARR is based on <strong>actual revenue</strong> for tier calculation.
            </p>
            <p className="text-sm text-green-100">
              Actual ARR: <strong>${arrUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact Grace Period Badge
 * 
 * A smaller version for use in tables or lists
 */
export function GracePeriodBadge({ inGracePeriod }: { inGracePeriod: boolean }) {
  if (inGracePeriod) {
    return (
      <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700 text-xs">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1"></span>
        Grace
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700 text-xs">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1"></span>
      Actual
    </Badge>
  );
}
