import { calculateTier, computeRollingAverages } from './shared/commission';

// Joe's metrics: Oct-Nov-Dec (the 3 months BEFORE January)
const octNovDec = [
  { year: 2025, month: 10, arrUsd: 27950, demosTotal: 26, dialsTotal: 779, retentionRate: null },
  { year: 2025, month: 11, arrUsd: 7067, demosTotal: 16, dialsTotal: 963, retentionRate: null },
  { year: 2025, month: 12, arrUsd: 42439, demosTotal: 7, dialsTotal: 385, retentionRate: null },
];

console.log('Joe Payne - January 2026 Tier Calculation');
console.log('Using metrics from Oct-Nov-Dec (the 3 months BEFORE January):');
console.log('  Oct 2025: ARR $27,950, Demos 26, Dials 779');
console.log('  Nov 2025: ARR $7,067, Demos 16, Dials 963');
console.log('  Dec 2025: ARR $42,439, Demos 7, Dials 385');

const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(octNovDec);

console.log(`\nRolling Averages:`);
console.log(`  Avg ARR: $${avgArrUsd.toFixed(2)}`);
console.log(`  Avg Demos/week: ${avgDemosPw.toFixed(2)}`);
console.log(`  Avg Dials/week: ${avgDialsPw.toFixed(0)}`);

const tierResult = calculateTier({
  avgArrUsd,
  avgDemosPw,
  avgDialsPw,
  avgRetentionRate: null,
  isNewJoiner: false,
  isTeamLeader: false,
});

console.log(`\nJanuary Tier: ${tierResult.tier.toUpperCase()}`);
console.log(`Commission Rate: ${tierResult.rate * 100}%`);
console.log(`\nBreakdown:`, tierResult.breakdown);
