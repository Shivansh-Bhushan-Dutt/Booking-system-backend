/**
 * Test WordPress API Connection and Departure Schedule
 * Run this to verify:
 * 1. WordPress API is accessible
 * 2. ACF plugin is working
 * 3. departure_schedule field is exposed
 * 4. JSON data is being returned
 */

const axios = require('axios');

const WORDPRESS_URL = process.env.WORDPRESS_API_URL || 'https://immersivetrips.in';
const API_URL = `${WORDPRESS_URL}/wp-json/wp/v2`;

async function testWordPressAPI() {
  console.log('\n🔍 Testing WordPress API Connection...\n');
  console.log(`Target URL: ${WORDPRESS_URL}`);
  console.log('='.repeat(60));

  try {
    // Test 1: Check if WordPress API is accessible
    console.log('\n📡 Test 1: Checking WordPress REST API...');
    const apiRoot = await axios.get(`${WORDPRESS_URL}/wp-json`);
    console.log('✅ WordPress API is accessible');
    console.log(`   Site Name: ${apiRoot.data.name}`);
    console.log(`   Site URL: ${apiRoot.data.url}`);

    // Test 2: Fetch all itineraries
    console.log('\n📋 Test 2: Fetching all itineraries...');
    const toursResponse = await axios.get(`${API_URL}/itinerary`, {
      params: {
        per_page: 5,
        acf_format: 'standard'
      }
    });

    if (!toursResponse.data || toursResponse.data.length === 0) {
      console.log('⚠️  No itineraries found!');
      console.log('   Please create at least one tour/itinerary in WordPress.');
      return;
    }

    console.log(`✅ Found ${toursResponse.data.length} itinerary(ies)`);
    
    // Test 3: Check each tour for ACF fields
    console.log('\n🔎 Test 3: Checking ACF fields on each tour...\n');
    
    for (const tour of toursResponse.data) {
      console.log(`\n📌 Tour: "${tour.title.rendered}" (ID: ${tour.id})`);
      console.log(`   Slug: ${tour.slug}`);
      
      // Check if ACF data exists
      if (!tour.acf) {
        console.log('   ❌ No ACF data found!');
        console.log('   → Make sure ACF plugin is installed and activated');
        continue;
      }

      console.log('   ✅ ACF data exists');

      // Check for departure_schedule field
      if (!tour.acf.departure_schedule) {
        console.log('   ❌ No "departure_schedule" field found!');
        console.log('   → Field might not be created or not exposed to REST API');
        console.log('\n   Available ACF fields:');
        Object.keys(tour.acf).forEach(key => {
          console.log(`      - ${key}`);
        });
        continue;
      }

      // Parse and display departure schedule
      console.log('   ✅ "departure_schedule" field exists!');
      
      try {
        let schedule = tour.acf.departure_schedule;
        
        // Handle if it's a string (needs parsing)
        if (typeof schedule === 'string') {
          console.log('   📝 Schedule is stored as string, parsing...');
          schedule = JSON.parse(schedule);
        }

        // Check structure
        if (schedule.departures && Array.isArray(schedule.departures)) {
          console.log(`   ✅ Valid structure: ${schedule.departures.length} departure(s) found`);
          
          // Show first departure as sample
          if (schedule.departures.length > 0) {
            const firstDep = schedule.departures[0];
            console.log('\n   📅 Sample Departure:');
            console.log(`      Date: ${firstDep.date}`);
            console.log(`      Price: ₹${firstDep.pricePerPerson}`);
            console.log(`      Seats: ${firstDep.availableSeats}/${firstDep.totalSeats}`);
            console.log(`      Status: ${firstDep.status}`);
          }

          // Show metadata
          if (schedule.metadata) {
            console.log('\n   📊 Metadata:');
            console.log(`      Location: ${schedule.metadata.location || 'Not set'}`);
            console.log(`      Duration: ${schedule.metadata.duration || 'Not set'}`);
            console.log(`      Currency: ${schedule.metadata.currency || 'INR'}`);
          }

        } else {
          console.log('   ⚠️  Invalid structure: missing "departures" array');
          console.log(`   Raw data: ${JSON.stringify(schedule).substring(0, 200)}...`);
        }

      } catch (parseError) {
        console.log(`   ❌ Error parsing departure_schedule: ${parseError.message}`);
        console.log(`   Raw value: ${tour.acf.departure_schedule.substring(0, 100)}...`);
      }
    }

    // Test 4: Fetch a specific tour by slug
    console.log('\n\n📍 Test 4: Testing single tour fetch...');
    const firstTourSlug = toursResponse.data[0].slug;
    console.log(`   Fetching: ${API_URL}/itinerary?slug=${firstTourSlug}`);
    
    const singleTourResponse = await axios.get(`${API_URL}/itinerary`, {
      params: {
        slug: firstTourSlug,
        acf_format: 'standard'
      }
    });

    if (singleTourResponse.data && singleTourResponse.data.length > 0) {
      console.log('   ✅ Single tour fetch successful');
      const tour = singleTourResponse.data[0];
      
      if (tour.acf && tour.acf.departure_schedule) {
        console.log('   ✅ departure_schedule field present in single tour fetch');
      } else {
        console.log('   ❌ departure_schedule field missing in single tour fetch');
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ WordPress API Test Complete!\n');

  } catch (error) {
    console.error('\n❌ Error during WordPress API test:');
    console.error(`   ${error.message}`);
    
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   URL: ${error.config.url}`);
    }
    
    if (error.code === 'ENOTFOUND') {
      console.error('\n   → Check if the WordPress site is accessible');
      console.error('   → Verify the URL in .env file');
    }
  }
}

// Run the test
testWordPressAPI();
