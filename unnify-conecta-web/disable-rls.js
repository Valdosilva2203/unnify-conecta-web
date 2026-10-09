const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://bvwfoafkqjquxcbijffj.supabase.co',
  'sb_secret_IE2ixB_BfCw8LCbDN22d7Q_5oRjAajW'
);

async function disableRLS() {
  console.log('Disabling RLS on profiles table...');

  const { data, error } = await supabase.rpc('exec_sql', {
    sql: 'ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;'
  });

  if (error) {
    console.error('Error disabling RLS:', error.message);
  } else {
    console.log('RLS disabled successfully');
  }
}

disableRLS();
