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
