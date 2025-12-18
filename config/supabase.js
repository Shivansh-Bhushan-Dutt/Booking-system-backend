const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Test Supabase connection
 */
async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('count')
      .limit(1);
    
    if (error) throw error;
    console.log('✅ Supabase Connected Successfully');
    return true;
  } catch (error) {
    console.error('❌ Supabase Connection Error:', error.message);
    return false;
  }
}

module.exports = { supabase, testConnection };
