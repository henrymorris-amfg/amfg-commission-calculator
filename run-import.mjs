import mysql from 'mysql2/promise';
import { calculateCommission, calculateTier, computeRollingAverages, computeAvgRetention, isNewJoiner, addMonths } from './shared/commission.js';
import { pipedriveGet } from './server/pipedriveSync.ts';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  // Get all AEs
  const [aes] = await conn.query('SELECT * FROM ae_profiles WHERE isActive = 1');
  console.log(`Found ${aes.length} active AEs`);

  let totalImported = 0;
  let errors = [];

  for (const ae of aes) {
    try {
      console.log(`\nProcessing ${ae.name}...`);
      
      // Get all won deals from Pipedrive for this AE
      const deals = await pipedriveGet(`persons/${ae.pipedrivePersonId}/deals?status=won&limit=500`);
      
      if (!deals.data || deals.data.length === 0) {
        console.log(`  No deals found`);
        continue;
      }

      console.log(`  Found ${deals.data.length} won deals`);
      
      for (const pdDeal of deals.data) {
        // Extract deal details
        const title = pdDeal.title;
        const arrUsd = pdDeal.value || 0;
        const wonDate = pdDeal.won_time;
        const startDate = pdDeal['8a8c3b2c5e8f9a1b2c3d4e5f6a7b8c9d'] || wonDate; // Contract start date or won date
        
        // Parse start date
        const startDateObj = new Date(startDate);
        const startMonth = startDateObj.getMonth() + 1;
        const startYear = startDateObj.getFullYear();
        
        console.log(`    ${title}: $${arrUsd} ARR, starts ${startMonth}/${startYear}`);
        
        // Get metrics for tier calculation
        const targetDate = new Date(startYear, startMonth - 1, 1);
        const [metrics] = await conn.query(
          'SELECT * FROM monthly_metrics WHERE aeId = ? AND year * 100 + month < ? ORDER BY year DESC, month DESC LIMIT 6',
          [ae.id, startYear * 100 + startMonth]
        );
        
        if (metrics.length < 3) {
          console.log(`    Skipping: not enough historical metrics`);
          continue;
        }
        
        // Calculate tier
        const last3 = metrics.slice(0, 3).map(m => ({
          arrUsd: Number(m.arrUsd),
          demosTotal: m.demosTotal,
          dialsTotal: m.dialsTotal,
          retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
        }));
        
        const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3);
        const avgRetentionRate = computeAvgRetention(metrics.slice(0, 6));
        const newJoiner = isNewJoiner(ae.joinDate, targetDate);
        
        const tierResult = calculateTier({
          avgArrUsd,
          avgDemosPw,
          avgDialsPw,
          avgRetentionRate,
          isNewJoiner: newJoiner,
          isTeamLeader: ae.isTeamLeader,
        });
        
        console.log(`    Tier: ${tierResult.tier}`);
        
        // Calculate commission
        const commResult = calculateCommission({
          contractType: 'annual',
          arrUsd,
          tier: tierResult.tier,
          onboardingFeePaid: false,
          isReferral: false,
          fxRateUsdToGbp: 0.7410,
        });
        
        // Insert deal
        const [dealResult] = await conn.query(
          `INSERT INTO deals (aeId, customerName, arrUsd, tierAtStart, startMonth, startYear, contractType, totalCommissionUsd, totalCommissionGbp, pipedriveWonTime, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ae.id, title, arrUsd, tierResult.tier, startMonth, startYear, 'annual', commResult.totalCommissionUsd, commResult.totalCommissionGbp, wonDate, 'Re-imported from Pipedrive']
        );
        
        const dealId = dealResult.insertId;
        
        // Insert payouts
        for (const payout of commResult.payoutSchedule) {
          const payoutDate = addMonths(startYear, startMonth, payout.payoutNumber - 1);
          await conn.query(
            `INSERT INTO commission_payouts (dealId, payoutNumber, payoutMonth, payoutYear, grossCommissionUsd, netCommissionGbp)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [dealId, payout.payoutNumber, payoutDate.month, payoutDate.year, payout.grossCommissionUsd, payout.netCommissionGbp]
          );
        }
        
        totalImported++;
      }
    } catch (err) {
      errors.push(`${ae.name}: ${err.message}`);
    }
  }

  console.log(`\n✓ Imported ${totalImported} deals`);
  if (errors.length > 0) {
    console.log(`✗ Errors: ${errors.join(', ')}`);
  }
} catch (err) {
  console.error('Fatal error:', err);
} finally {
  await conn.end();
}
