import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [deals] = await conn.execute(
  'SELECT id, customerName, contractType FROM deals WHERE customerName LIKE ? LIMIT 1',
  ['%Apollo%']
);

if (deals.length === 0) {
  console.log('No Apollo deals found');
  conn.end();
  process.exit(0);
}

const dealId = deals[0].id;
console.log(`Apollo deal ID: ${dealId}, contractType: ${deals[0].contractType}`);

const [payouts] = await conn.execute(
  'SELECT payoutNumber, grossCommissionUsd, netCommissionGbp, fxRateUsed FROM commission_payouts WHERE dealId = ? ORDER BY payoutNumber',
  [dealId]
);

console.log('Payouts:', payouts);
conn.end();
