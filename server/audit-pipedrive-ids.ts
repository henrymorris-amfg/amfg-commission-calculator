import { getDb, getAllAeProfiles } from "./db.js";

async function main() {
  const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY;
  const res = await fetch(`https://api.pipedrive.com/v1/users?api_token=${PIPEDRIVE_API_KEY}&limit=100`);
  const data = await res.json() as any;

  if (!data.success) {
    console.error("Pipedrive API error:", data);
    process.exit(1);
  }

  const pdUsers: Array<{ id: number; name: string; email: string; active_flag: boolean }> = data.data;
  console.log("=== PIPEDRIVE USERS (active) ===");
  pdUsers.filter((u: any) => u.active_flag).forEach((u: any) => {
    console.log(`  ID: ${u.id} | Name: ${u.name} | Email: ${u.email}`);
  });

  const aes = await getAllAeProfiles(true);
  console.log("\n=== DB AEs ===");
  aes.forEach((ae: any) => {
    console.log(`  DB ID: ${ae.id} | Name: ${ae.name} | pipedriveUserId: ${ae.pipedriveUserId}`);
  });

  console.log("\n=== AUDIT RESULTS ===");
  for (const ae of aes) {
    if (!ae.pipedriveUserId) {
      console.log(`  ⚠️  ${ae.name}: NO Pipedrive user ID set`);
      // Try to find by name
      const nameParts = ae.name.toLowerCase().split(" ");
      const match = pdUsers.find(u => nameParts.every((p: string) => u.name.toLowerCase().includes(p)));
      if (match) {
        console.log(`     → Likely match: ID=${match.id} Name="${match.name}"`);
      }
      continue;
    }
    const pdUser = pdUsers.find(u => u.id === ae.pipedriveUserId);
    if (!pdUser) {
      console.log(`  ❌ ${ae.name}: pipedriveUserId=${ae.pipedriveUserId} NOT FOUND in Pipedrive`);
      const nameParts = ae.name.toLowerCase().split(" ");
      const match = pdUsers.find(u => nameParts.every((p: string) => u.name.toLowerCase().includes(p)));
      if (match) {
        console.log(`     → Likely match: ID=${match.id} Name="${match.name}"`);
      }
    } else {
      console.log(`  ✅ ${ae.name}: pipedriveUserId=${ae.pipedriveUserId} matches "${pdUser.name}"`);
    }
  }
}

main().catch(console.error);
