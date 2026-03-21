/**
 * tRPC Procedures for Demo Detection
 * Handles demo flag queries and acknowledgments
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  getUnacknowledgedFlagsForAe,
  acknowledgeDuplicateDemoFlag,
  acknowledgeCrmHygieneIssue,
} from "./demoDuplicateDetection";
import { triggerDemoDetectionManually } from "./demoDetectionScheduler";
import { TRPCError } from "@trpc/server";
import { getAeIdFromCtx } from "./aeTokenUtils";
import { getAeProfileById, getAllAeProfiles, getDb } from "./db";
import { duplicateDemoFlags, crmHygieneIssues } from "../drizzle/schema";
import type { DuplicateDemoFlag, CrmHygieneIssue } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const demoRouter = router({
  /**
   * Get unacknowledged demo flags for current AE
   */
  getUnacknowledgedFlags: protectedProcedure.query(async ({ ctx }) => {
    try {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const { duplicateDemos, hygieneIssues } =
        await getUnacknowledgedFlagsForAe(aeId);

      return {
        duplicateDemos: duplicateDemos.map((flag: DuplicateDemoFlag) => ({
          id: flag.id,
          organizationName: flag.organizationName,
          demoDate: flag.demoDate,
          notes: flag.notes,
          type: "duplicate" as const,
        })),
        hygieneIssues: hygieneIssues.map((issue: CrmHygieneIssue) => ({
          id: issue.id,
          organizationName:
            issue.organizationName || issue.personName || issue.leadTitle,
          demoDate: issue.demoDate,
          explanation: issue.explanation,
          issueType: issue.issueType,
          type: "hygiene" as const,
        })),
      };
    } catch (error) {
      console.error("[DemoProcedures] Error getting flags:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    }
  }),

  /**
   * Get ALL demo flags across all AEs (admin only)
   */
  getAllFlags: protectedProcedure.query(async ({ ctx }) => {
    const aeId = getAeIdFromCtx(ctx);
    if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const ae = await getAeProfileById(aeId);
    if (!ae?.isTeamLeader) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only team leaders can view all flags",
      });
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const allProfiles = await getAllAeProfiles();
    const aeMap = new Map(allProfiles.map((p) => [p.id, p.name]));

    const allDuplicates = await db.select().from(duplicateDemoFlags);
    const allHygiene = await db.select().from(crmHygieneIssues);

    return {
      duplicateDemos: allDuplicates.map((flag: DuplicateDemoFlag) => ({
        id: flag.id,
        aeId: flag.aeId,
        aeName: aeMap.get(flag.aeId) ?? "Unknown",
        organizationName: flag.organizationName,
        demoDate: flag.demoDate,
        isDuplicate: flag.isDuplicate,
        isAcknowledged: flag.isAcknowledged,
        notes: flag.notes,
        type: "duplicate" as const,
      })),
      hygieneIssues: allHygiene.map((issue: CrmHygieneIssue) => ({
        id: issue.id,
        aeId: issue.aeId,
        aeName: aeMap.get(issue.aeId) ?? "Unknown",
        organizationName:
          issue.organizationName || issue.personName || issue.leadTitle,
        demoDate: issue.demoDate,
        issueType: issue.issueType,
        isAcknowledged: issue.isAcknowledged,
        explanation: issue.explanation,
        type: "hygiene" as const,
      })),
    };
  }),

  /**
   * Get all hygiene issues (admin only) — alias for getAllFlags.hygieneIssues
   */
  getAllHygieneIssues: protectedProcedure.query(async ({ ctx }) => {
    const aeId = getAeIdFromCtx(ctx);
    if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const ae = await getAeProfileById(aeId);
    if (!ae?.isTeamLeader) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const allProfiles = await getAllAeProfiles();
    const aeMap = new Map(allProfiles.map((p) => [p.id, p.name]));

    const allHygiene = await db.select().from(crmHygieneIssues);

    return allHygiene.map((issue: CrmHygieneIssue) => ({
      id: issue.id,
      aeId: issue.aeId,
      aeName: aeMap.get(issue.aeId) ?? "Unknown",
      organizationName:
        issue.organizationName || issue.personName || issue.leadTitle,
      demoDate: issue.demoDate,
      issueType: issue.issueType,
      isAcknowledged: issue.isAcknowledged,
      explanation: issue.explanation,
    }));
  }),

  /**
   * Bulk acknowledge duplicate demo flags (admin only)
   */
  bulkAcknowledgeFlags: protectedProcedure
    .input(z.object({ flagIds: z.array(z.number()) }))
    .mutation(async ({ ctx, input }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const ae = await getAeProfileById(aeId);
      if (!ae?.isTeamLeader) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      for (const flagId of input.flagIds) {
        await acknowledgeDuplicateDemoFlag(flagId);
      }

      return { success: true, acknowledged: input.flagIds.length };
    }),

  /**
   * Bulk delete / resolve hygiene issues (admin only)
   */
  bulkDeleteFlags: protectedProcedure
    .input(z.object({ issueIds: z.array(z.number()) }))
    .mutation(async ({ ctx, input }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const ae = await getAeProfileById(aeId);
      if (!ae?.isTeamLeader) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      for (const issueId of input.issueIds) {
        await db
          .delete(crmHygieneIssues)
          .where(eq(crmHygieneIssues.id, issueId));
      }

      return { success: true, deleted: input.issueIds.length };
    }),

  /**
   * Acknowledge a duplicate demo flag
   */
  acknowledgeDuplicateFlag: protectedProcedure
    .input(z.object({ flagId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const success = await acknowledgeDuplicateDemoFlag(input.flagId);
      if (!success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to acknowledge flag",
        });
      }
      return { success: true };
    }),

  /**
   * Acknowledge a CRM hygiene issue
   */
  acknowledgeHygieneIssue: protectedProcedure
    .input(z.object({ issueId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const success = await acknowledgeCrmHygieneIssue(input.issueId);
      if (!success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to acknowledge issue",
        });
      }
      return { success: true };
    }),

  /**
   * Manual trigger for demo detection (admin only)
   */
  triggerDetection: protectedProcedure.mutation(async ({ ctx }) => {
    const aeId = getAeIdFromCtx(ctx);
    if (!aeId) throw new TRPCError({ code: "UNAUTHORIZED" });

    const ae = await getAeProfileById(aeId);
    if (!ae?.isTeamLeader) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only team leaders can trigger detection",
      });
    }

    await triggerDemoDetectionManually();

    return {
      success: true,
      message: "Demo detection triggered successfully",
    };
  }),
});
