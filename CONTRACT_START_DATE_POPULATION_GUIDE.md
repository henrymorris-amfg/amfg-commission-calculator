# Contract Start Date Population Guide

## Overview

65 out of 74 deals (87.8%) are missing correct "Contract Start Date" values in Pipedrive. These deals currently use the signature date (won_time) instead of the actual contract start date, which affects ARR attribution and commission calculations.

**Total ARR at Risk: £425,000+**

## Why This Matters

- **ARR Attribution**: The contract start date determines which month the deal's ARR is counted
- **Commission Calculation**: Incorrect dates affect tier calculations and payouts
- **3-Month Rolling Average**: Used to determine tier (Bronze/Silver/Gold) - wrong dates skew this

## Deals Needing Updates by AE

| AE | Deal Count | ARR at Risk |
|---|---|---|
| Henry Morris | 42 | £287,000 |
| Toby Greer | 15 | £98,000 |
| Joe Payne | 8 | £40,000 |

## How to Update Contract Start Dates

### Step 1: Open Pipedrive Deal

1. Go to https://app.pipedrive.com
2. Navigate to **Deals** section
3. Find the deal that needs updating

### Step 2: Locate Contract Start Date Field

1. Click on the deal to open its details
2. Scroll down to find the custom field: **"Contract Start Date"**
3. If you don't see it, click **"Add field"** and search for "Contract Start Date"

### Step 3: Enter the Date

1. Click on the "Contract Start Date" field
2. Enter the date when the contract actually starts (not when it was signed)
3. Format: **YYYY-MM-DD** (e.g., 2026-03-31)
4. Click **Save**

### Step 4: Verify

After updating all deals, the system will automatically re-sync and:
- Update ARR attribution to the correct month
- Recalculate tier forecasts
- Adjust commission calculations

## Common Issues

### "I don't know the contract start date"

- Check the deal notes or email confirmations
- Ask the customer when their contract begins
- If unknown, use the signature date as a temporary placeholder

### "The field doesn't appear"

- Refresh your browser (Ctrl+R or Cmd+R)
- Check if you have permission to edit this field (contact admin if not)
- The field may be hidden - click "Show more fields" if available

### "Changes aren't showing in the calculator"

- Wait 5-10 minutes for the sync to run automatically
- Or manually trigger sync from the dashboard "Sync Now" button

## Bulk Update Option

If you have many deals to update, you can:

1. Export deals to CSV from Pipedrive
2. Update the "Contract Start Date" column
3. Re-import the CSV
4. Trigger a full sync

## Questions?

Contact the development team if you encounter any issues or need clarification.

---

**Last Updated**: March 31, 2026
**Status**: 65 deals pending (87.8%)
