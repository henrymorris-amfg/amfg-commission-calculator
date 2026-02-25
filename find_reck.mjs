import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  'SELECT customerName, contractType, COUNT(*) as cnt FROM deals GROUP BY customerName, contractType HAVING customerName LIKE "%Reck%"'
);
console.log('Results:', rows);
conn.end();
