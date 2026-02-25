import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Update Apollo's FX rate to correct value
await conn.execute(
  'UPDATE deals SET fxRateAtEntry = ? WHERE id = ?',
  [0.7850, 90065]
);

// Delete old payouts
await conn.execute('DELETE FROM commission_payouts WHERE dealId = ?', [90065]);

// Get deal details
const [deals] = await conn.execute(
  'SELECT id, arrUsd, tierAtStart, onboardingFeePaid, isReferral FROM deals WHERE id = ?',
  [90065]
);

const deal = deals[0];
console.log('Deal:', deal);

// Calculate new payouts with correct FX rate
const rate = 0.19; // gold tier
const effectiveArr = deal.onboardingFeePaid ? deal.arrUsd : Math.max(0, deal.arrUsd - 5000);
const payoutUsd = effectiveArr * rate; // annual = 1 payout
const netUsd = deal.isReferral ? payoutUsd * 0.5 : payoutUsd;
const netGbp = netUsd * 0.7850; // no onboarding deduction on annual

console.log(`Payout: $${payoutUsd.toFixed(2)} USD = £${netGbp.toFixed(2)} GBP`);

// Insert new payout
await conn.execute(
  `INSERT INTO commission_payouts 
   (dealId, aeId, payoutYear, payoutMonth, payoutNumber, grossCommissionUsd, referralDeductionUsd, onboardingDeductionGbp, netCommissionUsd, fxRateUsed, netCommissionGbp)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [90065, 30002, 2025, 12, 1, payoutUsd.toString(), '0', '0', netUsd.toString(), '0.7850', netGbp.toString()]
);

console.log('Payouts recalculated');
conn.end();
