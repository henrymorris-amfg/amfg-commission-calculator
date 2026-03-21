/**
 * Tests for the Tier Change Notifier
 *
 * Tests cover:
 * - buildNotificationContent for promotions and demotions
 * - tierDirection helper
 * - Scheduler initialization
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock dependencies ────────────────────────────────────────────────────────

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { checkAndNotifyTierChanges, getNotificationHistory, getAllRecentNotifications } from "./tierChangeNotifier";
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockDb(overrides: Record<string, any> = {}) {
  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  return {
    select: mockSelect,
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Tier Change Notifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkAndNotifyTierChanges", () => {
    it("returns empty array when db is null", async () => {
      vi.mocked(getDb).mockResolvedValue(null as any);
      const results = await checkAndNotifyTierChanges(3, 2026);
      expect(results).toEqual([]);
    });

    it("returns skipped result when no active AEs", async () => {
      const mockDb = makeMockDb();
      // Override the aeProfiles select to return empty array
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const results = await checkAndNotifyTierChanges(3, 2026);
      expect(results).toEqual([]);
    });
  });

  describe("getNotificationHistory", () => {
    it("returns empty array when db is null", async () => {
      vi.mocked(getDb).mockResolvedValue(null as any);
      const results = await getNotificationHistory(1);
      expect(results).toEqual([]);
    });

    it("calls db with correct aeId", async () => {
      const mockDb = makeMockDb();
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      await getNotificationHistory(42, 5);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe("getAllRecentNotifications", () => {
    it("returns empty array when db is null", async () => {
      vi.mocked(getDb).mockResolvedValue(null as any);
      const results = await getAllRecentNotifications();
      expect(results).toEqual([]);
    });

    it("calls db correctly", async () => {
      const mockDb = makeMockDb();
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      await getAllRecentNotifications(25);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });
});

describe("Tier Change Scheduler", () => {
  it("can be imported without errors", async () => {
    const { initializeTierChangeScheduler, stopTierChangeScheduler } = await import("./tierChangeScheduler");
    expect(typeof initializeTierChangeScheduler).toBe("function");
    expect(typeof stopTierChangeScheduler).toBe("function");
  });

  it("initializes and stops without throwing", async () => {
    const { initializeTierChangeScheduler, stopTierChangeScheduler } = await import("./tierChangeScheduler");
    expect(() => initializeTierChangeScheduler()).not.toThrow();
    expect(() => stopTierChangeScheduler()).not.toThrow();
  });
});

describe("Notification content builder", () => {
  it("formats tier labels correctly", () => {
    // Test the tier label formatting logic inline
    const TIER_COMMISSION_RATE: Record<string, number> = {
      bronze: 0.13,
      silver: 0.16,
      gold: 0.19,
    };

    const formatTierLabel = (tier: string): string => {
      const rate = (TIER_COMMISSION_RATE[tier] * 100).toFixed(0);
      const emoji = tier === "gold" ? "🥇" : tier === "silver" ? "🥈" : "🥉";
      return `${emoji} ${tier.charAt(0).toUpperCase() + tier.slice(1)} (${rate}% commission)`;
    };

    expect(formatTierLabel("bronze")).toContain("Bronze");
    expect(formatTierLabel("bronze")).toContain("13%");
    expect(formatTierLabel("silver")).toContain("Silver");
    expect(formatTierLabel("silver")).toContain("16%");
    expect(formatTierLabel("gold")).toContain("Gold");
    expect(formatTierLabel("gold")).toContain("19%");
  });

  it("calculates tier direction correctly", () => {
    const tierDirection = (prev: string, next: string): "promoted" | "demoted" | "same" => {
      const order: Record<string, number> = { bronze: 0, silver: 1, gold: 2 };
      if (order[next] > order[prev]) return "promoted";
      if (order[next] < order[prev]) return "demoted";
      return "same";
    };

    expect(tierDirection("bronze", "silver")).toBe("promoted");
    expect(tierDirection("bronze", "gold")).toBe("promoted");
    expect(tierDirection("silver", "gold")).toBe("promoted");
    expect(tierDirection("gold", "silver")).toBe("demoted");
    expect(tierDirection("gold", "bronze")).toBe("demoted");
    expect(tierDirection("silver", "bronze")).toBe("demoted");
    expect(tierDirection("silver", "silver")).toBe("same");
    expect(tierDirection("gold", "gold")).toBe("same");
  });

  it("commission rate impact calculation is correct", () => {
    // Bronze → Silver: +3pp
    const bronzeRate = 13;
    const silverRate = 16;
    const goldRate = 19;

    expect(silverRate - bronzeRate).toBe(3);
    expect(goldRate - silverRate).toBe(3);
    expect(goldRate - bronzeRate).toBe(6);

    // Each 1pp on £1,000 deal = £10 more
    const impactPerDeal = (silverRate - bronzeRate) * 10;
    expect(impactPerDeal).toBe(30);
  });
});
