/**
 * VOIP Studio Sync — Pull real dialling data from VoIPstudio CDRs
 *
 * Features:
 *   1. Weekly dials per AE   — outbound CDR count per user per week/month
 *   2. Connection rate        — connected / total_dials
 *   3. Talk time per week     — total billsec per AE
 *   4. Real-time dial count   — today's dials for the logged-in AE
 *   5. Auto-populate metrics  — replace spreadsheet dials with VOIP Studio data
 *
 * The VOIP Studio API uses a JSON-encoded `filter` query parameter:
 *   filter=[{"property":"calldate","operator":"gte","value":"2026-02-16 00:00:00"}, ...]
 *
 * API base: https://l7api.com/v1.2/voipstudio
 * Auth: X-Auth-Token header
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { getAeIdFromCtx } from "./aeAuth";
import {
  getAllAeProfiles,
  getAeProfileById,
  getMetricsForMonth,
  upsertMonthlyMetric,
} from "./db";

// ─── Constants ────────────────────────────────────────────────────────────────

const VOIP_BASE = "https://l7api.com/v1.2/voipstudio";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoipUser {
  i: number;       // user id
  name: string;
  extension: string;
}

interface VoipCdr {
  id: number;
  calldate: string;
  user_id: number;
  src_name: string;
  dst: string;
  dst_name: string;
  type: string;       // "O" = outbound, "I" = inbound
  disposition: string; // "CONNECTED", "NO ANSWER", "BUSY", "FAILED"
  duration: number;    // total seconds
  billsec: number;     // connected talk seconds
  charge: string;
}

interface AeDialStats {
  aeName: string;
  aeId: number;
  voipUserId: number;
  totalDials: number;
  connected: number;
  notConnected: number;
  connectionRate: number; // 0-100
  totalTalkTimeSecs: number;
  totalTalkTimeFormatted: string;
}

interface MonthlyDialAggregate {
  aeName: string;
  aeId: number;
  voipUserId: number;
  year: number;
  month: number;
  totalDials: number;
  connected: number;
  connectionRate: number;
  totalTalkTimeSecs: number;
}

// ─── VOIP Studio API helpers ─────────────────────────────────────────────────

function getVoipApiKey(): string {
  const key = process.env.VOIP_STUDIO_API_KEY;
  if (!key) throw new Error("VOIP_STUDIO_API_KEY not set");
  return key;
}

function buildFilter(filters: Array<{ property: string; operator: string; value: string | number }>): string {
  return JSON.stringify(filters);
}

async function voipGet<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> {
  const apiKey = getVoipApiKey();
  const url = new URL(`${VOIP_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { "X-Auth-Token": apiKey },
  });
  if (!res.ok) {
    throw new Error(`VOIP API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Get all VOIP Studio users (contacts/extensions) */
async function getVoipUsers(): Promise<Array<{ id: number; name: string; extension: string }>> {
  // The /users endpoint returns: { id, first_name, last_name, ext, email, active, ... }
  const data = await voipGet<{ data: Array<{ id: number; first_name: string; last_name: string; ext: string; active: boolean }> }>(
    "users",
    { limit: 100 }
  );
  return (data.data || [])
    .filter((u) => u.active !== false) // only active users
    .map((u) => ({
      id: u.id,
      name: `${u.first_name} ${u.last_name}`.trim(),
      extension: u.ext || "",
    }));
}

/** Find a VOIP Studio user ID by AE name (fuzzy match) */
async function findVoipUserId(aeName: string): Promise<number | null> {
  const users = await getVoipUsers();
  // Exact match first
  const exact = users.find((u) => u.name.toLowerCase() === aeName.toLowerCase());
  if (exact) return exact.id;
  // Partial match
  const nameParts = aeName.toLowerCase().split(" ");
  const partial = users.find((u) => {
    const uParts = u.name.toLowerCase().split(" ");
    return nameParts.every((part) => uParts.some((up) => up.includes(part)));
  });
  return partial?.id ?? null;
}

/** Get outbound CDR count for a specific user in a date range */
async function getDialCount(
  userId: number,
  dateFrom: string,
  dateTo: string
): Promise<{ total: number; connected: number; talkTimeSecs: number }> {
  // Get total outbound dials
  const totalFilter = buildFilter([
    { property: "calldate", operator: "gte", value: `${dateFrom} 00:00:00` },
    { property: "calldate", operator: "lte", value: `${dateTo} 23:59:59` },
    { property: "type", operator: "eq", value: "O" },
    { property: "user_id", operator: "eq", value: userId },
  ]);
  const totalData = await voipGet<{ total: number }>("cdrs", { filter: totalFilter, limit: 1 });

  // Get connected dials
  const connFilter = buildFilter([
    { property: "calldate", operator: "gte", value: `${dateFrom} 00:00:00` },
    { property: "calldate", operator: "lte", value: `${dateTo} 23:59:59` },
    { property: "type", operator: "eq", value: "O" },
    { property: "user_id", operator: "eq", value: userId },
    { property: "disposition", operator: "eq", value: "CONNECTED" },
  ]);
  const connData = await voipGet<{ total: number; data: VoipCdr[] }>("cdrs", { filter: connFilter, limit: 1000 });

  // Sum talk time from connected calls — we need to paginate if > 1000
  let talkTimeSecs = 0;
  const connectedTotal = connData.total || 0;

  if (connectedTotal <= 1000) {
    // All in one page
    for (const cdr of connData.data || []) {
      talkTimeSecs += cdr.billsec || 0;
    }
  } else {
    // Need to paginate to sum all billsec
    for (const cdr of connData.data || []) {
      talkTimeSecs += cdr.billsec || 0;
    }
    let page = 2;
    let fetched = (connData.data || []).length;
    while (fetched < connectedTotal) {
      const pageData = await voipGet<{ data: VoipCdr[] }>("cdrs", {
        filter: connFilter,
        limit: 1000,
        page,
      });
      for (const cdr of pageData.data || []) {
        talkTimeSecs += cdr.billsec || 0;
      }
      fetched += (pageData.data || []).length;
      page++;
    }
  }

  return {
    total: totalData.total || 0,
    connected: connectedTotal,
    talkTimeSecs,
  };
}

function formatTalkTime(secs: number): string {
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m ${s}s`;
}

function formatDate(d: Date): string {
  return d.toISOString().substring(0, 10);
}

// ─── Exported helper for weeklySync ──────────────────────────────────────────

export interface VoipMonthlyData {
  aeName: string;
  aeId: number;
  year: number;
  month: number;
  totalDials: number;
  connected: number;
  connectionRate: number;
  totalTalkTimeSecs: number;
}

/**
 * Pull monthly dial data from VOIP Studio for all registered AEs.
 * Used by the weekly auto-sync and the manual sync page.
 */
export async function pullVoipMonthlyData(months: number): Promise<{
  data: VoipMonthlyData[];
  unmatchedAes: string[];
}> {
  const allProfiles = await getAllAeProfiles();
  const results: VoipMonthlyData[] = [];
  const unmatchedAes: string[] = [];

  const now = new Date();

  for (const ae of allProfiles) {
    const voipUserId = await findVoipUserId(ae.name);
    if (!voipUserId) {
      unmatchedAes.push(ae.name);
      continue;
    }

    // For each month in the range
    for (let i = 0; i < months; i++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;
      const firstDay = formatDate(new Date(year, month - 1, 1));
      const lastDay = formatDate(new Date(year, month, 0)); // last day of month

      const stats = await getDialCount(voipUserId, firstDay, lastDay);
      const connectionRate = stats.total > 0 ? Math.round((stats.connected / stats.total) * 10000) / 100 : 0;

      results.push({
        aeName: ae.name,
        aeId: ae.id,
        year,
        month,
        totalDials: stats.total,
        connected: stats.connected,
        connectionRate,
        totalTalkTimeSecs: stats.talkTimeSecs,
      });
    }
  }

  return { data: results, unmatchedAes };
}

// ─── tRPC Router ─────────────────────────────────────────────────────────────

export const voipSyncRouter = router({
  /** Get VOIP Studio connection status and user list */
  status: publicProcedure.query(async ({ ctx }) => {
    const aeId = getAeIdFromCtx(ctx) ?? undefined;
    if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    const ae = await getAeProfileById(aeId);
    if (!ae?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN", message: "Team leader only" });

    try {
      const users = await getVoipUsers();
      return {
        connected: true,
        userCount: users.length,
        users: users.map((u) => ({ id: u.id, name: u.name, extension: u.extension })),
      };
    } catch (err) {
      return {
        connected: false,
        userCount: 0,
        users: [] as Array<{ id: number; name: string; extension: string }>,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }),

  /** Preview dial data for all AEs for a date range (team leader only) */
  preview: publicProcedure
    .input(z.object({ months: z.number().min(1).max(6).default(2) }))
    .query(async ({ ctx, input }) => {
      const aeId = getAeIdFromCtx(ctx) ?? undefined;
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      const ae = await getAeProfileById(aeId);
      if (!ae?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN", message: "Team leader only" });

      const { data, unmatchedAes } = await pullVoipMonthlyData(input.months);

      return {
        monthlyData: data.map((d) => ({
          ...d,
          connectionRate: d.connectionRate,
          totalTalkTimeFormatted: formatTalkTime(d.totalTalkTimeSecs),
        })),
        unmatchedAes,
      };
    }),

  /** Import VOIP Studio dial data into monthly_metrics (team leader only) */
  import: publicProcedure
    .input(z.object({ months: z.number().min(1).max(6).default(2) }))
    .mutation(async ({ ctx, input }) => {
      const aeId = getAeIdFromCtx(ctx) ?? undefined;
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      const ae = await getAeProfileById(aeId);
      if (!ae?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN", message: "Team leader only" });

      const { data, unmatchedAes } = await pullVoipMonthlyData(input.months);
      let recordsUpdated = 0;

      for (const d of data) {
        const existing = await getMetricsForMonth(d.aeId, d.year, d.month);
        await upsertMonthlyMetric({
          aeId: d.aeId,
          year: d.year,
          month: d.month,
          arrUsd: existing?.arrUsd ?? "0",
          demosTotal: existing?.demosTotal ?? 0,
          dialsTotal: d.totalDials,
          retentionRate: existing?.retentionRate ?? null,
          connectedDials: d.connected,
          connectionRate: String(d.connectionRate),
          talkTimeSecs: d.totalTalkTimeSecs,
        });
        recordsUpdated++;
      }

      return {
        success: true,
        recordsUpdated,
        unmatchedAes,
        aesUpdated: Array.from(new Set(data.map((d) => d.aeName))).length,
      };
    }),

  /** Get today's real-time dial stats for the logged-in AE */
  myDialsToday: publicProcedure.query(async ({ ctx }) => {
    const aeId = getAeIdFromCtx(ctx) ?? undefined;
    if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    const ae = await getAeProfileById(aeId);
    if (!ae) throw new TRPCError({ code: "NOT_FOUND", message: "AE not found" });

    try {
      const voipUserId = await findVoipUserId(ae.name);
      if (!voipUserId) {
        return { found: false as const, aeName: ae.name };
      }

      const today = formatDate(new Date());
      const stats = await getDialCount(voipUserId, today, today);
      const connectionRate = stats.total > 0 ? Math.round((stats.connected / stats.total) * 10000) / 100 : 0;

      return {
        found: true as const,
        aeName: ae.name,
        voipUserId,
        date: today,
        totalDials: stats.total,
        connected: stats.connected,
        notConnected: stats.total - stats.connected,
        connectionRate,
        totalTalkTimeSecs: stats.talkTimeSecs,
        totalTalkTimeFormatted: formatTalkTime(stats.talkTimeSecs),
      };
    } catch (err) {
      return {
        found: false as const,
        aeName: ae.name,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }),

  /** Get this week's dial stats for the logged-in AE */
  myDialsThisWeek: publicProcedure.query(async ({ ctx }) => {
    const aeId = getAeIdFromCtx(ctx) ?? undefined;
    if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    const ae = await getAeProfileById(aeId);
    if (!ae) throw new TRPCError({ code: "NOT_FOUND", message: "AE not found" });

    try {
      const voipUserId = await findVoipUserId(ae.name);
      if (!voipUserId) {
        return { found: false as const, aeName: ae.name };
      }

      // Get Monday of current week
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const today = formatDate(now);
      const weekStart = formatDate(monday);

      const stats = await getDialCount(voipUserId, weekStart, today);
      const connectionRate = stats.total > 0 ? Math.round((stats.connected / stats.total) * 10000) / 100 : 0;

      return {
        found: true as const,
        aeName: ae.name,
        voipUserId,
        weekStart,
        weekEnd: today,
        totalDials: stats.total,
        connected: stats.connected,
        notConnected: stats.total - stats.connected,
        connectionRate,
        totalTalkTimeSecs: stats.talkTimeSecs,
        totalTalkTimeFormatted: formatTalkTime(stats.talkTimeSecs),
      };
    } catch (err) {
      return {
        found: false as const,
        aeName: ae.name,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }),

  /** Get dial stats for all AEs for a date range (team leader only) */
  teamDialStats: publicProcedure
    .input(z.object({
      dateFrom: z.string(),
      dateTo: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const aeId = getAeIdFromCtx(ctx) ?? undefined;
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      const ae = await getAeProfileById(aeId);
      if (!ae?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN", message: "Team leader only" });

      const allProfiles = await getAllAeProfiles();
      const stats: AeDialStats[] = [];
      const unmatchedAes: string[] = [];

      for (const profile of allProfiles) {
        const voipUserId = await findVoipUserId(profile.name);
        if (!voipUserId) {
          unmatchedAes.push(profile.name);
          continue;
        }

        const dialStats = await getDialCount(voipUserId, input.dateFrom, input.dateTo);
        const connectionRate = dialStats.total > 0
          ? Math.round((dialStats.connected / dialStats.total) * 10000) / 100
          : 0;

        stats.push({
          aeName: profile.name,
          aeId: profile.id,
          voipUserId,
          totalDials: dialStats.total,
          connected: dialStats.connected,
          notConnected: dialStats.total - dialStats.connected,
          connectionRate,
          totalTalkTimeSecs: dialStats.talkTimeSecs,
          totalTalkTimeFormatted: formatTalkTime(dialStats.talkTimeSecs),
        });
      }

      return { stats, unmatchedAes };
    }),
});
