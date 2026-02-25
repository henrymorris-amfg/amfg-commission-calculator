import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get Joe Payne's ID
const [aeRows] = await conn.query('SELECT id FROM ae_profiles WHERE name = ?', ['Joe Payne']);
const joeId = aeRows[0]?.id;

// Get Joe's monthly_metrics for Jan-Mar 2026
const [metrics] = await conn.query(
  'SELECT year, month, arrUsd FROM monthly_metrics WHERE aeId = ? AND year = 2026 AND month IN (1, 2, 3) ORDER BY month',
  [joeId]
);

console.log('Joe Payne Monthly Metrics (Jan-Mar 2026):');
for (const m of metrics) {
  const monthName = new Date(m.year, m.month - 1).toLocaleString('default', { month: 'short' });
  console.log(`${monthName} 2026: ARR $${m.arrUsd}`);
}

// Also check deals to see what's assigned to each month
const [deals] = await conn.query(
  `SELECT customerName, startMonth, arrUsd FROM deals 
   WHERE aeId = ? AND startYear = 2026 AND startMonth IN (1, 2, 3)
   ORDER BY startMonth, customerName`,
  [joeId]
);

console.log('\nDeals by start month:');
for (const d of deals) {
  const monthName = new Date(2026, d.startMonth - 1).toLocaleString('default', { month: 'short' });
  console.log(`${monthName}: ${d.customerName} - $${d.arrUsd}`);
}

await conn.end();
