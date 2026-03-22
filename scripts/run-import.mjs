#!/usr/bin/env node
import { db } from "../server/db.ts";
import { pipedriveSync } from "../server/pipedriveSync.ts";

// Run the import
console.log("Starting Pipedrive import...");

try {
  // Call the import function directly
  const result = await pipedriveSync.import({
    months: 24,
    useJoinDate: true,
    mergeMode: 'replace'
  });
  
  console.log("Import completed successfully!");
  console.log("Result:", result);
} catch (error) {
  console.error("Import failed:", error);
  process.exit(1);
}
