/**
 * Fix demo data for all AEs by pulling full history from Pipedrive.
 * This script fetches all completed demo activities from Pipedrive for each AE
 * from their join date onwards, and updates the monthly_metrics table.
 * 
 * Run with: node scripts/fix-demos.mjs
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from .env file if present
try {
  const envContent = readFileSync(join(__dirname, '../.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
} catch {}

// Also try reading from /home/ubuntu/.user_env
try {
  const envContent = readFileSync('/home/ubuntu/.user_env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {}

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!PIPEDRIVE_API_KEY) {
  console.error('ERROR: PIPEDRIVE_API_KEY not set');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set');
  process.exit(1);
}

console.log('API key prefix:', PIPEDRIVE_API_KEY.substring(0, 10) + '...');
console.log('DB URL prefix:', DATABASE_URL.substring(0, 30) + '...');

// ─── Pipedrive helpers ────────────────────────────────────────────────────────

async function pipedriveGet(endpoint, params = {}) {
  const url = new URL(`https://api.pipedrive.com/v1/${endpoint}`);
  url.searchParams.set('api_token', PIPEDRIVE_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Pipedrive API error: ${res.status} for ${endpoint}`);
  return res.json();
}

async function fetchAllDemosForUser(pipedriveUserId, fromDate, toDate) {
  // Fetch all completed demo activities (paginated)
  const all = [];
  let start = 0;
  const limit = 500;
  
  while (true) {
    const resp = await pipedriveGet('activities', {
      user_id: pipedriveUserId,
      type: 'demo',
      done: 1,
      limit,
      start,
    });
    
    const data = resp.data || [];
    all.push(...data);
    
    const more = resp.additional_data?.pagination?.more_items_in_collection;
    if (!more || data.length === 0) break;
    start += limit;
  }
  
  // Filter by date range using marked_as_done_time
  return all.filter(a => {
    const doneTime = a.marked_as_done_time || a.due_date;
    if (!doneTime) return false;
    const doneDate = doneTime.substring(0, 10);
    return doneDate >= fromDate && doneDate <= toDate;
  });
}

function aggregateDemosByMonth(demos) {
  const map = new Map();
  for (const demo of demos) {
    const doneTime = demo.marked_as_done_time || demo.due_date;
    if (!doneTime) continue;
    const year = parseInt(doneTime.substring(0, 4), 10);
    const month = parseInt(doneTime.substring(5, 7), 10);
    const key = `${year}-${month}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

// ─── Database helpers ─────────────────────────────────────────────────────────

let db = null;

async function getDb() {
  if (db) return db;
  const { drizzle } = await import('drizzle-orm/mysql2');
  db = drizzle(DATABASE_URL);
  return db;
}

async function getMetricsForMonth(aeId, year, month) {
  const { drizzle } = await import('drizzle-orm/mysql2');
  const { eq, and } = await import('drizzle-orm');
  const { monthlyMetrics } = await import('../drizzle/schema.js');
  const d = await getDb();
  const result = await d.select().from(monthlyMetrics)
    .where(and(eq(monthlyMetrics.aeId, aeId), eq(monthlyMetrics.year, year), eq(monthlyMetrics.month, month)))
    .limit(1);
  return result[0] || null;
}

async function updateDemosForMonth(aeId, year, month, demosTotal) {
  const { eq, and } = await import('drizzle-orm');
  const { monthlyMetrics } = await import('../drizzle/schema.js');
  const d = await getDb();
  
  const existing = await getMetricsForMonth(aeId, year, month);
  
  if (existing) {
    // Update existing row — only update demos fields
    await d.update(monthlyMetrics)
      .set({ 
        demosTotal,
        demosFromPipedrive: demosTotal,
      })
      .where(and(eq(monthlyMetrics.aeId, aeId), eq(monthlyMetrics.year, year), eq(monthlyMetrics.month, month)));
    return 'updated';
  } else {
    // Insert new row
    await d.insert(monthlyMetrics).values({
      aeId,
      year,
      month,
      arrUsd: '0',
      demosTotal,
      demosFromPipedrive: demosTotal,
      dialsTotal: 0,
      retentionRate: null,
    }).onDuplicateKeyUpdate({ set: { demosTotal, demosFromPipedrive: demosTotal } });
    return 'inserted';
  }
}

// ─── AE configuration ─────────────────────────────────────────────────────────

const AE_CONFIG = [
  { aeId: 30000, name: 'Henry Morris', joinDate: '2025-01-01', pipedriveId: 15871239 },
  { aeId: 30001, name: 'Joe Payne', joinDate: '2025-06-16', pipedriveId: 23861740 },
  { aeId: 30002, name: 'Toby Greer', joinDate: '2025-07-28', pipedriveId: 24052953 },
  { aeId: 30003, name: 'Julian Earl', joinDate: '2026-02-04', pipedriveId: 25094488 },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

const today = new Date().toISOString().substring(0, 10);

console.log('\n=== Fixing demo data for all AEs ===\n');

for (const ae of AE_CONFIG) {
  console.log(`\n--- ${ae.name} (AE ID: ${ae.aeId}) ---`);
  console.log(`  Join date: ${ae.joinDate}`);
  console.log(`  Pipedrive ID: ${ae.pipedriveId}`);
  
  try {
    const demos = await fetchAllDemosForUser(ae.pipedriveId, ae.joinDate, today);
    console.log(`  Total completed demos found: ${demos.length}`);
    
    const byMonth = aggregateDemosByMonth(demos);
    
    if (byMonth.size === 0) {
      console.log('  No demos found for this AE.');
      continue;
    }
    
    for (const [key, count] of Array.from(byMonth.entries()).sort()) {
      const [year, month] = key.split('-').map(Number);
      const weeksInMonth = 4.33; // approximate
      const perWeek = (count / weeksInMonth).toFixed(1);
      
      const action = await updateDemosForMonth(ae.aeId, year, month, count);
      console.log(`  ${key}: ${count} demos (${perWeek}/wk) — ${action}`);
    }
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }
}

console.log('\n=== Done! ===\n');
console.log('Now re-import deals to recalculate tiers with correct demo data.');
process.exit(0);
