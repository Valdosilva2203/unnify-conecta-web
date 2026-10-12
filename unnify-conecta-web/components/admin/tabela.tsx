'use client';

import { Children, createContext, useContext, type ReactNode } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  CreditCard,
  Filter,
  Layers,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Search,
  Users,
  type LucideIcon,
} from 'lucide-react';

// Abaixo de 85rem (1360px) as linhas viram cartões.

export function TabelaCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 2xl:p-5 space-y-4">
      {children}
    </div>
  );
}

export function BarraFiltros({ children }: { children: ReactNode }) {
  return <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">{children}</div>;
}

export function CampoBusca({
  valor,
  aoMudar,
  placeholder,
}: {
  valor: string;
  aoMudar: (valor: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full sm:flex-1 sm:min-w-[260px]">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" aria-hidden="true" />
      <input
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        className="w-full h-11 pl-11 pr-4 text-sm border border-gray-200 rounded-xl bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
      />
    </div>
  );
}

export function FiltroSelect({
  icone = Filter,
  valor,
  aoMudar,
  children,
}: {
  icone?: LucideIcon;
  valor: string;
  aoMudar: (valor: string) => void;
  children: ReactNode;
}) {
  const Icone = icone;
  return (
    <div className="relative w-full sm:w-48">
      <Icone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-700 pointer-events-none" aria-hidden="true" />
      <select
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="w-full h-11 pl-10 pr-9 text-sm font-medium text-gray-800 border border-gray-200 rounded-xl bg-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
      >
        {children}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-700 pointer-events-none" aria-hidden="true" />
    </div>
  );
}

export function BotaoLimparFiltros({ aoClicar }: { aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className="h-11 px-4 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
    >
      Limpar filtros
    </button>
  );
}

export interface Coluna {
  titulo: string;
  alinhar?: 'esquerda' | 'centro' | 'direita';
}

const ALINHAMENTO = {
  esquerda: 'min-[85rem]:text-left',
  centro: 'min-[85rem]:text-center',
  direita: 'min-[85rem]:text-right',
};

const ColunasContexto = createContext<Coluna[]>([]);
const ColunaContexto = createContext<{ coluna?: Coluna; indice: number }>({ indice: -1 });

export function Tabela({ colunas, children }: { colunas: Coluna[]; children: ReactNode }) {
  return (
    <ColunasContexto.Provider value={colunas}>
      <div className="min-[85rem]:overflow-x-auto">
        <table className="block min-[85rem]:table w-full text-sm">
          <thead className="hidden min-[85rem]:table-header-group">
            <tr className="bg-gray-50">
              {colunas.map((coluna) => (
                <th
                  key={coluna.titulo}
                  scope="col"
                  className={`px-2 2xl:px-3 py-3.5 text-xs font-semibold text-gray-700 whitespace-nowrap first:rounded-l-xl last:rounded-r-xl ${
                    ALINHAMENTO[coluna.alinhar ?? 'esquerda']
                  }`}
                >
                  {coluna.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="grid gap-3 md:grid-cols-2 min-[85rem]:table-row-group min-[85rem]:divide-y min-[85rem]:divide-gray-100">
            {children}
          </tbody>
        </table>
      </div>
    </ColunasContexto.Provider>
  );
}

export function Linha({ children }: { children: ReactNode }) {
  const colunas = useContext(ColunasContexto);
  let indice = -1;
  return (
    <tr className="block rounded-xl border border-gray-200 bg-white p-3 min-[85rem]:table-row min-[85rem]:rounded-none min-[85rem]:border-0 min-[85rem]:p-0 min-[85rem]:hover:bg-gray-50/60 transition-colors">
      {Children.map(children, (filho) => {
        indice += 1;
        return (
          <ColunaContexto.Provider value={{ coluna: colunas[indice], indice }}>{filho}</ColunaContexto.Provider>
        );
      })}
    </tr>
  );
}

export function Celula({
  children,
  alinhar = 'esquerda',
  className = '',
}: {
  children: ReactNode;
  alinhar?: Coluna['alinhar'];
  className?: string;
}) {
  const { coluna, indice } = useContext(ColunaContexto);
  const principal = indice === 0;
  const acoes = coluna?.titulo === 'Ações';

  const cartao = principal
    ? 'block pb-3 mb-1 border-b border-gray-100'
    : acoes
      ? 'flex justify-end pt-3 mt-2 border-t border-gray-100'
      : 'flex items-start justify-between gap-4 py-1.5';

  const tabela =
    'min-[85rem]:table-cell min-[85rem]:px-2 2xl:px-3 min-[85rem]:py-4 min-[85rem]:mt-0 min-[85rem]:mb-0 min-[85rem]:border-0 min-[85rem]:align-middle';

  return (
    <td className={`${cartao} ${tabela} text-[13px] text-gray-800 ${ALINHAMENTO[alinhar]} ${className}`}>
      {!principal && !acoes && coluna && (
        <span className="min-[85rem]:hidden shrink-0 pt-0.5 text-xs font-medium text-gray-500">{coluna.titulo}</span>
      )}
      {principal || acoes ? (
        children
      ) : (
        <div className="min-w-0 text-right min-[85rem]:[text-align:inherit]">{children}</div>
      )}
    </td>
  );
}

const CORES_AVATAR = [
  'bg-orange-100 text-orange-600',
  'bg-blue-100 text-blue-600',
  'bg-green-100 text-green-600',
  'bg-purple-100 text-purple-600',
  'bg-pink-100 text-pink-600',
  'bg-amber-100 text-amber-700',
];

function iniciais(nome: string): string {
  const partes = nome
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-ZÀ-Ú]/.test(p));
  const letras = (partes.length > 0 ? partes : [nome]).slice(0, 2).map((p) => p[0]);
  return letras.join('').toUpperCase();
}

function corDoNome(nome: string): string {
  let soma = 0;
  for (const c of nome) soma = (soma * 31 + c.charCodeAt(0)) >>> 0;
  return CORES_AVATAR[soma % CORES_AVATAR.length];
}

export function Avatar({ nome, indice }: { nome: string; indice?: number }) {
  const cor = indice !== undefined ? CORES_AVATAR[indice % CORES_AVATAR.length] : corDoNome(nome);
  return (
    <div
      aria-hidden="true"
      className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-[15px] font-semibold ${cor}`}
    >
      {iniciais(nome)}
    </div>
  );
}

export function CelulaNome({
  nome,
  detalhes = [],
  indice,
}: {
  nome: string;
  detalhes?: (string | null | undefined)[];
  indice?: number;
}) {
  return (
    <div className="flex items-center gap-2.5 2xl:gap-3 min-[85rem]:min-w-[150px] 2xl:min-w-[200px]">
      <Avatar nome={nome} indice={indice} />
      <div className="min-w-0">
        <p className="text-sm font-bold text-gray-900 leading-snug break-words">{nome}</p>
        {detalhes.filter(Boolean).map((detalhe, i) => (
          <p key={i} className="text-xs text-gray-500 leading-snug break-words">
            {detalhe}
          </p>
        ))}
      </div>
    </div>
  );
}

export function CelulaContato({ telefone, email }: { telefone?: string | null; email?: string | null }) {
  return (
    <div className="space-y-1.5">
      {telefone && (
        <p className="flex items-center justify-end min-[85rem]:justify-start gap-2 text-[13px] text-gray-800 whitespace-nowrap">
          <Phone className="w-4 h-4 shrink-0 text-orange-500 fill-orange-500" aria-hidden="true" />
          <a href={`tel:${telefone.replace(/\D/g, '')}`} className="hover:underline">
            {telefone}
          </a>
        </p>
      )}
      {email && (
        <p className="flex items-center justify-end min-[85rem]:justify-start gap-2 text-xs text-gray-600 break-all">
          <Mail className="w-4 h-4 shrink-0 text-white fill-orange-500" aria-hidden="true" />
          <a href={`mailto:${email}`} className="hover:underline">
            {email}
          </a>
        </p>
      )}
    </div>
  );
}

export function CelulaCidade({ cidade, uf }: { cidade?: string | null; uf?: string | null }) {
  if (!cidade && !uf) return <span className="text-gray-400">—</span>;
  return (
    <span className="flex items-center justify-end min-[85rem]:justify-start gap-2 text-[13px] text-gray-800">
      <MapPin className="w-4 h-4 shrink-0 text-gray-700 fill-gray-700 stroke-white" aria-hidden="true" />
      {[cidade, uf].filter(Boolean).join('/')}
    </span>
  );
}

export function Contagem({ valor }: { valor: number | string | null | undefined }) {
  if (valor === null || valor === undefined || valor === '') {
    return <span className="text-gray-400 font-semibold">—</span>;
  }
  return (
    <span className="inline-flex items-center justify-center min-w-8 h-8 px-2.5 rounded-lg bg-blue-50 text-blue-700 font-semibold text-sm">
      {valor}
    </span>
  );
}

export type TipoSelo = 'sucesso' | 'alerta' | 'perigo' | 'info' | 'roxo' | 'neutro';

const CORES_SELO: Record<TipoSelo, { fundo: string; ponto: string }> = {
  sucesso: { fundo: 'bg-green-50 text-green-700', ponto: 'bg-green-500' },
  alerta: { fundo: 'bg-orange-50 text-orange-700', ponto: 'bg-orange-500' },
  perigo: { fundo: 'bg-red-50 text-red-700', ponto: 'bg-red-500' },
  info: { fundo: 'bg-blue-50 text-blue-700', ponto: 'bg-blue-500' },
  roxo: { fundo: 'bg-purple-50 text-purple-700', ponto: 'bg-purple-500' },
  neutro: { fundo: 'bg-gray-100 text-gray-600', ponto: 'bg-gray-400' },
};

export function Selo({ tipo, texto }: { tipo: TipoSelo; texto: string }) {
  const cor = CORES_SELO[tipo];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 2xl:px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${cor.fundo}`}
    >
      <span className={`w-2 h-2 rounded-full ${cor.ponto}`} aria-hidden="true" />
      {texto}
    </span>
  );
}

export function BotaoIcone({
  icone: Icone,
  titulo,
  aoClicar,
}: {
  icone: LucideIcon;
  titulo: string;
  aoClicar?: () => void;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={aoClicar}
      className="w-11 h-11 min-[85rem]:w-8 min-[85rem]:h-8 2xl:w-9 2xl:h-9 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 hover:border-gray-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
    >
      <Icone className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}

export function BotoesAcao({
  aoVer,
  aoEditar,
  aoMais,
}: {
  aoVer?: () => void;
  aoEditar?: () => void;
  aoMais?: () => void;
}) {
  return (
    <div className="flex items-center justify-end min-[85rem]:justify-center gap-2 min-[85rem]:gap-1.5 2xl:gap-2">
      <BotaoIcone icone={Eye} titulo="Ver" aoClicar={aoVer} />
      <BotaoIcone icone={Pencil} titulo="Editar" aoClicar={aoEditar} />
      <BotaoIcone icone={MoreHorizontal} titulo="Mais ações" aoClicar={aoMais} />
    </div>
  );
}

export function Paginacao({
  pagina,
  aoMudarPagina,
  porPagina,
  aoMudarPorPagina,
  total,
}: {
  pagina: number;
  aoMudarPagina: (pagina: number) => void;
  porPagina: number;
  aoMudarPorPagina: (porPagina: number) => void;
  total: number;
}) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const inicio = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const fim = Math.min(pagina * porPagina, total);
  const primeira = Math.max(1, Math.min(pagina - 2, totalPaginas - 4));
  const paginas = Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => primeira + i);

  const tamanho = 'w-11 h-11 sm:w-10 sm:h-10';
  const botaoSeta = `${tamanho} inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500`;

  return (
    <nav aria-label="Paginação" className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2">
      <p className="text-sm text-gray-700" aria-live="polite">
        Mostrando {inicio} a {fim} de {total} {total === 1 ? 'resultado' : 'resultados'}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="relative">
          <select
            aria-label="Itens por página"
            value={porPagina}
            onChange={(e) => {
              aoMudarPorPagina(Number(e.target.value));
              aoMudarPagina(1);
            }}
            className="h-11 sm:h-10 pl-4 pr-10 text-sm text-gray-800 border border-gray-200 rounded-lg bg-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value={10}>10 por página</option>
            <option value={20}>20 por página</option>
            <option value={50}>50 por página</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={botaoSeta}
            disabled={pagina <= 1}
            onClick={() => aoMudarPagina(pagina - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          {paginas.map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => aoMudarPagina(p)}
              aria-label={`Página ${p}`}
              aria-current={p === pagina ? 'page' : undefined}
              className={`${tamanho} rounded-lg text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                p === pagina
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            className={botaoSeta}
            disabled={pagina >= totalPaginas}
            onClick={() => aoMudarPagina(pagina + 1)}
            aria-label="Próxima página"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
  );
}

export function EstadoTabela({
  carregando,
  erro,
  vazio,
  mensagemVazio,
  children,
}: {
  carregando?: boolean;
  erro?: string | null;
  vazio?: boolean;
  mensagemVazio: string;
  children: ReactNode;
}) {
  if (carregando) {
    return (
      <div role="status" className="space-y-3 py-2" aria-label="Carregando">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3 animate-pulse">
            <div className="w-11 h-11 rounded-full bg-gray-100" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded bg-gray-100" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
            </div>
          </div>
        ))}
        <span className="sr-only">Carregando...</span>
      </div>
    );
  }
  if (erro) {
    return (
      <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-5">
        <p className="text-red-700 font-medium mb-1">Não foi possível carregar os dados.</p>
        <p className="text-red-600 text-sm">Verifique sua conexão e tente novamente.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 min-h-11 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
        >
          Tentar novamente
        </button>
      </div>
    );
  }
  if (vazio) {
    return <p className="text-center text-sm text-gray-500 py-12">{mensagemVazio}</p>;
  }
  return <>{children}</>;
}

export const SELO_STATUS: Record<string, TipoSelo> = {
  ativo: 'sucesso',
  pendente: 'alerta',
  inativo: 'perigo',
};

export const SELO_PLANO: Record<string, TipoSelo> = {
  Básico: 'info',
  Pro: 'roxo',
  Premium: 'alerta',
};

export function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function seloDaCor(classes: string): TipoSelo {
  if (classes.includes('green')) return 'sucesso';
  if (classes.includes('red')) return 'perigo';
  if (classes.includes('orange') || classes.includes('yellow') || classes.includes('amber')) return 'alerta';
  if (classes.includes('purple') || classes.includes('violet')) return 'roxo';
  if (classes.includes('blue')) return 'info';
  return 'neutro';
}

export const ROTULO_STATUS: Record<string, string> = {
  ativo: 'Ativo',
  pendente: 'Pendente',
  inativo: 'Inativo',
};

export {
  MapPin as IconeCidade,
  Filter as IconeFiltro,
  CreditCard as IconePlano,
  Users as IconeTipo,
  Calendar as IconeData,
  Layers as IconeCategoria,
};
