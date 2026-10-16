'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, CalendarClock, CheckCircle2, Download, Eye, FileText, Landmark, Paperclip, Pause, Pencil, Play, Plus, Receipt, RotateCcw, Tag, Trash2, XCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, formatarMoeda, hojeBrasil, inicioDoMes, mascaraMoeda, paraDecimal, rotuloMes, valorParaMascara, type Categoria, type ContaFinanceira } from '@/lib/financeiro';
import {
  RECORRENCIAS, ROTULO_SITUACAO_GASTO, SELO_SITUACAO_GASTO, TIPOS_VALOR, diasAte, rotuloPrazo, rotuloVencimento,
  type ContextoGasto, type GastoFixo, type OcorrenciaGasto, type ResumoGastos, type SituacaoGasto,
} from '@/lib/gastos-fixos';
import { BarraFiltros, BotaoIcone, BotaoLimparFiltros, Celula, CampoBusca, FiltroSelect, Linha, Paginacao, Selo, Tabela } from '@/components/admin/tabela';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { IconeCategoria } from './IconeCategoria';
import { Indicador } from './Indicador';
import { GraficoRosca } from './GraficoRosca';
import { ModalBaixa, type LancamentoParaBaixa } from './ModalBaixa';
import { FormGastoFixo, enviarDocumentoGasto } from './FormGastoFixo';

const SELO_OCORRENCIA = { pendente: 'alerta', vencido: 'perigo', pago: 'sucesso', cancelado: 'neutro' } as const;
const ROTULO_OCORRENCIA = { pendente: 'Pendente', vencido: 'Vencida', pago: 'Paga', cancelado: 'Cancelada' } as const;
const ROTULO_ACAO: Record<string, string> = {
  criado: 'Cadastrado', editado: 'Editado', pausado: 'Pausado', reativado: 'Reativado', encerrado: 'Encerrado', pagamento: 'Pagamento registrado',
  estorno: 'Pagamento estornado', ocorrencia_ajustada: 'Ocorrência ajustada', ocorrencia_cancelada: 'Ocorrência cancelada',
  anexo_adicionado: 'Documento anexado', anexo_removido: 'Documento removido',
};

interface Props {
  contexto: ContextoGasto;
  idEmpresa: string | null; // null = plataforma
  categorias: Categoria[];
  contas: ContaFinanceira[];
  periodo?: string; // início do mês (padrão: mês atual)
  versao: number;
  aoAlterar: (mensagem: string) => void;
  aoIrParaContas?: () => void;
}

// Módulo ÚNICO de gastos fixos: empresas (/app/financeiro) e plataforma (/admin/financeiro). O contexto é validado no banco.
// Filtros da lista de gastos fixos (a soma do rodapé usa os mesmos)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filtrarGastos(q: any, f: { categoria: string; situacao: string; banco: string; buscaAplicada: string }) {
  if (f.categoria) q = q.eq('id_categoria', f.categoria);
  if (f.situacao) q = q.eq('situacao', f.situacao);
  if (f.banco) q = q.eq('id_conta_financeira', f.banco);
  if (f.buscaAplicada) {
    const termo = f.buscaAplicada.replace(/[%,()]/g, ' ');
    q = q.or(`nome.ilike.%${termo}%,contraparte.ilike.%${termo}%,subcategoria.ilike.%${termo}%,observacoes.ilike.%${termo}%,categoria_nome.ilike.%${termo}%`);
  }
  return q;
}

export function GastosFixos({ contexto, idEmpresa, categorias, contas, periodo, versao, aoAlterar, aoIrParaContas }: Props) {
  const [hoje, setHoje] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [categoria, setCategoria] = useState('');
  const [situacao, setSituacao] = useState('');
  const [banco, setBanco] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [gastos, setGastos] = useState<GastoFixo[]>([]);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<ResumoGastos | null>(null);
  const [proximas, setProximas] = useState<OcorrenciaGasto[]>([]);
  const [subcategorias, setSubcategorias] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<{ gasto: GastoFixo | null } | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [encerrando, setEncerrando] = useState<GastoFixo | null>(null);
  const [dataTermino, setDataTermino] = useState('');
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [gerado, setGerado] = useState(false);
  const detalheRef = useRef<HTMLDivElement>(null);
  const mes = periodo || (hoje ? inicioDoMes(hoje) : '');

  useEffect(() => setHoje(hojeBrasil()), []);
  useEffect(() => {
    const t = setTimeout(() => { setBuscaAplicada(busca.trim()); setPagina(1); }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  // Ocorrências da janela (mês atual e seguinte) são geradas sob demanda, de forma idempotente, por quem pode gerenciar
  useEffect(() => {
    let ativo = true;
    createClient().rpc('gerar_ocorrencias_gastos_fixos', { p_contexto: contexto, p_id_empresa: idEmpresa }).then(() => { if (ativo) setGerado(true); });
    return () => { ativo = false; };
  }, [contexto, idEmpresa]);


  useEffect(() => {
    if (!hoje || !gerado) return;
    let ativo = true;
    const supabase = createClient();
    // O banco valida o contexto (RLS); o filtro aqui só separa empresa x plataforma na consulta
    const base = supabase.from('gastos_fixos_resumo').select('*', { count: 'exact' }).eq('contexto', contexto);
    const q = filtrarGastos(idEmpresa ? base.eq('id_empresa', idEmpresa) : base.is('id_empresa', null), { categoria, situacao, banco, buscaAplicada });
    const inicio = (pagina - 1) * porPagina;
    setCarregando(true);
    Promise.all([
      q.order('situacao').order('nome').range(inicio, inicio + porPagina - 1),
      supabase.rpc('resumo_gastos_fixos', { p_contexto: contexto, p_id_empresa: idEmpresa, p_mes: mes }),
      (idEmpresa ? supabase.from('ocorrencias_gastos_fixos').select('*').eq('id_empresa', idEmpresa) : supabase.from('ocorrencias_gastos_fixos').select('*').is('id_empresa', null))
        .eq('contexto', contexto).eq('status', 'pendente').order('data_vencimento').limit(5),
      (idEmpresa ? supabase.from('gastos_fixos').select('subcategoria').eq('id_empresa', idEmpresa) : supabase.from('gastos_fixos').select('subcategoria').is('id_empresa', null))
        .eq('contexto', contexto).not('subcategoria', 'is', null),
    ]).then(([lista, res, prox, subs]) => {
      if (!ativo) return;
      const falha = lista.error ?? res.error ?? prox.error;
      if (falha) setErro(mensagemDeErro(falha, 'Não foi possível carregar os gastos fixos.'));
      else {
        setErro(null);
        setGastos((lista.data ?? []) as GastoFixo[]);
        setTotal(lista.count ?? 0);
        setResumo(res.data as ResumoGastos);
        setProximas((prox.data ?? []) as OcorrenciaGasto[]);
        setSubcategorias([...new Set((subs.data ?? []).map((s) => s.subcategoria as string))].sort());
      }
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, [contexto, idEmpresa, categoria, situacao, banco, buscaAplicada, pagina, porPagina, hoje, mes, versao, gerado]);

  // Soma do valor de TODOS os gastos fixos que atendem aos filtros (não só da página), em centavos
  const [somaFiltro, setSomaFiltro] = useState<{ centavos: number; limitado: boolean } | null>(null);
  useEffect(() => {
    if (!hoje || !gerado) return;
    let ativo = true;
    setSomaFiltro(null);
    (async () => {
      const supabase = createClient();
      let centavos = 0;
      const POR_LOTE = 1000, MAX_LOTES = 10;
      for (let lote = 0; lote < MAX_LOTES; lote++) {
        const base = supabase.from('gastos_fixos_resumo').select('valor').eq('contexto', contexto);
        const { data, error } = await filtrarGastos(idEmpresa ? base.eq('id_empresa', idEmpresa) : base.is('id_empresa', null), { categoria, situacao, banco, buscaAplicada })
          .order('id').range(lote * POR_LOTE, (lote + 1) * POR_LOTE - 1);
        if (!ativo || error) return;
        for (const g of (data ?? []) as unknown as { valor: number | string }[]) centavos += Math.round(Number(g.valor) * 100);
        if ((data ?? []).length < POR_LOTE) return setSomaFiltro({ centavos, limitado: false });
      }
      if (ativo) setSomaFiltro({ centavos, limitado: true });
    })();
    return () => { ativo = false; };
  }, [contexto, idEmpresa, categoria, situacao, banco, buscaAplicada, hoje, versao, gerado]);

  const abrirDetalhe = (id: string) => {
    setDetalhe(id);
    setTimeout(() => detalheRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const alterarSituacao = async (g: GastoFixo, acao: 'pausar' | 'reativar' | 'encerrar') => {
    setOcupado(true);
    setErroAcao(null);
    const { error } = await createClient().rpc('alterar_situacao_gasto_fixo', { p_id: g.id, p_acao: acao, p_data_termino: acao === 'encerrar' ? dataTermino || null : null });
    setOcupado(false);
    if (error) {
      if (acao === 'encerrar') return setErroAcao(mensagemDeErro(error, 'Não foi possível encerrar.'));
      return aoAlterar(mensagemDeErro(error, 'Não foi possível concluir a ação.'));
    }
    setEncerrando(null);
    aoAlterar(acao === 'pausar' ? 'Gasto fixo pausado. As próximas ocorrências pendentes foram canceladas.' : acao === 'reativar' ? 'Gasto fixo reativado.' : 'Gasto fixo encerrado.');
  };

  const filtros = busca || categoria || situacao || banco;
  const despesas = categorias.filter((c) => c.tipo === 'despesa');
  const gastoDetalhe = gastos.find((g) => g.id === detalhe) ?? null;
  const totalCategorias = (resumo?.por_categoria ?? []).reduce((s, c) => s + Number(c.valor), 0);
  if (!hoje) return null;

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900">Gastos Fixos</h2>
          <p className="text-sm text-gray-600">
            {contexto === 'plataforma'
              ? 'Gerencie as despesas recorrentes da administração do Unnify Conecta, com controle de vencimentos e pagamentos.'
              : 'Gerencie suas despesas recorrentes, com controle de vencimentos e integração com as contas a pagar.'}
          </p>
        </div>
        <button type="button" onClick={() => setForm({ gasto: null })} className="min-h-11 px-5 inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold">
          <Plus className="w-4 h-4" aria-hidden="true" />Novo gasto fixo
        </button>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[360px]:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Total do mês" valor={formatarMoeda(resumo?.total_mes ?? 0)} icone={CalendarClock} cor="bg-orange-100 text-orange-600" detalhe={mes ? rotuloMes(mes) : undefined} />
        <Indicador titulo="Gastos cadastrados" valor={String(resumo?.gastos_ativos ?? 0)} icone={FileText} cor="bg-gray-100 text-gray-600"
          detalhe={`ativos${resumo?.gastos_pausados ? ` · ${resumo.gastos_pausados} pausados` : ''}`} />
        <Indicador titulo="Pago no mês" valor={formatarMoeda(resumo?.pago_mes ?? 0)} icone={CheckCircle2} cor="bg-green-100 text-green-600" destaque="text-green-700"
          detalhe={`${resumo?.qtd_pagas ?? 0} ${resumo?.qtd_pagas === 1 ? 'conta' : 'contas'}`} />
        <Indicador titulo="Pendente" valor={formatarMoeda(resumo?.pendente_mes ?? 0)} icone={AlertCircle} cor="bg-red-100 text-red-600" destaque="text-red-700"
          detalhe={`${resumo?.qtd_pendentes ?? 0} ${resumo?.qtd_pendentes === 1 ? 'conta' : 'contas'}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label="Gastos fixos por categoria" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0">
          <h3 className="font-bold text-gray-900">Gastos fixos por categoria</h3>
          <p className="text-xs text-gray-500 mb-4">Distribuição do valor do mês por categoria.</p>
          {totalCategorias > 0 ? <GraficoRosca itens={resumo!.por_categoria} total={totalCategorias} rotulo="Gastos fixos por categoria" />
            : <p className="text-sm text-gray-500 py-8 text-center">Nenhum gasto fixo neste mês.</p>}
        </section>
        <section aria-label="Próximos vencimentos" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0">
          <h3 className="font-bold text-gray-900 mb-3">Próximos vencimentos</h3>
          {proximas.length === 0 ? <p className="text-sm text-gray-500 py-8 text-center">Nenhuma conta pendente.</p> : (
            <ul className="divide-y divide-gray-100">
              {proximas.map((o) => {
                const d = diasAte(o.data_vencimento, hoje);
                return (
                  <li key={o.id}>
                    <button type="button" onClick={() => abrirDetalhe(o.id_gasto_fixo)} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-gray-50 rounded-lg px-1">
                      <span className="w-11 shrink-0 rounded-lg border border-orange-200 bg-orange-50 text-center py-1 leading-tight">
                        <span className="block text-sm font-black text-orange-700">{o.data_vencimento.slice(8, 10)}</span>
                        <span className="block text-[10px] font-semibold uppercase text-orange-600">{rotuloMes(inicioDoMes(o.data_vencimento)).slice(0, 3)}</span>
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-gray-900 truncate">{o.nome}</span>
                        <span className="block text-sm text-gray-700">{formatarMoeda(o.valor)}</span>
                      </span>
                      <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${d < 0 ? 'bg-red-100 text-red-700' : d <= 7 ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-700'}`}>
                        {rotuloPrazo(o.data_vencimento, hoje)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section aria-label="Lista de gastos fixos" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 space-y-4 min-w-0">
        <BarraFiltros>
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por nome, categoria ou observação..." />
          <FiltroSelect icone={Tag} valor={categoria} aoMudar={(v) => { setCategoria(v); setPagina(1); }}>
            <option value="">Todas as categorias</option>
            {despesas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </FiltroSelect>
          <FiltroSelect valor={situacao} aoMudar={(v) => { setSituacao(v); setPagina(1); }}>
            <option value="">Todos os status</option>
            {(Object.keys(ROTULO_SITUACAO_GASTO) as SituacaoGasto[]).map((s) => <option key={s} value={s}>{ROTULO_SITUACAO_GASTO[s]}</option>)}
          </FiltroSelect>
          {contexto === 'empresa' && (
            <FiltroSelect icone={Landmark} valor={banco} aoMudar={(v) => { setBanco(v); setPagina(1); }}>
              <option value="">Todos os bancos</option>
              {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </FiltroSelect>
          )}
          {filtros && <BotaoLimparFiltros aoClicar={() => { setBusca(''); setCategoria(''); setSituacao(''); setBanco(''); setPagina(1); }} />}
        </BarraFiltros>
        {erro ? (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{erro}</div>
        ) : carregando ? (
          <div role="status" aria-label="Carregando" className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-gray-50 animate-pulse" />)}</div>
        ) : gastos.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
            <p className="font-semibold text-gray-900">{filtros ? 'Nenhum gasto fixo encontrado com esses filtros.' : 'Nenhum gasto fixo cadastrado ainda.'}</p>
            {!filtros && <p className="text-sm text-gray-600 mt-1">Cadastre despesas que se repetem, como aluguel, internet e assinaturas, em “Novo gasto fixo”.</p>}
          </div>
        ) : (
          <Tabela colunas={[{ titulo: 'Nome' }, { titulo: 'Categoria' }, { titulo: 'Valor' }, { titulo: 'Vencimento' }, { titulo: 'Recorrência' }, { titulo: 'Status' }, { titulo: 'Ações', alinhar: 'centro' }]}>
            {gastos.map((g) => (
              <Linha key={g.id}>
                <Celula>
                  <div className="flex items-center gap-3 min-w-0" data-testid={`gasto-${g.nome}`}>
                    <IconeCategoria icone={g.categoria_icone} cor={g.categoria_cor} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 break-words">{g.nome}</p>
                      {(g.contraparte || g.subcategoria) && <p className="text-xs text-gray-500 break-words">{[g.contraparte, g.subcategoria].filter(Boolean).join(' · ')}</p>}
                    </div>
                  </div>
                </Celula>
                <Celula><span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: `${g.categoria_cor}1a`, color: g.categoria_cor }}>{g.categoria_nome}</span></Celula>
                <Celula><span className="font-semibold text-gray-900 whitespace-nowrap">{formatarMoeda(g.valor)}</span>{g.tipo_valor === 'variavel' && <span className="block text-xs text-gray-500">variável</span>}</Celula>
                <Celula>{rotuloVencimento(g)}</Celula>
                <Celula>{RECORRENCIAS[g.recorrencia]}</Celula>
                <Celula><Selo tipo={SELO_SITUACAO_GASTO[g.situacao]} texto={ROTULO_SITUACAO_GASTO[g.situacao]} /></Celula>
                <Celula>
                  <div className="flex items-center justify-end min-[85rem]:justify-center gap-2 min-[85rem]:gap-1.5">
                    <BotaoIcone icone={Eye} titulo={`Detalhes de ${g.nome}`} aoClicar={() => abrirDetalhe(g.id)} />
                    {g.situacao !== 'encerrado' && <BotaoIcone icone={Pencil} titulo={`Editar ${g.nome}`} aoClicar={() => setForm({ gasto: g })} />}
                    {g.situacao === 'ativo' && <BotaoIcone icone={Pause} titulo={`Pausar ${g.nome}`} aoClicar={() => alterarSituacao(g, 'pausar')} />}
                    {g.situacao === 'pausado' && <BotaoIcone icone={Play} titulo={`Reativar ${g.nome}`} aoClicar={() => alterarSituacao(g, 'reativar')} />}
                    {g.situacao !== 'encerrado' && <BotaoIcone icone={XCircle} titulo={`Encerrar ${g.nome}`} aoClicar={() => { setDataTermino(hoje); setErroAcao(null); setEncerrando(g); }} />}
                  </div>
                </Celula>
              </Linha>
            ))}
          </Tabela>
        )}
        {!erro && !carregando && gastos.length > 0 && somaFiltro && (
          <p className="flex flex-wrap items-baseline justify-end gap-x-2 text-sm text-gray-600" data-testid="total-filtro">
            <span>Total dos gastos fixos{total > 0 ? ` (${total} ${total === 1 ? 'gasto' : 'gastos'})` : ''}:</span>
            <strong className="text-base text-red-700">{formatarMoeda(somaFiltro.centavos / 100)}</strong>
            {somaFiltro.limitado && <span className="text-xs text-amber-700">soma dos primeiros 10.000 gastos</span>}
          </p>
        )}
        {!erro && !carregando && total > 0 && <Paginacao pagina={pagina} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={setPorPagina} total={total} />}
      </section>

      <div ref={detalheRef} className="scroll-mt-20 min-w-0">
        {gastoDetalhe && (
          <DetalheGasto gasto={gastoDetalhe} contexto={contexto} idEmpresa={idEmpresa} contas={contas} hoje={hoje} versao={versao}
            aoFechar={() => setDetalhe(null)} aoAlterar={aoAlterar} aoIrParaContas={aoIrParaContas} />
        )}
      </div>

      <FormGastoFixo aberto={!!form} gasto={form?.gasto ?? null} contexto={contexto} idEmpresa={idEmpresa} categorias={categorias} contas={contas}
        subcategorias={subcategorias} aoFechar={() => setForm(null)} aoAlterarCategorias={aoAlterar}
        aoSalvar={(m, id) => { setForm(null); setDetalhe(id); aoAlterar(m); }} />

      <Modal aberto={!!encerrando} aoFechar={() => setEncerrando(null)} titulo="Encerrar gasto fixo"
        descricao={encerrando ? `${encerrando.nome}: as ocorrências pendentes após o término serão canceladas. Não é possível reativar.` : undefined}
        rodape={<>
          <button type="button" className={classeBotaoSecundario} onClick={() => setEncerrando(null)}>Voltar</button>
          <button type="button" className={classeBotaoPerigo} disabled={ocupado} onClick={() => encerrando && alterarSituacao(encerrando, 'encerrar')}>Encerrar</button>
        </>}>
        <label htmlFor="gf-data-termino" className="block text-sm font-semibold text-gray-900 mb-1.5">Data de término</label>
        <input id="gf-data-termino" type="date" value={dataTermino} onChange={(e) => setDataTermino(e.target.value)} className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
        {erroAcao && <p role="alert" className="text-sm text-red-700 mt-2">{erroAcao}</p>}
      </Modal>
    </div>
  );
}

function DetalheGasto({ gasto: g, contexto, idEmpresa, contas, hoje, versao, aoFechar, aoAlterar, aoIrParaContas }: {
  gasto: GastoFixo; contexto: ContextoGasto; idEmpresa: string | null; contas: ContaFinanceira[]; hoje: string; versao: number;
  aoFechar: () => void; aoAlterar: (m: string) => void; aoIrParaContas?: () => void;
}) {
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaGasto[]>([]);
  const [anexos, setAnexos] = useState<{ id: string; caminho: string; nome_arquivo: string }[]>([]);
  const [historico, setHistorico] = useState<{ acao: string; criado_em: string }[]>([]);
  const [pagando, setPagando] = useState<LancamentoParaBaixa | null>(null);
  const [pagandoPlataforma, setPagandoPlataforma] = useState<OcorrenciaGasto | null>(null);
  const [ajustando, setAjustando] = useState<OcorrenciaGasto | null>(null);
  const [confirmar, setConfirmar] = useState<{ tipo: 'estornar' | 'cancelar'; o: OcorrenciaGasto } | null>(null);
  const [valor, setValor] = useState('');
  const [data, setData] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const plataforma = contexto === 'plataforma';

  const carregar = useCallback(async () => {
    const supabase = createClient();
    const [o, a, h] = await Promise.all([
      supabase.from('ocorrencias_gastos_fixos').select('*').eq('id_gasto_fixo', g.id).order('data_vencimento', { ascending: false }).limit(24),
      supabase.from('anexos_gastos_fixos').select('id, caminho, nome_arquivo').eq('id_gasto_fixo', g.id).order('criado_em'),
      supabase.from('historico_gastos_fixos').select('acao, criado_em').eq('id_gasto_fixo', g.id).order('criado_em', { ascending: false }).limit(30),
    ]);
    setOcorrencias((o.data ?? []) as OcorrenciaGasto[]);
    setAnexos(a.data ?? []);
    setHistorico(h.data ?? []);
  }, [g.id]);

  useEffect(() => {
    setErro(null);
    carregar();
  }, [carregar, versao]);

  const executar = async (fn: () => PromiseLike<{ error: { message?: string } | null }>, msg: string) => {
    setOcupado(true);
    setErro(null);
    const { error } = await fn();
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível concluir a ação.'));
    setPagandoPlataforma(null);
    setAjustando(null);
    setConfirmar(null);
    aoAlterar(msg);
  };

  const ajustar = async () => {
    if (!ajustando) return;
    const v = paraDecimal(valor);
    if (!v || !data) return setErro('Informe valor e vencimento.');
    if (plataforma) return executar(() => createClient().rpc('ajustar_ocorrencia_gasto_plataforma', { p_id: ajustando.id, p_valor: v, p_data_vencimento: data }), 'Ocorrência ajustada.');
    // Empresa: a ocorrência é um lançamento comum; reaproveita a edição de lançamentos
    const supabase = createClient();
    const { data: l } = await supabase.from('lancamentos_financeiros').select('*').eq('id', ajustando.id).single();
    if (!l) return setErro('Lançamento não encontrado.');
    return executar(() => supabase.rpc('salvar_lancamento_financeiro', {
      p_id: l.id, p_id_empresa: l.id_empresa, p_tipo: l.tipo, p_descricao: l.descricao, p_valor: v, p_id_categoria: l.id_categoria,
      p_data_competencia: l.data_competencia, p_data_vencimento: data, p_data_pagamento: null, p_contraparte: l.contraparte,
      p_observacoes: l.observacoes, p_id_conta_financeira: null,
    }), 'Ocorrência ajustada.');
  };

  const anexar = async (arquivo: File) => {
    setErro(null);
    const falha = await enviarDocumentoGasto(contexto, idEmpresa, g.id, arquivo);
    if (falha) return setErro(falha);
    aoAlterar('Documento anexado.');
  };

  const baixar = async (caminho: string) => {
    const { data: url } = await createClient().storage.from('comprovantes-financeiros').createSignedUrl(caminho, 60);
    if (url?.signedUrl) window.open(url.signedUrl, '_blank', 'noopener');
    else setErro('Não foi possível abrir o documento.');
  };

  return (
    <section aria-label={`Detalhes de ${g.nome}`} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 space-y-5 min-w-0">
      <div className="flex items-start gap-3">
        <IconeCategoria icone={g.categoria_icone} cor={g.categoria_cor} tamanho="lg" />
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-gray-900 break-words">{g.nome}</h3>
          <p className="text-sm text-gray-600 break-words">
            {[g.categoria_nome, g.subcategoria, RECORRENCIAS[g.recorrencia], rotuloVencimento(g), TIPOS_VALOR[g.tipo_valor]].filter(Boolean).join(' · ')}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Início {formatarData(g.data_inicio)}{g.data_termino ? ` · término ${formatarData(g.data_termino)}` : ''}
            {g.conta_nome ? ` · banco: ${g.conta_nome}` : ''}{g.proximo_vencimento ? ` · próximo vencimento ${formatarData(g.proximo_vencimento)}` : ''}
          </p>
          {g.observacoes && <p className="text-sm text-gray-700 mt-2 whitespace-pre-line break-words">{g.observacoes}</p>}
        </div>
        <Selo tipo={SELO_SITUACAO_GASTO[g.situacao]} texto={ROTULO_SITUACAO_GASTO[g.situacao]} />
        <button type="button" onClick={aoFechar} aria-label="Fechar detalhes" className="w-11 h-11 -mt-2 -mr-2 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
          <XCircle className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      {erro && !ajustando && !pagandoPlataforma && !confirmar && <p role="alert" className="text-sm text-red-700">{erro}</p>}

      <div>
        <h4 className="font-semibold text-gray-900 mb-2">Ocorrências</h4>
        {plataforma && <p className="text-xs text-gray-500 mb-2">A administração ainda não tem contas bancárias no sistema: o pagamento é registrado sem movimentar saldo.</p>}
        {ocorrencias.length === 0 ? <p className="text-sm text-gray-500">Nenhuma ocorrência gerada (gerada até o fim do mês seguinte para gastos ativos).</p> : (
          <ul className="divide-y divide-gray-100">
            {ocorrencias.map((o) => (
              <li key={o.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2" data-testid={`ocorrencia-${o.data_vencimento}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{formatarMoeda(o.valor)} <span className="font-normal text-gray-500">· vence {formatarData(o.data_vencimento)}</span></p>
                  <p className="text-xs text-gray-500">{o.data_pagamento ? `Pago em ${formatarData(o.data_pagamento)}` : o.status === 'pendente' ? rotuloPrazo(o.data_vencimento, hoje) : ''}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Selo tipo={SELO_OCORRENCIA[o.situacao]} texto={ROTULO_OCORRENCIA[o.situacao]} />
                  {o.status === 'pendente' && (
                    <>
                      <button type="button" className={`${classeBotaoSecundario} px-3`} onClick={() => { setValor(valorParaMascara(o.valor)); setData(o.data_vencimento); setErro(null); setAjustando(o); }}>Ajustar</button>
                      <button type="button" className={`${classeBotaoPrimario} px-4`} aria-label={`Pagar ocorrência de ${formatarData(o.data_vencimento)}`}
                        onClick={() => {
                          setErro(null);
                          if (plataforma) { setValor(valorParaMascara(o.valor)); setData(hoje); setPagandoPlataforma(o); }
                          else setPagando({ id: o.id, tipo: 'despesa', descricao: `${g.nome} — ${formatarData(o.data_vencimento)}`, valor: Number(o.valor), idContaSugerida: g.id_conta_financeira });
                        }}>Pagar</button>
                      <BotaoIcone icone={Trash2} titulo={`Cancelar ocorrência de ${formatarData(o.data_vencimento)}`} aoClicar={() => { setErro(null); setConfirmar({ tipo: 'cancelar', o }); }} />
                    </>
                  )}
                  {o.status === 'pago' && <BotaoIcone icone={RotateCcw} titulo={`Estornar ocorrência de ${formatarData(o.data_vencimento)}`} aoClicar={() => { setErro(null); setConfirmar({ tipo: 'estornar', o }); }} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <h4 className="font-semibold text-gray-900 mb-2">Documentos</h4>
          {anexos.length === 0 ? <p className="text-sm text-gray-500">Nenhum documento.</p> : (
            <ul className="space-y-1.5">
              {anexos.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
                  <span className="flex-1 min-w-0 truncate text-gray-800">{a.nome_arquivo}</span>
                  <BotaoIcone icone={Download} titulo={`Baixar ${a.nome_arquivo}`} aoClicar={() => baixar(a.caminho)} />
                  <BotaoIcone icone={Trash2} titulo={`Remover ${a.nome_arquivo}`} aoClicar={() => executar(() => createClient().rpc('remover_anexo_gasto_fixo', { p_id: a.id }), 'Documento removido.')} />
                </li>
              ))}
            </ul>
          )}
          {g.situacao !== 'encerrado' && (
            <>
              <label htmlFor={`gf-doc-${g.id}`} className="mt-2 inline-flex items-center gap-2 min-h-11 px-3 rounded-lg border border-gray-300 text-sm text-gray-800 cursor-pointer hover:bg-gray-50">
                <Paperclip className="w-4 h-4" aria-hidden="true" />Anexar documento
              </label>
              <input id={`gf-doc-${g.id}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) anexar(f); }} />
            </>
          )}
        </div>
        <div>
          <h4 className="font-semibold text-gray-900 mb-2">Histórico</h4>
          <ul className="space-y-1.5 text-sm" aria-label="Histórico do gasto fixo">
            {historico.map((h, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-gray-800">{ROTULO_ACAO[h.acao] ?? h.acao}</span>
                <span className="text-gray-500 whitespace-nowrap">{new Date(h.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {!plataforma && idEmpresa && (
        <ModalBaixa lancamento={pagando} idEmpresa={idEmpresa} contas={contas} aoFechar={() => setPagando(null)}
          aoConcluir={(m) => { setPagando(null); aoAlterar(m); }} aoIrParaContas={aoIrParaContas ?? (() => undefined)} />
      )}

      <Modal aberto={!!pagandoPlataforma} aoFechar={() => setPagandoPlataforma(null)} titulo="Registrar pagamento"
        descricao={pagandoPlataforma ? `${g.nome} · vence ${formatarData(pagandoPlataforma.data_vencimento)} · ${formatarMoeda(pagandoPlataforma.valor)}` : undefined}
        rodape={<>
          <button type="button" className={classeBotaoSecundario} onClick={() => setPagandoPlataforma(null)}>Voltar</button>
          <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={() => pagandoPlataforma && executar(() => createClient().rpc('registrar_pagamento_gasto_plataforma', {
            p_id: pagandoPlataforma.id, p_data_pagamento: data || null, p_valor: paraDecimal(valor),
          }), 'Pagamento registrado.')}>{ocupado ? 'Processando...' : 'Confirmar'}</button>
        </>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="gf-valor-pago" className="block text-sm font-semibold text-gray-900 mb-1.5">Valor pago (R$)</label>
            <input id="gf-valor-pago" inputMode="numeric" value={valor} onChange={(e) => setValor(mascaraMoeda(e.target.value))} className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="gf-data-pago" className="block text-sm font-semibold text-gray-900 mb-1.5">Data do pagamento</label>
            <input id="gf-data-pago" type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">Pagamento parcial não é permitido. Para valor variável, use “Ajustar” antes.</p>
        {erro && <p role="alert" className="text-sm text-red-700 mt-2">{erro}</p>}
      </Modal>

      <Modal aberto={!!ajustando} aoFechar={() => setAjustando(null)} titulo="Ajustar ocorrência"
        descricao="Altera somente esta ocorrência pendente (ex.: valor variável do mês)."
        rodape={<>
          <button type="button" className={classeBotaoSecundario} onClick={() => setAjustando(null)}>Voltar</button>
          <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={ajustar}>Salvar</button>
        </>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="gf-ajuste-valor" className="block text-sm font-semibold text-gray-900 mb-1.5">Valor (R$)</label>
            <input id="gf-ajuste-valor" inputMode="numeric" value={valor} onChange={(e) => setValor(mascaraMoeda(e.target.value))} className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label htmlFor="gf-ajuste-data" className="block text-sm font-semibold text-gray-900 mb-1.5">Vencimento</label>
            <input id="gf-ajuste-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
        </div>
        {erro && <p role="alert" className="text-sm text-red-700 mt-2">{erro}</p>}
      </Modal>

      <Modal aberto={!!confirmar} aoFechar={() => setConfirmar(null)} titulo={confirmar?.tipo === 'estornar' ? 'Estornar pagamento' : 'Cancelar ocorrência'}
        descricao={confirmar ? `${g.nome} · ${formatarData(confirmar.o.data_vencimento)} · ${formatarMoeda(confirmar.o.valor)}` : undefined}
        rodape={<>
          <button type="button" className={classeBotaoSecundario} onClick={() => setConfirmar(null)}>Voltar</button>
          <button type="button" className={classeBotaoPerigo} disabled={ocupado} onClick={() => {
            if (!confirmar) return;
            const supabase = createClient();
            if (confirmar.tipo === 'estornar') {
              executar(() => plataforma ? supabase.rpc('estornar_pagamento_gasto_plataforma', { p_id: confirmar.o.id }) : supabase.rpc('estornar_baixa_lancamento', { p_id: confirmar.o.id }),
                'Pagamento estornado. A ocorrência voltou a ficar pendente.');
            } else {
              executar(() => plataforma ? supabase.rpc('cancelar_ocorrencia_gasto_plataforma', { p_id: confirmar.o.id }) : supabase.rpc('cancelar_lancamento_financeiro', { p_id: confirmar.o.id }),
                'Ocorrência cancelada.');
            }
          }}>{confirmar?.tipo === 'estornar' ? 'Estornar' : 'Cancelar ocorrência'}</button>
        </>}>
        <p className="text-sm text-gray-700">{confirmar?.tipo === 'estornar' ? 'O pagamento é desfeito e a ocorrência volta a ficar pendente. O histórico é mantido.' : 'A ocorrência deixa de ser cobrada e não será gerada novamente. O histórico é mantido.'}</p>
        {erro && <p role="alert" className="text-sm text-red-700 mt-2">{erro}</p>}
      </Modal>
    </section>
  );
}
