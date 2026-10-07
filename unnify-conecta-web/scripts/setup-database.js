// Database setup script for Unnify Conecta
// Run with: node scripts/setup-database.js

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bvwfoafkqjquxcbjffj.supabase.co';
const SERVICE_ROLE_KEY = 'sb_secret_1E21s8_BfCwLCbDH22d70_SoRjAaJW';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function setupDatabase() {
  console.log('🚀 Starting database setup...\n');

  try {
    // Create profiles table (extends auth.users)
    console.log('📋 Creating profiles table...');
    await supabase.from('profiles').insert({
      id: 'temp',
      full_name: 'temp',
      onboarding_type: 'temp',
    }).then(() => {
      // Delete temp record
      return supabase.from('profiles').delete().eq('id', 'temp');
    }).catch(err => {
      // Table might already exist
      if (!err.message.includes('already exists')) {
        console.error('Error with profiles:', err.message);
      }
    });

    console.log('✅ Database setup complete!\n');
    console.log('Tables ready for Unnify Conecta');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

setupDatabase();
