import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  unique,
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

// ─── Commission Structure Versions ──────────────────────────────────────────
// Each row is a versioned snapshot of the full tier threshold + rate config.
// The active version is used for new deals; historical deals reference their own version.
export const commissionStructures = mysqlTable("commission_structures", {
  id: int("id").autoincrement().primaryKey(),
  versionLabel: varchar("versionLabel", { length: 128 }).notNull(), // e.g. "Q1 2026"
  effectiveFrom: timestamp("effectiveFrom").notNull(), // when this version takes effect
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CommissionStructure = typeof commissionStructures.$inferSelect;
export type InsertCommissionStructure = typeof commissionStructures.$inferInsert;

// ─── AE Profiles (PIN-based, no OAuth required) ──────────────────────────────
export const aeProfiles = mysqlTable("ae_profiles", {
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
  demosTotal: int("demosTotal").notNull().default(0), // from spreadsheet
  demosFromPipedrive: int("demosFromPipedrive").notNull().default(0),
  dialsTotal: int("dialsTotal").notNull().default(0),
  retentionRate: decimal("retentionRate", { precision: 5, scale: 2 }), // % e.g. 71.50
  // VOIP Studio metrics
  connectedDials: int("connectedDials").default(0),
  connectionRate: decimal("connectionRate", { precision: 5, scale: 2 }), // % e.g. 74.60
  talkTimeSecs: int("talkTimeSecs").default(0), // total connected talk time in seconds
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // Enforce one row per AE per calendar month — prevents duplicate inserts from VOIP + Pipedrive syncs
  aeMonthUnique: unique("ae_month_unique").on(t.aeId, t.year, t.month),
}));

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
  churnMonth: int("churnMonth"), // 1–12, null if not churned
  churnYear: int("churnYear"), // null if not churned
  churnReason: text("churnReason"), // optional reason for churn
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

// ─── Pipedrive Demo Activities ───────────────────────────────────────────────
// Stores individual demo activities synced from Pipedrive for audit purposes
export const pipedriveDemoActivities = mysqlTable("pipedrive_demo_activities", {
  id: int("id").autoincrement().primaryKey(),
  aeId: int("aeId").notNull(),
  pipedriveActivityId: varchar("pipedriveActivityId", { length: 128 }).notNull().unique(),
  subject: varchar("subject", { length: 512 }).notNull(), // Activity subject / deal name
  orgName: varchar("orgName", { length: 256 }), // Organisation name from Pipedrive
  dealId: int("dealId"), // Linked Pipedrive deal ID (if any)
  dealTitle: varchar("dealTitle", { length: 512 }), // Linked deal title
  doneDate: timestamp("doneDate").notNull(), // When marked done
  year: int("year").notNull(),
  month: int("month").notNull(),
  isValid: boolean("isValid").default(true).notNull(), // false if flagged as duplicate/hygiene
  flagReason: varchar("flagReason", { length: 128 }), // 'duplicate' | 'no_deal_link' | etc.
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  aeMonthIdx: index("pdemo_ae_month_idx").on(t.aeId, t.year, t.month),
}));

export type PipedriveDemoActivity = typeof pipedriveDemoActivities.$inferSelect;
export type InsertPipedriveDemoActivity = typeof pipedriveDemoActivities.$inferInsert;

// ─── Duplicate Demo Flags ──────────────────────────────────────────────────────
// Tracks demos that are duplicates within 6 months of the same organization
export const duplicateDemoFlags = mysqlTable("duplicate_demo_flags", {
  id: int("id").autoincrement().primaryKey(),
  aeId: int("aeId").notNull(),
  pipedriveActivityId: varchar("pipedriveActivityId", { length: 128 }).notNull().unique(),
  organizationId: int("organizationId"), // Pipedrive organization ID
  organizationName: varchar("organizationName", { length: 256 }).notNull(),
  demoDate: timestamp("demoDate").notNull(), // When the demo was marked done
  isDuplicate: boolean("isDuplicate").default(false).notNull(), // true if duplicate within 6 months
  isAcknowledged: boolean("isAcknowledged").default(false).notNull(), // AE has seen the flag
  acknowledgedAt: timestamp("acknowledgedAt"),
  notes: text("notes"), // Explanation of why it's flagged
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DuplicateDemoFlag = typeof duplicateDemoFlags.$inferSelect;
export type InsertDuplicateDemoFlag = typeof duplicateDemoFlags.$inferInsert;

// ─── CRM Hygiene Issues ────────────────────────────────────────────────────────
// Tracks demos that are not properly linked to deals (bad CRM hygiene)
export const crmHygieneIssues = mysqlTable("crm_hygiene_issues", {
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
  explanation: text("explanation"), // Why this is a hygiene issue
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CrmHygieneIssue = typeof crmHygieneIssues.$inferSelect;
export type InsertCrmHygieneIssue = typeof crmHygieneIssues.$inferInsert;

// ─── Tier Change Notifications ────────────────────────────────────────────────
// Tracks when tier change notifications have been sent to AEs to avoid duplicates
export const tierChangeNotifications = mysqlTable("tier_change_notifications", {
  id: int("id").autoincrement().primaryKey(),
  aeId: int("aeId").notNull(),
  // The month/year this notification is for
  notificationYear: int("notificationYear").notNull(),
  notificationMonth: int("notificationMonth").notNull(), // 1–12
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TierChangeNotification = typeof tierChangeNotifications.$inferSelect;
export type InsertTierChangeNotification = typeof tierChangeNotifications.$inferInsert;

// ─── Tier Snapshots ───────────────────────────────────────────────────────────
// Authoritative record of each AE's tier for a given month, captured at
// month-end. The teamCommissions view uses this table first; if no snapshot
// exists it falls back to live calculation.
export const tierSnapshots = mysqlTable(
  "tier_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    aeId: int("aeId").notNull(),
    snapshotYear: int("snapshotYear").notNull(),   // e.g. 2026
    snapshotMonth: int("snapshotMonth").notNull(), // 1–12
    tier: mysqlEnum("tier", ["bronze", "silver", "gold"]).notNull(),
    avgArrUsd: decimal("avgArrUsd", { precision: 12, scale: 2 }),
    avgDemosPw: decimal("avgDemosPw", { precision: 6, scale: 2 }),
    avgDialsPw: decimal("avgDialsPw", { precision: 8, scale: 2 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    uniqueAeMonth: unique("uq_tier_snapshots_ae_month").on(t.aeId, t.snapshotYear, t.snapshotMonth),
  })
);
export type TierSnapshot = typeof tierSnapshots.$inferSelect;
export type InsertTierSnapshot = typeof tierSnapshots.$inferInsert;
