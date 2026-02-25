import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get Joe Payne's ID
const [aeRows] = await conn.query('SELECT id FROM ae_profiles WHERE name = ?', ['Joe Payne']);
const joeId = aeRows[0]?.id;

if (!joeId) {
  console.log('Joe Payne not found');
  await conn.end();
  process.exit(1);
}

// Get metrics for Nov 2025 - Feb 2026
const [metrics] = await conn.query(
  'SELECT year, month, arrUsd, demosTotal, dialsTotal, retentionRate FROM monthly_metrics WHERE aeId = ? AND (year = 2025 AND month >= 11 OR year = 2026 AND month <= 2) ORDER BY year, month',
  [joeId]
);

console.log('Joe Payne Monthly Metrics (Nov 2025 - Feb 2026):');
console.log('Year | Month | ARR USD | Demos | Dials | Retention');
console.log('-----|-------|---------|-------|-------|----------');

for (const m of metrics) {
  const monthName = new Date(m.year, m.month - 1).toLocaleString('default', { month: 'short' });
  console.log(`${m.year} | ${monthName}   | $${String(m.arrUsd).padStart(7)} | ${String(m.demosTotal).padStart(5)} | ${String(m.dialsTotal).padStart(5)} | ${m.retentionRate || 'N/A'}`);
}

await conn.end();
