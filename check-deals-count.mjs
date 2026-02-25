import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [deals] = await conn.query('SELECT COUNT(*) as count FROM deals');
const [payouts] = await conn.query('SELECT COUNT(*) as count FROM commission_payouts');

console.log(`Deals: ${deals[0].count}`);
console.log(`Commission Payouts: ${payouts[0].count}`);

if (deals[0].count > 0) {
  const [sample] = await conn.query('SELECT id, customerName, aeId, startMonth, startYear FROM deals LIMIT 3');
  console.log('\nSample deals:');
  sample.forEach(d => console.log(`  ${d.customerName} (AE ${d.aeId}, ${d.startMonth}/${d.startYear})`));
}

await conn.end();
