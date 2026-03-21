/**
 * Tier Change Notification Scheduler
 *
 * Runs daily at 8 AM GMT alongside the Pipedrive and demo detection syncs.
 * Checks each AE's tier vs the previous month and sends notifications on changes.
 */

import * as cron from "node-cron";
import { checkAndNotifyTierChanges } from "./tierChangeNotifier";

let scheduledJob: cron.ScheduledTask | null = null;

export function initializeTierChangeScheduler(): void {
  if (scheduledJob) {
    console.log("[TierChangeScheduler] Scheduler already initialized");
    return;
  }

  // Run daily at 8:05 AM GMT (5 minutes after the Pipedrive sync to ensure fresh data)
  const cronExpression = "5 8 * * *";

  scheduledJob = cron.schedule(cronExpression, async () => {
    console.log("[TierChangeScheduler] Running tier change check at", new Date().toISOString());
    await runTierChangeCheck();
  });

  console.log("[TierChangeScheduler] Initialized — will run at 08:05 AM GMT every day");
}

export function stopTierChangeScheduler(): void {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    console.log("[TierChangeScheduler] Stopped");
  }
}

async function runTierChangeCheck(): Promise<void> {
  try {
    console.log("[TierChangeScheduler] Starting daily tier change check");
    const results = await checkAndNotifyTierChanges();

    const sent = results.filter((r) => r.notificationSent).length;
    const changes = results.filter((r) => !r.skipped).length;

    if (sent > 0) {
      console.log(
        `[TierChangeScheduler] Sent ${sent} tier change notification(s) out of ${changes} change(s) detected`
      );
    } else if (changes > 0) {
      console.log(
        `[TierChangeScheduler] ${changes} tier change(s) detected but notifications already sent or delivery failed`
      );
    } else {
      console.log("[TierChangeScheduler] No tier changes detected today");
    }
  } catch (error) {
    console.error("[TierChangeScheduler] Error during tier change check:", error);
  }
}
