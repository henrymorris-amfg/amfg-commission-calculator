import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getAeIdFromCtx } from "./aeTokenUtils";
import {
  getAeProfileById,
  getAllAeProfiles,
  getMetricsForAe,
  getDb,
} from "./db";
import { deals } from "../drizzle/schema";
import {
  calculateTier,
  computeAvgRetention,
  computeRollingAverages,
  isNewJoiner,
} from "../shared/commission";

export const validationRouter = router({
  validateAllTiers: publicProcedure.query(async ({ ctx }) => {
    const callerId = getAeIdFromCtx(ctx);
    if (!callerId) throw new TRPCError({ code: "UNAUTHORIZED" });
    const caller = await getAeProfileById(callerId);
    if (!caller?.isTeamLeader) throw new TRPCError({ code: "FORBIDDEN" });

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Get all deals
    const allDeals = await db.select().from(deals);
    const aeProfiles = await getAllAeProfiles();

    const mismatches: any[] = [];

    for (const deal of allDeals) {
      const profile = aeProfiles.find((p) => p.id === deal.aeId);
      if (!profile) continue;

      const metrics = await getMetricsForAe(deal.aeId);
      const targetDate = new Date(deal.startYear, deal.startMonth - 1, 1);
      const last3 = metrics
        .filter((m) => {
          const d = new Date(m.year, m.month - 1, 1);
          return d < targetDate;
        })
        .slice(-3);

      let expectedTier = "bronze";
      let avgArr = 0,
        avgDemos = 0,
        avgDials = 0;

      if (last3.length > 0) {
        const { avgArrUsd, avgDemosPw, avgDialsPw } =
          computeRollingAverages(last3 as any);
        avgArr = avgArrUsd;
        avgDemos = avgDemosPw;
        avgDials = avgDialsPw;

        const newJoiner = isNewJoiner(profile.joinDate, targetDate);
        const tier = calculateTier({
          avgArrUsd,
          avgDemosPw,
          avgDialsPw,
          avgRetentionRate: computeAvgRetention(last3 as any),
          isNewJoiner: newJoiner,
          isTeamLeader: profile.isTeamLeader || false,
        });
        expectedTier = tier.tier;
      }

      if (expectedTier !== deal.tierAtStart) {
        mismatches.push({
          id: deal.id,
          dealName: deal.customerName,
          ae: profile.name,
          date: `${deal.startYear}-${String(deal.startMonth).padStart(2, "0")}`,
          expected: expectedTier,
          actual: deal.tierAtStart,
          metrics: {
            avgArr: avgArr.toFixed(0),
            avgDemos: avgDemos.toFixed(1),
            avgDials: avgDials.toFixed(0),
          },
        });
      }
    }

    return { mismatches, total: allDeals.length };
  }),
});
