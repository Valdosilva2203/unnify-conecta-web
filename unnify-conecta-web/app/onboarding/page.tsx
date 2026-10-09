import { redirect } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Building2, Calculator } from 'lucide-react';
import { OnboardingHeader } from '@/components/OnboardingHeader';
import { OnboardingCard } from '@/components/OnboardingCard';
import { OnboardingPageClient } from './page-client';
import { createClient } from '@/lib/supabase/server';

export default async function OnboardingPage() {
  try {
    const cookieStore = await cookies();

    // Create auth client to get user from session
    const authClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Try to get user from existing auth state (via cookie parsing)
    const authToken = cookieStore.get('sb-bvwfoafkqjquxcbijffj-auth-token')?.value;

    if (!authToken) {
      redirect('/login');
    }

    // Parse JWT to get user_id (middle part of JWT)
    const parts = authToken.split('.');
    if (parts.length !== 3) {
      redirect('/login');
    }

    let userId: string;
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
      userId = payload.sub;
    } catch {
      redirect('/login');
    }

    if (!userId) {
      redirect('/login');
    }

    // Query profile using service role (bypasses RLS)
    const supabase = createClient();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('global_role')
      .eq('user_id', userId)
      .single();

    console.log('Onboarding check:', { userId, profile, error });

    // Redirect admin_master and admin to /admin
    if (profile?.global_role === 'admin_master' || profile?.global_role === 'admin') {
      redirect('/admin');
    }

    // Only regular users see onboarding
    return <OnboardingPageClient />;
  } catch (error) {
    console.error('Onboarding page error:', error);
    redirect('/login');
  }
}
