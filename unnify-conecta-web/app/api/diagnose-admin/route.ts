import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createClient();

    // Query all profiles to find the one with email unnifybr@gmail.com
    // Since we can't join auth.users directly via client, get first 100 and show them
    const { data: profiles, error } = await supabase
      .from('perfis')
      .select('user_id, global_role, status, mfa_enabled')
      .order('user_id', { ascending: true })
      .limit(100);

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }

    // Try to find admin users
    const adminUsers = profiles.filter(
      p => p.global_role === 'admin_master' || p.global_role === 'admin'
    );

    return NextResponse.json({
      totalProfiles: profiles.length,
      adminCount: adminUsers.length,
      adminUsers: adminUsers.map(p => ({
        user_id: p.user_id,
        global_role: p.global_role,
        status: p.status,
        mfa_enabled: p.mfa_enabled
      })),
      allProfiles: profiles.slice(0, 10).map(p => ({
        user_id: p.user_id,
        global_role: p.global_role,
        status: p.status
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
