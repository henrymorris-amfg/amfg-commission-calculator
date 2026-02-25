import mysql from 'mysql2/promise';

const url = new URL(process.env.DATABASE_URL);
const connection = await mysql.createConnection({
  host: url.hostname,
  port: url.port,
  user: url.username,
  password: url.password.split('@')[0],
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

// All 17 mismatches with correct tiers
const fixes = [
  { id: 90054, tier: 'silver' },  // Keymet Ab Oy
  { id: 90051, tier: 'silver' },  // McAllister Tool & Machine
  { id: 90059, tier: 'silver' },  // Bridge - EU sro
  { id: 90061, tier: 'silver' },  // Modern Aluminum
  { id: 90057, tier: 'silver' },  // Stoba
  { id: 90058, tier: 'silver' },  // ACME Machine & Weld
  { id: 90063, tier: 'silver' },  // KL Engineering
  { id: 90064, tier: 'silver' },  // Tower Machining
  { id: 90065, tier: 'silver' },  // Apollo Precision
  { id: 90066, tier: 'bronze' },  // MAKEFAST LIMITED
  { id: 90060, tier: 'bronze' },  // Recknagel
  { id: 90062, tier: 'bronze' },  // C-axis
  { id: 90049, tier: 'bronze' },  // Machine Tool Engineering
  { id: 90070, tier: 'bronze' },  // Advanced 3D (Toby)
  { id: 90068, tier: 'bronze' },  // JODDB (Toby)
  { id: 90069, tier: 'bronze' },  // Printerior (Toby)
  { id: 90071, tier: 'bronze' }   // Nutechnologies (Toby)
];

console.log(`Fixing ${fixes.length} tier mismatches...\n`);

let fixed = 0;
for (const fix of fixes) {
  await connection.execute(
    "UPDATE deals SET tierAtStart = ? WHERE id = ?",
    [fix.tier, fix.id]
  );
  fixed++;
}

console.log(`✓ Fixed ${fixed} deals\n`);

// Verify fixes
const [updated] = await connection.execute(
  "SELECT id, customerName, tierAtStart FROM deals WHERE id IN (90054, 90051, 90059, 90061, 90057, 90058, 90063, 90064, 90065, 90066, 90060, 90062, 90049, 90070, 90068, 90069, 90071) ORDER BY id"
);

console.log("Verification:");
updated.forEach(d => {
  console.log(`  ID ${d.id}: ${d.customerName.padEnd(35)} → ${d.tierAtStart.toUpperCase()}`);
});

await connection.end();
