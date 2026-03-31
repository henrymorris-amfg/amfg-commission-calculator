import fetch from 'node:fetch';

const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";
const API_KEY = process.env.PIPEDRIVE_API_KEY;

async function pipedriveGet(endpoint, params = {}) {
  const url = new URL(`${PIPEDRIVE_BASE}/${endpoint}`);
  url.searchParams.set("api_token", API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  
  const res = await fetch(url.toString());
  const data = await res.json();
  return data.data || [];
}

async function main() {
  // Find Tad's Pipedrive user ID
  const users = await pipedriveGet("users");
  const tadUser = users.find(u => u.name && u.name.includes("Tad"));
  
  if (!tadUser) {
    console.log('ERROR: Tad not found in Pipedrive users');
    return;
  }
  
  console.log('Tad Pipedrive User:', tadUser);
  
  // Search for Kavera deals
  const deals = await pipedriveGet("deals", {
    user_id: tadUser.id,
    status: "won",
  });
  
  console.log(`\nTotal won deals for Tad: ${deals.length}`);
  
  const kaveraDeals = deals.filter(d => d.title && d.title.toLowerCase().includes('kavera'));
  console.log(`Kavera deals: ${kaveraDeals.length}`);
  
  if (kaveraDeals.length > 0) {
    kaveraDeals.forEach(d => {
      console.log(`  - ID: ${d.id}, Title: ${d.title}, Won: ${d.won_time}, Value: ${d.value}`);
    });
  }
}

main().catch(console.error);
