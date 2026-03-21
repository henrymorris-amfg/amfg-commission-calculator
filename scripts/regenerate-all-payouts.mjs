#!/usr/bin/env node

/**
 * Regenerate all payouts for all AEs
 * This script:
 * 1. Deletes all existing payouts
 * 2. Regenerates payouts for each deal based on current commission structure
 */

import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  connectionLimit: 1,
  host: process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'localhost',
  user: process.env.DATABASE_URL?.split('://')[1]?.split(':')[0] || 'root',
  password: process.env.DATABASE_URL?.split(':')[2]?.split('@')[0] || '',
  database: process.env.DATABASE_URL?.split('/')[3]?.split('?')[0] || 'amfg',
});

async function regeneratePayouts() {
  const conn = await pool.getConnection();
  
  try {
    console.log('Starting payout regeneration...');
    
    // Get all deals
    const [deals] = await conn.query(`
      SELECT 
        d.id,
        d.aeId,
        d.customerName,
        d.contractType,
        d.startYear,
        d.startMonth,
        d.arrUsd,
        d.onboardingFeePaid,
        d.isReferral,
        d.tierAtStart,
        d.fxRateAtEntry,
        d.isChurned,
        d.churnMonth,
        d.churnYear,
        cs.monthlyPayoutMonths,
        cs.onboardingDeductionGbp,
        cs.onboardingArrReductionUsd
      FROM deals d
      LEFT JOIN commission_structures cs ON d.commissionStructureId = cs.id
      WHERE cs.isActive = 1 OR cs.id = (SELECT id FROM commission_structures WHERE isActive = 1 LIMIT 1)
      ORDER BY d.aeId, d.startYear, d.startMonth
    `);
    
    console.log(`Found ${deals.length} deals to process`);
    
    // Delete existing payouts
    await conn.query('DELETE FROM commission_payouts');
    console.log('Cleared existing payouts');
    
    let payoutCount = 0;
    
    // Regenerate payouts for each deal
    for (const deal of deals) {
      // Skip churned deals
      if (deal.isChurned) {
        console.log(`Skipping churned deal: ${deal.customerName}`);
        continue;
      }
      
      // Calculate number of payouts
      const numPayouts = deal.contractType === 'annual' ? 1 : (deal.monthlyPayoutMonths || 13);
      
      // Calculate commission per payout
      const arrUsd = parseFloat(deal.arrUsd);
      const rate = getTierRate(deal.tierAtStart);
      const effectiveArr = deal.onboardingFeePaid ? arrUsd : Math.max(0, arrUsd - (deal.onboardingArrReductionUsd || 5000));
      const payoutAmountUsd = deal.contractType === 'annual' 
        ? effectiveArr * rate 
        : (effectiveArr / 12) * rate;
      
      // Create payouts
      const payouts = [];
      for (let i = 1; i <= numPayouts; i++) {
        const payoutDate = addMonths(deal.startYear, deal.startMonth, i - 1);
        const referralDeduction = deal.isReferral ? payoutAmountUsd * 0.5 : 0;
        const onboardingDeduction = !deal.onboardingFeePaid && i === 1 ? (deal.onboardingDeductionGbp || 500) : 0;
        const netUsd = payoutAmountUsd - referralDeduction;
        const fxRate = parseFloat(deal.fxRateAtEntry) || 0.79;
        const netGbp = Math.max(0, netUsd * fxRate - onboardingDeduction);
        
        payouts.push([
          deal.id,
          deal.aeId,
          payoutDate.year,
          payoutDate.month,
          i,
          payoutAmountUsd.toFixed(2),
          referralDeduction.toFixed(2),
          onboardingDeduction.toFixed(2),
          netUsd.toFixed(2),
          fxRate.toFixed(6),
          netGbp.toFixed(2),
        ]);
      }
      
      // Batch insert payouts
      if (payouts.length > 0) {
        await conn.query(
          `INSERT INTO commission_payouts 
           (dealId, aeId, payoutYear, payoutMonth, payoutNumber, grossCommissionUsd, referralDeductionUsd, onboardingDeductionGbp, netCommissionUsd, fxRateUsed, netCommissionGbp)
           VALUES ?`,
          [payouts]
        );
        payoutCount += payouts.length;
        console.log(`Created ${payouts.length} payouts for ${deal.customerName}`);
      }
    }
    
    console.log(`\n✅ Regeneration complete! Created ${payoutCount} total payouts`);
    
  } catch (error) {
    console.error('Error regenerating payouts:', error);
    process.exit(1);
  } finally {
    await conn.release();
    await pool.end();
  }
}

function getTierRate(tier) {
  const rates = { bronze: 0.13, silver: 0.16, gold: 0.19 };
  return rates[tier] || 0.13;
}

function addMonths(year, month, monthsToAdd) {
  let newMonth = month + monthsToAdd;
  let newYear = year;
  
  while (newMonth > 12) {
    newMonth -= 12;
    newYear += 1;
  }
  
  return { year: newYear, month: newMonth };
}

regeneratePayouts().catch(console.error);
