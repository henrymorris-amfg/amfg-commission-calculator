#!/usr/bin/env node

/**
 * Diagnostic script to test Pipedrive API and find Roechling Plastics UK
 */

const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";
const TARGET_PIPELINE_IDS = [20, 12, 10]; // Machining, Closing SMB, Closing Enterprise
const PIPELINE_NAMES = {
  20: "Machining",
  12: "Closing SMB",
  10: "Closing Enterprise",
};

const DEAL_EXCLUSION_KEYWORDS = [
  "implementation",
  "customer success",
  "onboarding",
  "cs ",
  "- cs",
];

function isDealExcluded(title) {
  const lower = title.toLowerCase();
  return DEAL_EXCLUSION_KEYWORDS.some((kw) => lower.includes(kw));
}

async function pipedriveGet(endpoint, params = {}) {
  const apiKey = process.env.PIPEDRIVE_API_KEY;
  if (!apiKey) {
    throw new Error("PIPEDRIVE_API_KEY environment variable is not set.");
  }
  const url = new URL(`${PIPEDRIVE_BASE}/${endpoint}`);
  url.searchParams.set("api_token", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Pipedrive API error: ${res.status} ${res.statusText} for ${endpoint}`);
  }
  return res.json();
}

async function pipedriveGetAll(endpoint, params = {}) {
  const all = [];
  let start = 0;
  const limit = 500;

  while (true) {
    const resp = await pipedriveGet(endpoint, {
      ...params,
      limit,
      start,
    });

    const data = resp.data || [];
    all.push(...data);

    const more = resp.additional_data?.pagination?.more_items_in_collection;
    if (!more) break;
    start += limit;
  }

  return all;
}

async function findPipedriveUserId(aeName) {
  const resp = await pipedriveGet("users");
  const users = resp.data || [];
  console.log(`[DEBUG] Looking for user: "${aeName}" among ${users.length} Pipedrive users`);

  // Exact match first
  const exact = users.find(
    (u) => u.name.toLowerCase() === aeName.toLowerCase()
  );
  if (exact) {
    console.log(`[DEBUG] Found exact match: ${exact.name} (ID: ${exact.id})`);
    return exact.id;
  }

  // Partial match (first name + last name)
  const nameParts = aeName.toLowerCase().split(" ");
  const partial = users.find((u) => {
    const uParts = u.name.toLowerCase().split(" ");
    return nameParts.every((part) => uParts.some((up) => up.includes(part)));
  });
  if (partial) {
    console.log(`[DEBUG] Found partial match: ${partial.name} (ID: ${partial.id})`);
    return partial.id;
  }

  console.log(`[DEBUG] No user found for "${aeName}"`);
  return null;
}

async function fetchWonDealsForUser(pipedriveUserId, fromDate, toDate) {
  const dealsById = new Map();

  for (const pipelineId of TARGET_PIPELINE_IDS) {
    console.log(`[DEBUG] Fetching deals from pipeline ${pipelineId} (${PIPELINE_NAMES[pipelineId]})...`);
    const deals = await pipedriveGetAll("deals", {
      pipeline_id: pipelineId,
      user_id: pipedriveUserId,
      status: "won",
    });

    console.log(`[DEBUG] Found ${deals.length} won deals in pipeline ${pipelineId}`);

    for (const d of deals) {
      if (dealsById.has(d.id)) continue;
      if (isDealExcluded(d.title)) {
        console.log(`[DEBUG] Excluding deal: ${d.title} (matches exclusion keywords)`);
        continue;
      }
      const wonDate = d.won_time || d.close_time;
      if (!wonDate) {
        console.log(`[DEBUG] Skipping deal ${d.id} (${d.title}): no won_time or close_time`);
        continue;
      }
      const date = wonDate.substring(0, 10);
      if (date >= fromDate && date <= toDate) {
        dealsById.set(d.id, d);
      }
    }
  }

  return Array.from(dealsById.values());
}

async function main() {
  console.log("\n=== Pipedrive Diagnostic Tool ===\n");

  // Test with a specific AE name (e.g., "Toby Greer")
  const aeName = process.argv[2] || "Toby Greer";
  console.log(`Testing with AE: ${aeName}\n`);

  try {
    const pdUserId = await findPipedriveUserId(aeName);
    if (!pdUserId) {
      console.log(`ERROR: Could not find Pipedrive user for "${aeName}"`);
      process.exit(1);
    }

    const now = new Date();
    const toDate = now.toISOString().substring(0, 10);
    const fromDate = new Date(
      now.getFullYear(),
      now.getMonth() - 5,
      1
    ).toISOString().substring(0, 10);

    console.log(`\nFetching deals from ${fromDate} to ${toDate}...\n`);

    const deals = await fetchWonDealsForUser(pdUserId, fromDate, toDate);

    console.log(`\n=== RESULTS ===`);
    console.log(`Total deals found: ${deals.length}\n`);

    // Look for Roechling
    const roechling = deals.find((d) => d.title.toLowerCase().includes("roechling"));
    if (roechling) {
      console.log(`✓ Found Roechling deal:`);
      console.log(`  ID: ${roechling.id}`);
      console.log(`  Title: ${roechling.title}`);
      console.log(`  Value: ${roechling.value} ${roechling.currency}`);
      console.log(`  Won Time: ${roechling.won_time}`);
      console.log(`  Pipeline: ${PIPELINE_NAMES[roechling.pipeline_id] || roechling.pipeline_id}`);
      console.log(`  Contract Start Date Field: ${roechling["39365abf109ea01960620ae35f468978ae611bc8"] || "NOT SET"}`);
    } else {
      console.log(`✗ Roechling deal NOT found in results`);
      console.log(`\nAll deals found:`);
      deals.forEach((d) => {
        console.log(`  - ${d.title} (ID: ${d.id}, Pipeline: ${PIPELINE_NAMES[d.pipeline_id]})`);
      });
    }
  } catch (err) {
    console.error("ERROR:", err.message);
    process.exit(1);
  }
}

main();
