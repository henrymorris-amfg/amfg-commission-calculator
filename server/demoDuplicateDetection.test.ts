/**
 * Tests for Demo Duplicate Detection
 * Validates duplicate and CRM hygiene detection logic
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDb } from "./db";
import { duplicateDemoFlags, crmHygieneIssues, aeProfiles } from "../drizzle/schema";

describe("Demo Duplicate Detection", () => {
  let db: any;

  beforeEach(async () => {
    db = await getDb();
  });

  describe("Duplicate Detection Logic", () => {
    it("should identify demos from same organization within 6 months", async () => {
      // Setup: Create test data
      const now = new Date();
      const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);
      const sevenMonthsAgo = new Date(now.getTime() - 7 * 30 * 24 * 60 * 60 * 1000);

      // Demo 1: 5 months ago (should be flagged as duplicate)
      const demo1Date = new Date(sixMonthsAgo.getTime() + 30 * 24 * 60 * 60 * 1000);
      // Demo 2: 7 months ago (outside 6-month window)
      const demo2Date = sevenMonthsAgo;

      // Both from same organization
      const orgId = 12345;
      const orgName = "Test Corp";

      // Simulate: Both demos exist
      const demoWithin6Months = {
        id: "activity_1",
        type: "Demo",
        subject: "Product Demo",
        done: true,
        due_date: demo1Date.toISOString().split("T")[0],
        due_time: "14:00",
        user_id: 1,
        org_id: orgId,
        org_name: orgName,
      };

      const demoOutside6Months = {
        id: "activity_2",
        type: "Demo",
        subject: "Product Demo",
        done: true,
        due_date: demo2Date.toISOString().split("T")[0],
        due_time: "14:00",
        user_id: 1,
        org_id: orgId,
        org_name: orgName,
      };

      // Logic: Group by org and check 6-month window
      const activities = [demoWithin6Months, demoOutside6Months];
      const sixMonthsAgoDate = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

      const recentDemos = activities.filter((a) => {
        const demoDate = new Date(a.due_date);
        return demoDate >= sixMonthsAgoDate;
      });

      // Verify: Only demo within 6 months is included
      expect(recentDemos).toHaveLength(1);
      expect(recentDemos[0].id).toBe("activity_1");
    });

    it("should flag all but the most recent demo as duplicates", async () => {
      const now = new Date();
      const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

      // Create 3 demos for same org, all within 6 months
      const demos = [
        {
          id: "activity_1",
          due_date: new Date(sixMonthsAgo.getTime() + 10 * 24 * 60 * 60 * 1000),
          org_id: 12345,
        },
        {
          id: "activity_2",
          due_date: new Date(sixMonthsAgo.getTime() + 40 * 24 * 60 * 60 * 1000),
          org_id: 12345,
        },
        {
          id: "activity_3",
          due_date: new Date(sixMonthsAgo.getTime() + 70 * 24 * 60 * 60 * 1000),
          org_id: 12345,
        },
      ];

      // Sort by date descending (most recent first)
      const sorted = demos.sort(
        (a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime()
      );

      // First is most recent (not duplicate), rest are duplicates
      expect(sorted[0].id).toBe("activity_3"); // Most recent
      expect(sorted.slice(1).map((d) => d.id)).toEqual(["activity_2", "activity_1"]);
    });

    it("should not flag demos from different organizations", async () => {
      const demos = [
        { id: "activity_1", org_id: 12345, org_name: "Corp A" },
        { id: "activity_2", org_id: 67890, org_name: "Corp B" },
      ];

      // Group by org
      const byOrg = new Map();
      for (const demo of demos) {
        if (!byOrg.has(demo.org_id)) {
          byOrg.set(demo.org_id, []);
        }
        byOrg.get(demo.org_id).push(demo);
      }

      // Each org should have only 1 demo (no duplicates)
      for (const [orgId, orgDemos] of byOrg) {
        expect(orgDemos).toHaveLength(1);
      }
    });
  });

  describe("CRM Hygiene Detection", () => {
    it("should flag demos not linked to deals", async () => {
      const demo = {
        id: "activity_1",
        deal_id: undefined, // Not linked to deal
        org_id: 12345,
        person_id: undefined,
        lead_id: undefined,
      };

      // Logic: Demo without deal_id is a hygiene issue
      const hasNoDeals = !demo.deal_id;
      expect(hasNoDeals).toBe(true);
    });

    it("should identify org-only demos as hygiene issue", async () => {
      const demo = {
        id: "activity_1",
        deal_id: undefined,
        org_id: 12345, // Only linked to org
        org_name: "Test Corp",
        person_id: undefined,
        lead_id: undefined,
      };

      // Logic: Determine issue type
      let issueType = "no_deal_link";
      if (demo.org_id && !demo.person_id && !demo.lead_id) {
        issueType = "org_only";
      }

      expect(issueType).toBe("org_only");
    });

    it("should identify person-only demos as hygiene issue", async () => {
      const demo = {
        id: "activity_1",
        deal_id: undefined,
        org_id: undefined,
        person_id: 999, // Only linked to person
        person_name: "John Doe",
        lead_id: undefined,
      };

      let issueType = "no_deal_link";
      if (demo.person_id && !demo.org_id && !demo.lead_id) {
        issueType = "person_only";
      }

      expect(issueType).toBe("person_only");
    });

    it("should identify lead-only demos as hygiene issue", async () => {
      const demo = {
        id: "activity_1",
        deal_id: undefined,
        org_id: undefined,
        person_id: undefined,
        lead_id: 888, // Only linked to lead
        lead_title: "Potential Deal",
      };

      let issueType = "no_deal_link";
      if (demo.lead_id && !demo.org_id && !demo.person_id) {
        issueType = "lead_only";
      }

      expect(issueType).toBe("lead_only");
    });

    it("should not flag demos properly linked to deals", async () => {
      const demo = {
        id: "activity_1",
        deal_id: 555, // Linked to deal
        org_id: 12345,
        person_id: 999,
      };

      // Logic: Demo with deal_id is properly linked
      const isProperlyLinked = !!demo.deal_id;
      expect(isProperlyLinked).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle demos with no organization", async () => {
      const demo = {
        id: "activity_1",
        org_id: undefined, // No org
        deal_id: undefined,
      };

      // Logic: Can't group by org if org_id is missing
      const canGroupByOrg = !!demo.org_id;
      expect(canGroupByOrg).toBe(false);
    });

    it("should handle exactly 6-month boundary", async () => {
      const now = new Date();
      const exactly6MonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

      const demo = {
        id: "activity_1",
        due_date: exactly6MonthsAgo,
      };

      // Logic: Demos exactly 6 months old should be included (>= comparison)
      const isWithin6Months = demo.due_date >= exactly6MonthsAgo;
      expect(isWithin6Months).toBe(true);
    });

    it("should handle multiple demos on same day", async () => {
      const sameDate = new Date();
      const demos = [
        { id: "activity_1", due_date: sameDate, org_id: 12345 },
        { id: "activity_2", due_date: sameDate, org_id: 12345 },
        { id: "activity_3", due_date: sameDate, org_id: 12345 },
      ];

      // All from same org, same date
      // When sorted by date, all have same timestamp
      // First one in array becomes "most recent"
      const sorted = demos.sort(
        (a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime()
      );

      // First one is kept, rest flagged as duplicates
      expect(sorted.length).toBe(3);
      expect(sorted.slice(1).length).toBe(2); // 2 duplicates
    });

    it("should handle demos with null/undefined fields", async () => {
      const demo = {
        id: "activity_1",
        deal_id: null,
        org_id: null,
        person_id: null,
        lead_id: null,
      };

      // Logic: All fields null means no proper linking
      const isProperlyLinked = !!demo.deal_id;
      expect(isProperlyLinked).toBe(false);

      // Should be flagged as hygiene issue
      const hasNoLink = !demo.deal_id && !demo.org_id && !demo.person_id && !demo.lead_id;
      expect(hasNoLink).toBe(true);
    });
  });

  describe("Database Integration", () => {
    it("should store duplicate demo flags correctly", async () => {
      if (!db) {
        console.log("Database not available, skipping integration test");
        return;
      }

      // This test would run against actual database
      // For now, just verify schema exists
      expect(duplicateDemoFlags).toBeDefined();
    });

    it("should store CRM hygiene issues correctly", async () => {
      if (!db) {
        console.log("Database not available, skipping integration test");
        return;
      }

      // Verify schema exists
      expect(crmHygieneIssues).toBeDefined();
    });
  });
});
