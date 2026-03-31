import fetch from 'node-fetch';

async function triggerSync() {
  try {
    // Call the internal sync endpoint
    const response = await fetch('http://localhost:3000/api/trpc/system.syncPipedrive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    
    if (!response.ok) {
      console.error(`HTTP ${response.status}: ${response.statusText}`);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }
    
    const data = await response.json();
    console.log('Sync triggered successfully!');
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error triggering sync:', error.message);
  }
}

triggerSync();
