import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const authToken = cookieStore.get('sb-bvwfoafkqjquxcbijffj-auth-token')?.value;

    if (!authToken) {
      return NextResponse.json({
        status: 'error',
        message: 'Auth token not found in cookies',
        hint: 'You must be logged in to access this endpoint',
      });
    }

    // Parse JWT to get user_id
    const parts = authToken.split('.');
    if (parts.length !== 3) {
      return NextResponse.json({
        status: 'error',
        message: 'Invalid token format',
      });
    }

    let userId: string;
    let email: string;
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
      userId = payload.sub;
      email = payload.email;
    } catch (e) {
      return NextResponse.json({
        status: 'error',
        message: 'Failed to parse JWT',
        error: String(e),
      });
    }

    // Get profile with service role
    const supabase = createClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, email, global_role, status, mfa_enabled')
      .eq('user_id', userId)
      .single();

    return NextResponse.json({
      status: 'ok',
      auth_user_id: userId,
      auth_email: email,
      profile,
      profileError: profileError ? { code: profileError.code, message: profileError.message } : null,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: String(error),
    });
  }
}
