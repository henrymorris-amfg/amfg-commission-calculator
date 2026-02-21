/**
 * Spreadsheet Sync — Sales Report Google Sheet → monthly_metrics
 *
 * Reads the "Sales Report" Google Sheet (shared with the same Google account
 * as Google Drive) and aggregates weekly dials/demos into monthly totals per AE.
 *
 * The sheet is exported as CSV via the Drive API using the OAuth token stored
 * in the GOOGLE_ACCESS_TOKEN environment variable (injected by the Manus platform
 * via the Google Drive integration).
 *
 * Spreadsheet ID: 11HPOZ7mkkN-OwhlALdGWicQUzCI0Fkuq_tz9tl1N1qc
 * Sheet tab GID:  321906789
 *
 * Column layout (0-indexed):
 *   0  Last day of week  (dd/mm/yyyy — only set on the first row of each week group)
 *   1  month             (internal month counter — only set on the first row of each week group)
 *   2  week              (week number — only set on the first row of each week group)
 *   3  name              (AE name)
 *   4  dials pw          (dials that week)
 *  10  demos done pw     (demos done that week, excl duplicates/no deals)
 *  15  Team Lead         ("Y" if team leader)
 *  16  Number of weeks in Bus
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getAllAeProfiles,
  getAeProfileByName,
  createAeProfile,
  upsertMonthlyMetric,
} from "./db";
import * as bcrypt from "bcryptjs";

// ─── Constants ────────────────────────────────────────────────────────────────
const SPREADSHEET_ID = "11HPOZ7mkkN-OwhlALdGWicQUzCI0Fkuq_tz9tl1N1qc";
const SHEET_GID = "321906789";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface WeekRow {
  date: string;          // "dd/mm/yyyy"
  calYear: number;
  calMonth: number;      // 1-12
  weekNum: number;
  aeName: string;
  dialsPw: number;
  demosPw: number;
  isTeamLead: boolean;
  weeksInBiz: number | null;
}

export interface MonthlyAggregate {
  aeName: string;
  calYear: number;
  calMonth: number;
  totalDials: number;
  totalDemos: number;
  weeksCount: number;
  isTeamLead: boolean;
}

// ─── Fetch & Parse ────────────────────────────────────────────────────────────

/**
 * Read the Google OAuth access token from the rclone config file.
 * The Manus platform keeps this file fresh with a valid token.
 */
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

/**
 * Fetch the Sales Report sheet as CSV using the Google Drive export endpoint.
 * The access token is read from the rclone config file maintained by the
 * Manus platform, or from environment variables as a fallback.
 */
async function fetchSheetCsv(): Promise<string> {
  // Try rclone config first (most reliable on Manus platform)
  const token =
    getGoogleAccessToken() ||
    process.env.GOOGLE_DRIVE_ACCESS_TOKEN ||
    process.env.GOOGLE_ACCESS_TOKEN ||
    process.env.GDRIVE_TOKEN;

  if (!token) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Google Drive access token not available. Please ensure the Google Drive integration is connected.",
    });
  }

  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to fetch Sales Report sheet: ${res.status} ${res.statusText}`,
    });
  }

  return res.text();
}

/**
 * Parse the CSV and extract all week rows that have a week number.
 * The sheet has a merged-cell structure where date/month/week are only in the
 * first row of each week group. We carry them forward for subsequent AE rows.
 */
function parseSheetCsv(csv: string): WeekRow[] {
  const lines = csv.split("\n");
  if (lines.length < 2) return [];

  // Skip header row (index 0)
  const rows: WeekRow[] = [];
  let currentDate = "";
  let currentCalYear = 0;
  let currentCalMonth = 0;
  let currentWeekNum = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Simple CSV parse (values may be quoted)
    const cols = parseCsvLine(line);
    if (cols.length < 11) continue;

    const dateStr = cols[0]?.trim();
    const weekStr = cols[2]?.trim();
    const aeName = cols[3]?.trim();

    // If this row has a week number, update the current week context
    if (weekStr && !isNaN(Number(weekStr))) {
      currentWeekNum = Number(weekStr);
      if (dateStr) {
        currentDate = dateStr;
        // Parse dd/mm/yyyy
        const parts = dateStr.split("/");
        if (parts.length === 3) {
          currentCalMonth = parseInt(parts[1], 10);
          currentCalYear = parseInt(parts[2], 10);
        }
      }
    }

    // Skip rows without a valid AE name or week context
    if (!aeName || currentWeekNum === 0) continue;

    const dialsPw = parseFloat(cols[4]?.trim() || "0") || 0;
    const demosPw = parseFloat(cols[10]?.trim() || "0") || 0;
    const isTeamLead = cols[15]?.trim().toUpperCase() === "Y";
    const weeksInBizStr = cols[16]?.trim();
    const weeksInBiz = weeksInBizStr ? parseFloat(weeksInBizStr) || null : null;

    rows.push({
      date: currentDate,
      calYear: currentCalYear,
      calMonth: currentCalMonth,
      weekNum: currentWeekNum,
      aeName,
      dialsPw,
      demosPw,
      isTeamLead,
      weeksInBiz,
    });
  }

  return rows;
}

/**
 * Simple CSV line parser that handles quoted fields.
 */
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

/**
 * Aggregate weekly rows into monthly totals per AE.
 */
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
        weeksCount: 0,
        isTeamLead: row.isTeamLead,
      });
    }
    const entry = map.get(key)!;
    entry.totalDials += row.dialsPw;
    entry.totalDemos += row.demosPw;
    entry.weeksCount += 1;
    if (row.isTeamLead) entry.isTeamLead = true;
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      a.calYear * 100 + a.calMonth - (b.calYear * 100 + b.calMonth) ||
      a.aeName.localeCompare(b.aeName)
  );
}

/**
 * Filter to the last N calendar months of data.
 */
function filterLastNMonths(
  aggregates: MonthlyAggregate[],
  n: number
): MonthlyAggregate[] {
  if (aggregates.length === 0) return [];

  // Find the latest year/month in the data
  const latest = aggregates.reduce((max, a) => {
    const v = a.calYear * 100 + a.calMonth;
    return v > max ? v : max;
  }, 0);

  const latestYear = Math.floor(latest / 100);
  const latestMonth = latest % 100;

  // Compute the cutoff: n months before the latest
  const cutoffDate = new Date(latestYear, latestMonth - 1 - (n - 1), 1);
  const cutoffYear = cutoffDate.getFullYear();
  const cutoffMonth = cutoffDate.getMonth() + 1;

  return aggregates.filter(
    (a) =>
      a.calYear * 100 + a.calMonth >=
      cutoffYear * 100 + cutoffMonth
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const spreadsheetSyncRouter = router({
  /**
   * Preview what will be imported from the Sales Report sheet.
   * Returns the aggregated monthly data for the last 4 months.
   * Team leader only.
   */
  preview: publicProcedure
    .input(
      z.object({
        months: z.number().int().min(1).max(12).default(4),
      })
    )
    .query(async ({ input, ctx }) => {
      // Auth check — team leader only
      const { getAeIdFromCtx: _unused, ...rest } = ctx as any;
      const cookieHeader = (ctx as any).req?.headers?.["cookie"] as string | undefined;
      const match = cookieHeader?.match(/ae_session=([^;]+)/);
      const aeId = match ? (() => {
        try {
          const p = JSON.parse(Buffer.from(match[1], "base64url").toString());
          return typeof p.aeId === "number" ? p.aeId : null;
        } catch { return null; }
      })() : null;

      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });

      const { getAeProfileById: _getAe } = await import("./db");
      const profile = await _getAe(aeId);
      if (!profile?.isTeamLeader) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Team leader access required." });
      }

      const csv = await fetchSheetCsv();
      const rows = parseSheetCsv(csv);
      const allAggregates = aggregateByMonth(rows);
      const filtered = filterLastNMonths(allAggregates, input.months);

      // Check which AEs already have profiles
      const existingProfiles = await getAllAeProfiles();
      const existingNames = new Set(existingProfiles.map((p) => p.name));

      const allAeNames = Array.from(new Set(filtered.map((a) => a.aeName)));
      return {
        aggregates: filtered,
        newAeNames: allAeNames.filter((name) => !existingNames.has(name)),
        existingAeNames: allAeNames.filter((name) => existingNames.has(name)),
        latestWeek: rows.length > 0 ? Math.max(...rows.map((r) => r.weekNum)) : 0,
        totalRows: rows.length,
      };
    }),

  /**
   * Import the last N months of data from the Sales Report sheet.
   * Creates AE profiles for new AEs (with a default PIN of "0000" — they must
   * change it on first login) and upserts monthly metrics for all AEs.
   * Team leader only.
   */
  import: publicProcedure
    .input(
      z.object({
        months: z.number().int().min(1).max(12).default(4),
        defaultPin: z.string().length(4).regex(/^\d{4}$/).default("1234"),
        defaultJoinDate: z.string().default("2024-01-01"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Auth check — team leader only
      const cookieHeader = (ctx as any).req?.headers?.["cookie"] as string | undefined;
      const match = cookieHeader?.match(/ae_session=([^;]+)/);
      const aeId = match ? (() => {
        try {
          const p = JSON.parse(Buffer.from(match[1], "base64url").toString());
          return typeof p.aeId === "number" ? p.aeId : null;
        } catch { return null; }
      })() : null;

      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });

      const { getAeProfileById: _getAe } = await import("./db");
      const profile = await _getAe(aeId);
      if (!profile?.isTeamLeader) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Team leader access required." });
      }

      const csv = await fetchSheetCsv();
      const rows = parseSheetCsv(csv);
      const allAggregates = aggregateByMonth(rows);
      const filtered = filterLastNMonths(allAggregates, input.months);

      const createdAes: string[] = [];
      const updatedMetrics: string[] = [];

      // Build a name → id map, creating profiles for new AEs
      const nameToId = new Map<string, number>();
      const uniqueNames = Array.from(new Set(filtered.map((a) => a.aeName)));

      for (const name of uniqueNames) {
        let existing = await getAeProfileByName(name);
        if (!existing) {
          const pinHash = await bcrypt.hash(input.defaultPin, 10);
          const newId = await createAeProfile({
            name,
            pinHash,
            joinDate: new Date(input.defaultJoinDate),
            isTeamLeader: false,
          });
          nameToId.set(name, newId);
          createdAes.push(name);
        } else {
          nameToId.set(name, existing.id);
        }
      }

      // Upsert monthly metrics
      for (const agg of filtered) {
        const profileId = nameToId.get(agg.aeName);
        if (!profileId) continue;

        await upsertMonthlyMetric({
          aeId: profileId,
          year: agg.calYear,
          month: agg.calMonth,
          arrUsd: "0",       // ARR comes from Pipedrive — not in this sheet
          demosTotal: Math.round(agg.totalDemos),
          dialsTotal: Math.round(agg.totalDials),
          retentionRate: null, // Not in this sheet
        });

        updatedMetrics.push(`${agg.aeName} ${agg.calYear}-${String(agg.calMonth).padStart(2, "0")}`);
      }

      return {
        success: true,
        createdAes,
        updatedMetrics,
        totalImported: filtered.length,
      };
    }),

  /**
   * Get the current Google Drive token status (for debugging).
   */
  tokenStatus: publicProcedure.query(async () => {
    const token =
      process.env.GOOGLE_DRIVE_ACCESS_TOKEN ||
      process.env.GOOGLE_ACCESS_TOKEN ||
      process.env.GDRIVE_TOKEN;
    return {
      hasToken: !!token,
      tokenPrefix: token ? token.substring(0, 20) + "..." : null,
    };
  }),
});
