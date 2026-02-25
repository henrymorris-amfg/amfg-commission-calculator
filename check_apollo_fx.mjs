import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [deals] = await conn.execute(
  'SELECT id, customerName, fxRateAtEntry, fxRateAtWon FROM deals WHERE customerName LIKE ?',
  ['%Apollo%']
);

console.log('Apollo deals:', deals);
conn.end();
