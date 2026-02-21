/**
 * Weekly Auto-Sync Scheduler
 *
 * Runs every Monday at 20:00 UTC (after the Sales Report is updated by 7pm).
 * Performs two operations in sequence:
 *   1. Spreadsheet sync  — pulls latest dials/demos from the Sales Report sheet
 *   2. Pipedrive sync    — pulls latest won deal ARR from Pipedrive
 *
 * Results are logged to the database in the sync_log table (if available)
 * and written to console for server-side visibility.
 *
 * The schedule can be overridden via the WEEKLY_SYNC_CRON env var.
 * Default: "0 20 * * 1"  (Monday 20:00 UTC)
 */

import cron from "node-cron";
import { getAllAeProfiles, getAeProfileById, getMetricsForMonth, upsertMonthlyMetric } from "./db";

// ─── Shared helpers (duplicated here to avoid circular imports) ───────────────

const SPREADSHEET_ID = "11HPOZ7mkkN-OwhlALdGWicQUzCI0Fkuq_tz9tl1N1qc";
const SHEET_GID = "321906789";
const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";
const TARGET_PIPELINE_IDS = [20, 12, 10]; // Machining, Closing SMB, Closing Enterprise

// ─── Google token reader ──────────────────────────────────────────────────────

function getGoogleAccessToken(): string | null {
  try {
    const fs = require("fs") as typeof import("fs");
    const configPath = process.env.GDRIVE_RCLONE_CONFIG || "/home/ubuntu/.gdrive-rclone.ini";
    const content = fs.readFileSync(configPath, "utf8");
    const match = content.match(/token\s*=\s*({[^\n]+})/);
    if (!match) return null;
    const tokenObj = JSON.parse(match[1]) as { access_token?: string };
    return tokenObj.access_token ?? null;
  } catch {
    return null;
  }
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

interface WeekRow {
  date: string;
  calYear: number;
  calMonth: number;
  weekNum: number;
  aeName: string;
  dialsPw: number;
  demosPw: number;
}

function parseSheetCsv(csv: string): WeekRow[] {
  const lines = csv.split("\n");
  const rows: WeekRow[] = [];
  let currentDate = "";
  let currentCalYear = 0;
  let currentCalMonth = 0;
  let currentWeekNum = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (cols.length < 11) continue;

    const dateStr = cols[0]?.trim();
    const weekStr = cols[2]?.trim();
    const aeName = cols[3]?.trim();

    if (weekStr && !isNaN(Number(weekStr))) {
      currentWeekNum = Number(weekStr);
      if (dateStr) {
        currentDate = dateStr;
        const parts = dateStr.split("/");
        if (parts.length === 3) {
          currentCalMonth = parseInt(parts[1], 10);
          currentCalYear = parseInt(parts[2], 10);
        }
      }
    }

    if (!aeName || currentWeekNum === 0) continue;

    const dialsPw = parseFloat(cols[4]?.trim() || "0") || 0;
    const demosPw = parseFloat(cols[10]?.trim() || "0") || 0;

    rows.push({
      date: currentDate,
      calYear: currentCalYear,
      calMonth: currentCalMonth,
      weekNum: currentWeekNum,
      aeName,
      dialsPw,
      demosPw,
    });
  }
  return rows;
}

interface MonthlyAggregate {
  aeName: string;
  calYear: number;
  calMonth: number;
  totalDials: number;
  totalDemos: number;
}

function aggregateByMonth(rows: WeekRow[]): MonthlyAggregate[] {
  const map = new Map<string, MonthlyAggregate>();
  for (const row of rows) {
    if (row.calYear === 0 || row.calMonth === 0) continue;
    const key = `${row.aeName}|${row.calYear}|${row.calMonth}`;
    if (!map.has(key)) {
      map.set(key, {
        aeName: row.aeName,
        calYear: row.calYear,
        calMonth: row.calMonth,
        totalDials: 0,
        totalDemos: 0,
      });
    }
    const entry = map.get(key)!;
    entry.totalDials += row.dialsPw;
    entry.totalDemos += row.demosPw;
  }
  return Array.from(map.values());
}

function filterLastNMonths(aggregates: MonthlyAggregate[], n: number): MonthlyAggregate[] {
  if (aggregates.length === 0) return [];
  const latest = aggregates.reduce((max, a) => {
    const v = a.calYear * 100 + a.calMonth;
    return v > max ? v : max;
  }, 0);
  const latestYear = Math.floor(latest / 100);
  const latestMonth = latest % 100;
  const cutoffDate = new Date(latestYear, latestMonth - 1 - (n - 1), 1);
  const cutoffYear = cutoffDate.getFullYear();
  const cutoffMonth = cutoffDate.getMonth() + 1;
  return aggregates.filter(
    (a) => a.calYear * 100 + a.calMonth >= cutoffYear * 100 + cutoffMonth
  );
}

// ─── FX rates ─────────────────────────────────────────────────────────────────

let fxCache: { rates: Record<string, number>; fetchedAt: number } | null = null;

async function getFxRates(): Promise<Record<string, number>> {
  if (fxCache && Date.now() - fxCache.fetchedAt < 3600_000) return fxCache.rates;
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    if (!res.ok) throw new Error("FX API error");
    const data = (await res.json()) as { rates: Record<string, number> };
    fxCache = { rates: data.rates, fetchedAt: Date.now() };
    return data.rates;
  } catch {
    return { GBP: 0.79, EUR: 0.92, USD: 1.0 };
  }
}

async function toUsd(value: number, currency: string): Promise<number> {
  if (currency === "USD") return value;
  const rates = await getFxRates();
  const rate = rates[currency.toUpperCase()];
  if (!rate) return value;
  return value / rate;
}

// ─── Pipedrive helpers ────────────────────────────────────────────────────────

interface PipedriveDeal {
  id: number;
  title: string;
  value: number;
  currency: string;
  won_time: string | null;
  close_time: string | null;
  pipeline_id: number;
  owner_name: string;
}

interface PipedriveUser {
  id: number;
  name: string;
}

async function pipedriveGetAll(
  endpoint: string,
  params: Record<string, string | number> = {}
): Promise<PipedriveDeal[]> {
  const apiKey = process.env.PIPEDRIVE_API_KEY;
  if (!apiKey) return [];

  const all: PipedriveDeal[] = [];
  let start = 0;
  const limit = 500;

  while (true) {
    const url = new URL(`${PIPEDRIVE_BASE}/${endpoint}`);
    url.searchParams.set("api_token", apiKey);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("start", String(start));
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }

    const res = await fetch(url.toString());
    if (!res.ok) break;

    const resp = (await res.json()) as {
      data: PipedriveDeal[] | null;
      additional_data?: { pagination?: { more_items_in_collection?: boolean } };
    };

    const data = resp.data || [];
    all.push(...data);

    if (!resp.additional_data?.pagination?.more_items_in_collection) break;
    start += limit;
  }

  return all;
}

async function findPipedriveUserId(aeName: string): Promise<number | null> {
  const apiKey = process.env.PIPEDRIVE_API_KEY;
  if (!apiKey) return null;

  const url = new URL(`${PIPEDRIVE_BASE}/users`);
  url.searchParams.set("api_token", apiKey);
  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const resp = (await res.json()) as { data: PipedriveUser[] | null };
  const users = resp.data || [];

  const exact = users.find((u) => u.name.toLowerCase() === aeName.toLowerCase());
  if (exact) return exact.id;

  const nameParts = aeName.toLowerCase().split(" ");
  const partial = users.find((u) => {
    const uParts = u.name.toLowerCase().split(" ");
    return nameParts.every((part) => uParts.some((up) => up.includes(part)));
  });
  return partial?.id ?? null;
}

// ─── Sync operations ──────────────────────────────────────────────────────────

interface SyncResult {
  timestamp: string;
  spreadsheetSync: {
    success: boolean;
    recordsUpdated: number;
    latestWeek: number;
    error?: string;
  };
  pipedriveSync: {
    success: boolean;
    recordsUpdated: number;
    skippedAes: string[];
    error?: string;
  };
}

async function runSpreadsheetSync(months = 2): Promise<SyncResult["spreadsheetSync"]> {
  try {
    const token =
      getGoogleAccessToken() ||
      process.env.GOOGLE_DRIVE_ACCESS_TOKEN ||
      process.env.GOOGLE_ACCESS_TOKEN;

    if (!token) {
      return { success: false, recordsUpdated: 0, latestWeek: 0, error: "No Google access token" };
    }

    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      return { success: false, recordsUpdated: 0, latestWeek: 0, error: `HTTP ${res.status}` };
    }

    const csv = await res.text();
    const rows = parseSheetCsv(csv);
    const latestWeek = rows.length > 0 ? Math.max(...rows.map((r) => r.weekNum)) : 0;
    const allAggs = aggregateByMonth(rows);
    const filtered = filterLastNMonths(allAggs, months);

    const allProfiles = await getAllAeProfiles();
    const nameToId = new Map(allProfiles.map((p) => [p.name.toLowerCase(), p.id]));

    let recordsUpdated = 0;

    for (const agg of filtered) {
      const aeId = nameToId.get(agg.aeName.toLowerCase());
      if (!aeId) continue; // Skip AEs not registered in the calculator

      const existing = await getMetricsForMonth(aeId, agg.calYear, agg.calMonth);
      await upsertMonthlyMetric({
        aeId,
        year: agg.calYear,
        month: agg.calMonth,
        arrUsd: existing?.arrUsd ?? "0",
        demosTotal: Math.round(agg.totalDemos),
        dialsTotal: Math.round(agg.totalDials),
        retentionRate: existing?.retentionRate ?? null,
      });
      recordsUpdated++;
    }

    return { success: true, recordsUpdated, latestWeek };
  } catch (err) {
    return {
      success: false,
      recordsUpdated: 0,
      latestWeek: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runPipedriveSync(months = 2): Promise<SyncResult["pipedriveSync"]> {
  if (!process.env.PIPEDRIVE_API_KEY) {
    return { success: false, recordsUpdated: 0, skippedAes: [], error: "No Pipedrive API key" };
  }

  try {
    const now = new Date();
    const toDate = now.toISOString().substring(0, 10);
    const fromDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
      .toISOString()
      .substring(0, 10);

    const allProfiles = await getAllAeProfiles();
    const skippedAes: string[] = [];
    let recordsUpdated = 0;

    for (const ae of allProfiles) {
      const pdUserId = await findPipedriveUserId(ae.name);
      if (!pdUserId) {
        skippedAes.push(ae.name);
        continue;
      }

      // Fetch won deals for this AE across all target pipelines
      const allDeals: PipedriveDeal[] = [];
      for (const pipelineId of TARGET_PIPELINE_IDS) {
        const deals = await pipedriveGetAll("deals", {
          pipeline_id: pipelineId,
          user_id: pdUserId,
          status: "won",
        });
        const filtered = deals.filter((d) => {
          const wonDate = (d.won_time || d.close_time || "").substring(0, 10);
          return wonDate >= fromDate && wonDate <= toDate;
        });
        allDeals.push(...filtered);
      }

      // Aggregate by month
      const monthMap = new Map<string, number>();
      for (const deal of allDeals) {
        const wonDate = (deal.won_time || deal.close_time || "").substring(0, 10);
        if (!wonDate) continue;
        const year = parseInt(wonDate.substring(0, 4), 10);
        const month = parseInt(wonDate.substring(5, 7), 10);
        const key = `${year}-${month}`;
        const valueUsd = await toUsd(deal.value || 0, deal.currency || "USD");
        monthMap.set(key, (monthMap.get(key) ?? 0) + valueUsd);
      }

      for (const [key, totalArrUsd] of Array.from(monthMap.entries())) {
        const [yearStr, monthStr] = key.split("-");
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const existing = await getMetricsForMonth(ae.id, year, month);
        await upsertMonthlyMetric({
          aeId: ae.id,
          year,
          month,
          arrUsd: String(Math.round(totalArrUsd)),
          demosTotal: existing?.demosTotal ?? 0,
          dialsTotal: existing?.dialsTotal ?? 0,
          retentionRate: existing?.retentionRate ?? null,
        });
        recordsUpdated++;
      }
    }

    return { success: true, recordsUpdated, skippedAes };
  } catch (err) {
    return {
      success: false,
      recordsUpdated: 0,
      skippedAes: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Main sync runner ─────────────────────────────────────────────────────────

export async function runWeeklySync(): Promise<SyncResult> {
  const timestamp = new Date().toISOString();
  console.log(`[WeeklySync] Starting sync at ${timestamp}`);

  const spreadsheetResult = await runSpreadsheetSync(2);
  console.log(
    `[WeeklySync] Spreadsheet sync: ${spreadsheetResult.success ? "✓" : "✗"} ` +
    `${spreadsheetResult.recordsUpdated} records, week ${spreadsheetResult.latestWeek}` +
    (spreadsheetResult.error ? ` — ${spreadsheetResult.error}` : "")
  );

  const pipedriveResult = await runPipedriveSync(2);
  console.log(
    `[WeeklySync] Pipedrive sync: ${pipedriveResult.success ? "✓" : "✗"} ` +
    `${pipedriveResult.recordsUpdated} records` +
    (pipedriveResult.skippedAes.length > 0 ? `, skipped: ${pipedriveResult.skippedAes.join(", ")}` : "") +
    (pipedriveResult.error ? ` — ${pipedriveResult.error}` : "")
  );

  const result: SyncResult = {
    timestamp,
    spreadsheetSync: spreadsheetResult,
    pipedriveSync: pipedriveResult,
  };

  console.log(`[WeeklySync] Complete.`);
  return result;
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

// Store last sync result in memory for the status endpoint
let lastSyncResult: SyncResult | null = null;
let nextSyncTime: Date | null = null;

export function getLastSyncResult(): SyncResult | null {
  return lastSyncResult;
}

export function getNextSyncTime(): Date | null {
  return nextSyncTime;
}

function computeNextMonday8pmUtc(): Date {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysUntilMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7 || 7;
  const next = new Date(now);
  next.setUTCDate(now.getUTCDate() + daysUntilMonday);
  next.setUTCHours(20, 0, 0, 0);
  // If it's Monday and before 8pm UTC, use today
  if (dayOfWeek === 1 && now.getUTCHours() < 20) {
    next.setUTCDate(now.getUTCDate());
  }
  return next;
}

export function startWeeklySyncScheduler(): void {
  // Default: Monday at 20:00 UTC
  // Override with WEEKLY_SYNC_CRON env var (e.g. "0 20 * * 1")
  const cronExpression = process.env.WEEKLY_SYNC_CRON || "0 20 * * 1";

  const task = cron.schedule(
    cronExpression,
    async () => {
      try {
        lastSyncResult = await runWeeklySync();
        nextSyncTime = computeNextMonday8pmUtc();
      } catch (err) {
        console.error("[WeeklySync] Unhandled error:", err);
      }
    },
    {
      timezone: "UTC",
    }
  );

  nextSyncTime = computeNextMonday8pmUtc();

  console.log(
    `[WeeklySync] Scheduler started. Next run: ${nextSyncTime.toISOString()} ` +
    `(cron: "${cronExpression}")`
  );

  // Keep a reference so it doesn't get GC'd
  void task;
}
