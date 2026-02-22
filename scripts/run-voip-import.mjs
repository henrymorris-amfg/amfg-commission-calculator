/**
 * Script: run-voip-import.mjs
 * Generates a Henry (id=1) AE token and calls the VOIP import procedure
 * for the last 6 months.
 */

function makeAeToken(aeId) {
  const payload = { aeId, ts: Date.now() };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

const token = makeAeToken(1); // Henry Morris (team leader)
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

console.log('\n=== Running VOIP Monthly Import (last 6 months) ===\n');
try {
  const result = await callTrpc('voipSync.import', { months: 6 });
  console.log(`Records updated: ${result.recordsUpdated}`);
  console.log(`AEs updated: ${result.aesUpdated}`);
  if (result.unmatchedAes?.length) {
    console.log('\nUnmatched VOIP users (no AE profile found):');
    result.unmatchedAes.forEach(u => console.log(' -', u));
  }
  console.log('\nDone!');
} catch (err) {
  console.error('VOIP import failed:', err.message);
  process.exit(1);
}
