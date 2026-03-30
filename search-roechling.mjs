#!/usr/bin/env node

/**
 * Search for Roechling across all Pipedrive deals
 */

const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";

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

async function main() {
  console.log("\n=== Searching for Roechling in Pipedrive ===\n");

  try {
    // Get all won deals across all pipelines
    console.log("Fetching all won deals...");
    const deals = await pipedriveGetAll("deals", {
      status: "won",
    });

    console.log(`Total won deals found: ${deals.length}\n`);

    // Search for Roechling
    const roechlingDeals = deals.filter((d) =>
      d.title.toLowerCase().includes("roechling")
    );

    if (roechlingDeals.length > 0) {
      console.log(`✓ Found ${roechlingDeals.length} Roechling deal(s):\n`);
      roechlingDeals.forEach((d) => {
        console.log(`  ID: ${d.id}`);
        console.log(`  Title: ${d.title}`);
        console.log(`  Value: ${d.value} ${d.currency}`);
        console.log(`  Status: ${d.status}`);
        console.log(`  Won Time: ${d.won_time}`);
        console.log(`  Owner: ${d.owner_name || "Unknown"}`);
        console.log(`  Pipeline ID: ${d.pipeline_id}`);
        console.log(`  Stage ID: ${d.stage_id}`);
        console.log(`  Contract Start Date: ${d["39365abf109ea01960620ae35f468978ae611bc8"] || "NOT SET"}`);
        console.log();
      });
    } else {
      console.log(`✗ No Roechling deals found in won deals\n`);
      
      // Try searching in all deals (not just won)
      console.log("Searching in ALL deals (not just won)...");
      const allDeals = await pipedriveGetAll("deals");
      const roechlingAll = allDeals.filter((d) =>
        d.title.toLowerCase().includes("roechling")
      );
      
      if (roechlingAll.length > 0) {
        console.log(`Found ${roechlingAll.length} Roechling deal(s) in all statuses:\n`);
        roechlingAll.forEach((d) => {
          console.log(`  ID: ${d.id}`);
          console.log(`  Title: ${d.title}`);
          console.log(`  Status: ${d.status}`);
          console.log(`  Owner: ${d.owner_name || "Unknown"}`);
          console.log(`  Won Time: ${d.won_time || "NOT WON"}`);
          console.log();
        });
      } else {
        console.log("✗ No Roechling deals found in Pipedrive at all");
      }
    }
  } catch (err) {
    console.error("ERROR:", err.message);
    process.exit(1);
  }
}

main();
