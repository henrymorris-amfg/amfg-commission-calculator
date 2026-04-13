import { getDb } from '../db';
import { deals, monthlyMetrics } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) throw new Error('No database');

  // Find Tad's Kavera deal
  const kavera = await db.query.deals.findFirst({
    where: and(
      eq(deals.customerName, 'Kavera'),
      eq(deals.aeId, 3) // Tad's ID
    ),
  });

  console.log('Kavera deal found:', kavera);

  if (kavera) {
    // €4,588 EUR = ~$5,046.80 USD (using 1.1 EUR/USD rate)
    const usdValue = 4588 * 1.1;
    
    console.log(`Updating Kavera: €4,588 EUR = $${usdValue.toFixed(2)} USD`);
    console.log(`Current contract type: ${kavera.contractType}`);
    console.log(`Current billing frequency: ${kavera.billingFrequency}`);
    console.log(`Current ARR USD: ${kavera.arrUsd}`);

    // Update the deal
    await db
      .update(deals)
      .set({
        originalAmountUsd: Math.round(usdValue * 100) / 100,
        arrUsd: Math.round(usdValue * 100) / 100, // Assuming annual contract
      })
      .where(eq(deals.id, kavera.id));

    console.log('✓ Kavera deal updated');
  }

  // Check Tad's April metrics
  const tadAprilMetrics = await db.query.monthlyMetrics.findFirst({
    where: and(
      eq(monthlyMetrics.aeId, 3), // Tad
      eq(monthlyMetrics.month, 4),
      eq(monthlyMetrics.year, 2026)
    ),
  });

  console.log('\nTad\'s April 2026 metrics:', tadAprilMetrics);
  if (tadAprilMetrics) {
    console.log(`  Demos: ${tadAprilMetrics.demosTotal}`);
    console.log(`  Dials: ${tadAprilMetrics.dialsTotal}`);
    console.log(`  ARR: $${tadAprilMetrics.arrUsd}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));
