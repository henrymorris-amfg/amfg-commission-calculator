import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  'SELECT id, customerName, contractType FROM deals WHERE customerName = ?',
  ['Recknagel']
);
console.log('Recknagel deals:', rows);
conn.end();
