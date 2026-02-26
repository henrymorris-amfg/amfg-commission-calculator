import mysql from 'mysql2/promise';

// Known deals that need EUR/GBP conversion
const dealsToUpdate = [
  { customerName: 'Recknagel', originalCurrency: 'EUR', originalAmount: 22000 },
  { customerName: 'Apollo', originalCurrency: 'GBP', originalAmount: 20000 },
];

const EUR_TO_USD = 1.08;
const GBP_TO_USD = 1.27;

async function backfillCurrencies() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  try {
    for (const deal of dealsToUpdate) {
      const conversionRate = deal.originalCurrency === 'EUR' ? EUR_TO_USD : deal.originalCurrency === 'GBP' ? GBP_TO_USD : 1.0;
      const arrUsd = deal.originalAmount * conversionRate;
      
      const query = `
        UPDATE deals 
        SET 
          originalAmount = ?,
          originalCurrency = ?,
          arrUsd = ?,
          conversionRate = ?
        WHERE customerName = ? AND originalCurrency = 'USD'
      `;
      
      const result = await connection.execute(query, [
        deal.originalAmount,
        deal.originalCurrency,
        arrUsd.toFixed(2),
        conversionRate.toFixed(6),
        deal.customerName,
      ]);
      
      console.log(`✓ Updated ${deal.customerName}: ${deal.originalAmount} ${deal.originalCurrency} → $${arrUsd.toFixed(2)} USD`);
    }
    
    console.log('\n✓ Backfill complete!');
  } catch (error) {
    console.error('Error during backfill:', error);
  } finally {
    await connection.end();
  }
}

backfillCurrencies();
