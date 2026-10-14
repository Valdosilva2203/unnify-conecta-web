'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle, ArrowDown, ArrowUp, Building2, ChevronDown, Clock, FileText, Hash, Landmark, Mail, MapPin, Pencil, Phone, Receipt, RefreshCw, TrendingDown, TrendingUp,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { formatarCnpj, formatarTelefone, mensagemDeErro } from '@/lib/contabil';
import { ROTULO_SITUACAO, SELO_SITUACAO, formatarMoeda, hojeBrasil, inicioDoMes, rotuloMes, variacaoPercentual, type Situacao } from '@/lib/financeiro';
import { Selo } from '@/components/admin/tabela';
import { Aviso } from '@/components/conta/Aviso';
import { Indicador } from '@/components/financeiro/Indicador';
import { GraficoRosca } from '@/components/financeiro/GraficoRosca';
import { IconeCategoria } from '@/components/financeiro/IconeCategoria';
import { GraficoLinhas, type PontoSerie } from '@/components/app/GraficoLinhas';
import { FormDadosEmpresa, type DadosEmpresa } from '@/components/app/FormDadosEmpresa';

// Valores vêm prontos do banco (resumo_financeiro); o navegador só formata.
interface Resumo {
  periodo_inicio: string;
  receitas_mes: number;
  despesas_mes: number;
  receitas_mes_anterior: number;
  despesas_mes_anterior: number;
  pagamentos_financiamentos_mes: number;
  a_pagar_30_valor: number;
  a_pagar_30_qtd: number;
  a_pagar_vencidas_qtd: number;
  a_receber_vencidas_qtd: number;
  a_receber_30_valor?: number; // migration 000030 (antes dela, o card mostra "indisponível")
  a_receber_30_qtd?: number;
  // migration 000031 (classificação financeira)
  pro_labore_mes?: number;
  distribuicoes_lucros_mes?: number;
  aportes_socios_mes?: number;
  entradas_financiamentos_mes?: number;
  serie: (PontoSerie & { receitas_operacionais?: number; despesas_operacionais?: number })[];
}

// Com a 000031, o gráfico mostra só o operacional (aporte não é faturamento; distribuição não é despesa)
const serieOperacional = (r: Resumo): PontoSerie[] =>
  r.serie.map((s) => ({
    mes: s.mes,
    receitas: s.receitas_operacionais ?? s.receitas,
    despesas: s.despesas_operacionais ?? s.despesas,
  }));

interface Conta {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  situacao: Situacao;
  categoria_icone: string | null;
  categoria_cor: string;
}

type Estado<T> = { carregando: true } | { carregando: false; erro: string } | { carregando: false; dados: T };
const carregando = { carregando: true } as const;

const diasAte = (iso: string, hoje: string) => Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000);
function prazo(iso: string, hoje: string): string {
  const d = diasAte(iso, hoje);
  const data = `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  if (d === 0) return `Vence hoje (${data})`;
  if (d === 1) return `Vence amanhã (${data})`;
  if (d > 1) return `Vence em ${d} dias (${data})`;
  return `Venceu há ${-d} ${d === -1 ? 'dia' : 'dias'} (${data})`;
}
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function Variacao({ atual, anterior, positivoBom }: { atual: number; anterior: number; positivoBom: boolean }) {
  const v = variacaoPercentual(Number(atual), Number(anterior));
  if (v === null) return <p className="text-xs text-gray-500 mt-1">Sem base no mês anterior para comparar</p>;
  const bom = v === 0 ? null : v > 0 === positivoBom;
  const Seta = v >= 0 ? ArrowUp : ArrowDown;
  return (
    <p className="mt-1 text-xs text-gray-500 flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-semibold ${bom === null ? 'bg-gray-100 text-gray-600' : bom ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
        <Seta className="w-3 h-3" aria-hidden="true" />{v > 0 ? '+' : ''}{v.toLocaleString('pt-BR')}%
      </span>
      em relação ao mês anterior
    </p>
  );
}

function Cartao({ titulo, acao, children, rotulo }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode; rotulo?: string }) {
  return (
    <section aria-label={rotulo ?? titulo} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0 w-full flex-1 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 className="text-lg font-bold text-gray-900">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Esqueleto({ linhas = 3, altura = 'h-12' }: { linhas?: number; altura?: string }) {
  return <div role="status" aria-label="Carregando" className="space-y-3">{Array.from({ length: linhas }, (_, i) => <div key={i} className={`${altura} rounded-xl bg-gray-100 animate-pulse`} />)}</div>;
}

function FalhaCarregamento({ mensagem, aoTentar }: { mensagem: string; aoTentar: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />{mensagem}</span>
      <button type="button" onClick={aoTentar} className="min-h-11 px-3 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button>
    </div>
  );
}

function ListaContas({ estado, tipo, hoje, vazio, aoTentar }: { estado: Estado<Conta[]>; tipo: 'receita' | 'despesa'; hoje: string; vazio: string; aoTentar: () => void }) {
  if (estado.carregando) return <Esqueleto linhas={4} />;
  if ('erro' in estado) return <FalhaCarregamento mensagem={estado.erro} aoTentar={aoTentar} />;
  if (estado.dados.length === 0) return <p className="text-sm text-gray-500 text-center py-8">{vazio}</p>;
  return (
    <ul className="divide-y divide-gray-100">
      {estado.dados.map((c) => (
        <li key={c.id} className="flex items-center gap-3 py-2.5" data-testid={`conta-${c.descricao}`}>
          <IconeCategoria icone={c.categoria_icone} cor={c.categoria_cor} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{c.descricao}</p>
            <p className={`text-xs ${c.situacao === 'vencido' ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>{prazo(c.data_vencimento, hoje)}</p>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-sm font-bold whitespace-nowrap ${tipo === 'receita' ? 'text-green-700' : 'text-red-700'}`}>{formatarMoeda(c.valor)}</p>
            <Selo tipo={SELO_SITUACAO[c.situacao]} texto={ROTULO_SITUACAO[c.situacao][tipo]} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function PainelEmpresaPage() {
  const { empresa, usuario, empresas, trocarEmpresa, recarregarEmpresas } = useEmpresaAtual();
  const [hoje, setHoje] = useState('');
  const [dataExtenso, setDataExtenso] = useState('');
  const [versao, setVersao] = useState(0);
  // Valor em aberto já VENCIDO (o resumo do banco só traz a quantidade). null = carregando ou indisponível: não vira zero
  const [vencidas, setVencidas] = useState<{ receita: number; despesa: number } | null>(null);
  // Receitas operacionais AINDA NÃO RECEBIDAS (pendentes/vencidas): total e por mês de competência. Mostradas separadas do recebido.
  const [emAberto, setEmAberto] = useState<{ total: number; porMes: Record<string, number> } | null>(null);
  const [resumo, setResumo] = useState<Estado<Resumo>>(carregando);
  const [aPagar, setAPagar] = useState<Estado<Conta[]>>(carregando);
  const [aReceber, setAReceber] = useState<Estado<Conta[]>>(carregando);
  const [dados, setDados] = useState<Estado<DadosEmpresa>>(carregando);
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Data só no navegador (cacheComponents não aceita new Date() na renderização)
  useEffect(() => {
    setHoje(hojeBrasil());
    setDataExtenso(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }));
  }, []);

  // Indicadores acompanham mudanças feitas em outras abas/telas (ao voltar para esta)
  useEffect(() => {
    const aoVoltar = () => document.visibilityState === 'visible' && setVersao((v) => v + 1);
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, []);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    if (!empresa || !hoje) return;
    let ativo = true;
    const supabase = createClient();
    const contas = (tipo: 'receita' | 'despesa') =>
      supabase
        .from('lancamentos_financeiros_situacao')
        .select('id, descricao, valor, data_vencimento, situacao, categoria_icone, categoria_cor')
        .eq('id_empresa', empresa.id)
        .eq('tipo', tipo)
        .in('situacao', ['pendente', 'vencido'])
        .order('data_vencimento')
        .limit(4);
    const falha = (e: { message?: string; code?: string } | null, padrao: string) => ({ carregando: false as const, erro: mensagemDeErro(e, padrao) });

    setResumo(carregando);
    setAPagar(carregando);
    setAReceber(carregando);
    setDados(carregando);
    setVencidas(null);
    setEmAberto(null);
    supabase.from('lancamentos_financeiros_situacao').select('valor, data_competencia').eq('id_empresa', empresa.id).eq('tipo', 'receita')
      .eq('natureza_financeira', 'operacional').in('situacao', ['pendente', 'vencido']).then(({ data, error }) => {
        if (!ativo || error) return;
        const porMes: Record<string, number> = {};
        let total = 0;
        for (const l of data ?? []) { const v = Number(l.valor); total += v; const m = `${String(l.data_competencia).slice(0, 7)}-01`; porMes[m] = (porMes[m] ?? 0) + v; }
        setEmAberto({ total, porMes });
      });
    supabase.from('lancamentos_financeiros_situacao').select('tipo, valor').eq('id_empresa', empresa.id).eq('situacao', 'vencido').then(({ data, error }) => {
      if (!ativo || error) return;
      const soma = (t: string) => (data ?? []).filter((l) => l.tipo === t).reduce((acc, l) => acc + Number(l.valor), 0);
      setVencidas({ receita: soma('receita'), despesa: soma('despesa') });
    });
    supabase.rpc('resumo_financeiro', { p_id_empresa: empresa.id, p_mes: inicioDoMes(hoje) }).then(({ data, error }) => {
      if (ativo) setResumo(error || !data ? falha(error, 'Não foi possível carregar os indicadores financeiros.') : { carregando: false, dados: data as Resumo });
    });
    contas('despesa').then(({ data, error }) => {
      if (ativo) setAPagar(error ? falha(error, 'Não foi possível carregar as contas a pagar.') : { carregando: false, dados: (data ?? []) as Conta[] });
    });
    contas('receita').then(({ data, error }) => {
      if (ativo) setAReceber(error ? falha(error, 'Não foi possível carregar as contas a receber.') : { carregando: false, dados: (data ?? []) as Conta[] });
    });
    supabase
      .from('empresas')
      .select('id, razao_social, cnpj, nome_comercial, telefone, email_comercial, cidade, estado, cnae_principal, status_registro')
      .eq('id', empresa.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) setDados(falha(error, 'Não foi possível carregar os dados da empresa.'));
        else if (!data) setDados({ carregando: false, erro: 'Você não tem mais acesso a esta empresa.' });
        else setDados({ carregando: false, dados: data as DadosEmpresa });
      });
    return () => { ativo = false; };
  }, [empresa, hoje, versao]);

  if (!usuario || !empresa || !hoje) return null;
  const primeiroNome = usuario.nome.split(' ')[0] || 'Usuário';
  const r = !resumo.carregando && 'dados' in resumo ? resumo.dados : null;
  const totalMovimentado = r ? Number(r.receitas_mes) + Number(r.despesas_mes) : 0;
  const serie = r ? serieOperacional(r).map((s) => ({ ...s, previstas: emAberto?.porMes[s.mes] ?? 0 })) : [];
  const temSerie = serie.some((s) => Number(s.receitas) > 0 || Number(s.despesas) > 0 || Number(s.previstas) > 0);
  const totalAberto = emAberto?.total ?? 0;
  const operacionalSeparado = r?.serie?.[0]?.receitas_operacionais !== undefined;
  const foraDaComposicao = r ? [
    ['pró-labore', r.pro_labore_mes], ['distribuição de lucros', r.distribuicoes_lucros_mes], ['aportes de sócios', r.aportes_socios_mes],
    ['empréstimos recebidos', r.entradas_financiamentos_mes], ['pagamentos de empréstimos/financiamentos', r.pagamentos_financiamentos_mes],
  ].filter(([, v]) => Number(v ?? 0) > 0).map(([rotulo, v]) => `${rotulo} (${formatarMoeda(v as number)})`) : [];
  const d = !dados.carregando && 'dados' in dados ? dados.dados : null;

  const cardResumo = (conteudo: (r: Resumo) => React.ReactNode, titulo: string, icone: typeof TrendingUp, cor: string) => {
    if (resumo.carregando) return <div key={titulo} role="status" aria-label={`Carregando ${titulo}`} className="h-28 rounded-2xl bg-white border border-gray-200 animate-pulse" />;
    if ('erro' in resumo) return <Indicador key={titulo} titulo={titulo} valor="Indisponível" icone={icone} cor={cor} detalhe="Falha ao carregar" destaque="text-gray-400" />;
    return conteudo(resumo.dados);
  };

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900">Olá, {primeiroNome}!</h1>
          <p className="text-gray-600 mt-1">Aqui está um resumo da sua empresa hoje.</p>
          <p className="text-sm text-gray-500 mt-1 first-letter:uppercase">{dataExtenso}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-stretch">
          <div className="relative flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 min-w-0 sm:min-w-72">
            <Landmark className="w-6 h-6 text-gray-500 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 truncate">{empresa.nome_comercial || empresa.razao_social}</p>
              <p className="text-xs text-gray-500">CNPJ {formatarCnpj(empresa.cnpj)}</p>
            </div>
            {empresas.length > 1 && (
              <>
                <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" />
                {/* Seleção sobre a lista lida sob RLS; o banco valida o acesso em cada consulta */}
                <select aria-label="Empresa selecionada" value={empresa.id} onChange={(e) => trocarEmpresa(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                  {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome_comercial || e.razao_social} — {formatarCnpj(e.cnpj)}</option>)}
                </select>
              </>
            )}
          </div>
          <button type="button" onClick={() => setEditando(true)} disabled={!d}
            className="min-h-11 px-5 inline-flex items-center justify-center gap-2 rounded-xl border border-orange-500 text-orange-600 bg-white hover:bg-orange-50 text-sm font-semibold disabled:opacity-50">
            <Pencil className="w-4 h-4" aria-hidden="true" />Editar dados da empresa
          </button>
        </div>
      </div>

      {aviso && (
        <div className="flex items-start gap-2">
          <div className="flex-1"><Aviso tipo="sucesso">{aviso}</Aviso></div>
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso" className="min-h-11 px-3 text-sm text-gray-500 hover:text-gray-800">✕</button>
        </div>
      )}

      {'erro' in resumo && <FalhaCarregamento mensagem={resumo.erro} aoTentar={recarregar} />}

      <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[360px]:grid-cols-2 xl:grid-cols-4">
        {cardResumo((r) => (
          <Indicador key="rec" titulo="Receitas do mês" valor={formatarMoeda(r.receitas_mes)} icone={TrendingUp} cor="bg-green-100 text-green-600">
            <Variacao atual={r.receitas_mes} anterior={r.receitas_mes_anterior} positivoBom />
            {totalAberto > 0 && (
              <p className="text-xs font-semibold text-orange-700" data-testid="receitas-em-aberto">
                + {formatarMoeda(totalAberto)} a receber{r.a_receber_vencidas_qtd > 0 ? ` · ${plural(r.a_receber_vencidas_qtd, 'vencida', 'vencidas')}` : ''}
              </p>
            )}
          </Indicador>
        ), 'Receitas do mês', TrendingUp, 'bg-green-100 text-green-600')}
        {cardResumo((r) => (
          <Indicador key="desp" titulo="Despesas do mês" valor={formatarMoeda(r.despesas_mes)} icone={TrendingDown} cor="bg-red-100 text-red-600" destaque="text-red-700">
            <Variacao atual={r.despesas_mes} anterior={r.despesas_mes_anterior} positivoBom={false} />
          </Indicador>
        ), 'Despesas do mês', TrendingDown, 'bg-red-100 text-red-600')}
        {cardResumo((r) => (
          r.a_receber_30_valor === undefined ? (
            <Indicador key="arec" titulo="A receber" valor="Indisponível" icone={Clock} cor="bg-orange-100 text-orange-600" destaque="text-gray-400" detalhe="Disponível após a próxima atualização do sistema" />
          ) : (
            <Indicador key="arec" titulo="A receber" icone={Clock} cor="bg-orange-100 text-orange-600"
              valor={formatarMoeda(Number(r.a_receber_30_valor) + (r.a_receber_vencidas_qtd > 0 && vencidas ? vencidas.receita : 0))}
              detalhe={`${plural(Number(r.a_receber_30_qtd ?? 0), 'conta', 'contas')} nos próximos 30 dias${r.a_receber_vencidas_qtd > 0 && vencidas ? ' + vencidas' : ''}`}>
              {r.a_receber_vencidas_qtd > 0 && <p className="text-xs font-semibold text-red-700">{plural(r.a_receber_vencidas_qtd, 'vencida', 'vencidas')}{vencidas ? ` · ${formatarMoeda(vencidas.receita)}` : ''}</p>}
            </Indicador>
          )
        ), 'A receber', Clock, 'bg-orange-100 text-orange-600')}
        {cardResumo((r) => (
          <Indicador key="apag" titulo="A pagar" icone={Receipt} cor="bg-blue-100 text-blue-600"
            valor={formatarMoeda(Number(r.a_pagar_30_valor) + (r.a_pagar_vencidas_qtd > 0 && vencidas ? vencidas.despesa : 0))}
            detalhe={`${plural(Number(r.a_pagar_30_qtd), 'conta', 'contas')} nos próximos 30 dias${r.a_pagar_vencidas_qtd > 0 && vencidas ? ' + vencidas' : ''}`}>
            {r.a_pagar_vencidas_qtd > 0 && <p className="text-xs font-semibold text-red-700">{plural(r.a_pagar_vencidas_qtd, 'vencida', 'vencidas')}{vencidas ? ` · ${formatarMoeda(vencidas.despesa)}` : ''}</p>}
          </Indicador>
        ), 'A pagar', Receipt, 'bg-blue-100 text-blue-600')}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 min-w-0 flex">
          <Cartao titulo="Visão financeira" rotulo="Visão financeira">
            <p className="text-sm text-gray-500 -mt-2 mb-3">Receitas e despesas {operacionalSeparado ? 'operacionais ' : ''}pagas nos últimos 6 meses{serie.some((s) => s.previstas > 0) ? ' · tracejado: receitas a receber, pelo mês de competência' : ''}</p>
            {resumo.carregando ? <Esqueleto linhas={1} altura="h-56" /> : 'erro' in resumo ? <p className="text-sm text-gray-500 py-12 text-center">Gráfico indisponível.</p>
              : temSerie ? <GraficoLinhas serie={serie} />
              : <p className="text-sm text-gray-500 py-12 text-center">Sem receitas ou despesas pagas nos últimos 6 meses.</p>}
          </Cartao>
        </div>
        <div className="min-w-0 flex">
          <Cartao titulo="Situação financeira">
            {resumo.carregando ? <Esqueleto linhas={1} altura="h-56" /> : 'erro' in resumo ? <p className="text-sm text-gray-500 py-12 text-center">Indisponível.</p> : (
              <>
                <p className="text-sm text-gray-500 -mt-2 mb-3">Movimentado em {rotuloMes(resumo.dados.periodo_inicio)}</p>
                {totalMovimentado + totalAberto > 0 ? (
                  <GraficoRosca empilhado rotulo="Composição de receitas e despesas do mês" total={totalMovimentado + totalAberto} itens={[
                    { categoria: 'Receitas', cor: '#2563eb', icone: 'trending-up', valor: Number(resumo.dados.receitas_mes) },
                    { categoria: 'Despesas', cor: '#ef4444', icone: 'receipt', valor: Number(resumo.dados.despesas_mes) },
                    { categoria: 'A receber (em aberto)', cor: '#f59e0b', icone: 'wallet', valor: totalAberto },
                  ].filter((i) => i.valor > 0)} />
                ) : (
                  <p className="text-sm text-gray-500 py-12 text-center">Sem receitas ou despesas pagas neste mês.</p>
                )}
                <p className="text-xs text-gray-500 mt-3">
                  Percentuais = composição do total movimentado no mês (recebido + pago){totalAberto > 0 ? ' mais as receitas a receber em aberto (ainda não recebidas, de qualquer mês)' : ''}. Não representam margem de lucro nem avaliação da saúde da empresa.
                  {foraDaComposicao.length > 0 && ` Não entram nesta composição: ${foraDaComposicao.join(', ')}.`}
                </p>
              </>
            )}
          </Cartao>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Cartao titulo="Próximas obrigações" acao={<Link href="/app/financeiro#pagar" className="min-h-11 inline-flex items-center text-sm font-semibold text-orange-600 hover:underline">Ver todas →</Link>}>
          <ListaContas estado={aPagar} tipo="despesa" hoje={hoje} vazio="Nenhuma conta a pagar pendente." aoTentar={recarregar} />
        </Cartao>
        <Cartao titulo="Contas a receber" acao={<Link href="/app/financeiro#receber" className="min-h-11 inline-flex items-center text-sm font-semibold text-orange-600 hover:underline">Ver todas →</Link>}>
          <ListaContas estado={aReceber} tipo="receita" hoje={hoje} vazio="Nenhuma conta a receber pendente." aoTentar={recarregar} />
        </Cartao>
        <div className="lg:col-span-2 xl:col-span-1 min-w-0 flex">
          <Cartao titulo="Dados da empresa" acao={d && (
            <button type="button" onClick={() => setEditando(true)} className="min-h-11 inline-flex items-center gap-1 text-sm font-semibold text-orange-600 hover:underline"><Pencil className="w-4 h-4" aria-hidden="true" />Editar</button>
          )}>
            {dados.carregando ? <Esqueleto linhas={4} altura="h-7" /> : 'erro' in dados ? <FalhaCarregamento mensagem={dados.erro} aoTentar={recarregar} /> : (
              <dl className="space-y-2.5 text-sm" aria-label="Dados cadastrais">
                {[
                  [Building2, 'Razão social', dados.dados.razao_social],
                  [Hash, 'CNPJ', formatarCnpj(dados.dados.cnpj)],
                  [FileText, 'Nome comercial', dados.dados.nome_comercial],
                  [Phone, 'Telefone', formatarTelefone(dados.dados.telefone)],
                  [Mail, 'E-mail', dados.dados.email_comercial],
                  [MapPin, 'Cidade / UF', [dados.dados.cidade, dados.dados.estado].filter(Boolean).join(' - ')],
                  [FileText, 'CNAE principal', dados.dados.cnae_principal],
                ].map(([Icone, rotulo, valor]) => {
                  const I = Icone as typeof Building2;
                  return (
                    <div key={rotulo as string} className="grid grid-cols-[1.25rem_6.75rem_1fr] items-start gap-2">
                      <I className="w-4 h-4 text-gray-400 mt-0.5" aria-hidden="true" />
                      <dt className="text-gray-500">{rotulo as string}</dt>
                      <dd className="text-gray-900 font-medium break-words min-w-0">{(valor as string) || <span className="text-gray-400 font-normal">Não informado</span>}</dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </Cartao>
        </div>
      </div>

      <FormDadosEmpresa aberto={editando} dados={d} aoFechar={() => setEditando(false)}
        aoSalvar={async (m) => { setEditando(false); setAviso(m); recarregar(); await recarregarEmpresas(); }} />
    </div>
  );
}
