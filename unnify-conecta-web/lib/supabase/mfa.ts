import type { SupabaseClient } from '@supabase/supabase-js';

export const ROTA_VERIFICACAO_MFA = '/login/verificacao';

// true quando a conta tem autenticação em duas etapas ativa e a sessão ainda não passou pelo código (AAL1 → AAL2).
export async function precisaSegundoFator(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
}
