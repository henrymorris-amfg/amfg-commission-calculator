/**
 * Run the importDeals procedure to populate deal records from Pipedrive.
 * Uses Henry Morris (team leader) token.
 */
import { createServer } from "http";

const BASE_URL = "http://localhost:3000";

// Build Henry's token (aeId=1)
const payload = { aeId: 1, ts: Date.now() };
const token = Buffer.from(JSON.stringify(payload)).toString("base64url");

async function callTrpc(procedure, input) {
  const url = `${BASE_URL}/api/trpc/${procedure}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-AE-Token": token,
    },
    body: JSON.stringify({ json: input }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(JSON.stringify(data.error));
  }
  return data.result?.data?.json ?? data.result?.data;
}

console.log("Running importDeals (last 12 months)...");
try {
  const result = await callTrpc("pipedriveSync.importDeals", { months: 12 });
  console.log("\n✅ Import complete:");
  console.log(`  Total imported: ${result.totalImported}`);
  console.log(`  Skipped: ${result.skipped.length}`);
  console.log(`  Errors: ${result.errors.length}`);
  if (result.imported.length > 0) {
    console.log("\nImported deals:");
    result.imported.forEach(d => console.log(`  ✓ ${d}`));
  }
  if (result.skipped.length > 0) {
    console.log("\nSkipped:");
    result.skipped.forEach(d => console.log(`  - ${d}`));
  }
  if (result.errors.length > 0) {
    console.log("\nErrors:");
    result.errors.forEach(d => console.log(`  ✗ ${d}`));
  }
} catch (err) {
  console.error("Error:", err.message);
}
