import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'amfg_commission',
  port: process.env.DB_PORT || 3306,
});

try {
  // Find C-Axis deal
  const [cAxisRows] = await conn.execute(
    'SELECT id, dealName, startMonth, startYear FROM deals WHERE dealName LIKE ?',
    ['%C-Axis%']
  );
  
  if (cAxisRows.length === 0) {
    console.log('C-Axis deal not found');
    process.exit(0);
  }
  
  const cAxis = cAxisRows[0];
  console.log(`Found C-Axis deal: ID=${cAxis.id}, Current month=${cAxis.startMonth}/${cAxis.startYear}`);
  
  if (cAxis.startMonth !== 2) {
    // Update to February (month 2)
    await conn.execute(
      'UPDATE deals SET startMonth = 2 WHERE id = ?',
      [cAxis.id]
    );
    console.log(`✓ Updated C-Axis start month from ${cAxis.startMonth} to 2 (February)`);
  } else {
    console.log('C-Axis is already in February');
  }
  
  // Also need to update monthly_metrics if C-Axis was incorrectly in January
  const [joeRows] = await conn.execute(
    'SELECT id FROM ae_profiles WHERE name = ?',
    ['Joe Payne']
  );
  
  if (joeRows.length > 0) {
    const joeId = joeRows[0].id;
    
    // Check January metrics
    const [janMetrics] = await conn.execute(
      'SELECT * FROM monthly_metrics WHERE aeId = ? AND year = 2026 AND month = 1',
      [joeId]
    );
    
    if (janMetrics.length > 0) {
      const jan = janMetrics[0];
      console.log(`\nJanuary 2026 metrics for Joe: ARR=$${jan.arrUsd}`);
      
      // If January still has C-Axis ARR, we need to recalculate
      // C-Axis is $14,321, so if January > $14,321, it includes C-Axis
      if (Number(jan.arrUsd) > 14321) {
        console.log('January includes C-Axis - needs recalculation');
      }
    }
  }
  
  conn.end();
  console.log('\n✓ Database updates complete');
  process.exit(0);
} catch (error) {
  console.error('Error:', error.message);
  conn.end();
  process.exit(1);
}
