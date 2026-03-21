/**
 * Targeted sync for Tad Tamulevicius whose Pipedrive name is "Tad"
 * Run with: npx tsx scripts/resync-tad.ts
 */
import { readFileSync } from "fs";
import { createConnection } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, sql } from "drizzle-orm";
import { aeProfiles, pipedriveDemoActivities } from "../drizzle/schema";

try {
  const envFile = readFileSync("/home/ubuntu/.user_env", "utf-8");
  for (const line of envFile.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  }
} catch {}

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;
const TAD_PD_USER_ID = 25357905;

const connection = await createConnection(DATABASE_URL);
const db = drizzle(connection);

// Find Tad's AE profile
const [tad] = await db.select().from(aeProfiles).where(eq(aeProfiles.name, "Tad Tamulevicius"));
if (!tad) {
  console.error("Tad not found in ae_profiles");
  process.exit(1);
}
console.log("Found Tad:", tad.id, tad.name, "joined:", tad.joinDate);

const fromDate = new Date(tad.joinDate).toISOString().substring(0, 10);
const toDate = new Date().toISOString().substring(0, 10);

async function pipedriveGetAll(endpoint: string, params: Record<string, string | number> = {}): Promise<any[]> {
  const url = new URL(`https://api.pipedrive.com/v1/${endpoint}`);
  url.searchParams.set("api_token", PIPEDRIVE_API_KEY);
  url.searchParams.set("limit", "500");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  let allData: any[] = [];
  let start = 0;
  while (true) {
    url.searchParams.set("start", String(start));
    const res = await fetch(url.toString());
    const json = await res.json() as any;
    allData = allData.concat(json.data ?? []);
    if (!json.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }
  return allData;
}

const demos = await pipedriveGetAll("activities", {
  user_id: TAD_PD_USER_ID,
  type: "demo",
  done: 1,
  start_date: fromDate,
  end_date: toDate,
});

const doneDemos = demos.filter((d: any) => d.done === true || d.done === 1);
console.log(`Found ${doneDemos.length} completed demos for Tad from ${fromDate}`);

const records = doneDemos
  .filter((d: any) => d.marked_as_done_time)
  .map((d: any) => {
    const doneTime = d.marked_as_done_time as string;
    return {
      aeId: tad.id,
      pipedriveActivityId: String(d.id),
      subject: d.subject || "(no subject)",
      orgName: d.org_name ?? null,
      dealId: d.deal_id ?? null,
      dealTitle: d.deal_title ?? null,
      doneDate: new Date(doneTime),
      year: parseInt(doneTime.substring(0, 4), 10),
      month: parseInt(doneTime.substring(5, 7), 10),
      isValid: true,
      flagReason: null,
    };
  });

if (records.length > 0) {
  const BATCH = 50;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    await db.insert(pipedriveDemoActivities)
      .values(batch)
      .onDuplicateKeyUpdate({
        set: {
          subject: sql`VALUES(subject)`,
          orgName: sql`VALUES(orgName)`,
          dealId: sql`VALUES(dealId)`,
          dealTitle: sql`VALUES(dealTitle)`,
          doneDate: sql`VALUES(doneDate)`,
          year: sql`VALUES(year)`,
          month: sql`VALUES(month)`,
        },
      });
  }
  console.log(`✓ Upserted ${records.length} demo records for Tad`);
} else {
  console.log("No demo records to insert for Tad (he may not have any demos yet since joining Mar 15)");
}

// Also update pipedriveSync to handle Tad's name mismatch by storing pipedriveUserId
// For now, update the ae_profiles with a note
console.log("\nNote: Tad's Pipedrive display name is 'Tad' (ID: 25357905)");
console.log("Consider adding a pipedriveUserId column to ae_profiles to avoid name matching issues");

await connection.end();
