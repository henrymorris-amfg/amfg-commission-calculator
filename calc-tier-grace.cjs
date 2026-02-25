const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.local' });

const url = process.env.DATABASE_URL;

(async () => {
  const conn = await mysql.createConnection(url);
  
  // Get Joe Payne's profile to find grace period end date
  const [aeRows] = await conn.query('SELECT id, joinDate FROM ae_profiles WHERE name = "Joe Payne"');
  const aeId = aeRows[0].id;
  const joinDate = new Date(aeRows[0].joinDate);
  
  console.log(`Joe Payne join date: ${joinDate.toISOString().split('T')[0]}`);
  
  // Grace period is 6 months, so it ends 6 months after join date
  const gracePeriodEnd = new Date(joinDate);
  gracePeriodEnd.setMonth(gracePeriodEnd.getMonth() + 6);
  console.log(`Grace period ends: ${gracePeriodEnd.toISOString().split('T')[0]}`);
  
  // Get all metrics
  const [metrics] = await conn.query(`
    SELECT year, month, arrUsd, demosTotal, dialsTotal FROM monthly_metrics 
    WHERE aeId = ? 
    ORDER BY year DESC, month DESC
    LIMIT 12
  `, [aeId]);
  
  console.log('\nMetrics with grace period applied:');
  const metricsWithGrace = metrics.map(m => {
    const monthDate = new Date(m.year, m.month - 1, 1);
    const isInGracePeriod = monthDate < gracePeriodEnd;
    const arrUsd = isInGracePeriod ? 25000 : parseFloat(m.arrUsd);
    
    console.log(`  ${m.year}-${String(m.month).padStart(2, '0')}: ${isInGracePeriod ? '$25,000 (grace)' : '$' + m.arrUsd + ' (actual)'}`);
    
    return {
      year: m.year,
      month: m.month,
      arrUsd: arrUsd,
      demosTotal: m.demosTotal,
      dialsTotal: m.dialsTotal
    };
  });
  
  // Calculate January tier (Oct-Nov-Dec 2025)
  console.log('\n--- January 2026 Tier (based on Oct-Nov-Dec 2025) ---');
  const janMetrics = metricsWithGrace.filter(m => 
    (m.year === 2025 && m.month >= 10) || (m.year === 2025 && m.month <= 12)
  ).slice(0, 3);
  
  janMetrics.forEach(m => {
    console.log(`  ${m.year}-${m.month}: ARR=$${m.arrUsd}`);
  });
  
  const janAvgArr = janMetrics.reduce((sum, m) => sum + m.arrUsd, 0) / janMetrics.length;
  const janAvgDemos = janMetrics.reduce((sum, m) => sum + m.demosTotal, 0) / janMetrics.length;
  const janAvgDials = janMetrics.reduce((sum, m) => sum + m.dialsTotal, 0) / janMetrics.length;
  
  console.log(`\nAverages:`);
  console.log(`  ARR: $${janAvgArr.toFixed(2)}`);
  console.log(`  Demos/week: ${(janAvgDemos / 4.3).toFixed(2)}`);
  console.log(`  Dials/week: ${(janAvgDials / 4.3).toFixed(2)}`);
  
  // Determine tier
  let janTier = 'bronze';
  if (janAvgArr >= 25000 && (janAvgDemos / 4.3) >= 3 && (janAvgDials / 4.3) >= 100) {
    janTier = 'gold';
  } else if (janAvgArr >= 20000 && (janAvgDemos / 4.3) >= 3 && (janAvgDials / 4.3) >= 100) {
    janTier = 'silver';
  }
  
  console.log(`\nTier: ${janTier.toUpperCase()}`);
  
  // Calculate February tier (Nov-Dec-Jan 2026)
  console.log('\n--- February 2026 Tier (based on Nov-Dec-Jan 2026) ---');
  const febMetrics = metricsWithGrace.filter(m => 
    (m.year === 2025 && m.month >= 11) || (m.year === 2026 && m.month <= 1)
  ).slice(0, 3);
  
  febMetrics.forEach(m => {
    console.log(`  ${m.year}-${m.month}: ARR=$${m.arrUsd}`);
  });
  
  const febAvgArr = febMetrics.reduce((sum, m) => sum + m.arrUsd, 0) / febMetrics.length;
  const febAvgDemos = febMetrics.reduce((sum, m) => sum + m.demosTotal, 0) / febMetrics.length;
  const febAvgDials = febMetrics.reduce((sum, m) => sum + m.dialsTotal, 0) / febMetrics.length;
  
  console.log(`\nAverages:`);
  console.log(`  ARR: $${febAvgArr.toFixed(2)}`);
  console.log(`  Demos/week: ${(febAvgDemos / 4.3).toFixed(2)}`);
  console.log(`  Dials/week: ${(febAvgDials / 4.3).toFixed(2)}`);
  
  let febTier = 'bronze';
  if (febAvgArr >= 25000 && (febAvgDemos / 4.3) >= 3 && (febAvgDials / 4.3) >= 100) {
    febTier = 'gold';
  } else if (febAvgArr >= 20000 && (febAvgDemos / 4.3) >= 3 && (febAvgDials / 4.3) >= 100) {
    febTier = 'silver';
  }
  
  console.log(`\nTier: ${febTier.toUpperCase()}`);
  
  await conn.end();
})();
