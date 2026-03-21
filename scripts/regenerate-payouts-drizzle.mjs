#!/usr/bin/env node

/**
 * Regenerate all payouts using Drizzle ORM
 */

import mysql from 'mysql2/promise';
const { createConnection } = mysql;
import { drizzle } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';

// Import schema
import * as schema from '../drizzle/schema.ts';

const { deals, commissionPayouts, commissionStructures } = schema.default || schema;

async function regeneratePayouts() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const connection = await createConnection(process.env.DATABASE_URL);
  const db = drizzle(connection, { schema, mode: 'default' });

  try {
    console.log('Starting payout regeneration...');

    // Get all non-churned deals with active commission structure
    const allDeals = await db.select().from(deals);
    const activeStructure = await db.select().from(commissionStructures).where(eq(commissionStructures.isActive, true)).limit(1);

    if (!activeStructure.length) {
      console.error('No active commission structure found');
      process.exit(1);
    }

    const structure = activeStructure[0];
    console.log(`Using commission structure: ${structure.name}`);

    // Delete all existing payouts
    await db.delete(commissionPayouts);
    console.log('Cleared existing payouts');

    let totalPayouts = 0;

    // Process each deal
    for (const deal of allDeals) {
      // Skip churned deals
      if (deal.isChurned) {
        console.log(`⊘ Skipping churned: ${deal.customerName}`);
        continue;
      }

      const tierRate = getTierRate(deal.tierAtStart);
      const arrUsd = parseFloat(deal.arrUsd);
      const effectiveArr = deal.onboardingFeePaid 
        ? arrUsd 
        : Math.max(0, arrUsd - (structure.onboardingArrReductionUsd || 5000));

      const numPayouts = deal.contractType === 'annual' ? 1 : (structure.monthlyPayoutMonths || 13);
      const payoutAmountUsd = deal.contractType === 'annual'
        ? effectiveArr * tierRate
        : (effectiveArr / 12) * tierRate;

      const payouts = [];

      for (let i = 1; i <= numPayouts; i++) {
        const { year, month } = addMonths(deal.startYear, deal.startMonth, i - 1);
        const referralDeduction = deal.isReferral ? payoutAmountUsd * 0.5 : 0;
        const onboardingDeduction = !deal.onboardingFeePaid && i === 1 ? (structure.onboardingDeductionGbp || 500) : 0;
        const netUsd = payoutAmountUsd - referralDeduction;
        const fxRate = parseFloat(deal.fxRateAtEntry) || 0.79;
        const netGbp = Math.max(0, netUsd * fxRate - onboardingDeduction);

        payouts.push({
          dealId: deal.id,
          aeId: deal.aeId,
          payoutYear: year,
          payoutMonth: month,
          payoutNumber: i,
          grossCommissionUsd: payoutAmountUsd.toFixed(2),
          referralDeductionUsd: referralDeduction.toFixed(2),
          onboardingDeductionGbp: onboardingDeduction.toFixed(2),
          netCommissionUsd: netUsd.toFixed(2),
          fxRateUsed: fxRate.toFixed(6),
          netCommissionGbp: netGbp.toFixed(2),
        });
      }

      if (payouts.length > 0) {
        await db.insert(commissionPayouts).values(payouts);
        totalPayouts += payouts.length;
        console.log(`✓ ${deal.customerName}: ${payouts.length} payouts (${deal.contractType})`);
      }
    }

    console.log(`\n✅ Regeneration complete! Created ${totalPayouts} total payouts`);

  } catch (error) {
    console.error('Error regenerating payouts:', error);
    process.exit(1);
  } finally {
    await connection.end();
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
