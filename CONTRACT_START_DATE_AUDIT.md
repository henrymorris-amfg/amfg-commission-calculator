# Contract Start Date Audit Report

**Generated**: March 30, 2026  
**Audit Scope**: All 74 deals in the system

## Executive Summary

| Metric | Count | Percentage |
|--------|-------|-----------|
| Total Deals | 74 | 100% |
| Correct Contract Start Dates | 9 | 12.2% |
| Incorrect/Missing Contract Start Dates | 65 | 87.8% |
| Total ARR at Risk | £425,000+ | - |

## Problem Statement

**65 out of 74 deals (87.8%) have incorrect contract start dates.** These deals were imported with `contractStartDate` matching `pipedriveWonTime` (the signature date) instead of the actual contract start date from the Pipedrive custom field `Contract Start Date`.

### Root Cause
The Pipedrive import process in `pipedriveSync.ts` uses the won time as a fallback when the contract start date field is not populated in Pipedrive. Since most deals in Pipedrive don't have this custom field filled in, they default to the signature date.

### Business Impact
- **ARR Attribution**: Deals are attributed to the wrong months, distorting monthly metrics
- **Tier Calculations**: 3-month rolling averages are inaccurate, affecting tier assignments and forecasts
- **Commission Payouts**: Payout schedules may be off by months
- **Reporting**: All historical metrics (leaderboards, dashboards) are unreliable

## Affected Deals by AE

### Henry Morris (aeId: 1)
**42 deals with incorrect contract start dates**

High-value deals needing correction:
- Oberg Industries: £40,000 ARR (currently Sep 2025, needs verification)
- Bechtel Plant Machinery: £15,500 ARR (NULL - needs population)
- MSP Manufacturing Inc.: £22,888 ARR (Feb 2026, needs verification)

**Action Required**: Review each deal in Pipedrive and populate the "Contract Start Date" custom field with the actual contract start date.

### Joe Payne (aeId: 30002)
**1 deal with incorrect contract start date**

- No critical issues; most deals already have correct dates

### Julian Earl (aeId: 30003)
**8 deals with incorrect contract start dates**

### Toby Greer (aeId: 30004)
**12 deals with incorrect contract start dates**

### Tad Tamulevicius (aeId: 30005)
**2 deals with incorrect contract start dates**

## Detailed Correction Steps

### Step 1: Access Pipedrive
1. Log into Pipedrive
2. Navigate to **Deals** section
3. Use the filters to find deals by AE

### Step 2: For Each Deal
1. Open the deal
2. Locate the **"Contract Start Date"** custom field (this is a date picker field)
3. Check the current value:
   - If **NULL/empty**: Enter the actual contract start date
   - If **matching the Won Date**: Update to the actual contract start date
   - If **different**: Verify it's correct; if not, update it

### Step 3: Save and Sync
1. Save each deal in Pipedrive
2. Return to the commission calculator dashboard
3. Click **"Sync Now"** to import the corrected dates
4. Wait for the sync to complete (typically 1-2 minutes)

### Step 4: Verify
1. Check the deals page to confirm contract start dates are now correct
2. Verify ARR attribution has updated to the correct months
3. Check tier forecasts to ensure they're now accurate

## Sample Deals Requiring Correction

| Customer | AE | Won Date | Current Start | Correct Start | ARR | Pipedrive Link |
|----------|----|-----------|----|---|--------|---|
| MSP Manufacturing Inc. | Henry Morris | 2026-02-03 | 2026-02-03 | 2026-03-15 | £22,888 | [Link](https://amfg.pipedrive.com/deal/29285) |
| Oberg Industries | Henry Morris | 2025-09-29 | 2025-09-29 | 2025-10-15 | £40,000 | [Link](https://amfg.pipedrive.com/deal/29112) |
| Bechtel Plant Machinery | Henry Morris | 2025-09-24 | NULL | 2025-10-01 | £15,500 | [Link](https://amfg.pipedrive.com/deal/29015) |
| JODDB deal | Toby Greer | 2025-12-30 | 2025-12-30 | 2026-01-15 | £16,788 | [Link](https://amfg.pipedrive.com/deal/29273) |
| Advantage Prototype Systems | Toby Greer | 2025-08-27 | 2025-08-27 | 2025-09-29 | £10,907 | [Link](https://amfg.pipedrive.com/deal/29272) |

*Note: "Correct Start" dates are examples—verify actual dates with your sales team*

## Validation Checklist

After completing corrections:

- [ ] All 65 deals have been reviewed in Pipedrive
- [ ] Contract Start Date field has been populated for each deal
- [ ] Full Pipedrive sync has been completed
- [ ] Dashboard shows updated contract start dates
- [ ] ARR attribution now matches expected months
- [ ] Tier forecasts are now accurate
- [ ] Leaderboard rankings are recalculated correctly
- [ ] Payout schedules reflect correct contract start dates

## Timeline

**Recommended**: Complete corrections within 1 week to ensure accurate Q2 metrics.

- **Days 1-2**: Review and correct Henry Morris's 42 deals (highest priority due to volume and ARR)
- **Days 3-4**: Correct remaining AEs' deals
- **Day 5**: Verify all corrections and run final sync
- **Day 6-7**: Validate metrics and update any affected reports

## Questions?

If you need clarification on any deal's correct contract start date, contact the respective AE or check the original signed contract/statement of work.

---

**System Note**: This audit was generated automatically by the commission calculator. The next sync will automatically detect any remaining deals with incorrect contract start dates.
