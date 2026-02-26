#!/usr/bin/env node
/**
 * Payout Audit Script
 * Identifies duplicates, mismatches, and data quality issues in commission_payouts table
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

async function auditPayouts() {
  const conn = await pool.getConnection();
  
  try {
    console.log('\n=== PAYOUT AUDIT REPORT ===\n');

    // 1. Check for duplicate payouts (same deal, month, year)
    console.log('1. CHECKING FOR DUPLICATES...');
    const [duplicates] = await conn.query(`
      SELECT 
        aeId, dealId, payoutMonth, payoutYear, 
        COUNT(*) as count,
        GROUP_CONCAT(id) as payout_ids
      FROM commission_payouts
      GROUP BY aeId, dealId, payoutMonth, payoutYear
      HAVING count > 1
      ORDER BY aeId, dealId, payoutYear, payoutMonth
    `);

    if (duplicates.length > 0) {
      console.log(`   ⚠️  Found ${duplicates.length} duplicate payout records:\n`);
      duplicates.forEach(dup => {
        console.log(`   AE ${dup.aeId}, Deal ${dup.dealId}, ${dup.payoutMonth}/${dup.payoutYear}: ${dup.count} records (IDs: ${dup.payout_ids})`);
      });
    } else {
      console.log('   ✓ No duplicates found\n');
    }

    // 2. Check for monthly/annual mismatches
    console.log('2. CHECKING FOR MONTHLY/ANNUAL MISMATCHES...');
    const [mismatches] = await conn.query(`
      SELECT 
        cp.id,
        cp.aeId,
        cp.dealId,
        d.customerName,
        d.contractType,
        cp.payoutMonth,
        cp.payoutYear,
        cp.payoutNumber,
        cp.totalPayouts,
        cp.netCommissionGbp,
        d.arrUsd,
        d.contractStartDate
      FROM commission_payouts cp
      LEFT JOIN deals d ON cp.dealId = d.id
      WHERE (d.contractType = 'annual' AND cp.totalPayouts > 1)
         OR (d.contractType = 'monthly' AND cp.totalPayouts = 1)
      ORDER BY cp.aeId, cp.dealId
    `);

    if (mismatches.length > 0) {
      console.log(`   ⚠️  Found ${mismatches.length} potential mismatches:\n`);
      mismatches.forEach(m => {
        console.log(`   Payout ${m.id}: ${m.customerName} (${m.contractType}) - Payout ${m.payoutNumber}/${m.totalPayouts}, £${m.netCommissionGbp}`);
      });
    } else {
      console.log('   ✓ No mismatches found\n');
    }

    // 3. Check for missing payouts (deals with no commission payouts)
    console.log('3. CHECKING FOR MISSING PAYOUTS...');
    const [missing] = await conn.query(`
      SELECT 
        d.id,
        d.aeId,
        d.customerName,
        d.contractType,
        d.contractStartDate,
        d.arrUsd,
        d.tierAtStart,
        COUNT(cp.id) as payout_count
      FROM deals d
      LEFT JOIN commission_payouts cp ON d.id = cp.dealId
      GROUP BY d.id
      HAVING payout_count = 0
      ORDER BY d.aeId, d.contractStartDate
    `);

    if (missing.length > 0) {
      console.log(`   ⚠️  Found ${missing.length} deals with NO commission payouts:\n`);
      missing.forEach(m => {
        console.log(`   Deal ${m.id}: ${m.customerName} (${m.contractType}, $${m.arrUsd}, ${m.tierAtStart}), Start: ${m.contractStartDate}`);
      });
    } else {
      console.log('   ✓ All deals have payouts\n');
    }

    // 4. Check for zero or negative commission amounts
    console.log('4. CHECKING FOR INVALID COMMISSION AMOUNTS...');
    const [invalid] = await conn.query(`
      SELECT 
        cp.id,
        cp.aeId,
        cp.dealId,
        d.customerName,
        cp.payoutMonth,
        cp.payoutYear,
        cp.netCommissionGbp,
        cp.netCommissionUsd
      FROM commission_payouts cp
      LEFT JOIN deals d ON cp.dealId = d.id
      WHERE cp.netCommissionGbp <= 0 OR cp.netCommissionUsd <= 0
      ORDER BY cp.aeId, cp.dealId
    `);

    if (invalid.length > 0) {
      console.log(`   ⚠️  Found ${invalid.length} payouts with invalid amounts:\n`);
      invalid.forEach(inv => {
        console.log(`   Payout ${inv.id}: ${inv.customerName}, £${inv.netCommissionGbp} / $${inv.netCommissionUsd}`);
      });
    } else {
      console.log('   ✓ All commission amounts are valid\n');
    }

    // 5. Summary statistics
    console.log('5. SUMMARY STATISTICS...');
    const [stats] = await conn.query(`
      SELECT 
        COUNT(DISTINCT dealId) as total_deals,
        COUNT(*) as total_payouts,
        COUNT(DISTINCT aeId) as total_aes,
        SUM(netCommissionGbp) as total_gbp,
        SUM(netCommissionUsd) as total_usd,
        MIN(payoutYear) as earliest_year,
        MAX(payoutYear) as latest_year,
        AVG(netCommissionGbp) as avg_payout_gbp
      FROM commission_payouts
    `);

    const stat = stats[0];
    console.log(`   Total Deals: ${stat.total_deals}`);
    console.log(`   Total Payouts: ${stat.total_payouts}`);
    console.log(`   Total AEs: ${stat.total_aes}`);
    console.log(`   Total Commission (GBP): £${stat.total_gbp?.toFixed(2) || 0}`);
    console.log(`   Total Commission (USD): $${stat.total_usd?.toFixed(2) || 0}`);
    console.log(`   Year Range: ${stat.earliest_year} - ${stat.latest_year}`);
    console.log(`   Average Payout (GBP): £${stat.avg_payout_gbp?.toFixed(2) || 0}\n`);

    // 6. Per-AE breakdown
    console.log('6. PER-AE BREAKDOWN...');
    const [perAe] = await conn.query(`
      SELECT 
        cp.aeId,
        ap.name,
        COUNT(DISTINCT cp.dealId) as deals,
        COUNT(*) as payouts,
        SUM(cp.netCommissionGbp) as total_gbp,
        MIN(cp.payoutYear) as earliest_year,
        MAX(cp.payoutYear) as latest_year
      FROM commission_payouts cp
      LEFT JOIN ae_profiles ap ON cp.aeId = ap.id
      GROUP BY cp.aeId
      ORDER BY total_gbp DESC
    `);

    perAe.forEach(ae => {
      console.log(`   AE ${ae.aeId} (${ae.name}): ${ae.deals} deals, ${ae.payouts} payouts, £${ae.total_gbp?.toFixed(2) || 0} (${ae.earliest_year}-${ae.latest_year})`);
    });

    console.log('\n=== END AUDIT REPORT ===\n');

  } catch (error) {
    console.error('Audit failed:', error);
  } finally {
    await conn.release();
    await pool.end();
  }
}

auditPayouts();
