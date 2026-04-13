import { getDb } from '../db';
import { aeProfiles, deals, monthlyMetrics } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) throw new Error('No database');

  // Get Tad's profile
  const tad = await db.query.aeProfiles.findFirst({
    where: eq(aeProfiles.name, 'Tad Tamulevicius'),
  });

  console.log('\n=== TAD TAMULEVICIUS ===');
  console.log('ID:', tad?.id);
  console.log('Pipedrive User ID:', tad?.pipedriveUserId);
  console.log('Join Date:', tad?.joinDate);

  // Get Tad's deals
  const tadDeals = await db.query.deals.findMany({
    where: eq(deals.aeId, tad?.id || 0),
  });

  console.log('\n=== TAD\'S DEALS ===');
  console.log('Total deals:', tadDeals.length);
  tadDeals.forEach((deal: any) => {
    console.log(`- ${deal.customerName}: $${deal.originalAmountUsd} USD (${deal.contractType}), started ${deal.contractStartDate}`);
  });

  // Get Tad's metrics
  const tadMetrics = await db.query.monthlyMetrics.findMany({
    where: eq(monthlyMetrics.aeId, tad?.id || 0),
  }) as any[];

  console.log('\n=== TAD\'S MONTHLY METRICS ===');
  console.log('Total months:', tadMetrics.length);
  tadMetrics.forEach((metric: any) => {
    console.log(`- ${metric.monthYear}: ARR=$${metric.arrUsd}, Demos=${metric.demosTotal}, Dials=${metric.dialsTotal}`);
  });

  // Check for Kavera deal specifically
  const kavera = tadDeals.find((d: any) => d.customerName.includes('Kavera'));
  console.log('\n=== KAVERA DEAL ===');
  console.log('Found:', !!kavera);
  if (kavera) {
    console.log('Original Amount USD:', (kavera as any).originalAmountUsd);
    console.log('ARR USD:', (kavera as any).arrUsd);
    console.log('Contract Start:', (kavera as any).contractStartDate);
    console.log('Contract Type:', (kavera as any).contractType);
    console.log('Billing Frequency:', (kavera as any).billingFrequency);
  }
}

main().catch(console.error).finally(() => process.exit(0));
