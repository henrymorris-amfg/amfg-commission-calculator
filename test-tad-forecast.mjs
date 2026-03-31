import mysql from 'mysql2/promise';

const pool = mysql.createPool(process.env.DATABASE_URL);

async function main() {
  const conn = await pool.getConnection();
  
  // Get Tad's profile and metrics
  const [tad] = await conn.execute('SELECT id, name, joinDate FROM ae_profiles WHERE name = "Tad Tamulevicius"');
  console.log('Tad Profile:', tad[0]);
  
  // Get Tad's monthly metrics
  const [metrics] = await conn.execute(
    'SELECT year, month, demosTotal, dialsTotal, arrUsd FROM monthly_metrics WHERE aeId = ? ORDER BY year DESC, month DESC LIMIT 12',
    [tad[0].id]
  );
  console.log('\nTad Monthly Metrics (last 12 months):');
  metrics.forEach(m => {
    console.log(`  ${m.year}-${String(m.month).padStart(2, '0')}: ARR=$${m.arrUsd}, Demos=${m.demosTotal}, Dials=${m.dialsTotal}`);
  });
  
  conn.release();
  pool.end();
}

main().catch(console.error);
