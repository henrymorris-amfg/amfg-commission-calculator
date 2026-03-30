#!/usr/bin/env node

/**
 * Check contract start dates in Pipedrive for specific deals
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

async function main() {
  console.log("\n=== Checking Contract Start Dates in Pipedrive ===\n");

  try {
    // Get MSP Manufacturing deal
    const resp = await pipedriveGet("deals", {
      limit: 500,
    });

    const deals = resp.data || [];
    console.log(`Total deals in Pipedrive: ${deals.length}\n`);

    // Look for MSP Manufacturing
    const mspDeals = deals.filter((d) => d.title.toLowerCase().includes("msp"));
    
    if (mspDeals.length > 0) {
      console.log("MSP Manufacturing deals:");
      mspDeals.forEach((d) => {
        console.log(`  ID: ${d.id}`);
        console.log(`  Title: ${d.title}`);
        console.log(`  Won Time: ${d.won_time}`);
        console.log(`  Contract Start Date Field (39365abf109ea01960620ae35f468978ae611bc8): ${d["39365abf109ea01960620ae35f468978ae611bc8"] || "NOT SET"}`);
        console.log();
      });
    }

    // Look for other deals with contract start dates
    console.log("Sample of deals with contract start dates set:");
    let count = 0;
    deals.forEach((d) => {
      const contractDate = d["39365abf109ea01960620ae35f468978ae611bc8"];
      if (contractDate && count < 10) {
        console.log(`  ${d.title}: Won=${d.won_time?.substring(0, 10)}, Contract Start=${contractDate}`);
        count++;
      }
    });

    if (count === 0) {
      console.log("  (No deals found with contract start dates)");
    }

    // Count how many deals have the custom field set
    const withContractDate = deals.filter((d) => d["39365abf109ea01960620ae35f468978ae611bc8"]);
    console.log(`\nDeals with Contract Start Date set: ${withContractDate.length}/${deals.length}`);
  } catch (err) {
    console.error("ERROR:", err.message);
    process.exit(1);
  }
}

main();
