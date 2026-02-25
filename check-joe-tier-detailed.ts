import { calculateTier, computeRollingAverages, STANDARD_TARGETS } from './shared/commission';

// Joe Payne's metrics
const metrics = [
  { year: 2025, month: 11, arrUsd: 7067, demosTotal: 16, dialsTotal: 963, retentionRate: null },
  { year: 2025, month: 12, arrUsd: 42439, demosTotal: 7, dialsTotal: 385, retentionRate: null },
  { year: 2026, month: 1, arrUsd: 28921, demosTotal: 17, dialsTotal: 655, retentionRate: null },
];

const last3ForJan = metrics.slice(0, 3).map(m => ({
  year: m.year,
  month: m.month,
  arrUsd: m.arrUsd,
  demosTotal: m.demosTotal,
  dialsTotal: m.dialsTotal,
  retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
}));

const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3ForJan);

console.log('January Tier Calculation:');
console.log(`  Avg ARR: $${avgArrUsd.toFixed(2)}`);
console.log(`  Avg Demos/week: ${avgDemosPw.toFixed(2)}`);
console.log(`  Avg Dials/week: ${avgDialsPw.toFixed(2)}`);
console.log(`\nSilver Targets:`, STANDARD_TARGETS.silver);
console.log(`\nChecks:`);
console.log(`  ARR $${avgArrUsd.toFixed(0)} >= $${STANDARD_TARGETS.silver.arrUsd}? ${avgArrUsd >= STANDARD_TARGETS.silver.arrUsd}`);
console.log(`  Demos ${avgDemosPw.toFixed(2)}/wk >= ${STANDARD_TARGETS.silver.demosPw}/wk? ${avgDemosPw >= STANDARD_TARGETS.silver.demosPw}`);
console.log(`  Dials ${avgDialsPw.toFixed(0)}/wk >= ${STANDARD_TARGETS.silver.dialsPw}/wk? ${avgDialsPw >= STANDARD_TARGETS.silver.dialsPw}`);

const tierResult = calculateTier({
  avgArrUsd,
  avgDemosPw,
  avgDialsPw,
  avgRetentionRate: null,
  isNewJoiner: false,
  isTeamLeader: false,
});

console.log(`\nResult: ${tierResult.tier}`);
console.log(`Reasons:`, tierResult.reasons);
