'use client';

import { Suspense, createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, FileText, DollarSign, AlertCircle, Landmark, Calendar, ShoppingCart, ShoppingBag, Box,
  Users, UserCheck, Receipt, BarChart3, Settings, Menu, X, Briefcase, ListChecks, HeartPulse,
} from 'lucide-react';
import { SinoNotificacoes } from '@/components/notificacoes/SinoNotificacoes';
import { createClient } from '@/lib/supabase/client';
import { precisaSegundoFator, ROTA_VERIFICACAO_MFA } from '@/lib/supabase/mfa';
import { carregarPreferenciasExibicao } from '@/lib/conta';
import { MenuPerfilEmpresa } from '@/components/app/MenuPerfilEmpresa';

export interface EmpresaAtual {
  id: string;
  razao_social: string;
  nome_comercial: string | null;
  cnpj: string;
}

export interface UsuarioAtual {
  id: string;
  email: string;
  nome: string;
}

interface ContextoEmpresaValor {
  empresa: EmpresaAtual | null;
  usuario: UsuarioAtual | null;
  empresas: EmpresaAtual[]; // empresas em que o usuário é dono/sócio ativo (lidas sob RLS)
  trocarEmpresa: (id: string) => void;
  recarregarEmpresas: () => Promise<void>;
}

const ContextoEmpresa = createContext<ContextoEmpresaValor>({
  empresa: null,
  usuario: null,
  empresas: [],
  trocarEmpresa: () => {},
  recarregarEmpresas: async () => {},
});

export const useEmpresaAtual = () => useContext(ContextoEmpresa);

// Preferência de exibição por usuário (não é controle de acesso: a empresa escolhida precisa estar na lista lida sob RLS,
// e cada consulta/função valida a permissão no banco)
const chaveEmpresaEscolhida = (idUsuario: string) => `unnify:empresa:${idUsuario}`;
function lerEscolha(idUsuario: string): string | null {
  try {
    return window.localStorage.getItem(chaveEmpresaEscolhida(idUsuario));
  } catch {
    return null;
  }
}
function gravarEscolha(idUsuario: string, idEmpresa: string) {
  try {
    window.localStorage.setItem(chaveEmpresaEscolhida(idUsuario), idEmpresa);
  } catch {
    /* sem armazenamento: segue com a empresa atual */
  }
}

async function buscarEmpresasDoUsuario(idUsuario: string): Promise<EmpresaAtual[]> {
  const { data } = await createClient()
    .from('usuarios_empresas')
    .select('empresas!inner(id, razao_social, nome_comercial, cnpj, tipo_empresa)')
    .eq('id_usuario', idUsuario)
    .eq('ativo', true)
    .in('tipo_vinculacao', ['dono', 'socio'])
    .eq('empresas.tipo_empresa', 'comum');
  const lista = (data ?? []).map((v) => (v as unknown as { empresas: EmpresaAtual & { tipo_empresa: string } }).empresas);
  return lista
    .map(({ id, razao_social, nome_comercial, cnpj }) => ({ id, razao_social, nome_comercial, cnpj }))
    .sort((a, b) => (a.nome_comercial || a.razao_social).localeCompare(b.nome_comercial || b.razao_social, 'pt-BR'));
}

const menuItems = [
  { icon: Home, label: 'Início', href: '/app' },
  { icon: Briefcase, label: 'Meu contador', href: '/app/meu-contador' },
  { icon: DollarSign, label: 'Financeiro', href: '/app/financeiro' },
  { icon: ListChecks, label: 'Tarefas', href: '/app/tarefas' },
  { icon: FileText, label: 'Meus documentos', href: '/app/documentos' },
  { icon: AlertCircle, label: 'Obrigações', href: '/app/obrigacoes' },
  { icon: Landmark, label: 'Impostos', href: '/app/impostos' },
  { icon: HeartPulse, label: 'Saúde Empresarial', href: '/app/saude-empresarial' },
  { icon: Calendar, label: 'Agenda', href: '/app/agenda' },
  { icon: ShoppingCart, label: 'Compras', href: '/app/compras' },
  { icon: ShoppingBag, label: 'Vendas', href: '/app/vendas' },
  { icon: Box, label: 'Estoque', href: '/app/estoque' },
  { icon: Users, label: 'Funcionários', href: '/app/funcionarios' },
  { icon: UserCheck, label: 'Clientes', href: '/app/clientes' },
  { icon: Receipt, label: 'Recibos', href: '/app/recibos' },
  { icon: BarChart3, label: 'Relatórios', href: '/app/relatorios' },
  { icon: Settings, label: 'Minha conta', href: '/app/minha-conta' },
];

function ListaNavegacao({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Menu principal" className="flex-1 overflow-y-auto py-4">
      {menuItems.map((item) => {
        const Icon = item.icon;
        const ativo = !!pathname && (item.href === '/app' ? pathname === '/app' : item.href !== '#' && pathname.startsWith(item.href));
        if (item.href === '#') {
          return (
            <div
              key={item.label}
              aria-disabled="true"
              className="w-full min-h-11 flex items-center gap-3 px-6 text-sm font-medium text-gray-400 cursor-default"
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="flex-1">{item.label}</span>
            </div>
          );
        }
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={ativo ? 'page' : undefined}
            className={`w-full min-h-11 flex items-center gap-3 px-6 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 ${
              ativo ? 'bg-orange-50 text-orange-600 border-l-4 border-orange-600' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Icon className="w-5 h-5" aria-hidden="true" />
            <span className="flex-1">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// usePathname suspende em rotas com parâmetro dinâmico (cacheComponents): fica dentro de <Suspense>.
function NavegacaoComRota({ aoNavegar }: { aoNavegar: () => void }) {
  const pathname = usePathname();
  useEffect(() => {
    aoNavegar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fecha o menu só quando a rota muda
  }, [pathname]);
  return <ListaNavegacao pathname={pathname} />;
}

export function LayoutEmpresa({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [empresa, setEmpresa] = useState<EmpresaAtual | null>(null);
  const [empresas, setEmpresas] = useState<EmpresaAtual[]>([]);
  const [usuario, setUsuario] = useState<UsuarioAtual | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);

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
        .select('nome_completo, tipo_usuario, funcao_global')
        .eq('id_usuario', user.id)
        .maybeSingle();
      if (perfil?.funcao_global === 'admin_master' || perfil?.funcao_global === 'admin') {
        router.replace('/admin');
        return;
      }
      if (perfil?.tipo_usuario === 'contador') {
        router.replace('/contador');
        return;
      }
      const lista = await buscarEmpresasDoUsuario(user.id);
      if (lista.length === 0) {
        router.replace('/onboarding');
        return;
      }
      if (!ativo) return;
      const escolhida = lerEscolha(user.id);
      setEmpresas(lista);
      setEmpresa(lista.find((e) => e.id === escolhida) ?? lista[0]);
      setUsuario({
        id: user.id,
        email: user.email || '',
        nome: perfil?.nome_completo || user.email?.split('@')[0] || 'Usuário',
      });
    })().catch(() => router.replace('/login'));
    return () => {
      ativo = false;
    };
  }, [router]);

  useEffect(() => {
    if (!menuAberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAberto(false);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [menuAberto]);

  // Só troca para uma empresa da lista lida sob RLS; o banco valida o acesso em cada consulta
  const trocarEmpresa = useCallback(
    (id: string) => {
      const alvo = empresas.find((e) => e.id === id);
      if (!alvo || !usuario) return;
      gravarEscolha(usuario.id, id);
      setEmpresa(alvo);
    },
    [empresas, usuario]
  );

  // Após editar o cadastro: relê a lista; se perdeu o acesso à empresa atual, cai na primeira disponível
  const recarregarEmpresas = useCallback(async () => {
    if (!usuario) return;
    const lista = await buscarEmpresasDoUsuario(usuario.id);
    if (lista.length === 0) {
      router.replace('/onboarding');
      return;
    }
    setEmpresas(lista);
    setEmpresa((atual) => lista.find((e) => e.id === atual?.id) ?? lista[0]);
  }, [usuario, router]);

  const nomeEmpresa = empresa ? empresa.nome_comercial || empresa.razao_social : '';
  const iniciais = nomeEmpresa
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const navegacao = (
    <Suspense fallback={<ListaNavegacao pathname={null} />}>
      <NavegacaoComRota aoNavegar={() => setMenuAberto(false)} />
    </Suspense>
  );

  return (
    <ContextoEmpresa.Provider value={{ empresa, usuario, empresas, trocarEmpresa, recarregarEmpresas }}>
      <div className="flex min-h-screen bg-gray-50">
        <aside className="hidden lg:flex sticky top-0 h-screen w-56 shrink-0 bg-white border-r border-gray-200 flex-col">
          <div className="p-6 border-b border-gray-200">
            <Link href="/app" aria-label="Unnify Conecta — início">
              <Image src="/brand/unnify-logo.png" alt="Unnify Conecta" width={150} height={50} priority className="h-8 w-auto" />
            </Link>
          </div>
          {navegacao}
        </aside>

        <div className={`lg:hidden fixed inset-0 z-50 ${menuAberto ? '' : 'pointer-events-none'}`} aria-hidden={!menuAberto}>
          <div
            className={`absolute inset-0 bg-gray-900/40 transition-opacity duration-200 ${menuAberto ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setMenuAberto(false)}
          />
          <aside
            id="menu-empresa"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            inert={!menuAberto}
            className={`absolute inset-y-0 left-0 w-[85%] max-w-xs bg-white shadow-xl flex flex-col transition-transform duration-200 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${
              menuAberto ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <Image src="/brand/unnify-logo.png" alt="Unnify Conecta" width={150} height={50} className="h-8 w-auto" />
              <button
                type="button"
                onClick={() => setMenuAberto(false)}
                aria-label="Fechar menu"
                className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            {navegacao}
          </aside>
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-40 bg-white border-b border-gray-200 pt-[env(safe-area-inset-top)]">
            <div className="flex items-center justify-between gap-2 px-3 sm:px-6 py-2.5 min-h-16">
              <button
                type="button"
                onClick={() => setMenuAberto(true)}
                aria-label="Abrir menu"
                aria-controls="menu-empresa"
                aria-expanded={menuAberto}
                className="lg:hidden w-11 h-11 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <Menu className="w-6 h-6" />
              </button>
              <div className="hidden lg:block" />

              <div className="flex items-center gap-1 sm:gap-3 min-w-0">
                <SinoNotificacoes />
                {empresa && usuario && (
                  <MenuPerfilEmpresa
                    nomeUsuario={usuario.nome}
                    email={usuario.email}
                    nomeEmpresa={nomeEmpresa}
                    iniciais={iniciais}
                  />
                )}
              </div>
            </div>
          </header>

          <main className="flex-1 min-w-0">
            <div className="px-4 py-5 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto w-full pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {!empresa && (
                <div className="flex items-center justify-center py-24" role="status">
                  <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
                  <span className="sr-only">Carregando...</span>
                </div>
              )}
              <div hidden={!empresa} inert={!empresa}>
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ContextoEmpresa.Provider>
  );
}
