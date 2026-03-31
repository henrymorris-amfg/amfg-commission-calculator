import mysql from 'mysql2/promise';

const pool = mysql.createPool(process.env.DATABASE_URL);

async function main() {
  const conn = await pool.getConnection();
  
  const [rows] = await conn.execute(`
    SELECT 
      id, 
      pipedriveId, 
      customerName, 
      aeId, 
      (SELECT name FROM ae_profiles WHERE id = deals.aeId) as aeName,
      arrUsd,
      DATE_FORMAT(pipedriveWonTime, '%Y-%m-%d') as wonDate
    FROM deals 
    WHERE contractStartDate = pipedriveWonTime 
    ORDER BY aeId, customerName
  `);
  
  console.log('DEAL_ID,PIPEDRIVE_ID,CUSTOMER_NAME,AE_NAME,ARR_USD,WON_DATE,PIPEDRIVE_LINK');
  
  rows.forEach(row => {
    const link = `https://app.pipedrive.com/deal/${row.pipedriveId}`;
    const csv = `${row.id},${row.pipedriveId},"${row.customerName}",${row.aeName},${row.arrUsd},${row.wonDate},${link}`;
    console.log(csv);
  });
  
  console.log(`\n\nTotal deals needing contract start dates: ${rows.length}`);
  
  conn.release();
  pool.end();
}

main().catch(console.error);
