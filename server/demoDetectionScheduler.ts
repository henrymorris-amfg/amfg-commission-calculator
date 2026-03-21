/**
 * Demo Detection Scheduler
 * Runs weekly on Monday at 9 AM GMT to detect duplicate and CRM hygiene issues
 */

import * as cron from "node-cron";
import { detectDuplicateDemos, detectCrmHygieneIssues } from "./demoDuplicateDetection";

let scheduledJob: cron.ScheduledTask | null = null;

export function initializeDemoDetectionScheduler(): void {
  if (scheduledJob) {
    console.log("[DemoDetectionScheduler] Scheduler already initialized");
    return;
  }

  // Schedule for Monday at 9 AM GMT
  // Cron format: second minute hour day month dayOfWeek
  // 0 9 * * 1 = 9:00 AM every Monday
  const cronExpression = "0 9 * * 1";

  scheduledJob = cron.schedule(cronExpression, async () => {
    console.log("[DemoDetectionScheduler] Running demo detection at", new Date().toISOString());
    await runDemoDetection();
  });

  console.log("[DemoDetectionScheduler] Initialized - will run at 9 AM GMT every Monday");
}

export function stopDemoDetectionScheduler(): void {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    console.log("[DemoDetectionScheduler] Stopped");
  }
}

async function runDemoDetection(): Promise<void> {
  try {
    console.log("[DemoDetectionScheduler] Starting weekly demo detection");

    // Run both detection processes
    await detectDuplicateDemos();
    await detectCrmHygieneIssues();

    console.log("[DemoDetectionScheduler] Weekly demo detection completed successfully");
  } catch (error) {
    console.error("[DemoDetectionScheduler] Error during demo detection:", error);
  }
}

/**
 * Manual trigger for demo detection (for testing or manual runs)
 */
export async function triggerDemoDetectionManually(): Promise<void> {
  console.log("[DemoDetectionScheduler] Manual trigger of demo detection");
  await runDemoDetection();
}
