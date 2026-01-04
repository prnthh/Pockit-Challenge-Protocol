// Test script for x402 facilitator server
const BASE_URL = 'http://localhost:3000';

async function testServer() {
  console.log('🧪 Testing x402 Facilitator Server\n');

  try {
    // Test 1: GET /supported
    console.log('1️⃣  Testing GET /supported');
    const supportedRes = await fetch(`${BASE_URL}/supported`);
    const supportedData = await supportedRes.json();
    console.log('✅ Response:', JSON.stringify(supportedData, null, 2));
    console.log('');

    // Test 2: POST /verify
    console.log('2️⃣  Testing POST /verify');
    const verifyRes = await fetch(`${BASE_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: {
          // Sample payment payload structure
          kind: 'evm',
          data: {}
        },
        paymentRequirements: {
          price: '0.001',
          network: 'base-sepolia'
        }
      })
    });
    const verifyData = await verifyRes.json();
    console.log(`Status: ${verifyRes.status}`);
    console.log('Response:', JSON.stringify(verifyData, null, 2));
    console.log('');

    // Test 3: POST /settle
    console.log('3️⃣  Testing POST /settle');
    const settleRes = await fetch(`${BASE_URL}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: {
          kind: 'evm',
          data: {}
        },
        paymentRequirements: {
          price: '0.001',
          network: 'base-sepolia'
        }
      })
    });
    const settleData = await settleRes.json();
    console.log(`Status: ${settleRes.status}`);
    console.log('Response:', JSON.stringify(settleData, null, 2));
    console.log('');

    console.log('✅ All tests completed!');
  } catch (error) {
    console.error('❌ Error testing server:', error.message);
    console.log('\n💡 Make sure the server is running: npm start');
  }
}

testServer();
