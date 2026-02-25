import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get Joe Payne's ID
const [aeRows] = await conn.query('SELECT id FROM ae_profiles WHERE name = ?', ['Joe Payne']);
const joeId = aeRows[0]?.id;

// Get Joe's metrics for Oct-Dec 2025
const [metrics] = await conn.query(
  'SELECT year, month, arrUsd, demosTotal, dialsTotal FROM monthly_metrics WHERE aeId = ? AND year = 2025 AND month IN (10, 11, 12) ORDER BY month',
  [joeId]
);

console.log('Joe Payne Metrics (Oct-Dec 2025):');
for (const m of metrics) {
  const monthName = new Date(m.year, m.month - 1).toLocaleString('default', { month: 'short' });
  console.log(`${monthName} 2025: ARR $${m.arrUsd}, Demos ${m.demosTotal}, Dials ${m.dialsTotal}`);
}

if (metrics.length < 3) {
  console.log('\nMissing months:', 3 - metrics.length);
}

await conn.end();
