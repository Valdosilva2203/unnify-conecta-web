import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get('email');

    if (!email) {
      return NextResponse.json({
        status: 'error',
        message: 'Email parameter required',
        example: '/api/debug/user-by-email?email=unnifybr@gmail.com',
      });
    }

    // Query with service role (no auth needed)
    const supabase = createClient();
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('user_id, email, global_role, status, mfa_enabled, created_at')
      .eq('email', email);

    if (error) {
      return NextResponse.json({
        status: 'error',
        message: 'Query failed',
        error: error.message,
      });
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({
        status: 'error',
        message: `No profile found for email: ${email}`,
      });
    }

    return NextResponse.json({
      status: 'ok',
      email,
      profiles_found: profiles.length,
      profiles,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: String(error),
    });
  }
}
