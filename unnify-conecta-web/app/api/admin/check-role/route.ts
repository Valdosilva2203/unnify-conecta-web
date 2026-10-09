import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({
        status: 'error',
        message: 'userId required',
      });
    }

    const supabase = createClient();

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('global_role')
      .eq('user_id', userId);

    const profile = profiles?.[0];

    if (error || !profile) {
      return NextResponse.json({
        status: 'not_found',
        message: 'Profile not found',
      });
    }

    return NextResponse.json({
      status: 'ok',
      global_role: profile.global_role,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
    });
  }
}
