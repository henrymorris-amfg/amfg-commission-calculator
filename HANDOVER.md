# AMFG Commission Calculator — Agent Handover

This document is written for the next agent picking up this project. It covers the full architecture, business logic, what has been built, and exactly what remains to be done (Google Sheets auto-fill integration).

---

## Project Overview

A full-stack web application for AMFG's sales team (Account Executives) to calculate and track their commission. It is built on a **React 19 + Tailwind 4 + Express 4 + tRPC 11 + MySQL** stack, scaffolded from the Manus web-db-user template.

**Live stack:**

| Layer | Technology |
|---|---|
| Frontend | React 19, Tailwind CSS 4, shadcn/ui, Recharts, Wouter (routing) |
| Backend | Express 4, tRPC 11, Superjson |
| Database | MySQL (via Drizzle ORM) |
| Auth | Custom PIN-based AE profiles (no Manus OAuth used) |
| Currency | Live USD → GBP via open.er-api.com |

---

## Business Logic Summary

### Commission Tiers

Each AE's tier for a given month is determined by a **3-month rolling average** of their activity metrics, plus a **6-month average retention rate**.

| Tier | Commission Rate | Min ARR (3-mo avg) | Min Demos/wk | Min Dials/wk | Min Retention (6-mo avg) |
|---|---|---|---|---|---|
| Bronze | 13% | Below Silver | Below Silver | Below Silver | — |
| Silver | 16% | $20,000 | 3 | 100 | 61% |
| Gold | 19% | $25,000 | 4 | 200 | 71% |

**Team Leader targets are halved (rounded up).** The team leader is identified by the `isTeamLeader` flag on their AE profile — currently a fixed designation set at registration.

**New joiners** (first 6 months from `joinDate`) are exempt from ARR and retention criteria but must still meet activity metrics (demos + dials).

### Commission Calculation Rules

- **Annual contract:** Commission paid as a single upfront payout = `ARR × tier_rate × FX_rate`
- **Monthly contract:** Commission paid monthly for **13 months** = `(ARR / 12) × tier_rate × FX_rate` per month
- **Referral deal:** 50% reduction applied to the gross commission amount
- **No onboarding fee:** £500 deducted from the first payout AND ARR reduced by $5,000 for the commission base calculation
- The **tier used is always the tier the AE was in during the month the contract started** — it never changes for that deal even if the AE's tier changes later

### Commission Structure Version Control

All tier thresholds, commission rates, and payout rules are stored in the `commission_structures` database table (not hardcoded). Only one version is `isActive = true` at any time. When a new deal is created, it is permanently linked to the currently active structure version via `commissionStructureId` FK on the `deals` table. Historical deals are never affected by activating a new version.

---

## Key Files

```
shared/commission.ts          ← ALL business logic: tier calculation, commission calculation, types, constants
drizzle/schema.ts             ← Full database schema (all 5 tables)
server/db.ts                  ← All database query helpers
server/routers.ts             ← All tRPC procedures (ae, metrics, commission, commissionStructure routers)
client/src/pages/
  LoginPage.tsx               ← PIN-based login + profile creation
  DashboardPage.tsx           ← Tier status, quick stats, recent deals
  MetricsPage.tsx             ← Monthly activity input form + tier calculator ← ADD AUTO-FILL HERE
  DealsPage.tsx               ← Deal entry form + deal history table
  SummaryPage.tsx             ← Monthly commission summary with bar chart
  CommissionStructurePage.tsx ← Version control admin page (team leader only)
client/src/components/
  AppLayout.tsx               ← Sidebar navigation (add new nav items here)
client/src/contexts/
  AeAuthContext.tsx           ← AE session state (PIN-based, stored in localStorage)
```

---

## Database Schema (5 Tables)

| Table | Purpose |
|---|---|
| `users` | Manus OAuth users (template default, not actively used) |
| `ae_profiles` | AE name, PIN hash (bcrypt), join date, isTeamLeader flag |
| `monthly_metrics` | Per-AE per-month: ARR USD, demos done, dials, retention rate % |
| `deals` | Per-AE deals: contract type, start date, ARR, onboarding fee paid, referral flag, tier at start, FX rate, commission structure FK |
| `commission_payouts` | Individual payout schedule rows per deal (1 row for annual, 13 rows for monthly) |
| `commission_structures` | Versioned commission structure: rates, tier targets, payout rules |

---

## What Remains: Google Sheets Auto-Fill

The only unbuilt feature is the ability to auto-populate the metrics form from two Google Sheets:

1. **Customer Database Sheet** — provides ARR per month and retention rate per AE
2. **Sales Report Sheet** — provides dials and demos done per AE per month

### Recommended Implementation Plan

**Step 1 — Credentials**

Use `webdev_request_secrets` to add:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` — the service account email
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` — the private key (JSON escaped)
- `GOOGLE_CUSTOMER_SHEET_ID` — the spreadsheet ID from the Customer Database URL
- `GOOGLE_SALES_REPORT_SHEET_ID` — the spreadsheet ID from the Sales Report URL

Alternatively, use OAuth2 with the AE's own Google account for per-user access.

**Step 2 — Server-side helper**

Install `googleapis` package:
```bash
pnpm add googleapis
```

Create `server/googleSheets.ts`:
```ts
import { google } from "googleapis";

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

export async function readSheet(spreadsheetId: string, range: string) {
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values ?? [];
}
```

**Step 3 — Add `autoFill` procedure to `server/routers.ts`**

Inside the existing `metrics` router, add:
```ts
autoFill: publicProcedure
  .input(z.object({ aeName: z.string(), year: z.number(), month: z.number() }))
  .query(async ({ input }) => {
    // Read ARR + retention from Customer Database sheet
    const customerRows = await readSheet(process.env.GOOGLE_CUSTOMER_SHEET_ID!, "Sheet1!A:Z");
    // Read dials + demos from Sales Report sheet
    const salesRows = await readSheet(process.env.GOOGLE_SALES_REPORT_SHEET_ID!, "Sheet1!A:Z");
    // Parse and return matching rows for input.aeName, input.year, input.month
    return { arrUsd, demosDone, dialsDone, retentionRate };
  }),
```

The exact column mapping will depend on the spreadsheet structure — ask the owner to share the sheet column layout.

**Step 4 — Add "Auto-fill from Sheets" button to `MetricsPage.tsx`**

The `MetricsPage` already has a manual input form. Add a button above the form that calls `trpc.metrics.autoFill.useQuery(...)` and pre-populates the form fields using `react-hook-form`'s `setValue`.

---

## AE Authentication Model

There is **no Manus OAuth** in use. Authentication is entirely custom:

- AEs register with a name + PIN (4–6 digits)
- PIN is hashed with bcrypt and stored in `ae_profiles`
- On login, the server returns the AE profile object
- The frontend stores the AE session in `localStorage` via `AeAuthContext`
- The `aeId` is passed as an input field on all tRPC mutations (not from a session cookie)

This means all tRPC procedures use `publicProcedure`, not `protectedProcedure`. The AE ID is trusted from the client — acceptable for an internal tool.

---

## Commission Structure Version Control

The **Commission Structure** page is accessible only to the Team Leader (identified by `ae.isTeamLeader === true`). It allows:

- Viewing all historical versions with their full rate/target breakdown
- Creating a new draft version (pre-filled from the current active version)
- Activating a draft (with a confirmation dialog warning that it applies to all future deals)

The initial v1 structure is seeded automatically on server startup via `seedInitialCommissionStructure()` in `server/db.ts` — it only runs if no structures exist yet.

---

## Running Locally

```bash
pnpm install
pnpm db:push      # run migrations
pnpm dev          # starts Express + Vite on port 3000
pnpm test         # run vitest unit tests
```

Environment variables are injected automatically in the Manus platform. For local development, create a `.env` file with `DATABASE_URL` and `JWT_SECRET`.

---

## Notes for the Next Agent

- The `shared/commission.ts` file is the single source of truth for all business logic. Read it carefully before making any changes to tier calculation or commission calculation.
- The `MONTHLY_CONTRACT_PAYOUT_MONTHS` constant (default 13) is now overridable per commission structure version — always use the version stored on the deal, not the constant, when recalculating historical payouts.
- The `isTeamLeader` flag is currently set manually at profile creation. If you need to change who is a team leader, update the `ae_profiles` table directly via the Database panel in the Manus Management UI.
- All ARR values are stored and calculated in **USD**. Commission payouts are converted to **GBP** at the live FX rate at the time the deal is entered. The FX rate used is stored on each deal row (`fxRateAtEntry`) for auditability.
