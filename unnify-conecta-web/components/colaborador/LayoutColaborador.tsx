'use client';

import { createContext, Suspense, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, Clock, FileText, Home, Loader2, LogOut, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { precisaSegundoFator, ROTA_VERIFICACAO_MFA } from '@/lib/supabase/mfa';
import { CHAVE_VINCULO, type VinculoColaborador } from '@/lib/portal-colaborador';
import { CartaoAcesso } from '@/components/colaborador/CartaoAcesso';
import { SinoNotificacoes } from '@/components/notificacoes/SinoNotificacoes';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

interface Contexto { vinculo: VinculoColaborador; vinculos: VinculoColaborador[] }
const ContextoColaborador = createContext<Contexto | null>(null);
export const useColaborador = () => {
  const c = useContext(ContextoColaborador);
  if (!c) throw new Error('Fora do Portal do Colaborador');
  return c;
};

const MENU = [
  { href: '/colaborador', rotulo: 'Início', icone: Home },
  { href: '/colaborador/ponto', rotulo: 'Ponto', icone: Clock },
  { href: '/colaborador/jornada', rotulo: 'Jornada', icone: CalendarDays },
  { href: '/colaborador/documentos', rotulo: 'Documentos', icone: FileText },
  { href: '/colaborador/cadastro', rotulo: 'Cadastro', icone: UserRound },
];

function Navegacao({ variante }: { variante: 'topo' | 'base' }) {
  const caminho = usePathname();
  const ativo = (href: string) => (href === '/colaborador' ? caminho === href : caminho.startsWith(href));
  if (variante === 'base') {
    return (
      <nav aria-label="Navegação do portal" className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <ul className="grid grid-cols-5">
          {MENU.map(({ href, rotulo, icone: Icone }) => (
            <li key={href}><Link href={href} aria-current={ativo(href) ? 'page' : undefined}
              className={`min-h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${ativo(href) ? 'text-orange-600' : 'text-gray-500'}`}>
              <Icone className="w-5 h-5" aria-hidden="true" />{rotulo}</Link></li>
          ))}
        </ul>
      </nav>
    );
  }
  return (
    <nav aria-label="Navegação do portal" className="hidden md:block">
      <ul className="flex gap-1">
        {MENU.map(({ href, rotulo, icone: Icone }) => (
          <li key={href}><Link href={href} aria-current={ativo(href) ? 'page' : undefined}
            className={`min-h-11 px-3 inline-flex items-center gap-2 rounded-lg text-sm font-semibold ${ativo(href) ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Icone className="w-4 h-4" aria-hidden="true" />{rotulo}</Link></li>
        ))}
      </ul>
    </nav>
  );
}

// Área exclusiva do colaborador: só funções do banco que conferem o vínculo ATIVO do próprio usuário. Sem acesso às áreas da empresa.
export function LayoutColaborador({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [estado, setEstado] = useState<'carregando' | 'expirada' | 'sem_acesso' | 'erro' | 'pronto'>('carregando');
  const [vinculos, setVinculos] = useState<VinculoColaborador[]>([]);
  const [idSel, setIdSel] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setEstado('expirada'); return; }
    if (await precisaSegundoFator(supabase)) { router.replace(ROTA_VERIFICACAO_MFA); return; }
    const { data, error } = await supabase.rpc('portal_colaborador');
    if (error) { setEstado(error.code === 'PGRST301' || /JWT/i.test(error.message) ? 'expirada' : 'erro'); return; }
    const lista = (data ?? []) as VinculoColaborador[];
    setVinculos(lista);
    if (!lista.length) { setEstado('sem_acesso'); return; }
    let salvo: string | null = null;
    try { salvo = localStorage.getItem(CHAVE_VINCULO); } catch { /* sem armazenamento */ }
    setIdSel(lista.some((v) => v.id_funcionario === salvo) ? salvo : lista[0].id_funcionario);
    setEstado('pronto');
  }, [router]);

  useEffect(() => {
    carregar().catch(() => setEstado('erro'));
    const { data: { subscription } } = createClient().auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT') setEstado('expirada'); });
    return () => subscription.unsubscribe();
  }, [carregar]);

  const trocar = (id: string) => {
    setIdSel(id);
    try { localStorage.setItem(CHAVE_VINCULO, id); } catch { /* sem armazenamento */ }
  };
  const sair = async () => { await createClient().auth.signOut(); router.replace('/login'); };

  if (estado === 'carregando') {
    return <div role="status" className="min-h-dvh flex items-center justify-center bg-gray-50 text-gray-500"><Loader2 className="w-6 h-6 animate-spin" aria-label="Carregando portal" /></div>;
  }
  if (estado === 'expirada') {
    return (
      <CartaoAcesso titulo="Sessão expirada" subtitulo="Por segurança, sua sessão foi encerrada. Entre novamente para continuar.">
        <Link href="/login" className={`${classeBotaoPrimario} w-full`}>Entrar</Link>
        <Link href="/forgot-password" className="block text-center text-sm font-semibold text-orange-700 hover:underline">Esqueci minha senha</Link>
      </CartaoAcesso>
    );
  }
  if (estado === 'sem_acesso' || estado === 'erro') {
    return (
      <CartaoAcesso titulo={estado === 'erro' ? 'Não foi possível carregar' : 'Acesso não disponível'}
        subtitulo={estado === 'erro' ? 'Verifique sua conexão e tente novamente.' : 'Sua conta não tem acesso ativo ao Portal do Colaborador. Se você foi contratado(a), peça o convite ao RH da empresa.'}>
        {estado === 'erro' && <button type="button" onClick={() => { setEstado('carregando'); carregar().catch(() => setEstado('erro')); }} className={`${classeBotaoPrimario} w-full`}>Tentar novamente</button>}
        <button type="button" onClick={sair} className={`${classeBotaoSecundario} w-full`}>Sair</button>
      </CartaoAcesso>
    );
  }
  const vinculo = vinculos.find((v) => v.id_funcionario === idSel) ?? vinculos[0];
  return (
    <ContextoColaborador.Provider value={{ vinculo, vinculos }}>
      <div className="min-h-dvh bg-gray-50 pb-20 md:pb-8">
        <header className="sticky top-0 z-20 bg-white border-b border-gray-200" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3">
            <Link href="/colaborador" className="shrink-0"><Image src="/brand/unnify-logo.png" alt="Unnify Conecta — Portal do Colaborador" width={130} height={36} className="h-auto w-[110px]" /></Link>
            <Suspense fallback={null}><div className="flex-1 min-w-0 flex justify-center"><Navegacao variante="topo" /></div></Suspense>
            {vinculos.length > 1 && (
              <label className="min-w-0 ml-auto md:ml-0">
                <span className="sr-only">Empresa</span>
                <select value={vinculo.id_funcionario} onChange={(e) => trocar(e.target.value)} className="h-10 max-w-[10rem] sm:max-w-[14rem] truncate rounded-lg border border-gray-300 bg-white px-2 text-sm">
                  {vinculos.map((v) => <option key={v.id_funcionario} value={v.id_funcionario}>{v.empresa}</option>)}
                </select>
              </label>
            )}
            <div className={vinculos.length > 1 ? 'shrink-0' : 'shrink-0 ml-auto md:ml-0'}><SinoNotificacoes /></div>
            <button type="button" onClick={sair} aria-label="Sair" className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100">
              <LogOut className="w-5 h-5" aria-hidden="true" /></button>
          </div>
        </header>
        <main key={vinculo.id_funcionario} className="max-w-5xl mx-auto px-4 py-5 space-y-4">{children}</main>
        <Suspense fallback={null}><Navegacao variante="base" /></Suspense>
      </div>
    </ContextoColaborador.Provider>
  );
}
