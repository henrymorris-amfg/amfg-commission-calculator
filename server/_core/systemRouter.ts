import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  getSyncStatus: publicProcedure.query(async () => {
    const { getLastSyncResult, getNextSyncTime } = await import("../weeklySync");
    const lastResult = getLastSyncResult();
    const nextTime = getNextSyncTime();
    return {
      lastSync: lastResult ? {
        timestamp: lastResult.timestamp,
        voip: { success: lastResult.voipSync.success, records: lastResult.voipSync.recordsUpdated },
        spreadsheet: { success: lastResult.spreadsheetSync.success, records: lastResult.spreadsheetSync.recordsUpdated },
        pipedrive: { success: lastResult.pipedriveSync.success, records: lastResult.pipedriveSync.recordsUpdated },
      } : null,
      nextSync: nextTime?.toISOString() ?? null,
    };
  }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
