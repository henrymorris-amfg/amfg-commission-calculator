-- Resync All Commission Payouts with Churn Logic
-- Recalculates all payouts from scratch, excluding payouts after churn+30 days

-- Step 1: Delete all existing payouts
DELETE FROM commission_payouts;

-- Step 2: Annual contracts - single payout (unless churned before payout date)
INSERT INTO commission_payouts (
  aeId, dealId, payoutMonth, payoutYear,
  netCommissionGbp, netCommissionUsd,
  payoutNumber, grossCommissionUsd,
  referralDeductionUsd, onboardingDeductionGbp,
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
  d.arrUsd * 
    CASE 
      WHEN d.tierAtStart = 'gold' THEN 0.19
      WHEN d.tierAtStart = 'silver' THEN 0.16
      ELSE 0.13
    END as grossCommissionUsd,
  CASE WHEN d.isReferral THEN (d.arrUsd * 
    CASE 
      WHEN d.tierAtStart = 'gold' THEN 0.19
      WHEN d.tierAtStart = 'silver' THEN 0.16
      ELSE 0.13
    END * 0.5) ELSE 0 END as referralDeductionUsd,
  CASE WHEN d.onboardingFeePaid THEN 500 ELSE 0 END as onboardingDeductionGbp,
  COALESCE(d.fxRateAtWon, 0.738) as fxRateUsed
FROM deals d
WHERE d.contractType = 'annual' 
  AND d.contractStartDate IS NOT NULL 
  AND d.arrUsd > 0
  -- Exclude if churned before payout date
  AND NOT (
    d.isChurned = true 
    AND DATE_ADD(
      DATE(CONCAT_WS('-', d.churnYear, LPAD(d.churnMonth, 2, '0'), '01')), 
      INTERVAL 30 DAY
    ) < d.contractStartDate
  );

-- Step 3: Monthly contracts - 13 payouts (excluding those after churn+30 days)
INSERT INTO commission_payouts (
  aeId, dealId, payoutMonth, payoutYear,
  netCommissionGbp, netCommissionUsd,
  payoutNumber, grossCommissionUsd,
  referralDeductionUsd, onboardingDeductionGbp,
  fxRateUsed
)
SELECT 
  d.aeId,
  d.id,
  CASE 
    WHEN MONTH(d.contractStartDate) + m.month_offset > 12 THEN MONTH(d.contractStartDate) + m.month_offset - 12
    ELSE MONTH(d.contractStartDate) + m.month_offset
  END as payoutMonth,
  CASE 
    WHEN MONTH(d.contractStartDate) + m.month_offset > 12 THEN YEAR(d.contractStartDate) + FLOOR((MONTH(d.contractStartDate) + m.month_offset - 1) / 12)
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
  ) - CASE WHEN m.month_offset = 0 AND d.onboardingFeePaid THEN 500 ELSE 0 END) as netCommissionGbp,
  GREATEST(0, ((d.arrUsd / 12 * 
    CASE 
      WHEN d.tierAtStart = 'gold' THEN 0.19
      WHEN d.tierAtStart = 'silver' THEN 0.16
      ELSE 0.13
    END *
    CASE WHEN d.isReferral THEN 0.5 ELSE 1 END
  ) - (CASE WHEN m.month_offset = 0 AND d.onboardingFeePaid THEN 500 ELSE 0 END / COALESCE(d.fxRateAtWon, 0.738)))) as netCommissionUsd,
  m.month_offset + 1 as payoutNumber,
  d.arrUsd / 12 * 
    CASE 
      WHEN d.tierAtStart = 'gold' THEN 0.19
      WHEN d.tierAtStart = 'silver' THEN 0.16
      ELSE 0.13
    END as grossCommissionUsd,
  CASE WHEN d.isReferral THEN (d.arrUsd / 12 * 
    CASE 
      WHEN d.tierAtStart = 'gold' THEN 0.19
      WHEN d.tierAtStart = 'silver' THEN 0.16
      ELSE 0.13
    END * 0.5) ELSE 0 END as referralDeductionUsd,
  CASE WHEN m.month_offset = 0 AND d.onboardingFeePaid THEN 500 ELSE 0 END as onboardingDeductionGbp,
  COALESCE(d.fxRateAtWon, 0.738) as fxRateUsed
FROM deals d
CROSS JOIN (
  SELECT 0 as month_offset UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 
  UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12
) m
WHERE d.contractType = 'monthly' 
  AND d.contractStartDate IS NOT NULL 
  AND d.arrUsd > 0
  -- Exclude payouts after churn+30 days
  AND NOT (
    d.isChurned = true 
    AND DATE_ADD(
      DATE(CONCAT_WS('-', d.churnYear, LPAD(d.churnMonth, 2, '0'), '01')), 
      INTERVAL 30 DAY
    ) < DATE_ADD(d.contractStartDate, INTERVAL m.month_offset MONTH)
  );

-- Step 4: Verify results
SELECT 
  COUNT(*) as total_payouts,
  COUNT(DISTINCT dealId) as deals_with_payouts,
  SUM(netCommissionGbp) as total_gbp,
  SUM(netCommissionUsd) as total_usd
FROM commission_payouts;
