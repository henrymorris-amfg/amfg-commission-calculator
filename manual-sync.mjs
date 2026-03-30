#!/usr/bin/env node

/**
 * Manually trigger Pipedrive sync via the API
 */

import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

// Create a tRPC client
const client = createTRPCProxyClient({
  transformer: superjson,
  links: [
    httpBatchLink({
      url: "http://localhost:3000/api/trpc",
      headers: {
        // Use a team leader's AE token (Toby Greer is a team leader)
        "X-AE-Token": process.env.AE_TOKEN || "eyJhZUlkIjozMDAwNCwiaWF0IjoxNzcxMDAwMDAwfQ==",
      },
    }),
  ],
});

async function main() {
  console.log("\n=== Manual Pipedrive Sync ===\n");

  try {
    console.log("1. Importing monthly metrics from Pipedrive...");
    const importResult = await client.pipedriveSync.import.mutate({
      months: 6,
      useJoinDate: true,
      mergeMode: "replace",
    });
    console.log(`   ✓ Updated metrics: ${importResult.updatedMetrics.length}`);
    console.log(`   ✓ Skipped AEs: ${importResult.skippedAes.length}`);

    console.log("\n2. Importing individual deals from Pipedrive...");
    const importDealsResult = await client.pipedriveSync.importDeals.mutate({
      months: 6,
      useJoinDate: true,
    });
    console.log(`   ✓ Imported deals: ${importDealsResult.imported.length}`);
    console.log(`   ✓ Skipped deals: ${importDealsResult.skipped.length}`);
    console.log(`   ✓ Errors: ${importDealsResult.errors.length}`);

    if (importDealsResult.imported.length > 0) {
      console.log("\n   Imported deals:");
      importDealsResult.imported.forEach((deal) => {
        console.log(`     - ${deal}`);
      });
    }

    if (importDealsResult.errors.length > 0) {
      console.log("\n   Errors:");
      importDealsResult.errors.forEach((err) => {
        console.log(`     - ${err}`);
      });
    }

    console.log("\n✓ Sync completed successfully!");
  } catch (err) {
    console.error("ERROR:", err);
    process.exit(1);
  }
}

main();
