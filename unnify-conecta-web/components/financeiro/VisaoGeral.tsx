'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarClock, ChevronRight, TrendingDown, TrendingUp, Wallet, BarChart3, PieChart } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  ROTULO_SITUACAO, SELO_SITUACAO, formatarData, formatarMoeda, rotuloMes, rotuloMesCurto, variacaoPercentual, type Lancamento,
} from '@/lib/financeiro';
import { Selo } from '@/components/admin/tabela';
import { IconeCategoria } from './IconeCategoria';
import { GraficoRosca } from './GraficoRosca';

interface Resumo {
  periodo_fim: string;
  receitas_mes: number;
  despesas_mes: number;
  receitas_mes_anterior: number;
  despesas_mes_anterior: number;
  pagamentos_financiamentos_mes: number;
  juros_financiamentos_mes: number;
  // Migration 000031 (classificação financeira); ausentes antes dela
  pro_labore_mes?: number;
  distribuicoes_lucros_mes?: number;
  aportes_socios_mes?: number;
  entradas_financiamentos_mes?: number;
  amortizacao_financiamentos_mes?: number;
  transferencias_mes?: number;
  entradas_caixa_mes?: number;
  saidas_caixa_mes?: number;
  saldo_acumulado: number;
  qtd_contas: number;
  a_pagar_30_valor: number;
  a_pagar_30_qtd: number;
  a_pagar_vencidas_qtd: number;
  a_receber_vencidas_qtd: number;
  tem_lancamentos: boolean;
  serie: { mes: string; receitas: number; despesas: number }[];
  despesas_por_categoria: { categoria: string; cor: string; icone: string; valor: number }[];
}

function Cartao({ titulo, valor, icone: Icone, cor, children }: { titulo: string; valor: string; icone: typeof Wallet; cor: string; children?: React.ReactNode }) {
  return (
    <section aria-label={titulo} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-start gap-3 min-w-0">
      <span className={`w-11 h-11 shrink-0 rounded-xl inline-flex items-center justify-center ${cor}`}>
        <Icone className="w-5 h-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-gray-600">{titulo}</p>
        <p className="text-xl font-bold text-gray-900 break-words">{valor}</p>
        <div className="text-xs mt-0.5">{children}</div>
      </div>
    </section>
  );
}

function Variacao({ atual, anterior, positivoBom, rotuloAnterior }: { atual: number; anterior: number; positivoBom: boolean; rotuloAnterior: string }) {
  const v = variacaoPercentual(atual, anterior);
  if (v === null) return <span className="text-gray-500">Sem dados de {rotuloAnterior.toLowerCase()} para comparar</span>;
  const bom = v === 0 ? null : v > 0 === positivoBom;
  const Seta = v >= 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 ${bom === null ? 'text-gray-500' : bom ? 'text-green-700' : 'text-red-700'}`}>
      <Seta className="w-3 h-3" aria-hidden="true" />
      {Math.abs(v)}% em relação a {rotuloAnterior.toLowerCase()}
    </span>
  );
}

// Gráfico de barras (SVG, sem dependências). Totais vêm prontos do banco.
function GraficoBarras({ serie }: { serie: Resumo['serie'] }) {
  const maximo = Math.max(1, ...serie.flatMap((s) => [Number(s.receitas), Number(s.despesas)]));
  const largura = 600;
  const altura = 220;
  const base = 190;
  const grupo = largura / serie.length;
  const barra = Math.min(28, grupo / 3.2);
  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full h-auto" role="img" aria-label="Receitas e despesas dos últimos seis meses">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1="0" x2={largura} y1={base - f * 170} y2={base - f * 170} stroke="#f3f4f6" />
      ))}
      {serie.map((s, i) => {
        const x = i * grupo + grupo / 2;
        const hr = (Number(s.receitas) / maximo) * 170;
        const hd = (Number(s.despesas) / maximo) * 170;
        return (
          <g key={s.mes}>
            <rect x={x - barra - 2} y={base - hr} width={barra} height={hr} rx="3" fill="#22c55e">
              <title>{`Receitas ${rotuloMes(s.mes)}: ${formatarMoeda(s.receitas)}`}</title>
            </rect>
            <rect x={x + 2} y={base - hd} width={barra} height={hd} rx="3" fill="#f87171">
              <title>{`Despesas ${rotuloMes(s.mes)}: ${formatarMoeda(s.despesas)}`}</title>
            </rect>
            <text x={x} y={altura - 8} textAnchor="middle" fontSize="13" fill="#6b7280">
              {rotuloMesCurto(s.mes)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Movimentações que NÃO são receita/despesa operacional: aparecem separadas para não distorcer faturamento e despesas.
function OutrasMovimentacoes({ resumo }: { resumo: Resumo }) {
  const v = (n: number | undefined) => Number(n ?? 0);
  const linhas: { rotulo: string; valor: number; sinal: '+' | '−' | ''; ajuda: string; id: string }[] = [
    { id: 'pro-labore', rotulo: 'Pró-labore', valor: v(resumo.pro_labore_mes), sinal: '−', ajuda: 'Remuneração dos sócios administradores' },
    { id: 'distribuicoes', rotulo: 'Distribuição de lucros', valor: v(resumo.distribuicoes_lucros_mes), sinal: '−', ajuda: 'Lucro repassado aos sócios' },
    { id: 'aportes', rotulo: 'Aportes de sócios', valor: v(resumo.aportes_socios_mes), sinal: '+', ajuda: 'Dinheiro colocado pelos sócios' },
    { id: 'entradas-emprestimos', rotulo: 'Empréstimos recebidos', valor: v(resumo.entradas_financiamentos_mes), sinal: '+', ajuda: 'Principal recebido de bancos' },
    { id: 'amortizacao', rotulo: 'Amortização de empréstimos', valor: v(resumo.amortizacao_financiamentos_mes), sinal: '−', ajuda: 'Principal devolvido' },
    { id: 'juros', rotulo: 'Juros e encargos', valor: v(resumo.juros_financiamentos_mes), sinal: '−', ajuda: 'Informados nas parcelas dos contratos' },
    { id: 'transferencias', rotulo: 'Transferências entre contas', valor: v(resumo.transferencias_mes), sinal: '', ajuda: 'Não alteram o total da empresa' },
  ];
  return (
    <section aria-label="Outras movimentações do mês" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-bold text-gray-900">Outras movimentações do mês</h2>
        <p className="text-xs text-gray-500">
          Caixa do mês: entradas {formatarMoeda(resumo.entradas_caixa_mes)} · saídas {formatarMoeda(resumo.saidas_caixa_mes)}
        </p>
      </div>
      <p className="text-xs text-gray-500 mb-3">Não entram em “Receitas do mês” nem em “Despesas do mês”, que mostram só o operacional.</p>
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
        {linhas.map((l) => (
          <li key={l.id} className="flex items-start justify-between gap-3 border-b border-gray-100 pb-2 min-w-0" data-testid={`outras-${l.id}`}>
            <span className="min-w-0">
              <span className="block text-sm text-gray-800">{l.rotulo}</span>
              <span className="block text-xs text-gray-500">{l.ajuda}</span>
            </span>
            <span className={`text-sm font-semibold whitespace-nowrap ${l.valor === 0 ? 'text-gray-400' : l.sinal === '+' ? 'text-green-700' : l.sinal === '−' ? 'text-red-700' : 'text-gray-800'}`}>
              {l.valor > 0 && l.sinal ? `${l.sinal} ` : ''}{formatarMoeda(l.valor)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ListaResumo({ titulo, itens, aoVerTodas, vazio }: { titulo: string; itens: Lancamento[]; aoVerTodas?: () => void; vazio: string }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-gray-900">{titulo}</h2>
        {aoVerTodas && <button type="button" onClick={aoVerTodas} className="min-h-11 inline-flex items-center gap-1 text-sm font-semibold text-orange-600 hover:text-orange-700">
          Ver todas <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>}
      </div>
      {itens.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">{vazio}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {itens.map((l) => (
            <li key={l.id} className="py-2.5 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{l.descricao}</p>
                <p className="text-xs text-gray-500">Vence {formatarData(l.data_vencimento)}</p>
              </div>
              <span className="font-semibold text-gray-900 whitespace-nowrap">{formatarMoeda(l.valor)}</span>
              <span className="hidden sm:inline"><Selo tipo={SELO_SITUACAO[l.situacao]} texto={ROTULO_SITUACAO[l.situacao][l.tipo]} /></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Sem aoIrPara/aoNovo = somente leitura (ex.: contador com "Ver financeiro" no espaço da empresa)
export function VisaoGeral({ idEmpresa, periodo, versao, aoIrPara, aoNovo }: { idEmpresa: string; periodo: string; versao: number; aoIrPara?: (aba: 'pagar' | 'receber') => void; aoNovo?: () => void }) {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [pagar, setPagar] = useState<Lancamento[]>([]);
  const [receber, setReceber] = useState<Lancamento[]>([]);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    const supabase = createClient();
    const proximas = (tipo: string) =>
      supabase.from('lancamentos_financeiros_situacao').select('*').eq('id_empresa', idEmpresa).eq('tipo', tipo).in('situacao', ['pendente', 'vencido']).order('data_vencimento').limit(5);
    Promise.all([supabase.rpc('resumo_financeiro', { p_id_empresa: idEmpresa, p_mes: periodo }), proximas('despesa'), proximas('receita')]).then(([r, p, rc]) => {
      if (!ativo) return;
      if (r.error) return setErro(true);
      setErro(false);
      setResumo(r.data as Resumo);
      setPagar((p.data ?? []) as Lancamento[]);
      setReceber((rc.data ?? []) as Lancamento[]);
    });
    return () => {
      ativo = false;
    };
  }, [idEmpresa, periodo, versao]);

  if (erro) return <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700">Não foi possível carregar o resumo financeiro.</div>;
  if (!resumo) {
    return (
      <div role="status" aria-label="Carregando" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-white border border-gray-100 animate-pulse" />)}
      </div>
    );
  }

  const mesAnterior = rotuloMes(resumo.serie.at(-2)?.mes ?? periodo).split(' de ')[0];
  const totalCategorias = resumo.despesas_por_categoria.reduce((s, c) => s + Number(c.valor), 0);
  const semMovimento = resumo.serie.every((s) => !Number(s.receitas) && !Number(s.despesas));

  return (
    <div className="space-y-5">
      {!resumo.tem_lancamentos && (
        <div className="bg-white rounded-2xl border border-dashed border-orange-300 p-6 text-center">
          <p className="font-semibold text-gray-900">Comece registrando suas receitas e despesas</p>
          <p className="text-sm text-gray-600 mt-1">Os indicadores e gráficos aparecem aqui assim que houver lançamentos.</p>
          {aoNovo && <button type="button" onClick={aoNovo} className="mt-4 min-h-11 px-5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold">
            + Novo lançamento
          </button>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao titulo="Receitas do mês" valor={formatarMoeda(resumo.receitas_mes)} icone={TrendingUp} cor="bg-green-100 text-green-700">
          <Variacao atual={Number(resumo.receitas_mes)} anterior={Number(resumo.receitas_mes_anterior)} positivoBom rotuloAnterior={mesAnterior} />
        </Cartao>
        <Cartao titulo="Despesas do mês" valor={formatarMoeda(resumo.despesas_mes)} icone={TrendingDown} cor="bg-red-100 text-red-700">
          <Variacao atual={Number(resumo.despesas_mes)} anterior={Number(resumo.despesas_mes_anterior)} positivoBom={false} rotuloAnterior={mesAnterior} />
          {Number(resumo.pagamentos_financiamentos_mes) > 0 && (
            <span className="block text-gray-600 mt-0.5" data-testid="pagamentos-financiamentos">
              + {formatarMoeda(resumo.pagamentos_financiamentos_mes)} em empréstimos/financiamentos
              {Number(resumo.juros_financiamentos_mes) > 0 ? ` (juros ${formatarMoeda(resumo.juros_financiamentos_mes)})` : ''}
            </span>
          )}
        </Cartao>
        <Cartao titulo="Saldo financeiro" valor={formatarMoeda(resumo.saldo_acumulado)} icone={Wallet} cor="bg-blue-100 text-blue-700">
          <span className="text-gray-500">
            {resumo.qtd_contas > 0 ? `Soma das contas em ${formatarData(resumo.periodo_fim)} · calculado, não é saldo bancário` : 'Cadastre suas contas em Contas e bancos'}
          </span>
        </Cartao>
        <Cartao titulo="Contas a vencer" valor={formatarMoeda(resumo.a_pagar_30_valor)} icone={CalendarClock} cor="bg-orange-100 text-orange-700">
          <span className="text-gray-500">
            {resumo.a_pagar_30_qtd} {resumo.a_pagar_30_qtd === 1 ? 'conta' : 'contas'} nos próximos 30 dias
          </span>
          {resumo.a_pagar_vencidas_qtd > 0 && (
            <span className="block text-red-700 font-semibold">
              {resumo.a_pagar_vencidas_qtd} {resumo.a_pagar_vencidas_qtd === 1 ? 'conta vencida' : 'contas vencidas'}
            </span>
          )}
        </Cartao>
      </div>

      {resumo.pro_labore_mes !== undefined && <OutrasMovimentacoes resumo={resumo} />}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="font-bold text-gray-900 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-orange-600" aria-hidden="true" />Fluxo de caixa realizado</h2>
            <div className="flex gap-3 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500" aria-hidden="true" />Receitas</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" aria-hidden="true" />Despesas</span>
            </div>
          </div>
          {semMovimento ? <p className="text-sm text-gray-500 py-12 text-center">Sem movimentações pagas nos últimos seis meses.</p> : <GraficoBarras serie={resumo.serie} />}
          <p className="text-xs text-gray-500 mt-1">Últimos 6 meses, pelos valores efetivamente pagos e recebidos.</p>
        </section>
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0">
          <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3"><PieChart className="w-5 h-5 text-orange-600" aria-hidden="true" />Despesas por categoria</h2>
          {totalCategorias > 0 ? <GraficoRosca itens={resumo.despesas_por_categoria} total={totalCategorias} /> : <p className="text-sm text-gray-500 py-12 text-center">Nenhuma despesa paga em {rotuloMes(periodo).toLowerCase()}.</p>}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ListaResumo titulo="Contas a pagar" itens={pagar} aoVerTodas={aoIrPara && (() => aoIrPara('pagar'))} vazio="Nenhuma conta a pagar em aberto." />
        <ListaResumo titulo="Contas a receber" itens={receber} aoVerTodas={aoIrPara && (() => aoIrPara('receber'))} vazio="Nenhuma conta a receber em aberto." />
      </div>
    </div>
  );
}
