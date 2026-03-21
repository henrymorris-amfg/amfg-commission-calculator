import * as bcrypt from "bcryptjs";

// Generate PIN hash for Tad
// Using PIN: 1234 (temporary, should be changed on first login)
const pin = "1234";
const saltRounds = 10;

async function addTad() {
  try {
    const pinHash = await bcrypt.hash(pin, saltRounds);
    console.log("PIN Hash:", pinHash);
    console.log("\nSQL to insert Tad:");
    console.log(`INSERT INTO ae_profiles (name, pinHash, joinDate, isTeamLeader, isActive) VALUES ('Tad Tamulevicius', '${pinHash}', '2026-03-15', 0, 1);`);
    console.log("\nTemporary PIN for Tad: 1234");
    console.log("Email: tad.tamulevicius@amfg.ai");
  } catch (error) {
    console.error("Error:", error);
  }
}

addTad();
