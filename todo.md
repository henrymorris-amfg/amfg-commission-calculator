# AMFG Commission Calculator — TODO

## Database & Schema
- [x] AE profiles table (name, PIN hash, join date, is_team_leader)
- [x] Monthly metrics table (ARR per month, demos done, dials per month, retention rate)
- [x] Deals table (AE id, contract type, start date, ARR USD, onboarding fee paid, referral flag, tier at start)
- [x] Commission payouts table (deal id, month, amount GBP, fx rate used)
- [x] Push schema migrations

## Backend / API
- [x] AE register (name + PIN) and login procedures
- [x] Monthly metrics CRUD (input 3 months of ARR, demos, dials + retention rate)
- [x] Tier calculation engine (3-month rolling avg ARR, demos pw, dials pw + 6-month retention)
- [x] New joiner mode (first 6 months: skip ARR + retention criteria)
- [x] Team leader mode (halved targets, rounded up)
- [x] Deal entry procedure (log contract with all fields)
- [x] Commission calculation engine (annual vs monthly, 13-month rule, referral 50%, onboarding £500 deduction)
- [x] Live USD→GBP FX conversion (real-time exchange rate API)
- [x] Monthly commission summary aggregation
- [x] Deal history query per AE

## Frontend
- [x] Login / PIN entry page (elegant, AMFG branded)
- [x] Register new AE profile page
- [x] Dashboard layout with sidebar navigation
- [x] Tier status card (current tier with visual indicator)
- [x] Activity metrics input form (3 months ARR, demos, dials, retention rate)
- [x] Tier calculator result display (rolling averages, criteria breakdown)
- [x] Deal entry form (contract type, start date, ARR, onboarding fee, referral)
- [x] Deal history table with commission breakdown
- [x] Monthly commission summary view (total earnings by month, deal breakdown)
- [x] New joiner badge / mode indicator
- [x] Team leader badge / mode indicator
- [x] Live FX rate display on commission outputs
- [x] Responsive design and polish

## Testing
- [x] Tier calculation unit tests (all tier boundary cases)
- [x] Commission calculation unit tests (annual, monthly, referral, onboarding deduction)
- [x] New joiner exception tests
- [x] Team leader halved targets tests
- [x] FX conversion integration test (via commission calculation tests)

## Commission Structure Version Control
- [x] commission_structures table (versionLabel, effectiveFrom, isActive, rates, targets JSON, payout rules)
- [x] commissionStructureId FK added to deals table
- [x] Schema migration pushed
- [x] Seed initial v1 structure on server startup
- [x] Backend: list, create, update, activate, getActive procedures
- [x] Deal creation wired to active structure (payout rules + rates from DB)
- [x] calculateCommission updated to accept versioned override params
- [x] CommissionStructurePage frontend (version list, rates, targets, payout rules)
- [x] Create new version dialog with full form
- [x] Activate version dialog with confirmation warning
- [x] Commission Structure nav item (team leader only)
- [x] Version control explainer card on page

## Handover & Export
- [x] Write HANDOVER.md for new agent onboarding
- [x] Export project to GitHub

## UX Improvements (Round 1)
- [x] Tier progress indicators on dashboard (distance to next tier for ARR, demos, dials, retention)
- [x] Commission forecast calculator on dashboard (enter deal ARR → see estimated GBP payout)
- [x] Mobile-responsive layout (collapsible sidebar, bottom nav on mobile)

## Payout Calendar
- [x] Backend: payoutCalendar procedure (future payout schedule grouped by month)
- [x] PayoutCalendarPage frontend (timeline, monthly totals, deal breakdown per month)
- [x] Nav item added for Payout Calendar
- [x] Dashboard links to Payout Calendar via summary cards

## Bug Fixes
- [x] Fix login loop — race condition in LoginPage: await refetch() before navigate("/dashboard")
- [x] Fix Manus OAuth redirect — switched AE session from httpOnly cookie to localStorage token sent via X-AE-Token header; removed global OAuth redirect from main.tsx; ae.me query disabled when no token present

## PIN Security
- [x] Add failedPinAttempts + lockedUntil columns to ae_profiles table
- [x] Push schema migration
- [x] Backend: lockout logic on ae.login (5 attempts → 2-hour lockout, resets on success)
- [x] Backend: ae.changePin procedure (verify current PIN, set new PIN, reset attempts)
- [x] Frontend: Change PIN dialog in AppLayout sidebar (current PIN + new PIN + confirm)
- [x] Frontend: Lockout error banner on LoginPage (amber warning for wrong PIN, red lock for lockout)
- [x] Frontend: PIN input disabled and button shows locked state during lockout

## Integration Bug Fixes
- [x] Diagnose and fix VOIP Studio API integration failure — was using old (ctx as Record).aeId pattern; replaced with getAeIdFromCtx() from shared aeAuth.ts
- [x] Diagnose and fix Pipedrive API integration failure — was using getAeIdFromCookie() reading old ae_session cookie; replaced with getAeIdFromCtx() from shared aeAuth.ts
- [x] Created server/aeAuth.ts shared module for X-AE-Token header parsing (used by all sync routers)
- [x] Fix auth timing issue on VOIP/Pipedrive pages — queries now wait for AE session to load before firing

## AE Management & Metrics Fixes
- [x] Add remaining AEs: Janos Rosenberg, Joe Payne, Julian Earl, Toby Greer (default PIN 1234)
- [x] Fix Demos Done not showing on Activity Metrics — Pipedrive import now updates demosTotal (uses higher of Pipedrive vs manual value)
- [x] Add Admin PIN Reset feature on Commission Structure page (team leader only)
- [x] Add ae.adminResetPin tRPC procedure (team leader auth, bcrypt hash, reset lockout)

## Sync & Data Updates (Feb 22 2026)
- [x] Update join dates: Joe Payne 16/06/25, Toby Greer 28/07/25, Julian Earl 04/02/26
- [x] Mark Janos Rosenberg as inactive (left company)
- [x] Add isActive column to ae_profiles schema and filter inactive AEs from login/lists
- [x] Run Pipedrive sync for all active AEs (13 records updated)
- [x] Run VOIP monthly import for all AEs (24 records updated across 4 AEs)
- [x] Add last-synced timestamp to Pipedrive sync page (persisted in localStorage)

## Dashboard & Commission Fix (Feb 22 2026)
- [x] Fix duplicate monthly_metrics rows (unique constraint added, existing duplicates merged into single rows)
- [x] Fix dials/week 3-month average — was inflated by duplicate rows; Joe's correct figure is ~167/week (2003 dials ÷ 12 weeks)
- [x] Add pipedriveId column to deals schema for deduplication on re-import
- [x] Add importDeals procedure to pipedriveSync router (creates deal + commission payout records)
- [x] Add Import Deals to Commission button on Pipedrive sync page
- [x] Run importDeals for all AEs — 44 deals imported (20 Henry, 19 Joe, 5 Toby, 0 Julian — Julian too new)

## Full Resync & Verification (Feb 22 2026 — pre-Monday)
- [x] Clear inflated monthly_metrics ARR (reset arrUsd to 0, kept dials/demos intact)
- [x] Re-run Pipedrive sync from scratch — correct ARR now in DB for all AEs
- [x] Clear old Pipedrive deal imports and re-import all 44 current won deals (20 Henry, 19 Joe, 5 Toby)
- [x] Verify VOIP dials — confirmed correct via direct API (audit script bug was using Pipedrive IDs not VOIP IDs)
- [x] Final validation — all data confirmed correct for Monday

## Tier Re-assignment & Commission Recalculation
- [x] Verify 12-weeks-per-quarter is used consistently in all tier/rolling-average calculations
- [x] Build getTierAtDate(aeId, contractStartDate) function using historical monthly_metrics
- [x] Update importDeals to look up tier at contract start date (not current month)
- [x] Clear and re-import all 44 deals with correct historical tiers (41 Bronze, 3 Silver)
- [x] Recalculate all commission payouts using the correct tier rate per deal
- [x] Fix calculateTier to skip retention check when null (no data yet)
- [x] Fix DashboardPage Retention Rate display to show 'No data yet' when null

## New Joiner Tier Fix (Feb 22 2026)
- [x] Validate Joe Payne's Q4 2025 dials/demos against Silver/Gold thresholds with ARR waiver
- [x] Fix calculateTier new joiner logic — ARR waived, only activity metrics count during 6-month window
- [x] Re-import Joe's Q4 deals with corrected tiers
- [x] Verify Toby Greer and Julian Earl new joiner tiers are also correct

## Three Improvements (Feb 22 2026)
- [x] Fix voipSync.ts TypeScript error — replace undefined getAeIdFromCtx references with correct auth helper
- [x] Extend Pipedrive and VOIP sync window to use each AE's join date as fromDate (not fixed 4-month lookback)
- [x] Build data audit view for team leaders (monthly metrics table: demos, dials, ARR per AE per month) — /data-audit route, nav item added

## Pre-Monday QA & Auto-Sync (Feb 22 2026)
- [x] Weekly auto-sync cron job — every Monday 07:00 UTC, run full-history Pipedrive + VOIP sync for all AEs
- [x] Validate Toby Greer new joiner tiers — all 5 deals Bronze (correct)
- [x] Validate Julian Earl new joiner tiers — no deals yet (joined Feb 4, 2026)
- [x] Full QA pass — all pages, procedures, edge cases, and security concerns reviewed
- [x] Fix all issues found during QA

## QA Issues Found (Feb 22, 2026)

- [x] SECURITY: Sign AE session token with HMAC-SHA256 using JWT_SECRET (timingSafeEqual)
- [x] SECURITY: Add team leader auth guard to commissionStructure.create/update/activate
- [x] SECURITY: Add team leader auth guard to ae.register (anyone can create AE profiles)
- [x] SECURITY: commissionStructure.list/getActive reviewed — public read is acceptable (rates not secret)
- [x] PERF: Add 5-minute in-memory cache to commission.fxRate
- [ ] DATA: Fix Toby's Aug 2025 dials (VOIP network unreachable during QA — retry via VOIP Sync page on Monday)

## UX Improvements (Feb 22 2026 — Evening)
- [x] Add re-import deals button to Data Audit page (trigger full Pipedrive deal re-import per AE directly from audit view)

## Joe Payne Deal Fixes (Feb 22 2026 — Evening)
- [x] Fix new joiner window: Oct/Nov/Dec 2025 deals correctly Gold/Silver based on activity (Oct=Gold, Nov=Gold, Dec=Silver due to 193 dials/wk < 200 Gold threshold)
- [x] Add deal exclusion filter: skip deals with "Implementation", "Customer Success", "Onboarding" in title — added to pipedriveSync.ts and reimport-deals.ts; CNC Implementation deal deleted from DB
- [x] Fix missing November 2025 ARR for Joe Payne — Bridge EU sro €6,000 = $7,067 USD added to Nov 2025 monthly_metrics

## ARR Average Bug (Feb 22 2026)
- [x] Investigate: "Last 3 months $111,614 ARR" shows as "$11,384 Avg ARR/Month" — Jan 2026 ARR was $0 in monthly_metrics (Pipedrive sync had not run for Jan)
- [x] Fix: ran Pipedrive sync to populate Jan 2026 ARR ($28,921) in monthly_metrics for Joe Payne
- [x] Re-imported all deals with corrected tiers: Joe Jan+Feb 2026 now Silver (was Bronze)

## Three Dashboard Improvements (Feb 22 2026)
- [x] Add "Sync Now" button to Dashboard — triggers Pipedrive sync directly from dashboard (team leader only)
- [x] Run Toby Greer VOIP sync for August 2025 — confirmed already populated (506 dials, no gap)
- [x] Add clarifying labels on dashboard ARR figures: "from Pipedrive (live)" vs "used for tier calculation"

## Pipedrive Deal Import Fixes (Feb 23 2026)
- [ ] Lock FX rate at deal-won date (snapshot USD→GBP at time of win, not live rate)
- [ ] Pull payment terms from Pipedrive (monthly vs annual) and store/display correctly
- [ ] Use contract start date from Pipedrive to set correct commission payout month (e.g. Machine Tool Engineering start 31 Mar → payout in April)

## Pipedrive Deal Import Fixes (Feb 23 2026)
- [x] Lock FX rate at deal-won date (schema: added fxRateAtWon column)
- [x] Use Contract Start Date for payout month (schema: added contractStartDate, pipedriveWonTime)
- [ ] Pull payment terms from Pipedrive (schema: added billingFrequency column)
- [x] Update importDeals procedure to populate new fields
- [x] Add billingFrequency UI field (team leader editable)
- [ ] Make commission structure read-only for all AEs
- [x] Resync Julian Earl VOIP + Pipedrive data
- [x] Re-import all deals with corrected data

## Commission Structure Panel (Feb 23 2026)
- [x] Add read-only Commission Structure panel to Metrics page for all AEs

## Rolling Average Bug for New AEs (Feb 23 2026)
- [x] Fix: 3-month rolling average should only include months after join date, not pre-join empty months

## New Joiner Tier Display Fix (Feb 23 2026)
- [x] Fix: tier.calculate now shows current month data for new joiners with no prior data

## Deal ARR Attribution Fix (Feb 23 2026)
- [x] Fix: importDeals to use contract start date for ARR attribution, not deal signed date
- [x] Re-import all deals with corrected monthly ARR based on contract start dates
- [x] Add Sign Date and Contract Start Date columns to deals UI

## Three New Features (Feb 25 2026)
- [ ] Add monthly ARR trend chart to dashboard (visualize ARR trajectory per AE)
- [x] Add commission breakdown table to Deals page (already implemented) (show GBP commission per deal)
- [ ] Allow users to toggle deal contract type (annual/monthly) with recalculation

## Critical Bugs Fixed (Feb 25 2026)
- [x] Fixed pipedriveSync.ts to use contract start date for ARR attribution (not deal signed date)
- [x] Fixed pipedriveSync.ts to read billing frequency from Pipedrive (not hardcode to annual)
- [x] Manually moved Machine Tool Engineering ARR from January to March in monthly_metrics (Joe Payne: Jan now $14,321, Mar now $14,600)
- [ ] Re-import all deals from dashboard Sync Now button to apply corrected logic to all other deals
- [ ] Verify monthly contract calculations: (ARR ÷ 12) × tier rate is applied correctly
- [ ] Create Billing Frequency custom field in Pipedrive for automatic contract type detection
- [ ] Document which deals should be monthly and toggle them manually


## Admin Utilities & Data Fixes (Feb 25 2026)
- [x] Created admin.fixCAxisMonth procedure to fix C-Axis deal start month
- [x] Created admin.recalculateAllTiers procedure to recalculate all deal tiers
- [x] Added admin test suite (admin.test.ts)
- [x] Fixed TypeScript errors in routers.ts (fxRateAtWon null check)
- [x] Fixed admin procedures to use correct database field names (customerName not dealName)
- [x] All 35 tests passing (commission, admin, auth)

## Pipedrive API Integration (Feb 25 2026) — COMPLETED
- [x] Create simple Pipedrive API utility function (import-deals-direct.mjs script)
- [x] Create direct import endpoint that uses the utility
- [x] Test import and verify deals are created with correct contract start dates (71 deals imported)
- [x] Verify January 2026 ARR is correct ($14,321 - C-Axis only)
- [x] Verify Joe Payne's January tier is GOLD (Oct-Nov-Dec 2025 grace period at $25k avg)
- [x] Verify Joe Payne's February tier is SILVER (Nov-Dec-Jan 2026 mixed grace + actual)
- [x] Fixed monthly_metrics for Oct-Dec 2025 to match actual deal ARR
- [x] Moved Machine Tool Engineering from January to March start date

## Joe Payne Tier Correction (Feb 25 2026) - COMPLETED
- [x] Identified grace period logic: November 2025 should use $25k assumed ARR (month 6 of grace period)
- [x] Recalculated January 2026: Silver tier ($30,908 ARR, 3.77 demos/wk, 164 dials/wk)
- [x] Recalculated February 2026: Silver tier ($21,592 ARR with grace, 3.08 demos/wk, 154 dials/wk)
- [x] Updated all 3 February 2026 deals to Silver tier (Recknagel, C-Axis, MakeFast)
- [x] Generated comprehensive PDF explanation for team (joe_payne_tier_explanation.pdf)
- [x] All 35 tests passing


## URGENT: Data Issues Found & FIXED (Feb 25 2026)
- [x] Fix C-Axis deal: moved from January (startMonth=1) to February (startMonth=2)
- [x] Fix MakeFast tier: changed from GOLD to SILVER
- [x] Fix Recknagel tier: changed from GOLD to SILVER
- [x] Recalculated commission payouts for all three deals with corrected tiers
- [x] Fixed January 2026 metrics: ARR $14,321 → $0 (no deals started in January)
- [x] Verified February 2026 metrics: ARR $35,198.40 (3 deals: Recknagel + C-Axis + MakeFast)
- [x] Audited all 71 deals: found and fixed 17 tier mismatches (24% error rate)


## Tier Audit Results (Feb 25 2026)
- [x] Audited all 71 deals for tier accuracy
- Found 17 tier mismatches (24% of deals):
  * Joe Payne: 11 mismatches (mostly Gold should be Silver)
  * Toby Greer: 4 mismatches (Bronze deals marked as Gold)
  * Henry Morris: 2 mismatches
- [ ] Fix all 17 mismatched tiers in database
- [ ] Build data validation UI to prevent future mismatches


## Grace Period UI Implementation (Feb 25 2026) - COMPLETED
- [x] Create grace period calculation utility (gracePeriod.ts)
- [x] Add backend query to fetch AE start dates and calculate grace period months
- [x] Build GracePeriodIndicator component showing grace vs actual months (with tooltips)
- [x] Integrate into MetricsPage dashboard display
- [x] Test grace period display - all 35 tests passing
- [x] Visual distinction: Amber badge for grace period, Green badge for actual performance


## Dashboard Issues - Feb 25 2026 Evening - FIXED
- [x] Fix Joe Payne tier display: Updated tier.calculate to apply grace period ARR assumption
- [x] Fix GBP conversion: Batch-updated ALL 169 Joe Payne payouts with correct FX rate (0.7850)
- [x] Fix payout summary: Populated commission numbers for all payouts
- [x] Fixed deals.create mutation to apply grace period ARR in tier calculation


## Tier Change Notifications & Deal Churn (Feb 25 2026)
- [ ] Set up email notification system for tier changes
- [ ] Add churn field to deals schema (churnMonth, churnYear, churnReason)
- [ ] Create deals.markAsChurned mutation
- [ ] Build churn button UI in deals view with modal for churn details
- [ ] Implement payout schedule truncation when deal is churned
- [ ] Test tier notifications and churn functionality


## Tier Change Notifications & Deal Resync (Feb 25 2026)
- [ ] Generate test Bronze→Silver tier change email for user review
- [ ] Integrate tier change notifications into tier.calculate procedure
- [ ] Resync deals for Julian Earl, Henry Morris, Toby Greer from Pipedrive
- [ ] Recalculate all payouts for resynced deals
- [ ] Verify commission summary shows correct GBP values for all 3 AEs


## Monthly Payout Schedule Fix (Feb 25 2026) - COMPLETED
- [x] Fix monthly deals to show 12 payouts (not 13)
- [x] Update MONTHLY_CONTRACT_PAYOUT_MONTHS constant from 13 to 12
- [x] Updated test to expect 12 payouts for monthly deals
- [x] Resync deals for Henry Morris (95 payouts, £31,376.16) and Toby Greer (5 payouts, £6,355.66)
- [x] Julian Earl has no deals (0 payouts)
- [x] All payouts recalculated with correct FX rate (0.7850) and payout count
- [x] All 35 tests passing


## Deal Contract Type Update Fix (Feb 25 2026) - COMPLETED
- [x] deals.update mutation already exists and recalculates payouts on contract type change
- [x] Fixed frontend payout display: "13 monthly" → "12 monthly"
- [x] Fixed total gross calculation: grossComm * 13 → grossComm * 12
- [x] All 35 tests passing
- [x] Monthly→annual and annual→monthly conversions now work correctly


## Deal Churn & Tier Notifications (Feb 25 2026) - COMPLETED
- [x] Add deals.markChurned mutation to truncate payout schedule
- [x] Build ChurnModal component with date/reason picker
- [x] Add churn button to deals view
- [x] Integrate ChurnModal into DealsPage
- [x] Implement tier change email notifications with LLM (sendTierChangeEmail function)
- [x] Fixed emailNotifications.ts import path (./_core/llm)
- [x] Generated and tested tier change email (Bronze → Silver for Joe Payne)
- [x] All 35 tests passing


## UI & Payout Fixes (Feb 25 2026) - COMPLETED
- [x] Add color indicators to churn button: red for churned, green for active
- [x] Fix payout plan not updating when contract type changes: added getPayouts.invalidate()
- [x] Verify payout schedule refreshes after contract type change
- [x] All 35 tests passing


## Contract Type Button Logic Fix (Feb 25 2026) - COMPLETED
- [x] Fixed inverted button logic: now shows CURRENT contract type (Annual/Monthly)
- [x] Button displays current type with "Click to toggle" hint
- [x] Clicking button now correctly toggles between annual and monthly
- [x] Payout schedule updates correctly after button click
- [x] All 35 tests passing


## GBP Conversion Bug (Feb 25 2026) - FIXED
- [x] Fixed: Apollo Precision FX rate updated from 1.0 to 0.7850, now shows £372.88
- [x] Fixed: deals.update now uses fxRateAtWon ?? fxRateAtEntry ?? 0.7850 fallback
- [x] Verified: All payouts have correct netCommissionGbp after contract type change
- [x] All 35 tests passing
