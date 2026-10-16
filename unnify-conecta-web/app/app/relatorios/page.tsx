'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, BarChart3, CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, Clock, Download, FileSpreadsheet, LayoutGrid, RefreshCw, TrendingDown, TrendingUp, UserCheck, Users, Wallet } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { mensagemDeErro } from '@/lib/contabil';
import { fimDoMes, formatarData, formatarMoeda, hojeBrasil, inicioDoMes, rotuloMes, rotuloMesCurto, somarMeses, type Categoria } from '@/lib/financeiro';
import { recursoAusente } from '@/lib/erros-banco';
import { MODOS, ROTULO_SITUACAO_DETALHE, baixarArquivo, buscarTudo, consultaDetalhe, gerarCsv, htmlRelatorio, variacao, type Faixas, type LinhaDetalhe, type ModoDetalhe, type RelatorioFinanceiro } from '@/lib/relatorios';
import { Paginacao, Selo } from '@/components/admin/tabela';
import { GraficoRosca } from '@/components/financeiro/GraficoRosca';
import { classeBotaoPrimario } from '@/components/ui/Modal';
import { CabecalhoModulo, classePilula } from '@/components/navegacao/NavegacaoModulos';

type Aba = 'geral' | 'financeiro' | 'clientes' | 'funcionarios';
type Estado<T> = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string; ausente: boolean } | { tipo: 'ok'; dados: T };
const filtro = 'min-h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500';
const cartao = 'bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0';

export default function RelatoriosPage() {
  const { empresa } = useEmpresaAtual();
  const [hoje, setHoje] = useState('');
  const [mes, setMes] = useState('');
  const [personalizado, setPersonalizado] = useState(false);
  const [ini, setIni] = useState('');
  const [fim, setFim] = useState('');
  const [aba, setAba] = useState<Aba>('geral');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [idCategoria, setIdCategoria] = useState('');
  const [rel, setRel] = useState<Estado<RelatorioFinanceiro>>({ tipo: 'carregando' });
  const [modo, setModo] = useState<ModoDetalhe>('todos');
  const [situacao, setSituacao] = useState('');
  const [versao, setVersao] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [avisoExport, setAvisoExport] = useState<string | null>(null);

  useEffect(() => { const h = hojeBrasil(); setHoje(h); setMes(inicioDoMes(h)); setIni(inicioDoMes(h)); setFim(h); }, []);
  const periodo = useMemo(() => (personalizado ? { inicio: ini, fim } : { inicio: mes, fim: mes ? fimDoMes(mes) : '' }), [personalizado, ini, fim, mes]);
  const periodoValido = !!periodo.inicio && !!periodo.fim && periodo.fim >= periodo.inicio;

  useEffect(() => {
    if (!empresa) return;
    createClient().from('categorias_financeiras').select('id, tipo, nome, cor, icone, ativa').eq('id_empresa', empresa.id).order('nome').then(({ data }) => setCategorias((data ?? []) as Categoria[]));
  }, [empresa]);
  const carregar = useCallback(() => {
    if (!empresa || !periodoValido) return;
    setRel({ tipo: 'carregando' });
    createClient().rpc('relatorio_financeiro', { p_id_empresa: empresa.id, p_inicio: periodo.inicio, p_fim: periodo.fim, p_id_categoria: idCategoria || null }).then(({ data, error }) => {
      if (error) return setRel({ tipo: 'erro', mensagem: mensagemDeErro(error, 'Não foi possível gerar o relatório.'), ausente: recursoAusente(error) });
      setRel({ tipo: 'ok', dados: data as RelatorioFinanceiro });
    });
  }, [empresa, periodo, periodoValido, idCategoria]);
  useEffect(() => { carregar(); }, [carregar, versao]);
  useEffect(() => {
    const voltar = () => document.visibilityState === 'visible' && setVersao((v) => v + 1);
    document.addEventListener('visibilitychange', voltar);
    return () => document.removeEventListener('visibilitychange', voltar);
  }, []);

  if (!empresa || !mes) return null;
  const r = rel.tipo === 'ok' ? rel.dados : null;
  const filtrosDetalhe = { idEmpresa: empresa.id, modo, inicio: periodo.inicio, fim: periodo.fim, idCategoria, situacao };
  const detalhar = (m: ModoDetalhe) => { setModo(m); setSituacao(''); setAba('financeiro'); };

  const exportar = async (formato: 'csv' | 'pdf') => {
    if (!r) return;
    setAvisoExport(null);
    const janela = formato === 'pdf' ? window.open('', '_blank') : null; // aberta no clique (evita bloqueio de pop-up)
    if (formato === 'pdf' && !janela) return setAvisoExport('Permita pop-ups para gerar o PDF.');
    setExportando(true);
    const res = await buscarTudo(filtrosDetalhe);
    setExportando(false);
    if ('erro' in res) { janela?.close(); return setAvisoExport(res.erro); }
    const nomeBase = `relatorio-${modo}-${periodo.inicio}-a-${periodo.fim}`;
    if (formato === 'csv') baixarArquivo(gerarCsv(res.linhas, modo), `${nomeBase}.csv`, 'text/csv;charset=utf-8');
    else { janela!.document.open(); janela!.document.write(htmlRelatorio(empresa.nome_comercial || empresa.razao_social, r, res.linhas, modo, res.truncado)); janela!.document.close(); }
    if (res.truncado) setAvisoExport('A exportação foi limitada aos primeiros 10.000 registros. Refine os filtros.');
  };

  const rotuloPeriodo = personalizado ? `${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}` : rotuloMes(mes);

  return (
    <div className="space-y-5 min-w-0">
      <CabecalhoModulo icone={BarChart3} titulo="Relatórios" descricao="Acompanhe o desempenho da sua empresa com dados reais e atualizados."
        acoes={<>
        <div className="flex flex-wrap items-center gap-2">
          {personalizado ? (
            <div className="flex flex-wrap items-center gap-1">
              <input type="date" aria-label="Início do período" value={ini} max={fim} onChange={(e) => setIni(e.target.value)} className={filtro} />
              <span className="text-sm text-gray-500">a</span>
              <input type="date" aria-label="Fim do período" value={fim} min={ini} onChange={(e) => setFim(e.target.value)} className={filtro} />
            </div>
          ) : (
            <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-1">
              <CalendarDays className="w-4 h-4 text-gray-500 ml-2" aria-hidden="true" />
              <span className="px-2 text-sm font-semibold text-gray-900 whitespace-nowrap" aria-live="polite">{rotuloMes(mes)}</span>
              <button type="button" aria-label="Mês anterior" onClick={() => setMes(somarMeses(mes, -1))} className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-gray-50"><ChevronLeft className="w-5 h-5" aria-hidden="true" /></button>
              <button type="button" aria-label="Próximo mês" onClick={() => setMes(somarMeses(mes, 1))} className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-gray-50"><ChevronRight className="w-5 h-5" aria-hidden="true" /></button>
            </div>
          )}
          <button type="button" onClick={() => setPersonalizado((p) => !p)} className="min-h-11 px-3 text-sm font-semibold text-orange-600 hover:underline">{personalizado ? 'Usar mês' : 'Período personalizado'}</button>
          <div className="flex gap-1">
            <button type="button" disabled={!r || exportando} onClick={() => exportar('csv')} className={`${classeBotaoPrimario} whitespace-nowrap`}><FileSpreadsheet className="w-4 h-4" aria-hidden="true" />CSV</button>
            <button type="button" disabled={!r || exportando} onClick={() => exportar('pdf')} className={`${classeBotaoPrimario} whitespace-nowrap`}><Download className="w-4 h-4" aria-hidden="true" />PDF</button>
          </div>
        </div>
        </>} />

      {!periodoValido && <p role="alert" className="text-sm text-red-700">O fim do período deve ser depois do início.</p>}
      {avisoExport && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{avisoExport}</p>}
      {exportando && <p role="status" className="text-sm text-gray-600">Gerando exportação…</p>}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-2 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Relatórios" className="flex flex-wrap gap-1">
          {([['geral', 'Visão geral', LayoutGrid], ['financeiro', 'Financeiro', Wallet], ['clientes', 'Clientes', UserCheck], ['funcionarios', 'Funcionários', Users]] as const).map(([a, rot, Icone]) => (
            <button key={a} type="button" role="tab" aria-selected={aba === a} onClick={() => setAba(a)}
              className={classePilula(aba === a)}><Icone className="w-4 h-4" aria-hidden="true" />{rot}</button>
          ))}
        </div>
        {(aba === 'geral' || aba === 'financeiro') && (
          <select aria-label="Filtrar por categoria" value={idCategoria} onChange={(e) => setIdCategoria(e.target.value)} className={`${filtro} sm:ml-auto`}>
            <option value="">Todas as categorias</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.tipo === 'receita' ? 'Receita' : 'Despesa'} · {c.nome}</option>)}
          </select>
        )}
      </div>

      {rel.tipo === 'erro' && (rel.ausente
        ? <p role="status" data-testid="relatorios-indisponivel" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{rel.mensagem}</p>
        : <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-wrap justify-between gap-3">{rel.mensagem}
            <button type="button" onClick={carregar} className="min-h-11 px-3 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button></div>)}

      {(aba === 'geral' || aba === 'financeiro') && (
        <div className="grid gap-3 grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          <CardIndicador titulo="Receitas" valor={r?.receitas} anterior={r?.receitas_anterior} positivoBom icone={TrendingUp} cor="bg-green-100 text-green-600" estado={rel.tipo} aoDetalhar={() => detalhar('receitas')} />
          <CardIndicador titulo="Despesas" valor={r?.despesas} anterior={r?.despesas_anterior} positivoBom={false} icone={TrendingDown} cor="bg-red-100 text-red-600" estado={rel.tipo} aoDetalhar={() => detalhar('despesas')} />
          <CardIndicador titulo="Resultado gerencial" valor={r?.resultado} anterior={r?.resultado_anterior} positivoBom icone={BarChart3} cor="bg-blue-100 text-blue-600" estado={rel.tipo} aoDetalhar={() => detalhar('todos')} nota="Caixa operacional · não é lucro contábil" />
          <CardIndicador titulo="A receber" valor={r?.a_receber.total} icone={Clock} cor="bg-orange-100 text-orange-600" estado={rel.tipo} aoDetalhar={() => detalhar('receber')} nota={r ? `${formatarMoeda(r.a_receber.vencido)} vencido · hoje` : undefined} />
          <CardIndicador titulo="A pagar" valor={r?.a_pagar.total} icone={CircleDollarSign} cor="bg-purple-100 text-purple-600" estado={rel.tipo} aoDetalhar={() => detalhar('pagar')} nota={r ? `${formatarMoeda(r.a_pagar.vencido)} vencido · hoje` : undefined} />
        </div>
      )}
      {r && (aba === 'geral' || aba === 'financeiro') && (
        <p className="text-xs text-gray-500 -mt-2">{rotuloPeriodo} · comparado a {formatarData(r.anterior_inicio)}–{formatarData(r.anterior_fim)} (mesma duração). Realizado = data de pagamento; a receber/pagar = pendentes hoje.
          {(Number(r.nao_operacionais_entradas) > 0 || Number(r.nao_operacionais_saidas) > 0) && ` Fora das receitas/despesas: entradas não operacionais ${formatarMoeda(r.nao_operacionais_entradas)} (aportes, empréstimos) e saídas ${formatarMoeda(r.nao_operacionais_saidas)} (pró-labore, distribuições, financiamentos).`}</p>
      )}

      {aba === 'geral' && r && (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <section aria-label="Receitas x Despesas" className={cartao}>
              <h2 className="font-bold text-gray-900 mb-1">Receitas x Despesas</h2><p className="text-xs text-gray-500 mb-3">Operacionais realizadas, 12 meses</p>
              <Barras dados={r.serie.map((s) => ({ mes: s.mes, a: Number(s.receitas), b: Number(s.despesas) }))} rotA="Receitas" rotB="Despesas" corA="#16a34a" corB="#ef4444" />
            </section>
            <section aria-label="Fluxo de caixa realizado" className={cartao}>
              <h2 className="font-bold text-gray-900 mb-1">Fluxo de caixa (realizado)</h2><p className="text-xs text-gray-500 mb-3">Movimentações efetivas nas contas, 12 meses</p>
              <Barras dados={r.serie.map((s) => ({ mes: s.mes, a: Number(s.entradas), b: Number(s.saidas) }))} rotA="Entradas" rotB="Saídas" corA="#0d9488" corB="#f97316" />
            </section>
            <section aria-label="Despesas por categoria" className={cartao}>
              <h2 className="font-bold text-gray-900 mb-3">Despesas por categoria</h2>
              {Number(r.despesas) > 0 ? <GraficoRosca empilhado itens={r.despesas_por_categoria} total={Number(r.despesas)} rotulo="Despesas por categoria" /> : <p className="text-sm text-gray-500 py-10 text-center">Sem despesas realizadas no período.</p>}
            </section>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Contas titulo="Contas a receber" faixas={r.a_receber} aoVer={() => detalhar('receber')} />
            <Contas titulo="Contas a pagar" faixas={r.a_pagar} aoVer={() => detalhar('pagar')} />
          </div>
        </>
      )}

      {(aba === 'geral' || aba === 'financeiro') && rel.tipo === 'ok' && periodoValido && (
        <Detalhe filtros={filtrosDetalhe} aoModo={(m) => { setModo(m); setSituacao(''); }} situacao={situacao} aoSituacao={setSituacao} compacto={aba === 'geral'} aoVerTodos={() => setAba('financeiro')} />
      )}
      {aba === 'clientes' && <RelatorioClientes idEmpresa={empresa.id} versao={versao} />}
      {aba === 'funcionarios' && <RelatorioFuncionarios idEmpresa={empresa.id} competencia={inicioDoMes(periodo.fim || hoje)} versao={versao} />}
    </div>
  );
}

function CardIndicador({ titulo, valor, anterior, positivoBom, icone: Icone, cor, estado, aoDetalhar, nota }: {
  titulo: string; valor?: number; anterior?: number; positivoBom?: boolean; icone: typeof Wallet; cor: string; estado: string; aoDetalhar: () => void; nota?: string;
}) {
  const v = valor !== undefined && anterior !== undefined ? variacao(Number(valor), Number(anterior)) : null;
  const bom = v === null || v === 0 ? null : (v > 0) === !!positivoBom;
  return (
    <section aria-label={titulo} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 min-w-0">
      <button type="button" onClick={aoDetalhar} disabled={estado !== 'ok'} className="w-full flex items-start gap-3 text-left" aria-label={`${titulo}: ver registros`}>
        <span className={`w-11 h-11 shrink-0 rounded-xl inline-flex items-center justify-center ${cor}`}><Icone className="w-5 h-5" aria-hidden="true" /></span>
        <span className="min-w-0">
          <span className="block text-sm text-gray-600">{titulo}</span>
          <span className={`block text-lg sm:text-xl font-bold ${valor !== undefined && Number(valor) < 0 ? 'text-red-700' : 'text-gray-900'}`}>{estado === 'ok' && valor !== undefined ? formatarMoeda(valor) : estado === 'carregando' ? '…' : 'Indisponível'}</span>
          {anterior !== undefined && (v === null ? <span className="block text-xs text-gray-500">Sem base no período anterior</span>
            : <span className={`text-xs inline-flex items-center gap-1 ${bom === null ? 'text-gray-500' : bom ? 'text-green-700' : 'text-red-700'}`}>{v >= 0 ? <ArrowUp className="w-3 h-3" aria-hidden="true" /> : <ArrowDown className="w-3 h-3" aria-hidden="true" />}{Math.abs(v).toLocaleString('pt-BR')}% vs. período anterior</span>)}
          {nota && <span className="block text-xs text-gray-500">{nota}</span>}
        </span>
      </button>
    </section>
  );
}

function Barras({ dados, rotA, rotB, corA, corB }: { dados: { mes: string; a: number; b: number }[]; rotA: string; rotB: string; corA: string; corB: string }) {
  const max = Math.max(1, ...dados.flatMap((d) => [d.a, d.b]));
  if (dados.every((d) => !d.a && !d.b)) return <p className="text-sm text-gray-500 py-10 text-center">Sem movimentações no período.</p>;
  return (
    <div>
      <div className="flex items-end gap-1 h-40" role="img" aria-label={`${rotA} e ${rotB} por mês`}>
        {dados.map((d) => (
          <div key={d.mes} className="flex-1 h-full flex items-end justify-center gap-0.5" title={`${rotuloMes(d.mes)}: ${rotA} ${formatarMoeda(d.a)} · ${rotB} ${formatarMoeda(d.b)}`}>
            <span className="w-1/3 max-w-3 rounded-t" style={{ height: `${(d.a / max) * 100}%`, backgroundColor: corA }} />
            <span className="w-1/3 max-w-3 rounded-t" style={{ height: `${(d.b / max) * 100}%`, backgroundColor: corB }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1">{dados.map((d) => <span key={d.mes} className="flex-1 text-center text-[10px] text-gray-500">{rotuloMesCurto(d.mes)}</span>)}</div>
      <div className="flex justify-center gap-4 text-xs text-gray-600 mt-2">
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: corA }} />{rotA}</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: corB }} />{rotB}</span>
      </div>
      <div className="sr-only"><table><caption>{rotA} e {rotB} por mês</caption><tbody>{dados.map((d) => <tr key={d.mes}><td>{rotuloMes(d.mes)}</td><td>{formatarMoeda(d.a)}</td><td>{formatarMoeda(d.b)}</td></tr>)}</tbody></table></div>
    </div>
  );
}

function Contas({ titulo, faixas, aoVer }: { titulo: string; faixas: Faixas; aoVer: () => void }) {
  const total = Number(faixas.total);
  const partes = [['Em dia', Number(faixas.em_dia), '#16a34a'], ['Vencendo (7 dias)', Number(faixas.vencendo_7), '#f59e0b'], ['Vencido', Number(faixas.vencido), '#ef4444']] as const;
  return (
    <section aria-label={titulo} className={cartao}>
      <div className="flex items-center justify-between"><h2 className="font-bold text-gray-900">{titulo}</h2>
        <button type="button" onClick={aoVer} className="min-h-11 text-sm font-semibold text-orange-600 hover:underline">Ver registros</button></div>
      <p className="text-2xl font-black text-gray-900">{formatarMoeda(total)}</p><p className="text-xs text-gray-500 mb-3">Total pendente hoje · {faixas.qtd} {faixas.qtd === 1 ? 'lançamento' : 'lançamentos'}</p>
      {total > 0 && <div className="flex h-3 rounded-full overflow-hidden mb-3" aria-hidden="true">{partes.map(([r, v, c]) => v > 0 && <span key={r} style={{ width: `${(v / total) * 100}%`, backgroundColor: c }} />)}</div>}
      <ul className="space-y-1.5 text-sm">{partes.map(([r, v, c]) => (
        <li key={r} className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} /><span className="flex-1 text-gray-700">{r}</span>
          <span className="font-medium">{formatarMoeda(v)}</span><span className="w-12 text-right text-gray-500">{total ? Math.round((v / total) * 100) : 0}%</span></li>))}</ul>
    </section>
  );
}

function Detalhe({ filtros, aoModo, situacao, aoSituacao, compacto, aoVerTodos }: {
  filtros: Parameters<typeof consultaDetalhe>[0]; aoModo: (m: ModoDetalhe) => void; situacao: string; aoSituacao: (s: string) => void; compacto: boolean; aoVerTodos: () => void;
}) {
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [estado, setEstado] = useState<Estado<{ linhas: LinhaDetalhe[]; total: number }>>({ tipo: 'carregando' });
  const chave = JSON.stringify(filtros);
  useEffect(() => { setPagina(1); }, [chave]);
  useEffect(() => {
    let ativo = true;
    setEstado({ tipo: 'carregando' });
    const tam = compacto ? 5 : porPagina;
    consultaDetalhe(filtros).range((pagina - 1) * tam, pagina * tam - 1).then(({ data, error, count }) => {
      if (!ativo) return;
      if (error) return setEstado({ tipo: 'erro', mensagem: mensagemDeErro(error, 'Não foi possível carregar os registros.'), ausente: recursoAusente(error) });
      setEstado({ tipo: 'ok', dados: { linhas: (data ?? []) as LinhaDetalhe[], total: count ?? 0 } });
    });
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chave serializa os filtros
  }, [chave, pagina, porPagina, compacto]);
  const m = MODOS[filtros.modo];
  return (
    <section aria-label="Detalhamento" className={cartao}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h2 className="font-bold text-gray-900 flex-1">{compacto ? 'Últimos lançamentos' : m.rotulo}</h2>
        {compacto ? <button type="button" onClick={aoVerTodos} className="min-h-11 text-sm font-semibold text-orange-600 hover:underline">Ver todos</button> : (
          <>
            <select aria-label="Registros" value={filtros.modo} onChange={(e) => aoModo(e.target.value as ModoDetalhe)} className={filtro}>{Object.entries(MODOS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select>
            <select aria-label="Filtrar por status" value={situacao} onChange={(e) => aoSituacao(e.target.value)} className={filtro}>
              <option value="">Todos os status</option>
              {filtros.modo !== 'receber' && filtros.modo !== 'pagar' && <option value="pago">Realizado</option>}
              {filtros.modo !== 'receitas' && filtros.modo !== 'despesas' && <><option value="pendente">A vencer</option><option value="vencido">Vencido</option></>}
            </select>
          </>
        )}
      </div>
      {!compacto && <p className="text-xs text-gray-500 mb-2">{m.criterio}</p>}
      {estado.tipo === 'carregando' && <div role="status" aria-label="Carregando registros" className="h-40 rounded-xl bg-gray-50 animate-pulse" />}
      {estado.tipo === 'erro' && <p role="alert" className="text-sm text-red-700">{estado.mensagem}</p>}
      {estado.tipo === 'ok' && (estado.dados.linhas.length === 0 ? <p className="text-sm text-gray-500 py-8 text-center">Nenhum lançamento com esses filtros.</p> : (
        <>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[48rem]" data-testid="tabela-detalhe">
              <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">{['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor', 'Status', 'Cliente/Fornecedor'].map((h) => <th key={h} className={`py-2 px-2 font-medium ${h === 'Valor' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>{estado.dados.linhas.map((l) => (
                <tr key={l.id} className="border-b border-gray-50">
                  <td className="py-2 px-2 whitespace-nowrap">{formatarData(l[m.data] ?? l.data_competencia)}</td>
                  <td className="py-2 px-2">{l.descricao}{l.natureza_financeira !== 'operacional' && <span className="ml-1 text-[11px] text-gray-500">(não operacional)</span>}</td>
                  <td className="py-2 px-2 text-gray-600">{l.categoria_nome ?? '—'}</td>
                  <td className={`py-2 px-2 ${l.tipo === 'receita' ? 'text-green-700' : 'text-red-700'}`}>{l.tipo === 'receita' ? 'Receita' : 'Despesa'}</td>
                  <td className={`py-2 px-2 text-right whitespace-nowrap font-semibold ${l.tipo === 'receita' ? 'text-green-700' : 'text-red-700'}`}>{formatarMoeda(l.valor)}</td>
                  <td className="py-2 px-2"><Selo tipo={l.situacao === 'pago' ? 'sucesso' : l.situacao === 'vencido' ? 'perigo' : 'alerta'} texto={l.situacao === 'pago' ? (l.tipo === 'receita' ? 'Recebido' : 'Pago') : ROTULO_SITUACAO_DETALHE[l.situacao] ?? l.situacao} /></td>
                  <td className="py-2 px-2 text-gray-700">{l.contraparte ?? '—'}</td>
                </tr>))}</tbody>
            </table>
          </div>
          {!compacto && <Paginacao pagina={pagina} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={(n) => { setPorPagina(n); setPagina(1); }} total={estado.dados.total} />}
          <p className="text-xs text-gray-500 mt-2"><Link href="/app/financeiro#lancamentos" className="text-orange-600 font-semibold hover:underline">Abrir no Financeiro</Link> para editar ou registrar pagamentos.</p>
        </>
      ))}
    </section>
  );
}

function RelatorioClientes({ idEmpresa, versao }: { idEmpresa: string; versao: number }) {
  const [e, setE] = useState<Estado<{ total: number; ativos: number; inativos: number; prospects: number; novos_mes: number; a_receber: number | null; a_receber_vencido: number | null; evolucao: { mes: string; novos: number; cadastrados: number }[] }>>({ tipo: 'carregando' });
  useEffect(() => {
    createClient().rpc('resumo_clientes', { p_id_empresa: idEmpresa }).then(({ data, error }) =>
      setE(error ? { tipo: 'erro', mensagem: mensagemDeErro(error, 'Não foi possível carregar o relatório de clientes.'), ausente: recursoAusente(error) } : { tipo: 'ok', dados: data }));
  }, [idEmpresa, versao]);
  if (e.tipo === 'carregando') return <div role="status" aria-label="Carregando" className="h-56 rounded-2xl bg-white border border-gray-200 animate-pulse" />;
  if (e.tipo === 'erro') return <p role={e.ausente ? 'status' : 'alert'} className={`rounded-xl border p-4 text-sm ${e.ausente ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-700'}`}>{e.mensagem}</p>;
  const d = e.dados;
  if (!d.total) return <div className={`${cartao} text-center py-10`}><p className="text-sm text-gray-600">Nenhum cliente cadastrado.</p><Link href="/app/clientes" className="text-sm font-semibold text-orange-600 hover:underline">Ir para Clientes</Link></div>;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-testid="relatorio-clientes">
      <section aria-label="Resumo de clientes" className={cartao}>
        <h2 className="font-bold text-gray-900 mb-2">Resumo de clientes</h2>
        <p className="text-3xl font-black text-gray-900">{d.total}</p><p className="text-sm text-gray-500 mb-3">clientes cadastrados · {d.novos_mes} novos no mês</p>
        <GraficoRosca empilhado total={d.total} rotulo="Situação dos clientes" itens={[{ categoria: 'Ativos', cor: '#16a34a', icone: 'users', valor: d.ativos }, { categoria: 'Inativos', cor: '#9ca3af', icone: 'users', valor: d.inativos }, { categoria: 'Prospects', cor: '#f97316', icone: 'users', valor: d.prospects }].filter((i) => i.valor > 0)} />
        <p className="text-sm text-gray-700 mt-3">A receber de clientes: <strong>{d.a_receber === null ? 'sem acesso' : formatarMoeda(d.a_receber)}</strong>{d.a_receber_vencido ? ` (${formatarMoeda(d.a_receber_vencido)} vencido)` : ''}</p>
      </section>
      <section aria-label="Novos clientes por mês" className={cartao}>
        <h2 className="font-bold text-gray-900 mb-3">Novos clientes por mês</h2>
        <Barras dados={d.evolucao.map((x) => ({ mes: x.mes, a: Number(x.novos), b: Number(x.cadastrados) }))} rotA="Novos" rotB="Total cadastrado" corA="#fdba74" corB="#ea580c" />
      </section>
    </div>
  );
}

function RelatorioFuncionarios({ idEmpresa, competencia, versao }: { idEmpresa: string; competencia: string; versao: number }) {
  const [e, setE] = useState<Estado<{ linhas: { total: number; pago: number; pendente: number; situacao: string; nome: string; adicionais: number; descontos: number }[]; evolucao: { competencia: string; previsto: number; pago: number }[] }>>({ tipo: 'carregando' });
  useEffect(() => {
    const s = createClient();
    Promise.all([s.rpc('resumo_folha', { p_id_empresa: idEmpresa, p_competencia: competencia }), s.rpc('evolucao_folha', { p_id_empresa: idEmpresa, p_ano: Number(competencia.slice(0, 4)) })]).then(([a, b]) => {
      const err = a.error ?? b.error;
      setE(err ? { tipo: 'erro', mensagem: mensagemDeErro(err, 'Não foi possível carregar o relatório de funcionários.'), ausente: recursoAusente(err) } : { tipo: 'ok', dados: { linhas: a.data ?? [], evolucao: b.data ?? [] } });
    });
  }, [idEmpresa, competencia, versao]);
  if (e.tipo === 'carregando') return <div role="status" aria-label="Carregando" className="h-56 rounded-2xl bg-white border border-gray-200 animate-pulse" />;
  if (e.tipo === 'erro') return <p role={e.ausente ? 'status' : 'alert'} className={`rounded-xl border p-4 text-sm ${e.ausente ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-700'}`}>{e.mensagem}</p>;
  const ls = e.dados.linhas.filter((l) => l.situacao !== 'cancelada');
  const soma = (k: 'total' | 'pago' | 'pendente') => ls.reduce((t, l) => t + Number(l[k]), 0);
  if (ls.length === 0) return <div className={`${cartao} text-center py-10`}><p className="text-sm text-gray-600">Nenhuma folha em {rotuloMes(competencia)}.</p><Link href="/app/funcionarios" className="text-sm font-semibold text-orange-600 hover:underline">Ir para Funcionários</Link></div>;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-testid="relatorio-funcionarios">
      <section aria-label="Folha da competência" className={cartao}>
        <h2 className="font-bold text-gray-900 mb-2">Folha de {rotuloMes(competencia)}</h2>
        <dl className="grid grid-cols-3 gap-2 text-sm mb-3">
          <div className="rounded-lg bg-gray-50 p-2"><dt className="text-xs text-gray-500">Previsto</dt><dd className="font-bold">{formatarMoeda(soma('total'))}</dd></div>
          <div className="rounded-lg bg-green-50 p-2"><dt className="text-xs text-gray-500">Pago</dt><dd className="font-bold text-green-700">{formatarMoeda(soma('pago'))}</dd></div>
          <div className="rounded-lg bg-orange-50 p-2"><dt className="text-xs text-gray-500">Pendente</dt><dd className="font-bold text-orange-700">{formatarMoeda(soma('pendente'))}</dd></div>
        </dl>
        <ul className="divide-y divide-gray-100 text-sm">{ls.map((l) => <li key={l.nome} className="py-2 flex justify-between gap-2"><span>{l.nome}</span><span className="text-gray-600">{formatarMoeda(l.pago)} de {formatarMoeda(l.total)}</span></li>)}</ul>
        <p className="text-xs text-gray-500 mt-2">Valores gerenciais da folha (não é folha trabalhista oficial). Pagos também aparecem nas despesas do Financeiro, sem duplicidade.</p>
      </section>
      <section aria-label="Evolução da folha" className={cartao}>
        <h2 className="font-bold text-gray-900 mb-3">Evolução da folha ({competencia.slice(0, 4)})</h2>
        <Barras dados={e.dados.evolucao.map((x) => ({ mes: x.competencia, a: Number(x.previsto), b: Number(x.pago) }))} rotA="Previsto" rotB="Pago" corA="#fdba74" corB="#ea580c" />
      </section>
    </div>
  );
}
