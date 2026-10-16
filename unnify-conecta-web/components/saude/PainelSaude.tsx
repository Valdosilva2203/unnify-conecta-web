'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowDown, ArrowUp, BarChart3, CalendarClock, ChevronRight, CircleDollarSign, Gauge, HeartPulse, Info, Landmark,
  Lightbulb, Lock, PieChart, Percent, RefreshCw, ShieldCheck, Timer, TrendingDown, TrendingUp, Wallet, type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MENSAGEM_RECURSO_AUSENTE, recursoAusente } from '@/lib/erros-banco';
import { formatarData, formatarMoeda } from '@/lib/financeiro';
import {
  COMPONENTES, FAIXAS, METODOLOGIA_VERSAO, MOTIVO_COMPONENTE, PERIODOS, REGRAS_INDICE, avaliacaoPontos, decimal, percentual, rotuloPeriodo,
  textoRecomendacao, type CodigoComponente, type ContaAVencer, type SaudeEmpresarial, type Severidade,
} from '@/lib/saude-empresarial';
import { Selo } from '@/components/admin/tabela';
import { GraficoRosca } from '@/components/financeiro/GraficoRosca';
import { GraficoFluxoCaixa, GraficoReceitasDespesas, MedidorIndice } from './Graficos';
import { CabecalhoModulo } from '@/components/navegacao/NavegacaoModulos';

type Estado = { tipo: 'carregando' } | { tipo: 'erro'; semAcesso: boolean; ausente?: boolean } | { tipo: 'ok'; dados: SaudeEmpresarial };
const card = 'bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0';

// papel 'empresa': página completa com links para o Financeiro. 'contador': somente leitura, sem links de edição.
export function PainelSaude({ idEmpresa, papel }: { idEmpresa: string; papel: 'empresa' | 'contador' }) {
  const [meses, setMeses] = useState(6);
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [atualizando, setAtualizando] = useState(false);
  const pedido = useRef(0);

  // silencioso = atualiza mantendo os números na tela (ao voltar para a página); erro nunca vira R$ 0,00
  const carregar = useCallback((silencioso = false) => {
    const meu = ++pedido.current;
    if (silencioso) setAtualizando(true); else setEstado({ tipo: 'carregando' });
    createClient().rpc('saude_empresarial', { p_id_empresa: idEmpresa, p_meses: meses }).then(({ data, error }) => {
      if (meu !== pedido.current) return;
      setAtualizando(false);
      if (error || !data) return setEstado({ tipo: 'erro', semAcesso: error?.code === '42501', ausente: recursoAusente(error) });
      setEstado({ tipo: 'ok', dados: data as SaudeEmpresarial });
    });
  }, [idEmpresa, meses]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === 'visible') carregar(true); };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => { document.removeEventListener('visibilitychange', aoVoltar); window.removeEventListener('focus', aoVoltar); };
  }, [carregar]);

  const Titulo = papel === 'empresa' ? 'h1' : 'h2';
  const cabecalho = (papel === 'empresa' ? (
      <CabecalhoModulo icone={HeartPulse} titulo="Saúde Empresarial" descricao="Acompanhe a saúde financeira da sua empresa e tome decisões com mais segurança."
      acoes={<>
      <div className="flex items-center gap-2">
        {atualizando && <span role="status" className="text-xs text-gray-500 inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />Atualizando</span>}
        <label className="sr-only" htmlFor={`periodo-saude-${papel}`}>Período analisado</label>
        <select id={`periodo-saude-${papel}`} value={meses} onChange={(e) => setMeses(Number(e.target.value))}
          className="min-h-11 px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500">
          {PERIODOS.map((p) => <option key={p.meses} value={p.meses}>{p.rotulo}</option>)}
        </select>
      </div>
      </>} />
    ) : (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <span className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-orange-100 text-orange-600 inline-flex items-center justify-center"><HeartPulse className="w-7 h-7" aria-hidden="true" /></span>
        <div className="min-w-0">
          <Titulo className="text-xl font-bold text-gray-900">Saúde Empresarial</Titulo>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Indicadores calculados a partir do financeiro da empresa (somente leitura).
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {atualizando && <span role="status" className="text-xs text-gray-500 inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />Atualizando</span>}
        <label className="sr-only" htmlFor={`periodo-saude-${papel}`}>Período analisado</label>
        <select id={`periodo-saude-${papel}`} value={meses} onChange={(e) => setMeses(Number(e.target.value))}
          className="min-h-11 px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500">
          {PERIODOS.map((p) => <option key={p.meses} value={p.meses}>{p.rotulo}</option>)}
        </select>
      </div>
    </div>
    ));

  if (estado.tipo === 'carregando') {
    return (
      <div className="space-y-5 min-w-0">
        {cabecalho}
        <div role="status" aria-label="Carregando indicadores" className="space-y-5">
          <div className="grid gap-4 grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-white border border-gray-100 animate-pulse" />)}</div>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-72 rounded-2xl bg-white border border-gray-100 animate-pulse" />)}</div>
          <div className="h-32 rounded-2xl bg-white border border-gray-100 animate-pulse" />
        </div>
      </div>
    );
  }
  if (estado.tipo === 'erro') {
    return (
      <div className="space-y-5 min-w-0">
        {cabecalho}
        {estado.semAcesso ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <Lock className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
            <p className="font-semibold text-gray-900">Você não tem acesso à saúde financeira desta empresa.</p>
            <p className="text-sm text-gray-600 mt-1">
              {papel === 'contador' ? 'O acesso depende de vínculo ativo e da permissão “Ver financeiro”, que a empresa pode revogar a qualquer momento.' : 'Somente sócios e administradores da empresa podem ver estes indicadores.'}
            </p>
          </div>
        ) : estado.ausente ? (
          <div role="status" data-testid="saude-indisponivel" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {MENSAGEM_RECURSO_AUSENTE} Nenhum indicador foi calculado.
          </div>
        ) : (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-wrap items-center justify-between gap-3">
            Não foi possível calcular os indicadores agora. Nenhum valor foi exibido para não mostrar números incorretos.
            <button type="button" onClick={() => carregar()} className="min-h-11 px-3 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button>
          </div>
        )}
      </div>
    );
  }

  const s = estado.dados;
  const periodo = rotuloPeriodo(s.periodo_inicio, s.periodo_fim);
  const anterior = rotuloPeriodo(s.periodo_anterior_inicio, s.periodo_anterior_fim);
  const comp = Object.fromEntries(s.indice.componentes.map((x) => [x.codigo, x])) as Record<CodigoComponente, SaudeEmpresarial['indice']['componentes'][number]>;

  return (
    <div className="space-y-5 min-w-0">
      {cabecalho}
      <p className="text-xs text-gray-500 -mt-2">Período analisado: <strong className="font-semibold text-gray-700">{periodo}</strong> · comparado a {anterior}. Valores pelo regime de caixa (o que foi efetivamente pago e recebido).</p>

      {!s.tem_lancamentos && (
        <div className="bg-white rounded-2xl border border-dashed border-orange-300 p-6 text-center">
          <p className="font-semibold text-gray-900">Ainda não há movimentações financeiras</p>
          <p className="text-sm text-gray-600 mt-1">Os indicadores aparecem à medida que receitas, despesas e contas forem registradas no Financeiro.</p>
          {papel === 'empresa' && <Link href="/app/financeiro" className="mt-4 min-h-11 px-5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold inline-flex items-center">Ir para o Financeiro</Link>}
        </div>
      )}

      {/* 1. Indicadores principais */}
      <div className="grid gap-4 grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <CartaoPrincipal titulo="Receita operacional" valor={formatarMoeda(s.receita_operacional)} icone={TrendingUp} cor="bg-green-100 text-green-700">
          <Variacao v={s.variacao_receita} positivoBom />
        </CartaoPrincipal>
        <CartaoPrincipal titulo="Despesa operacional" valor={formatarMoeda(s.despesa_operacional)} icone={TrendingDown} cor="bg-red-100 text-red-600">
          <Variacao v={s.variacao_despesa} positivoBom={false} />
        </CartaoPrincipal>
        <CartaoPrincipal titulo="Resultado operacional de caixa" valor={formatarMoeda(s.resultado_operacional)} icone={CircleDollarSign} cor="bg-blue-100 text-blue-700"
          destaque={Number(s.resultado_operacional) < 0 ? 'text-red-700' : undefined}>
          <Variacao v={s.variacao_resultado} positivoBom />
          <span className="block text-gray-500">Base caixa · não é lucro contábil nem DRE</span>
        </CartaoPrincipal>
        <CartaoPrincipal titulo="Saldo registrado" valor={s.saldo_registrado === null ? 'Sem contas' : formatarMoeda(s.saldo_registrado)} icone={Wallet} cor="bg-amber-100 text-amber-700"
          destaque={s.saldo_registrado !== null && Number(s.saldo_registrado) < 0 ? 'text-red-700' : undefined}>
          <span className="text-gray-500">{s.saldo_registrado === null ? 'Cadastre suas contas no Financeiro' : `Soma de ${s.qtd_contas} ${s.qtd_contas === 1 ? 'conta' : 'contas'} no sistema · não é saldo bancário confirmado`}</span>
        </CartaoPrincipal>
      </div>

      {/* 2. Gráficos + índice */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1.25fr_1fr_0.85fr]">
        <section aria-label="Receitas e despesas" className={card}>
          <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-2"><BarChart3 className="w-5 h-5 text-orange-600" aria-hidden="true" />Receitas e despesas</h2>
          <GraficoReceitasDespesas serie={s.serie_operacional} />
          <p className="text-xs text-gray-500 mt-2">Últimos 6 meses, só operacional. Meses sem movimentação aparecem zerados.</p>
        </section>
        <section aria-label="Fluxo de caixa" className={card}>
          <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-2"><Landmark className="w-5 h-5 text-orange-600" aria-hidden="true" />Fluxo de caixa</h2>
          {s.fluxo_caixa.every((m) => m.saldo_final === null) ? <p className="text-sm text-gray-500 py-12 text-center">Cadastre suas contas para acompanhar a evolução do caixa.</p> : <GraficoFluxoCaixa fluxo={s.fluxo_caixa} />}
          <p className="text-xs text-gray-500 mt-2">
            Saldo registrado ao fim de cada mês (* mês atual até hoje). Inclui aportes, empréstimos, pró-labore e distribuições conforme a classificação; transferências entre contas não alteram o total.
          </p>
          <FluxoResumo s={s} />
        </section>
        <CartaoIndice s={s} periodo={periodo} />
      </div>

      {/* 3. Indicadores complementares, composição, contas a vencer e recomendações */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2 min-w-0">
          <section aria-label="Indicadores" className={card}>
            <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3"><Gauge className="w-5 h-5 text-orange-600" aria-hidden="true" />Indicadores</h2>
            <div className="grid gap-3 grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-5">
              <MiniIndicador titulo="Margem operacional de caixa" icone={Percent} valor={s.indicadores.margem === null ? null : percentual(s.indicadores.margem)}
                ausente={Number(s.despesa_operacional) > 0 ? 'Sem receita no período' : 'Sem movimento no período'} pontos={comp.margem.pontos} detalhe="resultado ÷ receitas" />
              <MiniIndicador titulo="Cobertura de obrigações (30 dias)" icone={ShieldCheck} valor={s.indicadores.cobertura === null ? null : `${decimal(s.indicadores.cobertura)}×`}
                ausente={s.saldo_registrado === null ? 'Sem contas cadastradas' : 'Sem contas a pagar em 30 dias'} pontos={comp.cobertura.pontos} detalhe="saldo ÷ contas a pagar" />
              <MiniIndicador titulo="Comprometimento das receitas" icone={PieChart} valor={s.indicadores.comprometimento === null ? null : percentual(s.indicadores.comprometimento)}
                ausente="Sem receita no período" detalhe="despesas ÷ receitas" />
              <MiniIndicador titulo="Inadimplência (a receber)" icone={AlertTriangle} valor={s.indicadores.inadimplencia === null ? null : percentual(s.indicadores.inadimplencia)}
                ausente="Sem recebíveis vencidos no período" pontos={comp.inadimplencia.pontos} detalhe={`de ${formatarMoeda(s.indicadores.inadimplencia_base)} vencidos`} />
              <MiniIndicador titulo="Prazo médio de recebimento" icone={Timer} valor={s.indicadores.prazo_medio_recebimento === null ? null : `${s.indicadores.prazo_medio_recebimento} dias`}
                ausente="Dados insuficientes" detalhe={`${s.indicadores.prazo_medio_base} recebimentos no período (mín. 5)`} />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-5">
            <section aria-label="Composição das despesas" className={`${card} lg:col-span-2`}>
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><PieChart className="w-5 h-5 text-orange-600" aria-hidden="true" />Composição das despesas</h2>
              <p className="text-xs text-gray-500 mb-3">Despesas operacionais pagas · {periodo}</p>
              {Number(s.despesa_operacional) > 0
                ? <GraficoRosca empilhado itens={s.despesas_por_categoria} total={Number(s.despesa_operacional)} rotulo="Composição das despesas operacionais"
                    hrefDe={papel === 'empresa' ? (c) => (c.id_categoria ? `/app/financeiro?categoria=${c.id_categoria}#lancamentos` : '/app/financeiro#lancamentos') : undefined} />
                : <p className="text-sm text-gray-500 py-10 text-center">Nenhuma despesa operacional paga no período.</p>}
            </section>
            <ContasAVencer s={s} papel={papel} />
          </div>
        </div>
        <Recomendacoes s={s} />
      </div>

      <Metodologia s={s} />
    </div>
  );
}

function CartaoPrincipal({ titulo, valor, icone: Icone, cor, destaque, children }: { titulo: string; valor: string; icone: LucideIcon; cor: string; destaque?: string; children?: React.ReactNode }) {
  return (
    <section aria-label={titulo} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-start gap-3 min-w-0">
      <span className={`w-11 h-11 shrink-0 rounded-xl inline-flex items-center justify-center ${cor}`}><Icone className="w-5 h-5" aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className="text-sm text-gray-600">{titulo}</p>
        <p className={`text-xl font-bold break-words ${destaque ?? 'text-gray-900'}`} data-testid={`valor-${titulo}`}>{valor}</p>
        <div className="text-xs mt-0.5 space-y-0.5">{children}</div>
      </div>
    </section>
  );
}

function Variacao({ v, positivoBom }: { v: number | null; positivoBom: boolean }) {
  if (v === null) return <span className="block text-gray-500">Sem base no período anterior para comparar</span>;
  const n = Number(v);
  const bom = n === 0 ? null : n > 0 === positivoBom;
  const Seta = n >= 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`flex items-center gap-1 ${bom === null ? 'text-gray-500' : bom ? 'text-green-700' : 'text-red-700'}`}>
      <Seta className="w-3 h-3" aria-hidden="true" />{percentual(Math.abs(n))} vs. período anterior
    </span>
  );
}

function FluxoResumo({ s }: { s: SaudeEmpresarial }) {
  const soma = (c: 'entradas' | 'saidas' | 'entradas_nao_operacionais' | 'saidas_nao_operacionais') => s.fluxo_caixa.reduce((t, m) => t + Number(m[c]), 0);
  return (
    <dl className="grid grid-cols-2 gap-2 mt-3 text-xs">
      <div className="rounded-lg bg-gray-50 p-2"><dt className="text-gray-500">Entradas (6 meses)</dt><dd className="font-semibold text-green-700">{formatarMoeda(soma('entradas'))}</dd>
        <dd className="text-gray-500">{formatarMoeda(soma('entradas_nao_operacionais'))} não operacionais</dd></div>
      <div className="rounded-lg bg-gray-50 p-2"><dt className="text-gray-500">Saídas (6 meses)</dt><dd className="font-semibold text-red-700">{formatarMoeda(soma('saidas'))}</dd>
        <dd className="text-gray-500">{formatarMoeda(soma('saidas_nao_operacionais'))} não operacionais</dd></div>
    </dl>
  );
}

// Card em escala 0–1000: mesma média ponderada do banco (pontos × peso ÷ pesos aplicáveis), × 10, sem o arredondamento
// para inteiro de 0–100 — por isso mais precisa. A faixa (Boa/Estável/...) continua a calculada pelo banco.
function indiceMil(s: SaudeEmpresarial): number | null {
  if (s.indice.valor === null) return null;
  const aplic = s.indice.componentes.filter((c) => c.aplicavel && c.pontos !== null);
  const pesos = aplic.reduce((t, c) => t + c.peso, 0);
  if (!pesos) return s.indice.valor * 10;
  return Math.round((aplic.reduce((t, c) => t + Number(c.pontos) * c.peso, 0) / pesos) * 10);
}

function CartaoIndice({ s, periodo }: { s: SaudeEmpresarial; periodo: string }) {
  const faixa = s.indice.faixa ? FAIXAS[s.indice.faixa] : null;
  return (
    <section aria-label="Índice de Saúde Empresarial" className={`${card} lg:col-span-2 xl:col-span-1 flex flex-col items-center text-center`}>
      <h2 className="font-bold text-gray-900 flex items-center gap-2 self-start"><Lightbulb className="w-5 h-5 text-orange-500" aria-hidden="true" />Índice de Saúde Empresarial</h2>
      <div className="mt-3 w-full flex justify-center"><MedidorIndice valor={indiceMil(s)} cor={faixa?.cor ?? '#9ca3af'} maximo={1000} /></div>
      {faixa ? (
        <>
          <span className={`mt-1 px-4 py-1 rounded-full text-sm font-bold ${faixa.fundo} ${faixa.texto}`} data-testid="faixa-indice">{faixa.rotulo}</span>
          <p className="text-sm text-gray-600 mt-2">{faixa.descricao}</p>
        </>
      ) : (
        <p className="mt-1 text-sm font-semibold text-gray-700" data-testid="indice-insuficiente">Dados insuficientes para calcular a saúde empresarial.</p>
      )}
      <dl className="mt-3 w-full text-xs text-gray-500 space-y-0.5">
        <div><dt className="inline">Período: </dt><dd className="inline">{periodo}</dd></div>
        <div><dt className="inline">Cobertura dos dados: </dt><dd className="inline" data-testid="cobertura-dados">{s.indice.cobertura_pesos}% dos pesos com dados</dd></div>
        <div><dt className="inline">Metodologia: </dt><dd className="inline">{s.metodologia}</dd></div>
      </dl>
      <a href="#metodologia-saude" className="mt-2 min-h-11 inline-flex items-center text-sm font-semibold text-orange-600 hover:underline">Como é calculado</a>
      <p className="mt-auto pt-2 text-[11px] text-gray-400">Indicador gerencial. Não é score de crédito, classificação oficial de risco nem garantia de solvência.</p>
    </section>
  );
}

function MiniIndicador({ titulo, icone: Icone, valor, ausente, pontos, detalhe }: { titulo: string; icone: LucideIcon; valor: string | null; ausente: string; pontos?: number | null; detalhe: string }) {
  const av = avaliacaoPontos(pontos);
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 min-w-0" data-testid={`indicador-${titulo}`}>
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 shrink-0 rounded-lg bg-white text-orange-600 inline-flex items-center justify-center border border-gray-100"><Icone className="w-4 h-4" aria-hidden="true" /></span>
        <p className="text-xs text-gray-600 leading-tight">{titulo}</p>
      </div>
      {valor === null
        ? <p className="mt-2 text-sm font-semibold text-gray-500">{ausente}</p>
        : <p className="mt-2 text-lg font-bold text-gray-900">{valor}</p>}
      {valor !== null && av && <p className={`text-xs font-semibold ${av.classe}`}>{av.texto}</p>}
      <p className="text-[11px] text-gray-500">{detalhe}</p>
    </div>
  );
}

function ContasAVencer({ s, papel }: { s: SaudeEmpresarial; papel: 'empresa' | 'contador' }) {
  const vencidas = s.contas_a_vencer.filter((c) => c.dias < 0);
  const proximas = s.contas_a_vencer.filter((c) => c.dias >= 0);
  const linhas = (lista: ContaAVencer[], vencida: boolean) => lista.map((c) => (
    <tr key={c.id} className="border-t border-gray-100">
      <td className="py-2 pr-2 text-gray-900 max-w-0 w-full"><span className="block truncate">{c.descricao}</span>{c.categoria && <span className="block text-[11px] text-gray-500 truncate">{c.categoria}</span>}</td>
      <td className="py-2 px-2 whitespace-nowrap font-medium text-gray-900">{formatarMoeda(c.valor)}</td>
      <td className="py-2 px-2 whitespace-nowrap text-gray-700 hidden sm:table-cell">{formatarData(c.data_vencimento)}</td>
      <td className="py-2 px-2 whitespace-nowrap text-gray-700">{vencida ? `${Math.abs(c.dias)} atrás` : c.dias === 0 ? 'hoje' : c.dias}</td>
      <td className="py-2 pl-2"><Selo tipo={vencida ? 'perigo' : c.dias <= 7 ? 'alerta' : 'info'} texto={vencida ? 'Vencida' : c.dias <= 7 ? 'A vencer' : 'Prevista'} /></td>
    </tr>
  ));
  const cabecalho = (
    <thead><tr className="text-left text-xs text-gray-500"><th className="pb-1 pr-2 font-medium">Descrição</th><th className="pb-1 px-2 font-medium">Valor</th>
      <th className="pb-1 px-2 font-medium hidden sm:table-cell">Vencimento</th><th className="pb-1 px-2 font-medium">Dias</th><th className="pb-1 pl-2 font-medium">Situação</th></tr></thead>
  );
  return (
    <section aria-label="Contas a vencer" className={`${card} lg:col-span-3`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><CalendarClock className="w-5 h-5 text-orange-600" aria-hidden="true" />Contas a vencer</h2>
        {papel === 'empresa' && <Link href="/app/financeiro#pagar" className="min-h-11 inline-flex items-center gap-1 text-sm font-semibold text-orange-600 hover:underline">Ver todas<ChevronRight className="w-4 h-4" aria-hidden="true" /></Link>}
      </div>
      <p className="text-xs text-gray-500 mb-2">Próximos 30 dias: {formatarMoeda(s.obrigacoes.a_vencer_valor)} em {s.obrigacoes.a_vencer_qtd} {s.obrigacoes.a_vencer_qtd === 1 ? 'conta' : 'contas'}</p>
      {vencidas.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-2 mb-3 overflow-x-auto" data-testid="contas-vencidas">
          <p className="text-xs font-semibold text-red-700 px-1">Vencidas: {s.obrigacoes.vencidas_qtd} · {formatarMoeda(s.obrigacoes.vencidas_valor)}</p>
          <table className="w-full text-sm"><caption className="sr-only">Contas vencidas</caption>{cabecalho}<tbody>{linhas(vencidas, true)}</tbody></table>
        </div>
      )}
      {proximas.length > 0
        ? <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Contas a vencer nos próximos 30 dias</caption>{cabecalho}<tbody>{linhas(proximas, false)}</tbody></table></div>
        : <p className="text-sm text-gray-500 py-6 text-center">Nenhuma conta a pagar nos próximos 30 dias.</p>}
      {s.contas_a_vencer.length >= 50 && <p className="text-xs text-gray-500 mt-2">Mostrando as 50 primeiras por vencimento.</p>}
    </section>
  );
}

const ESTILO_SEVERIDADE: Record<Severidade, { icone: LucideIcon; cor: string; rotulo: string }> = {
  alta: { icone: AlertTriangle, cor: 'bg-red-50 text-red-600', rotulo: 'Prioridade alta' },
  media: { icone: TrendingUp, cor: 'bg-amber-50 text-amber-600', rotulo: 'Atenção' },
  info: { icone: Info, cor: 'bg-blue-50 text-blue-600', rotulo: 'Informação' },
  positiva: { icone: ShieldCheck, cor: 'bg-green-50 text-green-600', rotulo: 'Ponto positivo' },
};

function Recomendacoes({ s }: { s: SaudeEmpresarial }) {
  return (
    <section aria-label="Principais recomendações" className={`${card} self-start`}>
      <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3"><Lightbulb className="w-5 h-5 text-orange-500" aria-hidden="true" />Principais recomendações</h2>
      {s.recomendacoes.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">Nenhum alerta pelas regras atuais no período analisado.</p>
      ) : (
        <ul className="space-y-3">
          {s.recomendacoes.map((r) => {
            const t = textoRecomendacao(r, s);
            const e = ESTILO_SEVERIDADE[r.severidade];
            return (
              <li key={r.codigo} data-testid={`recomendacao-${r.codigo}`}>
                <details className="group rounded-xl border border-gray-100 p-3">
                  <summary className="flex items-start gap-3 cursor-pointer list-none min-h-11">
                    <span className={`w-9 h-9 shrink-0 rounded-lg inline-flex items-center justify-center ${e.cor}`}><e.icone className="w-5 h-5" aria-hidden="true" /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-gray-900">{t.titulo}</span>
                      <span className="block text-xs text-gray-600 mt-0.5">{t.explicacao}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 mt-1 transition-transform group-open:rotate-90" aria-hidden="true" />
                  </summary>
                  <dl className="mt-2 pl-12 text-xs space-y-1">
                    <div><dt className="inline font-semibold text-gray-700">O que fazer: </dt><dd className="inline text-gray-700">{t.acao}</dd></div>
                    <div><dt className="inline font-semibold text-gray-700">Indicador: </dt><dd className="inline text-gray-600">{t.indicador}</dd></div>
                    <div><dt className="inline font-semibold text-gray-700">Período: </dt><dd className="inline text-gray-600">{t.periodo}</dd></div>
                    <div><dt className="inline font-semibold text-gray-700">Tipo: </dt><dd className="inline text-gray-600">{e.rotulo}</dd></div>
                  </dl>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-gray-400 mt-3">Regras fixas e verificáveis aplicadas aos seus lançamentos. Não substituem a orientação do seu contador.</p>
    </section>
  );
}

function Metodologia({ s }: { s: SaudeEmpresarial }) {
  return (
    <section id="metodologia-saude" aria-label="Metodologia do índice" className={card}>
      <details>
        <summary className="cursor-pointer min-h-11 flex items-center gap-2 font-bold text-gray-900"><Info className="w-5 h-5 text-orange-600" aria-hidden="true" />Como o índice é calculado ({METODOLOGIA_VERSAO})</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <caption className="sr-only">Componentes do índice no período analisado</caption>
            <thead><tr className="text-left text-xs text-gray-500"><th className="py-1 pr-2 font-medium">Critério</th><th className="py-1 px-2 font-medium">Peso</th><th className="py-1 px-2 font-medium">Valor</th><th className="py-1 px-2 font-medium">Pontos</th><th className="py-1 pl-2 font-medium">Fórmula e pontuação</th></tr></thead>
            <tbody>
              {s.indice.componentes.map((c) => {
                const d = COMPONENTES[c.codigo];
                const valor = c.valor === null ? '—' : c.codigo === 'cobertura' ? `${decimal(c.valor)}×` : c.codigo === 'evolucao' ? `${Number(c.valor) > 0 ? '+' : ''}${decimal(c.valor)} p.p.` : percentual(c.valor);
                return (
                  <tr key={c.codigo} className="border-t border-gray-100 align-top" data-testid={`componente-${c.codigo}`}>
                    <td className="py-2 pr-2 font-medium text-gray-900">{d.nome}</td>
                    <td className="py-2 px-2 text-gray-700">{c.peso}</td>
                    <td className="py-2 px-2 text-gray-700 whitespace-nowrap">{valor}</td>
                    <td className="py-2 px-2 whitespace-nowrap">{c.aplicavel ? <span className="font-semibold text-gray-900">{decimal(c.pontos)}</span> : <span className="text-gray-500">Não aplicável{c.motivo ? ` — ${MOTIVO_COMPONENTE[c.motivo] ?? ''}` : ''}</span>}</td>
                    <td className="py-2 pl-2 text-xs text-gray-600 space-y-0.5">
                      <p><strong className="text-gray-700">Fórmula:</strong> {d.formula}</p>
                      <p><strong className="text-gray-700">Fonte:</strong> {d.fonte}</p>
                      <p><strong className="text-gray-700">Pontuação:</strong> {d.criterio}</p>
                      <p><strong className="text-gray-700">Sem dados:</strong> {d.ausente}</p>
                      <p><strong className="text-gray-700">Limitação:</strong> {d.limitacao}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 text-xs text-gray-600 list-disc pl-5 space-y-1">{REGRAS_INDICE.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="mt-3 text-xs text-gray-500">
          Este índice é um indicador gerencial calculado com os dados registrados no Unnify Conecta. Não é score de crédito bancário, classificação oficial de risco,
          auditoria contábil nem garantia de solvência ou de aprovação de crédito.
        </p>
      </details>
    </section>
  );
}
