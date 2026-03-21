/**
 * Standalone script to resync all Pipedrive demo activities into the
 * pipedrive_demo_activities table. Run with: node scripts/resync-demos.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from .user_env if available
try {
  const envFile = readFileSync("/home/ubuntu/.user_env", "utf-8");
  for (const line of envFile.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  }
} catch {}

// Also try project .env
try {
  const envFile = readFileSync(resolve(__dirname, "../.env"), "utf-8");
  for (const line of envFile.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  }
} catch {}

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

console.log("PIPEDRIVE_API_KEY:", PIPEDRIVE_API_KEY.substring(0, 8) + "...");
console.log("DATABASE_URL:", DATABASE_URL.substring(0, 30) + "...");

// Dynamic imports for ESM compatibility
const { createConnection } = await import("mysql2/promise");
const { drizzle } = await import("drizzle-orm/mysql2");

// Connect to DB
const connection = await createConnection(DATABASE_URL);
const db = drizzle(connection);

// Import schema
const schemaModule = await import("../drizzle/schema.js");
const { aeProfiles, pipedriveDemoActivities } = schemaModule;

// Drizzle helpers
const { eq, sql } = await import("drizzle-orm");

async function pipedriveGetAll(endpoint, params = {}) {
  const url = new URL(`https://api.pipedrive.com/v1/${endpoint}`);
  url.searchParams.set("api_token", PIPEDRIVE_API_KEY);
  url.searchParams.set("limit", "500");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  let allData = [];
  let start = 0;
  while (true) {
    url.searchParams.set("start", String(start));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Pipedrive API error: ${res.status} for ${endpoint}`);
    const json = await res.json();
    const data = json.data ?? [];
    allData = allData.concat(data);
    if (!json.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }
  return allData;
}

async function findPipedriveUserId(name) {
  const users = await pipedriveGetAll("users");
  const match = users.find(u =>
    u.name?.toLowerCase().trim() === name.toLowerCase().trim()
  );
  return match?.id ?? null;
}

async function fetchCompletedDemosForUser(pdUserId, fromDate, toDate) {
  const activities = await pipedriveGetAll("activities", {
    user_id: pdUserId,
    type: "demo",
    done: 1,
    start_date: fromDate,
    end_date: toDate,
  });
  return activities.filter(a => a.done === true || a.done === 1);
}

// Get all active AEs
const allAes = await db.select().from(aeProfiles).where(eq(aeProfiles.isActive, true));
console.log(`Found ${allAes.length} active AEs`);

const now = new Date();
const toDate = now.toISOString().substring(0, 10);

let totalInserted = 0;
let totalSkipped = 0;

for (const ae of allAes) {
  const fromDate = new Date(ae.joinDate).toISOString().substring(0, 10);
  console.log(`\nProcessing ${ae.name} (joined ${fromDate})...`);

  const pdUserId = await findPipedriveUserId(ae.name);
  if (!pdUserId) {
    console.log(`  SKIP: No Pipedrive user found for ${ae.name}`);
    totalSkipped++;
    continue;
  }
  console.log(`  Pipedrive user ID: ${pdUserId}`);

  const demos = await fetchCompletedDemosForUser(pdUserId, fromDate, toDate);
  console.log(`  Found ${demos.length} completed demos`);

  const records = demos
    .filter(d => d.marked_as_done_time)
    .map(d => {
      const doneTime = d.marked_as_done_time;
      const year = parseInt(doneTime.substring(0, 4), 10);
      const month = parseInt(doneTime.substring(5, 7), 10);
      return {
        aeId: ae.id,
        pipedriveActivityId: String(d.id),
        subject: d.subject || "(no subject)",
        orgName: d.org_name ?? null,
        dealId: d.deal_id ?? null,
        dealTitle: d.deal_title ?? null,
        doneDate: new Date(doneTime),
        year,
        month,
        isValid: true,
        flagReason: null,
      };
    });

  if (records.length === 0) {
    console.log(`  No records to insert for ${ae.name}`);
    continue;
  }

  // Upsert in batches of 50
  const BATCH = 50;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    await db.insert(pipedriveDemoActivities)
      .values(batch)
      .onDuplicateKeyUpdate({
        set: {
          subject: sql`VALUES(subject)`,
          orgName: sql`VALUES(org_name)`,
          dealId: sql`VALUES(deal_id)`,
          dealTitle: sql`VALUES(deal_title)`,
          doneDate: sql`VALUES(done_date)`,
          year: sql`VALUES(year)`,
          month: sql`VALUES(month)`,
        },
      });
  }

  console.log(`  Upserted ${records.length} demo records for ${ae.name}`);
  totalInserted += records.length;
}

console.log(`\n=== DONE ===`);
console.log(`Total demo records upserted: ${totalInserted}`);
console.log(`AEs skipped (no Pipedrive match): ${totalSkipped}`);

await connection.end();
process.exit(0);
