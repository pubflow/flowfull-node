// Test script to verify session cache and user_id handling
// Run with: node test-session-cache.js

const BASE_URL = 'http://localhost:3001/bridge-payment';
const SESSION_ID = '1dc72119bc5eb3a74bfda3d73da59a5f71b1086a';

async function testSessionCachePerformance() {
  console.log('🧪 Testing Session Cache Performance...\n');
  
  const requests = [];
  const timings = [];
  
  // Make 5 consecutive requests to test cache
  for (let i = 1; i <= 5; i++) {
    console.log(`📡 Request ${i}/5...`);
    
    const start = Date.now();
    try {
      const response = await fetch(`${BASE_URL}/payments`, {
        headers: {
          'Authorization': `Bearer ${SESSION_ID}`,
          'Content-Type': 'application/json'
        }
      });
      
      const duration = Date.now() - start;
      const data = await response.json();
      
      timings.push(duration);
      
      console.log(`   ⏱️  Duration: ${duration}ms`);
      console.log(`   📊 Status: ${response.status}`);
      console.log(`   👤 User ID: ${data.user_context?.user_id || 'N/A'}`);
      console.log(`   🎯 User Type: ${data.user_context?.user_type || 'N/A'}`);
      console.log(`   📧 Email: ${data.user_context?.user_email || 'N/A'}`);
      console.log(`   🔍 Search Method: ${data.user_context?.search_method || 'N/A'}`);
      console.log('');
      
      // Store request info
      requests.push({
        request: i,
        duration,
        status: response.status,
        success: data.success,
        authenticated: data.user_context?.authenticated,
        userId: data.user_context?.user_id,
        userType: data.user_context?.user_type,
        searchMethod: data.user_context?.search_method
      });
      
    } catch (error) {
      console.error(`   ❌ Request ${i} failed:`, error.message);
      timings.push(null);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Analyze results
  console.log('📊 Cache Performance Analysis:');
  console.log('================================');
  
  const validTimings = timings.filter(t => t !== null);
  if (validTimings.length > 1) {
    const firstRequest = validTimings[0];
    const subsequentRequests = validTimings.slice(1);
    const avgSubsequent = subsequentRequests.reduce((a, b) => a + b, 0) / subsequentRequests.length;
    
    console.log(`🚀 First request (backend validation): ${firstRequest}ms`);
    console.log(`⚡ Average subsequent requests (cache): ${Math.round(avgSubsequent)}ms`);
    console.log(`📈 Speed improvement: ${Math.round((firstRequest / avgSubsequent) * 100) / 100}x faster`);
    
    if (avgSubsequent < firstRequest * 0.5) {
      console.log('✅ Cache is working effectively!');
    } else {
      console.log('⚠️  Cache might not be working optimally');
    }
  }
  
  // Check consistency
  console.log('\n🔍 Data Consistency Check:');
  console.log('==========================');
  
  const userIds = [...new Set(requests.map(r => r.userId).filter(Boolean))];
  const userTypes = [...new Set(requests.map(r => r.userType).filter(Boolean))];
  const searchMethods = [...new Set(requests.map(r => r.searchMethod).filter(Boolean))];
  
  console.log(`👤 Unique User IDs: ${userIds.length} (${userIds.join(', ')})`);
  console.log(`🎯 Unique User Types: ${userTypes.length} (${userTypes.join(', ')})`);
  console.log(`🔍 Unique Search Methods: ${searchMethods.length} (${searchMethods.join(', ')})`);
  
  if (userIds.length === 1 && userTypes.length === 1 && searchMethods.length === 1) {
    console.log('✅ All requests returned consistent user data');
  } else {
    console.log('❌ Inconsistent user data across requests');
  }
  
  return requests;
}

async function testUserIdFiltering() {
  console.log('\n🧪 Testing user_id Filtering for Authenticated Users...\n');
  
  try {
    const response = await fetch(`${BASE_URL}/payments?limit=5`, {
      headers: {
        'Authorization': `Bearer ${SESSION_ID}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    console.log('📊 User ID Filtering Results:');
    console.log('=============================');
    console.log(`📈 Status: ${response.status}`);
    console.log(`✅ Success: ${data.success}`);
    console.log(`👤 Authenticated: ${data.user_context?.authenticated}`);
    console.log(`🆔 User ID: ${data.user_context?.user_id}`);
    console.log(`🎯 User Type: ${data.user_context?.user_type}`);
    console.log(`🔍 Search Method: ${data.user_context?.search_method}`);
    console.log(`📊 Total Payments: ${data.meta?.total || 0}`);
    console.log(`📄 Returned Payments: ${data.data?.length || 0}`);
    
    if (data.data && data.data.length > 0) {
      console.log('\n💳 Payment Ownership Verification:');
      console.log('==================================');
      
      const userIdFromContext = data.user_context?.user_id;
      let allOwnedByUser = true;
      
      data.data.forEach((payment, index) => {
        const isOwned = payment.user_id === userIdFromContext;
        console.log(`   Payment ${index + 1}: ${payment.id}`);
        console.log(`     - Owner: ${payment.user_id}`);
        console.log(`     - Matches User: ${isOwned ? '✅' : '❌'}`);
        
        if (!isOwned) {
          allOwnedByUser = false;
        }
      });
      
      if (allOwnedByUser) {
        console.log('\n✅ All payments belong to the authenticated user');
      } else {
        console.log('\n❌ Some payments do not belong to the authenticated user');
      }
    } else {
      console.log('\n📝 No payments found for this user');
    }
    
  } catch (error) {
    console.error('❌ User ID filtering test error:', error.message);
  }
}

async function testDifferentAuthMethods() {
  console.log('\n🧪 Testing Different Auth Methods with Same Session...\n');
  
  const methods = [
    {
      name: 'Authorization Bearer',
      headers: { 'Authorization': `Bearer ${SESSION_ID}` }
    },
    {
      name: 'X-Session-ID Header',
      headers: { 'X-Session-ID': SESSION_ID }
    },
    {
      name: 'session_id Parameter',
      url: `${BASE_URL}/payments?session_id=${SESSION_ID}`,
      headers: {}
    }
  ];
  
  const results = [];
  
  for (const method of methods) {
    console.log(`📡 Testing ${method.name}...`);
    
    const start = Date.now();
    try {
      const url = method.url || `${BASE_URL}/payments`;
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...method.headers
        }
      });
      
      const duration = Date.now() - start;
      const data = await response.json();
      
      console.log(`   ⏱️  Duration: ${duration}ms`);
      console.log(`   📊 Status: ${response.status}`);
      console.log(`   👤 User ID: ${data.user_context?.user_id || 'N/A'}`);
      console.log(`   🎯 User Type: ${data.user_context?.user_type || 'N/A'}`);
      console.log('');
      
      results.push({
        method: method.name,
        duration,
        status: response.status,
        userId: data.user_context?.user_id,
        userType: data.user_context?.user_type,
        authenticated: data.user_context?.authenticated
      });
      
    } catch (error) {
      console.error(`   ❌ ${method.name} failed:`, error.message);
      results.push({
        method: method.name,
        error: error.message
      });
    }
  }
  
  // Analyze consistency across methods
  console.log('🔍 Auth Method Consistency Check:');
  console.log('=================================');
  
  const userIds = [...new Set(results.map(r => r.userId).filter(Boolean))];
  const userTypes = [...new Set(results.map(r => r.userType).filter(Boolean))];
  
  console.log(`👤 Unique User IDs: ${userIds.length} (${userIds.join(', ')})`);
  console.log(`🎯 Unique User Types: ${userTypes.length} (${userTypes.join(', ')})`);
  
  if (userIds.length === 1 && userTypes.length === 1) {
    console.log('✅ All auth methods returned consistent user data');
  } else {
    console.log('❌ Inconsistent user data across auth methods');
  }
  
  return results;
}

async function runAllTests() {
  console.log('🚀 Starting Session Cache and User ID Tests\n');
  console.log(`🔑 Using Session ID: ${SESSION_ID.substring(0, 8)}...\n`);
  
  const cacheResults = await testSessionCachePerformance();
  await testUserIdFiltering();
  const authResults = await testDifferentAuthMethods();
  
  console.log('\n✅ All tests completed!');
  console.log('\n📋 Summary:');
  console.log('===========');
  console.log('✅ Session cache performance tested');
  console.log('✅ User ID filtering verified');
  console.log('✅ Multiple auth methods tested');
  console.log('✅ Data consistency checked');
  
  console.log('\n🔧 Expected Behavior:');
  console.log('=====================');
  console.log('1. First request should be slower (backend validation)');
  console.log('2. Subsequent requests should be faster (cache hit)');
  console.log('3. All payments should belong to the authenticated user');
  console.log('4. All auth methods should return same user data');
  console.log('5. Search method should be "user_id" for authenticated users');
}

// Run tests
runAllTests().catch(console.error);
