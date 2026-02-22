import { and, desc, eq, gte, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  AeProfile,
  CommissionPayout,
  CommissionStructure,
  Deal,
  InsertAeProfile,
  InsertCommissionPayout,
  InsertCommissionStructure,
  InsertDeal,
  InsertMonthlyMetric,
  InsertUser,
  MonthlyMetric,
  aeProfiles,
  commissionPayouts,
  commissionStructures,
  deals,
  monthlyMetrics,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Auth Users ───────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── AE Profiles ─────────────────────────────────────────────────────────────

export async function createAeProfile(data: InsertAeProfile): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aeProfiles).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function getAeProfileById(id: number): Promise<AeProfile | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(aeProfiles).where(eq(aeProfiles.id, id)).limit(1);
  return result[0];
}

export async function getAeProfileByName(name: string): Promise<AeProfile | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(aeProfiles)
    .where(eq(aeProfiles.name, name))
    .limit(1);
  return result[0];
}

export async function getAllAeProfiles(includeInactive = false): Promise<AeProfile[]> {
  const db = await getDb();
  if (!db) return [];
  if (includeInactive) {
    return db.select().from(aeProfiles).orderBy(aeProfiles.name);
  }
  return db.select().from(aeProfiles).where(eq(aeProfiles.isActive, true)).orderBy(aeProfiles.name);
}

export async function updateAeProfile(
  id: number,
  data: Partial<Pick<AeProfile, "name" | "joinDate" | "isTeamLeader" | "isActive" | "pinHash" | "failedPinAttempts" | "lockedUntil">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(aeProfiles).set(data).where(eq(aeProfiles.id, id));
}

/** Increment failed PIN attempts and optionally set a lockout expiry. */
export async function recordFailedPinAttempt(
  id: number,
  newAttemptCount: number,
  lockoutUntil?: Date
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(aeProfiles)
    .set({
      failedPinAttempts: newAttemptCount,
      lockedUntil: lockoutUntil ?? null,
    })
    .where(eq(aeProfiles.id, id));
}

/** Reset failed attempt counter and clear any lockout after a successful login or PIN change. */
export async function resetPinAttempts(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(aeProfiles)
    .set({ failedPinAttempts: 0, lockedUntil: null })
    .where(eq(aeProfiles.id, id));
}

// ─── Monthly Metrics ──────────────────────────────────────────────────────────

export async function upsertMonthlyMetric(data: InsertMonthlyMetric): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateSet: Record<string, unknown> = {
    arrUsd: data.arrUsd,
    demosTotal: data.demosTotal,
    dialsTotal: data.dialsTotal,
    retentionRate: data.retentionRate,
  };
  // Only update VOIP Studio fields if they are provided
  if (data.connectedDials !== undefined) updateSet.connectedDials = data.connectedDials;
  if (data.connectionRate !== undefined) updateSet.connectionRate = data.connectionRate;
  if (data.talkTimeSecs !== undefined) updateSet.talkTimeSecs = data.talkTimeSecs;
  // Only update demosFromPipedrive if provided
  if (data.demosFromPipedrive !== undefined) updateSet.demosFromPipedrive = data.demosFromPipedrive;

  await db
    .insert(monthlyMetrics)
    .values(data)
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function getMetricsForAe(
  aeId: number,
  limit = 6
): Promise<MonthlyMetric[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(monthlyMetrics)
    .where(eq(monthlyMetrics.aeId, aeId))
    .orderBy(desc(monthlyMetrics.year), desc(monthlyMetrics.month))
    .limit(limit);
}

export async function getMetricsForMonth(
  aeId: number,
  year: number,
  month: number
): Promise<MonthlyMetric | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(monthlyMetrics)
    .where(
      and(
        eq(monthlyMetrics.aeId, aeId),
        eq(monthlyMetrics.year, year),
        eq(monthlyMetrics.month, month)
      )
    )
    .limit(1);
  return result[0];
}

// ─── Deals ────────────────────────────────────────────────────────────────────

export async function createDeal(data: InsertDeal): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(deals).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function getDealsForAe(aeId: number): Promise<Deal[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(deals)
    .where(eq(deals.aeId, aeId))
    .orderBy(desc(deals.startYear), desc(deals.startMonth), desc(deals.startDay));
}

export async function getDealById(id: number): Promise<Deal | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
  return result[0];
}

export async function deleteDeal(id: number, aeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(deals).where(and(eq(deals.id, id), eq(deals.aeId, aeId)));
}

// ─── Commission Payouts ───────────────────────────────────────────────────────

export async function createPayoutsForDeal(payouts: InsertCommissionPayout[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (payouts.length === 0) return;
  await db.insert(commissionPayouts).values(payouts);
}

export async function deletePayoutsForDeal(dealId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(commissionPayouts).where(eq(commissionPayouts.dealId, dealId));
}

export async function getPayoutsForAe(aeId: number): Promise<CommissionPayout[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(commissionPayouts)
    .where(eq(commissionPayouts.aeId, aeId))
    .orderBy(
      desc(commissionPayouts.payoutYear),
      desc(commissionPayouts.payoutMonth),
      commissionPayouts.dealId
    );
}

export async function getPayoutsForMonth(
  aeId: number,
  year: number,
  month: number
): Promise<CommissionPayout[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(commissionPayouts)
    .where(
      and(
        eq(commissionPayouts.aeId, aeId),
        eq(commissionPayouts.payoutYear, year),
        eq(commissionPayouts.payoutMonth, month)
      )
    );
}

export async function getPayoutsForDeal(dealId: number): Promise<CommissionPayout[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(commissionPayouts)
    .where(eq(commissionPayouts.dealId, dealId))
    .orderBy(commissionPayouts.payoutNumber);
}

// ─── Commission Structures ────────────────────────────────────────────────────

export async function getActiveCommissionStructure(): Promise<CommissionStructure | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(commissionStructures)
    .where(eq(commissionStructures.isActive, true))
    .limit(1);
  return result[0];
}

export async function getAllCommissionStructures(): Promise<CommissionStructure[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(commissionStructures)
    .orderBy(desc(commissionStructures.effectiveFrom));
}

export async function getCommissionStructureById(id: number): Promise<CommissionStructure | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(commissionStructures)
    .where(eq(commissionStructures.id, id))
    .limit(1);
  return result[0];
}

export async function createCommissionStructure(data: InsertCommissionStructure): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(commissionStructures).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function updateCommissionStructure(
  id: number,
  data: Partial<InsertCommissionStructure>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(commissionStructures).set(data).where(eq(commissionStructures.id, id));
}

/** Deactivate all versions, then activate the given one. */
export async function activateCommissionStructure(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Deactivate all
  await db.update(commissionStructures).set({ isActive: false });
  // Activate the chosen one
  await db.update(commissionStructures).set({ isActive: true }).where(eq(commissionStructures.id, id));
}

/** Seed the initial v1 structure if no structures exist yet. */
export async function seedInitialCommissionStructure(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(commissionStructures).limit(1);
  if (existing.length > 0) return; // already seeded

  await db.insert(commissionStructures).values({
    versionLabel: "Q1 2026 — Initial",
    effectiveFrom: new Date("2026-01-01"),
    isActive: true,
    bronzeRate: "0.1300",
    silverRate: "0.1600",
    goldRate: "0.1900",
    standardTargets: {
      silver: { arrUsd: 20000, demosPw: 3, dialsPw: 100, retentionMin: 61 },
      gold:   { arrUsd: 25000, demosPw: 4, dialsPw: 200, retentionMin: 71 },
    },
    teamLeaderTargets: {
      silver: { arrUsd: 10000, demosPw: 2, dialsPw: 50, retentionMin: 61 },
      gold:   { arrUsd: 12500, demosPw: 2, dialsPw: 100, retentionMin: 71 },
    },
    monthlyPayoutMonths: 13,
    onboardingDeductionGbp: "500.00",
    onboardingArrReductionUsd: "5000.00",
    createdBy: "system",
    notes: "Initial commission structure seeded from hardcoded constants.",
  });
}
