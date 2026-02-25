import mysql from 'mysql2/promise';

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY;
const conn = await mysql.createConnection(process.env.DATABASE_URL);

async function pipedriveGet(endpoint) {
  const url = `https://api.pipedrive.com/v1/${endpoint}&api_token=${PIPEDRIVE_API_KEY}`;
  const res = await fetch(url);
  return res.json();
}

try {
  // Get all AEs
  const [aes] = await conn.query('SELECT * FROM ae_profiles WHERE isActive = 1');
  console.log(`Found ${aes.length} active AEs`);

  let totalImported = 0;

  for (const ae of aes) {
    try {
      console.log(`\nProcessing ${ae.name}...`);
      
      // Get all won deals from Pipedrive for this AE
      const response = await pipedriveGet(`persons/${ae.pipedrivePersonId}/deals?status=won&limit=500`);
      
      if (!response.success || !response.data || response.data.length === 0) {
        console.log(`  No deals found`);
        continue;
      }

      console.log(`  Found ${response.data.length} won deals`);
      
      for (const pdDeal of response.data) {
        const title = pdDeal.title;
        const arrUsd = pdDeal.value || 0;
        const wonDate = pdDeal.won_time;
        
        // Contract start date - use won date as fallback
        const startDate = wonDate;
        const startDateObj = new Date(startDate);
        const startMonth = startDateObj.getMonth() + 1;
        const startYear = startDateObj.getFullYear();
        
        console.log(`    ${title}: $${arrUsd} ARR, starts ${startMonth}/${startYear}`);
        
        // Insert deal with default tier (will be calculated on read)
        const [dealResult] = await conn.query(
          `INSERT INTO deals (aeId, customerName, arrUsd, tierAtStart, startMonth, startYear, contractType, totalCommissionUsd, totalCommissionGbp, pipedriveWonTime, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ae.id, title, arrUsd, 'bronze', startMonth, startYear, 'annual', 0, 0, wonDate, 'Imported from Pipedrive']
        );
        
        totalImported++;
      }
    } catch (err) {
      console.error(`Error processing ${ae.name}:`, err.message);
    }
  }

  console.log(`\n✓ Imported ${totalImported} deals`);
} catch (err) {
  console.error('Fatal error:', err);
} finally {
  await conn.end();
}
