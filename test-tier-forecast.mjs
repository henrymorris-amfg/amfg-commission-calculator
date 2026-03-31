import { computeRollingAverages, calculateTier, isNewJoiner } from './shared/commission.ts';

// Tad's data
const joinDate = new Date('2026-03-16');
const last3Months = [
  { year: 2026, month: 3, arrUsd: 25000, demosTotal: 12, dialsTotal: 510, retentionRate: null }, // Override to $25k for new joiner
  { year: 2026, month: 2, arrUsd: 0, demosTotal: 0, dialsTotal: 0, retentionRate: null },
  { year: 2026, month: 1, arrUsd: 0, demosTotal: 0, dialsTotal: 0, retentionRate: null },
];

const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3Months, joinDate);
console.log('Computed Averages:');
console.log(`  ARR: $${avgArrUsd.toFixed(2)}`);
console.log(`  Demos/week: ${avgDemosPw.toFixed(2)}`);
console.log(`  Dials/week: ${avgDialsPw.toFixed(2)}`);

const tierResult = calculateTier({
  avgArrUsd,
  avgDemosPw,
  avgDialsPw,
  avgRetentionRate: null,
  isNewJoiner: isNewJoiner(joinDate),
  isTeamLeader: false,
});

console.log('\nTier Result:');
console.log(`  Tier: ${tierResult.tier}`);
console.log(`  Meets ARR: ${tierResult.meetsArrTarget}`);
console.log(`  Meets Demos: ${tierResult.meetsDemoTarget}`);
console.log(`  Meets Dials: ${tierResult.meetsDialTarget}`);
