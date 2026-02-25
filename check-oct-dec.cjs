const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.local' });

const url = process.env.DATABASE_URL;

(async () => {
  const conn = await mysql.createConnection(url);
  
  // Get Joe Payne's deals
  const [deals] = await conn.query(`
    SELECT customerName, arrUsd, startYear, startMonth, startDay FROM deals 
    WHERE aeId = (SELECT id FROM ae_profiles WHERE name = 'Joe Payne')
    ORDER BY startYear, startMonth
  `);
  
  // Group by month
  const byMonth = {};
  deals.forEach(d => {
    const key = `${d.startYear}-${String(d.startMonth).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(d);
  });
  
  console.log('Joe Payne deals by month:');
  Object.entries(byMonth).sort().forEach(([month, monthDeals]) => {
    const total = monthDeals.reduce((sum, d) => sum + parseFloat(d.arrUsd), 0);
    console.log(`  ${month}: $${total.toFixed(2)}`);
  });
  
  // Check current monthly_metrics
  const [metrics] = await conn.query(`
    SELECT year, month, arrUsd FROM monthly_metrics 
    WHERE aeId = (SELECT id FROM ae_profiles WHERE name = 'Joe Payne')
    AND year = 2025 AND month IN (10, 11, 12)
    ORDER BY month
  `);
  
  console.log('\nCurrent monthly_metrics:');
  metrics.forEach(m => {
    console.log(`  2025-${String(m.month).padStart(2, '0')}: $${m.arrUsd}`);
  });
  
  await conn.end();
})();
