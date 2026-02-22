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
