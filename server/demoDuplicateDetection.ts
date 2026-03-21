/**
 * Demo Duplicate Detection Service
 * Detects duplicate demos within 6 months per organization using Pipedrive Activity API
 * Also detects CRM hygiene issues (demos not linked to deals)
 */

import { ENV } from "./_core/env";
import { getDb } from "./db";
import { duplicateDemoFlags, crmHygieneIssues } from "../drizzle/schema";
import { eq } from "drizzle-orm";

interface PipedriveActivity {
  id: string;
  type: string;
  subject: string;
  done: boolean;
  due_date: string;
  due_time: string;
  user_id: number;
  org_id?: number;
  person_id?: number;
  lead_id?: number;
  deal_id?: number;
  org_name?: string;
  person_name?: string;
  lead_title?: string;
}

interface PipedriveOrganization {
  id: number;
  name: string;
}

/**
 * Fetch all "Demo" activities marked as done from Pipedrive
 */
async function fetchDoneActivities(): Promise<PipedriveActivity[]> {
  try {
    const apiKey = ENV.PIPEDRIVE_API_KEY;
    if (!apiKey) {
      console.error("[DemoDetection] PIPEDRIVE_API_KEY not configured");
      return [];
    }

    // Fetch all activities of type "Demo" that are marked as done
    const response = await fetch(
      `https://api.pipedrive.com/v1/activities?type=Demo&done=1&api_token=${apiKey}&limit=500`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      console.error("[DemoDetection] Failed to fetch activities:", response.status);
      return [];
    }

    const data = await response.json();
    return data.success ? data.data || [] : [];
  } catch (error) {
    console.error("[DemoDetection] Error fetching activities:", error);
    return [];
  }
}

/**
 * Get organization details from Pipedrive
 */
async function getOrganizationName(orgId: number): Promise<string> {
  try {
    const apiKey = ENV.PIPEDRIVE_API_KEY;
    if (!apiKey) return `Organization ${orgId}`;

    const response = await fetch(
      `https://api.pipedrive.com/v1/organizations/${orgId}?api_token=${apiKey}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) return `Organization ${orgId}`;

    const data = await response.json();
    return data.success ? data.data.name : `Organization ${orgId}`;
  } catch (error) {
    console.error("[DemoDetection] Error fetching organization:", error);
    return `Organization ${orgId}`;
  }
}

/**
 * Map Pipedrive user ID to internal AE ID
 * For now, we'll use a simple mapping based on email or name
 */
async function mapPipedriveUserToAeId(pipedriveUserId: number): Promise<number | null> {
  try {
    // This would need to be implemented based on your user mapping strategy
    // For now, return null to indicate we couldn't map the user
    console.log(`[DemoDetection] Mapping Pipedrive user ${pipedriveUserId} to AE ID`);
    return null;
  } catch (error) {
    console.error("[DemoDetection] Error mapping user:", error);
    return null;
  }
}

/**
 * Detect duplicate demos within 6 months for the same organization
 */
export async function detectDuplicateDemos(): Promise<void> {
  try {
    console.log("[DemoDetection] Starting duplicate demo detection...");

    const db = await getDb();
    if (!db) {
      console.error("[DemoDetection] Database connection failed");
      return;
    }

    const activities = await fetchDoneActivities();
    console.log(`[DemoDetection] Found ${activities.length} done demo activities`);

    // Group activities by organization
    const activitiesByOrg = new Map<number | string, PipedriveActivity[]>();

    for (const activity of activities) {
      if (!activity.org_id) {
        // CRM hygiene issue: demo not linked to organization
        console.log(`[DemoDetection] Demo ${activity.id} not linked to organization`);
        continue;
      }

      const orgKey = activity.org_id;
      if (!activitiesByOrg.has(orgKey)) {
        activitiesByOrg.set(orgKey, []);
      }
      activitiesByOrg.get(orgKey)!.push(activity);
    }

    // Check for duplicates within 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    for (const [orgId, orgActivities] of activitiesByOrg.entries()) {
      // Filter activities within last 6 months
      const recentActivities = orgActivities.filter((a) => {
        const demoDate = new Date(a.due_date);
        return demoDate >= sixMonthsAgo;
      });

      if (recentActivities.length > 1) {
        // Sort by date to identify duplicates
        recentActivities.sort(
          (a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime()
        );

        console.log(
          `[DemoDetection] Found ${recentActivities.length} demos for organization ${orgId} in last 6 months`
        );

        // Mark all but the first (most recent) as duplicates
        for (let i = 1; i < recentActivities.length; i++) {
          const activity = recentActivities[i];
          const aeId = await mapPipedriveUserToAeId(activity.user_id);

          if (!aeId) {
            console.warn(`[DemoDetection] Could not map AE for activity ${activity.id}`);
            continue;
          }

          const orgName = activity.org_name || (await getOrganizationName(activity.org_id));

          // Check if flag already exists
          const existing = await db
            .select()
            .from(duplicateDemoFlags)
            .where(eq(duplicateDemoFlags.pipedriveActivityId, activity.id));

          if (existing.length === 0) {
            // Create new flag
            await db.insert(duplicateDemoFlags).values({
              aeId,
              pipedriveActivityId: activity.id,
              organizationId: activity.org_id,
              organizationName: orgName,
              demoDate: new Date(activity.due_date),
              isDuplicate: true,
              notes: `Duplicate demo for ${orgName} - Previous demo was on ${recentActivities[i - 1].due_date}`,
            });

            console.log(
              `[DemoDetection] Flagged duplicate demo for AE ${aeId} at ${orgName}`
            );
          }
        }
      }
    }

    console.log("[DemoDetection] Duplicate demo detection completed");
  } catch (error) {
    console.error("[DemoDetection] Error in detectDuplicateDemos:", error);
  }
}

/**
 * Detect CRM hygiene issues (demos not linked to deals)
 */
export async function detectCrmHygieneIssues(): Promise<void> {
  try {
    console.log("[DemoDetection] Starting CRM hygiene detection...");

    const db = await getDb();
    if (!db) {
      console.error("[DemoDetection] Database connection failed");
      return;
    }

    const activities = await fetchDoneActivities();

    for (const activity of activities) {
      // Check if demo is linked to a deal
      if (!activity.deal_id) {
        const aeId = await mapPipedriveUserToAeId(activity.user_id);

        if (!aeId) {
          console.warn(`[DemoDetection] Could not map AE for activity ${activity.id}`);
          continue;
        }

        // Determine what it's linked to instead
        let issueType: "no_deal_link" | "org_only" | "person_only" | "lead_only" = "no_deal_link";
        let explanation = "Demo is not linked to any deal";

        if (activity.org_id && !activity.person_id && !activity.lead_id) {
          issueType = "org_only";
          explanation = `Demo is only linked to organization (${activity.org_name}). It should be linked to a specific deal.`;
        } else if (activity.person_id && !activity.org_id && !activity.lead_id) {
          issueType = "person_only";
          explanation = `Demo is only linked to a person (${activity.person_name}). It should be linked to a deal under their organization.`;
        } else if (activity.lead_id && !activity.org_id && !activity.person_id) {
          issueType = "lead_only";
          explanation = `Demo is only linked to a lead (${activity.lead_title}). It should be converted to a deal first.`;
        }

        // Check if issue already exists
        const existing = await db
          .select()
          .from(crmHygieneIssues)
          .where(eq(crmHygieneIssues.pipedriveActivityId, activity.id));

        if (existing.length === 0) {
          await db.insert(crmHygieneIssues).values({
            aeId,
            pipedriveActivityId: activity.id,
            issueType,
            organizationName: activity.org_name,
            personName: activity.person_name,
            leadTitle: activity.lead_title,
            demoDate: new Date(activity.due_date),
            explanation,
          });

          console.log(
            `[DemoDetection] Flagged CRM hygiene issue for AE ${aeId}: ${issueType}`
          );
        }
      }
    }

    console.log("[DemoDetection] CRM hygiene detection completed");
  } catch (error) {
    console.error("[DemoDetection] Error in detectCrmHygieneIssues:", error);
  }
}

/**
 * Get unacknowledged flags for an AE
 */
export async function getUnacknowledgedFlagsForAe(aeId: number): Promise<{
  duplicateDemos: typeof duplicateDemoFlags.$inferSelect[];
  hygieneIssues: typeof crmHygieneIssues.$inferSelect[];
}> {
  try {
    const db = await getDb();
    if (!db) {
      return { duplicateDemos: [], hygieneIssues: [] };
    }

    const duplicateDemos = await db
      .select()
      .from(duplicateDemoFlags)
      .where(eq(duplicateDemoFlags.aeId, aeId) && eq(duplicateDemoFlags.isAcknowledged, false));

    const hygieneIssues = await db
      .select()
      .from(crmHygieneIssues)
      .where(eq(crmHygieneIssues.aeId, aeId) && eq(crmHygieneIssues.isAcknowledged, false));

    return { duplicateDemos, hygieneIssues };
  } catch (error) {
    console.error("[DemoDetection] Error fetching flags:", error);
    return { duplicateDemos: [], hygieneIssues: [] };
  }
}

/**
 * Acknowledge a duplicate demo flag
 */
export async function acknowledgeDuplicateDemoFlag(flagId: number): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    await db
      .update(duplicateDemoFlags)
      .set({
        isAcknowledged: true,
        acknowledgedAt: new Date(),
      })
      .where(eq(duplicateDemoFlags.id, flagId));

    return true;
  } catch (error) {
    console.error("[DemoDetection] Error acknowledging flag:", error);
    return false;
  }
}

/**
 * Acknowledge a CRM hygiene issue
 */
export async function acknowledgeCrmHygieneIssue(issueId: number): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    await db
      .update(crmHygieneIssues)
      .set({
        isAcknowledged: true,
        acknowledgedAt: new Date(),
      })
      .where(eq(crmHygieneIssues.id, issueId));

    return true;
  } catch (error) {
    console.error("[DemoDetection] Error acknowledging issue:", error);
    return false;
  }
}
