import fetch from 'node-fetch';

async function main() {
  const baseUrl = 'http://localhost:3000/api/trpc';
  
  // Call the dashboard endpoint for Tad (aeId: 60001)
  const response = await fetch(`${baseUrl}/dashboard.me?input=${encodeURIComponent(JSON.stringify({}))}`, {
    headers: {
      'X-AE-Token': 'eyJhZUlkIjo2MDAwMSwiYWVOYW1lIjoiVGFkIFRhbXVsZXZpY2l1cyJ9',
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  console.log('Dashboard Response:', JSON.stringify(data, null, 2));
  
  if (data.result?.data) {
    console.log('\nTier:', data.result.data.currentTier);
    console.log('Metrics:', {
      avgArrUsd: data.result.data.avgArrUsd,
      avgDemosPw: data.result.data.avgDemosPw,
      avgDialsPw: data.result.data.avgDialsPw
    });
  }
}

main().catch(console.error);
