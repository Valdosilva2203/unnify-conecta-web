const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://bvwfoafkqjquxcbijffj.supabase.co',
  'sb_secret_IE2ixB_BfCw8LCbDN22d7Q_5oRjAajW'
);

async function createAdminProfile() {
  const userId = '7d05dddb-d78e-46a9-8313-638e0b87ece1';

  console.log('Creating profile for userId:', userId);

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      user_id: userId,
      email: 'unnifybr@gmail.com',
      full_name: 'Vado silva',
      global_role: 'admin_master',
      status: 'active',
      mfa_enabled: false,
    })
    .select();

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Success! Profile created:');
    console.log(JSON.stringify(data, null, 2));
  }
}

createAdminProfile();
