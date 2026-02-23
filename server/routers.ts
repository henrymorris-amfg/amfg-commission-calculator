import { TRPCError } from "@trpc/server";
import { spreadsheetSyncRouter } from "./spreadsheetSync";
import { pipedriveSyncRouter } from "./pipedriveSync";
import { voipSyncRouter } from "./voipSync";
import * as bcrypt from "bcryptjs";
import { makeAeToken, getAeIdFromCtx } from "./aeAuth";
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
} from "./db";

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
    // Save or update metrics for a given month
    upsert: publicProcedure
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12),
          arrUsd: z.number().min(0),
          demosTotal: z.number().int().min(0),
          dialsTotal: z.number().int().min(0),
          retentionRate: z.number().min(0).max(100).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
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

    // Get recent metrics for current AE
    list: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
      const rows = await getMetricsForAe(aeId, 6);
      return rows.map((r) => ({
        ...r,
        arrUsd: Number(r.arrUsd),
        retentionRate: r.retentionRate != null ? Number(r.retentionRate) : null,
      }));
    }),

    // Get metric for a specific month
    getForMonth: publicProcedure
      .input(z.object({ year: z.number().int(), month: z.number().int() }))
      .query(async ({ input, ctx }) => {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });
        const row = await getMetricsForMonth(aeId, input.year, input.month);
        if (!row) return null;
        return {
          ...row,
          arrUsd: Number(row.arrUsd),
          retentionRate: row.retentionRate != null ? Number(row.retentionRate) : null,
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
          .map((m) => ({
            year: m.year,
            month: m.month,
            arrUsd: Number(m.arrUsd),
            demosTotal: m.demosTotal,
            dialsTotal: m.dialsTotal,
            retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
          }));

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
          }));

        const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3);
        const avgRetentionRate = computeAvgRetention(last6);
        const newJoiner = isNewJoiner(profile.joinDate, targetDate);

        const result = calculateTier({
          avgArrUsd,
          avgDemosPw,
          avgDialsPw,
          avgRetentionRate,
          isNewJoiner: newJoiner,
          isTeamLeader: profile.isTeamLeader,
        });

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
          arrUsd: z.number().positive(),
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
            .map((m) => ({
              year: m.year,
              month: m.month,
              arrUsd: Number(m.arrUsd),
              demosTotal: m.demosTotal,
              dialsTotal: m.dialsTotal,
              retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
            }));
          const last6 = allMetrics
            .filter((m) => {
              const monthDate = new Date(m.year, m.month - 1, 1);
              return monthDate < targetDate && monthDate >= joinDate;
            })
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
          arrUsd: input.arrUsd,
          tier,
          onboardingFeePaid: input.onboardingFeePaid,
          isReferral: input.isReferral,
          fxRateUsdToGbp: fxRate,
          monthlyPayoutMonths: activeStructure ? Number(activeStructure.monthlyPayoutMonths) : undefined,
          onboardingDeductionGbp: activeStructure ? Number(activeStructure.onboardingDeductionGbp) : undefined,
          onboardingArrReductionUsd: activeStructure ? Number(activeStructure.onboardingArrReductionUsd) : undefined,
        });

        // Save deal (with reference to the active commission structure)
        const dealId = await createDeal({
          aeId,
          customerName: input.customerName,
          contractType: input.contractType,
          startYear: input.startYear,
          startMonth: input.startMonth,
          startDay: input.startDay,
          arrUsd: String(input.arrUsd),
          onboardingFeePaid: input.onboardingFeePaid,
          isReferral: input.isReferral,
          tierAtStart: tier,
          fxRateAtEntry: String(fxRate),
          fxRateAtWon: String(fxRate),
          billingFrequency: input.billingFrequency,
          commissionStructureId: activeStructure?.id ?? null,
          notes: null,
        });

        // Generate payout schedule
        const payouts = commResult.payoutSchedule.map((p, i) => {
          const payoutDate = addMonths(input.startYear, input.startMonth, i);
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
      const rate = await fetchUsdToGbpRate();
      return { usdToGbp: rate, fetchedAt: new Date().toISOString() };
    }),

    // Payout calendar: all payouts grouped by month, split into past/current/future
    payoutCalendar: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in." });

      const allPayouts = await getPayoutsForAe(aeId);
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

      for (const p of allPayouts) {
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
        const deal = dealMap.get(p.dealId);

        // Count total payouts for this deal
        const dealPayoutCount = allPayouts.filter(pp => pp.dealId === p.dealId).length;

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
  }),

  // ─── Spreadsheet Sync ────────────────────────────────────────────────────
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
  }),
});

export type AppRouter = typeof appRouter;
