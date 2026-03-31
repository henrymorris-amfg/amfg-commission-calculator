import fetch from "node-fetch";

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY;
const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";

async function pipedriveGet(endpoint) {
  const url = `${PIPEDRIVE_BASE}/${endpoint}?api_token=${PIPEDRIVE_API_KEY}`;
  const resp = await fetch(url);
  return resp.json();
}

async function findPipedriveUserId(aeName) {
  const resp = await pipedriveGet("users");
  const users = resp.data || [];
  console.log(`Looking for user: "${aeName}" among ${users.length} Pipedrive users`);
  
  // Exact match first
  const exact = users.find(u => u.name.toLowerCase() === aeName.toLowerCase());
  if (exact) {
    console.log(`Found exact match: ${exact.name} (ID: ${exact.id})`);
    return exact.id;
  }
  
  // Partial match
  const nameParts = aeName.toLowerCase().split(" ");
  const partial = users.find(u => {
    const uParts = u.name.toLowerCase().split(" ");
    return nameParts.every(part => uParts.some(up => up.includes(part)));
  });
  if (partial) {
    console.log(`Found partial match: ${partial.name} (ID: ${partial.id})`);
    return partial.id;
  }
  
  console.log(`No user found for "${aeName}"`);
  console.log("Available users:", users.map(u => `${u.name} (${u.id})`).join(", "));
  return null;
}

async function fetchCompletedDemosForUser(pdUserId, fromDate, toDate) {
  console.log(`Fetching demos for user ${pdUserId} from ${fromDate} to ${toDate}`);
  
  const resp = await pipedriveGet(
    `activities?user_id=${pdUserId}&type=demo&done=1&limit=500&start=0`
  );
  
  const activities = resp.data || [];
  console.log(`Found ${activities.length} demo activities`);
  
  const filtered = activities.filter(d => {
    if (!d.marked_as_done_time) return false;
    const doneDate = d.marked_as_done_time.substring(0, 10);
    return doneDate >= fromDate && doneDate <= toDate;
  });
  
  console.log(`Filtered to ${filtered.length} demos in date range`);
  
  filtered.forEach((d, i) => {
    console.log(`  ${i+1}. ${d.subject || "(no subject)"} - ${d.marked_as_done_time}`);
  });
  
  return filtered;
}

async function main() {
  const pdUserId = await findPipedriveUserId("Tad Tamulevicius");
  if (!pdUserId) {
    console.log("Could not find Tad's Pipedrive user ID");
    return;
  }
  
  const fromDate = "2026-01-01";
  const toDate = "2026-03-31";
  const demos = await fetchCompletedDemosForUser(pdUserId, fromDate, toDate);
  
  console.log(`\nTotal demos found: ${demos.length}`);
}

main().catch(console.error);
