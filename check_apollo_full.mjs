import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [payouts] = await conn.execute(
  'SELECT * FROM commission_payouts WHERE dealId = 90065'
);

console.log('Full payout:', JSON.stringify(payouts[0], null, 2));
conn.end();
