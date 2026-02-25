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
  
  // Get all AEs
  const [allAes] = await conn.query('SELECT id, name, joinDate FROM ae_profiles ORDER BY name');
  
  console.log(`Recalculating tiers for ${allAes.length} AEs...\n`);
  
  let totalUpdated = 0;
  
  for (const ae of allAes) {
    const aeId = ae.id;
    const joinDate = new Date(ae.joinDate);
    
    // Grace period is 6 months
    const gracePeriodEnd = new Date(joinDate);
    gracePeriodEnd.setMonth(gracePeriodEnd.getMonth() + 6);
    
    // Get all metrics for this AE
    const [allMetrics] = await conn.query(`
      SELECT year, month, arrUsd, demosTotal, dialsTotal FROM monthly_metrics 
      WHERE aeId = ? 
      ORDER BY year, month
    `, [aeId]);
    
    // Get all deals for this AE
    const [deals] = await conn.query(`
      SELECT id, customerName, startYear, startMonth FROM deals 
      WHERE aeId = ?
      ORDER BY startYear, startMonth
    `, [aeId]);
    
    let aeUpdated = 0;
    
    for (const deal of deals) {
      const dealDate = new Date(deal.startYear, deal.startMonth - 1, 1);
      
      // Get 3 months BEFORE the deal start date
      const last3 = allMetrics.filter(m => {
        const mDate = new Date(m.year, m.month - 1, 1);
        return mDate < dealDate && mDate >= joinDate;
      }).slice(0, 3);
      
      let tier = 'bronze';
      
      if (last3.length > 0) {
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
        
        tier = calculateTier(avgArr, avgDemos, avgDials);
      }
      
      // Update deal tier
      await conn.query('UPDATE deals SET tierAtStart = ? WHERE id = ?', [tier, deal.id]);
      aeUpdated++;
    }
    
    if (aeUpdated > 0) {
      console.log(`${ae.name}: ${aeUpdated} deals updated`);
      totalUpdated += aeUpdated;
    }
  }
  
  console.log(`\n✓ Total deals updated: ${totalUpdated}`);
  
  await conn.end();
})();
