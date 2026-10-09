import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();

    // Get auth user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        status: 'error',
        message: 'Not authenticated',
        authError,
      });
    }

    // Get profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, email, global_role, status')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      status: 'ok',
      auth_user_id: user.id,
      auth_email: user.email,
      profile,
      profileError,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: String(error),
    });
  }
}
