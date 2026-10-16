'use client';

import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { precisaSegundoFator, ROTA_VERIFICACAO_MFA } from '@/lib/supabase/mfa';
import { carregarPreferenciasExibicao } from '@/lib/conta';

// Informa às páginas quando o acesso de administrador foi confirmado (para só então buscar dados).
const AcessoAdmin = createContext(false);
export const useAcessoAdminConfirmado = () => useContext(AcessoAdmin);

// Camada de interface (a 1ª barreira é o middleware no servidor): impede que não-admins vejam o painel.
// A proteção dos dados em si é feita no banco (RLS + funções is_admin/is_admin_master).
export function GuardaAdmin({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [liberado, setLiberado] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      if (await precisaSegundoFator(supabase)) {
        router.replace(ROTA_VERIFICACAO_MFA);
        return;
      }
      carregarPreferenciasExibicao(supabase, user).catch(() => {});
      const { data: perfil } = await supabase
        .from('perfis')
        .select('funcao_global')
        .eq('id_usuario', user.id)
        .maybeSingle();
      if (!ativo) return;
      if (perfil?.funcao_global === 'admin_master' || perfil?.funcao_global === 'admin') {
        setLiberado(true);
      } else {
        router.replace('/app');
      }
    })().catch(() => router.replace('/login'));
    return () => {
      ativo = false;
    };
  }, [router]);

  // As páginas só montam depois da confirmação do papel: nenhuma consulta administrativa sai antes disso
  if (!liberado) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" role="status">
        <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
        <span className="sr-only">Verificando acesso...</span>
      </div>
    );
  }
  return <AcessoAdmin.Provider value={liberado}>{children}</AcessoAdmin.Provider>;
}
