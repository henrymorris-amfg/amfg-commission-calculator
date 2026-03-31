import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "./_core/trpc";
import { spreadsheetSyncRouter } from "./spreadsheetSync";
import { pipedriveSyncRouter } from "./pipedriveSync";
import { voipSyncRouter } from "./voipSync";
import { validationRouter } from "./validationRouter";
import { demoRouter } from "./demoProcedures";
import { resyncAllPayouts } from "./resyncPayouts";
import * as bcrypt from "bcryptjs";
import { makeAeToken } from "./aeAuth";
import { getAeIdFromCtx } from "./aeTokenUtils";
import { z } from "zod";
import {
  MONTH_NAMES,
  Tier,
  addMonths,
  calculateCommission,
  calculateTier,
  computeAvgRetention,
  computeRollingAverages,
  isNewJoiner,
} from "../shared/commission";
import { isInGracePeriod, getGracePeriodStatus } from "../shared/gracePeriod";
import { type InsertCommissionPayout } from "../drizzle/schema";
import { sendTierChangeEmail } from "./emailNotifications";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  activateCommissionStructure,
  createAeProfile,
  createCommissionStructure,
  createDeal,
  createPayoutsForDeal,
  deletePayoutsForDeal,
  deleteDeal,
  getActiveCommissionStructure,
  getAeProfileByName,
  getAeProfileById,
  getAllAeProfiles,
  getAllCommissionStructures,
  getCommissionStructureById,
  getDealById,
  getDealsForAe,
  getMetricsForAe,
  getMetricsForAeBefore,
  getMetricsForMonth,
  getPayoutsForAe,
  getPayoutsForDeal,
  getPayoutsForMonth,
  seedInitialCommissionStructure,
  updateCommissionStructure,
  upsertMonthlyMetric,
  updateAeProfile,
  recordFailedPinAttempt,
  resetPinAttempts,
  getDb,
} from "./db";
import { deals, commissionPayouts, aeProfiles, monthlyMetrics, tierSnapshots } from "../drizzle/schema";
import { eq, like, and, inArray, or, gt, lt, gte, lte } from "drizzle-orm";

// Seed the initial commission structure on first startup
seedInitialCommissionStructure().catch(console.error);

// ─── Commission Structure Target Types ───────────────────────────────────────
interface TierTargets {
  arrUsd: number;
  demosPw: number;
  dialsPw: number;
  retentionMin: number;
}
interface StructureTargets {
  silver: TierTargets;
  gold: TierTargets;
}

/// ─── FX Rate Helper (with 5-minute in-memory cache) ─────────────────────────
let _fxCache: { rate: number; fetchedAt: number } | null = null;
const FX_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchUsdToGbpRate(): Promise<number> {
  const now = Date.now();
  if (_fxCache && now - _fxCache.fetchedAt < FX_CACHE_TTL_MS) {
    return _fxCache.rate;
  }
  try {
    const res = await fetch(
      "https://api.exchangerate-api.com/v4/latest/USD"
    );
    if (!res.ok) throw new Error("FX API error");
    const data = (await res.json()) as { rates: Record<string, number> };
    const rate = data.rates["GBP"] ?? 0.79;
    _fxCache = { rate, fetchedAt: now };
    return rate;
  } catch {
    // Return cached value if available, otherwise fallback
    return _fxCache?.rate ?? 0.79;
  }
}

async function fetchLiveRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch(
      "https://api.exchangerate-api.com/v4/latest/USD"
    );
    if (!res.ok) throw new Error("FX API error");
    const data = (await res.json()) as { rates: Record<string, number> };
    return data.rates;
  } catch {
    return { GBP: 0.79, EUR: 0.8656 };
  }
}

// makeAeToken and getAeIdFromCtx are imported from ./aeAuth

// ─── Routers ──────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── AE Auth ───────────────────────────────────────────────────────────────
  ae: router({
    // List all AE names (for login dropdown)
    listNames: publicProcedure.query(async () => {
      const profiles = await getAllAeProfiles();
      return profiles.map((p) => ({ id: p.id, name: p.name }));
    }),

    // Register a new AE profile (team leader only)
    register: publicProcedure
      .input(
        z.object({
          name: z.string().min(2).max(128),
          pin: z.string().length(4).regex(/^\d{4}$/, "PIN must be 4 digits"),
          joinDate: z.string(), // ISO date string
          isTeamLeader: z.boolean().default(false),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Only team leaders (or first-time setup with no AEs yet) can register new AEs
        const existingAes = await getAllAeProfiles();
        if (existingAes.length > 0) {
          const callerId = getAeIdFromCtx(ctx);
          if (!callerId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
          const caller = await getAeProfileById(callerId);
          if (!caller?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN", message: "Team leader access required." });
        }
        // Check name not already taken
        const existing = await getAeProfileByName(input.name);
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An AE with this name already exists.",
          });
        }
        const pinHash = await bcrypt.hash(input.pin, 10);
        const id = await createAeProfile({
          name: input.name,
          pinHash,
          joinDate: new Date(input.joinDate),
          isTeamLeader: input.isTeamLeader,
        });
        return { id, name: input.name };
      }),

    // Login with name + PIN — returns a token to be stored in localStorage
    login: publicProcedure
      .input(
        z.object({
          name: z.string(),
          pin: z.string().length(4),
        })
      )
      .mutation(async ({ input }) => {
        const profile = await getAeProfileByName(input.name);
        if (!profile) {
          throw new TRPCError({ code: "NOT_FOUND", message: "AE not found." });
        }

        // ── Lockout check ──────────────────────────────────────────────────────
        const MAX_ATTEMPTS = 5;
        const LOCKOUT_HOURS = 2;
        const now = new Date();

        if (profile.lockedUntil && profile.lockedUntil > now) {
          const minutesLeft = Math.ceil(
            (profile.lockedUntil.getTime() - now.getTime()) / 60000
          );
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Account locked. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
          });
        }

        // ── PIN verification ───────────────────────────────────────────────────
        const valid = await bcrypt.compare(input.pin, profile.pinHash);
        if (!valid) {
          const newAttempts = (profile.failedPinAttempts ?? 0) + 1;
          const lockoutUntil =
            newAttempts >= MAX_ATTEMPTS
              ? new Date(now.getTime() + LOCKOUT_HOURS * 60 * 60 * 1000)
              : undefined;
          await recordFailedPinAttempt(profile.id, newAttempts, lockoutUntil);

          const remaining = MAX_ATTEMPTS - newAttempts;
          if (lockoutUntil) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: `Too many incorrect attempts. Account locked for ${LOCKOUT_HOURS} hours.`,
            });
          }
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
          });
        }

        // ── Success — reset attempt counter ────────────────────────────────────
        await resetPinAttempts(profile.id);

        const token = makeAeToken(profile.id);
        return {
          token,
          id: profile.id,
          name: profile.name,
          joinDate: profile.joinDate,
          isTeamLeader: profile.isTeamLeader,
        };
      }),

    // Change PIN — requires current PIN for verification
    changePin: publicProcedure
      .input(
        z.object({
          currentPin: z.string().length(4).regex(/^\d{4}$/),
          newPin: z.string().length(4).regex(/^\d{4}$/, "PIN must be 4 digits"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
        }
        const profile = await getAeProfileById(aeId);
        if (!profile) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found." });
        }

        // Verify current PIN
        const valid = await bcrypt.compare(input.currentPin, profile.pinHash);
        if (!valid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Current PIN is incorrect.",
          });
        }

        // Ensure new PIN is different
        const samePin = await bcrypt.compare(input.newPin, profile.pinHash);
        if (samePin) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "New PIN must be different from your current PIN.",
          });
        }

        const newPinHash = await bcrypt.hash(input.newPin, 10);
        await updateAeProfile(aeId, { pinHash: newPinHash });
        await resetPinAttempts(aeId);
        return { success: true };
      }),

    // Admin: reset another AE's PIN (team leader only)
    adminResetPin: publicProcedure
      .input(
        z.object({
          targetAeId: z.number().int().positive(),
          newPin: z.string().length(4).regex(/^\d{4}$/, "PIN must be 4 digits"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
        }
        const caller = await getAeProfileById(aeId);
        if (!caller?.isTeamLeader) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Team leader access required." });
        }
        const target = await getAeProfileById(input.targetAeId);
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "AE not found." });
        }
        const newPinHash = await bcrypt.hash(input.newPin, 10);
        await updateAeProfile(input.targetAeId, { pinHash: newPinHash });
        await resetPinAttempts(input.targetAeId);
        return { success: true, aeName: target.name };
      }),
    // Logout AE session (client clears localStorage)
    logout: publicProcedure.mutation(() => {
      return { success: true };
    }),

    // Get current AE session
    me: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) return null;
      const profile = await getAeProfileById(aeId);
      if (!profile) return null;
      return {
        id: profile.id,
        name: profile.name,
        joinDate: profile.joinDate,
        isTeamLeader: profile.isTeamLeader,
      };
    }),
  }),

  // ─── Metrics ───────────────────────────────────────────────────────────────
  metrics: router({
    // Save or update metrics for a given month — ADMIN (team leader) only
    upsert: publicProcedure
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12),
          // aeId is required when called by admin on behalf of another AE
          aeId: z.number().int().optional(),
          arrUsd: z.number().min(0),
          demosTotal: z.number().int().min(0),
          dialsTotal: z.number().int().min(0),
          retentionRate: z.number().min(0).max(100).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const callerId = getAeIdFromCtx(ctx);
        if (!callerId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
        const caller = await getAeProfileById(callerId);
        if (!caller?.isTeamLeader) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can edit activity data." });
        }
        // Admin can edit any AE's metrics; if no aeId provided, edit own
        const aeId = input.aeId ?? callerId;
        await upsertMonthlyMetric({
          aeId,
          year: input.year,
          month: input.month,
          arrUsd: String(input.arrUsd),
          demosTotal: input.demosTotal,
          dialsTotal: input.dialsTotal,
          retentionRate: input.retentionRate != null ? String(input.retentionRate) : null,
        });
        return { success: true };
      }),

    // Get recent metrics for current AE with grace period info
    list: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
      const aeProfile = await getAeProfileById(aeId);
      const rows = await getMetricsForAe(aeId, 6);
      return rows.map((r) => {
        const inGracePeriod = aeProfile?.joinDate ? isInGracePeriod(aeProfile.joinDate, r.year, r.month) : false;
        const gracePeriodStatus = aeProfile?.joinDate ? getGracePeriodStatus(aeProfile.joinDate, r.year, r.month) : 'Unknown';
        return {
          ...r,
          arrUsd: Number(r.arrUsd),
          retentionRate: r.retentionRate != null ? Number(r.retentionRate) : null,
          inGracePeriod,
          gracePeriodStatus,
        };
      });
    }),

    // Get metric for a specific month
    getForMonth: publicProcedure
      .input(z.object({ year: z.number().int(), month: z.number().int() }))
      .query(async ({ input, ctx }) => {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
        const aeProfile = await getAeProfileById(aeId);
        const row = await getMetricsForMonth(aeId, input.year, input.month);
        if (!row) return null;
        const inGracePeriod = aeProfile?.joinDate ? isInGracePeriod(aeProfile.joinDate, input.year, input.month) : false;
        const gracePeriodStatus = aeProfile?.joinDate ? getGracePeriodStatus(aeProfile.joinDate, input.year, input.month) : 'Unknown';
        return {
          ...row,
          arrUsd: Number(row.arrUsd),
          retentionRate: row.retentionRate != null ? Number(row.retentionRate) : null,
          inGracePeriod,
          gracePeriodStatus,
        };
      }),
  }),

  // ─── Tier Calculator ────────────────────────────────────────────────────────
  tier: router({
    // Calculate tier for a given month based on stored metrics
    calculate: publicProcedure
      .input(
        z.object({
          year: z.number().int(),
          month: z.number().int().min(1).max(12),
        })
      )
      .query(async ({ input, ctx }) => {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });

        const profile = await getAeProfileById(aeId);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND" });

        // Get last 3 months of metrics (before the target month)
        const allMetrics = await getMetricsForAe(aeId, 9);

        // Filter to the 3 months preceding the target month
        const targetDate = new Date(input.year, input.month - 1, 1);
        const joinDate = new Date(profile.joinDate);
        
        // For new joiners with no prior data, show current month instead of looking backward
        let last3 = allMetrics
          .filter((m) => {
            const d = new Date(m.year, m.month - 1, 1);
            return d < targetDate && d >= joinDate;
          })
          .slice(0, 3);
        
        // If new joiner has no prior data but has current month data, use that
        if (last3.length === 0 && isNewJoiner(profile.joinDate, targetDate)) {
          last3 = allMetrics
            .filter((m) => {
              const d = new Date(m.year, m.month - 1, 1);
              return d.getFullYear() === input.year && d.getMonth() + 1 === input.month;
            })
            .slice(0, 1);
        }
        
        last3 = last3
          .map((m) => {
            // Apply grace period: if month is within 6 months of join date, assume $25k ARR
            const monthDate = new Date(m.year, m.month - 1, 1);
            const monthsSinceJoin = (monthDate.getFullYear() - joinDate.getFullYear()) * 12 + (monthDate.getMonth() - joinDate.getMonth());
            const arrUsd = monthsSinceJoin >= 0 && monthsSinceJoin < 6 ? 25000 : Number(m.arrUsd);
            return {
              year: m.year,
              month: m.month,
              arrUsd,
              demosTotal: m.demosTotal,
              dialsTotal: m.dialsTotal,
              retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
            };
          }) as any;

        let last6 = allMetrics
          .filter((m) => {
            const d = new Date(m.year, m.month - 1, 1);
            return d < targetDate && d >= joinDate;
          })
          .slice(0, 6);
        
        // If new joiner has no prior data but has current month data, use that for retention
        if (last6.length === 0 && isNewJoiner(profile.joinDate, targetDate)) {
          last6 = allMetrics
            .filter((m) => {
              const d = new Date(m.year, m.month - 1, 1);
              return d.getFullYear() === input.year && d.getMonth() + 1 === input.month;
            })
            .slice(0, 1);
        }
        
        last6 = last6
          .map((m) => ({
            year: m.year,
            month: m.month,
            arrUsd: Number(m.arrUsd),
            demosTotal: m.demosTotal,
            dialsTotal: m.dialsTotal,
            retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
          })) as any;

        const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3 as any, new Date(profile.joinDate));
        const avgRetentionRate = computeAvgRetention(last6 as any);
        const newJoiner = isNewJoiner(profile.joinDate, targetDate);

        const result = calculateTier({
          avgArrUsd,
          avgDemosPw,
          avgDialsPw,
          avgRetentionRate,
          isNewJoiner: newJoiner,
          isTeamLeader: profile.isTeamLeader,
        });

        // TODO: Check if tier changed from previous month and send notification email
        // const previousTier = await getPreviousMonthTier(aeId, input.year, input.month);
        // if (previousTier && previousTier !== result.tier) {
        //   await notifyTierChangeIfApplicable(
        //     aeId,
        //     profile.name,
        //     profile.email || '',
        //     previousTier,
        //     result.tier,
        //     input.month,
        //     input.year,
        //     { arrUsd: avgArrUsd, demosPw: avgDemosPw, dialsPw: avgDialsPw },
        //     getTierTargets(result.tier)
        //   );
        // }

        return {
          ...result,
          avgArrUsd,
          avgDemosPw,
          avgDialsPw,
          avgRetentionRate,
          isNewJoiner: newJoiner,
          isTeamLeader: profile.isTeamLeader,
          last3Months: last3.map((m) => ({
            label: `${MONTH_NAMES[m.month - 1]} ${m.year}`,
            arrUsd: m.arrUsd,
            demosTotal: m.demosTotal,
            dialsTotal: m.dialsTotal,
          })),
          lastSyncedAt: allMetrics.length > 0 ? (allMetrics[0] as any).updatedAt ?? null : null,
        };
      }),

    // Calculate tier from manual inputs (for preview without saving)
    preview: publicProcedure
      .input(
        z.object({
          months: z.array(
            z.object({
              arrUsd: z.number().min(0),
              demosTotal: z.number().int().min(0),
              dialsTotal: z.number().int().min(0),
            })
          ).min(1).max(3),
          retentionRate: z.number().min(0).max(100).nullable().optional(),
          isNewJoiner: z.boolean().default(false),
          isTeamLeader: z.boolean().default(false),
        })
      )
      .query(async ({ input }) => {
        const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(
          input.months.map((m, i) => ({ ...m, year: 2026, month: i + 1, retentionRate: null }))
        );

        const result = calculateTier({
          avgArrUsd,
          avgDemosPw,
          avgDialsPw,
           avgRetentionRate: input.retentionRate ?? null,
          isNewJoiner: input.isNewJoiner,
          isTeamLeader: input.isTeamLeader,
        });
        return { ...result, avgArrUsd, avgDemosPw, avgDialsPw };
      }),
  }),

  // ─── Deals ─────────────────────────────────────────────────────────────────
  deals: router({
    // Add a new deal and generate commission payout schedule
    create: publicProcedure
      .input(
        z.object({
          customerName: z.string().min(1).max(256),
          contractType: z.enum(["annual", "monthly"]),
          startYear: z.number().int(),
          startMonth: z.number().int().min(1).max(12),
          startDay: z.number().int().min(1).max(31),
          // Support both old arrUsd (for backward compat) and new originalAmount+originalCurrency
          arrUsd: z.number().positive().optional(),
          originalAmount: z.number().positive().optional(),
          originalCurrency: z.enum(["USD", "EUR", "GBP"]).default("USD"),
          onboardingFeePaid: z.boolean(),
          isReferral: z.boolean(),
          billingFrequency: z.enum(["annual", "monthly"]).default("annual"),
          // Optionally override tier (otherwise auto-calculated)
          tierOverride: z.enum(["bronze", "silver", "gold"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });

        const profile = await getAeProfileById(aeId);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND" });

        // Import FX service for live rates
        const { convertToUsd, getCurrentFxRates } = await import("./fxService");

        // Convert currency to USD using live FX rates
        let arrUsd = input.arrUsd ?? 0;
        let originalAmount = input.originalAmount ?? arrUsd;
        let originalCurrency = input.originalCurrency ?? "USD";
        let conversionRate = 1.0;

        if (input.originalAmount) {
          originalAmount = input.originalAmount;
          originalCurrency = input.originalCurrency;
          
          if (originalCurrency !== "USD") {
            // Fetch live FX rates
            const { usdAmount, rate } = await convertToUsd(
              originalAmount,
              originalCurrency
            );
            arrUsd = usdAmount;
            conversionRate = rate;
          } else {
            conversionRate = 1.0;
            arrUsd = originalAmount;
          }
        } else if (!input.arrUsd) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Either arrUsd or originalAmount is required" });
        }

        // Determine tier for the contract start month
        let tier: Tier;
        if (input.tierOverride) {
          tier = input.tierOverride;
        } else {
          const allMetrics = await getMetricsForAe(aeId, 9);
          const targetDate = new Date(input.startYear, input.startMonth - 1, 1);
          // For new AEs, only include months after their join date
          const joinDate = new Date(profile.joinDate);
          const last3 = allMetrics
            .filter((m) => {
              const monthDate = new Date(m.year, m.month - 1, 1);
              return monthDate < targetDate && monthDate >= joinDate;
            })
            .slice(0, 3)
            .map((m) => {
              // Apply grace period: if month is within 6 months of join date, assume $25k ARR
              const monthDate = new Date(m.year, m.month - 1, 1);
              const monthsSinceJoin = (monthDate.getFullYear() - joinDate.getFullYear()) * 12 + (monthDate.getMonth() - joinDate.getMonth());
              const arrUsd = monthsSinceJoin >= 0 && monthsSinceJoin < 6 ? 25000 : Number(m.arrUsd);
              return {
                year: m.year,
                month: m.month,
                arrUsd,
                demosTotal: m.demosTotal,
                dialsTotal: m.dialsTotal,
                retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
              };
            });
          const last6 = allMetrics
            .filter((m) => {
              const monthDate = new Date(m.year, m.month - 1, 1);
              return monthDate < targetDate && monthDate >= joinDate;
            })
            .slice(0, 6)
            .map((m) => {
              // Apply grace period: if month is within 6 months of join date, assume $25k ARR
              const monthDate = new Date(m.year, m.month - 1, 1);
              const monthsSinceJoin = (monthDate.getFullYear() - joinDate.getFullYear()) * 12 + (monthDate.getMonth() - joinDate.getMonth());
              const arrUsd = monthsSinceJoin >= 0 && monthsSinceJoin < 6 ? 25000 : Number(m.arrUsd);
              return {
                year: m.year,
                month: m.month,
                arrUsd,
                demosTotal: m.demosTotal,
                dialsTotal: m.dialsTotal,
                retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
              };
            });

          const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3, new Date(profile.joinDate));
          const avgRetentionRate = computeAvgRetention(last6);
          const newJoiner = isNewJoiner(profile.joinDate, targetDate);

          const tierResult = calculateTier({
            avgArrUsd,
            avgDemosPw,
            avgDialsPw,
            avgRetentionRate,
            isNewJoiner: newJoiner,
            isTeamLeader: profile.isTeamLeader,
          });
          tier = tierResult.tier;
        }

        // Fetch live FX rate
        const fxRate = await fetchUsdToGbpRate();

        // Get active commission structure for payout rules
        const activeStructure = await getActiveCommissionStructure();

        // Calculate commission
        const commResult = calculateCommission({
          contractType: input.contractType,
          arrUsd,
          tier,
          onboardingFeePaid: input.onboardingFeePaid,
          isReferral: input.isReferral,
          fxRateUsdToGbp: fxRate,
          monthlyPayoutMonths: activeStructure ? Number(activeStructure.monthlyPayoutMonths) : undefined,
          onboardingDeductionGbp: activeStructure ? Number(activeStructure.onboardingDeductionGbp) : undefined,
          onboardingArrReductionUsd: activeStructure ? Number(activeStructure.onboardingArrReductionUsd) : undefined,
        });

        // Get live FX rates and lock GBP rate at deal creation
        const liveRates = await getCurrentFxRates();
        const fxRateLockedAtCreation = liveRates.GBP; // Lock GBP rate for payouts
        const now = new Date();

        // Save deal (with reference to the active commission structure)
        const dealId = await createDeal({
          aeId,
          customerName: input.customerName,
          contractType: input.contractType,
          startYear: input.startYear,
          startMonth: input.startMonth,
          startDay: input.startDay,
          originalAmount: String(originalAmount),
          originalCurrency,
          arrUsd: String(arrUsd),
          conversionRate: String(conversionRate),
          onboardingFeePaid: input.onboardingFeePaid,
          isReferral: input.isReferral,
          tierAtStart: tier,
          fxRateAtEntry: String(fxRate),
          fxRateAtWon: String(fxRate),
          fxRateLockedAtCreation: String(fxRateLockedAtCreation),
          dealSignedDate: now,
          fxRateLockDate: now,
          billingFrequency: input.billingFrequency,
          commissionStructureId: activeStructure?.id ?? null,
          notes: null,
        });

        // Generate payout schedule — payouts start 1 month AFTER contract start date
        const payouts = commResult.payoutSchedule.map((p, i) => {
          const payoutDate = addMonths(input.startYear, input.startMonth, i + 1);
          return {
            dealId,
            aeId,
            payoutYear: payoutDate.year,
            payoutMonth: payoutDate.month,
            payoutNumber: p.payoutNumber,
            grossCommissionUsd: String(p.grossCommissionUsd),
            referralDeductionUsd: String(p.referralDeductionUsd),
            onboardingDeductionGbp: String(p.onboardingDeductionGbp),
            netCommissionUsd: String(p.netCommissionUsd),
            fxRateUsed: String(fxRate),
            netCommissionGbp: String(p.netCommissionGbp),
          };
        });

        await createPayoutsForDeal(payouts);

        return {
          dealId,
          tier,
          fxRate,
          commissionResult: {
            ...commResult,
            payoutSchedule: commResult.payoutSchedule,
          },
        };
      }),

    // List all deals for current AE
    list: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
      const dealList = await getDealsForAe(aeId);
      return dealList.map((d) => ({
        ...d,
        arrUsd: Number(d.arrUsd),
        fxRateAtEntry: Number(d.fxRateAtEntry),
      }));
    }),

    // Get payouts for a specific deal
    getPayouts: publicProcedure
      .input(z.object({ dealId: z.number().int() }))
      .query(async ({ input, ctx }) => {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
        const deal = await getDealById(input.dealId);
        if (!deal || deal.aeId !== aeId) throw new TRPCError({ code: "FORBIDDEN" });
        const payouts = await getPayoutsForDeal(input.dealId);
        return payouts.map((p) => ({
          ...p,
          grossCommissionUsd: Number(p.grossCommissionUsd),
          referralDeductionUsd: Number(p.referralDeductionUsd),
          onboardingDeductionGbp: Number(p.onboardingDeductionGbp),
          netCommissionUsd: Number(p.netCommissionUsd),
          fxRateUsed: Number(p.fxRateUsed),
          netCommissionGbp: Number(p.netCommissionGbp),
        }));
      }),

    // Update deal contract type and recalculate commission
    update: publicProcedure
      .input(
        z.object({
          dealId: z.number().int(),
          contractType: z.enum(["annual", "monthly"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
        const deal = await getDealById(input.dealId);
        if (!deal || deal.aeId !== aeId) throw new TRPCError({ code: "FORBIDDEN" });

        if (input.contractType && input.contractType !== deal.contractType) {
          // Update contract type
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
          await db
            .update(deals)
            .set({ contractType: input.contractType })
            .where(eq(deals.id, input.dealId));

          // Recalculate commission with new contract type
          const activeStructure = await getActiveCommissionStructure();
          const commResult = calculateCommission({
            contractType: input.contractType,
            arrUsd: Number(deal.arrUsd),
            tier: deal.tierAtStart as Tier,
            onboardingFeePaid: deal.onboardingFeePaid,
            isReferral: deal.isReferral,
            fxRateUsdToGbp: Number(deal.fxRateAtWon ?? deal.fxRateAtEntry ?? 0.7850),
            monthlyPayoutMonths: activeStructure ? Number(activeStructure.monthlyPayoutMonths) : undefined,
            onboardingDeductionGbp: activeStructure ? Number(activeStructure.onboardingDeductionGbp) : undefined,
            onboardingArrReductionUsd: activeStructure ? Number(activeStructure.onboardingArrReductionUsd) : undefined,
          });

          // Delete old payouts
          await deletePayoutsForDeal(input.dealId);

          // Create new payouts — payouts start 1 month AFTER contract start date
          const payouts = commResult.payoutSchedule.map((p, i) => {
            const payoutDate = addMonths(deal.startYear, deal.startMonth, i + 1);
            return {
              dealId: input.dealId,
              aeId: aeId,
              payoutYear: payoutDate.year,
              payoutMonth: payoutDate.month,
              payoutNumber: p.payoutNumber,
              grossCommissionUsd: p.grossCommissionUsd.toString(),
              referralDeductionUsd: p.referralDeductionUsd.toString(),
              onboardingDeductionGbp: p.onboardingDeductionGbp.toString(),
              netCommissionUsd: p.netCommissionUsd.toString(),
              fxRateUsed: (deal.fxRateAtWon ?? deal.fxRateAtEntry).toString(),
              netCommissionGbp: p.netCommissionGbp.toString(),
            } as InsertCommissionPayout;
          });
          if (payouts.length > 0) {
            await createPayoutsForDeal(payouts);
          }
        }

        return { success: true };
      }),

    // Update contract start date and re-attribute ARR to correct month
    updateContractStartDate: publicProcedure
      .input(
        z.object({
          dealId: z.number().int(),
          startYear: z.number().int(),
          startMonth: z.number().int().min(1).max(12),
          startDay: z.number().int().min(1).max(31),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
        const deal = await getDealById(input.dealId);
        if (!deal || deal.aeId !== aeId) throw new TRPCError({ code: "FORBIDDEN" });

        // Update contract start date
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        await db
          .update(deals)
          .set({
            startYear: input.startYear,
            startMonth: input.startMonth,
            startDay: input.startDay,
          })
          .where(eq(deals.id, input.dealId));

        // Recalculate commission with new contract start date
        const activeStructure = await getActiveCommissionStructure();
        const commResult = calculateCommission({
          contractType: deal.contractType,
          arrUsd: Number(deal.arrUsd),
          tier: deal.tierAtStart as Tier,
          onboardingFeePaid: deal.onboardingFeePaid,
          isReferral: deal.isReferral,
          fxRateUsdToGbp: Number(deal.fxRateAtWon ?? deal.fxRateAtEntry ?? 0.7850),
          monthlyPayoutMonths: activeStructure ? Number(activeStructure.monthlyPayoutMonths) : undefined,
          onboardingDeductionGbp: activeStructure ? Number(activeStructure.onboardingDeductionGbp) : undefined,
          onboardingArrReductionUsd: activeStructure ? Number(activeStructure.onboardingArrReductionUsd) : undefined,
        });

        // Delete old payouts
        await deletePayoutsForDeal(input.dealId);

        // Create new payouts with new contract start date — payouts start 1 month AFTER contract start date
        const payouts = commResult.payoutSchedule.map((p, i) => {
          const payoutDate = addMonths(input.startYear, input.startMonth, i + 1);
          return {
            dealId: input.dealId,
            aeId: aeId,
            payoutYear: payoutDate.year,
            payoutMonth: payoutDate.month,
            payoutNumber: p.payoutNumber,
            grossCommissionUsd: p.grossCommissionUsd.toString(),
            referralDeductionUsd: p.referralDeductionUsd.toString(),
            onboardingDeductionGbp: p.onboardingDeductionGbp.toString(),
            netCommissionUsd: p.netCommissionUsd.toString(),
            fxRateUsed: (deal.fxRateAtWon ?? deal.fxRateAtEntry).toString(),
            netCommissionGbp: p.netCommissionGbp.toString(),
          } as InsertCommissionPayout;
        });
        if (payouts.length > 0) {
          await createPayoutsForDeal(payouts);
        }

        return { success: true };
      }),

    // Delete a deal and its payouts
    delete: publicProcedure
      .input(z.object({ dealId: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
        const deal = await getDealById(input.dealId);
        if (!deal || deal.aeId !== aeId) throw new TRPCError({ code: "FORBIDDEN" });
        await deletePayoutsForDeal(input.dealId);
        await deleteDeal(input.dealId, aeId);
        return { success: true };
      }),

    markChurned: publicProcedure
      .input(
        z.object({
          dealId: z.number().int(),
          churnYear: z.number().int(),
          churnMonth: z.number().int().min(1).max(12),
          churnReason: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
        const deal = await getDealById(input.dealId);
        if (!deal || deal.aeId !== aeId) throw new TRPCError({ code: "FORBIDDEN" });

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        await db
          .update(deals)
          .set({
            isChurned: true,
            churnMonth: input.churnMonth,
            churnYear: input.churnYear,
            churnReason: input.churnReason || null,
          })
          .where(eq(deals.id, input.dealId));

        const payouts = await getPayoutsForDeal(input.dealId);
        const payoutsToDelete = payouts.filter(
          (p) => p.payoutYear > input.churnYear || (p.payoutYear === input.churnYear && p.payoutMonth > input.churnMonth)
        );

        for (const payout of payoutsToDelete) {
          await db.delete(commissionPayouts).where(eq(commissionPayouts.id, payout.id));
        }

        return { success: true, payoutsDeleted: payoutsToDelete.length };
      }),
  }),

  // ─── Commission Summary ─────────────────────────────────────────────────────
  commission: router({
    // Monthly summary: total commission by month
    monthlySummary: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });

      const allPayouts = await getPayoutsForAe(aeId);
      const allDeals = await getDealsForAe(aeId);
      const dealMap = new Map(allDeals.map((d) => [d.id, d]));

      // Group by year+month
      const monthMap = new Map<
        string,
        {
          year: number;
          month: number;
          totalGbp: number;
          totalUsd: number;
          payouts: Array<{
            dealId: number;
            customerName: string;
            netCommissionGbp: number;
            netCommissionUsd: number;
            payoutNumber: number;
            tier: string;
          }>;
        }
      >();

      for (const p of allPayouts) {
        const key = `${p.payoutYear}-${String(p.payoutMonth).padStart(2, "0")}`;
        if (!monthMap.has(key)) {
          monthMap.set(key, {
            year: p.payoutYear,
            month: p.payoutMonth,
            totalGbp: 0,
            totalUsd: 0,
            payouts: [],
          });
        }
        const entry = monthMap.get(key)!;
        const netGbp = Number(p.netCommissionGbp);
        const netUsd = Number(p.netCommissionUsd);
        entry.totalGbp += netGbp;
        entry.totalUsd += netUsd;
        const deal = dealMap.get(p.dealId);
        entry.payouts.push({
          dealId: p.dealId,
          customerName: deal?.customerName ?? "Unknown",
          netCommissionGbp: netGbp,
          netCommissionUsd: netUsd,
          payoutNumber: p.payoutNumber,
          tier: deal?.tierAtStart ?? "bronze",
        });
      }

      return Array.from(monthMap.values()).sort(
        (a, b) => b.year * 100 + b.month - (a.year * 100 + a.month)
      );
    }),

    // Get live FX rate
    fxRate: publicProcedure.query(async () => {
      const rateGbp = await fetchUsdToGbpRate();
      const rates = await fetchLiveRates();
      const rateEur = rates.EUR ? 1 / rates.EUR : 0.8656;
      return { usdToGbp: rateGbp, usdToEur: rateEur, fetchedAt: new Date().toISOString() };
    }),

    // Payout calendar: all payouts grouped by month, split into past/current/future
    payoutCalendar: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
      }
      
      const payouts = await getPayoutsForAe(aeId);
      const allDeals = await getDealsForAe(aeId);
      const dealMap = new Map(allDeals.map((d) => [d.id, d]));

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      // Group by year+month
      type CalendarMonth = {
        year: number;
        month: number;
        totalGbp: number;
        status: "past" | "current" | "future";
        payouts: Array<{
          dealId: number;
          customerName: string;
          contractType: string;
          tierAtStart: string;
          netCommissionGbp: number;
          payoutNumber: number;
          totalPayouts: number;
          isReferral: boolean;
          onboardingFeePaid: boolean;
        }>;
      };

      const monthMap = new Map<string, CalendarMonth>();

      for (const p of payouts) {
        const deal = dealMap.get(p.dealId);
        
        // Skip payouts for churned deals
        if (deal?.isChurned) continue;
        
        // For monthly deals with churn date, skip payouts after 1 month post-churn
        // (AMFG pays 1 month in arrears, so last payout is 1 month after churn)
        if (deal?.contractType === "monthly" && deal?.churnYear && deal?.churnMonth) {
          const payoutDate = p.payoutYear * 100 + p.payoutMonth;
          const churnDate = deal.churnYear * 100 + deal.churnMonth;
          const lastPayoutDate = churnDate + 1; // 1 month after churn
          if (payoutDate > lastPayoutDate) continue;
        }
        
        const key = `${p.payoutYear}-${String(p.payoutMonth).padStart(2, "0")}`;
        if (!monthMap.has(key)) {
          const yr = p.payoutYear;
          const mo = p.payoutMonth;
          let status: "past" | "current" | "future";
          if (yr < currentYear || (yr === currentYear && mo < currentMonth)) {
            status = "past";
          } else if (yr === currentYear && mo === currentMonth) {
            status = "current";
          } else {
            status = "future";
          }
          monthMap.set(key, { year: yr, month: mo, totalGbp: 0, status, payouts: [] });
        }
        const entry = monthMap.get(key)!;
        const netGbp = Number(p.netCommissionGbp);
        entry.totalGbp += netGbp;

        // Count total payouts for this deal
        const dealPayoutCount = payouts.filter(pp => pp.dealId === p.dealId).length;

        entry.payouts.push({
          dealId: p.dealId,
          customerName: deal?.customerName ?? "Unknown",
          contractType: deal?.contractType ?? "monthly",
          tierAtStart: deal?.tierAtStart ?? "bronze",
          netCommissionGbp: netGbp,
          payoutNumber: p.payoutNumber,
          totalPayouts: dealPayoutCount,
          isReferral: deal?.isReferral ?? false,
          onboardingFeePaid: deal?.onboardingFeePaid ?? true,
        });
      }

      const sorted = Array.from(monthMap.values()).sort(
        (a, b) => a.year * 100 + a.month - (b.year * 100 + b.month)
      );

      // Also compute running totals
      let runningTotal = 0;
      const withRunning = sorted.map((m) => {
        if (m.status !== "past") runningTotal += m.totalGbp;
        return { ...m, runningFutureTotal: runningTotal };
      });

      return {
        months: withRunning,
        totalFutureGbp: sorted
          .filter((m) => m.status === "future" || m.status === "current")
          .reduce((sum, m) => sum + m.totalGbp, 0),
        totalPastGbp: sorted
          .filter((m) => m.status === "past")
          .reduce((sum, m) => sum + m.totalGbp, 0),
        currentMonthGbp: sorted
          .filter((m) => m.status === "current")
          .reduce((sum, m) => sum + m.totalGbp, 0),
      };
    }),

    // Refresh payouts: recompute for all deals (handles churn + contract type changes)
    refreshAll: publicProcedure.mutation(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const allDeals = await getDealsForAe(aeId);
      const { calculateCommission } = await import("../shared/commission");
      const { getCurrentFxRates } = await import("./fxService");

      let payoutsRefreshed = 0;
      let payoutsDeleted = 0;

      for (const deal of allDeals) {
        // Delete all existing payouts for this deal
        const existingPayouts = await db.select().from(commissionPayouts).where(eq(commissionPayouts.dealId, deal.id));
        for (const p of existingPayouts) {
          await db.delete(commissionPayouts).where(eq(commissionPayouts.id, p.id));
          payoutsDeleted++;
        }

        // Skip if churned — don't regenerate payouts
        if (deal.isChurned) continue;

        // Recalculate commission payouts
        const arrUsd = Number(deal.arrUsd);
        let fxRate = 1.0;
        if (deal.fxRateLockedAtCreation) {
          fxRate = Number(deal.fxRateLockedAtCreation);
        } else {
          const rates = await getCurrentFxRates();
          fxRate = rates.GBP; // GBP is the USD to GBP rate
        }

        const activeStructure = await getActiveCommissionStructure();
        const bronzeRate = Number(activeStructure?.bronzeRate || 0.13);
        const silverRate = Number(activeStructure?.silverRate || 0.16);
        const goldRate = Number(activeStructure?.goldRate || 0.19);
        const tierRate = deal.tierAtStart === "silver" ? silverRate : deal.tierAtStart === "gold" ? goldRate : bronzeRate;

        const commissionResult = calculateCommission({
          arrUsd,
          contractType: deal.contractType,
          tier: deal.tierAtStart,
          isReferral: deal.isReferral,
          onboardingFeePaid: deal.onboardingFeePaid,
          fxRateUsdToGbp: fxRate,
        });

        // Generate payout records
        const startYear = deal.startYear;
        const startMonth = deal.startMonth;

        for (let i = 0; i < commissionResult.payoutSchedule.length; i++) {
          const payout = commissionResult.payoutSchedule[i];
          const payoutMonthOffset = i + 1; // First payout is 1 month after contract start
          let payoutYear = startYear;
          let payoutMonth = startMonth + payoutMonthOffset;

          while (payoutMonth > 12) {
            payoutMonth -= 12;
            payoutYear += 1;
          }

          const netCommissionGbp = Number(payout) * fxRate;
          const referralDeduction = deal.isReferral ? Number(payout) * 0.5 : 0;
          const onboardingDeduction = deal.onboardingFeePaid ? 0 : 500 / fxRate; // GBP 500 deduction if not paid

          await db.insert(commissionPayouts).values({
            aeId,
            dealId: deal.id,
            payoutYear,
            payoutMonth,
            payoutNumber: i + 1,
            grossCommissionUsd: payout.toString(),
            referralDeductionUsd: referralDeduction.toString(),
            onboardingDeductionGbp: onboardingDeduction.toString(),
            netCommissionUsd: payout.toString(),
            fxRateUsed: fxRate.toString(),
            netCommissionGbp: netCommissionGbp.toString(),
          });
          payoutsRefreshed++;
        }
      }

      return { success: true, payoutsRefreshed, payoutsDeleted };
    }),

    // Resync all payouts from scratch (team leader only)
    resyncAllPayouts: publicProcedure.mutation(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      return resyncAllPayouts(aeId);
    }),

    /**
     * Dashboard summary: MTD commission, YTD commission, pipeline (future payouts),
     * best-ever month, and the next 3 upcoming payout months.
     */
    dashboardSummary: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });

      const allPayouts = await getPayoutsForAe(aeId);
      const allDeals = await getDealsForAe(aeId);
      const dealMap = new Map(allDeals.map((d) => [d.id, d]));

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      // MTD: payouts for current month
      const mtdGbp = allPayouts
        .filter((p) => p.payoutYear === currentYear && p.payoutMonth === currentMonth)
        .reduce((s, p) => s + Number(p.netCommissionGbp), 0);

      // YTD: payouts for current calendar year (past + current months only)
      const ytdGbp = allPayouts
        .filter((p) => p.payoutYear === currentYear && p.payoutMonth <= currentMonth)
        .reduce((s, p) => s + Number(p.netCommissionGbp), 0);

      // Pipeline: all future payouts (months strictly after current)
      const pipelineGbp = allPayouts
        .filter(
          (p) =>
            p.payoutYear > currentYear ||
            (p.payoutYear === currentYear && p.payoutMonth > currentMonth)
        )
        .reduce((s, p) => s + Number(p.netCommissionGbp), 0);

      // Best single month ever (past + current)
      const monthTotals = new Map<string, number>();
      for (const p of allPayouts) {
        const isPastOrCurrent =
          p.payoutYear < currentYear ||
          (p.payoutYear === currentYear && p.payoutMonth <= currentMonth);
        if (!isPastOrCurrent) continue;
        const key = `${p.payoutYear}-${String(p.payoutMonth).padStart(2, "0")}`;
        monthTotals.set(key, (monthTotals.get(key) ?? 0) + Number(p.netCommissionGbp));
      }
      const bestMonthGbp = monthTotals.size > 0 ? Math.max(...Array.from(monthTotals.values())) : 0;

      // Next 3 upcoming payout months (future only, sorted ascending)
      type MonthEntry = {
        year: number;
        month: number;
        totalGbp: number;
        payouts: Array<{
          customerName: string;
          netCommissionGbp: number;
          payoutNumber: number;
          totalPayouts: number;
        }>;
      };
      const futureMap = new Map<string, MonthEntry>();
      for (const p of allPayouts) {
        const isFuture =
          p.payoutYear > currentYear ||
          (p.payoutYear === currentYear && p.payoutMonth > currentMonth);
        if (!isFuture) continue;
        const key = `${p.payoutYear}-${String(p.payoutMonth).padStart(2, "0")}`;
        if (!futureMap.has(key)) {
          futureMap.set(key, { year: p.payoutYear, month: p.payoutMonth, totalGbp: 0, payouts: [] });
        }
        const entry = futureMap.get(key)!;
        const netGbp = Number(p.netCommissionGbp);
        entry.totalGbp += netGbp;
        const deal = dealMap.get(p.dealId);
        const dealPayoutCount = allPayouts.filter((pp) => pp.dealId === p.dealId).length;
        entry.payouts.push({
          customerName: deal?.customerName ?? "Unknown",
          netCommissionGbp: netGbp,
          payoutNumber: p.payoutNumber,
          totalPayouts: dealPayoutCount,
        });
      }
      const next3Months = Array.from(futureMap.values())
        .sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month))
        .slice(0, 2);

      // Streak: consecutive months at Silver or above (rolling 3-month avg meets Silver targets)
      // Walk backwards month by month from current month, check if tier was Silver or Gold
      const allMetrics = await getMetricsForAe(aeId, 24);
      const profile = await getAeProfileById(aeId);
      let streakMonths = 0;
      // Check up to 24 months back
      for (let i = 0; i < 24; i++) {
        const targetDate = new Date(currentYear, currentMonth - 1 - i, 1);
        const tYear = targetDate.getFullYear();
        const tMonth = targetDate.getMonth() + 1;
        // Get last 3 months of metrics ending at this month
        const window = allMetrics
          .filter((m) => {
            const d = new Date(m.year, m.month - 1, 1);
            return d <= targetDate;
          })
          .slice(0, 3);
        if (window.length === 0) break;
        const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(
          window.map((m) => ({
            year: m.year, month: m.month,
            arrUsd: Number(m.arrUsd),
            demosTotal: m.demosTotal,
            dialsTotal: m.dialsTotal,
          })) as any,
          profile?.joinDate ? new Date(profile.joinDate) : null
        );
        const avgRetention = window.reduce((s, m) => s + (m.retentionRate != null ? Number(m.retentionRate) : 0), 0) / window.length;
        const tierResult = calculateTier({
          avgArrUsd, avgDemosPw, avgDialsPw,
          avgRetentionRate: avgRetention || null,
          isNewJoiner: isNewJoiner(profile?.joinDate || new Date(), targetDate),
          isTeamLeader: profile?.isTeamLeader || false,
        });
        if (tierResult.tier === "silver" || tierResult.tier === "gold") {
          streakMonths++;
        } else {
          break;
        }
      }

      return {
        mtdGbp,
        ytdGbp,
        pipelineGbp,
        bestMonthGbp,
        streakMonths,
        next3Months,
      };
    }),
  }),

  // --- Spreadsheet Sync ────────────────────────────────────────────────────
  spreadsheetSync: spreadsheetSyncRouter,
  pipedriveSync: pipedriveSyncRouter,
  voipSync: voipSyncRouter,

  // ─── Data Audit ───────────────────────────────────────────────────────────
  dataAudit: router({
    /**
     * Returns all monthly metrics for all AEs, grouped by AE.
     * Team leader only. Used for the data audit view.
     */
    allMetrics: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const profile = await getAeProfileById(aeId);
      if (!profile?.isTeamLeader) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Team leader access required." });
      }

      const allProfiles = await getAllAeProfiles();
      const result = await Promise.all(
        allProfiles.map(async (ae) => {
          const metrics = await getMetricsForAe(ae.id, 24);
          return {
            aeId: ae.id,
            aeName: ae.name,
            joinDate: ae.joinDate,
            isTeamLeader: ae.isTeamLeader,
            metrics: metrics.map((m) => ({
              year: m.year,
              month: m.month,
              arrUsd: Number(m.arrUsd),
              demosTotal: m.demosTotal,
              demosFromPipedrive: m.demosFromPipedrive,
              dialsTotal: m.dialsTotal,
              retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
              connectedDials: m.connectedDials ?? 0,
              connectionRate: m.connectionRate != null ? Number(m.connectionRate) : null,
              talkTimeSecs: m.talkTimeSecs ?? 0,
            })),
          };
        })
      );

      return result;
    }),
  }),

  // ─── Commission Structure Management ──────────────────────────────────────
  commissionStructure: router({
    // List all versions
    list: publicProcedure.query(async () => {
      const structures = await getAllCommissionStructures();
      return structures.map((s) => ({
        ...s,
        bronzeRate: Number(s.bronzeRate),
        silverRate: Number(s.silverRate),
        goldRate: Number(s.goldRate),
        onboardingDeductionGbp: Number(s.onboardingDeductionGbp),
        onboardingArrReductionUsd: Number(s.onboardingArrReductionUsd),
        standardTargets: s.standardTargets as StructureTargets,
        teamLeaderTargets: s.teamLeaderTargets as StructureTargets,
      }));
    }),

    // Get the currently active version
    getActive: publicProcedure.query(async () => {
      const s = await getActiveCommissionStructure();
      if (!s) return null;
      return {
        ...s,
        bronzeRate: Number(s.bronzeRate),
        silverRate: Number(s.silverRate),
        goldRate: Number(s.goldRate),
        onboardingDeductionGbp: Number(s.onboardingDeductionGbp),
        onboardingArrReductionUsd: Number(s.onboardingArrReductionUsd),
        standardTargets: s.standardTargets as StructureTargets,
        teamLeaderTargets: s.teamLeaderTargets as StructureTargets,
      };
    }),

    // Create a new version (draft, not yet active) — team leader only
    create: publicProcedure
      .input(
        z.object({
          versionLabel: z.string().min(1).max(128),
          effectiveFrom: z.string(), // ISO date string
          bronzeRate: z.number().min(0).max(1),
          silverRate: z.number().min(0).max(1),
          goldRate: z.number().min(0).max(1),
          standardTargets: z.object({
            silver: z.object({ arrUsd: z.number(), demosPw: z.number(), dialsPw: z.number(), retentionMin: z.number() }),
            gold:   z.object({ arrUsd: z.number(), demosPw: z.number(), dialsPw: z.number(), retentionMin: z.number() }),
          }),
          teamLeaderTargets: z.object({
            silver: z.object({ arrUsd: z.number(), demosPw: z.number(), dialsPw: z.number(), retentionMin: z.number() }),
            gold:   z.object({ arrUsd: z.number(), demosPw: z.number(), dialsPw: z.number(), retentionMin: z.number() }),
          }),
          monthlyPayoutMonths: z.number().int().min(1).max(60).default(13),
          onboardingDeductionGbp: z.number().min(0),
          onboardingArrReductionUsd: z.number().min(0),
          notes: z.string().optional(),
          createdBy: z.string().min(1).max(128).default("admin"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const callerId = getAeIdFromCtx(ctx);
        if (!callerId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
        const caller = await getAeProfileById(callerId);
        if (!caller?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN", message: "Team leader access required." });
        const id = await createCommissionStructure({
          versionLabel: input.versionLabel,
          effectiveFrom: new Date(input.effectiveFrom),
          isActive: false,
          bronzeRate: String(input.bronzeRate),
          silverRate: String(input.silverRate),
          goldRate: String(input.goldRate),
          standardTargets: input.standardTargets,
          teamLeaderTargets: input.teamLeaderTargets,
          monthlyPayoutMonths: input.monthlyPayoutMonths,
          onboardingDeductionGbp: String(input.onboardingDeductionGbp),
          onboardingArrReductionUsd: String(input.onboardingArrReductionUsd),
          notes: input.notes ?? null,
          createdBy: input.createdBy,
        });
        return { id };
      }),

    // Update a draft version (cannot edit active version's rates — create a new one) — team leader only
    update: publicProcedure
      .input(
        z.object({
          id: z.number().int(),
          versionLabel: z.string().min(1).max(128).optional(),
          effectiveFrom: z.string().optional(),
          bronzeRate: z.number().min(0).max(1).optional(),
          silverRate: z.number().min(0).max(1).optional(),
          goldRate: z.number().min(0).max(1).optional(),
          standardTargets: z.object({
            silver: z.object({ arrUsd: z.number(), demosPw: z.number(), dialsPw: z.number(), retentionMin: z.number() }),
            gold:   z.object({ arrUsd: z.number(), demosPw: z.number(), dialsPw: z.number(), retentionMin: z.number() }),
          }).optional(),
          teamLeaderTargets: z.object({
            silver: z.object({ arrUsd: z.number(), demosPw: z.number(), dialsPw: z.number(), retentionMin: z.number() }),
            gold:   z.object({ arrUsd: z.number(), demosPw: z.number(), dialsPw: z.number(), retentionMin: z.number() }),
          }).optional(),
          monthlyPayoutMonths: z.number().int().min(1).max(60).optional(),
          onboardingDeductionGbp: z.number().min(0).optional(),
          onboardingArrReductionUsd: z.number().min(0).optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const callerId = getAeIdFromCtx(ctx);
        if (!callerId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
        const caller = await getAeProfileById(callerId);
        if (!caller?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN", message: "Team leader access required." });
        const { id, effectiveFrom, bronzeRate, silverRate, goldRate,
                onboardingDeductionGbp, onboardingArrReductionUsd, ...rest } = input;
        const patch: Record<string, unknown> = { ...rest };
        if (effectiveFrom) patch.effectiveFrom = new Date(effectiveFrom);
        if (bronzeRate !== undefined) patch.bronzeRate = String(bronzeRate);
        if (silverRate !== undefined) patch.silverRate = String(silverRate);
        if (goldRate !== undefined) patch.goldRate = String(goldRate);
        if (onboardingDeductionGbp !== undefined) patch.onboardingDeductionGbp = String(onboardingDeductionGbp);
        if (onboardingArrReductionUsd !== undefined) patch.onboardingArrReductionUsd = String(onboardingArrReductionUsd);
        await updateCommissionStructure(id, patch);
        return { success: true };
      }),

    // Activate a version (deactivates all others) — team leader only
    activate: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const callerId = getAeIdFromCtx(ctx);
        if (!callerId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
        const caller = await getAeProfileById(callerId);
        if (!caller?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN", message: "Team leader access required." });
        const structure = await getCommissionStructureById(input.id);
        if (!structure) throw new TRPCError({ code: "NOT_FOUND", message: "Commission structure not found." });
        await activateCommissionStructure(input.id);
        return { success: true, activatedId: input.id };
      }),
    // Get current live FX rates
    getCurrentFxRates: publicProcedure.query(async () => {
      const { getCurrentFxRates } = await import("./fxService");
      const rates = await getCurrentFxRates();
      return {
        usd: rates.USD,
        eur: Number(rates.EUR.toFixed(6)),
        gbp: Number(rates.GBP.toFixed(6)),
        timestamp: rates.timestamp,
      };
    }),

    // Get FX rate for a specific deal (locked rate + current rate for comparison)
    dealFxInfo: publicProcedure
      .input(z.object({ dealId: z.number() }))
      .query(async ({ input, ctx }) => {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });

        const deal = await getDealById(input.dealId);
        if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
        if (deal.aeId !== aeId) throw new TRPCError({ code: "FORBIDDEN" });

        const { getCurrentFxRates } = await import("./fxService");
        const currentRates = await getCurrentFxRates();
        const { formatPayoutInfo } = await import("./lockedFxPayoutHelper");

        const lockedRate = Number(deal.fxRateLockedAtCreation || deal.fxRateAtEntry);
        const formatted = formatPayoutInfo(deal, lockedRate, currentRates.GBP);

        return formatted;
      }),

    // Get team commissions for a specific month (admin only)
    teamCommissions: publicProcedure
      .input(z.object({ month: z.number().min(1).max(12), year: z.number().min(2020).max(2100) }))
      .query(async ({ input, ctx }) => {
        const callerId = getAeIdFromCtx(ctx);
        if (!callerId) throw new TRPCError({ code: "UNAUTHORIZED" });

        const caller = await getAeProfileById(callerId);
        if (!caller?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN" });

        // Get all team members (all AEs)
        const allAes = await getAllAeProfiles();
        const teamMemberIds = allAes.map((ae) => ae.id);

        if (teamMemberIds.length === 0) {
          return { commissions: [] };
        }

        // Get payouts for team members for the specified month
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const payouts = await db
          .select()
          .from(commissionPayouts)
          .where(
            and(
              inArray(commissionPayouts.aeId, teamMemberIds),
              eq(commissionPayouts.payoutYear, input.year),
              eq(commissionPayouts.payoutMonth, input.month)
            )
          );

        // Get deals for context
        const allDeals = await db.select().from(deals);
        const dealMap = new Map(allDeals.map((d) => [d.id, d]));

        // Group payouts by AE
        const commissionsByAe = new Map<
          number,
          {
            aeId: number;
            aeName: string;
            dealCount: number;
            payoutCount: number;
            totalNetGbp: number;
            totalNetUsd: number;
            payouts: Array<{
              customerName: string;
              payoutNumber: number;
              tier: string;
              netCommissionGbp: number;
              netCommissionUsd: number;
            }>;
          }
        >();

        for (const payout of payouts) {
          const ae = allAes.find((m) => m.id === payout.aeId);
          if (!ae) continue;

          if (!commissionsByAe.has(payout.aeId)) {
            commissionsByAe.set(payout.aeId, {
              aeId: payout.aeId,
              aeName: ae.name,
              dealCount: 0,
              payoutCount: 0,
              totalNetGbp: 0,
              totalNetUsd: 0,
              payouts: [],
            });
          }

          const entry = commissionsByAe.get(payout.aeId)!;
          const deal = dealMap.get(payout.dealId) as any;
          const netGbp = Number(payout.netCommissionGbp);
          const netUsd = Number(payout.netCommissionUsd);

          entry.totalNetGbp += netGbp;
          entry.totalNetUsd += netUsd;
          entry.payoutCount += 1;

          entry.payouts.push({
            customerName: deal?.customerName ?? "Unknown",
            payoutNumber: payout.payoutNumber,
            tier: deal?.tierAtStart ?? "unknown",
            netCommissionGbp: netGbp,
            netCommissionUsd: netUsd,
          });
        }

        // Add tier for each AE — prefer locked tier_snapshots (authoritative month-end records),
        // fall back to live rolling-average calculation if no snapshot exists.
        const db2 = await getDb();
        const allSnapshots = db2
          ? await db2.select().from(tierSnapshots)
              .where(and(
                eq(tierSnapshots.snapshotYear, input.year),
                eq(tierSnapshots.snapshotMonth, input.month)
              ))
          : [];
        const snapshotMap = new Map(allSnapshots.map((s) => [s.aeId, s.tier]));

        const commissionsWithTier = await Promise.all(
          Array.from(commissionsByAe.values()).map(async (c: any) => {
            const aeProfile = allAes.find((m) => m.id === c.aeId);
            let currentTier: string = "bronze";
            try {
              // 1. Use locked snapshot if available
              const snapshot = snapshotMap.get(c.aeId);
              if (snapshot) {
                currentTier = snapshot;
              } else if (aeProfile) {
                // 2. Fall back to live rolling-average calculation
                const last3Months = await getMetricsForAeBefore(
                  c.aeId,
                  input.year,
                  input.month,
                  3
                );
                const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(
                  last3Months.map((m) => ({
                    year: m.year,
                    month: m.month,
                    arrUsd: Number(m.arrUsd),
                    demosTotal: m.demosTotal,
                    dialsTotal: m.dialsTotal,
                    retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
                  })),
                  new Date(aeProfile.joinDate)
                );
                const tierResult = calculateTier({
                  avgArrUsd,
                  avgDemosPw,
                  avgDialsPw,
                  avgRetentionRate: null,
                  isNewJoiner: false,
                  isTeamLeader: aeProfile.isTeamLeader,
                });
                currentTier = tierResult.tier;
              }
            } catch {
              // fallback to bronze if tier calculation fails
            }
            return {
              ...c,
              dealCount: new Set(c.payouts.map((p: any) => p.customerName)).size,
              totalNetGbp: Number(c.totalNetGbp.toFixed(2)),
              totalNetUsd: Number(c.totalNetUsd.toFixed(2)),
              currentTier,
            };
          })
        );

        return { commissions: commissionsWithTier };
      }),

    sendMonthlyTierReport: protectedProcedure
      .input(
        z.object({
          reportMonth: z.number().min(1).max(12),
          reportYear: z.number().min(2020),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const callerId = getAeIdFromCtx(ctx);
        if (!callerId) throw new TRPCError({ code: "UNAUTHORIZED" });

        const caller = await getAeProfileById(callerId);
        if (!caller?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN" });

        // Import here to avoid circular dependency
        const { sendTierReportEmail, calculateTier: calcTier, getTierRate } = await import(
          "./tierReportEmailService"
        );

        const { reportMonth, reportYear } = input;

        // Calculate previous month
        let previousMonth = reportMonth - 1;
        let previousYear = reportYear;
        if (previousMonth < 1) {
          previousMonth = 12;
          previousYear -= 1;
        }

        // Get all AEs
        const aeCommissions = await getAllAeProfiles();
        const tierData: Array<any> = [];

        for (const ae of aeCommissions) {
          // Get current month commission
          const currentMonthPayouts = await getPayoutsForMonth(ae.id, reportMonth, reportYear);
          const currentCommission = currentMonthPayouts.reduce(
            (sum: number, p: any) => sum + (p.netCommissionGbp || 0),
            0
          );

          // Get previous month commission
          const previousMonthPayouts = await getPayoutsForMonth(
            ae.id,
            previousMonth,
            previousYear
          );
          const previousCommission = previousMonthPayouts.reduce(
            (sum: number, p: any) => sum + (p.netCommissionGbp || 0),
            0
          );

          // Calculate tiers
          const currentTier = calcTier(currentCommission);
          const previousTier = calcTier(previousCommission);

          tierData.push({
            id: ae.id,
            name: ae.name,
            currentTier: currentTier as string,
            currentRate: getTierRate(currentTier as string),
            previousTier: previousTier as string,
            previousRate: getTierRate(previousTier as string),
            totalCommissionGbp: currentCommission,
            dealCount: currentMonthPayouts.length,
          });
        }

        // Send email
        const emailSent = await sendTierReportEmail(
          tierData as any,
          reportMonth,
          reportYear,
          previousMonth,
          previousYear
        );

        if (!emailSent) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to send tier report" });
        }

        return {
          success: true,
          message: `Tier report sent for ${reportMonth}/${reportYear}`,
          aeCount: tierData.length,
        };
      }),

    // ─── Tier Change Notifications ─────────────────────────────────────────
    // Manual trigger for tier change check (team leaders only)
    checkTierChanges: protectedProcedure
      .input(
        z.object({
          month: z.number().min(1).max(12).optional(),
          year: z.number().min(2020).max(2100).optional(),
        }).optional()
      )
      .mutation(async ({ ctx, input }) => {
        const callerId = getAeIdFromCtx(ctx);
        if (!callerId) throw new TRPCError({ code: "UNAUTHORIZED" });
        const caller = await getAeProfileById(callerId);
        if (!caller?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN", message: "Only team leaders can trigger tier change checks" });

        const { checkAndNotifyTierChanges } = await import("./tierChangeNotifier");
        const results = await checkAndNotifyTierChanges(input?.month, input?.year);

        return {
          success: true,
          results,
          notificationsSent: results.filter((r) => r.notificationSent).length,
          changesDetected: results.filter((r) => !r.skipped).length,
          totalChecked: results.length,
        };
      }),

    // Get notification history for the current AE
    myNotificationHistory: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(50).default(10) }).optional())
      .query(async ({ ctx, input }) => {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });
        const { getNotificationHistory } = await import("./tierChangeNotifier");
        return getNotificationHistory(aeId, input?.limit ?? 10);
      }),

    // Get all recent notifications (team leaders only)
    allNotificationHistory: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
      .query(async ({ ctx, input }) => {
        const callerId = getAeIdFromCtx(ctx);
        if (!callerId) throw new TRPCError({ code: "UNAUTHORIZED" });
        const caller = await getAeProfileById(callerId);
        if (!caller?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN" });
        const { getAllRecentNotifications } = await import("./tierChangeNotifier");
        return getAllRecentNotifications(input?.limit ?? 50);
      }),

    // Tier forecast: 3-month projection with actionable targets
    tierForecast: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const ae = await getAeProfileById(aeId);
      if (!ae) throw new TRPCError({ code: "NOT_FOUND", message: "AE not found" });

      // Get current tier and metrics (join-date-bounded months)
      const last3MonthsRaw = await getMetricsForAe(aeId, 3);
      const joinDate = new Date(ae.joinDate);

      // Convert decimal strings from MySQL to numbers (arrUsd is a DECIMAL column)
      const last3Months = last3MonthsRaw.map((m) => {
        const monthDate = new Date(m.year, m.month - 1, 1);
        const monthsSinceJoin =
          (monthDate.getFullYear() - joinDate.getFullYear()) * 12 +
          (monthDate.getMonth() - joinDate.getMonth());
        // Apply grace period: within 6 months of join, assume $25k ARR
        const arrUsd = monthsSinceJoin >= 0 && monthsSinceJoin < 6 ? 25000 : Number(m.arrUsd);
        return {
          year: m.year,
          month: m.month,
          arrUsd,
          demosTotal: m.demosTotal,
          dialsTotal: m.dialsTotal,
          retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
        };
      });

      const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3Months, joinDate);
      const tierResult = calculateTier({
        avgArrUsd,
        avgDemosPw,
        avgDialsPw,
        avgRetentionRate: null,
        isNewJoiner: isNewJoiner(ae.joinDate),
        isTeamLeader: ae.isTeamLeader,
      });

      // Fetch all deals to calculate projected monthly metrics
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
      const allDeals = await db.select().from(deals).where(eq(deals.aeId, aeId));

      // Helper: check if a deal is active in a given month
      const isDealActiveInMonth = (deal: typeof deals.$inferSelect, year: number, month: number): boolean => {
        if (!deal.contractStartDate) return false;
        const startDate = new Date(deal.contractStartDate);
        const startYear = startDate.getFullYear();
        const startMonth = startDate.getMonth() + 1;
        const isChurned = deal.isChurned && deal.churnYear && deal.churnMonth;
        const churnYear = deal.churnYear ?? 0;
        const churnMonth = deal.churnMonth ?? 0;
        const startedByMonth = startYear < year || (startYear === year && startMonth <= month);
        const notChurnedByMonth = !isChurned || churnYear > year || (churnYear === year && churnMonth > month);
        return startedByMonth && notChurnedByMonth;
      };

      // Build projected months: last 3 actual months + next 3 projected months
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const projectedMonths: Array<{ year: number; month: number; arrUsd: number; demosTotal: number; dialsTotal: number }> = [];

      // Add last 3 months + current month from monthly_metrics (for rolling average calculation)
      for (const m of last3Months) {
        projectedMonths.push({
          year: m.year,
          month: m.month,
          arrUsd: Number(m.arrUsd),
          demosTotal: m.demosTotal,
          dialsTotal: m.dialsTotal,
        });
      }
      // Also add current month if not already in last3Months
      const currentMonthInMetrics = last3Months.find(m => m.year === currentYear && m.month === currentMonth);
      if (!currentMonthInMetrics) {
        projectedMonths.push({
          year: currentYear,
          month: currentMonth,
          arrUsd: 0, // Assume $0 for current month if not yet recorded
          demosTotal: 0,
          dialsTotal: 0,
        });
      }

      // Add next 3 months (include deals with future contract start dates)
      for (let i = 1; i <= 3; i++) {
        let projYear = currentYear;
        let projMonth = currentMonth + i;
        if (projMonth > 12) {
          projMonth -= 12;
          projYear += 1;
        }
        // Include deals that start in this month (based on contract start date)
        const futureDealsArr = allDeals
          .filter((d: typeof deals.$inferSelect) => d.startYear === projYear && d.startMonth === projMonth)
          .reduce((sum: number, d: typeof deals.$inferSelect) => sum + (Number(d.arrUsd) || 0), 0);
        projectedMonths.push({
          year: projYear,
          month: projMonth,
          arrUsd: futureDealsArr, // Include pending deals with future contract start dates
          demosTotal: 0,
          dialsTotal: 0,
        });
      }

      const { calculateTierForecast } = await import("./tierForecastHelper");
      const forecast = calculateTierForecast(
        tierResult.tier,
        {
          arrUsd: avgArrUsd,
          demosPw: avgDemosPw,
          dialsPw: avgDialsPw,
        },
        projectedMonths,
        ae.isTeamLeader
      );

      // Add lastSyncedAt from the most recent month's data
      const lastSyncedAt = last3Months.length > 0 ? new Date(last3Months[0].year, last3Months[0].month - 1, 1) : new Date();
      return {
        ...forecast,
        lastSyncedAt,
      };
    }),
  }),

  // ─── Admin Utilities ─────────────────────────────────────────────────────
  validation: validationRouter,
  demo: demoRouter,
  admin: router({
    fixCAxisMonth: publicProcedure.mutation(async ({ ctx }) => {
      const callerId = getAeIdFromCtx(ctx);
      if (!callerId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const caller = await getAeProfileById(callerId);
      if (!caller?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN" });
      
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      // Find and fix C-Axis deal
      const cAxisDeal = await db.select().from(deals).where(like(deals.customerName, '%C-Axis%')).limit(1);
      if (cAxisDeal.length === 0) return { success: false, message: 'C-Axis deal not found' };
      
      const deal = cAxisDeal[0];
      if (deal.startMonth !== 2) {
        await db.update(deals).set({ startMonth: 2 }).where(eq(deals.id, deal.id));
        return { success: true, message: `Updated C-Axis from month ${deal.startMonth} to February (2)` };
      }
      return { success: true, message: 'C-Axis already in February' };
    }),
    
    recalculateAllTiers: publicProcedure.mutation(async ({ ctx }) => {
      const callerId = getAeIdFromCtx(ctx);
      if (!callerId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const caller = await getAeProfileById(callerId);
      if (!caller?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN" });
      
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      // Get all deals and recalculate their tiers
      const allDeals = await db.select().from(deals);
      let updated = 0;
      
      for (const deal of allDeals) {
        const metrics = await getMetricsForAe(deal.aeId);
        const targetDate = new Date(deal.startYear, deal.startMonth - 1, 1);
        const last3 = metrics.filter((m) => {
          const d = new Date(m.year, m.month - 1, 1);
          return d < targetDate;
        }).slice(0, 3);
        
        if (last3.length > 0) {
          const profile = await getAeProfileById(deal.aeId);
          const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3 as any, profile?.joinDate ? new Date(profile.joinDate) : null);
          const avgRetention = computeAvgRetention(last3 as any);
          const newJoiner = isNewJoiner(profile?.joinDate || new Date(), targetDate);
          const tier = calculateTier({
            avgArrUsd,
            avgDemosPw,
            avgDialsPw,
            avgRetentionRate: avgRetention,
            isNewJoiner: newJoiner,
            isTeamLeader: profile?.isTeamLeader || false,
          });
          
          if (tier.tier !== deal.tierAtStart) {
            await db.update(deals).set({ tierAtStart: tier.tier }).where(eq(deals.id, deal.id));
            updated++;
          }
        }
      }
      
      return { success: true, message: `Recalculated ${updated} deal tiers` };
    }),
  }),

  // ─── Leaderboard ──────────────────────────────────────────────────────────
  tierSnapshot: router({
    /**
     * Capture (or overwrite) the tier snapshot for a given AE and month.
     * Team-leader only. Useful for month-end locking.
     */
    snapshotMonth: protectedProcedure
      .input(
        z.object({
          aeId: z.number().int().positive(),
          year: z.number().int().min(2020),
          month: z.number().int().min(1).max(12),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const callerId = getAeIdFromCtx(ctx);
        if (!callerId) throw new TRPCError({ code: "UNAUTHORIZED" });
        const db2 = await getDb();
        if (!db2) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [callerProfile] = await db2.select().from(aeProfiles).where(eq(aeProfiles.id, callerId)).limit(1);
        if (!callerProfile?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN" });

        const [aeProfile] = await db2.select().from(aeProfiles).where(eq(aeProfiles.id, input.aeId)).limit(1);
        if (!aeProfile) throw new TRPCError({ code: "NOT_FOUND", message: "AE not found" });

        const last3 = await getMetricsForAeBefore(input.aeId, input.year, input.month, 3);
        const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(
          last3.map((m) => ({
            year: m.year, month: m.month,
            arrUsd: Number(m.arrUsd),
            demosTotal: m.demosTotal,
            dialsTotal: m.dialsTotal,
            retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
          })),
          new Date(aeProfile.joinDate)
        );
        const { tier } = calculateTier({ avgArrUsd, avgDemosPw, avgDialsPw, avgRetentionRate: null, isNewJoiner: false, isTeamLeader: aeProfile.isTeamLeader });

        await db2
          .insert(tierSnapshots)
          .values({
            aeId: input.aeId,
            snapshotYear: input.year,
            snapshotMonth: input.month,
            tier: tier as "bronze" | "silver" | "gold",
            avgArrUsd: String(avgArrUsd.toFixed(2)),
            avgDemosPw: String(avgDemosPw.toFixed(2)),
            avgDialsPw: String(avgDialsPw.toFixed(2)),
          })
          .onDuplicateKeyUpdate({
            set: {
              tier: tier as "bronze" | "silver" | "gold",
              avgArrUsd: String(avgArrUsd.toFixed(2)),
              avgDemosPw: String(avgDemosPw.toFixed(2)),
              avgDialsPw: String(avgDialsPw.toFixed(2)),
            },
          });

        return { success: true, aeId: input.aeId, year: input.year, month: input.month, tier };
      }),

    /**
     * Backfill tier snapshots for ALL AEs for ALL months that have monthly_metrics data.
     * Team-leader only. Safe to run multiple times (upsert).
     */
    backfillAll: protectedProcedure.mutation(async ({ ctx }) => {
      const callerId = getAeIdFromCtx(ctx);
      if (!callerId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db2 = await getDb();
      if (!db2) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [callerProfile] = await db2.select().from(aeProfiles).where(eq(aeProfiles.id, callerId)).limit(1);
      if (!callerProfile?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN" });

      const allAes = await db2.select().from(aeProfiles);
      const allMetrics = await db2.select().from(monthlyMetrics);

      // Collect unique year/month combos from metrics
      const monthSet = new Set(allMetrics.map((m) => `${m.year}-${m.month}`));
      const months = Array.from(monthSet)
        .map((k) => { const [y, mo] = k.split("-"); return { year: Number(y), month: Number(mo) }; })
        .sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month));

      let snapshotted = 0;
      for (const ae of allAes) {
        for (const { year, month } of months) {
          try {
            const last3 = await getMetricsForAeBefore(ae.id, year, month, 3);
            const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(
              last3.map((m) => ({
                year: m.year, month: m.month,
                arrUsd: Number(m.arrUsd),
                demosTotal: m.demosTotal,
                dialsTotal: m.dialsTotal,
                retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
              })),
              new Date(ae.joinDate)
            );
            const { tier } = calculateTier({ avgArrUsd, avgDemosPw, avgDialsPw, avgRetentionRate: null, isNewJoiner: false, isTeamLeader: ae.isTeamLeader });
            await db2
              .insert(tierSnapshots)
              .values({
                aeId: ae.id,
                snapshotYear: year,
                snapshotMonth: month,
                tier: tier as "bronze" | "silver" | "gold",
                avgArrUsd: String(avgArrUsd.toFixed(2)),
                avgDemosPw: String(avgDemosPw.toFixed(2)),
                avgDialsPw: String(avgDialsPw.toFixed(2)),
              })
              .onDuplicateKeyUpdate({
                set: {
                  tier: tier as "bronze" | "silver" | "gold",
                  avgArrUsd: String(avgArrUsd.toFixed(2)),
                  avgDemosPw: String(avgDemosPw.toFixed(2)),
                  avgDialsPw: String(avgDialsPw.toFixed(2)),
                },
              });
            snapshotted++;
          } catch { /* skip individual failures */ }
        }
      }
      return { success: true, snapshotted };
    }),
  }),

  leaderboard: router({
    get: publicProcedure
      .input(
        z.object({
          period: z.enum(["current_quarter", "last_quarter", "ytd", "all_time"]).default("current_quarter"),
        })
      )
      .query(async ({ input, ctx }) => {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Determine date range for the period
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // 1-indexed
        const currentQuarter = Math.ceil(currentMonth / 3);

        let fromYear: number, fromMonth: number, toYear: number, toMonth: number;

        if (input.period === "current_quarter") {
          fromMonth = (currentQuarter - 1) * 3 + 1;
          fromYear = currentYear;
          toMonth = currentMonth;
          toYear = currentYear;
        } else if (input.period === "last_quarter") {
          const lq = currentQuarter === 1 ? 4 : currentQuarter - 1;
          const ly = currentQuarter === 1 ? currentYear - 1 : currentYear;
          fromMonth = (lq - 1) * 3 + 1;
          fromYear = ly;
          toMonth = lq * 3;
          toYear = ly;
        } else if (input.period === "ytd") {
          fromMonth = 1;
          fromYear = currentYear;
          toMonth = currentMonth;
          toYear = currentYear;
        } else {
          // all_time: last 24 months
          const d = new Date(now);
          d.setMonth(d.getMonth() - 24);
          fromYear = d.getFullYear();
          fromMonth = d.getMonth() + 1;
          toYear = currentYear;
          toMonth = currentMonth;
        }

        // Get all active AE profiles
        const profiles = await db
          .select()
          .from(aeProfiles)
          .where(eq(aeProfiles.isActive, true));

        // Get metrics for all AEs in the period
        const metricsRows = await db
          .select()
          .from(monthlyMetrics)
          .where(
            and(
              or(
                and(
                  eq(monthlyMetrics.year, fromYear),
                  gte(monthlyMetrics.month, fromMonth)
                ),
                and(
                  gt(monthlyMetrics.year, fromYear),
                  lt(monthlyMetrics.year, toYear)
                ),
                and(
                  eq(monthlyMetrics.year, toYear),
                  lte(monthlyMetrics.month, toMonth)
                )
              )
            )
          );

        // Get deals for all AEs in the period (for ARR signed)
        const dealsRows = await db
          .select()
          .from(deals)
          .where(
            and(
              or(
                and(
                  eq(deals.startYear, fromYear),
                  gte(deals.startMonth, fromMonth)
                ),
                and(
                  gt(deals.startYear, fromYear),
                  lt(deals.startYear, toYear)
                ),
                and(
                  eq(deals.startYear, toYear),
                  lte(deals.startMonth, toMonth)
                )
              )
            )
          );

        // Aggregate per AE
        const entries = profiles.map((profile) => {
          const myMetrics = metricsRows.filter((m) => m.aeId === profile.id);
          const myDeals = dealsRows.filter((d) => d.aeId === profile.id);

          const totalDials = myMetrics.reduce((s, m) => s + (m.dialsTotal ?? 0), 0);
          const totalDemos = myMetrics.reduce((s, m) => s + (m.demosTotal ?? 0), 0);
          const totalArrUsd = myDeals.reduce((s, d) => s + Number(d.arrUsd), 0);
          const dealCount = myDeals.length;

          // Current tier (based on most recent 3 months)
          const recentMetrics = myMetrics
            .sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)
            .slice(0, 3);
          const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(
            recentMetrics.map((m) => ({
              year: m.year,
              month: m.month,
              arrUsd: Number(m.arrUsd),
              demosTotal: m.demosTotal,
              dialsTotal: m.dialsTotal,
            })) as any,
            new Date(profile.joinDate)
          );
          const tierResult = calculateTier({
            avgArrUsd,
            avgDemosPw,
            avgDialsPw,
            avgRetentionRate: null,
            isNewJoiner: isNewJoiner(profile.joinDate, now),
            isTeamLeader: profile.isTeamLeader,
          });

          return {
            aeId: profile.id,
            name: profile.name,
            isTeamLeader: profile.isTeamLeader,
            tier: tierResult.tier,
            totalArrUsd,
            totalDials,
            totalDemos,
            dealCount,
            isCurrentAe: profile.id === aeId,
          };
        });

        // Sort by ARR descending
        const ranked = entries
          .sort((a, b) => b.totalArrUsd - a.totalArrUsd)
          .map((e, idx) => ({ ...e, rank: idx + 1 }));

        return {
          entries: ranked,
          period: input.period,
          fromYear,
          fromMonth,
          toYear,
          toMonth,
        };
      }),
  }),
});
export type AppRouter = typeof appRouter;
