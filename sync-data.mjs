import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3000/api/trpc';

// Helper to call tRPC procedures
async function callTrpc(procedure, input = {}) {
  const url = `${API_BASE}/${procedure}`;
  const params = new URLSearchParams({
    input: JSON.stringify(input),
  });
  
  const response = await fetch(`${url}?${params}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (!response.ok) {
    console.error(`Error calling ${procedure}:`, response.status, response.statusText);
    const text = await response.text();
    console.error('Response:', text);
    return null;
  }
  
  const data = await response.json();
  return data.result?.data;
}

async function runSync() {
  console.log('Starting full data sync...\n');
  
  // Run Pipedrive sync
  console.log('1. Running Pipedrive sync...');
  const pipedriveResult = await callTrpc('pipedriveSync.import', {
    months: 12,
    useJoinDate: true,
  });
  
  if (pipedriveResult) {
    console.log(`   ✓ Pipedrive sync complete`);
    console.log(`   - Imported: ${pipedriveResult.totalImported} deals`);
    if (pipedriveResult.imported?.length > 0) {
      console.log(`   - Details: ${pipedriveResult.imported.slice(0, 3).join('; ')}${pipedriveResult.imported.length > 3 ? '...' : ''}`);
    }
  } else {
    console.log('   ✗ Pipedrive sync failed');
  }
  
  // Run VOIP sync
  console.log('\n2. Running VOIP sync...');
  const voipResult = await callTrpc('voipSync.importMonthlyData', {
    months: 12,
    useJoinDate: true,
  });
  
  if (voipResult) {
    console.log(`   ✓ VOIP sync complete`);
    console.log(`   - Records updated: ${voipResult.recordsUpdated}`);
  } else {
    console.log('   ✗ VOIP sync failed');
  }
  
  console.log('\n✓ Full data sync complete');
}

runSync().catch(console.error);
