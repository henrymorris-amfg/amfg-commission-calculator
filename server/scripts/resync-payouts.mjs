#!/usr/bin/env node
/**
 * Resync Payouts Script
 * Recalculates all commission payouts from scratch based on deals and commission structure
 * Deletes all existing payouts and regenerates them with correct calculations
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  connectionLimit: 1,
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'amfg_commission',
  uri: process.env.DATABASE_URL,
});

async function resyncPayouts() {
  const conn = await pool.getConnection();
  
  try {
    console.log('\n=== PAYOUT RESYNC STARTED ===\n');

    // Get all deals with their associated data
    const [deals] = await conn.query(`
      SELECT 
        d.id,
        d.aeId,
        d.customerName,
        d.contractType,
        d.contractStartDate,
        d.arrUsd,
        d.tierAtStart,
        d.isReferral,
        d.onboardingFeePaid,
        d.fxRateAtWon,
        cs.commissionPercentage,
        cs.referralPercentage,
        cs.onboardingFeeGbp
      FROM deals d
      LEFT JOIN commission_structures cs ON d.commissionStructureId = cs.id
      WHERE d.isActive = 1
      ORDER BY d.aeId, d.contractStartDate
    `);

    console.log(`Found ${deals.length} active deals to process\n`);

    // Delete all existing payouts
    const [deleteResult] = await conn.query('DELETE FROM commission_payouts');
    console.log(`Deleted ${deleteResult.affectedRows} existing payout records\n`);

    let totalPayoutsCreated = 0;
    let totalCommissionGbp = 0;
    let totalCommissionUsd = 0;

    // Process each deal
    for (const deal of deals) {
      try {
        const payouts = calculatePayouts(deal);
        
        if (payouts.length > 0) {
          // Insert payouts for this deal
          for (const payout of payouts) {
            await conn.query(`
              INSERT INTO commission_payouts (
                aeId, dealId, payoutMonth, payoutYear,
                netCommissionGbp, netCommissionUsd,
                payoutNumber, totalPayouts,
                fxRateUsed
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              deal.aeId,
              deal.id,
              payout.month,
              payout.year,
              payout.netGbp,
              payout.netUsd,
              payout.payoutNumber,
              payout.totalPayouts,
              payout.fxRate
            ]);

            totalPayoutsCreated++;
            totalCommissionGbp += payout.netGbp;
            totalCommissionUsd += payout.netUsd;
          }

          console.log(`✓ Deal ${deal.id} (${deal.customerName}): ${payouts.length} payouts created`);
        }
      } catch (error) {
        console.error(`✗ Deal ${deal.id} (${deal.customerName}): ${error.message}`);
      }
    }

    console.log(`\n=== RESYNC COMPLETE ===`);
    console.log(`Total Payouts Created: ${totalPayoutsCreated}`);
    console.log(`Total Commission (GBP): £${totalCommissionGbp.toFixed(2)}`);
    console.log(`Total Commission (USD): $${totalCommissionUsd.toFixed(2)}\n`);

  } catch (error) {
    console.error('Resync failed:', error);
  } finally {
    await conn.release();
    await pool.end();
  }
}

/**
 * Calculate payouts for a deal based on contract type and commission structure
 */
function calculatePayouts(deal) {
  const payouts = [];
  
  if (!deal.contractStartDate || !deal.arrUsd) {
    return payouts;
  }

  const startDate = new Date(deal.contractStartDate);
  const startMonth = startDate.getMonth() + 1;
  const startYear = startDate.getFullYear();

  const commissionRate = deal.tierAtStart === 'gold' ? 0.19 :
                        deal.tierAtStart === 'silver' ? 0.16 :
                        0.13; // bronze

  const baseCommissionUsd = deal.arrUsd * commissionRate;
  const fxRate = deal.fxRateAtWon || 0.738; // fallback to approximate rate
  let baseCommissionGbp = baseCommissionUsd * fxRate;

  // Apply referral discount
  if (deal.isReferral) {
    baseCommissionGbp *= 0.5;
  }

  // Apply onboarding fee deduction
  const onboardingDeductionGbp = deal.onboardingFeePaid ? (deal.onboardingFeeGbp || 500) : 0;

  if (deal.contractType === 'annual') {
    // Annual: single payout in start month, minus onboarding fee
    const netGbp = baseCommissionGbp - onboardingDeductionGbp;
    const netUsd = netGbp / fxRate;

    payouts.push({
      month: startMonth,
      year: startYear,
      netGbp: Math.max(0, netGbp), // Don't go negative
      netUsd: Math.max(0, netUsd),
      payoutNumber: 1,
      totalPayouts: 1,
      fxRate
    });
  } else if (deal.contractType === 'monthly') {
    // Monthly: 13 payouts (current month + 12 future months)
    const monthlyCommissionGbp = baseCommissionGbp / 12;
    const monthlyCommissionUsd = baseCommissionUsd / 12;

    for (let i = 0; i < 13; i++) {
      let payoutMonth = startMonth + i;
      let payoutYear = startYear;

      // Handle month/year overflow
      if (payoutMonth > 12) {
        payoutMonth -= 12;
        payoutYear += 1;
      }

      // First payout: deduct onboarding fee
      let netGbp = monthlyCommissionGbp;
      let netUsd = monthlyCommissionUsd;

      if (i === 0 && onboardingDeductionGbp > 0) {
        netGbp -= onboardingDeductionGbp;
        netUsd = netGbp / fxRate;
      }

      payouts.push({
        month: payoutMonth,
        year: payoutYear,
        netGbp: Math.max(0, netGbp),
        netUsd: Math.max(0, netUsd),
        payoutNumber: i + 1,
        totalPayouts: 13,
        fxRate
      });
    }
  }

  return payouts;
}

resyncPayouts();
