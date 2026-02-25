import { calculateTier, computeRollingAverages } from './shared/commission';

// Joe Payne's metrics
const metrics = [
  { year: 2025, month: 11, arrUsd: 7067, demosTotal: 16, dialsTotal: 963, retentionRate: null },
  { year: 2025, month: 12, arrUsd: 42439, demosTotal: 7, dialsTotal: 385, retentionRate: null },
  { year: 2026, month: 1, arrUsd: 28921, demosTotal: 17, dialsTotal: 655, retentionRate: null },
  { year: 2026, month: 2, arrUsd: 25670, demosTotal: 14, dialsTotal: 629, retentionRate: null },
];

// For January tier: use Nov, Dec, Jan (last 3 months before Jan)
const last3ForJan = metrics.slice(0, 3).map(m => ({
  year: m.year,
  month: m.month,
  arrUsd: m.arrUsd,
  demosTotal: m.demosTotal,
  dialsTotal: m.dialsTotal,
  retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
}));

console.log('January Tier Calculation (using Nov-Dec-Jan):');
const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3ForJan);
console.log(`  Avg ARR: $${avgArrUsd.toFixed(2)}`);
console.log(`  Avg Demos/week: ${avgDemosPw.toFixed(2)}`);
console.log(`  Avg Dials/week: ${avgDialsPw.toFixed(2)}`);

const tierResult = calculateTier({
  avgArrUsd,
  avgDemosPw,
  avgDialsPw,
  avgRetentionRate: null,
  isNewJoiner: false,
  isTeamLeader: false,
});

console.log(`January Tier: ${tierResult.tier} (${tierResult.rate * 100}%)`);

// For February tier: use Dec, Jan, Feb
const last3ForFeb = metrics.slice(1, 4).map(m => ({
  year: m.year,
  month: m.month,
  arrUsd: m.arrUsd,
  demosTotal: m.demosTotal,
  dialsTotal: m.dialsTotal,
  retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
}));

console.log('\nFebruary Tier Calculation (using Dec-Jan-Feb):');
const { avgArrUsd: avgArrUsdFeb, avgDemosPw: avgDemosPwFeb, avgDialsPw: avgDialsPwFeb } = computeRollingAverages(last3ForFeb);
console.log(`  Avg ARR: $${avgArrUsdFeb.toFixed(2)}`);
console.log(`  Avg Demos/week: ${avgDemosPwFeb.toFixed(2)}`);
console.log(`  Avg Dials/week: ${avgDialsPwFeb.toFixed(2)}`);

const tierResultFeb = calculateTier({
  avgArrUsd: avgArrUsdFeb,
  avgDemosPw: avgDemosPwFeb,
  avgDialsPw: avgDialsPwFeb,
  avgRetentionRate: null,
  isNewJoiner: false,
  isTeamLeader: false,
});

console.log(`February Tier: ${tierResultFeb.tier} (${tierResultFeb.rate * 100}%)`);
