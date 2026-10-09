import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Building2, Calculator } from 'lucide-react';
import { OnboardingHeader } from '@/components/OnboardingHeader';
import { OnboardingCard } from '@/components/OnboardingCard';
import { OnboardingPageClient } from './page-client';

export default async function OnboardingPage() {
  const supabase = createClient();

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Redirect to login if not authenticated
  if (authError || !user?.id) {
    redirect('/login');
  }

  // Query profile using user_id
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('global_role, status')
    .eq('user_id', user.id)
    .single();

  // Log for debugging
  console.log('Onboarding page check:', {
    user_id: user.id,
    user_email: user.email,
    profile,
    profileError,
  });

  // Redirect admin_master to /admin
  if (profile?.global_role === 'admin_master') {
    console.log('Redirecting admin_master to /admin');
    redirect('/admin');
  }

  // Redirect admin to /admin
  if (profile?.global_role === 'admin') {
    console.log('Redirecting admin to /admin');
    redirect('/admin');
  }

  // Only users without a global_role or with 'user' role can see onboarding
  return <OnboardingPageClient />;
}
