import mysql from 'mysql2/promise';

const pool = mysql.createPool(process.env.DATABASE_URL);

async function main() {
  const conn = await pool.getConnection();
  const [rows] = await conn.execute(`
    SELECT 
      id, 
      customerName, 
      aeId, 
      pipedriveId,
      DATE_FORMAT(pipedriveWonTime, '%Y-%m-%d') as wonDate,
      DATE_FORMAT(contractStartDate, '%Y-%m-%d') as currentStartDate,
      startYear,
      startMonth,
      startDay,
      arrUsd
    FROM deals 
    WHERE contractStartDate IS NULL 
       OR contractStartDate = '0000-00-00' 
       OR contractStartDate = pipedriveWonTime
    ORDER BY aeId, startYear DESC, startMonth DESC, customerName
  `);
  
  // Get AE names
  const [aeRows] = await conn.execute('SELECT id, name FROM aeProfiles');
  const aeMap = new Map(aeRows.map(r => [r.id, r.name]));
  
  // Generate CSV
  console.log('Deal ID,Customer Name,AE,AE ID,Pipedrive ID,Won Date,Current Start Date,Start Year-Month,ARR (GBP),Pipedrive Link');
  
  for (const row of rows) {
    const aeName = aeMap.get(row.aeId) || 'Unknown';
    const pipedriveLink = `https://amfg.pipedrive.com/deal/${row.pipedriveId}`;
    const startYearMonth = `${row.startYear}-${String(row.startMonth).padStart(2, '0')}`;
    
    console.log([
      row.id,
      `"${row.customerName}"`,
      `"${aeName}"`,
      row.aeId,
      row.pipedriveId,
      row.wonDate,
      row.currentStartDate || 'NULL',
      startYearMonth,
      row.arrUsd,
      pipedriveLink
    ].join(','));
  }
  
  conn.release();
  pool.end();
}

main().catch(console.error);
