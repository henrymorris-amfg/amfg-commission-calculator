import { getAllAeProfiles, getMetricsForAe } from "../server/db";

async function main() {
  const profiles = await getAllAeProfiles();
  console.log("=== AE PROFILES ===");
  for (const p of profiles) {
    console.log(`ID:${p.id} | ${p.name} | joined:${p.joinDate} | TL:${p.isTeamLeader} | pipedriveId:${(p as any).pipedriveUserId ?? "null"}`);
  }

  console.log("\n=== MONTHLY METRICS (all rows) ===");
  for (const p of profiles) {
    const metrics = await getMetricsForAe(p.id, 24);
    console.log(`\n--- ${p.name} (aeId:${p.id}) ---`);
    if (metrics.length === 0) {
      console.log("  NO METRICS");
    }
    for (const m of metrics) {
      console.log(
        `  ${m.year}-${String(m.month).padStart(2, "0")} | demos:${m.demosTotal} | dials:${m.dialsTotal} | arr:$${m.arrUsd}`
      );
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
