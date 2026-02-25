#!/usr/bin/env node

/**
 * Direct Pipedrive deal import script.
 * Bypasses the UI and imports all won deals directly from Pipedrive.
 * Usage: node import-deals-direct.mjs
 */

import mysql from "mysql2/promise";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "dotenv";

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, ".env.local") });

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!PIPEDRIVE_API_KEY) {
  console.error("ERROR: PIPEDRIVE_API_KEY not set");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not set");
  process.exit(1);
}

async function pipedriveGet(endpoint, params = {}) {
  const url = new URL(`https://api.pipedrive.com/v1/${endpoint}`);
  url.searchParams.set("api_token", PIPEDRIVE_API_KEY);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`Pipedrive API error: ${response.status}`);
      return null;
    }
    const data = await response.json();
    return data.success ? data.data : null;
  } catch (err) {
    console.error(`Pipedrive API request failed: ${err.message}`);
    return null;
  }
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);

  try {
    console.log("Starting Pipedrive deal import...\n");

    // Get all active AEs
    const [aes] = await conn.query("SELECT id, name FROM ae_profiles WHERE isActive = 1");
    console.log(`Found ${aes.length} active AEs\n`);

    // Get all Pipedrive users and create a name->id map
    const pipedriveUsers = await pipedriveGet("users");
    const userMap = {};
    if (pipedriveUsers) {
      pipedriveUsers.forEach((u) => {
        userMap[u.name.toLowerCase()] = u.id;
      });
    }

    let totalImported = 0;
    let totalSkipped = 0;

    for (const ae of aes) {
      try {
        console.log(`Processing ${ae.name}...`);

        // Find this AE in Pipedrive by name
        const userId = userMap[ae.name.toLowerCase()];
        if (!userId) {
          console.log(`  Not found in Pipedrive\n`);
          continue;
        }

        console.log(`  Found in Pipedrive as user ID ${userId}`);

        // Get all deals assigned to this user
        const deals = await pipedriveGet("deals", {
          user_id: userId,
          status: "won",
          limit: 500,
        });

        if (!deals || deals.length === 0) {
          console.log(`  No deals found\n`);
          continue;
        }

        console.log(`  Found ${deals.length} won deals`);

        for (const deal of deals) {
          try {
            const title = deal.title || "Untitled";

            // Skip implementation/onboarding deals
            if (
              title.toLowerCase().includes("implementation") ||
              title.toLowerCase().includes("customer success") ||
              title.toLowerCase().includes("onboarding")
            ) {
              console.log(`    SKIP: ${title} (implementation deal)`);
              totalSkipped++;
              continue;
            }

            const arrUsd = deal.value || 0;
            const wonDate = deal.won_time;

            if (!wonDate) {
              console.log(`    SKIP: ${title} (no won date)`);
              totalSkipped++;
              continue;
            }

            // Use won date as contract start date
            const startDate = new Date(wonDate);
            const startYear = startDate.getFullYear();
            const startMonth = startDate.getMonth() + 1;
            const startDay = startDate.getDate();

            console.log(`    ${title}: $${arrUsd} ARR, starts ${startMonth}/${startDay}/${startYear}`);

            // Insert deal
            await conn.query(
              `INSERT INTO deals (
                aeId, customerName, contractType, startYear, startMonth, startDay,
                arrUsd, onboardingFeePaid, isReferral, tierAtStart, fxRateAtEntry,
                pipedriveId, pipedriveWonTime, contractStartDate, billingFrequency, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE updatedAt = NOW()`,
              [
                ae.id,
                title,
                "annual", // Default to annual
                startYear,
                startMonth,
                startDay,
                arrUsd,
                true,
                false,
                "bronze", // Default tier
                "1.0", // Default FX rate
                deal.id,
                wonDate,
                wonDate,
                "annual", // Default billing frequency
                `Imported from Pipedrive on ${new Date().toISOString()}`,
              ]
            );

            totalImported++;
          } catch (err) {
            console.error(`    ERROR: ${err.message}`);
          }
        }

        console.log();
      } catch (err) {
        console.error(`Error processing ${ae.name}: ${err.message}\n`);
      }
    }

    console.log(`✓ Import complete: ${totalImported} deals imported, ${totalSkipped} skipped`);
  } finally {
    await conn.end();
  }
}

main().catch(console.error);
