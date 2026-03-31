import mysql from 'mysql2/promise';

const pool = mysql.createPool(process.env.DATABASE_URL);

async function main() {
  const conn = await pool.getConnection();
  
  // Check Tad's profile
  const [tad] = await conn.execute('SELECT id, name FROM ae_profiles WHERE name = "Tad Tamulevicius"');
  console.log('Tad Profile:', tad[0]);
  
  // Check if he has any demo activities
  const [demoCount] = await conn.execute(
    'SELECT COUNT(*) as count FROM pipedrive_demo_activities WHERE aeId = ?',
    [tad[0].id]
  );
  console.log('Total Demos for Tad:', demoCount[0]);
  
  // Check March demos specifically
  const [marchDemos] = await conn.execute(
    'SELECT COUNT(*) as count FROM pipedrive_demo_activities WHERE aeId = ? AND year = 2026 AND month = 3',
    [tad[0].id]
  );
  console.log('March 2026 Demos for Tad:', marchDemos[0]);
  
  // Check the monthly metrics
  const [metrics] = await conn.execute(
    'SELECT year, month, demosTotal FROM monthly_metrics WHERE aeId = ? ORDER BY year DESC, month DESC LIMIT 5',
    [tad[0].id]
  );
  console.log('Tad Monthly Metrics (last 5):', metrics);
  
  conn.release();
  pool.end();
}

main().catch(console.error);
