import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  'SELECT DISTINCT customerName FROM deals ORDER BY customerName LIMIT 20'
);
console.log('Customer names:', rows.map(r => r.customerName));
conn.end();
