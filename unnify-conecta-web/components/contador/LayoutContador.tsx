'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AccountantSidebar } from './AccountantSidebar';
import { AccountantTopbar } from './AccountantTopbar';

export interface ContadorAtual {
  id: string;
  nome: string;
  email: string;
  // Escritório que o usuário administra (dono), se houver
  escritorio: { id: string; nome: string } | null;
}

const ContextoContador = createContext<ContadorAtual | null>(null);
export const useContadorAtual = () => useContext(ContextoContador);

export function LayoutContador({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [contador, setContador] = useState<ContadorAtual | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const fecharMenu = useCallback(() => setMenuAberto(false), []);

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
      const { data: perfil } = await supabase
        .from('perfis')
        .select('nome_completo, tipo_usuario, funcao_global')
        .eq('id_usuario', user.id)
        .maybeSingle();
      if (perfil?.funcao_global === 'admin_master' || perfil?.funcao_global === 'admin') {
        router.replace('/admin');
        return;
      }
      if (perfil?.tipo_usuario !== 'contador') {
        router.replace('/app');
        return;
      }
      const { data: escritorio } = await supabase
        .from('empresas')
        .select('id, razao_social, nome_comercial')
        .eq('criado_por', user.id)
        .eq('tipo_empresa', 'escritorio_contabil')
        .order('criado_em')
        .limit(1)
        .maybeSingle();
      if (!ativo) return;
      setContador({
        id: user.id,
        nome: perfil?.nome_completo || user.email?.split('@')[0] || 'Contador',
        email: user.email || '',
        escritorio: escritorio ? { id: escritorio.id, nome: escritorio.nome_comercial || escritorio.razao_social } : null,
      });
    })().catch(() => router.replace('/login'));
    return () => {
      ativo = false;
    };
  }, [router]);

  const nomeTopo = contador?.escritorio?.nome || contador?.nome || '';
  const iniciais = nomeTopo
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  return (
    <ContextoContador.Provider value={contador}>
      <div className="flex min-h-screen bg-gray-50">
        <AccountantSidebar isOpen={menuAberto} onClose={fecharMenu} />
        <div className="flex-1 min-w-0 flex flex-col">
          <AccountantTopbar officeInitials={iniciais} officeName={nomeTopo} onMenuClick={() => setMenuAberto(true)} menuAberto={menuAberto} />
          <main className="flex-1 min-w-0">
            <div className="px-4 py-5 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto w-full pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {!contador && (
                <div className="flex items-center justify-center py-24" role="status">
                  <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
                  <span className="sr-only">Carregando...</span>
                </div>
              )}
              <div hidden={!contador} inert={!contador}>
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ContextoContador.Provider>
  );
}
