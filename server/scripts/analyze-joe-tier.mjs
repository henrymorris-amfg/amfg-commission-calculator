#!/usr/bin/env node
/**
 * Analyze Joe Payne's Tier for Jan/Feb
 * Excludes the $25k per month grace period to see what tier he would be in
 * Based on Oct ~12k (Lowrance) and Nov ~23k (Technimetals)
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

async function analyzeJoeTier() {
  const conn = await pool.getConnection();
  
  try {
    console.log('\n=== JOE PAYNE TIER ANALYSIS (Jan/Feb) ===\n');

    // Get Joe Payne's profile
    const [joeProfile] = await conn.query(`
      SELECT id, name, joinDate FROM ae_profiles WHERE name LIKE '%Joe%'
    `);

    if (joeProfile.length === 0) {
      console.log('Joe Payne not found');
      return;
    }

    const joeId = joeProfile[0].id;
    console.log(`Joe Payne (AE ID: ${joeId})`);
    console.log(`Join Date: ${joeProfile[0].joinDate}\n`);

    // Get Oct, Nov, Dec, Jan metrics
    const [metrics] = await conn.query(`
      SELECT 
        month,
        year,
        arrUsd,
        demosTotal,
        dialsTotal,
        retentionRate
      FROM monthly_metrics
      WHERE aeId = ? AND year IN (2025, 2026)
      ORDER BY year, month
    `, [joeId]);

    console.log('HISTORICAL METRICS:');
    console.log('Month\t\tARR (USD)\tDemos\tDials\tRetention');
    console.log('─'.repeat(60));

    const metricsMap = new Map();
    metrics.forEach(m => {
      const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m.month - 1];
      console.log(`${monthName} ${m.year}\t\t$${m.arrUsd?.toFixed(0) || 0}\t\t${m.demosTotal || 0}\t${m.dialsTotal || 0}\t${m.retentionRate || 0}%`);
      metricsMap.set(`${m.year}-${String(m.month).padStart(2, '0')}`, m);
    });

    console.log('\n' + '─'.repeat(60));
    console.log('TIER CALCULATION FOR JANUARY 2026:');
    console.log('─'.repeat(60));

    // For January 2026, use Nov 2025, Dec 2025, Jan 2026
    const nov2025 = metricsMap.get('2025-11');
    const dec2025 = metricsMap.get('2025-12');
    const jan2026 = metricsMap.get('2026-01');

    console.log('\nThree-month rolling average (Nov 2025 - Jan 2026):');
    console.log(`  Nov 2025: $${nov2025?.arrUsd || 0} ARR, ${nov2025?.demosTotal || 0} demos, ${nov2025?.dialsTotal || 0} dials`);
    console.log(`  Dec 2025: $${dec2025?.arrUsd || 0} ARR, ${dec2025?.demosTotal || 0} demos, ${dec2025?.dialsTotal || 0} dials`);
    console.log(`  Jan 2026: $${jan2026?.arrUsd || 0} ARR, ${jan2026?.demosTotal || 0} demos, ${jan2026?.dialsTotal || 0} dials`);

    const avgArr = ((nov2025?.arrUsd || 0) + (dec2025?.arrUsd || 0) + (jan2026?.arrUsd || 0)) / 3;
    const avgDemos = ((nov2025?.demosTotal || 0) + (dec2025?.demosTotal || 0) + (jan2026?.demosTotal || 0)) / 3;
    const avgDials = ((nov2025?.dialsTotal || 0) + (dec2025?.dialsTotal || 0) + (jan2026?.dialsTotal || 0)) / 3;

    console.log(`\nAverages:`);
    console.log(`  ARR: $${avgArr.toFixed(0)}`);
    console.log(`  Demos/week: ${(avgDemos / 4).toFixed(1)}`);
    console.log(`  Dials/week: ${(avgDials / 4).toFixed(0)}`);

    console.log('\n' + '─'.repeat(60));
    console.log('TIER CALCULATION EXCLUDING $25K GRACE PERIOD:');
    console.log('─'.repeat(60));

    // Subtract $25k from each month
    const graceAdjustment = 25000;
    const nov2025Adj = Math.max(0, (nov2025?.arrUsd || 0) - graceAdjustment);
    const dec2025Adj = Math.max(0, (dec2025?.arrUsd || 0) - graceAdjustment);
    const jan2026Adj = Math.max(0, (jan2026?.arrUsd || 0) - graceAdjustment);

    const avgArrAdj = (nov2025Adj + dec2025Adj + jan2026Adj) / 3;

    console.log('\nAfter subtracting $25k/month grace period:');
    console.log(`  Nov 2025: $${nov2025Adj.toFixed(0)} (was $${nov2025?.arrUsd || 0})`);
    console.log(`  Dec 2025: $${dec2025Adj.toFixed(0)} (was $${dec2025?.arrUsd || 0})`);
    console.log(`  Jan 2026: $${jan2026Adj.toFixed(0)} (was $${jan2026?.arrUsd || 0})`);
    console.log(`\nAdjusted Average ARR: $${avgArrAdj.toFixed(0)}`);

    // Tier thresholds
    const bronzeThreshold = 0;
    const silverThreshold = 15000;
    const goldThreshold = 25000;

    let tier = 'Bronze';
    if (avgArrAdj >= goldThreshold) {
      tier = 'Gold';
    } else if (avgArrAdj >= silverThreshold) {
      tier = 'Silver';
    }

    console.log(`\nTier (ARR only): ${tier}`);
    console.log(`  Bronze: $0 - $14,999`);
    console.log(`  Silver: $15,000 - $24,999`);
    console.log(`  Gold: $25,000+`);

    console.log('\n' + '─'.repeat(60));
    console.log('FEBRUARY 2026 TIER CALCULATION:');
    console.log('─'.repeat(60));

    // For February 2026, use Dec 2025, Jan 2026, Feb 2026
    const feb2026 = metricsMap.get('2026-02');

    console.log('\nThree-month rolling average (Dec 2025 - Feb 2026):');
    console.log(`  Dec 2025: $${dec2025?.arrUsd || 0} ARR, ${dec2025?.demosTotal || 0} demos, ${dec2025?.dialsTotal || 0} dials`);
    console.log(`  Jan 2026: $${jan2026?.arrUsd || 0} ARR, ${jan2026?.demosTotal || 0} demos, ${jan2026?.dialsTotal || 0} dials`);
    console.log(`  Feb 2026: $${feb2026?.arrUsd || 0} ARR, ${feb2026?.demosTotal || 0} demos, ${feb2026?.dialsTotal || 0} dials`);

    const avgArrFeb = ((dec2025?.arrUsd || 0) + (jan2026?.arrUsd || 0) + (feb2026?.arrUsd || 0)) / 3;
    const avgDemosFeb = ((dec2025?.demosTotal || 0) + (jan2026?.demosTotal || 0) + (feb2026?.demosTotal || 0)) / 3;
    const avgDialsFeb = ((dec2025?.dialsTotal || 0) + (jan2026?.dialsTotal || 0) + (feb2026?.dialsTotal || 0)) / 3;

    console.log(`\nAverages:`);
    console.log(`  ARR: $${avgArrFeb.toFixed(0)}`);
    console.log(`  Demos/week: ${(avgDemosFeb / 4).toFixed(1)}`);
    console.log(`  Dials/week: ${(avgDialsFeb / 4).toFixed(0)}`);

    console.log('\n' + '─'.repeat(60));
    console.log('FEBRUARY TIER EXCLUDING $25K GRACE PERIOD:');
    console.log('─'.repeat(60));

    const dec2025AdjFeb = Math.max(0, (dec2025?.arrUsd || 0) - graceAdjustment);
    const jan2026AdjFeb = Math.max(0, (jan2026?.arrUsd || 0) - graceAdjustment);
    const feb2026AdjFeb = Math.max(0, (feb2026?.arrUsd || 0) - graceAdjustment);

    const avgArrAdjFeb = (dec2025AdjFeb + jan2026AdjFeb + feb2026AdjFeb) / 3;

    console.log('\nAfter subtracting $25k/month grace period:');
    console.log(`  Dec 2025: $${dec2025AdjFeb.toFixed(0)} (was $${dec2025?.arrUsd || 0})`);
    console.log(`  Jan 2026: $${jan2026AdjFeb.toFixed(0)} (was $${jan2026?.arrUsd || 0})`);
    console.log(`  Feb 2026: $${feb2026AdjFeb.toFixed(0)} (was $${feb2026?.arrUsd || 0})`);
    console.log(`\nAdjusted Average ARR: $${avgArrAdjFeb.toFixed(0)}`);

    let tierFeb = 'Bronze';
    if (avgArrAdjFeb >= goldThreshold) {
      tierFeb = 'Gold';
    } else if (avgArrAdjFeb >= silverThreshold) {
      tierFeb = 'Silver';
    }

    console.log(`\nTier (ARR only): ${tierFeb}`);

    console.log('\n' + '═'.repeat(60));
    console.log('SUMMARY:');
    console.log('═'.repeat(60));
    console.log(`January 2026 Tier (excluding $25k grace): ${tier}`);
    console.log(`February 2026 Tier (excluding $25k grace): ${tierFeb}`);
    console.log('\n');

  } catch (error) {
    console.error('Analysis failed:', error);
  } finally {
    await conn.release();
    await pool.end();
  }
}

analyzeJoeTier();
