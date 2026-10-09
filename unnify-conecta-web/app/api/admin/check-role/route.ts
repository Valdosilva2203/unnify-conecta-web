import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const { allowed, retryAfter } = rateLimit(request, 30, 60000);
    if (!allowed) {
      return NextResponse.json(
        { status: 'too_many_requests', message: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    // Get auth token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { status: 'unauthorized', message: 'Missing authorization' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // Verify token and extract user ID (use anon client to validate)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user?.id) {
      return NextResponse.json(
        { status: 'unauthorized', message: 'Invalid token' },
        { status: 401 }
      );
    }

    // Use service role to query profile
    const serverSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: profiles, error } = await serverSupabase
      .from('profiles')
      .select('global_role')
      .eq('user_id', user.id);

    const profile = profiles?.[0];

    if (error || !profile) {
      return NextResponse.json(
        { status: 'not_found', message: 'Profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      global_role: profile.global_role,
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
