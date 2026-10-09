const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://bvwfoafkqjquxcbijffj.supabase.co',
  'sb_secret_1E21s8_BfCwLCbDH22d70_SoRjAaJW'
);

async function createAdminProfile() {
  const userId = '7d05dddb-d78e-46d9-8313-638e0b87ece1';

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      user_id: userId,
      global_role: 'admin_master',
      email: 'admin@test.com',
      full_name: 'Admin Master',
      status: 'active',
      mfa_enabled: false,
    })
    .select();

  if (error) {
    console.error('Error creating profile:', error.message);
  } else {
    console.log('Profile created successfully:', data);
  }
}

createAdminProfile();
