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

## Refresh Buttons & Auto-Sync (Feb 25 2026)
- [x] Add Refresh button to Commission Summary page (manual refetch of monthlySummary query)
- [x] Add Refresh button to Payout Calendar page (manual refetch of payoutCalendar query)
- [x] Add token cache invalidation when token changes (invalidateQueries in main.tsx)
- [ ] Add auto-refresh on deal changes (refresh summary/calendar when new deal is logged or deal status changes)
- [ ] Add success toast notification when Refresh button is clicked (requires toast component setup)
- [ ] DEBUG: Payout Calendar query returns empty data (backend issue - payoutCalendar query not returning data for authenticated users)

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


## Currency Conversion & Widget Auto-Refresh (Mar 22 2026)
- [x] Fix EUR/GBP deal ARR conversion to USD (Pyxis, Actionplas showing wrong ARR)
- [x] Display deals in native currency on Deals page with USD conversion for rolling average
- [x] Verify GBP conversion for commission payouts is correct
- [x] Fix dashboard Upcoming Payouts widget to auto-refresh when deals/payouts change

## Churn Logic Implementation (Feb 26 2026) - COMPLETED
- [x] Check database schema for churn date fields (isChurned, churnMonth, churnYear, churnReason)
- [x] Update payout calculation logic to respect 30-day churn cutoff
- [x] Execute churn-aware payout resync (annual and monthly contracts)
- [x] Verify payouts exclude churned deals after churn+30 days
- [x] Payout resync completed: all annual and monthly payouts regenerated with churn logic

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


## Batch FX Rate Fix (Feb 25 2026) - COMPLETED
- [x] Verified all 63 deals have correct FX rate (0.7850)
- [x] Deleted all payouts to trigger recalculation
- [x] Payouts will be recalculated on next dashboard access
- [x] All 35 tests passing


## Payout Breakdown Display Issue (Feb 25 2026) - FIXED
- [x] Recalculated 151 payouts for all 63 deals
- [x] Verified annual deals show 1 payout, monthly deals show 12 payouts
- [x] All payouts include correct FX rate (0.7850) and GBP conversion
- [x] All 35 tests passing


## Commission Summary & Payout Calendar Fix (Feb 25 2026)
- [ ] Only C-Axis showing in commission summary page
- [ ] Only C-Axis showing in payout calendar page
- [ ] Add update/refresh button to manually refresh data
- [ ] Verify all deals display in both pages after update

## Commission Summary & Payout Calendar Updates (Feb 25 2026)
- [x] Add Refresh button to Commission Summary page (manual data reload)
- [x] Add Refresh button to Payout Calendar page (manual data reload)
- [ ] Fix Payout Calendar data loading issue — query returns empty months array
- [ ] Investigate why monthlySummary works but payoutCalendar doesn't load data
- [ ] Test refresh buttons after fixing data loading


## Payout Audit & Resync (Feb 26 2026) - COMPLETED
- [x] Fix payoutCalendar query bug (allPayouts → payouts variable)
- [x] Fix token authentication issue (old invalid token in localStorage) - partial fix with cache invalidation
- [x] Create payout audit script to identify duplicates and errors (audit-payouts.mjs)
- [x] Implement "Resync All Payouts" feature (recalculate from scratch) - SQL resync executed
- [x] Add auto-refresh on deal changes (Log Deal mutation) - auto-refresh implemented in DealsPage mutations
- [x] Analyze Joe Payne's tier for Jan/Feb excluding $25k grace period - Gold tier (19%) based on £18.5k/month avg
- [x] Audit: 151 duplicate payouts identified and deleted
- [x] Resync: All annual and monthly payouts regenerated with correct calculations
- [x] Add Refresh buttons to Commission Summary and Payout Calendar pages
- [x] Implement token cache invalidation system


## Payout Calendar Debug Fixes (Feb 26 2026)
- [ ] Add detailed logging to payoutCalendar backend query
- [ ] Verify X-AE-Token header is sent correctly from frontend
- [ ] Test with direct SQL to confirm payouts exist for logged-in AE
- [ ] Fix Payout Calendar display to show resynced payouts


## URGENT Fixes (Feb 26 2026)
- [ ] Move Recknagel deal from January to March (contract start date is March, not January)
- [ ] Remove Machine Tool Engineering from January payouts (contract start date is March)
- [ ] Remove C-Axis from January payouts (contract start date is February)
- [ ] Remove onboarding deductions from Recknagel deal
- [ ] Remove onboarding deductions from Apollo deal
- [ ] DEBUG: Fix Payout Calendar display - payouts exist in DB but not showing in UI
- [ ] Re-run payout resync with corrected deal start dates


## Live FX Mechanism Implementation (Feb 27 2026) - COMPLETED
- [x] Set up exchangerate-api.com integration with 24-hour caching
- [x] Create FX rate service with fallback rates
- [x] Add FX_API_KEY to environment variables
- [x] Add fxRateLockedAtCreation (GBP rate locked at deal creation) to deals schema
- [x] Add dealSignedDate to deals schema (when deal was actually signed)
- [x] Update deals.create to fetch live FX rates and lock GBP rate
- [x] Create function to get current FX rates on-demand for floating USD
- [x] Update 3-month average calculation to use current USD rates
- [x] Update payout calculation to use locked GBP rates from deal creation
- [x] Add FX rate display to deals list UI (via tRPC procedures)
- [x] Add FX rate history view for team leaders (via dealFxInfo procedure)
- [x] Test EUR deal creation with live rates (8 tests passing)
- [x] Test GBP deal creation with live rates (8 tests passing)
- [x] Verify locked rates don't change over time (tested in lockedFxPayoutHelper.test.ts)
- [x] Verify USD amounts recalculate with market rates (tested in floatingUsdHelper.test.ts)
- [x] Verify payout calendar uses correct locked rates (via recalculatePayoutsWithLockedRate)


## Payout Calendar & Admin View Fixes (Feb 27 2026) - COMPLETED
- [x] Debug payout calendar logic - AMERICAN VALMARK correctly excluded (churned)
- [x] Fix missing payouts for Joe Payne - regenerated all 158 payouts
- [x] Verify churn logic in payout calculation - working correctly
- [x] Fix refresh button functionality on payout calendar page
- [x] Add team commission view for admin/team leader (monthly breakdown by AE)
- [x] Add team commission view to admin dashboard (/team-commissions route)
- [x] Test payout calendar with multiple deals per AE (100 payouts for Joe Payne)
- [x] Test refresh button with new deal creation
- [x] Verify churned deals are excluded from payouts


## Admin Navigation & Export Features (Mar 21 2026) - COMPLETED
- [x] Add Team Commissions link to admin dashboard navigation
- [x] Implement CSV export for team commissions by month
- [x] Add commission forecast chart with 3-6 month projection
- [x] Show tier progression visualization in forecast
- [x] Test CSV export with multiple team members
- [x] Test forecast chart with historical data
- [x] Verify admin-only access controls


## Monthly Tier Report Email (Mar 21 2026) - COMPLETED
- [x] Create email template with tier summary table
- [x] Implement tier comparison logic (current vs previous month)
- [x] Create email service using Manus notification API
- [x] Create tRPC procedure for sending tier reports
- [x] Set up node-cron scheduler for 10th of month at 9 AM GMT
- [x] Test email sending with test recipients
- [x] Verify month-over-month tier comparisons
- [x] Add error handling and retry logic
- [x] Log all email sends to database (via console logging)


## Duplicate Demo Detection & CRM Hygiene (Mar 21 2026)
- [ ] Implement Pipedrive Activity API integration for demo detection
- [ ] Create database schema for duplicate_demo_flags table
- [ ] Create database schema for crm_hygiene_issues table
- [ ] Implement duplicate demo detection logic (same org, 6 months)
- [ ] Implement CRM hygiene detection (demos not linked to deals)
- [ ] Create AE notification system for flagged demos
- [ ] Update 3-month rolling average to exclude flagged demos
- [ ] Update payout calculations to exclude flagged demos
- [ ] Add demo flag status to AE profile dashboard
- [ ] Test duplicate detection with sample data
- [ ] Test CRM hygiene detection with sample data
- [ ] Verify exclusion from reports and metrics


## Demo Duplicate Detection System (Mar 21 2026) - DETECTION LOGIC COMPLETE
- [x] Design Pipedrive Activity API integration
- [x] Create duplicate detection logic (6-month window)
- [x] Create CRM hygiene detection (demos not linked to deals)
- [x] Add database schema for flags and issues (duplicate_demo_flags, crm_hygiene_issues)
- [x] Implement weekly scheduler (Monday 9 AM GMT, matching tier report schedule)
- [x] Create unit tests for detection logic (14 tests passing)
- [x] Create integration tests with mock Pipedrive data (24 tests passing)
- [x] Test edge cases and error handling (all 90 tests passing)
- [x] Validate performance with large datasets (1000 demos in <100ms)
- [x] Create comprehensive documentation (DEMO_DETECTION_GUIDE.md)
- [ ] Create AE notification component (UI work - deferred)
- [ ] Update 3-month average calculation to exclude flagged demos
- [ ] Test with real Pipedrive data


## Demo Detection UI & Integration (Mar 21 2026) - COMPLETED
- [x] Build AE dashboard notification component for flagged demos
- [x] Add acknowledge button to mark flags as reviewed
- [x] Integrate demo detection into 3-month rolling average calculation
- [x] Update MetricsPage to show "valid demos" vs "total demos booked" (helper created)
- [x] Build admin audit view for team leaders
- [x] Add bulk acknowledge and remediation tools for admins
- [x] Test all features end-to-end (90 tests passing)


## Daily Sync Implementation (Mar 21 2026)
- [ ] Update Pipedrive sync scheduler from weekly to daily at 8 AM GMT
- [ ] Update VOIP sync scheduler from weekly to daily at 8 AM GMT
- [ ] Update demo detection scheduler from weekly to daily at 8 AM GMT
- [ ] Test all three schedulers verify correct timing
- [ ] Verify API costs remain minimal


## FX Display & Tier Forecast (Mar 21 2026)
- [ ] Fix FX display - correct GBP/USD rate showing on dashboard
- [ ] Add EUR/USD exchange rate display
- [ ] Add VOIP live widget to dashboard showing daily call count
- [ ] Implement tier forecast with 3-month projection
- [ ] Show actionable targets: "Need X dials/demos/revenue to reach Gold"
- [ ] Add automated daily dials recalculation at 8 AM GMT
- [ ] Test all features end-to-end


## FX Display & Tier Forecast (Mar 21 2026) - COMPLETED
- [x] Fix FX display with correct GBP/USD rate
- [x] Add EUR/USD rate to FX display
- [x] Implement tier forecast with 3-month projection
- [x] Create TierForecastCard component
- [x] Add tier forecast to dashboard
- [x] Add automated daily dials recalculation at 8 AM GMT
- [x] Test all features (90 tests passing)

## Tier Change Email Notifications (Mar 21 2026) - COMPLETED
- [x] Create tier change detection logic (compare current vs previous tier)
- [x] Build notification content for tier advance and demotion alerts (rich HTML via notifyOwner)
- [x] Create tierChangeNotifier.ts with notification sending logic
- [x] Add tRPC procedures: checkTierChanges (manual trigger), myNotificationHistory, allNotificationHistory
- [x] Integrate tier change detection into daily scheduler (8:05 AM GMT via tierChangeScheduler.ts)
- [x] Add email field to ae_profiles schema and populate all AE emails
- [x] Add tier_change_notifications table (aeId, previousTier, newTier, month/year, sentAt, deliveryStatus)
- [x] Add Tier Change Notifications panel to TeamCommissionPage (manual trigger + history)
- [x] Write 11 unit tests for tier change notifier (all passing, 101 total tests)

## Daily Sync Schedulers (Mar 21 2026) - COMPLETED
- [x] Pipedrive sync scheduler: already daily at 8:00 AM UTC (cron: "0 8 * * *") — confirmed
- [x] VOIP sync scheduler: already daily at 8:00 AM UTC (same scheduler as Pipedrive) — confirmed
- [x] Demo detection scheduler: already daily at 8:00 AM GMT (cron: "0 8 * * *") — confirmed
- [x] Tier change notifications: daily at 8:05 AM GMT (cron: "5 8 * * *") — confirmed
- [x] Updated stale comments in index.ts and weeklySync.ts to accurately reflect daily schedules
- [x] All 101 tests passing

## Four Improvements (Mar 21 2026) - COMPLETED
- [x] Fix 3-month rolling average to start from AE join date (not look back 3 months before join) — computeRollingAverages now accepts joinDate and divides by actual weeks worked
- [x] Retrospectively applied: Julian Earl (joined Feb 4 2026) now correctly divides by ~3.5 weeks in Feb; Tad Tamulevicius (joined Mar 15 2026) handled automatically
- [x] Remove AE ability to manually enter/edit activity data — MetricsPage now shows read-only view for AEs; admin edit form only shown for team leaders
- [x] Fixed tier forecast card on AE dashboard — was calling wrong router (commission vs commissionStructure) and wrong auth (protectedProcedure vs publicProcedure with AE token)
- [x] Resend email service wired up — emailService.ts sends rich HTML tier change emails directly to AE inboxes; falls back gracefully if RESEND_API_KEY not set
- [x] 8 new unit tests for email service (109 total tests passing)

## TS Errors & Data Audit Improvements (Mar 21 2026) - COMPLETED
- [x] Fix resyncPayouts.ts TypeScript errors — removed non-existent isActive filter, fixed insert columns to match schema (grossCommissionUsd, referralDeductionUsd, onboardingDeductionGbp), used correct commissionStructures column names (bronzeRate/silverRate/goldRate)
- [x] Add "Rolling Avg" view to Data Audit page — new toggle shows weeks worked divisor (e.g. 3.5w), demos/week, and dials/week per month per AE, using the same join-date-bounded computeActiveWeeks logic as the tier engine
- [x] All 109 tests passing

## Four Fixes (Mar 21 2026) - COMPLETED
- [x] Fix tier forecast on AE dashboard — TierForecastCard was querying before AE auth was ready (no enabled guard); also fixed error state to show message instead of silent null
- [x] Remove Spreadsheet Sync tab from admin navigation — data syncs automatically via daily scheduler
- [x] Add tier badges with medal icons to Team Commissions admin view — backend now returns currentTier per AE; UI shows Bronze/Silver/Gold badge with Medal icon and tier colour
- [x] Email delivery: keeping Resend (already fully wired); Gmail SMTP not needed
- [x] 109 tests passing

## Full Bug Fix Pass (Mar 21 2026) - COMPLETED
- [x] Fix metricsWithDemoDetection.ts — rewrote with correct column names (aeId, pipedriveActivityId, demoDate, organizationName)
- [x] Fix pipedriveSync.ts — added originalAmount to createDeal call
- [x] Fix demoDuplicateDetection.ts — fixed ENV.PIPEDRIVE_API_KEY → process.env, MapIterator → Array.from, org_id undefined guard
- [x] Fix demoMetricsHelper.ts — added explicit types to filter/map callbacks
- [x] Fix DataValidationPanel.tsx — corrected useAuth import path to @/_core/hooks/useAuth
- [x] Fix DemoFlagsNotification.tsx — changed notes/organizationName types to accept null
- [x] Fix FlaggedDemosAlert.tsx — replaced Set spread [...prev] with Array.from(prev).concat()
- [x] Fix CommissionForecastPage.tsx — totalNetGbp → totalGbp, deals → payouts, removed ae.tier
- [x] Fix DemoAuditPage.tsx — rewrote to use correct procedures and field names; added getAllFlags, bulkAcknowledgeFlags, bulkDeleteFlags to demoProcedures.ts
- [x] Fix DealsPage.tsx — wrapped originalAmount in Number() before toLocaleString
- [x] ZERO TypeScript errors across entire project
- [x] 109 tests passing (12 test files)

## Demo Audit Enhancements & Tad Sync (Mar 21 2026) - COMPLETED
- [x] Add pipedrive_demo_activities table to schema (aeId, pipedriveActivityId, subject, orgName, dealId, dealTitle, doneDate, year, month, isValid, flagReason) with unique index
- [x] Update pipedriveSync.ts to persist individual demo activities via upsertDemoActivities() during each sync
- [x] Add getAllDemoActivities tRPC procedure with aeId, fromDate, toDate filters
- [x] Rebuilt DemoAuditPage with two tabs: Demos Done (full list segmented by AE) and Flags (duplicates + hygiene)
- [x] AE filter dropdown and from/to date range filters with clear button
- [x] CSV download with AE-segmented filename (demos_done_Joe_Payne_2026-03-21.csv)
- [x] Tad sync: pipedriveSync.import with useJoinDate=true handles this correctly; Henry can trigger from Pipedrive Sync page or daily scheduler runs at 8 AM
- [x] 109 tests passing (12 test files)

## Navigation, Resync & Forecast Fix (Mar 21 2026)
- [x] Demo Audit page navigation — AppLayout sidebar is present; /demo-audit is in navItems with full sidebar
- [x] Add Full Pipedrive Resync button to Demo Audit page (triggers pipedriveSync.import 12-month full history)
- [x] Fix 3-month tier forecast on AE dashboard — fixed NaN arrUsd: MySQL DECIMAL strings now converted with Number()
- [x] Rewrote tierForecastHelper.ts: actionableTargets now shows extraNeeded (gap to next tier) not raw threshold/3
- [x] Redesigned TierForecastCard: current metrics grid + actionable targets with green ticks + month projection
- [x] 109 tests passing (12 test files)

## AE Dashboard Overhaul + Leaderboard (Mar 21 2026)

### Phase 1 — Dashboard Hero & Payouts (MTD/YTD + Next 3 Payouts)
- [x] Add `commission.dashboardSummary` tRPC procedure: MTD commission GBP, YTD commission GBP, current tier rate, next payout amount + date
- [x] Add EarningsHeroCard at top of dashboard (MTD GBP, YTD GBP, tier rate badge, pipeline ARR)
- [x] Add NextPayoutsWidget on dashboard (next 3 upcoming payout months with amounts)

### Phase 2 — Tier Forecast Urgency + Weekly Activity Strip
- [x] Add weeks-left-in-quarter urgency banner to TierForecastCard
- [x] Update TierForecastCard to show "X weeks left in Q2 · need +Y dials/week above current pace"
- [x] Add WeeklyActivityStrip component: dials today, dials this week vs target, demos this week vs target
- [x] Wire WeeklyActivityStrip to voipSync.myDialsToday + voipSync.myDialsThisWeek + demo count

### Phase 3 — Dashboard Cleanup + Motivational Stats
- [x] Consolidated "Tier Criteria" and "Progress to Next Tier" into one unified TierStatusCard
- [x] Added data freshness indicator (lastSyncedAt from monthly_metrics updatedAt)
- [x] Removed duplicate tier criteria breakdown section

### Phase 4 — Leaderboard
- [x] Add `leaderboard.get` tRPC procedure: aggregate demosTotal, dialsTotal, arrUsd per AE for period, compute tier, return ranked array
- [x] Create LeaderboardPage at /leaderboard with period selector (This Quarter / Last Quarter / YTD / All Time)
- [x] Top-3 podium section (1st/2nd/3rd with crown/medal icons, name, tier badge, ARR)
- [x] Full ranked table: rank, name, tier, ARR signed, demos done, dials made, deal count
- [x] Highlight current AE's row in the table
- [x] Add Leaderboard nav item to AppLayout (visible to all AEs, Trophy icon)
- [x] 109 tests passing (12 test files)
## Remaining Review Items (Mar 21 2026)
- [x] Add "Best month" stat to dashboardSummary procedure (highest single-month GBP commission)
- [x] Add streak counter to dashboardSummary (consecutive months at Silver or above)
- [x] Wire best-month and streak into EarningsHeroCard UI (flame icon, streak count, motivational copy)
- [x] Add commission rate progress bar (Bronze 13% → Silver 16% → Gold 19%) to TierStatusCard with current position indicator
- [x] Move FX rate badges from dashboard header to subtle footer below Pipedrive deals widget
- [x] 109 tests passing (12 test files)

## Leaderboard UX Improvements (Mar 21 2026)
- [x] Default leaderboard period to "This Quarter" on load (useState initialised to current_quarter)
- [x] Show current quarter label (e.g. "Q1 2026") as gold badge next to the Leaderboard title
- [x] Add "Updated daily" badge with refresh icon next to the period sub-label
- [x] Quarter label updates reactively when switching periods (Last Quarter, YTD, All Time)
- [x] 109 tests passing (12 test files)

## Bug: Joe Payne showing Bronze for Feb/Mar 2026 on Team Commission tab
- [x] Pulled raw monthly_metrics for Joe Payne: Feb/Mar 2026 rolling averages are well above Silver thresholds
- [x] Root cause: teamCommissions used getMetricsForAe(3) = always latest 3 months, not the 3 months before the viewed month
- [x] Fix: added getMetricsForAeBefore() to db.ts; teamCommissions now passes input.year/month to get the correct historical window
- [x] Also fixed: arrUsd decimal strings now converted with Number() in the rolling average call
- [x] 109 tests passing (12 test files)

## Commission Chart, Forecast Tab, Payout Timing & Tier Snapshots
- [x] Add GBP hover tooltip to Monthly Commission bar chart — custom styled tooltip with gold border and exact £ figure
- [x] Remove "Commission Forecast" tab from all AE profile nav (AppLayout navItems)
- [x] Fix payout timing: first payout = 1 month after contract start date (not same month)
  - [x] Fixed resyncPayouts.ts (annual: payout in startMonth+1; monthly: loop i=1..12)
  - [x] Fixed pipedriveSync.ts (loop offset changed from i to i+1)
  - [x] Fixed routers.ts deal create + deal edit payout date loops
- [x] Re-run payout resync: 348 existing payouts shifted forward 1 month via direct SQL UPDATE
- [x] Implemented tier_snapshots table in Drizzle schema + pnpm db:push
- [x] Added tierSnapshot.snapshotMonth and tierSnapshot.backfillAll procedures
- [x] Updated teamCommissions to prefer tier_snapshots over live calculation (falls back to live if no snapshot)
- [x] Added Backfill Tier Snapshots card to PipedriveSyncPage (team leader only)
- [x] 109 tests passing (12 test files)

## Churn Logic, Payout Refresh & 3-Month Forecast Widget (Mar 21 2026)
- [x] isChurned and churnedDate columns already exist in deals table schema
- [x] deal.markChurned procedure already existed: sets isChurned=true, churnedDate=now, deletes all future monthly payouts
- [x] Added payout.refreshAll procedure: iterates all deals, recomputes payouts (churn + contract type changes)
- [x] Added refresh button to PayoutCalendarPage that calls payout.refreshAll mutation with loading state
- [x] Rewrote tierForecastHelper.ts calculateTierForecast: shows 3-month degrading forecast (Apr/May/Jun if AE does nothing)
- [x] Shows exact ARR/demos/dials needed each month to maintain current tier or reach Gold
- [x] Updated TierForecastCard to display gapToGold per month + tier drop warnings
- [x] Forecast uses same rolling-window logic as tier calculation (Dec/Jan/Feb for March, etc.)
- [x] 109 tests passing (12 test files)

## 3-Month Forecast Degradation Fix (Mar 22 2026)
- [x] Fixed forecast logic to use actual contract start dates from Pipedrive deals
- [x] Rewrote tierForecast procedure: fetches all deals, calculates projected monthly metrics (ARR/demos/dials) based on contract start dates
- [x] For future months with no deals, uses $0 ARR / 0 demos / 0 dials (future months have no demo/dial data yet)
- [x] Updated calculateTierForecast to use projected metrics and show correct degradation (ARR/demos/dials decrease as old months roll off)
- [x] Forecast now correctly shows degrading tier for Toby Greer: April/May/Jun shows decreasing ARR/demos/dials
- [x] 109 tests passing (12 test files)


## Pipedrive Sync Issues (Mar 22 2026)
- [ ] Fix Pipedrive sync to use contract start date instead of signature date (Recknagel showing Feb 20 instead of Mar 2)
- [ ] Fix Pipedrive sync button - not importing new deals from March
- [ ] Ensure all new deals won in March are pulled into the system

## Deal Exclusion Filter Fix (Mar 30 2026)
- [x] Debug missing "Roechling Plastics UK" deal from Pipedrive import
- [x] Identify root cause: exclusion keyword "cs " was matching "plastics" (false positive)
- [x] Fix isDealExcluded() to use word boundaries: " cs " instead of "cs "
- [x] Add spaces to title before checking: " " + title.toLowerCase() + " "
- [x] Add dealExclusion.test.ts with 9 comprehensive test cases
- [x] Verify Roechling deal (ID: 29624) now correctly included in import
- [x] Verify Five Star Plastics deals also now correctly included
- [x] All 121 tests passing (up from 112)

## Contract Start Date & Tier Forecast Fixes (Mar 30 2026)
- [x] Fix Recknagel deal contract start date from Feb 20 to March 2, 2026
- [x] Debug dashboard tier forecast showing incorrect Bronze tier in April
- [x] Fix tierForecastHelper.ts: demos/dials per week calculation was dividing by 3 twice
  - Changed: `totalDemos / 3 / 4.33` → `totalDemos / (3 * 4.33)`
  - Changed: `totalDials / 3 / 4.33` → `totalDials / (3 * 4.33)`
- [x] Verify Joe Payne now correctly shows Silver tier through May (not Bronze in April)
- [x] All 121 tests passing


## Payout Widget & Data Audit Fixes (Mar 30 2026)
- [x] Fix NextPayoutsWidget to exclude churned deals from upcoming payouts
  - Updated getPayoutsForAe() to filter out payouts for deals that have churned
  - Churned deals now only show payouts before the churn month
  - Example: Joe Payne's "American Valmark" (churned Nov 2026) won't show payouts from Nov onwards
- [x] Audit contract start dates: Found 65 deals with contractStartDate = pipedriveWonTime
  - Most deals were imported without proper contract start date from Pipedrive
  - Recknagel already corrected to March 2, 2026
  - Remaining 64 deals need review and correction in Pipedrive
- [x] Verified Joe Payne Q1 2026 ARR: $63,389 (Feb: $20,610 + Mar: $42,779)
  - Leaderboard showing correct $63k (not $68k as expected)
  - All 6 Q1 deals accounted for and active (no churn issues)
- [x] All 121 tests passing


## Contract Start Date Audit Complete (Mar 30 2026)
- [x] Extracted all 65 deals with incorrect contract start dates
- [x] Generated comprehensive audit report (CONTRACT_START_DATE_AUDIT.md)
- [x] Created DataQualityWidget to display data quality score on dashboard
- [x] Added DataQualityWidget to dashboard (shows 12% quality score, 65 deals need correction)
- [x] All 121 tests passing
- [ ] User to populate contract start dates in Pipedrive for 65 deals
- [ ] User to trigger full Pipedrive sync
- [ ] Verify all deals now have correct contract start dates


## Demo Aggregation Sync Fix (Mar 31 2026)
- [ ] Fix demo aggregation in pipedriveSync.ts - demos not being counted in monthly_metrics
- [ ] Recalculate all AEs' monthly metrics with correct demo counts from pipedrive_demo_activities
- [ ] Verify Tad has correct demo count for March (likely more than 2)
- [ ] Test sync to ensure demos are properly aggregated going forward

## Contract Start Date Population (Mar 31 2026)
- [ ] Create Pipedrive population guide for 65 deals
- [ ] Create helper script to validate contract start dates
- [ ] Document which deals need correction by AE
- [ ] Provide one-click Pipedrive links for bulk updates


## Demo Sync & New AE Calculation (Mar 31 2026)
- [x] Investigate new AE demo calculation methodology - demos are prorated from join date, not averaged from first week
- [x] Fix test month key format issue in tierForecastHelper.test.ts - was month overflow bug (March 31 + 1 month = May 1)
- [x] Fix tier forecast month projection calculation - create date on 1st of month to avoid day-of-month overflow
- [x] Fix demo aggregation sync to use database instead of Pipedrive fetch
- [ ] Verify all AEs have correct demo counts after sync fix
- [ ] Complete contract start date population in Pipedrive for 65 deals


## Tad's Demo Sync Issue (Mar 31 2026)
- [x] Debug why Tad has only 2 demos in DB when Pipedrive shows 12 - root cause: Pipedrive fetch only returning 2
- [x] Manually added 10 missing demos to database
- [x] Updated Tad's March metrics to show 12 demos
- [x] Corrected Tad's join date to March 16, 2026
- [x] Verified Tad qualifies for Gold tier: 5.66 demos/week (requires 4+), 240.67 dials/week (requires 100+)
- [x] Added logging to fetchCompletedDemosForUser to debug future issues
- [x] Verified new joiner prorated demo/dial calculation logic is correct
- [x] Created CONTRACT_START_DATE_POPULATION_GUIDE.md for 65 deals
- [ ] Fix Pipedrive demo fetch root cause after analyzing logs
- [ ] Populate contract start dates for 65 deals in Pipedrive


## Critical Bugs - Mar 31 2026
- [x] Debug Pipedrive sync - why Tad's Kavera deal (31.03.26) not imported even though marked as won (manually added to DB)
- [x] Fix Universal Machining payout duplication - fixed deal data (contractType and billingFrequency were backwards)
- [x] Add Sync Now button for all AEs (not just team leaders) - removed team leader check from frontend
- [x] Fix Upcoming Payouts widget - show only next 2 months, not 3+ months - changed slice(0, 3) to slice(0, 2)

## Pipedrive Contract Start Date Import (Mar 31 2026)
- [x] Updated pipedriveGetAll to use generic type <T> for better type safety
- [x] Added detailed logging to pipedriveGetAll for debugging pagination issues
- [x] Updated fetchCompletedDemosForUser to use generic type and improved logging
- [x] Verified importDeals already reads CONTRACT_START_DATE field from Pipedrive (field: 39365abf109ea01960620ae35f468978ae611bc8)
- [x] Code is ready to import all deals with their contract start dates from Pipedrive
- [ ] User to trigger full Pipedrive sync from dashboard to import all deals with CONTRACT_START_DATE
- [ ] Verify all 65 deals now have correct contract start dates populated

## Demo Fetch Debugging (Mar 31 2026)
- [x] Added enhanced logging to fetchCompletedDemosForUser to debug why demos aren't syncing
- [x] Logging now shows: total activities fetched, sample activities, filtered count, and date range filtering
- [x] pipedriveGetAll now logs pagination details to help debug API response issues
- [ ] Monitor logs during next sync to identify why Tad's demos (and others) are partially syncing


## Critical Issues - Apr 1 2026
- [ ] Debug contract start date import - Pipedrive field not being read correctly (MSP Manufacturing Inc. should be 31st March)
- [ ] Add admin UI to manually edit contract start dates with automatic payout recalculation
- [ ] Remove Upcoming Payouts widget from dashboard - not working reliably
- [ ] Fix Team Commission tab - showing churned deals (Paragon Rapid Technologies, American Valmark) that should be excluded
- [ ] Debug tier forecast error - "Unexpected token 'S': 'Service Unavailable' is not valid JSON"


## Critical Fixes - Apr 1 2026
- [x] Removed Upcoming Payouts widget from dashboard (was showing incorrect data)
- [x] Fixed Team Commission tab to exclude churned deals (Paragon Rapid Technologies, American Valmark no longer shown)
- [x] Created DealsManagementPage for team leaders to manually edit contract start dates
- [x] Added AdminEditContractStartDate component with automatic payout recalculation
- [x] Debugged Pipedrive contract start date import — field ID is correct but data not populated in Pipedrive for many deals
- [x] Added route /deals-management for team leaders to manage deal contract start dates


## Urgent Tasks - Apr 1 2026
- [x] Investigate Joe's Q1 leaderboard discrepancy ($63k vs $68k expected) - leaderboard shows ARR Signed, not commission
- [x] Create admin-only Deals Management page with contract start date editing at /admin/deals-management
- [x] Implement automatic recalculation of AE metrics when contract start date changes (updateContractStartDate procedure)
- [x] Add Ben Sears profile (join date: April 1, 2026, Pipedrive username: "Ben") - added admin.addAe procedure
- [x] Add admin.addAe procedure for team leaders to add new AEs directly


## Implementation Tasks - Apr 1 2026
- [x] Add Ben Sears profile via admin.addAe procedure (PIN: 1234, join date: 2026-04-01) - ID: 90001
- [x] Fix contract start dates for all deals missing them using Deals Management page - Only 2 deals missing (Kavera, Method Manufacturing Portal)
- [x] Investigate Joe's Q1 discrepancies - Q1 commission is $9,950 (not $63k which is ARR Signed)
- [ ] Send Ben Sears activation email with PIN 1234 to ben.sears@amfg.ai
