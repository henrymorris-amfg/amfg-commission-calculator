import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  // Delete all commission payouts first (foreign key constraint)
  const [payoutResult] = await conn.query('DELETE FROM commission_payouts');
  console.log(`Deleted ${payoutResult.affectedRows} commission payouts`);
  
  // Delete all deals
  const [dealResult] = await conn.query('DELETE FROM deals');
  console.log(`Deleted ${dealResult.affectedRows} deals`);
  
  console.log('\nDatabase cleared. Ready for re-import.');
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await conn.end();
}
