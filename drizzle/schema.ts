import {
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── Core auth users (Manus OAuth) ───────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── AE Profiles (PIN-based, no OAuth required) ──────────────────────────────
export const aeProfiles = mysqlTable("ae_profiles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  pinHash: varchar("pinHash", { length: 256 }).notNull(),
  joinDate: timestamp("joinDate").notNull(),
  isTeamLeader: boolean("isTeamLeader").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AeProfile = typeof aeProfiles.$inferSelect;
export type InsertAeProfile = typeof aeProfiles.$inferInsert;

// ─── Monthly Activity Metrics ─────────────────────────────────────────────────
// One row per AE per calendar month. Used to compute 3-month rolling averages.
export const monthlyMetrics = mysqlTable("monthly_metrics", {
  id: int("id").autoincrement().primaryKey(),
  aeId: int("aeId").notNull(),
  // Year + month stored as integers for easy querying (e.g. year=2026, month=3)
  year: int("year").notNull(),
  month: int("month").notNull(), // 1–12
  arrUsd: decimal("arrUsd", { precision: 12, scale: 2 }).notNull().default("0"),
  demosTotal: int("demosTotal").notNull().default(0),
  dialsTotal: int("dialsTotal").notNull().default(0),
  retentionRate: decimal("retentionRate", { precision: 5, scale: 2 }), // % e.g. 71.50
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MonthlyMetric = typeof monthlyMetrics.$inferSelect;
export type InsertMonthlyMetric = typeof monthlyMetrics.$inferInsert;

// ─── Deals ────────────────────────────────────────────────────────────────────
export const deals = mysqlTable("deals", {
  id: int("id").autoincrement().primaryKey(),
  aeId: int("aeId").notNull(),
  customerName: varchar("customerName", { length: 256 }).notNull(),
  contractType: mysqlEnum("contractType", ["annual", "monthly"]).notNull(),
  // Contract start date (determines which tier applies)
  startYear: int("startYear").notNull(),
  startMonth: int("startMonth").notNull(), // 1–12
  startDay: int("startDay").notNull(),
  arrUsd: decimal("arrUsd", { precision: 12, scale: 2 }).notNull(),
  onboardingFeePaid: boolean("onboardingFeePaid").default(true).notNull(),
  isReferral: boolean("isReferral").default(false).notNull(),
  // Tier locked at the time the contract started
  tierAtStart: mysqlEnum("tierAtStart", ["bronze", "silver", "gold"]).notNull(),
  // Snapshot of FX rate at time of deal entry (USD→GBP)
  fxRateAtEntry: decimal("fxRateAtEntry", { precision: 10, scale: 6 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Deal = typeof deals.$inferSelect;
export type InsertDeal = typeof deals.$inferInsert;

// ─── Commission Payouts ───────────────────────────────────────────────────────
// One row per deal per payout month (up to 13 rows for monthly contracts, 1 for annual)
export const commissionPayouts = mysqlTable("commission_payouts", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),
  aeId: int("aeId").notNull(),
  // The month this payout is for
  payoutYear: int("payoutYear").notNull(),
  payoutMonth: int("payoutMonth").notNull(), // 1–12
  payoutNumber: int("payoutNumber").notNull(), // 1 = first payout, up to 13
  grossCommissionUsd: decimal("grossCommissionUsd", { precision: 12, scale: 2 }).notNull(),
  // Deductions
  referralDeductionUsd: decimal("referralDeductionUsd", { precision: 12, scale: 2 }).default("0").notNull(),
  onboardingDeductionGbp: decimal("onboardingDeductionGbp", { precision: 10, scale: 2 }).default("0").notNull(),
  // Final amounts
  netCommissionUsd: decimal("netCommissionUsd", { precision: 12, scale: 2 }).notNull(),
  fxRateUsed: decimal("fxRateUsed", { precision: 10, scale: 6 }).notNull(),
  netCommissionGbp: decimal("netCommissionGbp", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CommissionPayout = typeof commissionPayouts.$inferSelect;
export type InsertCommissionPayout = typeof commissionPayouts.$inferInsert;
