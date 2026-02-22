import { getActiveCommissionStructure } from "../server/db";

async function main() {
  const s = await getActiveCommissionStructure();
  if (!s) { console.log("No active structure"); process.exit(0); }
  console.log("Commission structure ID:", s.id, "| Label:", s.versionLabel);
  console.log("Rates: Bronze=" + s.bronzeRate + " Silver=" + s.silverRate + " Gold=" + s.goldRate);
  console.log("Standard Targets:", JSON.stringify(s.standardTargets, null, 2));
  console.log("Team Leader Targets:", JSON.stringify(s.teamLeaderTargets, null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
