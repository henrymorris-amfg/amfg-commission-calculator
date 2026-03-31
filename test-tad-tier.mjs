import mysql from 'mysql2/promise';

const pool = mysql.createPool(process.env.DATABASE_URL);

async function main() {
  const conn = await pool.getConnection();
  
  // Get Tad's profile
  const [tadRows] = await conn.execute('SELECT id, name, joinDate, isTeamLeader FROM ae_profiles WHERE id = 60001');
  const tad = tadRows[0];
  console.log('Tad Profile:', tad);
  
  // Get Tad's last 3 months of metrics
  const [metrics] = await conn.execute(
    'SELECT year, month, arrUsd, demosTotal, dialsTotal FROM monthly_metrics WHERE aeId = 60001 ORDER BY year DESC, month DESC LIMIT 3'
  );
  console.log('Tad Metrics (last 3):', metrics);
  
  // Calculate weeks since join
  const joinDate = new Date(tad.joinDate);
  const now = new Date('2026-03-31');
  const daysWorked = (now - joinDate) / (1000 * 60 * 60 * 24);
  const weeksWorked = daysWorked / 7;
  
  console.log('\nJoin Date:', joinDate.toISOString());
  console.log('Days Worked:', daysWorked);
  console.log('Weeks Worked:', weeksWorked.toFixed(2));
  
  // Calculate demos/week and dials/week
  const demosPerWeek = metrics[0].demosTotal / weeksWorked;
  const dialsPerWeek = metrics[0].dialsTotal / weeksWorked;
  
  console.log('\nDemos/week:', demosPerWeek.toFixed(2));
  console.log('Dials/week:', dialsPerWeek.toFixed(2));
  
  console.log('\nGold tier requires:');
  console.log('  ARR: $25k (waived for new joiners)');
  console.log('  Demos/week: 4+');
  console.log('  Dials/week: 100+');
  
  conn.release();
  pool.end();
}

main().catch(console.error);
