/**
 * Tier Change Notifier
 *
 * Runs daily to check each AE's current tier vs their previous month's tier.
 * When a tier change is detected, sends a personalised notification via the
 * Manus notification system (owner receives it and can relay to the AE, or
 * this can be wired to a real SMTP service in future).
 *
 * Notification content includes:
 *  - Current tier and commission rate
 *  - Previous tier and commission rate
 *  - Gap analysis (what metrics changed)
 *  - Actionable targets to maintain or improve tier
 *  - Motivational framing
 */

import { notifyOwner } from "./_core/notification";
import { sendTierChangeEmail } from "./emailService";
import { getDb } from "./db";
import {
  aeProfiles,
  monthlyMetrics,
  tierChangeNotifications,
} from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  calculateTier,
  computeRollingAverages,
  computeAvgRetention,
  isNewJoiner,
  STANDARD_TARGETS,
  TEAM_LEADER_TARGETS,
  TIER_COMMISSION_RATE,
  Tier,
  MONTH_NAMES,
} from "../shared/commission";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AeTierSnapshot {
  aeId: number;
  aeName: string;
  aeEmail: string | null;
  tier: Tier;
  avgArrUsd: number;
  avgDemosPw: number;
  avgDialsPw: number;
  avgRetentionRate: number | null;
  isNewJoiner: boolean;
  isTeamLeader: boolean;
}

interface TierChangeEvent {
  ae: AeTierSnapshot;
  previousTier: Tier;
  newTier: Tier;
  month: number;
  year: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTierLabel(tier: Tier): string {
  const rate = (TIER_COMMISSION_RATE[tier] * 100).toFixed(0);
  const emoji = tier === "gold" ? "🥇" : tier === "silver" ? "🥈" : "🥉";
  return `${emoji} ${tier.charAt(0).toUpperCase() + tier.slice(1)} (${rate}% commission)`;
}

function tierDirection(prev: Tier, next: Tier): "promoted" | "demoted" | "same" {
  const order: Record<Tier, number> = { bronze: 0, silver: 1, gold: 2 };
  if (order[next] > order[prev]) return "promoted";
  if (order[next] < order[prev]) return "demoted";
  return "same";
}

function buildNotificationContent(event: TierChangeEvent): { title: string; content: string } {
  const { ae, previousTier, newTier, month, year } = event;
  const direction = tierDirection(previousTier, newTier);
  const monthName = MONTH_NAMES[month - 1];
  const targets = ae.isTeamLeader ? TEAM_LEADER_TARGETS : STANDARD_TARGETS;
  const prevRate = (TIER_COMMISSION_RATE[previousTier] * 100).toFixed(0);
  const newRate = (TIER_COMMISSION_RATE[newTier] * 100).toFixed(0);

  // Title
  const directionEmoji = direction === "promoted" ? "🎉" : "⚠️";
  const directionWord = direction === "promoted" ? "PROMOTED" : "DEMOTED";
  const title = `${directionEmoji} Tier Change: ${ae.aeName} ${directionWord} to ${newTier.toUpperCase()} — ${monthName} ${year}`;

  // Build content
  const lines: string[] = [];

  lines.push(`TIER CHANGE NOTIFICATION — ${monthName} ${year}`);
  lines.push(`${"=".repeat(60)}`);
  lines.push(``);
  lines.push(`AE: ${ae.aeName}`);
  if (ae.aeEmail) lines.push(`Email: ${ae.aeEmail}`);
  lines.push(``);
  lines.push(`TIER CHANGE:`);
  lines.push(`  Previous: ${formatTierLabel(previousTier)} (${prevRate}% commission rate)`);
  lines.push(`  New:      ${formatTierLabel(newTier)} (${newRate}% commission rate)`);
  lines.push(``);

  // Commission rate impact
  const rateChange = Number(newRate) - Number(prevRate);
  if (rateChange > 0) {
    lines.push(`COMMISSION RATE IMPACT:`);
    lines.push(`  Rate increased by +${rateChange}pp — every £1,000 deal now earns £${rateChange * 10} more`);
  } else {
    lines.push(`COMMISSION RATE IMPACT:`);
    lines.push(`  Rate decreased by ${rateChange}pp — every £1,000 deal now earns £${Math.abs(rateChange) * 10} less`);
  }
  lines.push(``);

  // Current metrics
  lines.push(`CURRENT 3-MONTH ROLLING AVERAGES:`);
  lines.push(`  ARR:        $${ae.avgArrUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })} / month`);
  lines.push(`  Demos:      ${ae.avgDemosPw.toFixed(1)} / week`);
  lines.push(`  Dials:      ${ae.avgDialsPw.toFixed(0)} / week`);
  if (ae.avgRetentionRate != null) {
    lines.push(`  Retention:  ${ae.avgRetentionRate.toFixed(1)}%`);
  }
  lines.push(``);

  if (direction === "promoted") {
    // Promoted — show what to maintain
    const maintainTargets = targets[newTier as "silver" | "gold"] ?? targets.silver;
    lines.push(`WHAT TO MAINTAIN (${newTier.toUpperCase()} TIER REQUIREMENTS):`);
    lines.push(`  ARR:    ≥ $${maintainTargets.arrUsd.toLocaleString()} / month`);
    lines.push(`  Demos:  ≥ ${maintainTargets.demosPw} / week`);
    lines.push(`  Dials:  ≥ ${maintainTargets.dialsPw} / week`);
    lines.push(`  Retention: ≥ ${maintainTargets.retentionMin}%`);
    lines.push(``);

    // Gap analysis — how much headroom do they have?
    const arrHeadroom = ae.avgArrUsd - maintainTargets.arrUsd;
    const demosHeadroom = ae.avgDemosPw - maintainTargets.demosPw;
    const dialsHeadroom = ae.avgDialsPw - maintainTargets.dialsPw;

    lines.push(`CURRENT HEADROOM ABOVE ${newTier.toUpperCase()} THRESHOLD:`);
    lines.push(`  ARR:    +$${Math.max(0, arrHeadroom).toLocaleString("en-US", { maximumFractionDigits: 0 })} above target`);
    lines.push(`  Demos:  +${Math.max(0, demosHeadroom).toFixed(1)} / week above target`);
    lines.push(`  Dials:  +${Math.max(0, dialsHeadroom).toFixed(0)} / week above target`);
    lines.push(``);

    // Next tier targets (if not already at gold)
    if (newTier !== "gold") {
      const nextTier = newTier === "bronze" ? "silver" : "gold";
      const nextTargets = targets[nextTier as "silver" | "gold"];
      lines.push(`NEXT GOAL — ${nextTier.toUpperCase()} TIER:`);
      const arrGap = Math.max(0, nextTargets.arrUsd - ae.avgArrUsd);
      const demosGap = Math.max(0, nextTargets.demosPw - ae.avgDemosPw);
      const dialsGap = Math.max(0, nextTargets.dialsPw - ae.avgDialsPw);
      if (arrGap > 0) lines.push(`  Need +$${arrGap.toLocaleString("en-US", { maximumFractionDigits: 0 })} more ARR / month`);
      if (demosGap > 0) lines.push(`  Need +${demosGap.toFixed(1)} more demos / week`);
      if (dialsGap > 0) lines.push(`  Need +${dialsGap.toFixed(0)} more dials / week`);
      if (arrGap === 0 && demosGap === 0 && dialsGap === 0) {
        lines.push(`  Already meeting ${nextTier} targets on all metrics!`);
      }
      lines.push(``);
    }

    lines.push(`MESSAGE FOR ${ae.aeName.toUpperCase()}:`);
    lines.push(`  Congratulations on reaching ${newTier.toUpperCase()} tier! Your commission rate has`);
    lines.push(`  increased to ${newRate}%. Keep up the strong performance to maintain this tier.`);
    if (ae.isNewJoiner) {
      lines.push(`  Note: You are still within your new joiner grace period — ARR targets are`);
      lines.push(`  automatically met to help you get established.`);
    }

  } else {
    // Demoted — show what needs to improve
    const recoverTargets = targets[previousTier as "silver" | "gold"] ?? targets.silver;
    lines.push(`WHAT NEEDS TO IMPROVE (TO RETURN TO ${previousTier.toUpperCase()}):`);

    const arrGap = Math.max(0, recoverTargets.arrUsd - ae.avgArrUsd);
    const demosGap = Math.max(0, recoverTargets.demosPw - ae.avgDemosPw);
    const dialsGap = Math.max(0, recoverTargets.dialsPw - ae.avgDialsPw);

    if (arrGap > 0) {
      lines.push(`  ARR:    Need +$${arrGap.toLocaleString("en-US", { maximumFractionDigits: 0 })} more / month (currently $${ae.avgArrUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}, target $${recoverTargets.arrUsd.toLocaleString()})`);
    } else {
      lines.push(`  ARR:    ✓ Meeting target ($${ae.avgArrUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })} ≥ $${recoverTargets.arrUsd.toLocaleString()})`);
    }
    if (demosGap > 0) {
      lines.push(`  Demos:  Need +${demosGap.toFixed(1)} more / week (currently ${ae.avgDemosPw.toFixed(1)}, target ${recoverTargets.demosPw})`);
    } else {
      lines.push(`  Demos:  ✓ Meeting target (${ae.avgDemosPw.toFixed(1)} ≥ ${recoverTargets.demosPw})`);
    }
    if (dialsGap > 0) {
      lines.push(`  Dials:  Need +${dialsGap.toFixed(0)} more / week (currently ${ae.avgDialsPw.toFixed(0)}, target ${recoverTargets.dialsPw})`);
    } else {
      lines.push(`  Dials:  ✓ Meeting target (${ae.avgDialsPw.toFixed(0)} ≥ ${recoverTargets.dialsPw})`);
    }
    lines.push(``);

    // Actionable weekly targets
    lines.push(`ACTIONABLE WEEKLY TARGETS TO RECOVER:`);
    if (arrGap > 0) {
      const monthlyArrNeeded = recoverTargets.arrUsd;
      lines.push(`  • Close at least $${monthlyArrNeeded.toLocaleString()} ARR per month over the next 3 months`);
    }
    if (demosGap > 0) {
      lines.push(`  • Book ${recoverTargets.demosPw}+ demos per week (currently averaging ${ae.avgDemosPw.toFixed(1)})`);
    }
    if (dialsGap > 0) {
      lines.push(`  • Make ${recoverTargets.dialsPw}+ dials per week (currently averaging ${ae.avgDialsPw.toFixed(0)})`);
    }
    lines.push(``);

    lines.push(`MESSAGE FOR ${ae.aeName.toUpperCase()}:`);
    lines.push(`  Your tier has moved from ${previousTier.toUpperCase()} to ${newTier.toUpperCase()} this month.`);
    lines.push(`  Your commission rate is now ${newRate}%. The good news: tier is based on a`);
    lines.push(`  3-month rolling average, so strong performance over the next 3 months`);
    lines.push(`  will bring you back to ${previousTier.toUpperCase()}.`);
  }

  lines.push(``);
  lines.push(`─`.repeat(60));
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`This notification was generated automatically by the AMFG Commission Calculator.`);

  return { title, content: lines.join("\n") };
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

/**
 * Compute an AE's tier for a given month/year using the same logic as the
 * commission.forAe tRPC procedure.
 */
async function computeAeTierForMonth(
  aeId: number,
  year: number,
  month: number,
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
): Promise<AeTierSnapshot | null> {
  const profile = await db
    .select()
    .from(aeProfiles)
    .where(eq(aeProfiles.id, aeId))
    .limit(1)
    .then((r) => r[0]);

  if (!profile || !profile.isActive) return null;

  const targetDate = new Date(year, month - 1, 1);
  const joinDate = new Date(profile.joinDate);

  // Fetch all metrics for this AE
  const allMetrics = await db
    .select()
    .from(monthlyMetrics)
    .where(eq(monthlyMetrics.aeId, aeId))
    .orderBy(desc(monthlyMetrics.year), desc(monthlyMetrics.month));

  // Last 3 months before target date (and after join date)
  let last3 = allMetrics
    .filter((m) => {
      const d = new Date(m.year, m.month - 1, 1);
      return d < targetDate && d >= joinDate;
    })
    .slice(0, 3)
    .map((m) => {
      const monthDate = new Date(m.year, m.month - 1, 1);
      const monthsSinceJoin =
        (monthDate.getFullYear() - joinDate.getFullYear()) * 12 +
        (monthDate.getMonth() - joinDate.getMonth());
      const arrUsd =
        monthsSinceJoin >= 0 && monthsSinceJoin < 6 ? 25000 : Number(m.arrUsd);
      return {
        year: m.year,
        month: m.month,
        arrUsd,
        demosTotal: m.demosTotal,
        dialsTotal: m.dialsTotal,
        retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
      };
    });

  // New joiner fallback: use current month data if no prior data
  if (last3.length === 0 && isNewJoiner(profile.joinDate, targetDate)) {
    last3 = allMetrics
      .filter((m) => m.year === year && m.month === month)
      .slice(0, 1)
      .map((m) => ({
        year: m.year,
        month: m.month,
        arrUsd: 25000, // grace period
        demosTotal: m.demosTotal,
        dialsTotal: m.dialsTotal,
        retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
      }));
  }

  // Last 6 months for retention
  const last6 = allMetrics
    .filter((m) => {
      const d = new Date(m.year, m.month - 1, 1);
      return d < targetDate && d >= joinDate;
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

  return {
    aeId,
    aeName: profile.name,
    aeEmail: profile.email ?? null,
    tier: result.tier,
    avgArrUsd,
    avgDemosPw,
    avgDialsPw,
    avgRetentionRate,
    isNewJoiner: newJoiner,
    isTeamLeader: profile.isTeamLeader,
  };
}

/**
 * Check if a notification has already been sent for this AE/month/tier-change
 * combination to avoid duplicate notifications.
 */
async function hasNotificationBeenSent(
  aeId: number,
  year: number,
  month: number,
  previousTier: Tier,
  newTier: Tier,
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
): Promise<boolean> {
  const existing = await db
    .select({ id: tierChangeNotifications.id })
    .from(tierChangeNotifications)
    .where(
      and(
        eq(tierChangeNotifications.aeId, aeId),
        eq(tierChangeNotifications.notificationYear, year),
        eq(tierChangeNotifications.notificationMonth, month),
        eq(tierChangeNotifications.previousTier, previousTier),
        eq(tierChangeNotifications.newTier, newTier)
      )
    )
    .limit(1);
  return existing.length > 0;
}

/**
 * Record a notification in the database for deduplication.
 */
async function recordNotification(
  aeId: number,
  year: number,
  month: number,
  previousTier: Tier,
  newTier: Tier,
  snapshot: AeTierSnapshot,
  status: "sent" | "failed",
  errorMessage?: string,
  db?: NonNullable<Awaited<ReturnType<typeof getDb>>>
): Promise<void> {
  if (!db) return;
  await db.insert(tierChangeNotifications).values({
    aeId,
    notificationYear: year,
    notificationMonth: month,
    previousTier,
    newTier,
    avgArrUsd: snapshot.avgArrUsd.toFixed(2),
    avgDemosPw: snapshot.avgDemosPw.toFixed(2),
    avgDialsPw: snapshot.avgDialsPw.toFixed(2),
    deliveryStatus: status,
    errorMessage: errorMessage ?? null,
  });
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export interface TierCheckResult {
  aeId: number;
  aeName: string;
  currentTier: Tier;
  previousTier: Tier | null;
  notificationSent: boolean;
  skipped: boolean;
  reason?: string;
}

/**
 * Check all active AEs for tier changes and send notifications where needed.
 * Compares current month vs previous month tier.
 *
 * @param forceMonth - Override the month to check (1-12). Defaults to current month.
 * @param forceYear  - Override the year to check. Defaults to current year.
 */
export async function checkAndNotifyTierChanges(
  forceMonth?: number,
  forceYear?: number
): Promise<TierCheckResult[]> {
  const db = await getDb();
  if (!db) {
    console.error("[TierChangeNotifier] Database connection failed");
    return [];
  }

  const now = new Date();
  const currentMonth = forceMonth ?? (now.getMonth() + 1);
  const currentYear = forceYear ?? now.getFullYear();

  // Previous month
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  console.log(
    `[TierChangeNotifier] Checking tier changes for ${MONTH_NAMES[currentMonth - 1]} ${currentYear} vs ${MONTH_NAMES[prevMonth - 1]} ${prevYear}`
  );

  // Get all active AEs
  const activeAes = await db
    .select()
    .from(aeProfiles)
    .where(eq(aeProfiles.isActive, true));

  const results: TierCheckResult[] = [];

  for (const ae of activeAes) {
    try {
      // Compute current month tier
      const currentSnapshot = await computeAeTierForMonth(ae.id, currentYear, currentMonth, db);
      if (!currentSnapshot) {
        results.push({
          aeId: ae.id,
          aeName: ae.name,
          currentTier: "bronze",
          previousTier: null,
          notificationSent: false,
          skipped: true,
          reason: "AE not active or no data",
        });
        continue;
      }

      // Compute previous month tier
      const prevSnapshot = await computeAeTierForMonth(ae.id, prevYear, prevMonth, db);
      if (!prevSnapshot) {
        results.push({
          aeId: ae.id,
          aeName: ae.name,
          currentTier: currentSnapshot.tier,
          previousTier: null,
          notificationSent: false,
          skipped: true,
          reason: "No previous month data — first month for this AE",
        });
        continue;
      }

      const previousTier = prevSnapshot.tier;
      const newTier = currentSnapshot.tier;

      // No tier change — skip
      if (previousTier === newTier) {
        results.push({
          aeId: ae.id,
          aeName: ae.name,
          currentTier: newTier,
          previousTier,
          notificationSent: false,
          skipped: true,
          reason: `Tier unchanged (${newTier})`,
        });
        continue;
      }

      // Check if already notified for this exact transition this month
      const alreadySent = await hasNotificationBeenSent(
        ae.id,
        currentYear,
        currentMonth,
        previousTier,
        newTier,
        db
      );

      if (alreadySent) {
        results.push({
          aeId: ae.id,
          aeName: ae.name,
          currentTier: newTier,
          previousTier,
          notificationSent: false,
          skipped: true,
          reason: "Notification already sent for this transition",
        });
        continue;
      }

      // Build and send notification
      const event: TierChangeEvent = {
        ae: currentSnapshot,
        previousTier,
        newTier,
        month: currentMonth,
        year: currentYear,
      };

      const { title, content } = buildNotificationContent(event);

      let sent = false;
      let errorMsg: string | undefined;

      // 1. Send Resend email directly to AE (if they have an email address)
      if (currentSnapshot.aeEmail) {
        const targets = currentSnapshot.isTeamLeader ? TEAM_LEADER_TARGETS : STANDARD_TARGETS;
        const nextTierKey = newTier === "bronze" ? "silver" : newTier === "silver" ? "gold" : null;
        const nextTierTargets = nextTierKey && nextTierKey in targets
          ? { ...targets[nextTierKey as "silver" | "gold"] }
          : null;
        try {
          const emailSent = await sendTierChangeEmail({
            toEmail: currentSnapshot.aeEmail,
            toName: currentSnapshot.aeName,
            previousTier,
            newTier,
            month: currentMonth,
            year: currentYear,
            avgArrUsd: currentSnapshot.avgArrUsd,
            avgDemosPw: currentSnapshot.avgDemosPw,
            avgDialsPw: currentSnapshot.avgDialsPw,
            nextTierTargets: nextTierTargets ? {
              arrUsd: nextTierTargets.arrUsd,
              demosPw: nextTierTargets.demosPw,
              dialsPw: nextTierTargets.dialsPw,
            } : null,
          });
          if (emailSent) sent = true;
        } catch (err) {
          console.error(`[TierChangeNotifier] Resend email failed for ${ae.name}:`, err);
        }
      }

      // 2. Also send owner notification (admin summary)
      try {
        const ownerSent = await notifyOwner({ title, content });
        if (ownerSent) sent = true;
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[TierChangeNotifier] Failed to send owner notification for ${ae.name}:`, err);
      }

      // Record in DB
      await recordNotification(
        ae.id,
        currentYear,
        currentMonth,
        previousTier,
        newTier,
        currentSnapshot,
        sent ? "sent" : "failed",
        errorMsg,
        db
      );

      const direction = tierDirection(previousTier, newTier);
      console.log(
        `[TierChangeNotifier] ${ae.name}: ${previousTier} → ${newTier} (${direction}) — notification ${sent ? "sent" : "FAILED"}`
      );

      results.push({
        aeId: ae.id,
        aeName: ae.name,
        currentTier: newTier,
        previousTier,
        notificationSent: sent,
        skipped: false,
        reason: sent ? undefined : `Delivery failed: ${errorMsg}`,
      });
    } catch (err) {
      console.error(`[TierChangeNotifier] Error processing AE ${ae.name}:`, err);
      results.push({
        aeId: ae.id,
        aeName: ae.name,
        currentTier: "bronze",
        previousTier: null,
        notificationSent: false,
        skipped: true,
        reason: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const sent = results.filter((r) => r.notificationSent).length;
  const skipped = results.filter((r) => r.skipped).length;
  console.log(
    `[TierChangeNotifier] Complete — ${sent} notifications sent, ${skipped} skipped, ${results.length} AEs checked`
  );

  return results;
}

/**
 * Get notification history for a specific AE.
 */
export async function getNotificationHistory(
  aeId: number,
  limit = 12
): Promise<typeof tierChangeNotifications.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tierChangeNotifications)
    .where(eq(tierChangeNotifications.aeId, aeId))
    .orderBy(desc(tierChangeNotifications.sentAt))
    .limit(limit);
}

/**
 * Get all recent notifications (for admin view).
 */
export async function getAllRecentNotifications(
  limit = 50
): Promise<typeof tierChangeNotifications.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tierChangeNotifications)
    .orderBy(desc(tierChangeNotifications.sentAt))
    .limit(limit);
}
