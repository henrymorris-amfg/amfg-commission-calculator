// Update Tad's Kavera deal value via tRPC API
// €4,588 EUR = $5,046.80 USD (using 1.1 EUR/USD rate)

const API_URL = 'http://localhost:3000/api/trpc';

async function updateKavera() {
  try {
    // First, get all deals to find Kavera's ID
    console.log('Fetching all AEs...');
    const aesRes = await fetch(`${API_URL}/ae.listNames?input={}`);
    const aesData = await aesRes.json();
    console.log('AEs:', aesData.result.data.map(ae => ({ id: ae.id, name: ae.name })));

    // Find Tad (ID should be 3)
    const tad = aesData.result.data.find(ae => ae.name === 'Tad Tamulevicius');
    console.log('Tad:', tad);

    if (!tad) {
      console.error('Tad not found');
      return;
    }

    // Get Tad's deals
    console.log(`\nFetching Tad's deals...`);
    const dealsRes = await fetch(`${API_URL}/deals.list?input={"aeId":${tad.id}}`);
    const dealsData = await dealsRes.json();
    console.log('Tad\'s deals:', dealsData.result.data);

    // Find Kavera
    const kavera = dealsData.result.data.find(d => d.customerName === 'Kavera');
    console.log('\nKavera deal:', kavera);

    if (!kavera) {
      console.error('Kavera deal not found');
      return;
    }

    // Update Kavera value
    const usdValue = 4588 * 1.1; // €4,588 EUR = $5,046.80 USD
    console.log(`\nUpdating Kavera to $${usdValue.toFixed(2)} USD...`);

    // Note: This requires authentication as a team leader
    // For now, just log what needs to be done
    console.log(`\nTo update via admin panel:`);
    console.log(`- Deal ID: ${kavera.id}`);
    console.log(`- Original Amount USD: ${usdValue.toFixed(2)}`);
    console.log(`- ARR USD: ${usdValue.toFixed(2)}`);
    console.log(`\nCall: admin.updateDealValue with these values`);

  } catch (err) {
    console.error('Error:', err.message);
  }
}

updateKavera();
