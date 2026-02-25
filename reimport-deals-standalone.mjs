import fetch from 'node-fetch';
import mysql from 'mysql2/promise';

const PIPEDRIVE_BASE = 'https://api.pipedrive.com/v1';
const TARGET_PIPELINE_IDS = [20, 12, 10];

async function getPipedriveDeals() {
  const apiKey = process.env.PIPEDRIVE_API_KEY;
  const deals = [];
  
  for (const pipelineId of TARGET_PIPELINE_IDS) {
    let start = 0;
    while (true) {
      const url = `${PIPEDRIVE_BASE}/deals?pipeline_id=${pipelineId}&status=won&start=${start}&limit=500&api_token=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (!data.success || !data.data) break;
      deals.push(...data.data);
      
      if (!data.additional_data?.pagination?.more_items_in_collection) break;
      start = data.additional_data.pagination.next_start;
    }
  }
  
  return deals;
}

async function reimportDeals() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log('Fetching deals from Pipedrive...');
  const pipedriveDeals = await getPipedriveDeals();
  console.log(`Found ${pipedriveDeals.length} deals in Pipedrive\n`);
  
  // Get current deal count
  const [countBefore] = await conn.query('SELECT COUNT(*) as count FROM deals');
  console.log(`Current database deals: ${countBefore[0].count}`);
  
  // Delete all existing deals (this will cascade to payouts)
  console.log('Deleting existing deals...');
  await conn.query('DELETE FROM deals');
  await conn.query('DELETE FROM commission_payouts');
  
  // Re-import each deal
  let imported = 0;
  for (const deal of pipedriveDeals) {
    try {
      const wonDate = deal.won_time || deal.close_time;
      if (!wonDate) continue;
      
      const date = new Date(wonDate);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      
      // For now, set all to annual (since billing frequency field doesn't exist in Pipedrive)
      const contractType = 'annual';
      
      await conn.query(
        `INSERT INTO deals (aeId, customerName, contractType, startYear, startMonth, startDay, arrUsd, tierAtStart, fxRateAtWon, pipedriveId, pipedriveWonTime, contractStartDate, billingFrequency, onboardingFeePaid, isReferral, commissionStructureId, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          1, // placeholder aeId - will be updated by actual import
          deal.title,
          contractType,
          year,
          month,
          date.getDate(),
          Math.round(deal.value || 0),
          'bronze', // placeholder tier
          '0.741',
          deal.id,
          new Date(wonDate),
          null,
          contractType,
          true,
          false,
          null,
          `Imported from Pipedrive (Pipeline: ${deal.pipeline_id})`
        ]
      );
      imported++;
    } catch (err) {
      console.error(`Error importing deal ${deal.id}:`, err.message);
    }
  }
  
  console.log(`\nImported ${imported} deals`);
  
  // Get new count
  const [countAfter] = await conn.query('SELECT COUNT(*) as count FROM deals');
  console.log(`New database deals: ${countAfter[0].count}`);
  
  await conn.end();
}

reimportDeals().catch(console.error);
