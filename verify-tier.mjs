import mysql from "mysql2/promise";
import { config } from "dotenv";

config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);

  try {
    // Get Joe Payne's ID
    const [aeRows] = await conn.query('SELECT id FROM ae_profiles WHERE name = "Joe Payne"');
    const aeId = aeRows[0].id;

    // Get Oct, Nov, Dec 2025 metrics
    const [metrics] = await conn.query(`
      SELECT year, month, arrUsd, demosTotal, dialsTotal FROM monthly_metrics 
      WHERE aeId = ? 
      ORDER BY year DESC, month DESC
      LIMIT 9
    `, [aeId]);

    console.log('Joe Payne metrics (last 9 months):');
    metrics.forEach(m => {
      console.log(`  ${m.year}-${String(m.month).padStart(2, '0')}: ARR=$${m.arrUsd}, Demos=${m.demosTotal}, Dials=${m.dialsTotal}`);
    });

    // Calculate January tier (based on Oct-Nov-Dec 2025)
    const janMetrics = metrics.filter(m => 
      (m.year === 2025 && m.month >= 10) || (m.year === 2025 && m.month <= 12)
    ).slice(0, 3);

    console.log('\nJanuary 2026 tier (based on Oct-Nov-Dec 2025):');
    janMetrics.forEach(m => {
      console.log(`  ${m.year}-${m.month}: ARR=$${m.arrUsd}`);
    });

    const avgArr = janMetrics.reduce((sum, m) => sum + parseFloat(m.arrUsd), 0) / janMetrics.length;
    const avgDemos = janMetrics.reduce((sum, m) => sum + m.demosTotal, 0) / janMetrics.length;
    const avgDials = janMetrics.reduce((sum, m) => sum + m.dialsTotal, 0) / janMetrics.length;

    console.log(`\nAverages:`);
    console.log(`  ARR: $${avgArr.toFixed(2)}`);
    console.log(`  Demos/week: ${(avgDemos / 4.3).toFixed(2)}`);
    console.log(`  Dials/week: ${(avgDials / 4.3).toFixed(2)}`);

    // Determine tier
    let tier = 'bronze';
    if (avgArr >= 25000 && (avgDemos / 4.3) >= 3 && (avgDials / 4.3) >= 100) {
      tier = 'gold';
    } else if (avgArr >= 20000 && (avgDemos / 4.3) >= 3 && (avgDials / 4.3) >= 100) {
      tier = 'silver';
    }

    console.log(`\nTier: ${tier.toUpperCase()}`);

    // Now check February (based on Nov-Dec-Jan 2026)
    console.log('\n---\n');
    console.log('February 2026 tier (based on Nov-Dec-Jan 2026):');
    
    const [allMetrics] = await conn.query(`
      SELECT year, month, arrUsd, demosTotal, dialsTotal FROM monthly_metrics 
      WHERE aeId = ? 
      AND ((year = 2025 AND month >= 11) OR (year = 2026 AND month <= 1))
      ORDER BY year DESC, month DESC
    `, [aeId]);

    allMetrics.slice(0, 3).forEach(m => {
      console.log(`  ${m.year}-${m.month}: ARR=$${m.arrUsd}`);
    });

    const febAvgArr = allMetrics.slice(0, 3).reduce((sum, m) => sum + parseFloat(m.arrUsd), 0) / 3;
    const febAvgDemos = allMetrics.slice(0, 3).reduce((sum, m) => sum + m.demosTotal, 0) / 3;
    const febAvgDials = allMetrics.slice(0, 3).reduce((sum, m) => sum + m.dialsTotal, 0) / 3;

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

  } finally {
    await conn.end();
  }
}

main().catch(console.error);
