import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3000/api/trpc';

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

async function runImport() {
  console.log('Starting Pipedrive deal re-import...\n');
  
  const result = await callTrpc('pipedriveSync.import', {
    months: 24,
    useJoinDate: false,
  });
  
  if (result) {
    console.log('✓ Pipedrive import complete\n');
    console.log(`Total deals imported: ${result.totalImported}`);
    
    if (result.imported && result.imported.length > 0) {
      console.log(`\nImported deals (first 20):`);
      result.imported.slice(0, 20).forEach((deal, i) => {
        console.log(`  ${i + 1}. ${deal}`);
      });
      
      if (result.imported.length > 20) {
        console.log(`  ... and ${result.imported.length - 20} more`);
      }
    }
    
    if (result.errors && result.errors.length > 0) {
      console.log(`\nErrors encountered:`);
      result.errors.forEach((err) => {
        console.log(`  - ${err}`);
      });
    }
  } else {
    console.log('✗ Import failed');
  }
}

runImport().catch(console.error);
