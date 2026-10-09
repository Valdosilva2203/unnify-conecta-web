const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://bvwfoafkqjquxcbijffj.supabase.co',
  'sb_secret_IE2ixB_BfCw8LCbDN22d7Q_5oRjAajW'
);

async function cleanupDuplicates() {
  console.log('Deleting old profile with user_id: 7d05dddb-d78e-46d9-8313-638e0b87ece1');

  const { data, error } = await supabase
    .from('profiles')
    .delete()
    .eq('user_id', '7d05dddb-d78e-46d9-8313-638e0b87ece1');

  if (error) {
    console.error('Error deleting profile:', error.message);
  } else {
    console.log('✅ Old profile deleted successfully');
  }

  // Verify remaining profiles
  console.log('\nVerifying remaining profiles with email unnifybr@gmail.com:');
  const { data: remaining, error: checkError } = await supabase
    .from('profiles')
    .select('user_id, email, global_role, status')
    .eq('email', 'unnifybr@gmail.com');

  if (checkError) {
    console.error('Error checking profiles:', checkError.message);
  } else {
    console.log(`Found ${remaining.length} profile(s):`);
    console.log(JSON.stringify(remaining, null, 2));
  }
}

cleanupDuplicates();
