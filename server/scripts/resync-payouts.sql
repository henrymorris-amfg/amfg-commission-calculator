-- Resync All Commission Payouts
-- Recalculates all payouts from scratch based on deals and commission structure

-- Step 1: Get all deals and generate payouts
-- For ANNUAL contracts: 1 payout in start month
-- For MONTHLY contracts: 13 payouts (start month + 12 future months)

-- Annual contracts - single payout
INSERT INTO commission_payouts (
  aeId, dealId, payoutMonth, payoutYear,
  netCommissionGbp, netCommissionUsd,
  payoutNumber, totalPayouts,
  fxRateUsed
)
SELECT 
  d.aeId,
  d.id,
  MONTH(d.contractStartDate) as payoutMonth,
  YEAR(d.contractStartDate) as payoutYear,
  GREATEST(0, (d.arrUsd * 
    CASE 
      WHEN d.tierAtStart = 'gold' THEN 0.19
      WHEN d.tierAtStart = 'silver' THEN 0.16
      ELSE 0.13
    END *
    COALESCE(d.fxRateAtWon, 0.738) *
    CASE WHEN d.isReferral THEN 0.5 ELSE 1 END
  ) - CASE WHEN d.onboardingFeePaid THEN 500 ELSE 0 END) as netCommissionGbp,
  GREATEST(0, ((d.arrUsd * 
    CASE 
      WHEN d.tierAtStart = 'gold' THEN 0.19
      WHEN d.tierAtStart = 'silver' THEN 0.16
      ELSE 0.13
    END *
    CASE WHEN d.isReferral THEN 0.5 ELSE 1 END
  ) - (CASE WHEN d.onboardingFeePaid THEN 500 ELSE 0 END / COALESCE(d.fxRateAtWon, 0.738)))) as netCommissionUsd,
  1 as payoutNumber,
  1 as totalPayouts,
  COALESCE(d.fxRateAtWon, 0.738) as fxRateUsed
FROM deals d
WHERE d.contractType = 'annual' AND d.contractStartDate IS NOT NULL AND d.arrUsd > 0;

-- Monthly contracts - 13 payouts
-- This is more complex, so we'll use a stored procedure approach
-- For now, let's insert the first month and then add future months

-- Insert monthly payouts (months 0-12)
INSERT INTO commission_payouts (
  aeId, dealId, payoutMonth, payoutYear,
  netCommissionGbp, netCommissionUsd,
  payoutNumber, totalPayouts,
  fxRateUsed
)
SELECT 
  d.aeId,
  d.id,
  CASE 
    WHEN MONTH(d.contractStartDate) + month_offset > 12 THEN MONTH(d.contractStartDate) + month_offset - 12
    ELSE MONTH(d.contractStartDate) + month_offset
  END as payoutMonth,
  CASE 
    WHEN MONTH(d.contractStartDate) + month_offset > 12 THEN YEAR(d.contractStartDate) + FLOOR((MONTH(d.contractStartDate) + month_offset - 1) / 12)
    ELSE YEAR(d.contractStartDate)
  END as payoutYear,
  GREATEST(0, (d.arrUsd / 12 * 
    CASE 
      WHEN d.tierAtStart = 'gold' THEN 0.19
      WHEN d.tierAtStart = 'silver' THEN 0.16
      ELSE 0.13
    END *
    COALESCE(d.fxRateAtWon, 0.738) *
    CASE WHEN d.isReferral THEN 0.5 ELSE 1 END
  ) - CASE WHEN month_offset = 0 AND d.onboardingFeePaid THEN 500 ELSE 0 END) as netCommissionGbp,
  GREATEST(0, ((d.arrUsd / 12 * 
    CASE 
      WHEN d.tierAtStart = 'gold' THEN 0.19
      WHEN d.tierAtStart = 'silver' THEN 0.16
      ELSE 0.13
    END *
    CASE WHEN d.isReferral THEN 0.5 ELSE 1 END
  ) - (CASE WHEN month_offset = 0 AND d.onboardingFeePaid THEN 500 ELSE 0 END / COALESCE(d.fxRateAtWon, 0.738)))) as netCommissionUsd,
  month_offset + 1 as payoutNumber,
  13 as totalPayouts,
  COALESCE(d.fxRateAtWon, 0.738) as fxRateUsed
FROM deals d
CROSS JOIN (
  SELECT 0 as month_offset UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 
  UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12
) months
WHERE d.contractType = 'monthly' AND d.contractStartDate IS NOT NULL AND d.arrUsd > 0;

-- Verify results
SELECT 
  COUNT(*) as total_payouts,
  COUNT(DISTINCT dealId) as deals_with_payouts,
  SUM(netCommissionGbp) as total_gbp,
  SUM(netCommissionUsd) as total_usd
FROM commission_payouts;
