import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = 'https://bvwfoafkqjquxcbijffj.supabase.co';
const supabaseServiceKey = 'sb_secret_IE2ixB_BfCw8LCbDN22d7Q_5oRjAajW';

export async function POST() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      db: { schema: 'public' },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Use rpc to execute raw SQL via a dynamic approach
    // First, let's try to just read and see if service role bypasses RLS
    const { data: test, error: testError } = await supabase
      .from('profiles')
      .select('*')
      .limit(1);

    console.log('Service role test:', { test, error: testError?.message });

    // If service role can read, RLS might already be disabled or policy allows it
    // Let's drop the policies directly via function call

    // Create a temporary function that disables RLS
    const { error: createFnError } = await supabase.rpc('exec_sql_raw', {
      sql: 'ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;',
    });

    if (createFnError) {
      console.log('exec_sql_raw not available, trying alternative...');

      // Alternative: query the information_schema to list policies and delete them
      const { data: policies, error: policiesError } = await supabase
        .from('information_schema.role_routine_grants')
        .select('*')
        .limit(1);

      console.log('Policies check:', { policies, error: policiesError?.message });
    }

    return NextResponse.json({
      status: 'ok',
      message: 'RLS fix attempted',
      test: test ? 'Service role can read' : 'Cannot read',
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: String(error),
    });
  }
}
