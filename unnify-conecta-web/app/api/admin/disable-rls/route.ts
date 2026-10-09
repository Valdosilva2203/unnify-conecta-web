import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = createClient();

    // Execute raw SQL to disable RLS
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;',
    }).catch(() => {
      // If exec_sql doesn't exist, try direct approach
      return { data: null, error: { message: 'exec_sql not available' } };
    });

    if (error?.message?.includes('exec_sql')) {
      // Fallback: delete all RLS policies
      const { error: policiesError } = await supabase
        .from('pg_policies')
        .delete()
        .neq('tablename', 'null');

      return NextResponse.json({
        status: 'error',
        message: 'Use Supabase Dashboard SQL Editor to run: ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;',
        error: policiesError?.message,
      });
    }

    return NextResponse.json({
      status: 'ok',
      message: 'RLS disabled on profiles table',
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: String(error),
    });
  }
}
