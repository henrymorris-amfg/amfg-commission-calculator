import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get Joe Payne's ID
const [aeRows] = await conn.query('SELECT id FROM ae_profiles WHERE name = ?', ['Joe Payne']);
const joeId = aeRows[0]?.id;

// Get Joe's deals for Jan-Mar 2026
const [deals] = await conn.query(
  `SELECT id, customerName, contractType, startYear, startMonth, arrUsd, tierAtStart
   FROM deals 
   WHERE aeId = ? AND startYear = 2026 AND startMonth IN (1, 2, 3)
   ORDER BY startMonth, customerName`,
  [joeId]
);

console.log('Joe Payne Deals (Jan-Mar 2026):');
console.log('Month | Customer | Tier');
console.log('------|----------|------');

for (const d of deals) {
  const monthName = new Date(d.startYear, d.startMonth - 1).toLocaleString('default', { month: 'short' });
  console.log(`${monthName}   | ${d.customerName.padEnd(30)} | ${d.tierAtStart}`);
}

await conn.end();
