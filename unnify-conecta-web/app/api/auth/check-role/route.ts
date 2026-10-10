import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Get auth token from Authorization header (passed from frontend with user's token)
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ role: null }, { status: 200 });
    }

    // Create authenticated client with user's token to get user ID
    const { createBrowserClient } = await import('@supabase/ssr');
    const authClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Set the session token to get user info
    await authClient.auth.setSession({
      access_token: token,
      refresh_token: '',
    });

    const { data: { user } } = await authClient.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ role: null }, { status: 200 });
    }

    // Query profile with service role (bypasses RLS)
    const adminClient = createClient();
    const { data: profile, error } = await adminClient
      .from('perfis')
      .select('funcao_global')
      .eq('id_usuario', user.id)
      .single();

    if (error) {
      return NextResponse.json({ role: null }, { status: 200 });
    }

    return NextResponse.json({ role: profile?.funcao_global || null }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ role: null }, { status: 200 });
  }
}
