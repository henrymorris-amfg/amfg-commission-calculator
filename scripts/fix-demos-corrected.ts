/**
 * Pull correct demo counts from Pipedrive for all AEs using the server's own helpers.
 * Correct AE IDs:
 *   ID:1     = Henry Morris  (team leader — skip)
 *   ID:30002 = Joe Payne
 *   ID:30003 = Julian Earl
 *   ID:30004 = Toby Greer
 */

import { upsertMonthlyMetric, getMetricsForAe, getAllAeProfiles } from "../server/db";
import { findPipedriveUserId, fetchCompletedDemosForUser } from "../server/pipedriveSync";

async function main() {
  console.log("=== Fixing demo counts from Pipedrive (using server helpers) ===\n");

  const profiles = await getAllAeProfiles();

  for (const profile of profiles) {
    if (profile.isTeamLeader) {
      console.log(`Skipping ${profile.name} (team leader — data looks correct)`);
      continue;
    }

    const pdUserId = await findPipedriveUserId(profile.name);
    if (!pdUserId) {
      console.log(`Could not find Pipedrive user for ${profile.name}`);
      continue;
    }

    console.log(`\n--- ${profile.name} (AE ID: ${profile.id}, Pipedrive ID: ${pdUserId}) ---`);

    const joinDate = new Date(profile.joinDate);
    const fromDate = joinDate.toISOString().substring(0, 10);
    const toDate = new Date().toISOString().substring(0, 10);

    // Fetch all completed demos from Pipedrive
    const demos = await fetchCompletedDemosForUser(pdUserId, fromDate, toDate);
    console.log(`  Total demos from Pipedrive: ${demos.length}`);

    // Aggregate by month
    const monthlyDemos = new Map<string, number>();
    for (const demo of demos) {
      const doneTime = demo.marked_as_done_time;
      if (!doneTime) continue;
      const year = parseInt(doneTime.substring(0, 4), 10);
      const month = parseInt(doneTime.substring(5, 7), 10);
      const key = `${year}-${month}`;
      monthlyDemos.set(key, (monthlyDemos.get(key) ?? 0) + 1);
    }

    // Get existing metrics to preserve ARR and dials
    const existing = await getMetricsForAe(profile.id, 24);
    const existingMap = new Map(existing.map((m) => [`${m.year}-${m.month}`, m]));

    // Iterate all months from join date to now
    let year = joinDate.getFullYear();
    let month = joinDate.getMonth() + 1;
    const now = new Date();

    while (year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth() + 1)) {
      const key = `${year}-${month}`;
      const demoCount = monthlyDemos.get(key) ?? 0;
      const existingRow = existingMap.get(key);

      await upsertMonthlyMetric({
        aeId: profile.id,
        year,
        month,
        arrUsd: existingRow ? String(existingRow.arrUsd) : "0",
        demosTotal: demoCount,
        demosFromPipedrive: demoCount,
        dialsTotal: existingRow ? existingRow.dialsTotal : 0,
        retentionRate: existingRow?.retentionRate ?? null,
      });

      console.log(`  ${year}-${String(month).padStart(2, "0")}: ${demoCount} demos`);

      month++;
      if (month > 12) { month = 1; year++; }
    }
  }

  console.log("\n=== Final verification ===\n");
  for (const profile of profiles) {
    const metrics = await getMetricsForAe(profile.id, 24);
    console.log(`\n${profile.name} (ID:${profile.id}):`);
    for (const m of metrics) {
      console.log(`  ${m.year}-${String(m.month).padStart(2,"0")} | demos:${m.demosTotal} | dials:${m.dialsTotal} | arr:$${m.arrUsd}`);
    }
  }

  console.log("\n=== Done! ===");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
