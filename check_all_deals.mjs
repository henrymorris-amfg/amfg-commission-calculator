import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  'SELECT id, customerName, contractType FROM deals WHERE customerName LIKE ? LIMIT 5',
  ['%Reck%']
);
console.log('Deals with Reck:', rows);
conn.end();
