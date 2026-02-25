// Simulate getMetricsForAe returning metrics in descending order (newest first)
const allMetrics = [
  { year: 2026, month: 2, arrUsd: 25670 },
  { year: 2026, month: 1, arrUsd: 28921 },
  { year: 2025, month: 12, arrUsd: 42439 },
  { year: 2025, month: 11, arrUsd: 7067 },
  { year: 2025, month: 10, arrUsd: 5000 },
];

// For February (input.year = 2026, input.month = 2)
const input = { year: 2026, month: 2 };
const targetDate = new Date(input.year, input.month - 1, 1); // Feb 1, 2026

console.log('Target date:', targetDate.toISOString());
console.log('\nAll metrics (descending order):');
allMetrics.forEach(m => {
  const d = new Date(m.year, m.month - 1, 1);
  console.log(`  ${m.year}-${String(m.month).padStart(2, '0')}: ${d.toISOString()}`);
});

// Filter logic from routers.ts line 390-394
const last3 = allMetrics
  .filter((m) => {
    const d = new Date(m.year, m.month - 1, 1);
    return d < targetDate;
  })
  .slice(0, 3);

console.log('\nFiltered (d < targetDate):');
last3.forEach(m => {
  const d = new Date(m.year, m.month - 1, 1);
  console.log(`  ${m.year}-${String(m.month).padStart(2, '0')}`);
});

console.log('\nExpected for February tier: Nov-Dec-Jan');
console.log('Actual result:', last3.map(m => `${m.year}-${String(m.month).padStart(2, '0')}`).join(', '));
