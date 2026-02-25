import { calculateTier, computeRollingAverages } from './shared/commission';

// Joe's metrics: Nov-Dec-Jan (the 3 months BEFORE February)
const novDecJan = [
  { year: 2025, month: 11, arrUsd: 7067, demosTotal: 16, dialsTotal: 963, retentionRate: null },
  { year: 2025, month: 12, arrUsd: 42439, demosTotal: 7, dialsTotal: 385, retentionRate: null },
  { year: 2026, month: 1, arrUsd: 28921, demosTotal: 17, dialsTotal: 655, retentionRate: null },
];

console.log('Joe Payne - February 2026 Tier Calculation');
console.log('Using metrics from Nov-Dec-Jan (the 3 months BEFORE February):');
console.log('  Nov 2025: ARR $7,067, Demos 16, Dials 963');
console.log('  Dec 2025: ARR $42,439, Demos 7, Dials 385');
console.log('  Jan 2026: ARR $28,921, Demos 17, Dials 655');

const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(novDecJan);

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

console.log(`\nFebruary Tier: ${tierResult.tier.toUpperCase()}`);
console.log(`Commission Rate: ${tierResult.rate * 100}%`);

// Now check January tier (should use Oct-Nov-Dec)
console.log('\n\n---');
console.log('Joe Payne - January 2026 Tier Calculation');
console.log('Using metrics from Oct-Nov-Dec (the 3 months BEFORE January):');
console.log('  Oct 2025: ARR unknown (need to check database)');
console.log('  Nov 2025: ARR $7,067, Demos 16, Dials 963');
console.log('  Dec 2025: ARR $42,439, Demos 7, Dials 385');
