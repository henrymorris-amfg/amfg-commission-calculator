import mysql from 'mysql2/promise';

const pool = mysql.createPool(process.env.DATABASE_URL);

async function main() {
  const conn = await pool.getConnection();
  
  // Get all AEs
  const [aes] = await conn.execute('SELECT id, name FROM ae_profiles WHERE isActive = 1 ORDER BY name');
  
  console.log(`Found ${aes.length} active AEs. Triggering sync...`);
  
  // Import the sync function
  const { importDeals, importDemos } = await import('./server/pipedriveSync.ts');
  
  // Trigger sync for each AE
  for (const ae of aes) {
    console.log(`\nSyncing ${ae.name}...`);
    try {
      await importDeals({ aeIds: [ae.id], useJoinDate: true });
      await importDemos({ aeIds: [ae.id], useJoinDate: true });
      console.log(`✓ ${ae.name} synced successfully`);
    } catch (err) {
      console.error(`✗ ${ae.name} sync failed:`, err.message);
    }
  }
  
  conn.release();
  pool.end();
}

main().catch(console.error);
