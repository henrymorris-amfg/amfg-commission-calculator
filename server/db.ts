import { and, desc, eq, gte, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  AeProfile,
  CommissionPayout,
  Deal,
  InsertAeProfile,
  InsertCommissionPayout,
  InsertDeal,
  InsertMonthlyMetric,
  InsertUser,
  MonthlyMetric,
  aeProfiles,
  commissionPayouts,
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

export async function getAllAeProfiles(): Promise<AeProfile[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(aeProfiles).orderBy(aeProfiles.name);
}

export async function updateAeProfile(
  id: number,
  data: Partial<Pick<AeProfile, "name" | "joinDate" | "isTeamLeader">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(aeProfiles).set(data).where(eq(aeProfiles.id, id));
}

// ─── Monthly Metrics ──────────────────────────────────────────────────────────

export async function upsertMonthlyMetric(data: InsertMonthlyMetric): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(monthlyMetrics)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        arrUsd: data.arrUsd,
        demosTotal: data.demosTotal,
        dialsTotal: data.dialsTotal,
        retentionRate: data.retentionRate,
      },
    });
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
