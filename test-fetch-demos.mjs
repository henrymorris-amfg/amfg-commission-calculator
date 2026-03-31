import fetch from "node-fetch";

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY;
const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";

async function pipedriveGet(endpoint, params = {}) {
  const url = new URL(`${PIPEDRIVE_BASE}/${endpoint}`);
  url.searchParams.set("api_token", PIPEDRIVE_API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  
  const res = await fetch(url.toString());
  return res.json();
}

async function pipedriveGetAll(endpoint, params = {}) {
  const all = [];
  let start = 0;
  const limit = 500;
  
  while (true) {
    const resp = await pipedriveGet(endpoint, {
      ...params,
      limit,
      start,
    });
    
    const data = resp.data || [];
    all.push(...data);
    console.log(`Fetched ${data.length} items (total: ${all.length})`);
    
    const more = resp.additional_data?.pagination?.more_items_in_collection;
    if (!more) break;
    start += limit;
  }
  
  return all;
}

async function fetchCompletedDemosForUser(pipedriveUserId, fromDate, toDate) {
  const activities = await pipedriveGetAll("activities", {
    user_id: pipedriveUserId,
    type: "demo",
    done: 1,
  });
  
  console.log(`Total activities from Pipedrive: ${activities.length}`);
  
  const filtered = activities.filter(a => {
    const doneTime = a.marked_as_done_time;
    if (!doneTime) return false;
    const doneDate = doneTime.substring(0, 10);
    return doneDate >= fromDate && doneDate <= toDate;
  });
  
  console.log(`Filtered to date range [${fromDate}, ${toDate}]: ${filtered.length}`);
  
  return filtered;
}

async function main() {
  const pdUserId = 25357905; // Tad
  const fromDate = "2026-03-15"; // Tad's join date
  const toDate = "2026-03-31";
  
  const demos = await fetchCompletedDemosForUser(pdUserId, fromDate, toDate);
  
  console.log(`\nFinal result: ${demos.length} demos`);
  demos.forEach((d, i) => {
    console.log(`  ${i+1}. ${d.subject} - ${d.marked_as_done_time}`);
  });
}

main().catch(console.error);
