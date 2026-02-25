# Monthly Contract Commission Analysis

**Date:** February 25, 2026  
**Issue:** Verify that monthly contracts apply (ARR ÷ 12) × tier rate per month, paid over 13 months

---

## Executive Summary

The commission calculation system is **correctly implemented** in the code. The `calculateCommission` function properly applies the formula:
- **Annual:** ARR × tier rate (paid upfront in 1 payout)
- **Monthly:** (ARR ÷ 12) × tier rate (paid monthly for 13 months)

However, **all 69 deals in the database are currently set to "annual"** contract type. The MSP Manufacturing Inc deal shown in your screenshot is currently annual but has a toggle button ready to switch it to monthly.

---

## Code Verification

### calculateCommission Function (shared/commission.ts, lines 209-273)

```typescript
// Line 229-232: Correct monthly calculation
const payoutAmountUsd =
  input.contractType === "annual"
    ? effectiveArrUsd * rate
    : (effectiveArrUsd / 12) * rate;  // ✓ Divides by 12 for monthly
```

**Verification:** ✓ Code is correct

---

## MSP Manufacturing Inc Deal Analysis

**Current State (Annual):**
- ARR: $22,888
- Tier: Bronze (13% rate)
- Contract Type: Annual
- Calculation: $22,888 × 0.13 = $2,975.44 (1 payout)
- Current Payout: £2,204.80 (1 upfront payment)

**If Toggled to Monthly:**
- Monthly ARR: $22,888 ÷ 12 = $1,907.33
- Monthly Commission: $1,907.33 × 0.13 = $247.95
- Monthly Payout: £183.73 (at 0.741 FX rate)
- Total for 13 months: £2,388.53

**Difference:** £183.90 more over 13 months (spread across payments)

---

## Current Database State

| Contract Type | Count | Status |
|---------------|-------|--------|
| Annual | 69 | All deals currently annual |
| Monthly | 0 | No monthly contracts yet |

**Finding:** All deals are set to annual. The toggle button allows switching individual deals to monthly.

---

## Toggle Button Implementation

**Location:** DealsPage.tsx, lines 430-441

The toggle button is **working correctly**:
1. Detects current contract type
2. Calls `updateDealMutation` with opposite type
3. Backend recalculates commission payouts
4. UI updates to show new payout structure

**Flow:**
```
User clicks "→ Monthly" button
  ↓
updateDealMutation called with contractType: "monthly"
  ↓
Backend deals.update mutation executes:
  - Updates deals.contractType to "monthly"
  - Calls calculateCommission with new type
  - Deletes old payouts (1 annual payout)
  - Creates new payouts (13 monthly payouts)
  ↓
UI invalidates and refreshes
  ↓
User sees "→ Annual" button and 13 monthly payouts
```

---

## Verification Results

### ✓ Calculation Logic
- Monthly formula: (ARR ÷ 12) × tier rate ✓
- Applied correctly in calculateCommission ✓
- Payout schedule generates 13 items for monthly ✓

### ✓ Backend Mutation
- deals.update properly recalculates ✓
- Deletes old payouts before creating new ones ✓
- Uses correct FX rate (fxRateAtWon) ✓

### ✓ Frontend UI
- Toggle button shows correct next action ✓
- Calls mutation with correct parameters ✓
- Displays payout count (1 vs 13) ✓

### ⚠️ Current State
- MSP Manufacturing Inc is annual (needs toggle to monthly)
- All 69 deals are annual
- Toggle functionality is ready to use

---

## Recommendations

### For MSP Manufacturing Inc Deal
1. Click the "→ Monthly" button on the deal card
2. System will recalculate: 13 × £183.73 = £2,388.53 total
3. Payouts will appear monthly starting from February 2026

### For Other Monthly Contracts
1. Identify which deals should be monthly (from Pipedrive billing frequency)
2. Toggle each deal individually using the button
3. Or: Re-import deals from Pipedrive to auto-set billing frequency

### Future Improvement
The `billingFrequency` field is already captured from Pipedrive but not yet used to auto-set contract type. Consider:
1. Update importDeals to use Pipedrive billing frequency as default contract type
2. Add bulk toggle feature for multiple deals at once
3. Add warning when toggling deals with existing payouts

---

## Conclusion

The monthly contract commission calculation system is **fully functional and correct**. The formula (ARR ÷ 12) × tier rate is properly implemented and applied. The toggle button works as designed to switch between annual and monthly payment structures.

**Status:** ✓ System working correctly | ⏳ Awaiting user action to toggle deals to monthly

---

**Report Generated:** February 25, 2026  
**Prepared by:** Manus AI
