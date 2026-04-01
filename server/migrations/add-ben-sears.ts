import { getDb } from "../db";
import { aeProfiles } from "../../drizzle/schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

/**
 * Migration: Add Ben Sears profile
 * Run with: pnpm tsx server/migrations/add-ben-sears.ts
 */
export async function addBenSears() {
  const db = await getDb();
  if (!db) {
    console.error("Failed to connect to database");
    process.exit(1);
  }

  try {
    // Check if Ben already exists
    const existing = await db
      .select()
      .from(aeProfiles)
      .where(eq(aeProfiles.name, "Ben Sears"));

    if (existing.length > 0) {
      console.log("✅ Ben Sears already exists with ID:", existing[0].id);
      process.exit(0);
    }

    // Hash the PIN
    const pinHash = await bcrypt.hash("1234", 10);

    // Insert Ben Sears
    await db.insert(aeProfiles).values({
      name: "Ben Sears",
      pinHash,
      joinDate: new Date("2026-04-01"),
      isTeamLeader: false,
      isActive: true,
    });

    // Get the inserted record
    const inserted = await db
      .select()
      .from(aeProfiles)
      .where(eq(aeProfiles.name, "Ben Sears"));

    console.log("✅ Ben Sears profile created successfully");
    console.log("   ID:", inserted[0]?.id);
    console.log("   Name: Ben Sears");
    console.log("   PIN: 1234");
    console.log("   Join Date: 2026-04-01");
    console.log("   Email: ben.sears@amfg.ai");
  } catch (error) {
    console.error("Failed to add Ben Sears:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addBenSears().then(() => process.exit(0));
}
