const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.local' });

const url = process.env.DATABASE_URL;

function calculateTier(avgArr, avgDemos, avgDials) {
  if (avgArr >= 25000 && (avgDemos / 4.3) >= 3 && (avgDials / 4.3) >= 100) {
    return 'gold';
  } else if (avgArr >= 20000 && (avgDemos / 4.3) >= 3 && (avgDials / 4.3) >= 100) {
    return 'silver';
  }
  return 'bronze';
}

(async () => {
  const conn = await mysql.createConnection(url);
  
  // Get Joe Payne's profile
  const [aeRows] = await conn.query('SELECT id, joinDate FROM ae_profiles WHERE name = "Joe Payne"');
  const aeId = aeRows[0].id;
  const joinDate = new Date(aeRows[0].joinDate);
  
  // Grace period is 6 months
  const gracePeriodEnd = new Date(joinDate);
  gracePeriodEnd.setMonth(gracePeriodEnd.getMonth() + 6);
  
  console.log(`Joe Payne grace period ends: ${gracePeriodEnd.toISOString().split('T')[0]}\n`);
  
  // Get all metrics
  const [allMetrics] = await conn.query(`
    SELECT year, month, arrUsd, demosTotal, dialsTotal FROM monthly_metrics 
    WHERE aeId = ? 
    ORDER BY year, month
  `, [aeId]);
  
  // Get Joe's deals
  const [deals] = await conn.query(`
    SELECT id, customerName, startYear, startMonth FROM deals 
    WHERE aeId = ?
    ORDER BY startYear, startMonth
  `, [aeId]);
  
  console.log('Calculating tiers for each deal:\n');
  
  const tierUpdates = [];
  
  deals.forEach(deal => {
    const dealDate = new Date(deal.startYear, deal.startMonth - 1, 1);
    
    // Get 3 months BEFORE the deal start date
    const last3 = allMetrics.filter(m => {
      const mDate = new Date(m.year, m.month - 1, 1);
      return mDate < dealDate && mDate >= joinDate;
    }).slice(0, 3);
    
    if (last3.length === 0) {
      console.log(`  ${deal.startMonth}/${deal.startYear}: ${deal.customerName} - NO METRICS (new joiner)`);
      tierUpdates.push({ id: deal.id, tier: 'bronze' });
      return;
    }
    
    // Apply grace period logic
    const metricsWithGrace = last3.map(m => {
      const mDate = new Date(m.year, m.month - 1, 1);
      const isInGrace = mDate < gracePeriodEnd;
      return {
        ...m,
        arrUsd: isInGrace ? 25000 : parseFloat(m.arrUsd)
      };
    });
    
    const avgArr = metricsWithGrace.reduce((sum, m) => sum + m.arrUsd, 0) / metricsWithGrace.length;
    const avgDemos = metricsWithGrace.reduce((sum, m) => sum + m.demosTotal, 0) / metricsWithGrace.length;
    const avgDials = metricsWithGrace.reduce((sum, m) => sum + m.dialsTotal, 0) / metricsWithGrace.length;
    
    const tier = calculateTier(avgArr, avgDemos, avgDials);
    
    console.log(`  ${deal.startMonth}/${deal.startYear}: ${deal.customerName}`);
    console.log(`    Metrics: ARR=$${avgArr.toFixed(0)}, Demos=${(avgDemos/4.3).toFixed(1)}/wk, Dials=${(avgDials/4.3).toFixed(0)}/wk`);
    console.log(`    Tier: ${tier.toUpperCase()}`);
    
    tierUpdates.push({ id: deal.id, tier });
  });
  
  // Update all deals with correct tiers
  console.log('\nUpdating database...');
  for (const update of tierUpdates) {
    await conn.query('UPDATE deals SET tierAtStart = ? WHERE id = ?', [update.tier, update.id]);
  }
  
  console.log('✓ All tiers updated');
  
  await conn.end();
})();
