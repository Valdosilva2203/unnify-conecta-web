import { createClient } from '@/lib/supabase/client';

export async function getUserRole(): Promise<'admin_master' | 'admin' | 'user' | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('perfis')
    .select('global_role')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;

  return data.global_role;
}
