import mysql from 'mysql2/promise';

const url = new URL(process.env.DATABASE_URL);
const connection = await mysql.createConnection({
  host: url.hostname,
  port: url.port,
  user: url.username,
  password: url.password.split('@')[0],
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

// Tier thresholds
const thresholds = {
  bronze: { arr: 15000, demos: 10, dials: 150 },
  silver: { arr: 20000, demos: 12, dials: 175 },
  gold: { arr: 25000, demos: 15, dials: 200 }
};

function calculateTier(avgArr, avgDemos, avgDials, isNewJoiner) {
  if (isNewJoiner) {
    // New joiner: only check activity metrics
    if (avgDials >= thresholds.gold.dials && avgDemos >= thresholds.gold.demos) return 'gold';
    if (avgDials >= thresholds.silver.dials && avgDemos >= thresholds.silver.demos) return 'silver';
    return 'bronze';
  }
  
  // Regular: check all three
  if (avgArr >= thresholds.gold.arr && avgDials >= thresholds.gold.dials && avgDemos >= thresholds.gold.demos) return 'gold';
  if (avgArr >= thresholds.silver.arr && avgDials >= thresholds.silver.dials && avgDemos >= thresholds.silver.demos) return 'silver';
  return 'bronze';
}

// Get all deals
const [deals] = await connection.execute(
  "SELECT d.id, d.customerName, d.aeId, d.startYear, d.startMonth, d.tierAtStart, d.arrUsd, a.name, a.joinDate FROM deals d JOIN ae_profiles a ON d.aeId = a.id ORDER BY a.name, d.startYear, d.startMonth"
);

// Get all metrics
const [metrics] = await connection.execute(
  "SELECT aeId, year, month, arrUsd, demosTotal, dialsTotal FROM monthly_metrics ORDER BY aeId, year, month"
);

const metricsByAe = {};
metrics.forEach(m => {
  if (!metricsByAe[m.aeId]) metricsByAe[m.aeId] = [];
  metricsByAe[m.aeId].push(m);
});

console.log("TIER AUDIT REPORT\n");
console.log("=".repeat(120));

let mismatches = [];
let currentAe = null;

for (const deal of deals) {
  if (currentAe !== deal.name) {
    if (currentAe !== null) console.log("");
    currentAe = deal.name;
    console.log(`\n${deal.name}:`);
  }
  
  const dealDate = new Date(deal.startYear, deal.startMonth - 1, 1);
  const joinDate = new Date(deal.joinDate);
  const isNewJoiner = (dealDate - joinDate) < (6 * 30 * 24 * 60 * 60 * 1000); // 6 months
  
  // Get previous 3 months metrics
  const aeMetrics = metricsByAe[deal.aeId] || [];
  const prevMetrics = aeMetrics.filter(m => {
    const mDate = new Date(m.year, m.month - 1, 1);
    return mDate < dealDate;
  }).slice(-3);
  
  let expectedTier = 'bronze';
  let avgArr = 0, avgDemos = 0, avgDials = 0;
  
  if (prevMetrics.length > 0) {
    avgArr = prevMetrics.reduce((sum, m) => sum + parseFloat(m.arrUsd), 0) / prevMetrics.length;
    avgDemos = prevMetrics.reduce((sum, m) => sum + m.demosTotal, 0) / prevMetrics.length;
    avgDials = prevMetrics.reduce((sum, m) => sum + m.dialsTotal, 0) / (prevMetrics.length * 4.33); // per week
    expectedTier = calculateTier(avgArr, avgDemos, avgDials, isNewJoiner);
  }
  
  const match = expectedTier === deal.tierAtStart ? '✓' : '✗ MISMATCH';
  console.log(`  ${deal.startYear}-${String(deal.startMonth).padStart(2, '0')}: ${deal.customerName.padEnd(35)} | Expected: ${expectedTier.toUpperCase().padEnd(6)} | Actual: ${deal.tierAtStart.toUpperCase().padEnd(6)} | ${match}`);
  
  if (expectedTier !== deal.tierAtStart) {
    mismatches.push({
      id: deal.id,
      name: deal.customerName,
      ae: deal.name,
      date: `${deal.startYear}-${String(deal.startMonth).padStart(2, '0')}`,
      expected: expectedTier,
      actual: deal.tierAtStart,
      metrics: { avgArr: avgArr.toFixed(0), avgDemos: avgDemos.toFixed(1), avgDials: avgDials.toFixed(0) }
    });
  }
}

console.log("\n" + "=".repeat(120));
console.log(`\nTOTAL MISMATCHES: ${mismatches.length}`);

if (mismatches.length > 0) {
  console.log("\nMISMATCH DETAILS:");
  mismatches.forEach(m => {
    console.log(`\n  ID ${m.id}: ${m.name} (${m.ae})`);
    console.log(`    Date: ${m.date}`);
    console.log(`    Expected: ${m.expected.toUpperCase()}, Actual: ${m.actual.toUpperCase()}`);
    console.log(`    Metrics: ARR=$${m.metrics.avgArr}, Demos=${m.metrics.avgDemos}/wk, Dials=${m.metrics.avgDials}/wk`);
  });
}

await connection.end();
