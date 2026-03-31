import mysql from 'mysql2/promise';

const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";

async function pipedriveGet(endpoint, params = {}) {
  const url = new URL(`${PIPEDRIVE_BASE}/${endpoint}`);
  url.searchParams.set("api_token", process.env.PIPEDRIVE_API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data || [];
}

async function pipedriveUpdate(endpoint, data) {
  const url = new URL(`${PIPEDRIVE_BASE}/${endpoint}`);
  url.searchParams.set("api_token", process.env.PIPEDRIVE_API_KEY);
  
  const res = await fetch(url.toString(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  if (!result.success) throw new Error(result.error);
  return result.data;
}

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL);
  const conn = await pool.getConnection();
  
  // Get all deals with missing contract start dates
  const [deals] = await conn.execute(`
    SELECT id, pipedriveId, customerName, arrUsd, pipedriveWonTime, contractStartDate
    FROM deals
    WHERE contractStartDate = pipedriveWonTime OR contractStartDate IS NULL
    ORDER BY aeId, pipedriveWonTime DESC
    LIMIT 65
  `);
  
  console.log(`Found ${deals.length} deals with missing contract start dates\n`);
  
  // Group by AE
  const byAe = {};
  deals.forEach(d => {
    if (!byAe[d.aeId]) byAe[d.aeId] = [];
    byAe[d.aeId].push(d);
  });
  
  // Generate Pipedrive links
  console.log('Pipedrive Update Links by AE:\n');
  
  for (const [aeId, aeDeals] of Object.entries(byAe)) {
    console.log(`\n=== AE ID: ${aeId} (${aeDeals.length} deals) ===\n`);
    
    aeDeals.forEach((deal, idx) => {
      const link = `https://app.pipedrive.com/deal/${deal.pipedriveId}`;
      console.log(`${idx + 1}. ${deal.customerName}`);
      console.log(`   ARR: £${deal.arrUsd}`);
      console.log(`   Won: ${deal.pipedriveWonTime.substring(0, 10)}`);
      console.log(`   Link: ${link}`);
      console.log();
    });
  }
  
  console.log('\n\nInstructions:');
  console.log('1. Click each Pipedrive link above');
  console.log('2. Scroll to "Contract Start Date" field');
  console.log('3. Enter the actual contract start date (YYYY-MM-DD format)');
  console.log('4. Save the deal');
  console.log('5. After updating all 65 deals, run "Sync Now" from the dashboard');
  
  conn.release();
  pool.end();
}

main().catch(console.error);
