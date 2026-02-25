import { calculateTier, computeRollingAverages } from './shared/commission';

// Joe's metrics in descending order (newest first) - as returned by getMetricsForAe
const allMetricsDescending = [
  { year: 2026, month: 2, arrUsd: 25670, demosTotal: 14, dialsTotal: 629, retentionRate: null },
  { year: 2026, month: 1, arrUsd: 28921, demosTotal: 17, dialsTotal: 655, retentionRate: null },
  { year: 2025, month: 12, arrUsd: 42439, demosTotal: 7, dialsTotal: 385, retentionRate: null },
  { year: 2025, month: 11, arrUsd: 7067, demosTotal: 16, dialsTotal: 963, retentionRate: null },
];

// For a deal starting in February 2026
const targetDate = new Date(2026, 1, 1); // Feb 1, 2026

// Filter metrics before target date
const beforeTarget = allMetricsDescending.filter(m => new Date(m.year, m.month - 1, 1) < targetDate);
console.log('Metrics before Feb 1, 2026:', beforeTarget.map(m => `${m.year}-${String(m.month).padStart(2, '0')}`));

// Take last 3
const last3 = beforeTarget.slice(0, 3);
console.log('Last 3 (slice 0,3):', last3.map(m => `${m.year}-${String(m.month).padStart(2, '0')}`));

// Calculate averages
const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3);
console.log(`\nAverages: ARR $${avgArrUsd.toFixed(0)}, Demos ${avgDemosPw.toFixed(2)}/wk, Dials ${avgDialsPw.toFixed(0)}/wk`);

// Calculate tier
const tierResult = calculateTier({
  avgArrUsd,
  avgDemosPw,
  avgDialsPw,
  avgRetentionRate: null,
  isNewJoiner: false,
  isTeamLeader: false,
});

console.log(`Tier for Feb deal: ${tierResult.tier}`);
console.log(`Expected: Silver (using Nov-Dec-Jan data)`);
