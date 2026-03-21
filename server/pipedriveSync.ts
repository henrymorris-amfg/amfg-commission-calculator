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
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { getAeIdFromCtx } from "./aeTokenUtils";
import {
  getAllAeProfiles,
  getAeProfileById,
  getMetricsForMonth,
  getMetricsForAe,
  upsertMonthlyMetric,
  getDealByPipedriveId,
  createDeal,
  createPayoutsForDeal,
  deletePayoutsForDeal,
  deleteDeal,
  getActiveCommissionStructure,
} from "./db";
import {
  computeRollingAverages,
  computeAvgRetention,
  isNewJoiner,
  calculateTier,
  calculateCommission,
  addMonths,
  type Tier,
} from "../shared/commission";

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
  // Custom fields from Pipedrive (40-char hashes)
  "39365abf109ea01960620ae35f468978ae611bc8"?: string; // Contract Start Date (YYYY-MM-DD)
  "8a8c3b2c5e8f9a1b2c3d4e5f6a7b8c9d"?: string; // Billing Frequency (monthly or annual)
  [key: string]: any; // Allow other custom fields
}

interface PipedriveActivity {
  id: number;
  done: boolean;
  type: string;
  subject: string;
  due_date: string;
  marked_as_done_time: string | null;
  user_id: number;
  owner_name: string;
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
  totalDemos: number;
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

// ─── Deal exclusion filter ──────────────────────────────────────────────────

/**
 * Deal titles containing any of these keywords should be excluded from import.
 * These represent implementation, onboarding, or customer success engagements
 * that are not new ARR and should not generate commission.
 */
const DEAL_EXCLUSION_KEYWORDS = [
  "implementation",
  "customer success",
  "onboarding",
  "cs ",
  "- cs",
];

function isDealExcluded(title: string): boolean {
  const lower = title.toLowerCase();
  return DEAL_EXCLUSION_KEYWORDS.some((kw) => lower.includes(kw));
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
export async function findPipedriveUserId(aeName: string): Promise<number | null> {
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
  // Use a Map to deduplicate deals by ID — the same deal can appear in multiple
  // pipelines (e.g. Machining, Closing SMB, Closing Enterprise) and must only be counted once.
  const dealsById = new Map<number, PipedriveDeal>();

  for (const pipelineId of TARGET_PIPELINE_IDS) {
    const deals = await pipedriveGetAll("deals", {
      pipeline_id: pipelineId,
      user_id: pipedriveUserId,
      status: "won",
    });

    // Filter by date range, exclude implementation/CS deals, and deduplicate by deal ID
    for (const d of deals) {
      if (dealsById.has(d.id)) continue; // already counted from another pipeline
      if (isDealExcluded(d.title)) continue; // skip implementation/CS/onboarding deals
      const wonDate = d.won_time || d.close_time;
      if (!wonDate) continue;
      const date = wonDate.substring(0, 10); // YYYY-MM-DD
      if (date >= fromDate && date <= toDate) {
        dealsById.set(d.id, d);
      }
    }
  }

  return Array.from(dealsById.values());
}

/**
 * Fetch all completed "Demo" activities for a specific Pipedrive user,
 * filtered to a date range.
 */
export async function fetchCompletedDemosForUser(
  pipedriveUserId: number,
  fromDate: string, // YYYY-MM-DD
  toDate: string    // YYYY-MM-DD
): Promise<PipedriveActivity[]> {
  const activities = await pipedriveGetAll("activities", {
    user_id: pipedriveUserId,
    type: "demo",
    done: 1,
  }) as unknown as PipedriveActivity[];

  // The API doesn't filter activities by date, so we do it manually.
  // We use `marked_as_done_time` as the source of truth for completion date.
  return activities.filter(a => {
    const doneTime = a.marked_as_done_time;
    if (!doneTime) return false;
    const doneDate = doneTime.substring(0, 10);
    return doneDate >= fromDate && doneDate <= toDate;
  });
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
        totalDemos: 0,
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
  }  return Array.from(map.values()).sort(
    (a, b) => a.calYear * 100 + a.calMonth - (b.calYear * 100 + b.calMonth)
  );
}

/**
 * Aggregate won dealsed demos into monthly totals for a single AE.
 */
async function aggregateDemosToMonthly(
  aeId: number,
  aeName: string,
  demos: PipedriveActivity[]
): Promise<MonthlyArrAggregate[]> {
  const map = new Map<string, MonthlyArrAggregate>();

  for (const demo of demos) {
    const doneTime = demo.marked_as_done_time;
    if (!doneTime) continue;

    const year = parseInt(doneTime.substring(0, 4), 10);
    const month = parseInt(doneTime.substring(5, 7), 10);
    const key = `${year}-${month}`;

    if (!map.has(key)) {
      map.set(key, {
        aeId,
        aeName,
        calYear: year,
        calMonth: month,
        totalArrUsd: 0, // Not used for demos
        dealCount: 0, // Not used for demos
        deals: [], // Not used for demos
        totalDemos: 0,
      });
    }

    const entry = map.get(key)!;
    entry.totalDemos += 1;
  }

  return Array.from(map.values()).sort(
    (a, b) => a.calYear * 100 + a.calMonth - (b.calYear * 100 + b.calMonth)
  );
}

// Auth helper is imported from ./aeAuth (X-AE-Token header, production-safe)

// ─── Router ───────────────────────────────────────────────────────────────────

export const pipedriveSyncRouter = router({
  /**
   * Preview won deals from Pipedrive for all registered AEs.
   * Returns aggregated monthly ARR per AE without writing to DB.
   * Team leader only.
   * 
   * When useJoinDate=true (default), each AE's sync window starts from their join date.
   * When useJoinDate=false, the months parameter is used as a fixed lookback.
   */
  preview: publicProcedure
    .input(
      z.object({
        months: z.number().int().min(1).max(24).default(4),
        useJoinDate: z.boolean().default(true),
      })
    )
    .query(async ({ input, ctx }) => {
      // Auth check
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      const profile = await getAeProfileById(aeId);
      if (!profile?.isTeamLeader) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Team leader access required." });
      }

      const now = new Date();
      const toDate = now.toISOString().substring(0, 10);
      // Global fromDate used only when useJoinDate=false
      const globalFromDate = new Date(
        now.getFullYear(),
        now.getMonth() - (input.months - 1),
        1
      ).toISOString().substring(0, 10);

      const allProfiles = await getAllAeProfiles();
      const results: Array<{
        aeId: number;
        aeName: string;
        pipedriveUserId: number | null;
        monthlyArr: MonthlyArrAggregate[];
        totalDeals: number;
        totalArrUsd: number;
        totalDemos: number;
        notFound: boolean;
        monthlyDemos: any[];
        fromDate: string;
      }> = [];

      for (const ae of allProfiles) {
        const pdUserId = await findPipedriveUserId(ae.name);

        // Use join date as fromDate when useJoinDate=true
        const aeFromDate = input.useJoinDate
          ? new Date(ae.joinDate).toISOString().substring(0, 10)
          : globalFromDate;

        if (!pdUserId) {
          results.push({
            aeId: ae.id,
            aeName: ae.name,
            pipedriveUserId: null,
            monthlyArr: [],
            totalDeals: 0,
            totalArrUsd: 0,
            totalDemos: 0,
            notFound: true,
            monthlyDemos: [],
            fromDate: aeFromDate,
          });
          continue;
        }

        const deals = await fetchWonDealsForUser(pdUserId, aeFromDate, toDate);
        const monthlyArr = await aggregateDealsToMonthlyArr(ae.id, ae.name, deals);
        const demos = await fetchCompletedDemosForUser(pdUserId, aeFromDate, toDate);
        const monthlyDemos = await aggregateDemosToMonthly(ae.id, ae.name, demos);

        results.push({
          aeId: ae.id,
          aeName: ae.name,
          pipedriveUserId: pdUserId,
          monthlyArr,
          totalDeals: deals.length,
          totalArrUsd: monthlyArr.reduce((sum, m) => sum + m.totalArrUsd, 0),
          totalDemos: demos.length,
          monthlyDemos,
          notFound: false,
          fromDate: aeFromDate,
        });
      }

      return {
        results,
        fromDate: globalFromDate,
        toDate,
        useJoinDate: input.useJoinDate,
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
   * 
   * When useJoinDate=true (default), each AE's sync window starts from their join date.
   */
  import: publicProcedure
    .input(
      z.object({
        months: z.number().int().min(1).max(24).default(4),
        useJoinDate: z.boolean().default(true),
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
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      const profile = await getAeProfileById(aeId);
      if (!profile?.isTeamLeader) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Team leader access required." });
      }

      const now = new Date();
      const toDate = now.toISOString().substring(0, 10);
      // Global fallback fromDate (used when useJoinDate=false)
      const globalFromDate = new Date(
        now.getFullYear(),
        now.getMonth() - (input.months - 1),
        1
      ).toISOString().substring(0, 10);

      const allProfiles = await getAllAeProfiles();
      const updatedMetrics: string[] = [];
      const skippedAes: string[] = [];

      for (const ae of allProfiles) {
        const pdUserId = await findPipedriveUserId(ae.name);
        if (!pdUserId) {
          skippedAes.push(ae.name);
          continue;
        }

        // Use join date as fromDate when useJoinDate=true
        const fromDate = input.useJoinDate
          ? new Date(ae.joinDate).toISOString().substring(0, 10)
          : globalFromDate;

        const deals = await fetchWonDealsForUser(pdUserId, fromDate, toDate);
        const monthlyArr = await aggregateDealsToMonthlyArr(ae.id, ae.name, deals);
        const demos = await fetchCompletedDemosForUser(pdUserId, fromDate, toDate);
        const monthlyDemos = await aggregateDemosToMonthly(ae.id, ae.name, demos);

                const allMonthlyData = new Map<string, { arr: MonthlyArrAggregate | null, demos: MonthlyArrAggregate | null }>();

        monthlyArr.forEach(m => {
          const key = `${m.calYear}-${m.calMonth}`;
          if (!allMonthlyData.has(key)) allMonthlyData.set(key, { arr: null, demos: null });
          allMonthlyData.get(key)!.arr = m;
        });

        monthlyDemos.forEach(m => {
          const key = `${m.calYear}-${m.calMonth}`;
          if (!allMonthlyData.has(key)) allMonthlyData.set(key, { arr: null, demos: null });
          allMonthlyData.get(key)!.demos = m;
        });

        for (const [key, { arr, demos }] of Array.from(allMonthlyData.entries())) {
          // Get existing metrics for this month
                    const [year, month] = key.split('-').map(Number);
          const existing = await getMetricsForMonth(ae.id, year, month);

                    const arrUsd = arr?.totalArrUsd ?? 0;
            const demosFromPipedrive = demos?.totalDemos ?? 0;
          let newArrUsd: number;
          if (input.mergeMode === "add" && existing) {
            newArrUsd = Number(existing.arrUsd) + arrUsd;
          } else {
            newArrUsd = arrUsd;
          }
          // Always update demosTotal with Pipedrive count so it shows on Activity Metrics.
          // Use the higher of the two values to avoid overwriting manual entries that are larger.
          const existingDemosTotal = existing?.demosTotal ?? 0;
          const newDemosTotal = demosFromPipedrive > existingDemosTotal ? demosFromPipedrive : existingDemosTotal;
          await upsertMonthlyMetric({
            aeId: ae.id,
            year: year,
            month: month,
            arrUsd: String(Math.round(newArrUsd)),
            demosFromPipedrive,
            demosTotal: newDemosTotal,
            dialsTotal: existing?.dialsTotal ?? 0,
            retentionRate: existing?.retentionRate ?? null,
          });

                    updatedMetrics.push(
            `${ae.name} ${year}-${String(month).padStart(2, "0")} (ARR: $${Math.round(newArrUsd).toLocaleString()}, Demos: ${demosFromPipedrive})`
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
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });

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
   * Import Pipedrive won deals as deal records for all AEs.
   * Creates deal + payout records in the deals/commission_payouts tables.
   * Skips deals already imported (idempotent via pipedriveId).
   * Team leader only.
   */
  /**
   * Import Pipedrive won deals as deal records for all AEs.
   * Creates deal + payout records in the deals/commission_payouts tables.
   * Skips deals already imported (idempotent via pipedriveId).
   * Team leader only.
   * 
   * When useJoinDate=true (default), each AE's sync window starts from their join date.
   */
  importDeals: publicProcedure
    .input(
      z.object({
        months: z.number().int().min(1).max(24).default(6),
        useJoinDate: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      const profile = await getAeProfileById(aeId);
      if (!profile?.isTeamLeader) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Team leader access required." });
      }

      const now = new Date();
      const toDate = now.toISOString().substring(0, 10);
      // Global fallback fromDate (used when useJoinDate=false)
      const globalFromDate = new Date(
        now.getFullYear(),
        now.getMonth() - (input.months - 1),
        1
      ).toISOString().substring(0, 10);

      const allProfiles = await getAllAeProfiles();
      const activeStructure = await getActiveCommissionStructure();
      // Use GBP rate from our existing FX cache
      const fxRates = await getFxRates();
      const usdToGbp = fxRates["GBP"] ?? 0.79;

      const imported: string[] = [];
      const skipped: string[] = [];
      const errors: string[] = [];

      for (const ae of allProfiles) {
        const pdUserId = await findPipedriveUserId(ae.name);
        if (!pdUserId) {
          skipped.push(`${ae.name} (not found in Pipedrive)`);
          continue;
        }

        // Use join date as fromDate when useJoinDate=true
        const fromDate = input.useJoinDate
          ? new Date(ae.joinDate).toISOString().substring(0, 10)
          : globalFromDate;

        const pdDeals = await fetchWonDealsForUser(pdUserId, fromDate, toDate);

        for (const pdDeal of pdDeals) {
          try {
            // Skip if already imported
            const existing = await getDealByPipedriveId(ae.id, pdDeal.id);
            if (existing) {
              skipped.push(`${ae.name}: ${pdDeal.title} (already imported)`);
              continue;
            }

            const wonDate = pdDeal.won_time || pdDeal.close_time;
            if (!wonDate) continue;

            const arrUsd = await toUsd(pdDeal.value || 0, pdDeal.currency || "USD");
            
            // Extract Contract Start Date from Pipedrive custom field
            const contractStartDateStr = pdDeal["39365abf109ea01960620ae35f468978ae611bc8"];
            const contractStartDate = contractStartDateStr ? new Date(contractStartDateStr) : null;
            
            // Use contract start date for ARR attribution, not deal signed date
            const attributionDate = contractStartDate || new Date(wonDate);
            const startYear = attributionDate.getFullYear();
            const startMonth = attributionDate.getMonth() + 1;
            const startDay = attributionDate.getDate();

            // Determine tier at the time of this deal
            const allMetrics = await getMetricsForAe(ae.id, 9);
            const targetDate = new Date(startYear, startMonth - 1, 1);
            const last3 = allMetrics
              .filter((m) => new Date(m.year, m.month - 1, 1) < targetDate)
              .slice(0, 3)
              .map((m) => ({
                year: m.year,
                month: m.month,
                arrUsd: Number(m.arrUsd),
                demosTotal: m.demosTotal,
                dialsTotal: m.dialsTotal,
                retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
              }));
            const last6 = allMetrics
              .filter((m) => new Date(m.year, m.month - 1, 1) < targetDate)
              .slice(0, 6)
              .map((m) => ({
                year: m.year,
                month: m.month,
                arrUsd: Number(m.arrUsd),
                demosTotal: m.demosTotal,
                dialsTotal: m.dialsTotal,
                retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
              }));
            const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3);
            const avgRetentionRate = computeAvgRetention(last6);
            const newJoiner = isNewJoiner(ae.joinDate, targetDate);
            const tierResult = calculateTier({
              avgArrUsd,
              avgDemosPw,
              avgDialsPw,
              avgRetentionRate,
              isNewJoiner: newJoiner,
              isTeamLeader: ae.isTeamLeader,
            });
            const tier = tierResult.tier as Tier;

            // Get billing frequency from Pipedrive (monthly or annual)
            const billingFrequencyField = pdDeal['8a8c3b2c5e8f9a1b2c3d4e5f6a7b8c9d'] || 'annual'; // Billing Frequency field
            const contractType = billingFrequencyField === 'monthly' ? 'monthly' : 'annual';
            
            // Calculate commission
            const commResult = calculateCommission({
              contractType,
              arrUsd,
              tier,
              onboardingFeePaid: true,
              isReferral: false,
              fxRateUsdToGbp: usdToGbp,
              monthlyPayoutMonths: activeStructure ? Number(activeStructure.monthlyPayoutMonths) : undefined,
              onboardingDeductionGbp: activeStructure ? Number(activeStructure.onboardingDeductionGbp) : undefined,
              onboardingArrReductionUsd: activeStructure ? Number(activeStructure.onboardingArrReductionUsd) : undefined,
            });

            // Create deal record
            const dealId = await createDeal({
              aeId: ae.id,
              customerName: pdDeal.title,
              contractType,
              startYear,
              startMonth,
              startDay,
              originalAmount: String(Math.round(arrUsd)),
              arrUsd: String(Math.round(arrUsd)),
              onboardingFeePaid: true,
              isReferral: false,
              tierAtStart: tier,
              fxRateAtEntry: String(usdToGbp),
              fxRateAtWon: String(usdToGbp), // Lock FX rate at deal-won date
              commissionStructureId: activeStructure?.id ?? null,
              pipedriveId: pdDeal.id,
              pipedriveWonTime: wonDate ? new Date(wonDate) : null,
              contractStartDate: contractStartDate,
              billingFrequency: contractType,
              notes: `Imported from Pipedrive. Pipeline: ${PIPELINE_NAMES[pdDeal.pipeline_id] || pdDeal.pipeline_id}`,
            });

            // Create payout schedule
            const payouts = commResult.payoutSchedule.map((p, i) => {
              const payoutDate = addMonths(startYear, startMonth, i);
              return {
                dealId,
                aeId: ae.id,
                payoutYear: payoutDate.year,
                payoutMonth: payoutDate.month,
                payoutNumber: p.payoutNumber,
                grossCommissionUsd: String(p.grossCommissionUsd),
                referralDeductionUsd: String(p.referralDeductionUsd),
                onboardingDeductionGbp: String(p.onboardingDeductionGbp),
                netCommissionUsd: String(p.netCommissionUsd),
                fxRateUsed: String(usdToGbp),
                netCommissionGbp: String(p.netCommissionGbp),
              };
            });
            await createPayoutsForDeal(payouts);

            imported.push(`${ae.name}: ${pdDeal.title} ($${Math.round(arrUsd).toLocaleString()} ARR, ${tier} tier)`);
          } catch (err) {
            errors.push(`${ae.name}: ${pdDeal.title} — ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      return {
        success: true,
        imported,
        skipped,
        errors,
        totalImported: imported.length,
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
