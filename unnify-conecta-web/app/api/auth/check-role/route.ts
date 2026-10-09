import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ role: null }, { status: 401 });
    }

    // Use service role to bypass RLS
    const supabaseAdmin = createClient();
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('global_role')
      .eq('user_id', user.id)
      .single();

    if (error || !profile) {
      return NextResponse.json({ role: null }, { status: 200 });
    }

    return NextResponse.json({ role: profile.global_role }, { status: 200 });
  } catch (error) {
    console.error('Check role error:', error);
    return NextResponse.json({ role: null }, { status: 500 });
  }
}
