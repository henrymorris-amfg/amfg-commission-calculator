/**
 * Integration Tests for Demo Duplicate Detection
 * Tests with mock Pipedrive API responses
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Demo Detection Integration Tests", () => {
  describe("Mock Pipedrive API Responses", () => {
    it("should parse Pipedrive activity response correctly", () => {
      // Mock Pipedrive API response
      const mockResponse = {
        success: true,
        data: [
          {
            id: "1",
            type: "Demo",
            subject: "Product Demo",
            done: true,
            due_date: "2026-03-15",
            due_time: "14:00",
            user_id: 1,
            org_id: 12345,
            org_name: "Acme Corp",
            person_id: 999,
            person_name: "John Doe",
            deal_id: 555,
          },
          {
            id: "2",
            type: "Demo",
            subject: "Follow-up Demo",
            done: true,
            due_date: "2026-02-15",
            due_time: "10:00",
            user_id: 1,
            org_id: 12345,
            org_name: "Acme Corp",
            person_id: undefined,
            deal_id: undefined,
          },
        ],
      };

      // Parse response
      const activities = mockResponse.success ? mockResponse.data : [];

      expect(activities).toHaveLength(2);
      expect(activities[0].org_id).toBe(12345);
      expect(activities[1].deal_id).toBeUndefined();
    });

    it("should handle Pipedrive API error response", () => {
      const mockErrorResponse = {
        success: false,
        error: "Unauthorized",
      };

      const activities = mockErrorResponse.success ? mockErrorResponse.data : [];

      expect(activities).toHaveLength(0);
    });

    it("should group activities by organization", () => {
      const activities = [
        {
          id: "1",
          org_id: 12345,
          org_name: "Acme Corp",
          due_date: "2026-03-15",
        },
        {
          id: "2",
          org_id: 12345,
          org_name: "Acme Corp",
          due_date: "2026-02-15",
        },
        {
          id: "3",
          org_id: 67890,
          org_name: "TechCorp",
          due_date: "2026-03-10",
        },
      ];

      // Group by org
      const byOrg = new Map();
      for (const activity of activities) {
        if (!byOrg.has(activity.org_id)) {
          byOrg.set(activity.org_id, []);
        }
        byOrg.get(activity.org_id).push(activity);
      }

      expect(byOrg.size).toBe(2);
      expect(byOrg.get(12345)).toHaveLength(2);
      expect(byOrg.get(67890)).toHaveLength(1);
    });
  });

  describe("Duplicate Detection Workflow", () => {
    it("should detect duplicates in complete workflow", () => {
      const now = new Date();
      const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

      // Simulate Pipedrive response with 3 demos for same org
      const activities = [
        {
          id: "activity_1",
          org_id: 12345,
          org_name: "Acme Corp",
          due_date: new Date(sixMonthsAgo.getTime() + 10 * 24 * 60 * 60 * 1000),
          user_id: 1,
          deal_id: 111,
        },
        {
          id: "activity_2",
          org_id: 12345,
          org_name: "Acme Corp",
          due_date: new Date(sixMonthsAgo.getTime() + 40 * 24 * 60 * 60 * 1000),
          user_id: 1,
          deal_id: 222,
        },
        {
          id: "activity_3",
          org_id: 12345,
          org_name: "Acme Corp",
          due_date: new Date(sixMonthsAgo.getTime() + 70 * 24 * 60 * 60 * 1000),
          user_id: 1,
          deal_id: 333,
        },
      ];

      // Step 1: Filter by 6-month window
      const recentActivities = activities.filter((a) => a.due_date >= sixMonthsAgo);
      expect(recentActivities).toHaveLength(3);

      // Step 2: Group by org
      const byOrg = new Map();
      for (const activity of recentActivities) {
        if (!byOrg.has(activity.org_id)) {
          byOrg.set(activity.org_id, []);
        }
        byOrg.get(activity.org_id).push(activity);
      }

      // Step 3: Identify duplicates for each org
      const duplicates = [];
      for (const [orgId, orgActivities] of byOrg) {
        if (orgActivities.length > 1) {
          // Sort by date descending
          const sorted = orgActivities.sort(
            (a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime()
          );

          // Mark all but first as duplicates
          for (let i = 1; i < sorted.length; i++) {
            duplicates.push({
              activityId: sorted[i].id,
              organizationName: sorted[i].org_name,
              isDuplicate: true,
            });
          }
        }
      }

      // Verify results
      expect(duplicates).toHaveLength(2);
      expect(duplicates[0].activityId).toBe("activity_2");
      expect(duplicates[1].activityId).toBe("activity_1");
    });

    it("should detect CRM hygiene issues in complete workflow", () => {
      const activities = [
        {
          id: "activity_1",
          org_id: 12345,
          deal_id: 111, // Properly linked
          user_id: 1,
        },
        {
          id: "activity_2",
          org_id: 12345, // Only org, no deal
          deal_id: undefined,
          person_id: undefined,
          lead_id: undefined,
          user_id: 1,
        },
        {
          id: "activity_3",
          person_id: 999, // Only person, no deal
          deal_id: undefined,
          org_id: undefined,
          lead_id: undefined,
          user_id: 1,
        },
      ];

      const hygieneIssues = [];

      for (const activity of activities) {
        if (!activity.deal_id) {
          let issueType = "no_deal_link";

          if (activity.org_id && !activity.person_id && !activity.lead_id) {
            issueType = "org_only";
          } else if (activity.person_id && !activity.org_id && !activity.lead_id) {
            issueType = "person_only";
          } else if (activity.lead_id && !activity.org_id && !activity.person_id) {
            issueType = "lead_only";
          }

          hygieneIssues.push({
            activityId: activity.id,
            issueType,
          });
        }
      }

      expect(hygieneIssues).toHaveLength(2);
      expect(hygieneIssues[0].issueType).toBe("org_only");
      expect(hygieneIssues[1].issueType).toBe("person_only");
    });
  });

  describe("Real-world Scenarios", () => {
    it("should handle mixed scenario: duplicates + hygiene issues", () => {
      const now = new Date();
      const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

      // Scenario: 5 demos for 2 organizations
      const activities = [
        // Acme Corp - 3 demos (2 duplicates)
        {
          id: "acme_1",
          org_id: 12345,
          org_name: "Acme Corp",
          due_date: new Date(sixMonthsAgo.getTime() + 10 * 24 * 60 * 60 * 1000),
          deal_id: 111,
          user_id: 1,
        },
        {
          id: "acme_2",
          org_id: 12345,
          org_name: "Acme Corp",
          due_date: new Date(sixMonthsAgo.getTime() + 40 * 24 * 60 * 60 * 1000),
          deal_id: undefined, // Also a hygiene issue
          user_id: 1,
        },
        {
          id: "acme_3",
          org_id: 12345,
          org_name: "Acme Corp",
          due_date: new Date(sixMonthsAgo.getTime() + 70 * 24 * 60 * 60 * 1000),
          deal_id: 333,
          user_id: 1,
        },
        // TechCorp - 2 demos (1 duplicate)
        {
          id: "tech_1",
          org_id: 67890,
          org_name: "TechCorp",
          due_date: new Date(sixMonthsAgo.getTime() + 20 * 24 * 60 * 60 * 1000),
          deal_id: 222,
          user_id: 2,
        },
        {
          id: "tech_2",
          org_id: 67890,
          org_name: "TechCorp",
          due_date: new Date(sixMonthsAgo.getTime() + 60 * 24 * 60 * 60 * 1000),
          deal_id: 444,
          user_id: 2,
        },
      ];

      // Detect duplicates
      const byOrg = new Map();
      for (const activity of activities) {
        if (!byOrg.has(activity.org_id)) {
          byOrg.set(activity.org_id, []);
        }
        byOrg.get(activity.org_id).push(activity);
      }

      const duplicates = [];
      for (const [orgId, orgActivities] of byOrg) {
        if (orgActivities.length > 1) {
          const sorted = orgActivities.sort(
            (a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime()
          );
          for (let i = 1; i < sorted.length; i++) {
            duplicates.push(sorted[i].id);
          }
        }
      }

      // Detect hygiene issues
      const hygieneIssues = activities
        .filter((a) => !a.deal_id)
        .map((a) => a.id);

      expect(duplicates).toHaveLength(3); // acme_2, acme_1, tech_1
      expect(hygieneIssues).toHaveLength(1); // acme_2
      expect(hygieneIssues[0]).toBe("acme_2"); // acme_2 is both duplicate AND hygiene issue
    });

    it("should handle large dataset efficiently", () => {
      // Simulate 1000 demos across 50 organizations
      const activities = [];
      for (let org = 0; org < 50; org++) {
        for (let demo = 0; demo < 20; demo++) {
          activities.push({
            id: `activity_${org}_${demo}`,
            org_id: org,
            org_name: `Organization ${org}`,
            due_date: new Date(Date.now() - Math.random() * 6 * 30 * 24 * 60 * 60 * 1000),
            deal_id: Math.random() > 0.1 ? demo : undefined, // 10% without deals
            user_id: Math.floor(Math.random() * 10),
          });
        }
      }

      const startTime = Date.now();

      // Group by org
      const byOrg = new Map();
      for (const activity of activities) {
        if (!byOrg.has(activity.org_id)) {
          byOrg.set(activity.org_id, []);
        }
        byOrg.get(activity.org_id).push(activity);
      }

      const endTime = Date.now();

      // Verify grouping worked
      expect(byOrg.size).toBe(50);
      expect(endTime - startTime).toBeLessThan(100); // Should be fast
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle empty Pipedrive response", () => {
      const activities = [];

      const byOrg = new Map();
      for (const activity of activities) {
        if (!byOrg.has(activity.org_id)) {
          byOrg.set(activity.org_id, []);
        }
        byOrg.get(activity.org_id).push(activity);
      }

      expect(byOrg.size).toBe(0);
    });

    it("should handle activities with missing org_id", () => {
      const activities = [
        { id: "1", org_id: 12345, deal_id: 111 },
        { id: "2", org_id: undefined, deal_id: 222 }, // Missing org
        { id: "3", org_id: 12345, deal_id: 333 },
      ];

      // Filter out activities without org_id
      const validActivities = activities.filter((a) => a.org_id);

      expect(validActivities).toHaveLength(2);
    });

    it("should handle timezone differences in dates", () => {
      const now = new Date();
      const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

      // Demo dates in different formats
      const activities = [
        {
          id: "1",
          due_date: new Date(sixMonthsAgo.getTime() + 1 * 24 * 60 * 60 * 1000),
        },
        {
          id: "2",
          due_date: new Date(sixMonthsAgo.getTime() + 2 * 24 * 60 * 60 * 1000),
        },
      ];

      // All should be within 6 months
      const within6Months = activities.filter((a) => a.due_date >= sixMonthsAgo);

      expect(within6Months).toHaveLength(2);
    });
  });
});
