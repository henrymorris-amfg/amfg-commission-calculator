import mysql from 'mysql2/promise';

const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";

async function pipedriveGet(endpoint, params = {}) {
  const url = new URL(`${PIPEDRIVE_BASE}/${endpoint}`);
  url.searchParams.set("api_token", process.env.PIPEDRIVE_API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  
  const res = await fetch(url.toString());
  const data = await res.json();
  return data.data || [];
}

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL);
  const conn = await pool.getConnection();
  
  // Get Tad's profile
  const [tadRows] = await conn.execute('SELECT id, name FROM ae_profiles WHERE name = "Tad Tamulevicius"');
  const tad = tadRows[0];
  console.log('Tad:', tad);
  
  // Try to find Tad's Pipedrive user ID
  const users = await pipedriveGet("users");
  const tadUser = users.find(u => u.name === "Tad Tamulevicius");
  console.log('Tad Pipedrive User:', tadUser);
  
  if (!tadUser) {
    console.log('ERROR: Tad not found in Pipedrive users');
    console.log('Available users:', users.map(u => u.name).join(', '));
    conn.release();
    pool.end();
    return;
  }
  
  // Fetch Tad's completed demos
  const activities = await pipedriveGet("activities", {
    user_id: tadUser.id,
    type: "demo",
    done: 1,
  });
  
  console.log(`Found ${activities.length} completed demos for Tad in Pipedrive`);
  
  // Filter for March 2026
  const marchDemos = activities.filter(a => {
    if (!a.marked_as_done_time) return false;
    const doneDate = a.marked_as_done_time.substring(0, 10);
    return doneDate >= "2026-03-01" && doneDate <= "2026-03-31";
  });
  
  console.log(`March 2026 demos: ${marchDemos.length}`);
  marchDemos.forEach(d => {
    console.log(`  - ${d.subject} (${d.marked_as_done_time})`);
  });
  
  conn.release();
  pool.end();
}

main().catch(console.error);
