/**
 * tRPC Procedures for Demo Detection
 * Handles demo flag queries and acknowledgments
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getUnacknowledgedFlagsForAe, acknowledgeDuplicateDemoFlag, acknowledgeCrmHygieneIssue } from "./demoDuplicateDetection";
import { triggerDemoDetectionManually } from "./demoDetectionScheduler";
import { TRPCError } from "@trpc/server";
import { getAeIdFromCtx } from "./aeTokenUtils";
import { getAeProfileById } from "./db";

export const demoRouter = router({
  /**
   * Get unacknowledged demo flags for current AE
   */
  getUnacknowledgedFlags: protectedProcedure.query(async ({ ctx }) => {
    try {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const { duplicateDemos, hygieneIssues } = await getUnacknowledgedFlagsForAe(aeId);

      return {
        duplicateDemos: duplicateDemos.map((flag: any) => ({
          id: flag.id,
          organizationName: flag.organizationName,
          demoDate: flag.demoDate,
          notes: flag.notes,
          type: "duplicate",
        })),
        hygieneIssues: hygieneIssues.map((issue: any) => ({
          id: issue.id,
          organizationName: issue.organizationName || issue.personName || issue.leadTitle,
          demoDate: issue.demoDate,
          explanation: issue.explanation,
          issueType: issue.issueType,
          type: "hygiene",
        })),
      };
    } catch (error) {
      console.error("[DemoProcedures] Error getting flags:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    }
  }),

  /**
   * Acknowledge a duplicate demo flag
   */
  acknowledgeDuplicateFlag: protectedProcedure
    .input(z.object({ flagId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });

        const success = await acknowledgeDuplicateDemoFlag(input.flagId);

        if (!success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to acknowledge flag" });
        }

        return { success: true };
      } catch (error) {
        console.error("[DemoProcedures] Error acknowledging flag:", error);
        throw error;
      }
    }),

  /**
   * Acknowledge a CRM hygiene issue
   */
  acknowledgeHygieneIssue: protectedProcedure
    .input(z.object({ issueId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const aeId = getAeIdFromCtx(ctx);
        if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });

        const success = await acknowledgeCrmHygieneIssue(input.issueId);

        if (!success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to acknowledge issue" });
        }

        return { success: true };
      } catch (error) {
        console.error("[DemoProcedures] Error acknowledging issue:", error);
        throw error;
      }
    }),

  /**
   * Manual trigger for demo detection (admin only)
   */
  triggerDetection: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });

      // Check if user is team leader
      const ae = await getAeProfileById(aeId);
      if (!ae?.isTeamLeader) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only team leaders can trigger detection" });
      }

      await triggerDemoDetectionManually();

      return {
        success: true,
        message: "Demo detection triggered successfully",
      };
    } catch (error) {
      console.error("[DemoProcedures] Error triggering detection:", error);
      throw error;
    }
  }),
});
