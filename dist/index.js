var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/const.ts
var COOKIE_NAME, ONE_YEAR_MS, AXIOS_TIMEOUT_MS, UNAUTHED_ERR_MSG, NOT_ADMIN_ERR_MSG;
var init_const = __esm({
  "shared/const.ts"() {
    "use strict";
    COOKIE_NAME = "app_session_id";
    ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
    AXIOS_TIMEOUT_MS = 3e4;
    UNAUTHED_ERR_MSG = "Please login (10001)";
    NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
  }
});

// drizzle/schema.ts
import {
  boolean,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  unique,
  varchar
} from "drizzle-orm/mysql-core";
var users, commissionStructures, aeProfiles, monthlyMetrics, deals, commissionPayouts, duplicateDemoFlags, crmHygieneIssues, tierChangeNotifications;
var init_schema = __esm({
  "drizzle/schema.ts"() {
    "use strict";
    users = mysqlTable("users", {
      id: int("id").autoincrement().primaryKey(),
      openId: varchar("openId", { length: 64 }).notNull().unique(),
      name: text("name"),
      email: varchar("email", { length: 320 }),
      loginMethod: varchar("loginMethod", { length: 64 }),
      role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
      lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
    });
    commissionStructures = mysqlTable("commission_structures", {
      id: int("id").autoincrement().primaryKey(),
      versionLabel: varchar("versionLabel", { length: 128 }).notNull(),
      // e.g. "Q1 2026"
      effectiveFrom: timestamp("effectiveFrom").notNull(),
      // when this version takes effect
      isActive: boolean("isActive").default(false).notNull(),
      // Tier commission rates (stored as decimals, e.g. 0.13)
      bronzeRate: decimal("bronzeRate", { precision: 5, scale: 4 }).notNull().default("0.1300"),
      silverRate: decimal("silverRate", { precision: 5, scale: 4 }).notNull().default("0.1600"),
      goldRate: decimal("goldRate", { precision: 5, scale: 4 }).notNull().default("0.1900"),
      // Standard targets (JSON blob for flexibility)
      standardTargets: json("standardTargets").notNull(),
      // Team leader targets (JSON blob)
      teamLeaderTargets: json("teamLeaderTargets").notNull(),
      // Payout rules
      monthlyPayoutMonths: int("monthlyPayoutMonths").notNull().default(13),
      onboardingDeductionGbp: decimal("onboardingDeductionGbp", { precision: 10, scale: 2 }).notNull().default("500.00"),
      onboardingArrReductionUsd: decimal("onboardingArrReductionUsd", { precision: 12, scale: 2 }).notNull().default("5000.00"),
      // Audit
      createdBy: varchar("createdBy", { length: 128 }).notNull().default("system"),
      notes: text("notes"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    aeProfiles = mysqlTable("ae_profiles", {
      id: int("id").autoincrement().primaryKey(),
      name: varchar("name", { length: 128 }).notNull(),
      email: varchar("email", { length: 320 }),
      pinHash: varchar("pinHash", { length: 256 }).notNull(),
      joinDate: timestamp("joinDate").notNull(),
      isTeamLeader: boolean("isTeamLeader").default(false).notNull(),
      // Whether this AE is still active (false = left the company)
      isActive: boolean("isActive").default(true).notNull(),
      // PIN lockout: track failed attempts and when the lockout expires
      failedPinAttempts: int("failedPinAttempts").default(0).notNull(),
      lockedUntil: timestamp("lockedUntil"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    monthlyMetrics = mysqlTable("monthly_metrics", {
      id: int("id").autoincrement().primaryKey(),
      aeId: int("aeId").notNull(),
      // Year + month stored as integers for easy querying (e.g. year=2026, month=3)
      year: int("year").notNull(),
      month: int("month").notNull(),
      // 1–12
      arrUsd: decimal("arrUsd", { precision: 12, scale: 2 }).notNull().default("0"),
      demosTotal: int("demosTotal").notNull().default(0),
      // from spreadsheet
      demosFromPipedrive: int("demosFromPipedrive").notNull().default(0),
      dialsTotal: int("dialsTotal").notNull().default(0),
      retentionRate: decimal("retentionRate", { precision: 5, scale: 2 }),
      // % e.g. 71.50
      // VOIP Studio metrics
      connectedDials: int("connectedDials").default(0),
      connectionRate: decimal("connectionRate", { precision: 5, scale: 2 }),
      // % e.g. 74.60
      talkTimeSecs: int("talkTimeSecs").default(0),
      // total connected talk time in seconds
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (t2) => ({
      // Enforce one row per AE per calendar month — prevents duplicate inserts from VOIP + Pipedrive syncs
      aeMonthUnique: unique("ae_month_unique").on(t2.aeId, t2.year, t2.month)
    }));
    deals = mysqlTable("deals", {
      id: int("id").autoincrement().primaryKey(),
      aeId: int("aeId").notNull(),
      customerName: varchar("customerName", { length: 256 }).notNull(),
      contractType: mysqlEnum("contractType", ["annual", "monthly"]).notNull(),
      // Contract start date (determines which tier applies)
      startYear: int("startYear").notNull(),
      startMonth: int("startMonth").notNull(),
      // 1–12
      startDay: int("startDay").notNull(),
      // Original amount and currency (for audit trail)
      originalAmount: decimal("originalAmount", { precision: 12, scale: 2 }).notNull(),
      originalCurrency: mysqlEnum("originalCurrency", ["USD", "EUR", "GBP"]).default("USD").notNull(),
      // Converted to USD for commission calculations
      arrUsd: decimal("arrUsd", { precision: 12, scale: 2 }).notNull(),
      // FX rate used for conversion (if originalCurrency != USD)
      conversionRate: decimal("conversionRate", { precision: 10, scale: 6 }).default("1.000000").notNull(),
      onboardingFeePaid: boolean("onboardingFeePaid").default(true).notNull(),
      isReferral: boolean("isReferral").default(false).notNull(),
      // Tier locked at the time the contract started
      tierAtStart: mysqlEnum("tierAtStart", ["bronze", "silver", "gold"]).notNull(),
      // Snapshot of FX rate at time of deal won (USD→GBP) — locked at won_time from Pipedrive
      fxRateAtWon: decimal("fxRateAtWon", { precision: 10, scale: 6 }),
      // Snapshot of FX rate at time of deal entry (USD→GBP) — legacy
      fxRateAtEntry: decimal("fxRateAtEntry", { precision: 10, scale: 6 }).notNull(),
      // Locked GBP conversion rate at deal creation (for deterministic payouts)
      fxRateLockedAtCreation: decimal("fxRateLockedAtCreation", { precision: 10, scale: 6 }),
      // When the deal was signed (for FX rate locking)
      dealSignedDate: timestamp("dealSignedDate"),
      // When the locked GBP rate was captured
      fxRateLockDate: timestamp("fxRateLockDate"),
      // Reference to the commission structure version active when the deal was created
      commissionStructureId: int("commissionStructureId"),
      // Pipedrive deal ID — set when imported from Pipedrive, null for manually entered deals
      pipedriveId: int("pipedriveId"),
      // Billing frequency: annual (upfront), monthly (13 months), or null if not set
      billingFrequency: mysqlEnum("billingFrequency", ["annual", "monthly"]),
      // Pipedrive won_time — timestamp when deal was marked as won
      pipedriveWonTime: timestamp("pipedriveWonTime"),
      // Contract start date from Pipedrive (determines payout month)
      contractStartDate: timestamp("contractStartDate"),
      // Churn tracking (for monthly deals)
      isChurned: boolean("isChurned").default(false).notNull(),
      churnMonth: int("churnMonth"),
      // 1–12, null if not churned
      churnYear: int("churnYear"),
      // null if not churned
      churnReason: text("churnReason"),
      // optional reason for churn
      notes: text("notes"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    commissionPayouts = mysqlTable("commission_payouts", {
      id: int("id").autoincrement().primaryKey(),
      dealId: int("dealId").notNull(),
      aeId: int("aeId").notNull(),
      // The month this payout is for
      payoutYear: int("payoutYear").notNull(),
      payoutMonth: int("payoutMonth").notNull(),
      // 1–12
      payoutNumber: int("payoutNumber").notNull(),
      // 1 = first payout, up to 13
      grossCommissionUsd: decimal("grossCommissionUsd", { precision: 12, scale: 2 }).notNull(),
      // Deductions
      referralDeductionUsd: decimal("referralDeductionUsd", { precision: 12, scale: 2 }).default("0").notNull(),
      onboardingDeductionGbp: decimal("onboardingDeductionGbp", { precision: 10, scale: 2 }).default("0").notNull(),
      // Final amounts
      netCommissionUsd: decimal("netCommissionUsd", { precision: 12, scale: 2 }).notNull(),
      fxRateUsed: decimal("fxRateUsed", { precision: 10, scale: 6 }).notNull(),
      netCommissionGbp: decimal("netCommissionGbp", { precision: 12, scale: 2 }).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    duplicateDemoFlags = mysqlTable("duplicate_demo_flags", {
      id: int("id").autoincrement().primaryKey(),
      aeId: int("aeId").notNull(),
      pipedriveActivityId: varchar("pipedriveActivityId", { length: 128 }).notNull().unique(),
      organizationId: int("organizationId"),
      // Pipedrive organization ID
      organizationName: varchar("organizationName", { length: 256 }).notNull(),
      demoDate: timestamp("demoDate").notNull(),
      // When the demo was marked done
      isDuplicate: boolean("isDuplicate").default(false).notNull(),
      // true if duplicate within 6 months
      isAcknowledged: boolean("isAcknowledged").default(false).notNull(),
      // AE has seen the flag
      acknowledgedAt: timestamp("acknowledgedAt"),
      notes: text("notes"),
      // Explanation of why it's flagged
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    crmHygieneIssues = mysqlTable("crm_hygiene_issues", {
      id: int("id").autoincrement().primaryKey(),
      aeId: int("aeId").notNull(),
      pipedriveActivityId: varchar("pipedriveActivityId", { length: 128 }).notNull().unique(),
      issueType: mysqlEnum("issueType", ["no_deal_link", "org_only", "person_only", "lead_only"]).notNull(),
      organizationName: varchar("organizationName", { length: 256 }),
      personName: varchar("personName", { length: 256 }),
      leadTitle: varchar("leadTitle", { length: 256 }),
      demoDate: timestamp("demoDate").notNull(),
      isAcknowledged: boolean("isAcknowledged").default(false).notNull(),
      acknowledgedAt: timestamp("acknowledgedAt"),
      explanation: text("explanation"),
      // Why this is a hygiene issue
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    tierChangeNotifications = mysqlTable("tier_change_notifications", {
      id: int("id").autoincrement().primaryKey(),
      aeId: int("aeId").notNull(),
      // The month/year this notification is for
      notificationYear: int("notificationYear").notNull(),
      notificationMonth: int("notificationMonth").notNull(),
      // 1–12
      // Tier transition
      previousTier: mysqlEnum("previousTier", ["bronze", "silver", "gold"]).notNull(),
      newTier: mysqlEnum("newTier", ["bronze", "silver", "gold"]).notNull(),
      // Metrics snapshot at time of notification
      avgArrUsd: decimal("avgArrUsd", { precision: 12, scale: 2 }),
      avgDemosPw: decimal("avgDemosPw", { precision: 6, scale: 2 }),
      avgDialsPw: decimal("avgDialsPw", { precision: 8, scale: 2 }),
      // Notification status
      sentAt: timestamp("sentAt").defaultNow().notNull(),
      deliveryStatus: mysqlEnum("deliveryStatus", ["sent", "failed", "skipped"]).default("sent").notNull(),
      errorMessage: text("errorMessage"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
  }
});

// server/_core/env.ts
var ENV;
var init_env = __esm({
  "server/_core/env.ts"() {
    "use strict";
    ENV = {
      appId: process.env.VITE_APP_ID ?? "",
      cookieSecret: process.env.JWT_SECRET ?? "",
      databaseUrl: process.env.DATABASE_URL ?? "",
      oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
      ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
      isProduction: process.env.NODE_ENV === "production",
      forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
      forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
      fxApiKey: process.env.FX_API_KEY ?? "",
      resendApiKey: process.env.RESEND_API_KEY ?? ""
    };
  }
});

// server/db.ts
var db_exports = {};
__export(db_exports, {
  activateCommissionStructure: () => activateCommissionStructure,
  createAeProfile: () => createAeProfile,
  createCommissionStructure: () => createCommissionStructure,
  createDeal: () => createDeal,
  createPayoutsForDeal: () => createPayoutsForDeal,
  deleteDeal: () => deleteDeal,
  deletePayoutsForDeal: () => deletePayoutsForDeal,
  getActiveCommissionStructure: () => getActiveCommissionStructure,
  getAeProfileById: () => getAeProfileById,
  getAeProfileByName: () => getAeProfileByName,
  getAllAeProfiles: () => getAllAeProfiles,
  getAllCommissionStructures: () => getAllCommissionStructures,
  getCommissionStructureById: () => getCommissionStructureById,
  getDb: () => getDb,
  getDealById: () => getDealById,
  getDealByPipedriveId: () => getDealByPipedriveId,
  getDealsForAe: () => getDealsForAe,
  getMetricsForAe: () => getMetricsForAe,
  getMetricsForMonth: () => getMetricsForMonth,
  getPayoutsForAe: () => getPayoutsForAe,
  getPayoutsForDeal: () => getPayoutsForDeal,
  getPayoutsForMonth: () => getPayoutsForMonth,
  getUserByOpenId: () => getUserByOpenId,
  recordFailedPinAttempt: () => recordFailedPinAttempt,
  resetPinAttempts: () => resetPinAttempts,
  seedInitialCommissionStructure: () => seedInitialCommissionStructure,
  updateAeProfile: () => updateAeProfile,
  updateCommissionStructure: () => updateCommissionStructure,
  upsertMonthlyMetric: () => upsertMonthlyMetric,
  upsertUser: () => upsertUser
});
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values = { openId: user.openId };
  const updateSet = {};
  const textFields = ["name", "email", "loginMethod"];
  for (const field of textFields) {
    const value = user[field];
    if (value === void 0) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }
  if (user.lastSignedIn !== void 0) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== void 0) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = /* @__PURE__ */ new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = /* @__PURE__ */ new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}
async function createAeProfile(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aeProfiles).values(data);
  return result[0].insertId;
}
async function getAeProfileById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(aeProfiles).where(eq(aeProfiles.id, id)).limit(1);
  return result[0];
}
async function getAeProfileByName(name) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(aeProfiles).where(eq(aeProfiles.name, name)).limit(1);
  return result[0];
}
async function getAllAeProfiles(includeInactive = false) {
  const db = await getDb();
  if (!db) return [];
  if (includeInactive) {
    return db.select().from(aeProfiles).orderBy(aeProfiles.name);
  }
  return db.select().from(aeProfiles).where(eq(aeProfiles.isActive, true)).orderBy(aeProfiles.name);
}
async function updateAeProfile(id, data) {
  const db = await getDb();
  if (!db) return;
  await db.update(aeProfiles).set(data).where(eq(aeProfiles.id, id));
}
async function recordFailedPinAttempt(id, newAttemptCount, lockoutUntil) {
  const db = await getDb();
  if (!db) return;
  await db.update(aeProfiles).set({
    failedPinAttempts: newAttemptCount,
    lockedUntil: lockoutUntil ?? null
  }).where(eq(aeProfiles.id, id));
}
async function resetPinAttempts(id) {
  const db = await getDb();
  if (!db) return;
  await db.update(aeProfiles).set({ failedPinAttempts: 0, lockedUntil: null }).where(eq(aeProfiles.id, id));
}
async function upsertMonthlyMetric(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateSet = {
    arrUsd: data.arrUsd,
    demosTotal: data.demosTotal,
    dialsTotal: data.dialsTotal,
    retentionRate: data.retentionRate
  };
  if (data.connectedDials !== void 0) updateSet.connectedDials = data.connectedDials;
  if (data.connectionRate !== void 0) updateSet.connectionRate = data.connectionRate;
  if (data.talkTimeSecs !== void 0) updateSet.talkTimeSecs = data.talkTimeSecs;
  if (data.demosFromPipedrive !== void 0) updateSet.demosFromPipedrive = data.demosFromPipedrive;
  await db.insert(monthlyMetrics).values(data).onDuplicateKeyUpdate({ set: updateSet });
}
async function getMetricsForAe(aeId, limit = 6) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(monthlyMetrics).where(eq(monthlyMetrics.aeId, aeId)).orderBy(desc(monthlyMetrics.year), desc(monthlyMetrics.month)).limit(limit);
}
async function getMetricsForMonth(aeId, year, month) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(monthlyMetrics).where(
    and(
      eq(monthlyMetrics.aeId, aeId),
      eq(monthlyMetrics.year, year),
      eq(monthlyMetrics.month, month)
    )
  ).limit(1);
  return result[0];
}
async function createDeal(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(deals).values(data);
  return result[0].insertId;
}
async function getDealsForAe(aeId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(deals).where(eq(deals.aeId, aeId)).orderBy(desc(deals.startYear), desc(deals.startMonth), desc(deals.startDay));
}
async function getDealById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
  return result[0];
}
async function getDealByPipedriveId(aeId, pipedriveId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(deals).where(and(eq(deals.aeId, aeId), eq(deals.pipedriveId, pipedriveId))).limit(1);
  return result[0];
}
async function deleteDeal(id, aeId) {
  const db = await getDb();
  if (!db) return;
  await db.delete(deals).where(and(eq(deals.id, id), eq(deals.aeId, aeId)));
}
async function createPayoutsForDeal(payouts) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (payouts.length === 0) return;
  await db.insert(commissionPayouts).values(payouts);
}
async function deletePayoutsForDeal(dealId) {
  const db = await getDb();
  if (!db) return;
  await db.delete(commissionPayouts).where(eq(commissionPayouts.dealId, dealId));
}
async function getPayoutsForAe(aeId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(commissionPayouts).where(eq(commissionPayouts.aeId, aeId)).orderBy(
    desc(commissionPayouts.payoutYear),
    desc(commissionPayouts.payoutMonth),
    commissionPayouts.dealId
  );
}
async function getPayoutsForMonth(aeId, year, month) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(commissionPayouts).where(
    and(
      eq(commissionPayouts.aeId, aeId),
      eq(commissionPayouts.payoutYear, year),
      eq(commissionPayouts.payoutMonth, month)
    )
  );
}
async function getPayoutsForDeal(dealId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(commissionPayouts).where(eq(commissionPayouts.dealId, dealId)).orderBy(commissionPayouts.payoutNumber);
}
async function getActiveCommissionStructure() {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(commissionStructures).where(eq(commissionStructures.isActive, true)).limit(1);
  return result[0];
}
async function getAllCommissionStructures() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(commissionStructures).orderBy(desc(commissionStructures.effectiveFrom));
}
async function getCommissionStructureById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(commissionStructures).where(eq(commissionStructures.id, id)).limit(1);
  return result[0];
}
async function createCommissionStructure(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(commissionStructures).values(data);
  return result[0].insertId;
}
async function updateCommissionStructure(id, data) {
  const db = await getDb();
  if (!db) return;
  await db.update(commissionStructures).set(data).where(eq(commissionStructures.id, id));
}
async function activateCommissionStructure(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(commissionStructures).set({ isActive: false });
  await db.update(commissionStructures).set({ isActive: true }).where(eq(commissionStructures.id, id));
}
async function seedInitialCommissionStructure() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(commissionStructures).limit(1);
  if (existing.length > 0) return;
  await db.insert(commissionStructures).values({
    versionLabel: "Q1 2026 \u2014 Initial",
    effectiveFrom: /* @__PURE__ */ new Date("2026-01-01"),
    isActive: true,
    bronzeRate: "0.1300",
    silverRate: "0.1600",
    goldRate: "0.1900",
    standardTargets: {
      silver: { arrUsd: 2e4, demosPw: 3, dialsPw: 100, retentionMin: 61 },
      gold: { arrUsd: 25e3, demosPw: 4, dialsPw: 200, retentionMin: 71 }
    },
    teamLeaderTargets: {
      silver: { arrUsd: 1e4, demosPw: 2, dialsPw: 50, retentionMin: 61 },
      gold: { arrUsd: 12500, demosPw: 2, dialsPw: 100, retentionMin: 71 }
    },
    monthlyPayoutMonths: 13,
    onboardingDeductionGbp: "500.00",
    onboardingArrReductionUsd: "5000.00",
    createdBy: "system",
    notes: "Initial commission structure seeded from hardcoded constants."
  });
}
var _db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    init_env();
    _db = null;
  }
});

// server/_core/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
var t, router, publicProcedure, requireUser, protectedProcedure, adminProcedure;
var init_trpc = __esm({
  "server/_core/trpc.ts"() {
    "use strict";
    init_const();
    t = initTRPC.context().create({
      transformer: superjson
    });
    router = t.router;
    publicProcedure = t.procedure;
    requireUser = t.middleware(async (opts) => {
      const { ctx, next } = opts;
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      }
      return next({
        ctx: {
          ...ctx,
          user: ctx.user
        }
      });
    });
    protectedProcedure = t.procedure.use(requireUser);
    adminProcedure = t.procedure.use(
      t.middleware(async (opts) => {
        const { ctx, next } = opts;
        if (!ctx.user || ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
        }
        return next({
          ctx: {
            ...ctx,
            user: ctx.user
          }
        });
      })
    );
  }
});

// server/aeTokenUtils.ts
import { createHmac, timingSafeEqual } from "crypto";
function getSecret() {
  return ENV.cookieSecret || "fallback-dev-secret";
}
function parseAeToken(token) {
  try {
    console.log("[parseAeToken] Token:", token.substring(0, 20) + "...");
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx < 0) {
      console.log("[parseAeToken] No dot found");
      return null;
    }
    const payload = token.substring(0, dotIdx);
    const sig = token.substring(dotIdx + 1);
    const expectedSig = createHmac("sha256", getSecret()).update(payload).digest("base64url");
    const sigBuf = Buffer.from(sig, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length) {
      console.log("[parseAeToken] Signature length mismatch", sigBuf.length, expectedBuf.length);
      return null;
    }
    if (!timingSafeEqual(sigBuf, expectedBuf)) {
      console.log("[parseAeToken] Signature verification failed");
      return null;
    }
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof parsed.aeId !== "number") return null;
    return { aeId: parsed.aeId };
  } catch {
    return null;
  }
}
function getAeIdFromCtx(ctx) {
  console.log("[getAeIdFromCtx] Checking headers for authentication");
  const headerToken = ctx.req.headers["x-ae-token"];
  console.log("[getAeIdFromCtx] X-AE-Token header present:", !!headerToken);
  if (headerToken) {
    console.log("[getAeIdFromCtx] Parsing X-AE-Token header");
    const parsed = parseAeToken(headerToken);
    if (parsed) {
      console.log("[getAeIdFromCtx] Successfully parsed aeId from header:", parsed.aeId);
      return parsed.aeId;
    }
    console.log("[getAeIdFromCtx] Failed to parse X-AE-Token header");
  }
  const cookieHeader = ctx.req.headers["cookie"];
  console.log("[getAeIdFromCtx] Cookie header present:", !!cookieHeader);
  if (cookieHeader) {
    const match = cookieHeader.match(/ae_session=([^;]+)/);
    if (match?.[1]) {
      console.log("[getAeIdFromCtx] Parsing ae_session cookie");
      const parsed = parseAeToken(match[1]);
      if (parsed) {
        console.log("[getAeIdFromCtx] Successfully parsed aeId from cookie:", parsed.aeId);
        return parsed.aeId;
      }
      console.log("[getAeIdFromCtx] Failed to parse ae_session cookie");
    }
  }
  console.log("[getAeIdFromCtx] No valid authentication found - returning null");
  return null;
}
var init_aeTokenUtils = __esm({
  "server/aeTokenUtils.ts"() {
    "use strict";
    init_env();
  }
});

// server/voipSync.ts
var voipSync_exports = {};
__export(voipSync_exports, {
  pullVoipMonthlyData: () => pullVoipMonthlyData,
  voipSyncRouter: () => voipSyncRouter
});
import { z } from "zod";
import { TRPCError as TRPCError2 } from "@trpc/server";
function getVoipApiKey() {
  const key = process.env.VOIP_STUDIO_API_KEY;
  if (!key) throw new Error("VOIP_STUDIO_API_KEY not set");
  return key;
}
function buildFilter(filters) {
  return JSON.stringify(filters);
}
async function voipGet(endpoint, params = {}) {
  const apiKey = getVoipApiKey();
  const url = new URL(`${VOIP_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { "X-Auth-Token": apiKey }
  });
  if (!res.ok) {
    throw new Error(`VOIP API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
async function getVoipUsers() {
  const data = await voipGet(
    "users",
    { limit: 100 }
  );
  return (data.data || []).filter((u) => u.active !== false).map((u) => ({
    id: u.id,
    name: `${u.first_name} ${u.last_name}`.trim(),
    extension: u.ext || ""
  }));
}
async function findVoipUserId(aeName) {
  const users2 = await getVoipUsers();
  const exact = users2.find((u) => u.name.toLowerCase() === aeName.toLowerCase());
  if (exact) return exact.id;
  const nameParts = aeName.toLowerCase().split(" ");
  const partial = users2.find((u) => {
    const uParts = u.name.toLowerCase().split(" ");
    return nameParts.every((part) => uParts.some((up) => up.includes(part)));
  });
  return partial?.id ?? null;
}
async function getDialCount(userId, dateFrom, dateTo) {
  const totalFilter = buildFilter([
    { property: "calldate", operator: "gte", value: `${dateFrom} 00:00:00` },
    { property: "calldate", operator: "lte", value: `${dateTo} 23:59:59` },
    { property: "type", operator: "eq", value: "O" },
    { property: "user_id", operator: "eq", value: userId }
  ]);
  const totalData = await voipGet("cdrs", { filter: totalFilter, limit: 1 });
  const connFilter = buildFilter([
    { property: "calldate", operator: "gte", value: `${dateFrom} 00:00:00` },
    { property: "calldate", operator: "lte", value: `${dateTo} 23:59:59` },
    { property: "type", operator: "eq", value: "O" },
    { property: "user_id", operator: "eq", value: userId },
    { property: "disposition", operator: "eq", value: "CONNECTED" }
  ]);
  const connData = await voipGet("cdrs", { filter: connFilter, limit: 1e3 });
  let talkTimeSecs = 0;
  const connectedTotal = connData.total || 0;
  if (connectedTotal <= 1e3) {
    for (const cdr of connData.data || []) {
      talkTimeSecs += cdr.billsec || 0;
    }
  } else {
    for (const cdr of connData.data || []) {
      talkTimeSecs += cdr.billsec || 0;
    }
    let page = 2;
    let fetched = (connData.data || []).length;
    while (fetched < connectedTotal) {
      const pageData = await voipGet("cdrs", {
        filter: connFilter,
        limit: 1e3,
        page
      });
      for (const cdr of pageData.data || []) {
        talkTimeSecs += cdr.billsec || 0;
      }
      fetched += (pageData.data || []).length;
      page++;
    }
  }
  return {
    total: totalData.total || 0,
    connected: connectedTotal,
    talkTimeSecs
  };
}
function formatTalkTime(secs) {
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor(secs % 3600 / 60);
  const s = secs % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m ${s}s`;
}
function formatDate(d) {
  return d.toISOString().substring(0, 10);
}
async function pullVoipMonthlyData(months, useJoinDate = true) {
  const allProfiles = await getAllAeProfiles();
  const results = [];
  const unmatchedAes = [];
  const now = /* @__PURE__ */ new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  for (const ae of allProfiles) {
    const voipUserId = await findVoipUserId(ae.name);
    if (!voipUserId) {
      unmatchedAes.push(ae.name);
      continue;
    }
    let startYear;
    let startMonth;
    if (useJoinDate) {
      const joinDate = new Date(ae.joinDate);
      startYear = joinDate.getFullYear();
      startMonth = joinDate.getMonth() + 1;
    } else {
      const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
      startYear = startDate.getFullYear();
      startMonth = startDate.getMonth() + 1;
    }
    let iterYear = startYear;
    let iterMonth = startMonth;
    while (iterYear < currentYear || iterYear === currentYear && iterMonth <= currentMonth) {
      const firstDay = formatDate(new Date(iterYear, iterMonth - 1, 1));
      const lastDay = formatDate(new Date(iterYear, iterMonth, 0));
      const stats = await getDialCount(voipUserId, firstDay, lastDay);
      const connectionRate = stats.total > 0 ? Math.round(stats.connected / stats.total * 1e4) / 100 : 0;
      results.push({
        aeName: ae.name,
        aeId: ae.id,
        year: iterYear,
        month: iterMonth,
        totalDials: stats.total,
        connected: stats.connected,
        connectionRate,
        totalTalkTimeSecs: stats.talkTimeSecs
      });
      iterMonth++;
      if (iterMonth > 12) {
        iterMonth = 1;
        iterYear++;
      }
    }
  }
  return { data: results, unmatchedAes };
}
var VOIP_BASE, voipSyncRouter;
var init_voipSync = __esm({
  "server/voipSync.ts"() {
    "use strict";
    init_trpc();
    init_const();
    init_aeTokenUtils();
    init_db();
    VOIP_BASE = "https://l7api.com/v1.2/voipstudio";
    voipSyncRouter = router({
      /** Get VOIP Studio connection status and user list */
      status: publicProcedure.query(async ({ ctx }) => {
        const aeId = getAeIdFromCtx(ctx) ?? void 0;
        if (!aeId) throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
        const ae = await getAeProfileById(aeId);
        if (!ae?.isTeamLeader) throw new TRPCError2({ code: "FORBIDDEN", message: "Team leader only" });
        try {
          const users2 = await getVoipUsers();
          return {
            connected: true,
            userCount: users2.length,
            users: users2.map((u) => ({ id: u.id, name: u.name, extension: u.extension }))
          };
        } catch (err) {
          return {
            connected: false,
            userCount: 0,
            users: [],
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }),
      /** Preview dial data for all AEs for a date range (team leader only) */
      preview: publicProcedure.input(z.object({
        months: z.number().min(1).max(24).default(2),
        useJoinDate: z.boolean().default(true)
      })).query(async ({ ctx, input }) => {
        const aeId = getAeIdFromCtx(ctx) ?? void 0;
        if (!aeId) throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
        const ae = await getAeProfileById(aeId);
        if (!ae?.isTeamLeader) throw new TRPCError2({ code: "FORBIDDEN", message: "Team leader only" });
        const { data, unmatchedAes } = await pullVoipMonthlyData(input.months, input.useJoinDate);
        return {
          monthlyData: data.map((d) => ({
            ...d,
            connectionRate: d.connectionRate,
            totalTalkTimeFormatted: formatTalkTime(d.totalTalkTimeSecs)
          })),
          unmatchedAes
        };
      }),
      /** Import VOIP Studio dial data into monthly_metrics (team leader only) */
      import: publicProcedure.input(z.object({
        months: z.number().min(1).max(24).default(2),
        useJoinDate: z.boolean().default(true)
      })).mutation(async ({ ctx, input }) => {
        const aeId = getAeIdFromCtx(ctx) ?? void 0;
        if (!aeId) throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
        const ae = await getAeProfileById(aeId);
        if (!ae?.isTeamLeader) throw new TRPCError2({ code: "FORBIDDEN", message: "Team leader only" });
        const { data, unmatchedAes } = await pullVoipMonthlyData(input.months, input.useJoinDate);
        let recordsUpdated = 0;
        for (const d of data) {
          const existing = await getMetricsForMonth(d.aeId, d.year, d.month);
          await upsertMonthlyMetric({
            aeId: d.aeId,
            year: d.year,
            month: d.month,
            arrUsd: existing?.arrUsd ?? "0",
            demosTotal: existing?.demosTotal ?? 0,
            dialsTotal: d.totalDials,
            retentionRate: existing?.retentionRate ?? null,
            connectedDials: d.connected,
            connectionRate: String(d.connectionRate),
            talkTimeSecs: d.totalTalkTimeSecs
          });
          recordsUpdated++;
        }
        return {
          success: true,
          recordsUpdated,
          unmatchedAes,
          aesUpdated: Array.from(new Set(data.map((d) => d.aeName))).length
        };
      }),
      /** Get today's real-time dial stats for the logged-in AE */
      myDialsToday: publicProcedure.query(async ({ ctx }) => {
        const aeId = getAeIdFromCtx(ctx) ?? void 0;
        if (!aeId) throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
        const ae = await getAeProfileById(aeId);
        if (!ae) throw new TRPCError2({ code: "NOT_FOUND", message: "AE not found" });
        try {
          const voipUserId = await findVoipUserId(ae.name);
          if (!voipUserId) {
            return { found: false, aeName: ae.name };
          }
          const today = formatDate(/* @__PURE__ */ new Date());
          const stats = await getDialCount(voipUserId, today, today);
          const connectionRate = stats.total > 0 ? Math.round(stats.connected / stats.total * 1e4) / 100 : 0;
          return {
            found: true,
            aeName: ae.name,
            voipUserId,
            date: today,
            totalDials: stats.total,
            connected: stats.connected,
            notConnected: stats.total - stats.connected,
            connectionRate,
            totalTalkTimeSecs: stats.talkTimeSecs,
            totalTalkTimeFormatted: formatTalkTime(stats.talkTimeSecs)
          };
        } catch (err) {
          return {
            found: false,
            aeName: ae.name,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }),
      /** Get this week's dial stats for the logged-in AE */
      myDialsThisWeek: publicProcedure.query(async ({ ctx }) => {
        const aeId = getAeIdFromCtx(ctx) ?? void 0;
        if (!aeId) throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
        const ae = await getAeProfileById(aeId);
        if (!ae) throw new TRPCError2({ code: "NOT_FOUND", message: "AE not found" });
        try {
          const voipUserId = await findVoipUserId(ae.name);
          if (!voipUserId) {
            return { found: false, aeName: ae.name };
          }
          const now = /* @__PURE__ */ new Date();
          const dayOfWeek = now.getDay();
          const monday = new Date(now);
          monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
          const today = formatDate(now);
          const weekStart = formatDate(monday);
          const stats = await getDialCount(voipUserId, weekStart, today);
          const connectionRate = stats.total > 0 ? Math.round(stats.connected / stats.total * 1e4) / 100 : 0;
          return {
            found: true,
            aeName: ae.name,
            voipUserId,
            weekStart,
            weekEnd: today,
            totalDials: stats.total,
            connected: stats.connected,
            notConnected: stats.total - stats.connected,
            connectionRate,
            totalTalkTimeSecs: stats.talkTimeSecs,
            totalTalkTimeFormatted: formatTalkTime(stats.talkTimeSecs)
          };
        } catch (err) {
          return {
            found: false,
            aeName: ae.name,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }),
      /** Get dial stats for all AEs for a date range (team leader only) */
      teamDialStats: publicProcedure.input(z.object({
        dateFrom: z.string(),
        dateTo: z.string()
      })).query(async ({ ctx, input }) => {
        const aeId = getAeIdFromCtx(ctx) ?? void 0;
        if (!aeId) throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
        const ae = await getAeProfileById(aeId);
        if (!ae?.isTeamLeader) throw new TRPCError2({ code: "FORBIDDEN", message: "Team leader only" });
        const allProfiles = await getAllAeProfiles();
        const stats = [];
        const unmatchedAes = [];
        for (const profile of allProfiles) {
          const voipUserId = await findVoipUserId(profile.name);
          if (!voipUserId) {
            unmatchedAes.push(profile.name);
            continue;
          }
          const dialStats = await getDialCount(voipUserId, input.dateFrom, input.dateTo);
          const connectionRate = dialStats.total > 0 ? Math.round(dialStats.connected / dialStats.total * 1e4) / 100 : 0;
          stats.push({
            aeName: profile.name,
            aeId: profile.id,
            voipUserId,
            totalDials: dialStats.total,
            connected: dialStats.connected,
            notConnected: dialStats.total - dialStats.connected,
            connectionRate,
            totalTalkTimeSecs: dialStats.talkTimeSecs,
            totalTalkTimeFormatted: formatTalkTime(dialStats.talkTimeSecs)
          });
        }
        return { stats, unmatchedAes };
      })
    });
  }
});

// shared/commission.ts
function calculateTier(inputs) {
  const targets = inputs.isTeamLeader ? TEAM_LEADER_TARGETS : STANDARD_TARGETS;
  const retentionAvailable = inputs.avgRetentionRate != null;
  const meetsArrGold = inputs.isNewJoiner || inputs.avgArrUsd >= targets.gold.arrUsd;
  const meetsDemosGold = inputs.avgDemosPw >= targets.gold.demosPw;
  const meetsDialsGold = inputs.avgDialsPw >= targets.gold.dialsPw;
  const meetsRetentionGold = !retentionAvailable || inputs.isNewJoiner || (inputs.avgRetentionRate ?? 0) >= RETENTION_GOLD_MIN;
  const meetsArrSilver = inputs.isNewJoiner || inputs.avgArrUsd >= targets.silver.arrUsd;
  const meetsDemosSilver = inputs.avgDemosPw >= targets.silver.demosPw;
  const meetsDialsSilver = inputs.avgDialsPw >= targets.silver.dialsPw;
  const meetsRetentionSilver = !retentionAvailable || inputs.isNewJoiner || (inputs.avgRetentionRate ?? 0) >= RETENTION_SILVER_MIN;
  const reasons = [];
  if (meetsArrGold && meetsDemosGold && meetsDialsGold && meetsRetentionGold) {
    return {
      tier: "gold",
      reasons,
      meetsArr: meetsArrGold,
      meetsDemos: meetsDemosGold,
      meetsDials: meetsDialsGold,
      meetsRetention: meetsRetentionGold,
      targets: targets.gold
    };
  }
  if (!meetsArrGold) reasons.push(`ARR $${inputs.avgArrUsd.toFixed(0)} below Gold target $${targets.gold.arrUsd.toLocaleString()}`);
  if (!meetsDemosGold) reasons.push(`Demos ${inputs.avgDemosPw.toFixed(1)}/wk below Gold target ${targets.gold.demosPw}/wk`);
  if (!meetsDialsGold) reasons.push(`Dials ${inputs.avgDialsPw.toFixed(0)}/wk below Gold target ${targets.gold.dialsPw}/wk`);
  if (!meetsRetentionGold && retentionAvailable) reasons.push(`Retention ${(inputs.avgRetentionRate ?? 0).toFixed(1)}% below Gold target ${RETENTION_GOLD_MIN}%`);
  if (meetsArrSilver && meetsDemosSilver && meetsDialsSilver && meetsRetentionSilver) {
    return {
      tier: "silver",
      reasons,
      meetsArr: meetsArrSilver,
      meetsDemos: meetsDemosSilver,
      meetsDials: meetsDialsSilver,
      meetsRetention: meetsRetentionSilver,
      targets: targets.silver
    };
  }
  if (!meetsArrSilver) reasons.push(`ARR $${inputs.avgArrUsd.toFixed(0)} below Silver target $${targets.silver.arrUsd.toLocaleString()}`);
  if (!meetsDemosSilver) reasons.push(`Demos ${inputs.avgDemosPw.toFixed(1)}/wk below Silver target ${targets.silver.demosPw}/wk`);
  if (!meetsDialsSilver) reasons.push(`Dials ${inputs.avgDialsPw.toFixed(0)}/wk below Silver target ${targets.silver.dialsPw}/wk`);
  if (!meetsRetentionSilver && retentionAvailable) reasons.push(`Retention ${(inputs.avgRetentionRate ?? 0).toFixed(1)}% below Silver target ${RETENTION_SILVER_MIN}%`);
  return {
    tier: "bronze",
    reasons,
    meetsArr: meetsArrSilver,
    meetsDemos: meetsDemosSilver,
    meetsDials: meetsDialsSilver,
    meetsRetention: meetsRetentionSilver,
    targets: targets.silver
  };
}
function computeActiveWeeks(months, joinDate) {
  if (months.length === 0) return 12;
  if (!joinDate) return Math.min(months.length * 4, 12);
  const sorted = [...months].sort(
    (a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month
  );
  let totalWeeks = 0;
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const monthStart = new Date(m.year, m.month - 1, 1);
    const monthEnd = new Date(m.year, m.month, 0);
    if (i === 0 && joinDate > monthStart) {
      const effectiveStart = joinDate > monthStart ? joinDate : monthStart;
      const daysInMonth = monthEnd.getDate();
      const daysWorked = Math.max(
        0,
        (monthEnd.getTime() - effectiveStart.getTime()) / (1e3 * 60 * 60 * 24) + 1
      );
      totalWeeks += daysWorked / daysInMonth * 4;
    } else {
      totalWeeks += 4;
    }
  }
  return Math.min(Math.max(totalWeeks, 0.5), 12);
}
function computeRollingAverages(last3Months, joinDate) {
  if (last3Months.length === 0) {
    return { avgArrUsd: 0, avgDemosPw: 0, avgDialsPw: 0 };
  }
  const totalArr = last3Months.reduce((s, m) => s + m.arrUsd, 0);
  const totalDemos = last3Months.reduce((s, m) => s + m.demosTotal, 0);
  const totalDials = last3Months.reduce((s, m) => s + m.dialsTotal, 0);
  const n = last3Months.length;
  const weeks = joinDate != null ? computeActiveWeeks(last3Months, joinDate) : Math.min(n * 4, 12);
  return {
    avgArrUsd: totalArr / n,
    avgDemosPw: totalDemos / weeks,
    avgDialsPw: totalDials / weeks
  };
}
function computeAvgRetention(last6Months) {
  const withRetention = last6Months.filter((m) => m.retentionRate != null);
  if (withRetention.length === 0) return null;
  const total = withRetention.reduce((s, m) => s + (m.retentionRate ?? 0), 0);
  return total / withRetention.length;
}
function calculateCommission(input) {
  const rate = TIER_COMMISSION_RATE[input.tier];
  const arrReductionUsd = input.onboardingArrReductionUsd ?? 5e3;
  const deductionGbp = input.onboardingDeductionGbp ?? ONBOARDING_DEDUCTION_GBP;
  const payoutMonths = input.monthlyPayoutMonths ?? MONTHLY_CONTRACT_PAYOUT_MONTHS;
  const effectiveArrUsd = input.onboardingFeePaid ? input.arrUsd : Math.max(0, input.arrUsd - arrReductionUsd);
  const numPayouts = input.contractType === "annual" ? ANNUAL_CONTRACT_PAYOUT_MONTHS : payoutMonths;
  const payoutAmountUsd = input.contractType === "annual" ? effectiveArrUsd * rate : effectiveArrUsd / 12 * rate;
  const payoutSchedule = [];
  for (let i = 1; i <= numPayouts; i++) {
    const grossCommissionUsd = payoutAmountUsd;
    const referralDeductionUsd = input.isReferral ? grossCommissionUsd * 0.5 : 0;
    const onboardingDeductionGbp = !input.onboardingFeePaid && i === 1 ? deductionGbp : 0;
    const netCommissionUsd = grossCommissionUsd - referralDeductionUsd;
    const netCommissionGbp = netCommissionUsd * input.fxRateUsdToGbp - onboardingDeductionGbp;
    payoutSchedule.push({
      payoutNumber: i,
      grossCommissionUsd,
      referralDeductionUsd,
      onboardingDeductionGbp,
      netCommissionUsd,
      netCommissionGbp: Math.max(0, netCommissionGbp)
    });
  }
  const totalGrossUsd = payoutSchedule.reduce((s, p) => s + p.grossCommissionUsd, 0);
  const totalNetUsd = payoutSchedule.reduce((s, p) => s + p.netCommissionUsd, 0);
  const totalNetGbp = payoutSchedule.reduce((s, p) => s + p.netCommissionGbp, 0);
  return {
    tier: input.tier,
    rate,
    payoutSchedule,
    totalGrossUsd,
    totalNetUsd,
    totalNetGbp,
    effectiveArrUsd
  };
}
function isNewJoiner(joinDate, forDate = /* @__PURE__ */ new Date()) {
  const diffMs = forDate.getTime() - joinDate.getTime();
  const diffMonths = diffMs / (1e3 * 60 * 60 * 24 * 30.44);
  return diffMonths < NEW_JOINER_GRACE_MONTHS;
}
function addMonths(year, month, n) {
  const date = new Date(year, month - 1 + n, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}
var TIER_COMMISSION_RATE, STANDARD_TARGETS, TEAM_LEADER_TARGETS, RETENTION_SILVER_MIN, RETENTION_GOLD_MIN, MONTHLY_CONTRACT_PAYOUT_MONTHS, ANNUAL_CONTRACT_PAYOUT_MONTHS, ONBOARDING_DEDUCTION_GBP, NEW_JOINER_GRACE_MONTHS, MONTH_NAMES;
var init_commission = __esm({
  "shared/commission.ts"() {
    "use strict";
    TIER_COMMISSION_RATE = {
      bronze: 0.13,
      silver: 0.16,
      gold: 0.19
    };
    STANDARD_TARGETS = {
      silver: { arrUsd: 2e4, demosPw: 3, dialsPw: 100, retentionMin: 61 },
      gold: { arrUsd: 25e3, demosPw: 4, dialsPw: 200, retentionMin: 71 }
    };
    TEAM_LEADER_TARGETS = {
      silver: { arrUsd: 1e4, demosPw: 2, dialsPw: 50, retentionMin: 61 },
      gold: { arrUsd: 12500, demosPw: 2, dialsPw: 100, retentionMin: 71 }
    };
    RETENTION_SILVER_MIN = 61;
    RETENTION_GOLD_MIN = 71;
    MONTHLY_CONTRACT_PAYOUT_MONTHS = 12;
    ANNUAL_CONTRACT_PAYOUT_MONTHS = 1;
    ONBOARDING_DEDUCTION_GBP = 500;
    NEW_JOINER_GRACE_MONTHS = 6;
    MONTH_NAMES = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
  }
});

// server/_core/notification.ts
import { TRPCError as TRPCError8 } from "@trpc/server";
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError8({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError8({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}
var TITLE_MAX_LENGTH, CONTENT_MAX_LENGTH, trimValue, isNonEmptyString2, buildEndpointUrl, validatePayload;
var init_notification = __esm({
  "server/_core/notification.ts"() {
    "use strict";
    init_env();
    TITLE_MAX_LENGTH = 1200;
    CONTENT_MAX_LENGTH = 2e4;
    trimValue = (value) => value.trim();
    isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
    buildEndpointUrl = (baseUrl) => {
      const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
      return new URL(
        "webdevtoken.v1.WebDevService/SendNotification",
        normalizedBase
      ).toString();
    };
    validatePayload = (input) => {
      if (!isNonEmptyString2(input.title)) {
        throw new TRPCError8({
          code: "BAD_REQUEST",
          message: "Notification title is required."
        });
      }
      if (!isNonEmptyString2(input.content)) {
        throw new TRPCError8({
          code: "BAD_REQUEST",
          message: "Notification content is required."
        });
      }
      const title = trimValue(input.title);
      const content = trimValue(input.content);
      if (title.length > TITLE_MAX_LENGTH) {
        throw new TRPCError8({
          code: "BAD_REQUEST",
          message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
        });
      }
      if (content.length > CONTENT_MAX_LENGTH) {
        throw new TRPCError8({
          code: "BAD_REQUEST",
          message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
        });
      }
      return { title, content };
    };
  }
});

// server/fxService.ts
var fxService_exports = {};
__export(fxService_exports, {
  clearFxCache: () => clearFxCache,
  convertToGbp: () => convertToGbp,
  convertToUsd: () => convertToUsd,
  fetchLiveFxRates: () => fetchLiveFxRates,
  getCurrentFxRates: () => getCurrentFxRates
});
async function fetchLiveFxRates() {
  if (cachedRates && Date.now() < cacheExpiry) {
    console.log("[FX] Using cached rates");
    return cachedRates;
  }
  try {
    const apiKey = ENV.fxApiKey;
    if (!apiKey) {
      console.warn("[FX] FX_API_KEY not configured, using fallback rates");
      return FALLBACK_RATES;
    }
    const response = await fetch(
      `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`
    );
    if (!response.ok) {
      console.warn(
        `[FX] API error: ${response.status}, using fallback rates`
      );
      return FALLBACK_RATES;
    }
    const data = await response.json();
    if (data.result !== "success" || !data.conversion_rates) {
      console.warn("[FX] Invalid API response, using fallback rates");
      return FALLBACK_RATES;
    }
    const eurToUsd = 1 / (data.conversion_rates.EUR || FALLBACK_RATES.EUR);
    const gbpToUsd = 1 / (data.conversion_rates.GBP || FALLBACK_RATES.GBP);
    const rates = {
      USD: 1,
      EUR: eurToUsd,
      GBP: gbpToUsd,
      timestamp: Date.now()
    };
    cachedRates = rates;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    console.log("[FX] Fetched live rates:", rates);
    return rates;
  } catch (error) {
    console.error("[FX] Error fetching rates:", error);
    return FALLBACK_RATES;
  }
}
async function convertToUsd(amount, currency, rateOverride) {
  if (currency === "USD") {
    return { usdAmount: amount, rate: 1 };
  }
  const rates = rateOverride ? { [currency]: rateOverride } : await fetchLiveFxRates();
  const rate = rates[currency] || FALLBACK_RATES[currency];
  return {
    usdAmount: Number((amount * rate).toFixed(2)),
    rate
  };
}
async function convertToGbp(usdAmount, rateOverride) {
  const rates = rateOverride ? { GBP: rateOverride } : await fetchLiveFxRates();
  const rate = rates.GBP || FALLBACK_RATES.GBP;
  return {
    gbpAmount: Number((usdAmount / rate).toFixed(2)),
    rate
  };
}
async function getCurrentFxRates() {
  return fetchLiveFxRates();
}
function clearFxCache() {
  cachedRates = null;
  cacheExpiry = 0;
}
var cachedRates, cacheExpiry, CACHE_TTL_MS, FALLBACK_RATES;
var init_fxService = __esm({
  "server/fxService.ts"() {
    "use strict";
    init_env();
    cachedRates = null;
    cacheExpiry = 0;
    CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
    FALLBACK_RATES = {
      USD: 1,
      EUR: 1.08,
      GBP: 1.27,
      timestamp: Date.now()
    };
  }
});

// server/lockedFxPayoutHelper.ts
var lockedFxPayoutHelper_exports = {};
__export(lockedFxPayoutHelper_exports, {
  formatPayoutInfo: () => formatPayoutInfo,
  recalculatePayoutsWithLockedRate: () => recalculatePayoutsWithLockedRate
});
function recalculatePayoutsWithLockedRate(input) {
  const { deal, tier, activeStructure } = input;
  const lockedFxRate = deal.fxRateLockedAtCreation || deal.fxRateAtEntry || 0.79;
  const commResult = calculateCommission({
    tier,
    contractType: deal.contractType,
    arrUsd: Number(deal.arrUsd),
    onboardingFeePaid: deal.onboardingFeePaid,
    isReferral: deal.isReferral,
    fxRateUsdToGbp: Number(lockedFxRate),
    monthlyPayoutMonths: activeStructure?.monthlyPayoutMonths,
    onboardingDeductionGbp: activeStructure?.onboardingDeductionGbp,
    onboardingArrReductionUsd: activeStructure?.onboardingArrReductionUsd
  });
  return {
    commResult,
    lockedFxRate: Number(lockedFxRate),
    dealSignedDate: deal.dealSignedDate,
    fxRateLockDate: deal.fxRateLockDate
  };
}
function formatPayoutInfo(deal, lockedFxRate, currentFxRate) {
  return {
    dealId: deal.id,
    customerName: deal.customerName,
    originalCurrency: deal.originalCurrency,
    originalAmount: Number(deal.originalAmount),
    arrUsd: Number(deal.arrUsd),
    conversionRate: Number(deal.conversionRate),
    lockedFxRate: Number(deal.fxRateLockedAtCreation || deal.fxRateAtEntry),
    dealSignedDate: deal.dealSignedDate,
    fxRateLockDate: deal.fxRateLockDate,
    // Show difference if current rate is provided
    ...currentFxRate && {
      currentFxRate,
      rateChange: ((currentFxRate - lockedFxRate) / lockedFxRate * 100).toFixed(2) + "%"
    }
  };
}
var init_lockedFxPayoutHelper = __esm({
  "server/lockedFxPayoutHelper.ts"() {
    "use strict";
    init_commission();
  }
});

// server/tierReportEmail.ts
function getTierChangeIndicator(current, previous) {
  const tierRank = { bronze: 1, silver: 2, gold: 3 };
  const currentRank = tierRank[current] || 1;
  const previousRank = tierRank[previous] || 1;
  if (currentRank > previousRank) return "\u2191 PROMOTED";
  if (currentRank < previousRank) return "\u2193 DEMOTED";
  return "\u2192 MAINTAINED";
}
function generateTierReportPlainText(aeData, reportMonth, reportYear, previousMonth, previousYear) {
  const monthName = MONTH_NAMES[reportMonth - 1];
  const previousMonthName = MONTH_NAMES[previousMonth - 1];
  let text2 = `MONTHLY COMMISSION TIER REPORT
`;
  text2 += `${monthName} ${reportYear} (Comparing to ${previousMonthName} ${previousYear})
`;
  text2 += `${"=".repeat(80)}

`;
  text2 += `${"AE Name".padEnd(20)} | ${"Tier".padEnd(8)} | ${"Rate".padEnd(6)} | ${"Prev".padEnd(8)} | ${"Change".padEnd(12)} | ${"Commission".padEnd(12)} | Deals
`;
  text2 += `${"-".repeat(80)}
`;
  for (const ae of aeData) {
    const change = getTierChangeIndicator(ae.currentTier, ae.previousTier);
    text2 += `${ae.name.padEnd(20)} | ${ae.currentTier.padEnd(8)} | ${(ae.currentRate * 100).toString().padEnd(6)}% | ${ae.previousTier.padEnd(8)} | ${change.padEnd(12)} | \xA3${ae.totalCommissionGbp.toFixed(2).padEnd(12)} | ${ae.dealCount}
`;
  }
  text2 += `
${"=".repeat(80)}
`;
  text2 += `Report generated: ${(/* @__PURE__ */ new Date()).toLocaleString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "GMT"
  })} GMT
`;
  return text2;
}
var init_tierReportEmail = __esm({
  "server/tierReportEmail.ts"() {
    "use strict";
    init_commission();
  }
});

// server/tierReportEmailService.ts
var tierReportEmailService_exports = {};
__export(tierReportEmailService_exports, {
  calculateTier: () => calculateTier2,
  getTierRate: () => getTierRate,
  sendTierReportEmail: () => sendTierReportEmail
});
async function sendTierReportEmail(aeData, reportMonth, reportYear, previousMonth, previousYear) {
  try {
    const monthName = MONTH_NAMES[reportMonth - 1];
    const previousMonthName = MONTH_NAMES[previousMonth - 1];
    const subject = `Commission Tier Report - ${monthName} ${reportYear}`;
    const plainTextContent = generateTierReportPlainText(
      aeData,
      reportMonth,
      reportYear,
      previousMonth,
      previousYear
    );
    const result = await notifyOwner({
      title: subject,
      content: plainTextContent
    });
    if (!result) {
      console.error("[TierReport] Failed to send tier report via notifyOwner");
      return false;
    }
    console.log(`[TierReport] Successfully sent tier report for ${monthName} ${reportYear}`);
    return true;
  } catch (error) {
    console.error("[TierReport] Error sending tier report:", error);
    return false;
  }
}
function calculateTier2(avgCommission) {
  if (avgCommission >= 3e3) return "gold";
  if (avgCommission >= 2e3) return "silver";
  return "bronze";
}
function getTierRate(tier) {
  const rates = {
    bronze: 0.13,
    silver: 0.16,
    gold: 0.19
  };
  return rates[tier] || 0.13;
}
var init_tierReportEmailService = __esm({
  "server/tierReportEmailService.ts"() {
    "use strict";
    init_notification();
    init_tierReportEmail();
    init_commission();
  }
});

// server/emailService.ts
function buildEmailHtml(payload) {
  const {
    toName,
    previousTier,
    newTier,
    month,
    year,
    avgArrUsd,
    avgDemosPw,
    avgDialsPw,
    nextTierTargets
  } = payload;
  const isPromotion = newTier > previousTier;
  const monthName = MONTH_NAMES2[month - 1];
  const newTierColor = TIER_COLORS[newTier] ?? "#888";
  const newRate = TIER_RATES[newTier] ?? "\u2014";
  const prevRate = TIER_RATES[previousTier] ?? "\u2014";
  const subject = isPromotion ? `\u{1F389} You've reached ${newTier.charAt(0).toUpperCase() + newTier.slice(1)} tier \u2014 ${monthName} ${year}` : `\u{1F4C9} Tier update: ${newTier.charAt(0).toUpperCase() + newTier.slice(1)} for ${monthName} ${year}`;
  const headline = isPromotion ? `Congratulations, ${toName.split(" ")[0]}! You've been promoted to <strong style="color:${newTierColor}">${newTier.toUpperCase()}</strong> tier.` : `Hi ${toName.split(" ")[0]}, your tier for ${monthName} ${year} has been updated to <strong style="color:${newTierColor}">${newTier.toUpperCase()}</strong>.`;
  const rateChange = isPromotion ? `Your commission rate increases from <strong>${prevRate}</strong> to <strong>${newRate}</strong> \u2014 effective for all new deals this month.` : `Your commission rate moves from <strong>${prevRate}</strong> to <strong>${newRate}</strong> for new deals this month.`;
  const nextTierSection = nextTierTargets && newTier !== "gold" ? `
      <div style="margin-top:24px;padding:16px;background:#f9f9f9;border-left:4px solid ${newTierColor};border-radius:4px;">
        <p style="margin:0 0 8px;font-weight:600;color:#333;">To reach the next tier:</p>
        <ul style="margin:0;padding-left:20px;color:#555;font-size:14px;">
          <li>Monthly ARR: <strong>$${nextTierTargets.arrUsd.toLocaleString()}</strong>/mo avg</li>
          <li>Demos: <strong>${nextTierTargets.demosPw}/wk</strong> avg</li>
          <li>Dials: <strong>${nextTierTargets.dialsPw}/wk</strong> avg</li>
        </ul>
      </div>
    ` : newTier === "gold" ? `<div style="margin-top:24px;padding:16px;background:#fffbea;border-left:4px solid #ffd700;border-radius:4px;"><p style="margin:0;color:#555;">You're at the top tier \u2014 keep it up! \u{1F3C6}</p></div>` : "";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:${newTierColor};padding:32px 40px;">
      <p style="margin:0;color:rgba(255,255,255,0.8);font-size:13px;text-transform:uppercase;letter-spacing:1px;">AMFG Commission</p>
      <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;font-weight:700;">Tier Update \u2014 ${monthName} ${year}</h1>
    </div>
    <!-- Body -->
    <div style="padding:32px 40px;">
      <p style="margin:0 0 16px;font-size:16px;color:#333;line-height:1.6;">${headline}</p>
      <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">${rateChange}</p>

      <!-- Current metrics -->
      <div style="background:#f9f9f9;border-radius:6px;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Your 3-Month Rolling Averages</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#555;">Monthly ARR</td>
            <td style="padding:6px 0;font-size:14px;font-weight:600;color:#333;text-align:right;">$${avgArrUsd.toLocaleString(void 0, { maximumFractionDigits: 0 })}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#555;">Demos / week</td>
            <td style="padding:6px 0;font-size:14px;font-weight:600;color:#333;text-align:right;">${avgDemosPw.toFixed(1)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#555;">Dials / week</td>
            <td style="padding:6px 0;font-size:14px;font-weight:600;color:#333;text-align:right;">${Math.round(avgDialsPw)}</td>
          </tr>
        </table>
      </div>

      ${nextTierSection}

      <p style="margin:24px 0 0;font-size:13px;color:#999;">
        This is an automated notification from the AMFG Commission Calculator.
        Log in to view your full commission breakdown.
      </p>
    </div>
    <!-- Footer -->
    <div style="padding:16px 40px;background:#f9f9f9;border-top:1px solid #eee;">
      <p style="margin:0;font-size:12px;color:#aaa;">AMFG \xB7 Commission Calculator \xB7 ${(/* @__PURE__ */ new Date()).getFullYear()}</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
async function sendTierChangeEmail(payload) {
  if (!ENV.resendApiKey) {
    console.warn("[emailService] RESEND_API_KEY not configured \u2014 skipping email to", payload.toEmail);
    return false;
  }
  const { Resend } = await import("resend");
  const resend = new Resend(ENV.resendApiKey);
  const isPromotion = payload.newTier > payload.previousTier;
  const monthName = MONTH_NAMES2[payload.month - 1];
  const subject = isPromotion ? `\u{1F389} You've reached ${payload.newTier.charAt(0).toUpperCase() + payload.newTier.slice(1)} tier \u2014 ${monthName} ${payload.year}` : `\u{1F4C9} Tier update: ${payload.newTier.charAt(0).toUpperCase() + payload.newTier.slice(1)} for ${monthName} ${payload.year}`;
  try {
    const { error } = await resend.emails.send({
      from: "AMFG Commission <commission@amfgcalc.manus.space>",
      to: [payload.toEmail],
      subject,
      html: buildEmailHtml(payload)
    });
    if (error) {
      console.error("[emailService] Resend error:", error);
      return false;
    }
    console.log(`[emailService] Tier change email sent to ${payload.toEmail} (${payload.previousTier} \u2192 ${payload.newTier})`);
    return true;
  } catch (err) {
    console.error("[emailService] Failed to send email:", err);
    return false;
  }
}
var MONTH_NAMES2, TIER_COLORS, TIER_RATES;
var init_emailService = __esm({
  "server/emailService.ts"() {
    "use strict";
    init_env();
    MONTH_NAMES2 = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
    TIER_COLORS = {
      bronze: "#cd7f32",
      silver: "#c0c0c0",
      gold: "#ffd700"
    };
    TIER_RATES = {
      bronze: "13%",
      silver: "16%",
      gold: "19%"
    };
  }
});

// server/tierChangeNotifier.ts
var tierChangeNotifier_exports = {};
__export(tierChangeNotifier_exports, {
  checkAndNotifyTierChanges: () => checkAndNotifyTierChanges,
  getAllRecentNotifications: () => getAllRecentNotifications,
  getNotificationHistory: () => getNotificationHistory
});
import { eq as eq4, and as and2, desc as desc2 } from "drizzle-orm";
function formatTierLabel(tier) {
  const rate = (TIER_COMMISSION_RATE[tier] * 100).toFixed(0);
  const emoji = tier === "gold" ? "\u{1F947}" : tier === "silver" ? "\u{1F948}" : "\u{1F949}";
  return `${emoji} ${tier.charAt(0).toUpperCase() + tier.slice(1)} (${rate}% commission)`;
}
function tierDirection(prev, next) {
  const order = { bronze: 0, silver: 1, gold: 2 };
  if (order[next] > order[prev]) return "promoted";
  if (order[next] < order[prev]) return "demoted";
  return "same";
}
function buildNotificationContent(event) {
  const { ae, previousTier, newTier, month, year } = event;
  const direction = tierDirection(previousTier, newTier);
  const monthName = MONTH_NAMES[month - 1];
  const targets = ae.isTeamLeader ? TEAM_LEADER_TARGETS : STANDARD_TARGETS;
  const prevRate = (TIER_COMMISSION_RATE[previousTier] * 100).toFixed(0);
  const newRate = (TIER_COMMISSION_RATE[newTier] * 100).toFixed(0);
  const directionEmoji = direction === "promoted" ? "\u{1F389}" : "\u26A0\uFE0F";
  const directionWord = direction === "promoted" ? "PROMOTED" : "DEMOTED";
  const title = `${directionEmoji} Tier Change: ${ae.aeName} ${directionWord} to ${newTier.toUpperCase()} \u2014 ${monthName} ${year}`;
  const lines = [];
  lines.push(`TIER CHANGE NOTIFICATION \u2014 ${monthName} ${year}`);
  lines.push(`${"=".repeat(60)}`);
  lines.push(``);
  lines.push(`AE: ${ae.aeName}`);
  if (ae.aeEmail) lines.push(`Email: ${ae.aeEmail}`);
  lines.push(``);
  lines.push(`TIER CHANGE:`);
  lines.push(`  Previous: ${formatTierLabel(previousTier)} (${prevRate}% commission rate)`);
  lines.push(`  New:      ${formatTierLabel(newTier)} (${newRate}% commission rate)`);
  lines.push(``);
  const rateChange = Number(newRate) - Number(prevRate);
  if (rateChange > 0) {
    lines.push(`COMMISSION RATE IMPACT:`);
    lines.push(`  Rate increased by +${rateChange}pp \u2014 every \xA31,000 deal now earns \xA3${rateChange * 10} more`);
  } else {
    lines.push(`COMMISSION RATE IMPACT:`);
    lines.push(`  Rate decreased by ${rateChange}pp \u2014 every \xA31,000 deal now earns \xA3${Math.abs(rateChange) * 10} less`);
  }
  lines.push(``);
  lines.push(`CURRENT 3-MONTH ROLLING AVERAGES:`);
  lines.push(`  ARR:        $${ae.avgArrUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })} / month`);
  lines.push(`  Demos:      ${ae.avgDemosPw.toFixed(1)} / week`);
  lines.push(`  Dials:      ${ae.avgDialsPw.toFixed(0)} / week`);
  if (ae.avgRetentionRate != null) {
    lines.push(`  Retention:  ${ae.avgRetentionRate.toFixed(1)}%`);
  }
  lines.push(``);
  if (direction === "promoted") {
    const maintainTargets = targets[newTier] ?? targets.silver;
    lines.push(`WHAT TO MAINTAIN (${newTier.toUpperCase()} TIER REQUIREMENTS):`);
    lines.push(`  ARR:    \u2265 $${maintainTargets.arrUsd.toLocaleString()} / month`);
    lines.push(`  Demos:  \u2265 ${maintainTargets.demosPw} / week`);
    lines.push(`  Dials:  \u2265 ${maintainTargets.dialsPw} / week`);
    lines.push(`  Retention: \u2265 ${maintainTargets.retentionMin}%`);
    lines.push(``);
    const arrHeadroom = ae.avgArrUsd - maintainTargets.arrUsd;
    const demosHeadroom = ae.avgDemosPw - maintainTargets.demosPw;
    const dialsHeadroom = ae.avgDialsPw - maintainTargets.dialsPw;
    lines.push(`CURRENT HEADROOM ABOVE ${newTier.toUpperCase()} THRESHOLD:`);
    lines.push(`  ARR:    +$${Math.max(0, arrHeadroom).toLocaleString("en-US", { maximumFractionDigits: 0 })} above target`);
    lines.push(`  Demos:  +${Math.max(0, demosHeadroom).toFixed(1)} / week above target`);
    lines.push(`  Dials:  +${Math.max(0, dialsHeadroom).toFixed(0)} / week above target`);
    lines.push(``);
    if (newTier !== "gold") {
      const nextTier = newTier === "bronze" ? "silver" : "gold";
      const nextTargets = targets[nextTier];
      lines.push(`NEXT GOAL \u2014 ${nextTier.toUpperCase()} TIER:`);
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
      lines.push(`  Note: You are still within your new joiner grace period \u2014 ARR targets are`);
      lines.push(`  automatically met to help you get established.`);
    }
  } else {
    const recoverTargets = targets[previousTier] ?? targets.silver;
    lines.push(`WHAT NEEDS TO IMPROVE (TO RETURN TO ${previousTier.toUpperCase()}):`);
    const arrGap = Math.max(0, recoverTargets.arrUsd - ae.avgArrUsd);
    const demosGap = Math.max(0, recoverTargets.demosPw - ae.avgDemosPw);
    const dialsGap = Math.max(0, recoverTargets.dialsPw - ae.avgDialsPw);
    if (arrGap > 0) {
      lines.push(`  ARR:    Need +$${arrGap.toLocaleString("en-US", { maximumFractionDigits: 0 })} more / month (currently $${ae.avgArrUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}, target $${recoverTargets.arrUsd.toLocaleString()})`);
    } else {
      lines.push(`  ARR:    \u2713 Meeting target ($${ae.avgArrUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })} \u2265 $${recoverTargets.arrUsd.toLocaleString()})`);
    }
    if (demosGap > 0) {
      lines.push(`  Demos:  Need +${demosGap.toFixed(1)} more / week (currently ${ae.avgDemosPw.toFixed(1)}, target ${recoverTargets.demosPw})`);
    } else {
      lines.push(`  Demos:  \u2713 Meeting target (${ae.avgDemosPw.toFixed(1)} \u2265 ${recoverTargets.demosPw})`);
    }
    if (dialsGap > 0) {
      lines.push(`  Dials:  Need +${dialsGap.toFixed(0)} more / week (currently ${ae.avgDialsPw.toFixed(0)}, target ${recoverTargets.dialsPw})`);
    } else {
      lines.push(`  Dials:  \u2713 Meeting target (${ae.avgDialsPw.toFixed(0)} \u2265 ${recoverTargets.dialsPw})`);
    }
    lines.push(``);
    lines.push(`ACTIONABLE WEEKLY TARGETS TO RECOVER:`);
    if (arrGap > 0) {
      const monthlyArrNeeded = recoverTargets.arrUsd;
      lines.push(`  \u2022 Close at least $${monthlyArrNeeded.toLocaleString()} ARR per month over the next 3 months`);
    }
    if (demosGap > 0) {
      lines.push(`  \u2022 Book ${recoverTargets.demosPw}+ demos per week (currently averaging ${ae.avgDemosPw.toFixed(1)})`);
    }
    if (dialsGap > 0) {
      lines.push(`  \u2022 Make ${recoverTargets.dialsPw}+ dials per week (currently averaging ${ae.avgDialsPw.toFixed(0)})`);
    }
    lines.push(``);
    lines.push(`MESSAGE FOR ${ae.aeName.toUpperCase()}:`);
    lines.push(`  Your tier has moved from ${previousTier.toUpperCase()} to ${newTier.toUpperCase()} this month.`);
    lines.push(`  Your commission rate is now ${newRate}%. The good news: tier is based on a`);
    lines.push(`  3-month rolling average, so strong performance over the next 3 months`);
    lines.push(`  will bring you back to ${previousTier.toUpperCase()}.`);
  }
  lines.push(``);
  lines.push(`\u2500`.repeat(60));
  lines.push(`Generated: ${(/* @__PURE__ */ new Date()).toISOString()}`);
  lines.push(`This notification was generated automatically by the AMFG Commission Calculator.`);
  return { title, content: lines.join("\n") };
}
async function computeAeTierForMonth(aeId, year, month, db) {
  const profile = await db.select().from(aeProfiles).where(eq4(aeProfiles.id, aeId)).limit(1).then((r) => r[0]);
  if (!profile || !profile.isActive) return null;
  const targetDate = new Date(year, month - 1, 1);
  const joinDate = new Date(profile.joinDate);
  const allMetrics = await db.select().from(monthlyMetrics).where(eq4(monthlyMetrics.aeId, aeId)).orderBy(desc2(monthlyMetrics.year), desc2(monthlyMetrics.month));
  let last3 = allMetrics.filter((m) => {
    const d = new Date(m.year, m.month - 1, 1);
    return d < targetDate && d >= joinDate;
  }).slice(0, 3).map((m) => {
    const monthDate = new Date(m.year, m.month - 1, 1);
    const monthsSinceJoin = (monthDate.getFullYear() - joinDate.getFullYear()) * 12 + (monthDate.getMonth() - joinDate.getMonth());
    const arrUsd = monthsSinceJoin >= 0 && monthsSinceJoin < 6 ? 25e3 : Number(m.arrUsd);
    return {
      year: m.year,
      month: m.month,
      arrUsd,
      demosTotal: m.demosTotal,
      dialsTotal: m.dialsTotal,
      retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null
    };
  });
  if (last3.length === 0 && isNewJoiner(profile.joinDate, targetDate)) {
    last3 = allMetrics.filter((m) => m.year === year && m.month === month).slice(0, 1).map((m) => ({
      year: m.year,
      month: m.month,
      arrUsd: 25e3,
      // grace period
      demosTotal: m.demosTotal,
      dialsTotal: m.dialsTotal,
      retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null
    }));
  }
  const last6 = allMetrics.filter((m) => {
    const d = new Date(m.year, m.month - 1, 1);
    return d < targetDate && d >= joinDate;
  }).slice(0, 6).map((m) => ({
    year: m.year,
    month: m.month,
    arrUsd: Number(m.arrUsd),
    demosTotal: m.demosTotal,
    dialsTotal: m.dialsTotal,
    retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null
  }));
  const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3, new Date(profile.joinDate));
  const avgRetentionRate = computeAvgRetention(last6);
  const newJoiner = isNewJoiner(profile.joinDate, targetDate);
  const result = calculateTier({
    avgArrUsd,
    avgDemosPw,
    avgDialsPw,
    avgRetentionRate,
    isNewJoiner: newJoiner,
    isTeamLeader: profile.isTeamLeader
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
    isTeamLeader: profile.isTeamLeader
  };
}
async function hasNotificationBeenSent(aeId, year, month, previousTier, newTier, db) {
  const existing = await db.select({ id: tierChangeNotifications.id }).from(tierChangeNotifications).where(
    and2(
      eq4(tierChangeNotifications.aeId, aeId),
      eq4(tierChangeNotifications.notificationYear, year),
      eq4(tierChangeNotifications.notificationMonth, month),
      eq4(tierChangeNotifications.previousTier, previousTier),
      eq4(tierChangeNotifications.newTier, newTier)
    )
  ).limit(1);
  return existing.length > 0;
}
async function recordNotification(aeId, year, month, previousTier, newTier, snapshot, status, errorMessage, db) {
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
    errorMessage: errorMessage ?? null
  });
}
async function checkAndNotifyTierChanges(forceMonth, forceYear) {
  const db = await getDb();
  if (!db) {
    console.error("[TierChangeNotifier] Database connection failed");
    return [];
  }
  const now = /* @__PURE__ */ new Date();
  const currentMonth = forceMonth ?? now.getMonth() + 1;
  const currentYear = forceYear ?? now.getFullYear();
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }
  console.log(
    `[TierChangeNotifier] Checking tier changes for ${MONTH_NAMES[currentMonth - 1]} ${currentYear} vs ${MONTH_NAMES[prevMonth - 1]} ${prevYear}`
  );
  const activeAes = await db.select().from(aeProfiles).where(eq4(aeProfiles.isActive, true));
  const results = [];
  for (const ae of activeAes) {
    try {
      const currentSnapshot = await computeAeTierForMonth(ae.id, currentYear, currentMonth, db);
      if (!currentSnapshot) {
        results.push({
          aeId: ae.id,
          aeName: ae.name,
          currentTier: "bronze",
          previousTier: null,
          notificationSent: false,
          skipped: true,
          reason: "AE not active or no data"
        });
        continue;
      }
      const prevSnapshot = await computeAeTierForMonth(ae.id, prevYear, prevMonth, db);
      if (!prevSnapshot) {
        results.push({
          aeId: ae.id,
          aeName: ae.name,
          currentTier: currentSnapshot.tier,
          previousTier: null,
          notificationSent: false,
          skipped: true,
          reason: "No previous month data \u2014 first month for this AE"
        });
        continue;
      }
      const previousTier = prevSnapshot.tier;
      const newTier = currentSnapshot.tier;
      if (previousTier === newTier) {
        results.push({
          aeId: ae.id,
          aeName: ae.name,
          currentTier: newTier,
          previousTier,
          notificationSent: false,
          skipped: true,
          reason: `Tier unchanged (${newTier})`
        });
        continue;
      }
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
          reason: "Notification already sent for this transition"
        });
        continue;
      }
      const event = {
        ae: currentSnapshot,
        previousTier,
        newTier,
        month: currentMonth,
        year: currentYear
      };
      const { title, content } = buildNotificationContent(event);
      let sent2 = false;
      let errorMsg;
      if (currentSnapshot.aeEmail) {
        const targets = currentSnapshot.isTeamLeader ? TEAM_LEADER_TARGETS : STANDARD_TARGETS;
        const nextTierKey = newTier === "bronze" ? "silver" : newTier === "silver" ? "gold" : null;
        const nextTierTargets = nextTierKey && nextTierKey in targets ? { ...targets[nextTierKey] } : null;
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
              dialsPw: nextTierTargets.dialsPw
            } : null
          });
          if (emailSent) sent2 = true;
        } catch (err) {
          console.error(`[TierChangeNotifier] Resend email failed for ${ae.name}:`, err);
        }
      }
      try {
        const ownerSent = await notifyOwner({ title, content });
        if (ownerSent) sent2 = true;
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[TierChangeNotifier] Failed to send owner notification for ${ae.name}:`, err);
      }
      await recordNotification(
        ae.id,
        currentYear,
        currentMonth,
        previousTier,
        newTier,
        currentSnapshot,
        sent2 ? "sent" : "failed",
        errorMsg,
        db
      );
      const direction = tierDirection(previousTier, newTier);
      console.log(
        `[TierChangeNotifier] ${ae.name}: ${previousTier} \u2192 ${newTier} (${direction}) \u2014 notification ${sent2 ? "sent" : "FAILED"}`
      );
      results.push({
        aeId: ae.id,
        aeName: ae.name,
        currentTier: newTier,
        previousTier,
        notificationSent: sent2,
        skipped: false,
        reason: sent2 ? void 0 : `Delivery failed: ${errorMsg}`
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
        reason: `Error: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  }
  const sent = results.filter((r) => r.notificationSent).length;
  const skipped = results.filter((r) => r.skipped).length;
  console.log(
    `[TierChangeNotifier] Complete \u2014 ${sent} notifications sent, ${skipped} skipped, ${results.length} AEs checked`
  );
  return results;
}
async function getNotificationHistory(aeId, limit = 12) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tierChangeNotifications).where(eq4(tierChangeNotifications.aeId, aeId)).orderBy(desc2(tierChangeNotifications.sentAt)).limit(limit);
}
async function getAllRecentNotifications(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tierChangeNotifications).orderBy(desc2(tierChangeNotifications.sentAt)).limit(limit);
}
var init_tierChangeNotifier = __esm({
  "server/tierChangeNotifier.ts"() {
    "use strict";
    init_notification();
    init_emailService();
    init_db();
    init_schema();
    init_commission();
  }
});

// server/tierForecastHelper.ts
var tierForecastHelper_exports = {};
__export(tierForecastHelper_exports, {
  calculateTierForecast: () => calculateTierForecast,
  formatTierForecast: () => formatTierForecast
});
function calculateTierForecast(currentTier, currentMetrics, isTeamLeader = false, historicalGrowthRate = 0.05) {
  const targets = isTeamLeader ? TEAM_LEADER_TARGETS : STANDARD_TARGETS;
  const tierOrder = ["bronze", "silver", "gold"];
  const currentTierIndex = tierOrder.indexOf(currentTier);
  const forecastMonths = [];
  let projectedArrUsd = currentMetrics.arrUsd;
  let projectedDemosPw = currentMetrics.demosPw;
  let projectedDialsPw = currentMetrics.dialsPw;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = /* @__PURE__ */ new Date();
  for (let i = 1; i <= 3; i++) {
    projectedArrUsd *= 1 + historicalGrowthRate;
    projectedDemosPw *= 1 + historicalGrowthRate;
    projectedDialsPw *= 1 + historicalGrowthRate;
    const forecastMonth = new Date(now);
    forecastMonth.setMonth(forecastMonth.getMonth() + i);
    const monthName = monthNames[forecastMonth.getMonth()];
    let projectedTier = "bronze";
    if (projectedArrUsd >= targets.gold.arrUsd && projectedDemosPw >= targets.gold.demosPw && projectedDialsPw >= targets.gold.dialsPw) {
      projectedTier = "gold";
    } else if (projectedArrUsd >= targets.silver.arrUsd && projectedDemosPw >= targets.silver.demosPw && projectedDialsPw >= targets.silver.dialsPw) {
      projectedTier = "silver";
    }
    const nextTier = projectedTier === "bronze" ? "silver" : projectedTier === "silver" ? "gold" : null;
    const nextTargets = nextTier ? targets[nextTier] : null;
    forecastMonths.push({
      month: monthName,
      projectedTier,
      projectedMetrics: {
        arrUsd: Math.round(projectedArrUsd),
        demosPw: Math.round(projectedDemosPw * 10) / 10,
        dialsPw: Math.round(projectedDialsPw)
      },
      gapToNextTier: nextTargets ? {
        arrUsd: Math.max(0, nextTargets.arrUsd - projectedArrUsd),
        demosPw: Math.max(0, nextTargets.demosPw - projectedDemosPw),
        dialsPw: Math.max(0, nextTargets.dialsPw - projectedDialsPw)
      } : { arrUsd: 0, demosPw: 0, dialsPw: 0 }
    });
  }
  const targetTier = currentTierIndex < 2 ? tierOrder[currentTierIndex + 1] : currentTier;
  const targetMetrics = targetTier === "silver" ? targets.silver : targets.gold;
  const totalMonthsToReach = 3;
  const monthlyAverageArrUsd = targetMetrics.arrUsd / totalMonthsToReach;
  const monthlyAverageDemosPw = targetMetrics.demosPw / totalMonthsToReach;
  const monthlyAverageDialsPw = targetMetrics.dialsPw / totalMonthsToReach;
  return {
    currentTier,
    currentMetrics,
    forecastMonths,
    actionableTargets: {
      targetTier,
      monthsToReach: totalMonthsToReach,
      requiredMetrics: {
        totalArrUsd: targetMetrics.arrUsd,
        totalDemosPw: targetMetrics.demosPw,
        totalDialsPw: targetMetrics.dialsPw,
        monthlyAverageArrUsd: Math.round(monthlyAverageArrUsd),
        monthlyAverageDemosPw: Math.round(monthlyAverageDemosPw * 10) / 10,
        monthlyAverageDialsPw: Math.round(monthlyAverageDialsPw)
      }
    }
  };
}
function formatTierForecast(forecast) {
  const lines = [
    `\u{1F4CA} Tier Forecast from ${forecast.currentTier.toUpperCase()}`,
    `Current: $${forecast.currentMetrics.arrUsd.toLocaleString()} ARR | ${forecast.currentMetrics.demosPw.toFixed(1)} demos/wk | ${forecast.currentMetrics.dialsPw} dials/wk`,
    ``,
    `\u{1F3AF} To reach ${forecast.actionableTargets.targetTier.toUpperCase()} in 3 months:`,
    `   \u2022 Monthly ARR: $${forecast.actionableTargets.requiredMetrics.monthlyAverageArrUsd.toLocaleString()}`,
    `   \u2022 Monthly Demos: ${forecast.actionableTargets.requiredMetrics.monthlyAverageDemosPw.toFixed(1)}/wk`,
    `   \u2022 Monthly Dials: ${forecast.actionableTargets.requiredMetrics.monthlyAverageDialsPw}`
  ];
  forecast.forecastMonths.forEach((month) => {
    lines.push(`
${month.month}: ${month.projectedTier.toUpperCase()} tier`);
    if (month.gapToNextTier.arrUsd > 0) {
      lines.push(
        `   Gap to next: $${month.gapToNextTier.arrUsd.toLocaleString()} ARR | ${month.gapToNextTier.demosPw.toFixed(1)} demos | ${month.gapToNextTier.dialsPw} dials`
      );
    }
  });
  return lines.join("\n");
}
var init_tierForecastHelper = __esm({
  "server/tierForecastHelper.ts"() {
    "use strict";
    init_commission();
  }
});

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/_core/oauth.ts
init_const();
init_db();

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/sdk.ts
init_const();

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
init_db();
init_env();
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/routers.ts
init_trpc();
import { TRPCError as TRPCError9 } from "@trpc/server";

// server/spreadsheetSync.ts
init_trpc();
init_const();
init_db();
import { z as z2 } from "zod";
import { TRPCError as TRPCError3 } from "@trpc/server";
import * as bcrypt from "bcryptjs";

// server/weeklySync.ts
init_db();
import cron from "node-cron";
var SPREADSHEET_ID = "11HPOZ7mkkN-OwhlALdGWicQUzCI0Fkuq_tz9tl1N1qc";
var SHEET_GID = "321906789";
var PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";
var TARGET_PIPELINE_IDS = [20, 12, 10];
function getGoogleAccessToken() {
  try {
    const fs3 = __require("fs");
    const configPath = process.env.GDRIVE_RCLONE_CONFIG || "/home/ubuntu/.gdrive-rclone.ini";
    const content = fs3.readFileSync(configPath, "utf8");
    const match = content.match(/token\s*=\s*({[^\n]+})/);
    if (!match) return null;
    const tokenObj = JSON.parse(match[1]);
    return tokenObj.access_token ?? null;
  } catch {
    return null;
  }
}
function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
function parseSheetCsv(csv) {
  const lines = csv.split("\n");
  const rows = [];
  let currentDate = "";
  let currentCalYear = 0;
  let currentCalMonth = 0;
  let currentWeekNum = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (cols.length < 11) continue;
    const dateStr = cols[0]?.trim();
    const weekStr = cols[2]?.trim();
    const aeName = cols[3]?.trim();
    if (weekStr && !isNaN(Number(weekStr))) {
      currentWeekNum = Number(weekStr);
      if (dateStr) {
        currentDate = dateStr;
        const parts = dateStr.split("/");
        if (parts.length === 3) {
          currentCalMonth = parseInt(parts[1], 10);
          currentCalYear = parseInt(parts[2], 10);
        }
      }
    }
    if (!aeName || currentWeekNum === 0) continue;
    const dialsPw = parseFloat(cols[4]?.trim() || "0") || 0;
    const demosPw = parseFloat(cols[10]?.trim() || "0") || 0;
    rows.push({
      date: currentDate,
      calYear: currentCalYear,
      calMonth: currentCalMonth,
      weekNum: currentWeekNum,
      aeName,
      dialsPw,
      demosPw
    });
  }
  return rows;
}
function aggregateByMonth(rows) {
  const map = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (row.calYear === 0 || row.calMonth === 0) continue;
    const key = `${row.aeName}|${row.calYear}|${row.calMonth}`;
    if (!map.has(key)) {
      map.set(key, {
        aeName: row.aeName,
        calYear: row.calYear,
        calMonth: row.calMonth,
        totalDials: 0,
        totalDemos: 0
      });
    }
    const entry = map.get(key);
    entry.totalDials += row.dialsPw;
    entry.totalDemos += row.demosPw;
  }
  return Array.from(map.values());
}
function filterLastNMonths(aggregates, n) {
  if (aggregates.length === 0) return [];
  const latest = aggregates.reduce((max, a) => {
    const v = a.calYear * 100 + a.calMonth;
    return v > max ? v : max;
  }, 0);
  const latestYear = Math.floor(latest / 100);
  const latestMonth = latest % 100;
  const cutoffDate = new Date(latestYear, latestMonth - 1 - (n - 1), 1);
  const cutoffYear = cutoffDate.getFullYear();
  const cutoffMonth = cutoffDate.getMonth() + 1;
  return aggregates.filter(
    (a) => a.calYear * 100 + a.calMonth >= cutoffYear * 100 + cutoffMonth
  );
}
var fxCache = null;
async function getFxRates() {
  if (fxCache && Date.now() - fxCache.fetchedAt < 36e5) return fxCache.rates;
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    if (!res.ok) throw new Error("FX API error");
    const data = await res.json();
    fxCache = { rates: data.rates, fetchedAt: Date.now() };
    return data.rates;
  } catch {
    return { GBP: 0.79, EUR: 0.92, USD: 1 };
  }
}
async function toUsd(value, currency) {
  if (currency === "USD") return value;
  const rates = await getFxRates();
  const rate = rates[currency.toUpperCase()];
  if (!rate) return value;
  return value / rate;
}
async function pipedriveGetAll(endpoint, params = {}) {
  const apiKey = process.env.PIPEDRIVE_API_KEY;
  if (!apiKey) return [];
  const all = [];
  let start = 0;
  const limit = 500;
  while (true) {
    const url = new URL(`${PIPEDRIVE_BASE}/${endpoint}`);
    url.searchParams.set("api_token", apiKey);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("start", String(start));
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString());
    if (!res.ok) break;
    const resp = await res.json();
    const data = resp.data || [];
    all.push(...data);
    if (!resp.additional_data?.pagination?.more_items_in_collection) break;
    start += limit;
  }
  return all;
}
async function findPipedriveUserId(aeName) {
  const apiKey = process.env.PIPEDRIVE_API_KEY;
  if (!apiKey) return null;
  const url = new URL(`${PIPEDRIVE_BASE}/users`);
  url.searchParams.set("api_token", apiKey);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const resp = await res.json();
  const users2 = resp.data || [];
  const exact = users2.find((u) => u.name.toLowerCase() === aeName.toLowerCase());
  if (exact) return exact.id;
  const nameParts = aeName.toLowerCase().split(" ");
  const partial = users2.find((u) => {
    const uParts = u.name.toLowerCase().split(" ");
    return nameParts.every((part) => uParts.some((up) => up.includes(part)));
  });
  return partial?.id ?? null;
}
async function runSpreadsheetSync(months = 2) {
  try {
    const token = getGoogleAccessToken() || process.env.GOOGLE_DRIVE_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN;
    if (!token) {
      return { success: false, recordsUpdated: 0, latestWeek: 0, error: "No Google access token" };
    }
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      return { success: false, recordsUpdated: 0, latestWeek: 0, error: `HTTP ${res.status}` };
    }
    const csv = await res.text();
    const rows = parseSheetCsv(csv);
    const latestWeek = rows.length > 0 ? Math.max(...rows.map((r) => r.weekNum)) : 0;
    const allAggs = aggregateByMonth(rows);
    const filtered = filterLastNMonths(allAggs, months);
    const allProfiles = await getAllAeProfiles();
    const nameToId = new Map(allProfiles.map((p) => [p.name.toLowerCase(), p.id]));
    let recordsUpdated = 0;
    for (const agg of filtered) {
      const aeId = nameToId.get(agg.aeName.toLowerCase());
      if (!aeId) continue;
      const existing = await getMetricsForMonth(aeId, agg.calYear, agg.calMonth);
      await upsertMonthlyMetric({
        aeId,
        year: agg.calYear,
        month: agg.calMonth,
        arrUsd: existing?.arrUsd ?? "0",
        demosTotal: Math.round(agg.totalDemos),
        dialsTotal: Math.round(agg.totalDials),
        retentionRate: existing?.retentionRate ?? null
      });
      recordsUpdated++;
    }
    return { success: true, recordsUpdated, latestWeek };
  } catch (err) {
    return {
      success: false,
      recordsUpdated: 0,
      latestWeek: 0,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
async function runPipedriveSync(months = 2) {
  if (!process.env.PIPEDRIVE_API_KEY) {
    return { success: false, recordsUpdated: 0, skippedAes: [], error: "No Pipedrive API key" };
  }
  try {
    const now = /* @__PURE__ */ new Date();
    const toDate = now.toISOString().substring(0, 10);
    const allProfiles = await getAllAeProfiles();
    const skippedAes = [];
    let recordsUpdated = 0;
    for (const ae of allProfiles) {
      const pdUserId = await findPipedriveUserId(ae.name);
      if (!pdUserId) {
        skippedAes.push(ae.name);
        continue;
      }
      const joinDate = new Date(ae.joinDate);
      const fromDate = joinDate.toISOString().substring(0, 10);
      const dealMap = /* @__PURE__ */ new Map();
      for (const pipelineId of TARGET_PIPELINE_IDS) {
        const deals2 = await pipedriveGetAll("deals", {
          pipeline_id: pipelineId,
          user_id: pdUserId,
          status: "won"
        });
        for (const d of deals2) {
          if (dealMap.has(d.id)) continue;
          const wonDate = (d.won_time || d.close_time || "").substring(0, 10);
          if (wonDate >= fromDate && wonDate <= toDate) {
            dealMap.set(d.id, d);
          }
        }
      }
      const allDeals = Array.from(dealMap.values());
      const monthMap = /* @__PURE__ */ new Map();
      for (const deal of allDeals) {
        const wonDate = (deal.won_time || deal.close_time || "").substring(0, 10);
        if (!wonDate) continue;
        const year = parseInt(wonDate.substring(0, 4), 10);
        const month = parseInt(wonDate.substring(5, 7), 10);
        const key = `${year}-${month}`;
        const valueUsd = await toUsd(deal.value || 0, deal.currency || "USD");
        monthMap.set(key, (monthMap.get(key) ?? 0) + valueUsd);
      }
      for (const [key, totalArrUsd] of Array.from(monthMap.entries())) {
        const [yearStr, monthStr] = key.split("-");
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const existing = await getMetricsForMonth(ae.id, year, month);
        await upsertMonthlyMetric({
          aeId: ae.id,
          year,
          month,
          arrUsd: String(Math.round(totalArrUsd)),
          demosTotal: existing?.demosTotal ?? 0,
          dialsTotal: existing?.dialsTotal ?? 0,
          retentionRate: existing?.retentionRate ?? null
        });
        recordsUpdated++;
      }
    }
    return { success: true, recordsUpdated, skippedAes };
  } catch (err) {
    return {
      success: false,
      recordsUpdated: 0,
      skippedAes: [],
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
async function runVoipSync(months = 2) {
  if (!process.env.VOIP_STUDIO_API_KEY) {
    return { success: false, recordsUpdated: 0, unmatchedAes: [], error: "No VOIP_STUDIO_API_KEY" };
  }
  try {
    const { pullVoipMonthlyData: pullVoipMonthlyData2 } = await Promise.resolve().then(() => (init_voipSync(), voipSync_exports));
    const { data, unmatchedAes } = await pullVoipMonthlyData2(months, true);
    let recordsUpdated = 0;
    for (const d of data) {
      const existing = await getMetricsForMonth(d.aeId, d.year, d.month);
      await upsertMonthlyMetric({
        aeId: d.aeId,
        year: d.year,
        month: d.month,
        arrUsd: existing?.arrUsd ?? "0",
        demosTotal: existing?.demosTotal ?? 0,
        dialsTotal: d.totalDials,
        // VOIP Studio is the source of truth for dials
        retentionRate: existing?.retentionRate ?? null,
        connectedDials: d.connected,
        connectionRate: String(d.connectionRate),
        talkTimeSecs: d.totalTalkTimeSecs
      });
      recordsUpdated++;
    }
    return { success: true, recordsUpdated, unmatchedAes };
  } catch (err) {
    return {
      success: false,
      recordsUpdated: 0,
      unmatchedAes: [],
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
async function runWeeklySync() {
  const timestamp2 = (/* @__PURE__ */ new Date()).toISOString();
  console.log(`[WeeklySync] Starting sync at ${timestamp2}`);
  const voipResult = await runVoipSync(2);
  console.log(
    `[WeeklySync] VOIP Studio sync: ${voipResult.success ? "\u2713" : "\u2717"} ${voipResult.recordsUpdated} records` + (voipResult.unmatchedAes.length > 0 ? `, unmatched: ${voipResult.unmatchedAes.join(", ")}` : "") + (voipResult.error ? ` \u2014 ${voipResult.error}` : "")
  );
  const spreadsheetResult = await runSpreadsheetSync(2);
  console.log(
    `[WeeklySync] Spreadsheet sync: ${spreadsheetResult.success ? "\u2713" : "\u2717"} ${spreadsheetResult.recordsUpdated} records, week ${spreadsheetResult.latestWeek}` + (spreadsheetResult.error ? ` \u2014 ${spreadsheetResult.error}` : "")
  );
  const pipedriveResult = await runPipedriveSync(2);
  console.log(
    `[WeeklySync] Pipedrive sync: ${pipedriveResult.success ? "\u2713" : "\u2717"} ${pipedriveResult.recordsUpdated} records` + (pipedriveResult.skippedAes.length > 0 ? `, skipped: ${pipedriveResult.skippedAes.join(", ")}` : "") + (pipedriveResult.error ? ` \u2014 ${pipedriveResult.error}` : "")
  );
  const result = {
    timestamp: timestamp2,
    voipSync: voipResult,
    spreadsheetSync: spreadsheetResult,
    pipedriveSync: pipedriveResult
  };
  console.log(`[WeeklySync] Complete.`);
  return result;
}
var lastSyncResult = null;
var nextSyncTime = null;
function getLastSyncResult() {
  return lastSyncResult;
}
function getNextSyncTime() {
  return nextSyncTime;
}
function computeNextDaily8amUtc() {
  const now = /* @__PURE__ */ new Date();
  const next = new Date(now);
  if (now.getUTCHours() < 8) {
    next.setUTCHours(8, 0, 0, 0);
  } else {
    next.setUTCDate(now.getUTCDate() + 1);
    next.setUTCHours(8, 0, 0, 0);
  }
  return next;
}
function startWeeklySyncScheduler() {
  const cronExpression = process.env.DAILY_SYNC_CRON || "0 8 * * *";
  const task = cron.schedule(
    cronExpression,
    async () => {
      try {
        lastSyncResult = await runWeeklySync();
        nextSyncTime = computeNextDaily8amUtc();
      } catch (err) {
        console.error("[DailySync] Unhandled error:", err);
      }
    },
    {
      timezone: "UTC"
    }
  );
  nextSyncTime = computeNextDaily8amUtc();
  console.log(
    `[DailySync] Scheduler started. Next run: ${nextSyncTime.toISOString()} (cron: "${cronExpression}")`
  );
  void task;
}

// server/spreadsheetSync.ts
var SPREADSHEET_ID2 = "11HPOZ7mkkN-OwhlALdGWicQUzCI0Fkuq_tz9tl1N1qc";
var SHEET_GID2 = "321906789";
function getGoogleAccessToken2() {
  try {
    const fs3 = __require("fs");
    const configPath = process.env.GDRIVE_RCLONE_CONFIG || "/home/ubuntu/.gdrive-rclone.ini";
    const content = fs3.readFileSync(configPath, "utf8");
    const match = content.match(/token\s*=\s*({[^\n]+})/);
    if (!match) return null;
    const tokenObj = JSON.parse(match[1]);
    return tokenObj.access_token ?? null;
  } catch {
    return null;
  }
}
async function fetchSheetCsv() {
  const token = getGoogleAccessToken2() || process.env.GOOGLE_DRIVE_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN || process.env.GDRIVE_TOKEN;
  if (!token) {
    throw new TRPCError3({
      code: "INTERNAL_SERVER_ERROR",
      message: "Google Drive access token not available. Please ensure the Google Drive integration is connected."
    });
  }
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID2}/export?format=csv&gid=${SHEET_GID2}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    throw new TRPCError3({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to fetch Sales Report sheet: ${res.status} ${res.statusText}`
    });
  }
  return res.text();
}
function parseSheetCsv2(csv) {
  const lines = csv.split("\n");
  if (lines.length < 2) return [];
  const rows = [];
  let currentDate = "";
  let currentCalYear = 0;
  let currentCalMonth = 0;
  let currentWeekNum = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = parseCsvLine2(line);
    if (cols.length < 11) continue;
    const dateStr = cols[0]?.trim();
    const weekStr = cols[2]?.trim();
    const aeName = cols[3]?.trim();
    if (weekStr && !isNaN(Number(weekStr))) {
      currentWeekNum = Number(weekStr);
      if (dateStr) {
        currentDate = dateStr;
        const parts = dateStr.split("/");
        if (parts.length === 3) {
          currentCalMonth = parseInt(parts[1], 10);
          currentCalYear = parseInt(parts[2], 10);
        }
      }
    }
    if (!aeName || currentWeekNum === 0) continue;
    const dialsPw = parseFloat(cols[4]?.trim() || "0") || 0;
    const demosPw = parseFloat(cols[10]?.trim() || "0") || 0;
    const isTeamLead = cols[15]?.trim().toUpperCase() === "Y";
    const weeksInBizStr = cols[16]?.trim();
    const weeksInBiz = weeksInBizStr ? parseFloat(weeksInBizStr) || null : null;
    rows.push({
      date: currentDate,
      calYear: currentCalYear,
      calMonth: currentCalMonth,
      weekNum: currentWeekNum,
      aeName,
      dialsPw,
      demosPw,
      isTeamLead,
      weeksInBiz
    });
  }
  return rows;
}
function parseCsvLine2(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
function aggregateByMonth2(rows) {
  const map = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (row.calYear === 0 || row.calMonth === 0) continue;
    const key = `${row.aeName}|${row.calYear}|${row.calMonth}`;
    if (!map.has(key)) {
      map.set(key, {
        aeName: row.aeName,
        calYear: row.calYear,
        calMonth: row.calMonth,
        totalDials: 0,
        totalDemos: 0,
        weeksCount: 0,
        isTeamLead: row.isTeamLead
      });
    }
    const entry = map.get(key);
    entry.totalDials += row.dialsPw;
    entry.totalDemos += row.demosPw;
    entry.weeksCount += 1;
    if (row.isTeamLead) entry.isTeamLead = true;
  }
  return Array.from(map.values()).sort(
    (a, b) => a.calYear * 100 + a.calMonth - (b.calYear * 100 + b.calMonth) || a.aeName.localeCompare(b.aeName)
  );
}
function filterLastNMonths2(aggregates, n) {
  if (aggregates.length === 0) return [];
  const latest = aggregates.reduce((max, a) => {
    const v = a.calYear * 100 + a.calMonth;
    return v > max ? v : max;
  }, 0);
  const latestYear = Math.floor(latest / 100);
  const latestMonth = latest % 100;
  const cutoffDate = new Date(latestYear, latestMonth - 1 - (n - 1), 1);
  const cutoffYear = cutoffDate.getFullYear();
  const cutoffMonth = cutoffDate.getMonth() + 1;
  return aggregates.filter(
    (a) => a.calYear * 100 + a.calMonth >= cutoffYear * 100 + cutoffMonth
  );
}
var spreadsheetSyncRouter = router({
  /**
   * Preview what will be imported from the Sales Report sheet.
   * Returns the aggregated monthly data for the last 4 months.
   * Team leader only.
   */
  preview: publicProcedure.input(
    z2.object({
      months: z2.number().int().min(1).max(12).default(4)
    })
  ).query(async ({ input, ctx }) => {
    const { getAeIdFromCtx: _unused, ...rest } = ctx;
    const cookieHeader = ctx.req?.headers?.["cookie"];
    const match = cookieHeader?.match(/ae_session=([^;]+)/);
    const aeId = match ? (() => {
      try {
        const p = JSON.parse(Buffer.from(match[1], "base64url").toString());
        return typeof p.aeId === "number" ? p.aeId : null;
      } catch {
        return null;
      }
    })() : null;
    if (!aeId) throw new TRPCError3({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    const { getAeProfileById: _getAe } = await Promise.resolve().then(() => (init_db(), db_exports));
    const profile = await _getAe(aeId);
    if (!profile?.isTeamLeader) {
      throw new TRPCError3({ code: "FORBIDDEN", message: "Team leader access required." });
    }
    const csv = await fetchSheetCsv();
    const rows = parseSheetCsv2(csv);
    const allAggregates = aggregateByMonth2(rows);
    const filtered = filterLastNMonths2(allAggregates, input.months);
    const existingProfiles = await getAllAeProfiles();
    const existingNames = new Set(existingProfiles.map((p) => p.name));
    const allAeNames = Array.from(new Set(filtered.map((a) => a.aeName)));
    return {
      aggregates: filtered,
      newAeNames: allAeNames.filter((name) => !existingNames.has(name)),
      existingAeNames: allAeNames.filter((name) => existingNames.has(name)),
      latestWeek: rows.length > 0 ? Math.max(...rows.map((r) => r.weekNum)) : 0,
      totalRows: rows.length
    };
  }),
  /**
   * Import the last N months of data from the Sales Report sheet.
   * Creates AE profiles for new AEs (with a default PIN of "0000" — they must
   * change it on first login) and upserts monthly metrics for all AEs.
   * Team leader only.
   */
  import: publicProcedure.input(
    z2.object({
      months: z2.number().int().min(1).max(12).default(4),
      defaultPin: z2.string().length(4).regex(/^\d{4}$/).default("1234"),
      defaultJoinDate: z2.string().default("2024-01-01")
    })
  ).mutation(async ({ input, ctx }) => {
    const cookieHeader = ctx.req?.headers?.["cookie"];
    const match = cookieHeader?.match(/ae_session=([^;]+)/);
    const aeId = match ? (() => {
      try {
        const p = JSON.parse(Buffer.from(match[1], "base64url").toString());
        return typeof p.aeId === "number" ? p.aeId : null;
      } catch {
        return null;
      }
    })() : null;
    if (!aeId) throw new TRPCError3({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    const { getAeProfileById: _getAe } = await Promise.resolve().then(() => (init_db(), db_exports));
    const profile = await _getAe(aeId);
    if (!profile?.isTeamLeader) {
      throw new TRPCError3({ code: "FORBIDDEN", message: "Team leader access required." });
    }
    const csv = await fetchSheetCsv();
    const rows = parseSheetCsv2(csv);
    const allAggregates = aggregateByMonth2(rows);
    const filtered = filterLastNMonths2(allAggregates, input.months);
    const createdAes = [];
    const updatedMetrics = [];
    const nameToId = /* @__PURE__ */ new Map();
    const uniqueNames = Array.from(new Set(filtered.map((a) => a.aeName)));
    for (const name of uniqueNames) {
      let existing = await getAeProfileByName(name);
      if (!existing) {
        const pinHash = await bcrypt.hash(input.defaultPin, 10);
        const newId = await createAeProfile({
          name,
          pinHash,
          joinDate: new Date(input.defaultJoinDate),
          isTeamLeader: false
        });
        nameToId.set(name, newId);
        createdAes.push(name);
      } else {
        nameToId.set(name, existing.id);
      }
    }
    for (const agg of filtered) {
      const profileId = nameToId.get(agg.aeName);
      if (!profileId) continue;
      await upsertMonthlyMetric({
        aeId: profileId,
        year: agg.calYear,
        month: agg.calMonth,
        arrUsd: "0",
        // ARR comes from Pipedrive — not in this sheet
        demosTotal: Math.round(agg.totalDemos),
        dialsTotal: Math.round(agg.totalDials),
        retentionRate: null
        // Not in this sheet
      });
      updatedMetrics.push(`${agg.aeName} ${agg.calYear}-${String(agg.calMonth).padStart(2, "0")}`);
    }
    return {
      success: true,
      createdAes,
      updatedMetrics,
      totalImported: filtered.length
    };
  }),
  /**
   * Get the current Google Drive token status (for debugging).
   */
  tokenStatus: publicProcedure.query(async () => {
    const token = process.env.GOOGLE_DRIVE_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN || process.env.GDRIVE_TOKEN;
    return {
      hasToken: !!token,
      tokenPrefix: token ? token.substring(0, 20) + "..." : null
    };
  }),
  /**
   * Get the weekly auto-sync schedule status — last run result and next scheduled time.
   * Team leader only.
   */
  syncStatus: publicProcedure.query(async ({ ctx }) => {
    const cookieHeader = ctx.req?.headers?.["cookie"];
    const match = cookieHeader?.match(/ae_session=([^;]+)/);
    const aeId = match ? (() => {
      try {
        const p = JSON.parse(Buffer.from(match[1], "base64url").toString());
        return typeof p.aeId === "number" ? p.aeId : null;
      } catch {
        return null;
      }
    })() : null;
    if (!aeId) throw new TRPCError3({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    const { getAeProfileById: _getAe } = await Promise.resolve().then(() => (init_db(), db_exports));
    const profile = await _getAe(aeId);
    if (!profile?.isTeamLeader) throw new TRPCError3({ code: "FORBIDDEN", message: "Team leader access required." });
    const lastResult = getLastSyncResult();
    const nextTime = getNextSyncTime();
    const cronExpression = process.env.WEEKLY_SYNC_CRON || "0 20 * * 1";
    return {
      schedule: {
        cronExpression,
        description: "Every Monday at 20:00 UTC (after the 7pm Sales Report update)",
        nextRunAt: nextTime?.toISOString() ?? null
      },
      lastRun: lastResult ? {
        timestamp: lastResult.timestamp,
        spreadsheet: {
          success: lastResult.spreadsheetSync.success,
          recordsUpdated: lastResult.spreadsheetSync.recordsUpdated,
          latestWeek: lastResult.spreadsheetSync.latestWeek,
          error: lastResult.spreadsheetSync.error ?? null
        },
        pipedrive: {
          success: lastResult.pipedriveSync.success,
          recordsUpdated: lastResult.pipedriveSync.recordsUpdated,
          skippedAes: lastResult.pipedriveSync.skippedAes,
          error: lastResult.pipedriveSync.error ?? null
        }
      } : null
    };
  }),
  /**
   * Manually trigger the weekly sync immediately.
   * Team leader only.
   */
  triggerSync: publicProcedure.mutation(async ({ ctx }) => {
    const cookieHeader = ctx.req?.headers?.["cookie"];
    const match = cookieHeader?.match(/ae_session=([^;]+)/);
    const aeId = match ? (() => {
      try {
        const p = JSON.parse(Buffer.from(match[1], "base64url").toString());
        return typeof p.aeId === "number" ? p.aeId : null;
      } catch {
        return null;
      }
    })() : null;
    if (!aeId) throw new TRPCError3({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    const { getAeProfileById: _getAe } = await Promise.resolve().then(() => (init_db(), db_exports));
    const profile = await _getAe(aeId);
    if (!profile?.isTeamLeader) throw new TRPCError3({ code: "FORBIDDEN", message: "Team leader access required." });
    const result = await runWeeklySync();
    return {
      success: result.spreadsheetSync.success && result.pipedriveSync.success,
      timestamp: result.timestamp,
      spreadsheet: result.spreadsheetSync,
      pipedrive: result.pipedriveSync
    };
  })
});

// server/pipedriveSync.ts
init_trpc();
init_const();
init_aeTokenUtils();
init_db();
init_commission();
import { z as z3 } from "zod";
import { TRPCError as TRPCError4 } from "@trpc/server";
var PIPEDRIVE_BASE2 = "https://api.pipedrive.com/v1";
var TARGET_PIPELINE_IDS2 = [20, 12, 10];
function getPipedriveApiKey() {
  const key = process.env.PIPEDRIVE_API_KEY;
  if (!key) {
    throw new TRPCError4({
      code: "INTERNAL_SERVER_ERROR",
      message: "PIPEDRIVE_API_KEY environment variable is not set."
    });
  }
  return key;
}
async function pipedriveGet(endpoint, params = {}) {
  const apiKey = getPipedriveApiKey();
  const url = new URL(`${PIPEDRIVE_BASE2}/${endpoint}`);
  url.searchParams.set("api_token", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new TRPCError4({
      code: "INTERNAL_SERVER_ERROR",
      message: `Pipedrive API error: ${res.status} ${res.statusText} for ${endpoint}`
    });
  }
  return res.json();
}
async function pipedriveGetAll2(endpoint, params = {}) {
  const all = [];
  let start = 0;
  const limit = 500;
  while (true) {
    const resp = await pipedriveGet(endpoint, {
      ...params,
      limit,
      start
    });
    const data = resp.data || [];
    all.push(...data);
    const more = resp.additional_data?.pagination?.more_items_in_collection;
    if (!more) break;
    start += limit;
  }
  return all;
}
var fxCache2 = null;
async function getFxRates2() {
  if (fxCache2 && Date.now() - fxCache2.fetchedAt < 36e5) {
    return fxCache2.rates;
  }
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    if (!res.ok) throw new Error("FX API error");
    const data = await res.json();
    fxCache2 = { rates: data.rates, fetchedAt: Date.now() };
    return data.rates;
  } catch {
    return { GBP: 0.79, EUR: 0.92, USD: 1 };
  }
}
async function toUsd2(value, currency) {
  if (currency === "USD") return value;
  const rates = await getFxRates2();
  const rate = rates[currency.toUpperCase()];
  if (!rate) return value;
  return value / rate;
}
var DEAL_EXCLUSION_KEYWORDS = [
  "implementation",
  "customer success",
  "onboarding",
  "cs ",
  "- cs"
];
function isDealExcluded(title) {
  const lower = title.toLowerCase();
  return DEAL_EXCLUSION_KEYWORDS.some((kw) => lower.includes(kw));
}
var PIPELINE_NAMES = {
  20: "Machining",
  12: "Closing SMB",
  10: "Closing Enterprise"
};
async function findPipedriveUserId2(aeName) {
  const resp = await pipedriveGet("users");
  const users2 = resp.data || [];
  const exact = users2.find(
    (u) => u.name.toLowerCase() === aeName.toLowerCase()
  );
  if (exact) return exact.id;
  const nameParts = aeName.toLowerCase().split(" ");
  const partial = users2.find((u) => {
    const uParts = u.name.toLowerCase().split(" ");
    return nameParts.every((part) => uParts.some((up) => up.includes(part)));
  });
  if (partial) return partial.id;
  return null;
}
async function fetchWonDealsForUser(pipedriveUserId, fromDate, toDate) {
  const dealsById = /* @__PURE__ */ new Map();
  for (const pipelineId of TARGET_PIPELINE_IDS2) {
    const deals2 = await pipedriveGetAll2("deals", {
      pipeline_id: pipelineId,
      user_id: pipedriveUserId,
      status: "won"
    });
    for (const d of deals2) {
      if (dealsById.has(d.id)) continue;
      if (isDealExcluded(d.title)) continue;
      const wonDate = d.won_time || d.close_time;
      if (!wonDate) continue;
      const date = wonDate.substring(0, 10);
      if (date >= fromDate && date <= toDate) {
        dealsById.set(d.id, d);
      }
    }
  }
  return Array.from(dealsById.values());
}
async function fetchCompletedDemosForUser(pipedriveUserId, fromDate, toDate) {
  const activities = await pipedriveGetAll2("activities", {
    user_id: pipedriveUserId,
    type: "demo",
    done: 1
  });
  return activities.filter((a) => {
    const doneTime = a.marked_as_done_time;
    if (!doneTime) return false;
    const doneDate = doneTime.substring(0, 10);
    return doneDate >= fromDate && doneDate <= toDate;
  });
}
async function aggregateDealsToMonthlyArr(aeId, aeName, deals2) {
  const map = /* @__PURE__ */ new Map();
  for (const deal of deals2) {
    const wonDate = deal.won_time || deal.close_time;
    if (!wonDate) continue;
    const year = parseInt(wonDate.substring(0, 4), 10);
    const month = parseInt(wonDate.substring(5, 7), 10);
    const key = `${year}-${month}`;
    const valueUsd = await toUsd2(deal.value || 0, deal.currency || "USD");
    const pipelineName = PIPELINE_NAMES[deal.pipeline_id] || `Pipeline ${deal.pipeline_id}`;
    if (!map.has(key)) {
      map.set(key, {
        aeId,
        aeName,
        calYear: year,
        calMonth: month,
        totalArrUsd: 0,
        dealCount: 0,
        totalDemos: 0,
        deals: []
      });
    }
    const entry = map.get(key);
    entry.totalArrUsd += valueUsd;
    entry.dealCount += 1;
    entry.deals.push({
      id: deal.id,
      title: deal.title,
      valueUsd,
      originalValue: deal.value || 0,
      originalCurrency: deal.currency || "USD",
      wonDate: wonDate.substring(0, 10),
      pipeline: pipelineName
    });
  }
  return Array.from(map.values()).sort(
    (a, b) => a.calYear * 100 + a.calMonth - (b.calYear * 100 + b.calMonth)
  );
}
async function aggregateDemosToMonthly(aeId, aeName, demos) {
  const map = /* @__PURE__ */ new Map();
  for (const demo of demos) {
    const doneTime = demo.marked_as_done_time;
    if (!doneTime) continue;
    const year = parseInt(doneTime.substring(0, 4), 10);
    const month = parseInt(doneTime.substring(5, 7), 10);
    const key = `${year}-${month}`;
    if (!map.has(key)) {
      map.set(key, {
        aeId,
        aeName,
        calYear: year,
        calMonth: month,
        totalArrUsd: 0,
        // Not used for demos
        dealCount: 0,
        // Not used for demos
        deals: [],
        // Not used for demos
        totalDemos: 0
      });
    }
    const entry = map.get(key);
    entry.totalDemos += 1;
  }
  return Array.from(map.values()).sort(
    (a, b) => a.calYear * 100 + a.calMonth - (b.calYear * 100 + b.calMonth)
  );
}
var pipedriveSyncRouter = router({
  /**
   * Preview won deals from Pipedrive for all registered AEs.
   * Returns aggregated monthly ARR per AE without writing to DB.
   * Team leader only.
   * 
   * When useJoinDate=true (default), each AE's sync window starts from their join date.
   * When useJoinDate=false, the months parameter is used as a fixed lookback.
   */
  preview: publicProcedure.input(
    z3.object({
      months: z3.number().int().min(1).max(24).default(4),
      useJoinDate: z3.boolean().default(true)
    })
  ).query(async ({ input, ctx }) => {
    const aeId = getAeIdFromCtx(ctx);
    if (!aeId) throw new TRPCError4({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    const profile = await getAeProfileById(aeId);
    if (!profile?.isTeamLeader) {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Team leader access required." });
    }
    const now = /* @__PURE__ */ new Date();
    const toDate = now.toISOString().substring(0, 10);
    const globalFromDate = new Date(
      now.getFullYear(),
      now.getMonth() - (input.months - 1),
      1
    ).toISOString().substring(0, 10);
    const allProfiles = await getAllAeProfiles();
    const results = [];
    for (const ae of allProfiles) {
      const pdUserId = await findPipedriveUserId2(ae.name);
      const aeFromDate = input.useJoinDate ? new Date(ae.joinDate).toISOString().substring(0, 10) : globalFromDate;
      if (!pdUserId) {
        results.push({
          aeId: ae.id,
          aeName: ae.name,
          pipedriveUserId: null,
          monthlyArr: [],
          totalDeals: 0,
          totalArrUsd: 0,
          totalDemos: 0,
          notFound: true,
          monthlyDemos: [],
          fromDate: aeFromDate
        });
        continue;
      }
      const deals2 = await fetchWonDealsForUser(pdUserId, aeFromDate, toDate);
      const monthlyArr = await aggregateDealsToMonthlyArr(ae.id, ae.name, deals2);
      const demos = await fetchCompletedDemosForUser(pdUserId, aeFromDate, toDate);
      const monthlyDemos = await aggregateDemosToMonthly(ae.id, ae.name, demos);
      results.push({
        aeId: ae.id,
        aeName: ae.name,
        pipedriveUserId: pdUserId,
        monthlyArr,
        totalDeals: deals2.length,
        totalArrUsd: monthlyArr.reduce((sum, m) => sum + m.totalArrUsd, 0),
        totalDemos: demos.length,
        monthlyDemos,
        notFound: false,
        fromDate: aeFromDate
      });
    }
    return {
      results,
      fromDate: globalFromDate,
      toDate,
      useJoinDate: input.useJoinDate,
      targetPipelines: Object.entries(PIPELINE_NAMES).map(([id, name]) => ({
        id: Number(id),
        name
      }))
    };
  }),
  /**
   * Import won deal ARR from Pipedrive into monthly_metrics for all AEs.
   * Merges ARR into existing metrics (preserving dials/demos).
   * Team leader only.
   * 
   * When useJoinDate=true (default), each AE's sync window starts from their join date.
   */
  import: publicProcedure.input(
    z3.object({
      months: z3.number().int().min(1).max(24).default(4),
      useJoinDate: z3.boolean().default(true),
      mergeMode: z3.enum(["replace", "add"]).default("replace").describe(
        "replace: set arrUsd to Pipedrive total; add: add Pipedrive ARR on top of existing"
      )
    })
  ).mutation(async ({ input, ctx }) => {
    const aeId = getAeIdFromCtx(ctx);
    if (!aeId) throw new TRPCError4({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    const profile = await getAeProfileById(aeId);
    if (!profile?.isTeamLeader) {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Team leader access required." });
    }
    const now = /* @__PURE__ */ new Date();
    const toDate = now.toISOString().substring(0, 10);
    const globalFromDate = new Date(
      now.getFullYear(),
      now.getMonth() - (input.months - 1),
      1
    ).toISOString().substring(0, 10);
    const allProfiles = await getAllAeProfiles();
    const updatedMetrics = [];
    const skippedAes = [];
    for (const ae of allProfiles) {
      const pdUserId = await findPipedriveUserId2(ae.name);
      if (!pdUserId) {
        skippedAes.push(ae.name);
        continue;
      }
      const fromDate = input.useJoinDate ? new Date(ae.joinDate).toISOString().substring(0, 10) : globalFromDate;
      const deals2 = await fetchWonDealsForUser(pdUserId, fromDate, toDate);
      const monthlyArr = await aggregateDealsToMonthlyArr(ae.id, ae.name, deals2);
      const demos = await fetchCompletedDemosForUser(pdUserId, fromDate, toDate);
      const monthlyDemos = await aggregateDemosToMonthly(ae.id, ae.name, demos);
      const allMonthlyData = /* @__PURE__ */ new Map();
      monthlyArr.forEach((m) => {
        const key = `${m.calYear}-${m.calMonth}`;
        if (!allMonthlyData.has(key)) allMonthlyData.set(key, { arr: null, demos: null });
        allMonthlyData.get(key).arr = m;
      });
      monthlyDemos.forEach((m) => {
        const key = `${m.calYear}-${m.calMonth}`;
        if (!allMonthlyData.has(key)) allMonthlyData.set(key, { arr: null, demos: null });
        allMonthlyData.get(key).demos = m;
      });
      for (const [key, { arr, demos: demos2 }] of Array.from(allMonthlyData.entries())) {
        const [year, month] = key.split("-").map(Number);
        const existing = await getMetricsForMonth(ae.id, year, month);
        const arrUsd = arr?.totalArrUsd ?? 0;
        const demosFromPipedrive = demos2?.totalDemos ?? 0;
        let newArrUsd;
        if (input.mergeMode === "add" && existing) {
          newArrUsd = Number(existing.arrUsd) + arrUsd;
        } else {
          newArrUsd = arrUsd;
        }
        const existingDemosTotal = existing?.demosTotal ?? 0;
        const newDemosTotal = demosFromPipedrive > existingDemosTotal ? demosFromPipedrive : existingDemosTotal;
        await upsertMonthlyMetric({
          aeId: ae.id,
          year,
          month,
          arrUsd: String(Math.round(newArrUsd)),
          demosFromPipedrive,
          demosTotal: newDemosTotal,
          dialsTotal: existing?.dialsTotal ?? 0,
          retentionRate: existing?.retentionRate ?? null
        });
        updatedMetrics.push(
          `${ae.name} ${year}-${String(month).padStart(2, "0")} (ARR: $${Math.round(newArrUsd).toLocaleString()}, Demos: ${demosFromPipedrive})`
        );
      }
    }
    return {
      success: true,
      updatedMetrics,
      skippedAes,
      totalImported: updatedMetrics.length
    };
  }),
  /**
   * Get won deals for the currently logged-in AE (for their own dashboard).
   * Returns deals from the last 12 months.
   */
  myDeals: publicProcedure.input(
    z3.object({
      months: z3.number().int().min(1).max(24).default(12)
    })
  ).query(async ({ input, ctx }) => {
    const aeId = getAeIdFromCtx(ctx);
    if (!aeId) throw new TRPCError4({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    const profile = await getAeProfileById(aeId);
    if (!profile) throw new TRPCError4({ code: "NOT_FOUND" });
    const pdUserId = await findPipedriveUserId2(profile.name);
    if (!pdUserId) {
      return {
        deals: [],
        monthlyArr: [],
        pipedriveUserFound: false,
        pipedriveUserName: null
      };
    }
    const now = /* @__PURE__ */ new Date();
    const toDate = now.toISOString().substring(0, 10);
    const fromDate = new Date(
      now.getFullYear(),
      now.getMonth() - (input.months - 1),
      1
    ).toISOString().substring(0, 10);
    const deals2 = await fetchWonDealsForUser(pdUserId, fromDate, toDate);
    const monthlyArr = await aggregateDealsToMonthlyArr(aeId, profile.name, deals2);
    return {
      deals: deals2.map((d) => ({
        id: d.id,
        title: d.title,
        value: d.value,
        currency: d.currency,
        wonDate: (d.won_time || d.close_time || "").substring(0, 10),
        pipeline: PIPELINE_NAMES[d.pipeline_id] || `Pipeline ${d.pipeline_id}`
      })),
      monthlyArr: monthlyArr.map((m) => ({
        year: m.calYear,
        month: m.calMonth,
        totalArrUsd: Math.round(m.totalArrUsd),
        dealCount: m.dealCount
      })),
      pipedriveUserFound: true,
      pipedriveUserName: profile.name
    };
  }),
  /**
   * Import Pipedrive won deals as deal records for all AEs.
   * Creates deal + payout records in the deals/commission_payouts tables.
   * Skips deals already imported (idempotent via pipedriveId).
   * Team leader only.
   */
  /**
   * Import Pipedrive won deals as deal records for all AEs.
   * Creates deal + payout records in the deals/commission_payouts tables.
   * Skips deals already imported (idempotent via pipedriveId).
   * Team leader only.
   * 
   * When useJoinDate=true (default), each AE's sync window starts from their join date.
   */
  importDeals: publicProcedure.input(
    z3.object({
      months: z3.number().int().min(1).max(24).default(6),
      useJoinDate: z3.boolean().default(true)
    })
  ).mutation(async ({ input, ctx }) => {
    const aeId = getAeIdFromCtx(ctx);
    if (!aeId) throw new TRPCError4({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    const profile = await getAeProfileById(aeId);
    if (!profile?.isTeamLeader) {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Team leader access required." });
    }
    const now = /* @__PURE__ */ new Date();
    const toDate = now.toISOString().substring(0, 10);
    const globalFromDate = new Date(
      now.getFullYear(),
      now.getMonth() - (input.months - 1),
      1
    ).toISOString().substring(0, 10);
    const allProfiles = await getAllAeProfiles();
    const activeStructure = await getActiveCommissionStructure();
    const fxRates = await getFxRates2();
    const usdToGbp = fxRates["GBP"] ?? 0.79;
    const imported = [];
    const skipped = [];
    const errors = [];
    for (const ae of allProfiles) {
      const pdUserId = await findPipedriveUserId2(ae.name);
      if (!pdUserId) {
        skipped.push(`${ae.name} (not found in Pipedrive)`);
        continue;
      }
      const fromDate = input.useJoinDate ? new Date(ae.joinDate).toISOString().substring(0, 10) : globalFromDate;
      const pdDeals = await fetchWonDealsForUser(pdUserId, fromDate, toDate);
      for (const pdDeal of pdDeals) {
        try {
          const existing = await getDealByPipedriveId(ae.id, pdDeal.id);
          if (existing) {
            skipped.push(`${ae.name}: ${pdDeal.title} (already imported)`);
            continue;
          }
          const wonDate = pdDeal.won_time || pdDeal.close_time;
          if (!wonDate) continue;
          const arrUsd = await toUsd2(pdDeal.value || 0, pdDeal.currency || "USD");
          const contractStartDateStr = pdDeal["39365abf109ea01960620ae35f468978ae611bc8"];
          const contractStartDate = contractStartDateStr ? new Date(contractStartDateStr) : null;
          const attributionDate = contractStartDate || new Date(wonDate);
          const startYear = attributionDate.getFullYear();
          const startMonth = attributionDate.getMonth() + 1;
          const startDay = attributionDate.getDate();
          const allMetrics = await getMetricsForAe(ae.id, 9);
          const targetDate = new Date(startYear, startMonth - 1, 1);
          const last3 = allMetrics.filter((m) => new Date(m.year, m.month - 1, 1) < targetDate).slice(0, 3).map((m) => ({
            year: m.year,
            month: m.month,
            arrUsd: Number(m.arrUsd),
            demosTotal: m.demosTotal,
            dialsTotal: m.dialsTotal,
            retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null
          }));
          const last6 = allMetrics.filter((m) => new Date(m.year, m.month - 1, 1) < targetDate).slice(0, 6).map((m) => ({
            year: m.year,
            month: m.month,
            arrUsd: Number(m.arrUsd),
            demosTotal: m.demosTotal,
            dialsTotal: m.dialsTotal,
            retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null
          }));
          const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3);
          const avgRetentionRate = computeAvgRetention(last6);
          const newJoiner = isNewJoiner(ae.joinDate, targetDate);
          const tierResult = calculateTier({
            avgArrUsd,
            avgDemosPw,
            avgDialsPw,
            avgRetentionRate,
            isNewJoiner: newJoiner,
            isTeamLeader: ae.isTeamLeader
          });
          const tier = tierResult.tier;
          const billingFrequencyField = pdDeal["8a8c3b2c5e8f9a1b2c3d4e5f6a7b8c9d"] || "annual";
          const contractType = billingFrequencyField === "monthly" ? "monthly" : "annual";
          const commResult = calculateCommission({
            contractType,
            arrUsd,
            tier,
            onboardingFeePaid: true,
            isReferral: false,
            fxRateUsdToGbp: usdToGbp,
            monthlyPayoutMonths: activeStructure ? Number(activeStructure.monthlyPayoutMonths) : void 0,
            onboardingDeductionGbp: activeStructure ? Number(activeStructure.onboardingDeductionGbp) : void 0,
            onboardingArrReductionUsd: activeStructure ? Number(activeStructure.onboardingArrReductionUsd) : void 0
          });
          const dealId = await createDeal({
            aeId: ae.id,
            customerName: pdDeal.title,
            contractType,
            startYear,
            startMonth,
            startDay,
            arrUsd: String(Math.round(arrUsd)),
            onboardingFeePaid: true,
            isReferral: false,
            tierAtStart: tier,
            fxRateAtEntry: String(usdToGbp),
            fxRateAtWon: String(usdToGbp),
            // Lock FX rate at deal-won date
            commissionStructureId: activeStructure?.id ?? null,
            pipedriveId: pdDeal.id,
            pipedriveWonTime: wonDate ? new Date(wonDate) : null,
            contractStartDate,
            billingFrequency: contractType,
            notes: `Imported from Pipedrive. Pipeline: ${PIPELINE_NAMES[pdDeal.pipeline_id] || pdDeal.pipeline_id}`
          });
          const payouts = commResult.payoutSchedule.map((p, i) => {
            const payoutDate = addMonths(startYear, startMonth, i);
            return {
              dealId,
              aeId: ae.id,
              payoutYear: payoutDate.year,
              payoutMonth: payoutDate.month,
              payoutNumber: p.payoutNumber,
              grossCommissionUsd: String(p.grossCommissionUsd),
              referralDeductionUsd: String(p.referralDeductionUsd),
              onboardingDeductionGbp: String(p.onboardingDeductionGbp),
              netCommissionUsd: String(p.netCommissionUsd),
              fxRateUsed: String(usdToGbp),
              netCommissionGbp: String(p.netCommissionGbp)
            };
          });
          await createPayoutsForDeal(payouts);
          imported.push(`${ae.name}: ${pdDeal.title} ($${Math.round(arrUsd).toLocaleString()} ARR, ${tier} tier)`);
        } catch (err) {
          errors.push(`${ae.name}: ${pdDeal.title} \u2014 ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    return {
      success: true,
      imported,
      skipped,
      errors,
      totalImported: imported.length
    };
  }),
  /**
   * Check if the Pipedrive API key is configured and working.
   */
  status: publicProcedure.query(async () => {
    const key = process.env.PIPEDRIVE_API_KEY;
    if (!key) return { configured: false, working: false };
    try {
      const resp = await pipedriveGet("users/me");
      return {
        configured: true,
        working: true,
        user: resp.data?.name,
        email: resp.data?.email
      };
    } catch {
      return { configured: true, working: false };
    }
  })
});

// server/routers.ts
init_voipSync();

// server/validationRouter.ts
init_trpc();
init_aeTokenUtils();
init_db();
init_schema();
init_commission();
import { TRPCError as TRPCError5 } from "@trpc/server";
var validationRouter = router({
  validateAllTiers: publicProcedure.query(async ({ ctx }) => {
    const callerId = getAeIdFromCtx(ctx);
    if (!callerId) throw new TRPCError5({ code: "UNAUTHORIZED" });
    const caller = await getAeProfileById(callerId);
    if (!caller?.isTeamLeader) throw new TRPCError5({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR" });
    const allDeals = await db.select().from(deals);
    const aeProfiles2 = await getAllAeProfiles();
    const mismatches = [];
    for (const deal of allDeals) {
      const profile = aeProfiles2.find((p) => p.id === deal.aeId);
      if (!profile) continue;
      const metrics = await getMetricsForAe(deal.aeId);
      const targetDate = new Date(deal.startYear, deal.startMonth - 1, 1);
      const last3 = metrics.filter((m) => {
        const d = new Date(m.year, m.month - 1, 1);
        return d < targetDate;
      }).slice(-3);
      let expectedTier = "bronze";
      let avgArr = 0, avgDemos = 0, avgDials = 0;
      if (last3.length > 0) {
        const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3);
        avgArr = avgArrUsd;
        avgDemos = avgDemosPw;
        avgDials = avgDialsPw;
        const newJoiner = isNewJoiner(profile.joinDate, targetDate);
        const tier = calculateTier({
          avgArrUsd,
          avgDemosPw,
          avgDialsPw,
          avgRetentionRate: computeAvgRetention(last3),
          isNewJoiner: newJoiner,
          isTeamLeader: profile.isTeamLeader || false
        });
        expectedTier = tier.tier;
      }
      if (expectedTier !== deal.tierAtStart) {
        mismatches.push({
          id: deal.id,
          dealName: deal.customerName,
          ae: profile.name,
          date: `${deal.startYear}-${String(deal.startMonth).padStart(2, "0")}`,
          expected: expectedTier,
          actual: deal.tierAtStart,
          metrics: {
            avgArr: avgArr.toFixed(0),
            avgDemos: avgDemos.toFixed(1),
            avgDials: avgDials.toFixed(0)
          }
        });
      }
    }
    return { mismatches, total: allDeals.length };
  })
});

// server/demoProcedures.ts
init_trpc();
import { z as z4 } from "zod";

// server/demoDuplicateDetection.ts
init_env();
init_db();
init_schema();
import { eq as eq2 } from "drizzle-orm";
async function fetchDoneActivities() {
  try {
    const apiKey = ENV.PIPEDRIVE_API_KEY;
    if (!apiKey) {
      console.error("[DemoDetection] PIPEDRIVE_API_KEY not configured");
      return [];
    }
    const response = await fetch(
      `https://api.pipedrive.com/v1/activities?type=Demo&done=1&api_token=${apiKey}&limit=500`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" }
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
async function getOrganizationName(orgId) {
  try {
    const apiKey = ENV.PIPEDRIVE_API_KEY;
    if (!apiKey) return `Organization ${orgId}`;
    const response = await fetch(
      `https://api.pipedrive.com/v1/organizations/${orgId}?api_token=${apiKey}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" }
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
async function mapPipedriveUserToAeId(pipedriveUserId) {
  try {
    console.log(`[DemoDetection] Mapping Pipedrive user ${pipedriveUserId} to AE ID`);
    return null;
  } catch (error) {
    console.error("[DemoDetection] Error mapping user:", error);
    return null;
  }
}
async function detectDuplicateDemos() {
  try {
    console.log("[DemoDetection] Starting duplicate demo detection...");
    const db = await getDb();
    if (!db) {
      console.error("[DemoDetection] Database connection failed");
      return;
    }
    const activities = await fetchDoneActivities();
    console.log(`[DemoDetection] Found ${activities.length} done demo activities`);
    const activitiesByOrg = /* @__PURE__ */ new Map();
    for (const activity of activities) {
      if (!activity.org_id) {
        console.log(`[DemoDetection] Demo ${activity.id} not linked to organization`);
        continue;
      }
      const orgKey = activity.org_id;
      if (!activitiesByOrg.has(orgKey)) {
        activitiesByOrg.set(orgKey, []);
      }
      activitiesByOrg.get(orgKey).push(activity);
    }
    const sixMonthsAgo = /* @__PURE__ */ new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    for (const [orgId, orgActivities] of activitiesByOrg.entries()) {
      const recentActivities = orgActivities.filter((a) => {
        const demoDate = new Date(a.due_date);
        return demoDate >= sixMonthsAgo;
      });
      if (recentActivities.length > 1) {
        recentActivities.sort(
          (a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime()
        );
        console.log(
          `[DemoDetection] Found ${recentActivities.length} demos for organization ${orgId} in last 6 months`
        );
        for (let i = 1; i < recentActivities.length; i++) {
          const activity = recentActivities[i];
          const aeId = await mapPipedriveUserToAeId(activity.user_id);
          if (!aeId) {
            console.warn(`[DemoDetection] Could not map AE for activity ${activity.id}`);
            continue;
          }
          const orgName = activity.org_name || await getOrganizationName(activity.org_id);
          const existing = await db.select().from(duplicateDemoFlags).where(eq2(duplicateDemoFlags.pipedriveActivityId, activity.id));
          if (existing.length === 0) {
            await db.insert(duplicateDemoFlags).values({
              aeId,
              pipedriveActivityId: activity.id,
              organizationId: activity.org_id,
              organizationName: orgName,
              demoDate: new Date(activity.due_date),
              isDuplicate: true,
              notes: `Duplicate demo for ${orgName} - Previous demo was on ${recentActivities[i - 1].due_date}`
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
async function detectCrmHygieneIssues() {
  try {
    console.log("[DemoDetection] Starting CRM hygiene detection...");
    const db = await getDb();
    if (!db) {
      console.error("[DemoDetection] Database connection failed");
      return;
    }
    const activities = await fetchDoneActivities();
    for (const activity of activities) {
      if (!activity.deal_id) {
        const aeId = await mapPipedriveUserToAeId(activity.user_id);
        if (!aeId) {
          console.warn(`[DemoDetection] Could not map AE for activity ${activity.id}`);
          continue;
        }
        let issueType = "no_deal_link";
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
        const existing = await db.select().from(crmHygieneIssues).where(eq2(crmHygieneIssues.pipedriveActivityId, activity.id));
        if (existing.length === 0) {
          await db.insert(crmHygieneIssues).values({
            aeId,
            pipedriveActivityId: activity.id,
            issueType,
            organizationName: activity.org_name,
            personName: activity.person_name,
            leadTitle: activity.lead_title,
            demoDate: new Date(activity.due_date),
            explanation
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
async function getUnacknowledgedFlagsForAe(aeId) {
  try {
    const db = await getDb();
    if (!db) {
      return { duplicateDemos: [], hygieneIssues: [] };
    }
    const duplicateDemos = await db.select().from(duplicateDemoFlags).where(eq2(duplicateDemoFlags.aeId, aeId) && eq2(duplicateDemoFlags.isAcknowledged, false));
    const hygieneIssues = await db.select().from(crmHygieneIssues).where(eq2(crmHygieneIssues.aeId, aeId) && eq2(crmHygieneIssues.isAcknowledged, false));
    return { duplicateDemos, hygieneIssues };
  } catch (error) {
    console.error("[DemoDetection] Error fetching flags:", error);
    return { duplicateDemos: [], hygieneIssues: [] };
  }
}
async function acknowledgeDuplicateDemoFlag(flagId) {
  try {
    const db = await getDb();
    if (!db) return false;
    await db.update(duplicateDemoFlags).set({
      isAcknowledged: true,
      acknowledgedAt: /* @__PURE__ */ new Date()
    }).where(eq2(duplicateDemoFlags.id, flagId));
    return true;
  } catch (error) {
    console.error("[DemoDetection] Error acknowledging flag:", error);
    return false;
  }
}
async function acknowledgeCrmHygieneIssue(issueId) {
  try {
    const db = await getDb();
    if (!db) return false;
    await db.update(crmHygieneIssues).set({
      isAcknowledged: true,
      acknowledgedAt: /* @__PURE__ */ new Date()
    }).where(eq2(crmHygieneIssues.id, issueId));
    return true;
  } catch (error) {
    console.error("[DemoDetection] Error acknowledging issue:", error);
    return false;
  }
}

// server/demoDetectionScheduler.ts
import * as cron2 from "node-cron";
var scheduledJob = null;
function initializeDemoDetectionScheduler() {
  if (scheduledJob) {
    console.log("[DemoDetectionScheduler] Scheduler already initialized");
    return;
  }
  const cronExpression = "0 8 * * *";
  scheduledJob = cron2.schedule(cronExpression, async () => {
    console.log("[DemoDetectionScheduler] Running demo detection at", (/* @__PURE__ */ new Date()).toISOString());
    await runDemoDetection();
  });
  console.log("[DemoDetectionScheduler] Initialized - will run at 8 AM GMT every day");
}
async function runDemoDetection() {
  try {
    console.log("[DemoDetectionScheduler] Starting daily demo detection");
    await detectDuplicateDemos();
    await detectCrmHygieneIssues();
    console.log("[DemoDetectionScheduler] Daily demo detection completed successfully");
  } catch (error) {
    console.error("[DemoDetectionScheduler] Error during demo detection:", error);
  }
}
async function triggerDemoDetectionManually() {
  console.log("[DemoDetectionScheduler] Manual trigger of demo detection");
  await runDemoDetection();
}

// server/demoProcedures.ts
init_aeTokenUtils();
init_db();
import { TRPCError as TRPCError6 } from "@trpc/server";
var demoRouter = router({
  /**
   * Get unacknowledged demo flags for current AE
   */
  getUnacknowledgedFlags: protectedProcedure.query(async ({ ctx }) => {
    try {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError6({ code: "UNAUTHORIZED" });
      const { duplicateDemos, hygieneIssues } = await getUnacknowledgedFlagsForAe(aeId);
      return {
        duplicateDemos: duplicateDemos.map((flag) => ({
          id: flag.id,
          organizationName: flag.organizationName,
          demoDate: flag.demoDate,
          notes: flag.notes,
          type: "duplicate"
        })),
        hygieneIssues: hygieneIssues.map((issue) => ({
          id: issue.id,
          organizationName: issue.organizationName || issue.personName || issue.leadTitle,
          demoDate: issue.demoDate,
          explanation: issue.explanation,
          issueType: issue.issueType,
          type: "hygiene"
        }))
      };
    } catch (error) {
      console.error("[DemoProcedures] Error getting flags:", error);
      throw new TRPCError6({ code: "INTERNAL_SERVER_ERROR" });
    }
  }),
  /**
   * Acknowledge a duplicate demo flag
   */
  acknowledgeDuplicateFlag: protectedProcedure.input(z4.object({ flagId: z4.number() })).mutation(async ({ ctx, input }) => {
    try {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError6({ code: "UNAUTHORIZED" });
      const success = await acknowledgeDuplicateDemoFlag(input.flagId);
      if (!success) {
        throw new TRPCError6({ code: "INTERNAL_SERVER_ERROR", message: "Failed to acknowledge flag" });
      }
      return { success: true };
    } catch (error) {
      console.error("[DemoProcedures] Error acknowledging flag:", error);
      throw error;
    }
  }),
  /**
   * Acknowledge a CRM hygiene issue
   */
  acknowledgeHygieneIssue: protectedProcedure.input(z4.object({ issueId: z4.number() })).mutation(async ({ ctx, input }) => {
    try {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError6({ code: "UNAUTHORIZED" });
      const success = await acknowledgeCrmHygieneIssue(input.issueId);
      if (!success) {
        throw new TRPCError6({ code: "INTERNAL_SERVER_ERROR", message: "Failed to acknowledge issue" });
      }
      return { success: true };
    } catch (error) {
      console.error("[DemoProcedures] Error acknowledging issue:", error);
      throw error;
    }
  }),
  /**
   * Manual trigger for demo detection (admin only)
   */
  triggerDetection: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError6({ code: "UNAUTHORIZED" });
      const ae = await getAeProfileById(aeId);
      if (!ae?.isTeamLeader) {
        throw new TRPCError6({ code: "FORBIDDEN", message: "Only team leaders can trigger detection" });
      }
      await triggerDemoDetectionManually();
      return {
        success: true,
        message: "Demo detection triggered successfully"
      };
    } catch (error) {
      console.error("[DemoProcedures] Error triggering detection:", error);
      throw error;
    }
  })
});

// server/resyncPayouts.ts
init_db();
init_schema();
import { TRPCError as TRPCError7 } from "@trpc/server";
import { eq as eq3 } from "drizzle-orm";
async function resyncAllPayouts(aeId) {
  if (!aeId || aeId !== 1) {
    throw new TRPCError7({
      code: "FORBIDDEN",
      message: "Only team leaders can resync payouts"
    });
  }
  const db = await getDb();
  if (!db) throw new TRPCError7({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  try {
    const deleteResult = await db.delete(commissionPayouts);
    const payoutsDeleted = deleteResult.rowCount ?? 0;
    const allDeals = await db.select({
      id: deals.id,
      aeId: deals.aeId,
      customerName: deals.customerName,
      contractType: deals.contractType,
      contractStartDate: deals.contractStartDate,
      arrUsd: deals.arrUsd,
      tierAtStart: deals.tierAtStart,
      isReferral: deals.isReferral,
      onboardingFeePaid: deals.onboardingFeePaid,
      fxRateAtWon: deals.fxRateAtWon,
      bronzeRate: commissionStructures.bronzeRate,
      silverRate: commissionStructures.silverRate,
      goldRate: commissionStructures.goldRate,
      onboardingDeductionGbp: commissionStructures.onboardingDeductionGbp
    }).from(deals).leftJoin(commissionStructures, eq3(deals.commissionStructureId, commissionStructures.id));
    let payoutsCreated = 0;
    let totalCommissionGbp = 0;
    for (const deal of allDeals) {
      const payoutRecords = calculatePayouts(deal);
      for (const payout of payoutRecords) {
        await db.insert(commissionPayouts).values({
          aeId: deal.aeId,
          dealId: deal.id,
          payoutMonth: payout.month,
          payoutYear: payout.year,
          grossCommissionUsd: String(payout.grossUsd),
          netCommissionGbp: String(payout.netGbp),
          netCommissionUsd: String(payout.netUsd),
          payoutNumber: payout.payoutNumber,
          fxRateUsed: String(payout.fxRate),
          referralDeductionUsd: String(payout.referralDeductionUsd),
          onboardingDeductionGbp: String(payout.onboardingDeductionGbp)
        });
        payoutsCreated++;
        totalCommissionGbp += payout.netGbp;
      }
    }
    console.log(`[resyncPayouts] Deleted ${payoutsDeleted}, created ${payoutsCreated}`);
    return {
      success: true,
      payoutsDeleted,
      payoutsCreated,
      totalCommissionGbp
    };
  } catch (error) {
    console.error("[resyncPayouts] Error:", error);
    throw new TRPCError7({
      code: "INTERNAL_SERVER_ERROR",
      message: `Resync failed: ${error instanceof Error ? error.message : "Unknown error"}`
    });
  }
}
function calculatePayouts(deal) {
  const payouts = [];
  if (!deal.contractStartDate || !deal.arrUsd) {
    return payouts;
  }
  const startDate = new Date(deal.contractStartDate);
  const startMonth = startDate.getMonth() + 1;
  const startYear = startDate.getFullYear();
  const arrUsd = parseFloat(deal.arrUsd);
  const commissionRate = deal.tierAtStart === "gold" ? parseFloat(deal.goldRate ?? "0.19") : deal.tierAtStart === "silver" ? parseFloat(deal.silverRate ?? "0.16") : parseFloat(deal.bronzeRate ?? "0.13");
  const grossCommissionUsd = arrUsd * commissionRate;
  const fxRate = deal.fxRateAtWon ? parseFloat(deal.fxRateAtWon) : 0.738;
  const referralDeductionUsd = deal.isReferral ? grossCommissionUsd * 0.5 : 0;
  const netAfterReferralUsd = grossCommissionUsd - referralDeductionUsd;
  const netAfterReferralGbp = netAfterReferralUsd * fxRate;
  const onboardingDeductionGbp = deal.onboardingFeePaid ? parseFloat(deal.onboardingDeductionGbp ?? "500") : 0;
  if (deal.contractType === "annual") {
    const netGbp = Math.max(0, netAfterReferralGbp - onboardingDeductionGbp);
    const netUsd = netGbp / fxRate;
    payouts.push({
      month: startMonth,
      year: startYear,
      grossUsd: grossCommissionUsd,
      netGbp,
      netUsd,
      payoutNumber: 1,
      fxRate,
      referralDeductionUsd,
      onboardingDeductionGbp
    });
  } else if (deal.contractType === "monthly") {
    const monthlyGrossUsd = grossCommissionUsd / 12;
    const monthlyReferralDeductionUsd = referralDeductionUsd / 12;
    const monthlyNetUsd = netAfterReferralUsd / 12;
    const monthlyNetGbp = netAfterReferralGbp / 12;
    for (let i = 0; i < 13; i++) {
      let payoutMonth = startMonth + i;
      let payoutYear = startYear;
      while (payoutMonth > 12) {
        payoutMonth -= 12;
        payoutYear += 1;
      }
      const thisOnboardingDeduction = i === 0 ? onboardingDeductionGbp : 0;
      const netGbp = Math.max(0, monthlyNetGbp - thisOnboardingDeduction);
      const netUsd = netGbp / fxRate;
      payouts.push({
        month: payoutMonth,
        year: payoutYear,
        grossUsd: monthlyGrossUsd,
        netGbp,
        netUsd,
        payoutNumber: i + 1,
        fxRate,
        referralDeductionUsd: monthlyReferralDeductionUsd,
        onboardingDeductionGbp: thisOnboardingDeduction
      });
    }
  }
  return payouts;
}

// server/routers.ts
import * as bcrypt2 from "bcryptjs";

// server/aeAuth.ts
init_env();
import { createHmac as createHmac2, timingSafeEqual as timingSafeEqual2 } from "crypto";
function getSecret2() {
  return ENV.cookieSecret || "fallback-dev-secret";
}
function makeAeToken(aeId) {
  const payload = Buffer.from(JSON.stringify({ aeId, ts: Date.now() })).toString("base64url");
  const sig = createHmac2("sha256", getSecret2()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

// server/routers.ts
init_aeTokenUtils();
init_commission();
import { z as z6 } from "zod";

// shared/gracePeriod.ts
var GRACE_PERIOD_MONTHS = 6;
function isInGracePeriod(aeStartDate, checkYear, checkMonth) {
  const startDate = typeof aeStartDate === "string" ? new Date(aeStartDate) : aeStartDate;
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth() + 1;
  const checkMonthNumber = (checkYear - startYear) * 12 + (checkMonth - startMonth);
  return checkMonthNumber >= 0 && checkMonthNumber < GRACE_PERIOD_MONTHS;
}
function getGracePeriodStatus(aeStartDate, year, month) {
  if (isInGracePeriod(aeStartDate, year, month)) {
    const startDate = typeof aeStartDate === "string" ? new Date(aeStartDate) : aeStartDate;
    const startMonth = startDate.getMonth() + 1;
    const startYear = startDate.getFullYear();
    const monthNumber = (year - startYear) * 12 + (month - startMonth);
    return `Grace Period (Month ${monthNumber + 1}/6)`;
  }
  return "Actual Performance";
}

// server/routers.ts
init_const();

// server/_core/systemRouter.ts
init_notification();
init_trpc();
import { z as z5 } from "zod";
var systemRouter = router({
  health: publicProcedure.input(
    z5.object({
      timestamp: z5.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z5.object({
      title: z5.string().min(1, "title is required"),
      content: z5.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
init_trpc();
init_db();
init_schema();
import { eq as eq5, like, and as and3, inArray } from "drizzle-orm";
seedInitialCommissionStructure().catch(console.error);
var _fxCache = null;
var FX_CACHE_TTL_MS = 5 * 60 * 1e3;
async function fetchUsdToGbpRate() {
  const now = Date.now();
  if (_fxCache && now - _fxCache.fetchedAt < FX_CACHE_TTL_MS) {
    return _fxCache.rate;
  }
  try {
    const res = await fetch(
      "https://api.exchangerate-api.com/v4/latest/USD"
    );
    if (!res.ok) throw new Error("FX API error");
    const data = await res.json();
    const rate = data.rates["GBP"] ?? 0.79;
    _fxCache = { rate, fetchedAt: now };
    return rate;
  } catch {
    return _fxCache?.rate ?? 0.79;
  }
}
async function fetchLiveRates() {
  try {
    const res = await fetch(
      "https://api.exchangerate-api.com/v4/latest/USD"
    );
    if (!res.ok) throw new Error("FX API error");
    const data = await res.json();
    return data.rates;
  } catch {
    return { GBP: 0.79, EUR: 0.8656 };
  }
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  // ─── AE Auth ───────────────────────────────────────────────────────────────
  ae: router({
    // List all AE names (for login dropdown)
    listNames: publicProcedure.query(async () => {
      const profiles = await getAllAeProfiles();
      return profiles.map((p) => ({ id: p.id, name: p.name }));
    }),
    // Register a new AE profile (team leader only)
    register: publicProcedure.input(
      z6.object({
        name: z6.string().min(2).max(128),
        pin: z6.string().length(4).regex(/^\d{4}$/, "PIN must be 4 digits"),
        joinDate: z6.string(),
        // ISO date string
        isTeamLeader: z6.boolean().default(false)
      })
    ).mutation(async ({ input, ctx }) => {
      const existingAes = await getAllAeProfiles();
      if (existingAes.length > 0) {
        const callerId = getAeIdFromCtx(ctx);
        if (!callerId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
        const caller = await getAeProfileById(callerId);
        if (!caller?.isTeamLeader) throw new TRPCError9({ code: "FORBIDDEN", message: "Team leader access required." });
      }
      const existing = await getAeProfileByName(input.name);
      if (existing) {
        throw new TRPCError9({
          code: "CONFLICT",
          message: "An AE with this name already exists."
        });
      }
      const pinHash = await bcrypt2.hash(input.pin, 10);
      const id = await createAeProfile({
        name: input.name,
        pinHash,
        joinDate: new Date(input.joinDate),
        isTeamLeader: input.isTeamLeader
      });
      return { id, name: input.name };
    }),
    // Login with name + PIN — returns a token to be stored in localStorage
    login: publicProcedure.input(
      z6.object({
        name: z6.string(),
        pin: z6.string().length(4)
      })
    ).mutation(async ({ input }) => {
      const profile = await getAeProfileByName(input.name);
      if (!profile) {
        throw new TRPCError9({ code: "NOT_FOUND", message: "AE not found." });
      }
      const MAX_ATTEMPTS = 5;
      const LOCKOUT_HOURS = 2;
      const now = /* @__PURE__ */ new Date();
      if (profile.lockedUntil && profile.lockedUntil > now) {
        const minutesLeft = Math.ceil(
          (profile.lockedUntil.getTime() - now.getTime()) / 6e4
        );
        throw new TRPCError9({
          code: "TOO_MANY_REQUESTS",
          message: `Account locked. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`
        });
      }
      const valid = await bcrypt2.compare(input.pin, profile.pinHash);
      if (!valid) {
        const newAttempts = (profile.failedPinAttempts ?? 0) + 1;
        const lockoutUntil = newAttempts >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_HOURS * 60 * 60 * 1e3) : void 0;
        await recordFailedPinAttempt(profile.id, newAttempts, lockoutUntil);
        const remaining = MAX_ATTEMPTS - newAttempts;
        if (lockoutUntil) {
          throw new TRPCError9({
            code: "TOO_MANY_REQUESTS",
            message: `Too many incorrect attempts. Account locked for ${LOCKOUT_HOURS} hours.`
          });
        }
        throw new TRPCError9({
          code: "UNAUTHORIZED",
          message: `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
        });
      }
      await resetPinAttempts(profile.id);
      const token = makeAeToken(profile.id);
      return {
        token,
        id: profile.id,
        name: profile.name,
        joinDate: profile.joinDate,
        isTeamLeader: profile.isTeamLeader
      };
    }),
    // Change PIN — requires current PIN for verification
    changePin: publicProcedure.input(
      z6.object({
        currentPin: z6.string().length(4).regex(/^\d{4}$/),
        newPin: z6.string().length(4).regex(/^\d{4}$/, "PIN must be 4 digits")
      })
    ).mutation(async ({ ctx, input }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) {
        throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      }
      const profile = await getAeProfileById(aeId);
      if (!profile) {
        throw new TRPCError9({ code: "NOT_FOUND", message: "Profile not found." });
      }
      const valid = await bcrypt2.compare(input.currentPin, profile.pinHash);
      if (!valid) {
        throw new TRPCError9({
          code: "UNAUTHORIZED",
          message: "Current PIN is incorrect."
        });
      }
      const samePin = await bcrypt2.compare(input.newPin, profile.pinHash);
      if (samePin) {
        throw new TRPCError9({
          code: "BAD_REQUEST",
          message: "New PIN must be different from your current PIN."
        });
      }
      const newPinHash = await bcrypt2.hash(input.newPin, 10);
      await updateAeProfile(aeId, { pinHash: newPinHash });
      await resetPinAttempts(aeId);
      return { success: true };
    }),
    // Admin: reset another AE's PIN (team leader only)
    adminResetPin: publicProcedure.input(
      z6.object({
        targetAeId: z6.number().int().positive(),
        newPin: z6.string().length(4).regex(/^\d{4}$/, "PIN must be 4 digits")
      })
    ).mutation(async ({ ctx, input }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) {
        throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      }
      const caller = await getAeProfileById(aeId);
      if (!caller?.isTeamLeader) {
        throw new TRPCError9({ code: "FORBIDDEN", message: "Team leader access required." });
      }
      const target = await getAeProfileById(input.targetAeId);
      if (!target) {
        throw new TRPCError9({ code: "NOT_FOUND", message: "AE not found." });
      }
      const newPinHash = await bcrypt2.hash(input.newPin, 10);
      await updateAeProfile(input.targetAeId, { pinHash: newPinHash });
      await resetPinAttempts(input.targetAeId);
      return { success: true, aeName: target.name };
    }),
    // Logout AE session (client clears localStorage)
    logout: publicProcedure.mutation(() => {
      return { success: true };
    }),
    // Get current AE session
    me: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) return null;
      const profile = await getAeProfileById(aeId);
      if (!profile) return null;
      return {
        id: profile.id,
        name: profile.name,
        joinDate: profile.joinDate,
        isTeamLeader: profile.isTeamLeader
      };
    })
  }),
  // ─── Metrics ───────────────────────────────────────────────────────────────
  metrics: router({
    // Save or update metrics for a given month — ADMIN (team leader) only
    upsert: publicProcedure.input(
      z6.object({
        year: z6.number().int().min(2020).max(2100),
        month: z6.number().int().min(1).max(12),
        // aeId is required when called by admin on behalf of another AE
        aeId: z6.number().int().optional(),
        arrUsd: z6.number().min(0),
        demosTotal: z6.number().int().min(0),
        dialsTotal: z6.number().int().min(0),
        retentionRate: z6.number().min(0).max(100).optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const callerId = getAeIdFromCtx(ctx);
      if (!callerId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      const caller = await getAeProfileById(callerId);
      if (!caller?.isTeamLeader) {
        throw new TRPCError9({ code: "FORBIDDEN", message: "Only admins can edit activity data." });
      }
      const aeId = input.aeId ?? callerId;
      await upsertMonthlyMetric({
        aeId,
        year: input.year,
        month: input.month,
        arrUsd: String(input.arrUsd),
        demosTotal: input.demosTotal,
        dialsTotal: input.dialsTotal,
        retentionRate: input.retentionRate != null ? String(input.retentionRate) : null
      });
      return { success: true };
    }),
    // Get recent metrics for current AE with grace period info
    list: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      const aeProfile = await getAeProfileById(aeId);
      const rows = await getMetricsForAe(aeId, 6);
      return rows.map((r) => {
        const inGracePeriod = aeProfile?.joinDate ? isInGracePeriod(aeProfile.joinDate, r.year, r.month) : false;
        const gracePeriodStatus = aeProfile?.joinDate ? getGracePeriodStatus(aeProfile.joinDate, r.year, r.month) : "Unknown";
        return {
          ...r,
          arrUsd: Number(r.arrUsd),
          retentionRate: r.retentionRate != null ? Number(r.retentionRate) : null,
          inGracePeriod,
          gracePeriodStatus
        };
      });
    }),
    // Get metric for a specific month
    getForMonth: publicProcedure.input(z6.object({ year: z6.number().int(), month: z6.number().int() })).query(async ({ input, ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      const aeProfile = await getAeProfileById(aeId);
      const row = await getMetricsForMonth(aeId, input.year, input.month);
      if (!row) return null;
      const inGracePeriod = aeProfile?.joinDate ? isInGracePeriod(aeProfile.joinDate, input.year, input.month) : false;
      const gracePeriodStatus = aeProfile?.joinDate ? getGracePeriodStatus(aeProfile.joinDate, input.year, input.month) : "Unknown";
      return {
        ...row,
        arrUsd: Number(row.arrUsd),
        retentionRate: row.retentionRate != null ? Number(row.retentionRate) : null,
        inGracePeriod,
        gracePeriodStatus
      };
    })
  }),
  // ─── Tier Calculator ────────────────────────────────────────────────────────
  tier: router({
    // Calculate tier for a given month based on stored metrics
    calculate: publicProcedure.input(
      z6.object({
        year: z6.number().int(),
        month: z6.number().int().min(1).max(12)
      })
    ).query(async ({ input, ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      const profile = await getAeProfileById(aeId);
      if (!profile) throw new TRPCError9({ code: "NOT_FOUND" });
      const allMetrics = await getMetricsForAe(aeId, 9);
      const targetDate = new Date(input.year, input.month - 1, 1);
      const joinDate = new Date(profile.joinDate);
      let last3 = allMetrics.filter((m) => {
        const d = new Date(m.year, m.month - 1, 1);
        return d < targetDate && d >= joinDate;
      }).slice(0, 3);
      if (last3.length === 0 && isNewJoiner(profile.joinDate, targetDate)) {
        last3 = allMetrics.filter((m) => {
          const d = new Date(m.year, m.month - 1, 1);
          return d.getFullYear() === input.year && d.getMonth() + 1 === input.month;
        }).slice(0, 1);
      }
      last3 = last3.map((m) => {
        const monthDate = new Date(m.year, m.month - 1, 1);
        const monthsSinceJoin = (monthDate.getFullYear() - joinDate.getFullYear()) * 12 + (monthDate.getMonth() - joinDate.getMonth());
        const arrUsd = monthsSinceJoin >= 0 && monthsSinceJoin < 6 ? 25e3 : Number(m.arrUsd);
        return {
          year: m.year,
          month: m.month,
          arrUsd,
          demosTotal: m.demosTotal,
          dialsTotal: m.dialsTotal,
          retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null
        };
      });
      let last6 = allMetrics.filter((m) => {
        const d = new Date(m.year, m.month - 1, 1);
        return d < targetDate && d >= joinDate;
      }).slice(0, 6);
      if (last6.length === 0 && isNewJoiner(profile.joinDate, targetDate)) {
        last6 = allMetrics.filter((m) => {
          const d = new Date(m.year, m.month - 1, 1);
          return d.getFullYear() === input.year && d.getMonth() + 1 === input.month;
        }).slice(0, 1);
      }
      last6 = last6.map((m) => ({
        year: m.year,
        month: m.month,
        arrUsd: Number(m.arrUsd),
        demosTotal: m.demosTotal,
        dialsTotal: m.dialsTotal,
        retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null
      }));
      const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3, new Date(profile.joinDate));
      const avgRetentionRate = computeAvgRetention(last6);
      const newJoiner = isNewJoiner(profile.joinDate, targetDate);
      const result = calculateTier({
        avgArrUsd,
        avgDemosPw,
        avgDialsPw,
        avgRetentionRate,
        isNewJoiner: newJoiner,
        isTeamLeader: profile.isTeamLeader
      });
      return {
        ...result,
        avgArrUsd,
        avgDemosPw,
        avgDialsPw,
        avgRetentionRate,
        isNewJoiner: newJoiner,
        isTeamLeader: profile.isTeamLeader,
        last3Months: last3.map((m) => ({
          label: `${MONTH_NAMES[m.month - 1]} ${m.year}`,
          arrUsd: m.arrUsd,
          demosTotal: m.demosTotal,
          dialsTotal: m.dialsTotal
        }))
      };
    }),
    // Calculate tier from manual inputs (for preview without saving)
    preview: publicProcedure.input(
      z6.object({
        months: z6.array(
          z6.object({
            arrUsd: z6.number().min(0),
            demosTotal: z6.number().int().min(0),
            dialsTotal: z6.number().int().min(0)
          })
        ).min(1).max(3),
        retentionRate: z6.number().min(0).max(100).nullable().optional(),
        isNewJoiner: z6.boolean().default(false),
        isTeamLeader: z6.boolean().default(false)
      })
    ).query(async ({ input }) => {
      const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(
        input.months.map((m, i) => ({ ...m, year: 2026, month: i + 1, retentionRate: null }))
      );
      const result = calculateTier({
        avgArrUsd,
        avgDemosPw,
        avgDialsPw,
        avgRetentionRate: input.retentionRate ?? null,
        isNewJoiner: input.isNewJoiner,
        isTeamLeader: input.isTeamLeader
      });
      return { ...result, avgArrUsd, avgDemosPw, avgDialsPw };
    })
  }),
  // ─── Deals ─────────────────────────────────────────────────────────────────
  deals: router({
    // Add a new deal and generate commission payout schedule
    create: publicProcedure.input(
      z6.object({
        customerName: z6.string().min(1).max(256),
        contractType: z6.enum(["annual", "monthly"]),
        startYear: z6.number().int(),
        startMonth: z6.number().int().min(1).max(12),
        startDay: z6.number().int().min(1).max(31),
        // Support both old arrUsd (for backward compat) and new originalAmount+originalCurrency
        arrUsd: z6.number().positive().optional(),
        originalAmount: z6.number().positive().optional(),
        originalCurrency: z6.enum(["USD", "EUR", "GBP"]).default("USD"),
        onboardingFeePaid: z6.boolean(),
        isReferral: z6.boolean(),
        billingFrequency: z6.enum(["annual", "monthly"]).default("annual"),
        // Optionally override tier (otherwise auto-calculated)
        tierOverride: z6.enum(["bronze", "silver", "gold"]).optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      const profile = await getAeProfileById(aeId);
      if (!profile) throw new TRPCError9({ code: "NOT_FOUND" });
      const { convertToUsd: convertToUsd2, getCurrentFxRates: getCurrentFxRates2 } = await Promise.resolve().then(() => (init_fxService(), fxService_exports));
      let arrUsd = input.arrUsd ?? 0;
      let originalAmount = input.originalAmount ?? arrUsd;
      let originalCurrency = input.originalCurrency ?? "USD";
      let conversionRate = 1;
      if (input.originalAmount) {
        originalAmount = input.originalAmount;
        originalCurrency = input.originalCurrency;
        if (originalCurrency !== "USD") {
          const { usdAmount, rate } = await convertToUsd2(
            originalAmount,
            originalCurrency
          );
          arrUsd = usdAmount;
          conversionRate = rate;
        } else {
          conversionRate = 1;
          arrUsd = originalAmount;
        }
      } else if (!input.arrUsd) {
        throw new TRPCError9({ code: "BAD_REQUEST", message: "Either arrUsd or originalAmount is required" });
      }
      let tier;
      if (input.tierOverride) {
        tier = input.tierOverride;
      } else {
        const allMetrics = await getMetricsForAe(aeId, 9);
        const targetDate = new Date(input.startYear, input.startMonth - 1, 1);
        const joinDate = new Date(profile.joinDate);
        const last3 = allMetrics.filter((m) => {
          const monthDate = new Date(m.year, m.month - 1, 1);
          return monthDate < targetDate && monthDate >= joinDate;
        }).slice(0, 3).map((m) => {
          const monthDate = new Date(m.year, m.month - 1, 1);
          const monthsSinceJoin = (monthDate.getFullYear() - joinDate.getFullYear()) * 12 + (monthDate.getMonth() - joinDate.getMonth());
          const arrUsd2 = monthsSinceJoin >= 0 && monthsSinceJoin < 6 ? 25e3 : Number(m.arrUsd);
          return {
            year: m.year,
            month: m.month,
            arrUsd: arrUsd2,
            demosTotal: m.demosTotal,
            dialsTotal: m.dialsTotal,
            retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null
          };
        });
        const last6 = allMetrics.filter((m) => {
          const monthDate = new Date(m.year, m.month - 1, 1);
          return monthDate < targetDate && monthDate >= joinDate;
        }).slice(0, 6).map((m) => {
          const monthDate = new Date(m.year, m.month - 1, 1);
          const monthsSinceJoin = (monthDate.getFullYear() - joinDate.getFullYear()) * 12 + (monthDate.getMonth() - joinDate.getMonth());
          const arrUsd2 = monthsSinceJoin >= 0 && monthsSinceJoin < 6 ? 25e3 : Number(m.arrUsd);
          return {
            year: m.year,
            month: m.month,
            arrUsd: arrUsd2,
            demosTotal: m.demosTotal,
            dialsTotal: m.dialsTotal,
            retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null
          };
        });
        const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3, new Date(profile.joinDate));
        const avgRetentionRate = computeAvgRetention(last6);
        const newJoiner = isNewJoiner(profile.joinDate, targetDate);
        const tierResult = calculateTier({
          avgArrUsd,
          avgDemosPw,
          avgDialsPw,
          avgRetentionRate,
          isNewJoiner: newJoiner,
          isTeamLeader: profile.isTeamLeader
        });
        tier = tierResult.tier;
      }
      const fxRate = await fetchUsdToGbpRate();
      const activeStructure = await getActiveCommissionStructure();
      const commResult = calculateCommission({
        contractType: input.contractType,
        arrUsd,
        tier,
        onboardingFeePaid: input.onboardingFeePaid,
        isReferral: input.isReferral,
        fxRateUsdToGbp: fxRate,
        monthlyPayoutMonths: activeStructure ? Number(activeStructure.monthlyPayoutMonths) : void 0,
        onboardingDeductionGbp: activeStructure ? Number(activeStructure.onboardingDeductionGbp) : void 0,
        onboardingArrReductionUsd: activeStructure ? Number(activeStructure.onboardingArrReductionUsd) : void 0
      });
      const liveRates = await getCurrentFxRates2();
      const fxRateLockedAtCreation = liveRates.GBP;
      const now = /* @__PURE__ */ new Date();
      const dealId = await createDeal({
        aeId,
        customerName: input.customerName,
        contractType: input.contractType,
        startYear: input.startYear,
        startMonth: input.startMonth,
        startDay: input.startDay,
        originalAmount: String(originalAmount),
        originalCurrency,
        arrUsd: String(arrUsd),
        conversionRate: String(conversionRate),
        onboardingFeePaid: input.onboardingFeePaid,
        isReferral: input.isReferral,
        tierAtStart: tier,
        fxRateAtEntry: String(fxRate),
        fxRateAtWon: String(fxRate),
        fxRateLockedAtCreation: String(fxRateLockedAtCreation),
        dealSignedDate: now,
        fxRateLockDate: now,
        billingFrequency: input.billingFrequency,
        commissionStructureId: activeStructure?.id ?? null,
        notes: null
      });
      const payouts = commResult.payoutSchedule.map((p, i) => {
        const payoutDate = addMonths(input.startYear, input.startMonth, i);
        return {
          dealId,
          aeId,
          payoutYear: payoutDate.year,
          payoutMonth: payoutDate.month,
          payoutNumber: p.payoutNumber,
          grossCommissionUsd: String(p.grossCommissionUsd),
          referralDeductionUsd: String(p.referralDeductionUsd),
          onboardingDeductionGbp: String(p.onboardingDeductionGbp),
          netCommissionUsd: String(p.netCommissionUsd),
          fxRateUsed: String(fxRate),
          netCommissionGbp: String(p.netCommissionGbp)
        };
      });
      await createPayoutsForDeal(payouts);
      return {
        dealId,
        tier,
        fxRate,
        commissionResult: {
          ...commResult,
          payoutSchedule: commResult.payoutSchedule
        }
      };
    }),
    // List all deals for current AE
    list: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      const dealList = await getDealsForAe(aeId);
      return dealList.map((d) => ({
        ...d,
        arrUsd: Number(d.arrUsd),
        fxRateAtEntry: Number(d.fxRateAtEntry)
      }));
    }),
    // Get payouts for a specific deal
    getPayouts: publicProcedure.input(z6.object({ dealId: z6.number().int() })).query(async ({ input, ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      const deal = await getDealById(input.dealId);
      if (!deal || deal.aeId !== aeId) throw new TRPCError9({ code: "FORBIDDEN" });
      const payouts = await getPayoutsForDeal(input.dealId);
      return payouts.map((p) => ({
        ...p,
        grossCommissionUsd: Number(p.grossCommissionUsd),
        referralDeductionUsd: Number(p.referralDeductionUsd),
        onboardingDeductionGbp: Number(p.onboardingDeductionGbp),
        netCommissionUsd: Number(p.netCommissionUsd),
        fxRateUsed: Number(p.fxRateUsed),
        netCommissionGbp: Number(p.netCommissionGbp)
      }));
    }),
    // Update deal contract type and recalculate commission
    update: publicProcedure.input(
      z6.object({
        dealId: z6.number().int(),
        contractType: z6.enum(["annual", "monthly"]).optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      const deal = await getDealById(input.dealId);
      if (!deal || deal.aeId !== aeId) throw new TRPCError9({ code: "FORBIDDEN" });
      if (input.contractType && input.contractType !== deal.contractType) {
        const db = await getDb();
        if (!db) throw new TRPCError9({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        await db.update(deals).set({ contractType: input.contractType }).where(eq5(deals.id, input.dealId));
        const activeStructure = await getActiveCommissionStructure();
        const commResult = calculateCommission({
          contractType: input.contractType,
          arrUsd: Number(deal.arrUsd),
          tier: deal.tierAtStart,
          onboardingFeePaid: deal.onboardingFeePaid,
          isReferral: deal.isReferral,
          fxRateUsdToGbp: Number(deal.fxRateAtWon ?? deal.fxRateAtEntry ?? 0.785),
          monthlyPayoutMonths: activeStructure ? Number(activeStructure.monthlyPayoutMonths) : void 0,
          onboardingDeductionGbp: activeStructure ? Number(activeStructure.onboardingDeductionGbp) : void 0,
          onboardingArrReductionUsd: activeStructure ? Number(activeStructure.onboardingArrReductionUsd) : void 0
        });
        await deletePayoutsForDeal(input.dealId);
        const payouts = commResult.payoutSchedule.map((p, i) => {
          const payoutDate = addMonths(deal.startYear, deal.startMonth, i);
          return {
            dealId: input.dealId,
            aeId,
            payoutYear: payoutDate.year,
            payoutMonth: payoutDate.month,
            payoutNumber: p.payoutNumber,
            grossCommissionUsd: p.grossCommissionUsd.toString(),
            referralDeductionUsd: p.referralDeductionUsd.toString(),
            onboardingDeductionGbp: p.onboardingDeductionGbp.toString(),
            netCommissionUsd: p.netCommissionUsd.toString(),
            fxRateUsed: (deal.fxRateAtWon ?? deal.fxRateAtEntry).toString(),
            netCommissionGbp: p.netCommissionGbp.toString()
          };
        });
        if (payouts.length > 0) {
          await createPayoutsForDeal(payouts);
        }
      }
      return { success: true };
    }),
    // Delete a deal and its payouts
    delete: publicProcedure.input(z6.object({ dealId: z6.number().int() })).mutation(async ({ input, ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      const deal = await getDealById(input.dealId);
      if (!deal || deal.aeId !== aeId) throw new TRPCError9({ code: "FORBIDDEN" });
      await deletePayoutsForDeal(input.dealId);
      await deleteDeal(input.dealId, aeId);
      return { success: true };
    }),
    markChurned: publicProcedure.input(
      z6.object({
        dealId: z6.number().int(),
        churnYear: z6.number().int(),
        churnMonth: z6.number().int().min(1).max(12),
        churnReason: z6.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      const deal = await getDealById(input.dealId);
      if (!deal || deal.aeId !== aeId) throw new TRPCError9({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError9({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.update(deals).set({
        isChurned: true,
        churnMonth: input.churnMonth,
        churnYear: input.churnYear,
        churnReason: input.churnReason || null
      }).where(eq5(deals.id, input.dealId));
      const payouts = await getPayoutsForDeal(input.dealId);
      const payoutsToDelete = payouts.filter(
        (p) => p.payoutYear > input.churnYear || p.payoutYear === input.churnYear && p.payoutMonth > input.churnMonth
      );
      for (const payout of payoutsToDelete) {
        await db.delete(commissionPayouts).where(eq5(commissionPayouts.id, payout.id));
      }
      return { success: true, payoutsDeleted: payoutsToDelete.length };
    })
  }),
  // ─── Commission Summary ─────────────────────────────────────────────────────
  commission: router({
    // Monthly summary: total commission by month
    monthlySummary: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      const allPayouts = await getPayoutsForAe(aeId);
      const allDeals = await getDealsForAe(aeId);
      const dealMap = new Map(allDeals.map((d) => [d.id, d]));
      const monthMap = /* @__PURE__ */ new Map();
      for (const p of allPayouts) {
        const key = `${p.payoutYear}-${String(p.payoutMonth).padStart(2, "0")}`;
        if (!monthMap.has(key)) {
          monthMap.set(key, {
            year: p.payoutYear,
            month: p.payoutMonth,
            totalGbp: 0,
            totalUsd: 0,
            payouts: []
          });
        }
        const entry = monthMap.get(key);
        const netGbp = Number(p.netCommissionGbp);
        const netUsd = Number(p.netCommissionUsd);
        entry.totalGbp += netGbp;
        entry.totalUsd += netUsd;
        const deal = dealMap.get(p.dealId);
        entry.payouts.push({
          dealId: p.dealId,
          customerName: deal?.customerName ?? "Unknown",
          netCommissionGbp: netGbp,
          netCommissionUsd: netUsd,
          payoutNumber: p.payoutNumber,
          tier: deal?.tierAtStart ?? "bronze"
        });
      }
      return Array.from(monthMap.values()).sort(
        (a, b) => b.year * 100 + b.month - (a.year * 100 + a.month)
      );
    }),
    // Get live FX rate
    fxRate: publicProcedure.query(async () => {
      const rateGbp = await fetchUsdToGbpRate();
      const rates = await fetchLiveRates();
      const rateEur = rates.EUR ? 1 / rates.EUR : 0.8656;
      return { usdToGbp: rateGbp, usdToEur: rateEur, fetchedAt: (/* @__PURE__ */ new Date()).toISOString() };
    }),
    // Payout calendar: all payouts grouped by month, split into past/current/future
    payoutCalendar: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) {
        throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      }
      const payouts = await getPayoutsForAe(aeId);
      const allDeals = await getDealsForAe(aeId);
      const dealMap = new Map(allDeals.map((d) => [d.id, d]));
      const now = /* @__PURE__ */ new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const monthMap = /* @__PURE__ */ new Map();
      for (const p of payouts) {
        const key = `${p.payoutYear}-${String(p.payoutMonth).padStart(2, "0")}`;
        if (!monthMap.has(key)) {
          const yr = p.payoutYear;
          const mo = p.payoutMonth;
          let status;
          if (yr < currentYear || yr === currentYear && mo < currentMonth) {
            status = "past";
          } else if (yr === currentYear && mo === currentMonth) {
            status = "current";
          } else {
            status = "future";
          }
          monthMap.set(key, { year: yr, month: mo, totalGbp: 0, status, payouts: [] });
        }
        const entry = monthMap.get(key);
        const netGbp = Number(p.netCommissionGbp);
        entry.totalGbp += netGbp;
        const deal = dealMap.get(p.dealId);
        const dealPayoutCount = payouts.filter((pp) => pp.dealId === p.dealId).length;
        entry.payouts.push({
          dealId: p.dealId,
          customerName: deal?.customerName ?? "Unknown",
          contractType: deal?.contractType ?? "monthly",
          tierAtStart: deal?.tierAtStart ?? "bronze",
          netCommissionGbp: netGbp,
          payoutNumber: p.payoutNumber,
          totalPayouts: dealPayoutCount,
          isReferral: deal?.isReferral ?? false,
          onboardingFeePaid: deal?.onboardingFeePaid ?? true
        });
      }
      const sorted = Array.from(monthMap.values()).sort(
        (a, b) => a.year * 100 + a.month - (b.year * 100 + b.month)
      );
      let runningTotal = 0;
      const withRunning = sorted.map((m) => {
        if (m.status !== "past") runningTotal += m.totalGbp;
        return { ...m, runningFutureTotal: runningTotal };
      });
      return {
        months: withRunning,
        totalFutureGbp: sorted.filter((m) => m.status === "future" || m.status === "current").reduce((sum, m) => sum + m.totalGbp, 0),
        totalPastGbp: sorted.filter((m) => m.status === "past").reduce((sum, m) => sum + m.totalGbp, 0),
        currentMonthGbp: sorted.filter((m) => m.status === "current").reduce((sum, m) => sum + m.totalGbp, 0)
      };
    }),
    // Resync all payouts from scratch (team leader only)
    resyncAllPayouts: publicProcedure.mutation(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not authenticated" });
      return resyncAllPayouts(aeId);
    })
  }),
  // --- Spreadsheet Sync ────────────────────────────────────────────────────
  spreadsheetSync: spreadsheetSyncRouter,
  pipedriveSync: pipedriveSyncRouter,
  voipSync: voipSyncRouter,
  // ─── Data Audit ───────────────────────────────────────────────────────────
  dataAudit: router({
    /**
     * Returns all monthly metrics for all AEs, grouped by AE.
     * Team leader only. Used for the data audit view.
     */
    allMetrics: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const profile = await getAeProfileById(aeId);
      if (!profile?.isTeamLeader) {
        throw new TRPCError9({ code: "FORBIDDEN", message: "Team leader access required." });
      }
      const allProfiles = await getAllAeProfiles();
      const result = await Promise.all(
        allProfiles.map(async (ae) => {
          const metrics = await getMetricsForAe(ae.id, 24);
          return {
            aeId: ae.id,
            aeName: ae.name,
            joinDate: ae.joinDate,
            isTeamLeader: ae.isTeamLeader,
            metrics: metrics.map((m) => ({
              year: m.year,
              month: m.month,
              arrUsd: Number(m.arrUsd),
              demosTotal: m.demosTotal,
              demosFromPipedrive: m.demosFromPipedrive,
              dialsTotal: m.dialsTotal,
              retentionRate: m.retentionRate != null ? Number(m.retentionRate) : null,
              connectedDials: m.connectedDials ?? 0,
              connectionRate: m.connectionRate != null ? Number(m.connectionRate) : null,
              talkTimeSecs: m.talkTimeSecs ?? 0
            }))
          };
        })
      );
      return result;
    })
  }),
  // ─── Commission Structure Management ──────────────────────────────────────
  commissionStructure: router({
    // List all versions
    list: publicProcedure.query(async () => {
      const structures = await getAllCommissionStructures();
      return structures.map((s) => ({
        ...s,
        bronzeRate: Number(s.bronzeRate),
        silverRate: Number(s.silverRate),
        goldRate: Number(s.goldRate),
        onboardingDeductionGbp: Number(s.onboardingDeductionGbp),
        onboardingArrReductionUsd: Number(s.onboardingArrReductionUsd),
        standardTargets: s.standardTargets,
        teamLeaderTargets: s.teamLeaderTargets
      }));
    }),
    // Get the currently active version
    getActive: publicProcedure.query(async () => {
      const s = await getActiveCommissionStructure();
      if (!s) return null;
      return {
        ...s,
        bronzeRate: Number(s.bronzeRate),
        silverRate: Number(s.silverRate),
        goldRate: Number(s.goldRate),
        onboardingDeductionGbp: Number(s.onboardingDeductionGbp),
        onboardingArrReductionUsd: Number(s.onboardingArrReductionUsd),
        standardTargets: s.standardTargets,
        teamLeaderTargets: s.teamLeaderTargets
      };
    }),
    // Create a new version (draft, not yet active) — team leader only
    create: publicProcedure.input(
      z6.object({
        versionLabel: z6.string().min(1).max(128),
        effectiveFrom: z6.string(),
        // ISO date string
        bronzeRate: z6.number().min(0).max(1),
        silverRate: z6.number().min(0).max(1),
        goldRate: z6.number().min(0).max(1),
        standardTargets: z6.object({
          silver: z6.object({ arrUsd: z6.number(), demosPw: z6.number(), dialsPw: z6.number(), retentionMin: z6.number() }),
          gold: z6.object({ arrUsd: z6.number(), demosPw: z6.number(), dialsPw: z6.number(), retentionMin: z6.number() })
        }),
        teamLeaderTargets: z6.object({
          silver: z6.object({ arrUsd: z6.number(), demosPw: z6.number(), dialsPw: z6.number(), retentionMin: z6.number() }),
          gold: z6.object({ arrUsd: z6.number(), demosPw: z6.number(), dialsPw: z6.number(), retentionMin: z6.number() })
        }),
        monthlyPayoutMonths: z6.number().int().min(1).max(60).default(13),
        onboardingDeductionGbp: z6.number().min(0),
        onboardingArrReductionUsd: z6.number().min(0),
        notes: z6.string().optional(),
        createdBy: z6.string().min(1).max(128).default("admin")
      })
    ).mutation(async ({ input, ctx }) => {
      const callerId = getAeIdFromCtx(ctx);
      if (!callerId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      const caller = await getAeProfileById(callerId);
      if (!caller?.isTeamLeader) throw new TRPCError9({ code: "FORBIDDEN", message: "Team leader access required." });
      const id = await createCommissionStructure({
        versionLabel: input.versionLabel,
        effectiveFrom: new Date(input.effectiveFrom),
        isActive: false,
        bronzeRate: String(input.bronzeRate),
        silverRate: String(input.silverRate),
        goldRate: String(input.goldRate),
        standardTargets: input.standardTargets,
        teamLeaderTargets: input.teamLeaderTargets,
        monthlyPayoutMonths: input.monthlyPayoutMonths,
        onboardingDeductionGbp: String(input.onboardingDeductionGbp),
        onboardingArrReductionUsd: String(input.onboardingArrReductionUsd),
        notes: input.notes ?? null,
        createdBy: input.createdBy
      });
      return { id };
    }),
    // Update a draft version (cannot edit active version's rates — create a new one) — team leader only
    update: publicProcedure.input(
      z6.object({
        id: z6.number().int(),
        versionLabel: z6.string().min(1).max(128).optional(),
        effectiveFrom: z6.string().optional(),
        bronzeRate: z6.number().min(0).max(1).optional(),
        silverRate: z6.number().min(0).max(1).optional(),
        goldRate: z6.number().min(0).max(1).optional(),
        standardTargets: z6.object({
          silver: z6.object({ arrUsd: z6.number(), demosPw: z6.number(), dialsPw: z6.number(), retentionMin: z6.number() }),
          gold: z6.object({ arrUsd: z6.number(), demosPw: z6.number(), dialsPw: z6.number(), retentionMin: z6.number() })
        }).optional(),
        teamLeaderTargets: z6.object({
          silver: z6.object({ arrUsd: z6.number(), demosPw: z6.number(), dialsPw: z6.number(), retentionMin: z6.number() }),
          gold: z6.object({ arrUsd: z6.number(), demosPw: z6.number(), dialsPw: z6.number(), retentionMin: z6.number() })
        }).optional(),
        monthlyPayoutMonths: z6.number().int().min(1).max(60).optional(),
        onboardingDeductionGbp: z6.number().min(0).optional(),
        onboardingArrReductionUsd: z6.number().min(0).optional(),
        notes: z6.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const callerId = getAeIdFromCtx(ctx);
      if (!callerId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      const caller = await getAeProfileById(callerId);
      if (!caller?.isTeamLeader) throw new TRPCError9({ code: "FORBIDDEN", message: "Team leader access required." });
      const {
        id,
        effectiveFrom,
        bronzeRate,
        silverRate,
        goldRate,
        onboardingDeductionGbp,
        onboardingArrReductionUsd,
        ...rest
      } = input;
      const patch = { ...rest };
      if (effectiveFrom) patch.effectiveFrom = new Date(effectiveFrom);
      if (bronzeRate !== void 0) patch.bronzeRate = String(bronzeRate);
      if (silverRate !== void 0) patch.silverRate = String(silverRate);
      if (goldRate !== void 0) patch.goldRate = String(goldRate);
      if (onboardingDeductionGbp !== void 0) patch.onboardingDeductionGbp = String(onboardingDeductionGbp);
      if (onboardingArrReductionUsd !== void 0) patch.onboardingArrReductionUsd = String(onboardingArrReductionUsd);
      await updateCommissionStructure(id, patch);
      return { success: true };
    }),
    // Activate a version (deactivates all others) — team leader only
    activate: publicProcedure.input(z6.object({ id: z6.number().int() })).mutation(async ({ input, ctx }) => {
      const callerId = getAeIdFromCtx(ctx);
      if (!callerId) throw new TRPCError9({ code: "UNAUTHORIZED", message: "Not logged in." });
      const caller = await getAeProfileById(callerId);
      if (!caller?.isTeamLeader) throw new TRPCError9({ code: "FORBIDDEN", message: "Team leader access required." });
      const structure = await getCommissionStructureById(input.id);
      if (!structure) throw new TRPCError9({ code: "NOT_FOUND", message: "Commission structure not found." });
      await activateCommissionStructure(input.id);
      return { success: true, activatedId: input.id };
    }),
    // Get current live FX rates
    getCurrentFxRates: publicProcedure.query(async () => {
      const { getCurrentFxRates: getCurrentFxRates2 } = await Promise.resolve().then(() => (init_fxService(), fxService_exports));
      const rates = await getCurrentFxRates2();
      return {
        usd: rates.USD,
        eur: Number(rates.EUR.toFixed(6)),
        gbp: Number(rates.GBP.toFixed(6)),
        timestamp: rates.timestamp
      };
    }),
    // Get FX rate for a specific deal (locked rate + current rate for comparison)
    dealFxInfo: publicProcedure.input(z6.object({ dealId: z6.number() })).query(async ({ input, ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError9({ code: "UNAUTHORIZED" });
      const deal = await getDealById(input.dealId);
      if (!deal) throw new TRPCError9({ code: "NOT_FOUND" });
      if (deal.aeId !== aeId) throw new TRPCError9({ code: "FORBIDDEN" });
      const { getCurrentFxRates: getCurrentFxRates2 } = await Promise.resolve().then(() => (init_fxService(), fxService_exports));
      const currentRates = await getCurrentFxRates2();
      const { formatPayoutInfo: formatPayoutInfo2 } = await Promise.resolve().then(() => (init_lockedFxPayoutHelper(), lockedFxPayoutHelper_exports));
      const lockedRate = Number(deal.fxRateLockedAtCreation || deal.fxRateAtEntry);
      const formatted = formatPayoutInfo2(deal, lockedRate, currentRates.GBP);
      return formatted;
    }),
    // Get team commissions for a specific month (admin only)
    teamCommissions: publicProcedure.input(z6.object({ month: z6.number().min(1).max(12), year: z6.number().min(2020).max(2100) })).query(async ({ input, ctx }) => {
      const callerId = getAeIdFromCtx(ctx);
      if (!callerId) throw new TRPCError9({ code: "UNAUTHORIZED" });
      const caller = await getAeProfileById(callerId);
      if (!caller?.isTeamLeader) throw new TRPCError9({ code: "FORBIDDEN" });
      const allAes = await getAllAeProfiles();
      const teamMemberIds = allAes.map((ae) => ae.id);
      if (teamMemberIds.length === 0) {
        return { commissions: [] };
      }
      const db = await getDb();
      if (!db) throw new TRPCError9({ code: "INTERNAL_SERVER_ERROR" });
      const payouts = await db.select().from(commissionPayouts).where(
        and3(
          inArray(commissionPayouts.aeId, teamMemberIds),
          eq5(commissionPayouts.payoutYear, input.year),
          eq5(commissionPayouts.payoutMonth, input.month)
        )
      );
      const allDeals = await db.select().from(deals);
      const dealMap = new Map(allDeals.map((d) => [d.id, d]));
      const commissionsByAe = /* @__PURE__ */ new Map();
      for (const payout of payouts) {
        const ae = allAes.find((m) => m.id === payout.aeId);
        if (!ae) continue;
        if (!commissionsByAe.has(payout.aeId)) {
          commissionsByAe.set(payout.aeId, {
            aeId: payout.aeId,
            aeName: ae.name,
            dealCount: 0,
            payoutCount: 0,
            totalNetGbp: 0,
            totalNetUsd: 0,
            payouts: []
          });
        }
        const entry = commissionsByAe.get(payout.aeId);
        const deal = dealMap.get(payout.dealId);
        const netGbp = Number(payout.netCommissionGbp);
        const netUsd = Number(payout.netCommissionUsd);
        entry.totalNetGbp += netGbp;
        entry.totalNetUsd += netUsd;
        entry.payoutCount += 1;
        entry.payouts.push({
          customerName: deal?.customerName ?? "Unknown",
          payoutNumber: payout.payoutNumber,
          tier: deal?.tierAtStart ?? "unknown",
          netCommissionGbp: netGbp,
          netCommissionUsd: netUsd
        });
      }
      const commissionsWithTier = await Promise.all(
        Array.from(commissionsByAe.values()).map(async (c) => {
          const aeProfile = allAes.find((m) => m.id === c.aeId);
          let currentTier = "bronze";
          try {
            if (aeProfile) {
              const last3Months = await getMetricsForAe(c.aeId, 3);
              const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(
                last3Months,
                new Date(aeProfile.joinDate)
              );
              const tierResult = calculateTier({
                avgArrUsd,
                avgDemosPw,
                avgDialsPw,
                avgRetentionRate: null,
                isNewJoiner: false,
                isTeamLeader: aeProfile.isTeamLeader
              });
              currentTier = tierResult.tier;
            }
          } catch {
          }
          return {
            ...c,
            dealCount: new Set(c.payouts.map((p) => p.customerName)).size,
            totalNetGbp: Number(c.totalNetGbp.toFixed(2)),
            totalNetUsd: Number(c.totalNetUsd.toFixed(2)),
            currentTier
          };
        })
      );
      return { commissions: commissionsWithTier };
    }),
    sendMonthlyTierReport: protectedProcedure.input(
      z6.object({
        reportMonth: z6.number().min(1).max(12),
        reportYear: z6.number().min(2020)
      })
    ).mutation(async ({ ctx, input }) => {
      const callerId = getAeIdFromCtx(ctx);
      if (!callerId) throw new TRPCError9({ code: "UNAUTHORIZED" });
      const caller = await getAeProfileById(callerId);
      if (!caller?.isTeamLeader) throw new TRPCError9({ code: "FORBIDDEN" });
      const { sendTierReportEmail: sendTierReportEmail2, calculateTier: calcTier, getTierRate: getTierRate2 } = await Promise.resolve().then(() => (init_tierReportEmailService(), tierReportEmailService_exports));
      const { reportMonth, reportYear } = input;
      let previousMonth = reportMonth - 1;
      let previousYear = reportYear;
      if (previousMonth < 1) {
        previousMonth = 12;
        previousYear -= 1;
      }
      const aeCommissions = await getAllAeProfiles();
      const tierData = [];
      for (const ae of aeCommissions) {
        const currentMonthPayouts = await getPayoutsForMonth(ae.id, reportMonth, reportYear);
        const currentCommission = currentMonthPayouts.reduce(
          (sum, p) => sum + (p.netCommissionGbp || 0),
          0
        );
        const previousMonthPayouts = await getPayoutsForMonth(
          ae.id,
          previousMonth,
          previousYear
        );
        const previousCommission = previousMonthPayouts.reduce(
          (sum, p) => sum + (p.netCommissionGbp || 0),
          0
        );
        const currentTier = calcTier(currentCommission);
        const previousTier = calcTier(previousCommission);
        tierData.push({
          id: ae.id,
          name: ae.name,
          currentTier,
          currentRate: getTierRate2(currentTier),
          previousTier,
          previousRate: getTierRate2(previousTier),
          totalCommissionGbp: currentCommission,
          dealCount: currentMonthPayouts.length
        });
      }
      const emailSent = await sendTierReportEmail2(
        tierData,
        reportMonth,
        reportYear,
        previousMonth,
        previousYear
      );
      if (!emailSent) {
        throw new TRPCError9({ code: "INTERNAL_SERVER_ERROR", message: "Failed to send tier report" });
      }
      return {
        success: true,
        message: `Tier report sent for ${reportMonth}/${reportYear}`,
        aeCount: tierData.length
      };
    }),
    // ─── Tier Change Notifications ─────────────────────────────────────────
    // Manual trigger for tier change check (team leaders only)
    checkTierChanges: protectedProcedure.input(
      z6.object({
        month: z6.number().min(1).max(12).optional(),
        year: z6.number().min(2020).max(2100).optional()
      }).optional()
    ).mutation(async ({ ctx, input }) => {
      const callerId = getAeIdFromCtx(ctx);
      if (!callerId) throw new TRPCError9({ code: "UNAUTHORIZED" });
      const caller = await getAeProfileById(callerId);
      if (!caller?.isTeamLeader) throw new TRPCError9({ code: "FORBIDDEN", message: "Only team leaders can trigger tier change checks" });
      const { checkAndNotifyTierChanges: checkAndNotifyTierChanges2 } = await Promise.resolve().then(() => (init_tierChangeNotifier(), tierChangeNotifier_exports));
      const results = await checkAndNotifyTierChanges2(input?.month, input?.year);
      return {
        success: true,
        results,
        notificationsSent: results.filter((r) => r.notificationSent).length,
        changesDetected: results.filter((r) => !r.skipped).length,
        totalChecked: results.length
      };
    }),
    // Get notification history for the current AE
    myNotificationHistory: protectedProcedure.input(z6.object({ limit: z6.number().min(1).max(50).default(10) }).optional()).query(async ({ ctx, input }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError9({ code: "UNAUTHORIZED" });
      const { getNotificationHistory: getNotificationHistory2 } = await Promise.resolve().then(() => (init_tierChangeNotifier(), tierChangeNotifier_exports));
      return getNotificationHistory2(aeId, input?.limit ?? 10);
    }),
    // Get all recent notifications (team leaders only)
    allNotificationHistory: protectedProcedure.input(z6.object({ limit: z6.number().min(1).max(100).default(50) }).optional()).query(async ({ ctx, input }) => {
      const callerId = getAeIdFromCtx(ctx);
      if (!callerId) throw new TRPCError9({ code: "UNAUTHORIZED" });
      const caller = await getAeProfileById(callerId);
      if (!caller?.isTeamLeader) throw new TRPCError9({ code: "FORBIDDEN" });
      const { getAllRecentNotifications: getAllRecentNotifications2 } = await Promise.resolve().then(() => (init_tierChangeNotifier(), tierChangeNotifier_exports));
      return getAllRecentNotifications2(input?.limit ?? 50);
    }),
    // Tier forecast: 3-month projection with actionable targets
    tierForecast: publicProcedure.query(async ({ ctx }) => {
      const aeId = getAeIdFromCtx(ctx);
      if (!aeId) throw new TRPCError9({ code: "UNAUTHORIZED" });
      const ae = await getAeProfileById(aeId);
      if (!ae) throw new TRPCError9({ code: "NOT_FOUND", message: "AE not found" });
      const last3Months = await getMetricsForAe(aeId, 3);
      const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3Months, new Date(ae.joinDate));
      const tierResult = calculateTier({
        avgArrUsd,
        avgDemosPw,
        avgDialsPw,
        avgRetentionRate: null,
        isNewJoiner: isNewJoiner(ae.joinDate),
        isTeamLeader: ae.isTeamLeader
      });
      const { calculateTierForecast: calculateTierForecast2 } = await Promise.resolve().then(() => (init_tierForecastHelper(), tierForecastHelper_exports));
      const forecast = calculateTierForecast2(
        tierResult.tier,
        {
          arrUsd: avgArrUsd,
          demosPw: avgDemosPw,
          dialsPw: avgDialsPw
        },
        ae.isTeamLeader,
        0.05
      );
      return forecast;
    })
  }),
  // ─── Admin Utilities ─────────────────────────────────────────────────────
  validation: validationRouter,
  demo: demoRouter,
  admin: router({
    fixCAxisMonth: publicProcedure.mutation(async ({ ctx }) => {
      const callerId = getAeIdFromCtx(ctx);
      if (!callerId) throw new TRPCError9({ code: "UNAUTHORIZED" });
      const caller = await getAeProfileById(callerId);
      if (!caller?.isTeamLeader) throw new TRPCError9({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError9({ code: "INTERNAL_SERVER_ERROR" });
      const cAxisDeal = await db.select().from(deals).where(like(deals.customerName, "%C-Axis%")).limit(1);
      if (cAxisDeal.length === 0) return { success: false, message: "C-Axis deal not found" };
      const deal = cAxisDeal[0];
      if (deal.startMonth !== 2) {
        await db.update(deals).set({ startMonth: 2 }).where(eq5(deals.id, deal.id));
        return { success: true, message: `Updated C-Axis from month ${deal.startMonth} to February (2)` };
      }
      return { success: true, message: "C-Axis already in February" };
    }),
    recalculateAllTiers: publicProcedure.mutation(async ({ ctx }) => {
      const callerId = getAeIdFromCtx(ctx);
      if (!callerId) throw new TRPCError9({ code: "UNAUTHORIZED" });
      const caller = await getAeProfileById(callerId);
      if (!caller?.isTeamLeader) throw new TRPCError9({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError9({ code: "INTERNAL_SERVER_ERROR" });
      const allDeals = await db.select().from(deals);
      let updated = 0;
      for (const deal of allDeals) {
        const metrics = await getMetricsForAe(deal.aeId);
        const targetDate = new Date(deal.startYear, deal.startMonth - 1, 1);
        const last3 = metrics.filter((m) => {
          const d = new Date(m.year, m.month - 1, 1);
          return d < targetDate;
        }).slice(0, 3);
        if (last3.length > 0) {
          const profile = await getAeProfileById(deal.aeId);
          const { avgArrUsd, avgDemosPw, avgDialsPw } = computeRollingAverages(last3, profile?.joinDate ? new Date(profile.joinDate) : null);
          const avgRetention = computeAvgRetention(last3);
          const newJoiner = isNewJoiner(profile?.joinDate || /* @__PURE__ */ new Date(), targetDate);
          const tier = calculateTier({
            avgArrUsd,
            avgDemosPw,
            avgDialsPw,
            avgRetentionRate: avgRetention,
            isNewJoiner: newJoiner,
            isTeamLeader: profile?.isTeamLeader || false
          });
          if (tier.tier !== deal.tierAtStart) {
            await db.update(deals).set({ tierAtStart: tier.tier }).where(eq5(deals.id, deal.id));
            updated++;
          }
        }
      }
      return { success: true, message: `Recalculated ${updated} deal tiers` };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/tierReportScheduler.ts
init_tierReportEmailService();
init_db();
import * as cron3 from "node-cron";
var scheduledJob2 = null;
function initializeTierReportScheduler() {
  if (scheduledJob2) {
    console.log("[TierReportScheduler] Scheduler already initialized");
    return;
  }
  const cronExpression = "0 9 10 * *";
  scheduledJob2 = cron3.schedule(cronExpression, async () => {
    console.log("[TierReportScheduler] Running monthly tier report at", (/* @__PURE__ */ new Date()).toISOString());
    await sendMonthlyTierReportJob();
  });
  console.log("[TierReportScheduler] Initialized - will run at 9 AM GMT on the 10th of each month");
}
async function sendMonthlyTierReportJob() {
  try {
    const db = await getDb();
    if (!db) {
      console.error("[TierReportScheduler] Database connection failed");
      return;
    }
    const now = /* @__PURE__ */ new Date();
    let reportMonth = now.getMonth();
    let reportYear = now.getFullYear();
    reportMonth = reportMonth + 1;
    let previousMonth = reportMonth - 1;
    let previousYear = reportYear;
    if (previousMonth < 1) {
      previousMonth = 12;
      previousYear -= 1;
    }
    console.log(
      `[TierReportScheduler] Generating report for ${previousMonth}/${previousYear}`
    );
    const aeCommissions = await db.query.aeProfiles.findMany({
      columns: {
        id: true,
        name: true,
        tier: true
      }
    });
    const tierData = [];
    let comparisonMonth = previousMonth - 1;
    let comparisonYear = previousYear;
    if (comparisonMonth < 1) {
      comparisonMonth = 12;
      comparisonYear -= 1;
    }
    for (const ae of aeCommissions) {
      const currentMonthPayouts = await db.query.commissionPayouts.findMany({
        where: (payouts, { eq: eq6, and: and4 }) => and4(
          eq6(payouts.aeId, ae.id),
          eq6(payouts.payoutMonth, previousMonth),
          eq6(payouts.payoutYear, previousYear)
        )
      });
      const currentCommission = currentMonthPayouts.reduce(
        (sum, p) => sum + (p.netCommissionGbp || 0),
        0
      );
      const previousMonthPayouts = await db.query.commissionPayouts.findMany({
        where: (payouts, { eq: eq6, and: and4 }) => and4(
          eq6(payouts.aeId, ae.id),
          eq6(payouts.payoutMonth, comparisonMonth),
          eq6(payouts.payoutYear, comparisonYear)
        )
      });
      const previousCommission = previousMonthPayouts.reduce(
        (sum, p) => sum + (p.netCommissionGbp || 0),
        0
      );
      const currentTier = calculateTier2(currentCommission);
      const previousTier = calculateTier2(previousCommission);
      tierData.push({
        id: ae.id,
        name: ae.name,
        currentTier,
        currentRate: getTierRate(currentTier),
        previousTier,
        previousRate: getTierRate(previousTier),
        totalCommissionGbp: currentCommission,
        dealCount: currentMonthPayouts.length
      });
    }
    const emailSent = await sendTierReportEmail(
      tierData,
      previousMonth,
      previousYear,
      comparisonMonth,
      comparisonYear
    );
    if (emailSent) {
      console.log(
        `[TierReportScheduler] Successfully sent tier report for ${previousMonth}/${previousYear}`
      );
    } else {
      console.error(
        `[TierReportScheduler] Failed to send tier report for ${previousMonth}/${previousYear}`
      );
    }
  } catch (error) {
    console.error("[TierReportScheduler] Error in sendMonthlyTierReportJob:", error);
  }
}

// server/tierChangeScheduler.ts
init_tierChangeNotifier();
import * as cron4 from "node-cron";
var scheduledJob3 = null;
function initializeTierChangeScheduler() {
  if (scheduledJob3) {
    console.log("[TierChangeScheduler] Scheduler already initialized");
    return;
  }
  const cronExpression = "5 8 * * *";
  scheduledJob3 = cron4.schedule(cronExpression, async () => {
    console.log("[TierChangeScheduler] Running tier change check at", (/* @__PURE__ */ new Date()).toISOString());
    await runTierChangeCheck();
  });
  console.log("[TierChangeScheduler] Initialized \u2014 will run at 08:05 AM GMT every day");
}
async function runTierChangeCheck() {
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

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
  startWeeklySyncScheduler();
  initializeTierReportScheduler();
  initializeDemoDetectionScheduler();
  initializeTierChangeScheduler();
}
startServer().catch(console.error);
