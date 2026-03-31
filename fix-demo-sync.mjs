// The issue is that only 2 of Tad's 12 demos are in the database.
// Let's check if there's a database constraint or if the fetch is actually returning only 2.

import mysql from 'mysql2/promise';

const pool = mysql.createPool(process.env.DATABASE_URL);

async function main() {
  const conn = await pool.getConnection();
  
  // Check Tad's demo activities in database
  const [demoCount] = await conn.execute(
    'SELECT COUNT(*) as count FROM pipedrive_demo_activities WHERE aeId = 60001'
  );
  console.log('Tad demos in DB:', demoCount[0].count);
  
  // Check the schema of pipedrive_demo_activities
  const [schema] = await conn.execute('DESCRIBE pipedrive_demo_activities');
  console.log('\nTable schema:');
  schema.forEach(col => {
    console.log(`  ${col.Field}: ${col.Type} ${col.Key ? `(${col.Key})` : ''}`);
  });
  
  // Check for unique constraints
  const [constraints] = await conn.execute(
    "SELECT CONSTRAINT_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_NAME = 'pipedrive_demo_activities' AND TABLE_SCHEMA = DATABASE()"
  );
  console.log('\nConstraints:');
  constraints.forEach(c => {
    console.log(`  ${c.CONSTRAINT_NAME}: ${c.COLUMN_NAME}`);
  });
  
  conn.release();
  pool.end();
}

main().catch(console.error);
