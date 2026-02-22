/**
 * Script: run-pipedrive-sync.mjs
 * Generates a Henry (id=1) AE token and calls the Pipedrive syncToDb procedure
 * for the last 6 months with mergeMode=replace.
 */

// Token format: base64url({ aeId, ts })
function makeAeToken(aeId) {
  const payload = { aeId, ts: Date.now() };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

const token = makeAeToken(1); // Henry Morris
console.log('Token generated for Henry (aeId=1)');

const BASE = 'http://localhost:3000';

async function callTrpc(path, input) {
  const url = `${BASE}/api/trpc/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ae-token': token,
    },
    body: JSON.stringify({ json: input }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Non-JSON response: ${text.slice(0, 200)}`); }
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result?.data?.json ?? data.result?.data;
}

console.log('\n=== Running Pipedrive Sync (last 6 months, replace mode) ===\n');
try {
  const result = await callTrpc('pipedriveSync.import', {
    monthsBack: 6,
    mergeMode: 'replace',
  });
  console.log('Sync result:');
  if (result?.updatedMetrics?.length) {
    result.updatedMetrics.forEach(m => console.log(' -', m));
  }
  if (result?.skipped?.length) {
    console.log('\nSkipped (no Pipedrive match):');
    result.skipped.forEach(s => console.log(' -', s));
  }
  console.log('\nTotal updated:', result?.updatedMetrics?.length ?? 0);
} catch (err) {
  console.error('Sync failed:', err.message);
  process.exit(1);
}
