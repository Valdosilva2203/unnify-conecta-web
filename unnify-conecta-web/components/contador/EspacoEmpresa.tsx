'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft, Calendar, ChevronDown, ClipboardCheck, DollarSign, FileText, HeartPulse, Inbox, Landmark, LayoutDashboard, ListChecks, Lock, Search, Wallet, type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useContadorAtual, type ContadorAtual } from '@/components/contador/LayoutContador';
import { useAvisoEVersao } from '@/components/documentos/PaginaComAviso';
import { Aviso } from '@/components/conta/Aviso';
import { formatarCnpj, mensagemDeErro, PERMISSOES, type Permissao } from '@/lib/contabil';

// Espaço da EMPRESA gerenciada pelo contador: cabeçalho de identificação + menu horizontal dos módulos.
// Fica separado do menu lateral (ambiente do escritório). Os dados vêm de painel_contador (só vínculos ATIVOS);
// cada módulo depende da permissão concedida e o banco confere de novo em toda consulta e ação.

export interface EmpresaPainel {
  id_empresa: string; nome: string; cnpj: string; permissoes: Permissao[];
  solicitacoes_aguardando_analise: number | null; solicitacoes_aguardando_empresa: number | null;
  obrigacoes_abertas: number | null; obrigacoes_atrasadas: number | null; obrigacoes_7_dias: number | null; itens_concluidos: number | null;
}
export interface Modulo { segmento: string; titulo: string; icone: LucideIcon; descricao: string; permitido: (pode: (p: Permissao) => boolean) => boolean; permissao?: string }

// Ordem do menu horizontal. segmento '' = Visão geral.
export const MODULOS: Modulo[] = [
  { segmento: '', titulo: 'Visão geral', icone: LayoutDashboard, descricao: 'Resumo e permissões', permitido: () => true },
  { segmento: 'solicitacoes', titulo: 'Solicitações', icone: Inbox, descricao: 'Pedidos de documentos', permitido: (p) => p('ver_documentos'), permissao: PERMISSOES.ver_documentos },
  { segmento: 'documentos', titulo: 'Documentos', icone: FileText, descricao: 'Arquivos e certidões', permitido: (p) => p('ver_documentos') || p('gerenciar_certidoes'), permissao: `${PERMISSOES.ver_documentos} ou ${PERMISSOES.gerenciar_certidoes}` },
  { segmento: 'obrigacoes', titulo: 'Obrigações', icone: ClipboardCheck, descricao: 'Prazos e entregas', permitido: (p) => p('gerenciar_obrigacoes'), permissao: PERMISSOES.gerenciar_obrigacoes },
  { segmento: 'impostos', titulo: 'Impostos', icone: Landmark, descricao: 'Guias e parcelamentos', permitido: (p) => p('gerenciar_impostos'), permissao: PERMISSOES.gerenciar_impostos },
  { segmento: 'financeiro', titulo: 'Financeiro', icone: DollarSign, descricao: 'Visão financeira do mês', permitido: (p) => p('ver_financeiro'), permissao: PERMISSOES.ver_financeiro },
  { segmento: 'folha', titulo: 'Folha', icone: Wallet, descricao: 'Folha de pagamento', permitido: (p) => p('ver_folha'), permissao: PERMISSOES.ver_folha },
  { segmento: 'agenda', titulo: 'Agenda', icone: Calendar, descricao: 'Compromissos compartilhados', permitido: (p) => p('gerenciar_agenda'), permissao: PERMISSOES.gerenciar_agenda },
  { segmento: 'tarefas', titulo: 'Tarefas', icone: ListChecks, descricao: 'Organização do trabalho', permitido: () => true },
  { segmento: 'saude', titulo: 'Saúde Empresarial', icone: HeartPulse, descricao: 'Indicadores (somente leitura)', permitido: (p) => p('ver_financeiro') || p('gerenciar_financeiro'), permissao: PERMISSOES.ver_financeiro },
];
const SEGMENTOS = new Set(MODULOS.map((m) => m.segmento).filter(Boolean));
export const rotaEmpresa = (id: string, segmento = '') => `/contador/empresas/${id}${segmento ? `/${segmento}` : ''}`;

interface ContextoValor {
  empresa: EmpresaPainel; contador: ContadorAtual; pode: (p: Permissao) => boolean;
  versao: number; alterado: (m: string) => void; setAviso: (m: string | null) => void;
}
const Contexto = createContext<ContextoValor | null>(null);
export function useEspacoEmpresa(): ContextoValor {
  const v = useContext(Contexto);
  if (!v) throw new Error('useEspacoEmpresa fora do espaço da empresa');
  return v;
}

const iniciais = (nome: string) => nome.split(/\s+/).filter((p) => p.length > 2 || /^[A-Z]/.test(p)).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || nome.slice(0, 2).toUpperCase();

export function EspacoEmpresa({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const contador = useContadorAtual();
  const { aviso, setAviso, versao, alterado } = useAvisoEVersao();
  const [empresas, setEmpresas] = useState<EmpresaPainel[] | null>(null);
  const [carregadoPara, setCarregadoPara] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // A cada empresa (troca, voltar/avançar, F5) recarrega do banco: nada da empresa anterior fica na tela
  useEffect(() => {
    if (!contador) return;
    let ativo = true;
    setCarregadoPara(null); setErro(null); setAviso(null);
    createClient().rpc('painel_contador').then(({ data, error }) => {
      if (!ativo) return;
      if (error) setErro(mensagemDeErro(error, 'Não foi possível carregar a empresa.'));
      else setEmpresas((data ?? []) as EmpresaPainel[]);
      setCarregadoPara(id);
    });
    return () => { ativo = false; };
  }, [contador, id, setAviso]);
  // Depois de uma ação num módulo, atualiza indicadores/permissões em silêncio (sem remontar o módulo)
  useEffect(() => {
    if (!contador || versao === 0) return;
    createClient().rpc('painel_contador').then(({ data, error }) => { if (!error) setEmpresas((data ?? []) as EmpresaPainel[]); });
  }, [contador, versao]);

  if (!contador) return null;
  const voltar = <Link href="/contador/empresas" className="min-h-11 inline-flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" aria-hidden="true" />Minhas empresas</Link>;
  if (erro) return <div className="space-y-4">{voltar}<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div></div>;
  if (carregadoPara !== id || empresas === null) return <div role="status" aria-label="Carregando empresa" className="h-40 rounded-2xl bg-white border border-gray-200 animate-pulse" />;
  const empresa = empresas.find((e) => e.id_empresa === id) ?? null;
  if (!empresa) {
    return (
      <div className="space-y-4">
        {voltar}
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <Lock className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
          <p className="font-semibold text-gray-900">Você não tem acesso a esta empresa.</p>
          <p className="text-sm text-gray-600 mt-1">O acesso existe só enquanto houver vínculo ativo com a empresa.</p>
        </div>
      </div>
    );
  }
  const pode = (p: Permissao) => empresa.permissoes.includes(p);
  const base = rotaEmpresa(id);
  const segmentoAtual = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1).split('/')[0] : '';
  const modulos = MODULOS.filter((m) => m.permitido(pode));

  return (
    <Contexto.Provider value={{ empresa, contador, pode, versao, alterado, setAviso }}>
      <div className="space-y-4 min-w-0">
        <section aria-label="Empresa selecionada" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
          <span className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-full bg-orange-600 text-white text-lg font-black inline-flex items-center justify-center" aria-hidden="true">{iniciais(empresa.nome)}</span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 break-words">{empresa.nome}</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true" />Vínculo ativo</span>
            </div>
            <p className="text-sm text-gray-600" data-testid="cnpj-empresa">CNPJ {formatarCnpj(empresa.cnpj)}</p>
          </div>
          <TrocarEmpresa atual={empresa} empresas={empresas} segmento={segmentoAtual} />
        </section>

        <MenuEmpresa id={id} modulos={modulos} atual={segmentoAtual} />

        {aviso && <Aviso tipo={aviso.startsWith('Atenção') ? 'info' : 'sucesso'}>{aviso}</Aviso>}
        {/* key: ao trocar de empresa, os módulos são remontados (sem estado da empresa anterior) */}
        <div key={id} className="min-w-0">{children}</div>
      </div>
    </Contexto.Provider>
  );
}

// Menu horizontal: links reais (F5, voltar/avançar, abrir em nova aba); rola lateralmente em telas estreitas
function MenuEmpresa({ id, modulos, atual }: { id: string; modulos: Modulo[]; atual: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Mantém o item ativo visível no menu rolável (ao trocar de módulo e ao girar/redimensionar a tela), sem rolar a página
  useEffect(() => {
    const centralizar = () => {
      const lista = ref.current;
      const item = lista?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!lista || !item) return;
      if (item.offsetLeft < lista.scrollLeft || item.offsetLeft + item.offsetWidth > lista.scrollLeft + lista.clientWidth)
        lista.scrollLeft = item.offsetLeft - (lista.clientWidth - item.offsetWidth) / 2;
    };
    centralizar();
    window.addEventListener('resize', centralizar);
    return () => window.removeEventListener('resize', centralizar);
  }, [atual]);
  return (
    <nav aria-label="Espaço da empresa" className="bg-white rounded-2xl border border-gray-200 shadow-sm min-w-0">
      <div ref={ref} className="relative flex gap-1 overflow-x-auto px-2 [scrollbar-width:thin]">
        {modulos.map((m) => {
          const Icone = m.icone;
          const ativo = atual === m.segmento;
          return (
            <Link key={m.segmento || 'visao-geral'} href={rotaEmpresa(id, m.segmento)} aria-current={ativo ? 'page' : undefined}
              className={`shrink-0 min-h-12 px-3 inline-flex items-center gap-2 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 rounded-t-lg ${
                ativo ? 'border-orange-600 text-orange-600' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>
              <Icone className="w-4 h-4" aria-hidden="true" />{m.titulo}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// Troca de empresa: só empresas com vínculo ativo (mesma fonte do banco). Mantém o módulo atual se a nova empresa o permitir.
function TrocarEmpresa({ atual, empresas, segmento }: { atual: EmpresaPainel; empresas: EmpresaPainel[]; segmento: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  const outras = empresas.filter((e) => e.id_empresa !== atual.id_empresa);
  const b = busca.trim().toLowerCase();
  const lista = outras.filter((e) => !b || e.nome.toLowerCase().includes(b) || e.cnpj.includes(b.replace(/\D/g, '') || '§'));
  const ir = (e: EmpresaPainel) => {
    const modulo = MODULOS.find((m) => m.segmento === segmento);
    const manter = modulo && modulo.permitido((p) => e.permissoes.includes(p));
    setAberto(false); setBusca('');
    router.push(rotaEmpresa(e.id_empresa, manter ? segmento : ''));
  };
  return (
    <div ref={caixa} className="relative self-stretch sm:self-auto">
      <button type="button" aria-haspopup="true" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}
        className="w-full sm:w-auto min-h-11 px-4 inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
        Trocar empresa<ChevronDown className={`w-4 h-4 transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {aberto && (
        <div role="dialog" aria-label="Trocar empresa" className="absolute right-0 top-12 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white shadow-xl p-2 space-y-2">
          {outras.length > 5 && (
            <div className="relative"><Search className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" aria-hidden="true" />
              <input autoFocus type="search" aria-label="Buscar empresa" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou CNPJ..."
                className="w-full h-11 pl-9 pr-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
          )}
          {outras.length === 0 ? <p className="text-sm text-gray-500 px-2 py-3">Nenhuma outra empresa com vínculo ativo.</p> : (
            <ul className="max-h-72 overflow-y-auto" aria-label="Empresas vinculadas">
              {lista.map((e) => (
                <li key={e.id_empresa}>
                  <button type="button" onClick={() => ir(e)} className="w-full min-h-11 px-2 py-1.5 rounded-lg text-left hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 flex items-center gap-2">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-orange-100 text-orange-700 text-xs font-bold inline-flex items-center justify-center" aria-hidden="true">{iniciais(e.nome)}</span>
                    <span className="min-w-0"><span className="block text-sm font-semibold text-gray-900 truncate">{e.nome}</span><span className="block text-xs text-gray-500">CNPJ {formatarCnpj(e.cnpj)}</span></span>
                  </button>
                </li>
              ))}
              {lista.length === 0 && <li className="text-sm text-gray-500 px-2 py-3">Nenhuma empresa encontrada.</li>}
            </ul>
          )}
          <Link href="/contador/empresas" onClick={() => setAberto(false)} className="block text-center min-h-10 leading-10 text-sm font-semibold text-orange-600 hover:underline border-t border-gray-100">Ver todas em Minhas empresas</Link>
        </div>
      )}
    </div>
  );
}

// Página de módulo acessada sem a permissão (ex.: link antigo ou URL digitada): explica em vez de quebrar
export function ExigePermissao({ modulo, children }: { modulo: string; children: ReactNode }) {
  const { pode } = useEspacoEmpresa();
  const m = MODULOS.find((x) => x.segmento === modulo)!;
  if (m.permitido(pode)) return <>{children}</>;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center" data-testid="sem-permissao-modulo">
      <Lock className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
      <p className="font-semibold text-gray-900">{m.titulo}: sem permissão nesta empresa.</p>
      <p className="text-sm text-gray-600 mt-1">Peça à empresa para liberar &quot;{m.permissao}&quot; no seu vínculo.</p>
    </div>
  );
}

export { SEGMENTOS };
