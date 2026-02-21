/**
 * Pipedrive Sync — Pull won deals from Pipedrive → ARR in monthly_metrics
 *
 * Pipelines tracked:
 *   - Machining        (ID: 20)
 *   - Closing SMB      (ID: 12)
 *   - Closing Enterprise (ID: 10)
 *
 * For each AE registered in the commission calculator, this sync:
 *  1. Looks up their Pipedrive user ID by matching their name
 *  2. Fetches all won deals in the target pipelines owned by that user
 *  3. Converts deal values to USD using live FX rates
 *  4. Aggregates total ARR per calendar month
 *  5. Upserts the arrUsd field in monthly_metrics (preserving dials/demos)
 *
 * The PIPEDRIVE_API_KEY is injected by the Manus platform as an environment variable.
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getAllAeProfiles,
  getAeProfileById,
  getMetricsForMonth,
  upsertMonthlyMetric,
} from "./db";

// ─── Constants ────────────────────────────────────────────────────────────────

const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";

// Pipelines to track: Machining, Closing SMB, Closing Enterprise
const TARGET_PIPELINE_IDS = [20, 12, 10];

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipedriveDeal {
  id: number;
  title: string;
  value: number;
  currency: string;
  status: string;
  won_time: string | null;
  close_time: string | null;
  pipeline_id: number;
  stage_id: number;
  owner_name: string;
  user_id: { id: number; name: string } | number;
}

interface PipedriveUser {
  id: number;
  name: string;
  email: string;
  active_flag: boolean;
}

interface MonthlyArrAggregate {
  aeId: number;
  aeName: string;
  calYear: number;
  calMonth: number;
  totalArrUsd: number;
  dealCount: number;
  deals: Array<{
    id: number;
    title: string;
    valueUsd: number;
    originalValue: number;
    originalCurrency: string;
    wonDate: string;
    pipeline: string;
  }>;
}

// ─── Pipedrive API helpers ────────────────────────────────────────────────────

function getPipedriveApiKey(): string {
  const key = process.env.PIPEDRIVE_API_KEY;
  if (!key) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "PIPEDRIVE_API_KEY environment variable is not set.",
    });
  }
  return key;
}

async function pipedriveGet(
  endpoint: string,
  params: Record<string, string | number> = {}
): Promise<unknown> {
  const apiKey = getPipedriveApiKey();
  const url = new URL(`${PIPEDRIVE_BASE}/${endpoint}`);
  url.searchParams.set("api_token", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Pipedrive API error: ${res.status} ${res.statusText} for ${endpoint}`,
    });
  }
  return res.json();
}

async function pipedriveGetAll(
  endpoint: string,
  params: Record<string, string | number> = {}
): Promise<PipedriveDeal[]> {
  const all: PipedriveDeal[] = [];
  let start = 0;
  const limit = 500;

  while (true) {
    const resp = (await pipedriveGet(endpoint, {
      ...params,
      limit,
      start,
    })) as {
      data: PipedriveDeal[] | null;
      additional_data?: { pagination?: { more_items_in_collection?: boolean } };
    };

    const data = resp.data || [];
    all.push(...data);

    const more = resp.additional_data?.pagination?.more_items_in_collection;
    if (!more) break;
    start += limit;
  }

  return all;
}

// ─── FX Rate helpers ──────────────────────────────────────────────────────────

let fxCache: { rates: Record<string, number>; fetchedAt: number } | null = null;

async function getFxRates(): Promise<Record<string, number>> {
  // Cache for 1 hour
  if (fxCache && Date.now() - fxCache.fetchedAt < 3600_000) {
    return fxCache.rates;
  }
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    if (!res.ok) throw new Error("FX API error");
    const data = (await res.json()) as { rates: Record<string, number> };
    fxCache = { rates: data.rates, fetchedAt: Date.now() };
    return data.rates;
  } catch {
    // Fallback rates
    return { GBP: 0.79, EUR: 0.92, USD: 1.0 };
  }
}

async function toUsd(value: number, currency: string): Promise<number> {
  if (currency === "USD") return value;
  const rates = await getFxRates();
  // rates are relative to USD (e.g., GBP: 0.79 means 1 USD = 0.79 GBP)
  // So to convert X GBP to USD: X / 0.79
  const rate = rates[currency.toUpperCase()];
  if (!rate) return value; // Unknown currency — return as-is
  return value / rate;
}

// ─── Pipeline name map ────────────────────────────────────────────────────────

const PIPELINE_NAMES: Record<number, string> = {
  20: "Machining",
  12: "Closing SMB",
  10: "Closing Enterprise",
};

// ─── Core sync logic ──────────────────────────────────────────────────────────

/**
 * Find the Pipedrive user ID for an AE by matching their name.
 * Returns null if no match found.
 */
async function findPipedriveUserId(aeName: string): Promise<number | null> {
  const resp = (await pipedriveGet("users")) as { data: PipedriveUser[] | null };
  const users = resp.data || [];

  // Exact match first
  const exact = users.find(
    (u) => u.name.toLowerCase() === aeName.toLowerCase()
  );
  if (exact) return exact.id;

  // Partial match (first name + last name)
  const nameParts = aeName.toLowerCase().split(" ");
  const partial = users.find((u) => {
    const uParts = u.name.toLowerCase().split(" ");
    return nameParts.every((part) => uParts.some((up) => up.includes(part)));
  });
  if (partial) return partial.id;

  return null;
}

/**
 * Fetch all won deals for a specific Pipedrive user across target pipelines,
 * filtered to a date range.
 */
async function fetchWonDealsForUser(
  pipedriveUserId: number,
  fromDate: string, // YYYY-MM-DD
  toDate: string    // YYYY-MM-DD
): Promise<PipedriveDeal[]> {
  const allDeals: PipedriveDeal[] = [];

  for (const pipelineId of TARGET_PIPELINE_IDS) {
    const deals = await pipedriveGetAll("deals", {
      pipeline_id: pipelineId,
      user_id: pipedriveUserId,
      status: "won",
    });

    // Filter by date range
    const filtered = deals.filter((d) => {
      const wonDate = d.won_time || d.close_time;
      if (!wonDate) return false;
      const date = wonDate.substring(0, 10); // YYYY-MM-DD
      return date >= fromDate && date <= toDate;
    });

    allDeals.push(...filtered);
  }

  return allDeals;
}

/**
 * Aggregate won deals into monthly ARR totals for a single AE.
 */
async function aggregateDealsToMonthlyArr(
  aeId: number,
  aeName: string,
  deals: PipedriveDeal[]
): Promise<MonthlyArrAggregate[]> {
  const map = new Map<string, MonthlyArrAggregate>();

  for (const deal of deals) {
    const wonDate = deal.won_time || deal.close_time;
    if (!wonDate) continue;

    const year = parseInt(wonDate.substring(0, 4), 10);
    const month = parseInt(wonDate.substring(5, 7), 10);
    const key = `${year}-${month}`;

    const valueUsd = await toUsd(deal.value || 0, deal.currency || "USD");
    const pipelineName =
      PIPELINE_NAMES[deal.pipeline_id] || `Pipeline ${deal.pipeline_id}`;

    if (!map.has(key)) {
      map.set(key, {
        aeId,
        aeName,
        calYear: year,
        calMonth: month,
        totalArrUsd: 0,
        dealCount: 0,
        deals: [],
      });
    }

    const entry = map.get(key)!;
    entry.totalArrUsd += valueUsd;
    entry.dealCount += 1;
    entry.deals.push({
      id: deal.id,
      title: deal.title,
      valueUsd,
      originalValue: deal.value || 0,
      originalCurrency: deal.currency || "USD",
      wonDate: wonDate.substring(0, 10),
      pipeline: pipelineName,
    });
  }

  return Array.from(map.values()).sort(
    (a, b) => a.calYear * 100 + a.calMonth - (b.calYear * 100 + b.calMonth)
  );
}

// ─── Auth helper (same pattern as routers.ts) ─────────────────────────────────

function getAeIdFromCookie(
  ctx: { req: { headers: Record<string, string | string[] | undefined> } }
): number | null {
  const cookieHeader = ctx.req.headers["cookie"] as string | undefined;
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/ae_session=([^;]+)/);
  if (!match) return null;
  try {
    const payload = JSON.parse(Buffer.from(match[1], "base64url").toString());
    return typeof payload.aeId === "number" ? payload.aeId : null;
  } catch {
    return null;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const pipedriveSyncRouter = router({
  /**
   * Preview won deals from Pipedrive for all registered AEs.
   * Returns aggregated monthly ARR per AE without writing to DB.
   * Team leader only.
   */
  preview: publicProcedure
    .input(
      z.object({
        months: z.number().int().min(1).max(12).default(4),
      })
    )
    .query(async ({ input, ctx }) => {
      // Auth check
      const aeId = getAeIdFromCookie(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
      const profile = await getAeProfileById(aeId);
      if (!profile?.isTeamLeader) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Team leader access required." });
      }

      // Compute date range
      const now = new Date();
      const toDate = now.toISOString().substring(0, 10);
      const fromDate = new Date(
        now.getFullYear(),
        now.getMonth() - (input.months - 1),
        1
      )
        .toISOString()
        .substring(0, 10);

      const allProfiles = await getAllAeProfiles();
      const results: Array<{
        aeId: number;
        aeName: string;
        pipedriveUserId: number | null;
        monthlyArr: MonthlyArrAggregate[];
        totalDeals: number;
        totalArrUsd: number;
        notFound: boolean;
      }> = [];

      for (const ae of allProfiles) {
        const pdUserId = await findPipedriveUserId(ae.name);

        if (!pdUserId) {
          results.push({
            aeId: ae.id,
            aeName: ae.name,
            pipedriveUserId: null,
            monthlyArr: [],
            totalDeals: 0,
            totalArrUsd: 0,
            notFound: true,
          });
          continue;
        }

        const deals = await fetchWonDealsForUser(pdUserId, fromDate, toDate);
        const monthlyArr = await aggregateDealsToMonthlyArr(ae.id, ae.name, deals);

        results.push({
          aeId: ae.id,
          aeName: ae.name,
          pipedriveUserId: pdUserId,
          monthlyArr,
          totalDeals: deals.length,
          totalArrUsd: monthlyArr.reduce((sum, m) => sum + m.totalArrUsd, 0),
          notFound: false,
        });
      }

      return {
        results,
        fromDate,
        toDate,
        targetPipelines: Object.entries(PIPELINE_NAMES).map(([id, name]) => ({
          id: Number(id),
          name,
        })),
      };
    }),

  /**
   * Import won deal ARR from Pipedrive into monthly_metrics for all AEs.
   * Merges ARR into existing metrics (preserving dials/demos).
   * Team leader only.
   */
  import: publicProcedure
    .input(
      z.object({
        months: z.number().int().min(1).max(12).default(4),
        mergeMode: z
          .enum(["replace", "add"])
          .default("replace")
          .describe(
            "replace: set arrUsd to Pipedrive total; add: add Pipedrive ARR on top of existing"
          ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Auth check
      const aeId = getAeIdFromCookie(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
      const profile = await getAeProfileById(aeId);
      if (!profile?.isTeamLeader) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Team leader access required." });
      }

      // Compute date range
      const now = new Date();
      const toDate = now.toISOString().substring(0, 10);
      const fromDate = new Date(
        now.getFullYear(),
        now.getMonth() - (input.months - 1),
        1
      )
        .toISOString()
        .substring(0, 10);

      const allProfiles = await getAllAeProfiles();
      const updatedMetrics: string[] = [];
      const skippedAes: string[] = [];

      for (const ae of allProfiles) {
        const pdUserId = await findPipedriveUserId(ae.name);
        if (!pdUserId) {
          skippedAes.push(ae.name);
          continue;
        }

        const deals = await fetchWonDealsForUser(pdUserId, fromDate, toDate);
        const monthlyArr = await aggregateDealsToMonthlyArr(ae.id, ae.name, deals);

        for (const agg of monthlyArr) {
          // Get existing metrics for this month
          const existing = await getMetricsForMonth(ae.id, agg.calYear, agg.calMonth);

          let newArrUsd: number;
          if (input.mergeMode === "add" && existing) {
            newArrUsd = Number(existing.arrUsd) + agg.totalArrUsd;
          } else {
            newArrUsd = agg.totalArrUsd;
          }

          await upsertMonthlyMetric({
            aeId: ae.id,
            year: agg.calYear,
            month: agg.calMonth,
            arrUsd: String(Math.round(newArrUsd)),
            demosTotal: existing?.demosTotal ?? 0,
            dialsTotal: existing?.dialsTotal ?? 0,
            retentionRate: existing?.retentionRate ?? null,
          });

          updatedMetrics.push(
            `${ae.name} ${agg.calYear}-${String(agg.calMonth).padStart(2, "0")} ($${Math.round(newArrUsd).toLocaleString()})`
          );
        }
      }

      return {
        success: true,
        updatedMetrics,
        skippedAes,
        totalImported: updatedMetrics.length,
      };
    }),

  /**
   * Get won deals for the currently logged-in AE (for their own dashboard).
   * Returns deals from the last 12 months.
   */
  myDeals: publicProcedure
    .input(
      z.object({
        months: z.number().int().min(1).max(24).default(12),
      })
    )
    .query(async ({ input, ctx }) => {
      const aeId = getAeIdFromCookie(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });

      const profile = await getAeProfileById(aeId);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });

      const pdUserId = await findPipedriveUserId(profile.name);
      if (!pdUserId) {
        return {
          deals: [],
          monthlyArr: [],
          pipedriveUserFound: false,
          pipedriveUserName: null,
        };
      }

      const now = new Date();
      const toDate = now.toISOString().substring(0, 10);
      const fromDate = new Date(
        now.getFullYear(),
        now.getMonth() - (input.months - 1),
        1
      )
        .toISOString()
        .substring(0, 10);

      const deals = await fetchWonDealsForUser(pdUserId, fromDate, toDate);
      const monthlyArr = await aggregateDealsToMonthlyArr(aeId, profile.name, deals);

      return {
        deals: deals.map((d) => ({
          id: d.id,
          title: d.title,
          value: d.value,
          currency: d.currency,
          wonDate: (d.won_time || d.close_time || "").substring(0, 10),
          pipeline:
            PIPELINE_NAMES[d.pipeline_id] || `Pipeline ${d.pipeline_id}`,
        })),
        monthlyArr: monthlyArr.map((m) => ({
          year: m.calYear,
          month: m.calMonth,
          totalArrUsd: Math.round(m.totalArrUsd),
          dealCount: m.dealCount,
        })),
        pipedriveUserFound: true,
        pipedriveUserName: profile.name,
      };
    }),

  /**
   * Check if the Pipedrive API key is configured and working.
   */
  status: publicProcedure.query(async () => {
    const key = process.env.PIPEDRIVE_API_KEY;
    if (!key) return { configured: false, working: false };
    try {
      const resp = (await pipedriveGet("users/me")) as {
        data?: { name?: string; email?: string };
      };
      return {
        configured: true,
        working: true,
        user: resp.data?.name,
        email: resp.data?.email,
      };
    } catch {
      return { configured: true, working: false };
    }
  }),
});
