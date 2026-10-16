'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Eye, FileText, Paperclip, Pencil, Receipt, RotateCcw, Tag, Trash2, XCircle, CalendarRange } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import {
  ROTULO_SITUACAO, SELO_SITUACAO, fimDoMes, formatarData, formatarMoeda, hojeBrasil,
  rotuloNatureza, valorParaMascara,
  type Categoria, type ContaFinanceira, type Lancamento, type TipoLancamento,
} from '@/lib/financeiro';
import {
  BarraFiltros, BotaoIcone, BotaoLimparFiltros, CampoBusca, Celula, EstadoTabela, FiltroSelect, Linha, Paginacao, Selo, Tabela, TabelaCard,
} from '@/components/admin/tabela';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { enviarComprovante } from './FormLancamento';
import { ModalBaixa } from './ModalBaixa';
import { IconeCategoria } from './IconeCategoria';

export type ModoLista = 'todos' | 'pagar' | 'receber';

interface Props {
  modo: ModoLista;
  idEmpresa: string;
  periodo: string; // primeiro dia do mês selecionado
  categorias: Categoria[];
  contas: ContaFinanceira[];
  versao: number;
  aoIrParaContas: () => void;
  aoEditar: (l: Lancamento) => void;
  aoAlterar: (mensagem: string) => void;
  categoriaInicial?: string; // vindo de outro módulo (ex.: Saúde Empresarial): abre filtrado, sem limitar ao mês
}

type Acao = { tipo: 'baixa' | 'estorno' | 'cancelar' | 'excluir'; lancamento: Lancamento } | null;

export function ListaLancamentos({ modo, idEmpresa, periodo, categorias, contas, versao, aoIrParaContas, aoEditar, aoAlterar, categoriaInicial }: Props) {
  const tipoFixo: TipoLancamento | null = modo === 'pagar' ? 'despesa' : modo === 'receber' ? 'receita' : null;
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [tipo, setTipo] = useState('');
  const [categoria, setCategoria] = useState(categoriaInicial ?? '');
  const [situacao, setSituacao] = useState(modo === 'todos' ? '' : 'abertas');
  const [doPeriodo, setDoPeriodo] = useState(modo === 'todos' && !categoriaInicial ? 'sim' : 'nao');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [itens, setItens] = useState<Lancamento[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [acao, setAcao] = useState<Acao>(null);
  const [emBaixa, setEmBaixa] = useState<Lancamento | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Lancamento | null>(null);
  const travado = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAplicada(busca.trim());
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  const montarConsulta = useCallback(
    (comContagem: boolean, colunas: '*' | 'valor,tipo' = '*') => {
      let q = createClient()
        .from('lancamentos_financeiros_situacao')
        .select(colunas, comContagem ? { count: 'exact' } : undefined)
        .eq('id_empresa', idEmpresa);
      const t = tipoFixo ?? tipo;
      if (t) q = q.eq('tipo', t);
      if (categoria) q = q.eq('id_categoria', categoria);
      if (situacao === 'abertas') q = q.in('situacao', ['pendente', 'vencido']);
      else if (situacao) q = q.eq('situacao', situacao);
      if (doPeriodo === 'sim') {
        const campoData = modo === 'todos' ? 'data_competencia' : 'data_vencimento';
        q = q.gte(campoData, periodo).lte(campoData, fimDoMes(periodo));
      }
      if (buscaAplicada) {
        const termo = buscaAplicada.replace(/[%,()]/g, ' ');
        q = q.or(`descricao.ilike.%${termo}%,contraparte.ilike.%${termo}%`);
      }
      if (modo === 'receber') return q.order('criado_em', { ascending: false }).order('id', { ascending: false }); // últimas contas a receber criadas no topo (id: desempate estável na paginação)
      return modo === 'todos'
        ? q.order('data_competencia', { ascending: false }).order('criado_em', { ascending: false })
        : q.order('data_vencimento', { ascending: true, nullsFirst: false });
    },
    [idEmpresa, tipoFixo, tipo, categoria, situacao, doPeriodo, periodo, buscaAplicada, modo]
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const inicio = (pagina - 1) * porPagina;
    const { data, error, count } = await montarConsulta(true).range(inicio, inicio + porPagina - 1);
    if (error) setErro(error.message);
    else {
      setItens((data ?? []) as unknown as Lancamento[]);
      setTotal(count ?? 0);
    }
    setCarregando(false);
  }, [montarConsulta, pagina, porPagina]);

  useEffect(() => {
    carregar();
  }, [carregar, versao]);

  // Soma de TODAS as contas que atendem aos filtros (não só da página), em centavos para não acumular erro de ponto flutuante
  const [somaFiltro, setSomaFiltro] = useState<{ receita: number; despesa: number; limitado: boolean } | null>(null);
  useEffect(() => {
    let ativo = true;
    setSomaFiltro(null);
    (async () => {
      let receita = 0, despesa = 0;
      const POR_LOTE = 1000, MAX_LOTES = 10;
      for (let lote = 0; lote < MAX_LOTES; lote++) {
        const { data, error } = await montarConsulta(false, 'valor,tipo').range(lote * POR_LOTE, (lote + 1) * POR_LOTE - 1);
        if (!ativo || error) return;
        for (const l of (data ?? []) as unknown as { valor: number | string; tipo: TipoLancamento }[]) {
          const c = Math.round(Number(l.valor) * 100);
          if (l.tipo === 'receita') receita += c; else despesa += c;
        }
        if ((data ?? []).length < POR_LOTE) return setSomaFiltro({ receita, despesa, limitado: false });
      }
      if (ativo) setSomaFiltro({ receita, despesa, limitado: true });
    })();
    return () => { ativo = false; };
  }, [montarConsulta, versao]);

  const abrirAcao = (tipoAcao: NonNullable<Acao>['tipo'], l: Lancamento) => {
    setErroAcao(null);
    if (tipoAcao === 'baixa') return setEmBaixa(l); // janela única de pagamento (ModalBaixa)
    setAcao({ tipo: tipoAcao, lancamento: l });
  };

  const executar = async () => {
    if (!acao || travado.current) return;
    travado.current = true;
    setProcessando(true);
    setErroAcao(null);
    const supabase = createClient();
    const id = acao.lancamento.id;
    const { error } =
      acao.tipo === 'estorno'
          ? await supabase.rpc('estornar_baixa_lancamento', { p_id: id })
          : acao.tipo === 'cancelar'
            ? await supabase.rpc('cancelar_lancamento_financeiro', { p_id: id })
            : await supabase.rpc('excluir_lancamento_financeiro', { p_id: id });
    travado.current = false;
    setProcessando(false);
    if (error) return setErroAcao(mensagemDeErro(error, 'Não foi possível concluir a ação.'));
    const receita = acao.lancamento.tipo === 'receita';
    const mensagens = {
      baixa: receita ? 'Recebimento registrado.' : 'Pagamento registrado.',
      estorno: 'Baixa estornada. O lançamento voltou a ficar pendente.',
      cancelar: 'Lançamento cancelado.',
      excluir: 'Lançamento excluído.',
    };
    setAcao(null);
    aoAlterar(mensagens[acao.tipo]);
  };

  const exportar = async () => {
    const { data, error } = await montarConsulta(false).limit(5000);
    if (error) return;
    const linhas = [['Tipo', 'Descrição', 'Categoria', 'Cliente/Fornecedor', 'Valor', 'Competência', 'Vencimento', 'Pagamento', 'Situação']];
    for (const l of (data ?? []) as unknown as Lancamento[]) {
      linhas.push([
        l.tipo === 'receita' ? 'Receita' : 'Despesa', l.descricao, l.categoria_nome, l.contraparte ?? '',
        Number(l.valor).toFixed(2).replace('.', ','), formatarData(l.data_competencia), formatarData(l.data_vencimento),
        formatarData(l.data_pagamento), ROTULO_SITUACAO[l.situacao][l.tipo],
      ]);
    }
    const csv = linhas.map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `lancamentos-${periodo.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const temFiltros = busca || tipo || categoria || situacao !== (modo === 'todos' ? '' : 'abertas') || doPeriodo !== (modo === 'todos' ? 'sim' : 'nao');
  const catsVisiveis = categorias.filter((c) => !tipoFixo || c.tipo === tipoFixo);
  const vazio = modo === 'pagar' ? 'Nenhuma conta a pagar encontrada.' : modo === 'receber' ? 'Nenhuma conta a receber encontrada.' : 'Nenhum lançamento encontrado neste período.';

  return (
    <TabelaCard>
      <BarraFiltros>
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por descrição, cliente ou fornecedor" />
        {!tipoFixo && (
          <FiltroSelect icone={FileText} valor={tipo} aoMudar={(v) => { setTipo(v); setPagina(1); }}>
            <option value="">Receitas e despesas</option>
            <option value="receita">Receitas</option>
            <option value="despesa">Despesas</option>
          </FiltroSelect>
        )}
        <FiltroSelect icone={Tag} valor={categoria} aoMudar={(v) => { setCategoria(v); setPagina(1); }}>
          <option value="">Todas as categorias</option>
          {catsVisiveis.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </FiltroSelect>
        <FiltroSelect valor={situacao} aoMudar={(v) => { setSituacao(v); setPagina(1); }}>
          <option value="">Todas as situações</option>
          <option value="abertas">Em aberto</option>
          <option value="vencido">Vencidas</option>
          <option value="pago">{modo === 'receber' ? 'Recebidas' : modo === 'pagar' ? 'Pagas' : 'Pagas/recebidas'}</option>
          <option value="cancelado">Canceladas</option>
        </FiltroSelect>
        <FiltroSelect icone={CalendarRange} valor={doPeriodo} aoMudar={(v) => { setDoPeriodo(v); setPagina(1); }}>
          <option value="sim">{modo === 'todos' ? 'Competência no mês' : 'Vencimento no mês'}</option>
          <option value="nao">Qualquer data</option>
        </FiltroSelect>
        {temFiltros && (
          <BotaoLimparFiltros
            aoClicar={() => {
              setBusca('');
              setTipo('');
              setCategoria('');
              setSituacao(modo === 'todos' ? '' : 'abertas');
              setDoPeriodo(modo === 'todos' ? 'sim' : 'nao');
              setPagina(1);
            }}
          />
        )}
        {modo === 'todos' && (
          <button type="button" onClick={exportar} className={`${classeBotaoSecundario} sm:ml-auto`}>
            <Download className="w-4 h-4" aria-hidden="true" />
            Exportar CSV
          </button>
        )}
      </BarraFiltros>

      <EstadoTabela carregando={carregando} erro={erro} vazio={itens.length === 0} mensagemVazio={vazio}>
        <Tabela
          colunas={[
            { titulo: 'Descrição' },
            { titulo: modo === 'receber' ? 'Cliente' : modo === 'pagar' ? 'Fornecedor' : 'Categoria' },
            { titulo: 'Valor', alinhar: 'direita' },
            { titulo: modo === 'todos' ? 'Competência' : 'Vencimento' },
            { titulo: 'Situação', alinhar: 'centro' },
            { titulo: 'Ações' },
          ]}
        >
          {itens.map((l) => {
            const aberto = l.situacao === 'pendente' || l.situacao === 'vencido';
            return (
              <Linha key={l.id}>
                <Celula>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 break-words">{l.descricao}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                      <IconeCategoria icone={l.categoria_icone} cor={l.categoria_cor} tamanho="sm" />
                      {l.tipo === 'receita' ? 'Receita' : 'Despesa'} · {l.categoria_nome}
                      {l.qtd_anexos > 0 && (
                        <span className="inline-flex items-center gap-0.5" title="Tem comprovante">
                          <Paperclip className="w-3 h-3" aria-hidden="true" />
                          <span className="sr-only">com comprovante</span>
                          {l.qtd_anexos}
                        </span>
                      )}
                    </p>
                    {l.natureza_financeira && l.natureza_financeira !== 'operacional' && (
                      <span className="mt-1 inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700" data-testid={`natureza-${l.descricao}`}>
                        {rotuloNatureza(l.tipo, l.natureza_financeira)}
                      </span>
                    )}
                  </div>
                </Celula>
                <Celula>{modo === 'todos' ? l.categoria_nome : l.contraparte || '—'}</Celula>
                <Celula alinhar="direita">
                  <span className={`font-semibold whitespace-nowrap ${l.tipo === 'receita' ? 'text-green-700' : 'text-red-700'}`}>
                    {l.tipo === 'despesa' ? '− ' : ''}
                    {formatarMoeda(l.valor)}
                  </span>
                </Celula>
                <Celula>{formatarData(modo === 'todos' ? l.data_competencia : l.data_vencimento)}</Celula>
                <Celula alinhar="centro">
                  <Selo tipo={SELO_SITUACAO[l.situacao]} texto={ROTULO_SITUACAO[l.situacao][l.tipo]} />
                </Celula>
                <Celula>
                  <div className="flex flex-wrap items-center justify-end gap-2 min-[85rem]:gap-1.5">
                    {aberto && (
                      <button type="button" onClick={() => abrirAcao('baixa', l)} className="min-h-11 min-[85rem]:min-h-8 px-3 rounded-lg bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100">
                        {l.tipo === 'receita' ? 'Receber' : 'Pagar'}
                      </button>
                    )}
                    <BotaoIcone icone={Eye} titulo={`Detalhes de ${l.descricao}`} aoClicar={() => setDetalhe(l)} />
                    {l.status !== 'cancelado' && <BotaoIcone icone={Pencil} titulo={`Editar ${l.descricao}`} aoClicar={() => aoEditar(l)} />}
                    {l.status === 'pago' && <BotaoIcone icone={Receipt} titulo={`${l.tipo === 'receita' ? 'Emitir recibo' : 'Emitir comprovante'} de ${l.descricao}`} aoClicar={() => window.location.assign(`/app/recibos?lancamento=${l.id}`)} />}
                    {l.status === 'pago' && <BotaoIcone icone={RotateCcw} titulo={`Estornar ${l.descricao}`} aoClicar={() => abrirAcao('estorno', l)} />}
                    {aberto && <BotaoIcone icone={XCircle} titulo={`Cancelar ${l.descricao}`} aoClicar={() => abrirAcao('cancelar', l)} />}
                    <BotaoIcone icone={Trash2} titulo={`Excluir ${l.descricao}`} aoClicar={() => abrirAcao('excluir', l)} />
                  </div>
                </Celula>
              </Linha>
            );
          })}
        </Tabela>
        {somaFiltro && itens.length > 0 && (
          <p className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1 text-sm text-gray-600" data-testid="total-filtro">
            {modo === 'todos' ? (
              <>
                <span>Receitas: <strong className="text-green-700">{formatarMoeda(somaFiltro.receita / 100)}</strong></span>
                <span>Despesas: <strong className="text-red-700">{formatarMoeda(somaFiltro.despesa / 100)}</strong></span>
                <span>Saldo: <strong className={`text-base ${somaFiltro.receita >= somaFiltro.despesa ? 'text-green-700' : 'text-red-700'}`}>{formatarMoeda((somaFiltro.receita - somaFiltro.despesa) / 100)}</strong></span>
              </>
            ) : (
              <>
                <span>{modo === 'receber' ? 'Total a receber' : 'Total a pagar'}{total > 0 ? ` (${total} ${total === 1 ? 'conta' : 'contas'})` : ''}:</span>
                <strong className={`text-base ${modo === 'receber' ? 'text-green-700' : 'text-red-700'}`}>{formatarMoeda((modo === 'receber' ? somaFiltro.receita : somaFiltro.despesa) / 100)}</strong>
              </>
            )}
            {somaFiltro.limitado && <span className="text-xs text-amber-700">soma das primeiras 10.000 contas</span>}
          </p>
        )}
        <Paginacao pagina={pagina} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={setPorPagina} total={total} />
      </EstadoTabela>

      <Modal
        aberto={!!acao}
        aoFechar={() => setAcao(null)}
        titulo={
          acao?.tipo === 'baixa'
            ? acao.lancamento.tipo === 'receita' ? 'Registrar recebimento' : 'Registrar pagamento'
            : acao?.tipo === 'estorno' ? 'Estornar baixa' : acao?.tipo === 'cancelar' ? 'Cancelar lançamento' : 'Excluir lançamento'
        }
        descricao={acao ? `${acao.lancamento.descricao} · ${formatarMoeda(acao.lancamento.valor)}` : undefined}
        rodape={
          <>
            <button type="button" className={classeBotaoSecundario} onClick={() => setAcao(null)}>
              Voltar
            </button>
            <button type="button" disabled={processando} onClick={executar} className={acao?.tipo === 'baixa' ? classeBotaoPrimario : classeBotaoPerigo}>
              {processando ? 'Processando...' : acao?.tipo === 'baixa' ? 'Confirmar' : acao?.tipo === 'estorno' ? 'Estornar' : acao?.tipo === 'cancelar' ? 'Cancelar lançamento' : 'Excluir'}
            </button>
          </>
        }
      >
        {acao?.tipo === 'estorno' && <p className="text-sm text-gray-700">O lançamento volta a ficar pendente e deixa de contar nos valores realizados.</p>}
        {acao?.tipo === 'cancelar' && <p className="text-sm text-gray-700">O lançamento fica registrado como cancelado e não entra nos indicadores.</p>}
        {acao?.tipo === 'excluir' && <p className="text-sm text-gray-700">O lançamento sai das listas e dos indicadores. O registro fica guardado no histórico.</p>}
        {erroAcao && (
          <p role="alert" className="text-sm text-red-700 mt-3">
            {erroAcao}
          </p>
        )}
      </Modal>

      <ModalBaixa
        lancamento={emBaixa}
        idEmpresa={idEmpresa}
        contas={contas}
        aoFechar={() => setEmBaixa(null)}
        aoConcluir={(m) => { setEmBaixa(null); aoAlterar(m); }}
        aoIrParaContas={aoIrParaContas}
      />

      <DetalhesLancamento lancamento={detalhe} idEmpresa={idEmpresa} aoFechar={() => setDetalhe(null)} aoAlterar={aoAlterar} />
    </TabelaCard>
  );
}

const ROTULO_ACAO: Record<string, string> = {
  criado: 'Criado', editado: 'Editado', baixado: 'Baixa registrada', estornado: 'Baixa estornada', cancelado: 'Cancelado',
  excluido: 'Excluído', anexo_adicionado: 'Comprovante anexado', anexo_removido: 'Comprovante removido',
};

interface Anexo {
  id: string;
  caminho: string;
  nome_arquivo: string;
  tamanho: number;
}

function DetalhesLancamento({ lancamento, idEmpresa, aoFechar, aoAlterar }: { lancamento: Lancamento | null; idEmpresa: string; aoFechar: () => void; aoAlterar: (m: string) => void }) {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [historico, setHistorico] = useState<{ acao: string; criado_em: string }[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!lancamento) return;
    const supabase = createClient();
    const [{ data: a }, { data: h }] = await Promise.all([
      supabase.from('anexos_financeiros').select('id, caminho, nome_arquivo, tamanho').eq('id_lancamento', lancamento.id).order('criado_em'),
      supabase.from('historico_lancamentos_financeiros').select('acao, criado_em').eq('id_lancamento', lancamento.id).order('criado_em', { ascending: false }).limit(20),
    ]);
    setAnexos((a ?? []) as Anexo[]);
    setHistorico(h ?? []);
  }, [lancamento]);

  useEffect(() => {
    setErro(null);
    carregar();
  }, [carregar]);

  const baixar = async (anexo: Anexo) => {
    const { data, error } = await createClient().storage.from('comprovantes-financeiros').createSignedUrl(anexo.caminho, 60, { download: anexo.nome_arquivo });
    if (error || !data) return setErro('Você não tem acesso a este comprovante.');
    window.location.assign(data.signedUrl);
  };

  const remover = async (anexo: Anexo) => {
    const supabase = createClient();
    const { data: caminho, error } = await supabase.rpc('remover_anexo_financeiro', { p_id: anexo.id });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível remover.'));
    await supabase.storage.from('comprovantes-financeiros').remove([caminho as string]);
    await carregar();
    aoAlterar('Comprovante removido.');
  };

  const anexar = async (arquivo: File) => {
    if (!lancamento) return;
    setEnviando(true);
    setErro(null);
    const falha = await enviarComprovante(idEmpresa, lancamento.id, arquivo);
    setEnviando(false);
    if (falha) return setErro(falha);
    await carregar();
    aoAlterar('Comprovante anexado.');
  };

  const l = lancamento;
  return (
    <Modal aberto={!!l} aoFechar={aoFechar} titulo="Detalhes do lançamento" rodape={<button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Fechar</button>}>
      {l && (
        <div className="space-y-5 text-sm">
          <div>
            <p className="font-bold text-gray-900 text-base break-words">{l.descricao}</p>
            <p className="text-gray-500">{l.tipo === 'receita' ? 'Receita' : 'Despesa'}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div><dt className="text-gray-500">Valor</dt><dd className="font-semibold text-gray-900">{formatarMoeda(l.valor)}</dd></div>
            <div><dt className="text-gray-500">Categoria</dt><dd className="text-gray-900 flex items-center gap-1.5"><IconeCategoria icone={l.categoria_icone} cor={l.categoria_cor} tamanho="sm" />{l.categoria_nome}</dd></div>
            <div><dt className="text-gray-500">{l.tipo === 'receita' ? 'Cliente' : 'Fornecedor'}</dt><dd className="text-gray-900 break-words">{l.contraparte || '—'}</dd></div>
            <div><dt className="text-gray-500">Situação</dt><dd><Selo tipo={SELO_SITUACAO[l.situacao]} texto={ROTULO_SITUACAO[l.situacao][l.tipo]} /></dd></div>
            <div><dt className="text-gray-500">Competência</dt><dd className="text-gray-900">{formatarData(l.data_competencia)}</dd></div>
            <div><dt className="text-gray-500">Vencimento</dt><dd className="text-gray-900">{formatarData(l.data_vencimento)}</dd></div>
            <div><dt className="text-gray-500">{l.tipo === 'receita' ? 'Recebido em' : 'Pago em'}</dt><dd className="text-gray-900">{formatarData(l.data_pagamento)}</dd></div>
            <div><dt className="text-gray-500">Conta</dt><dd className="text-gray-900">{l.conta_nome ?? '—'}</dd></div>
          </dl>
          {l.observacoes && <p className="text-gray-700 whitespace-pre-line">{l.observacoes}</p>}

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Comprovantes</h3>
            {anexos.length === 0 ? (
              <p className="text-gray-500">Nenhum comprovante anexado.</p>
            ) : (
              <ul className="space-y-2">
                {anexos.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2">
                    <FileText className="w-5 h-5 text-orange-600 shrink-0" aria-hidden="true" />
                    <span className="flex-1 min-w-0 truncate">{a.nome_arquivo}</span>
                    <span className="text-xs text-gray-500 shrink-0">{Math.max(1, Math.round(a.tamanho / 1024))} KB</span>
                    <BotaoIcone icone={Download} titulo={`Baixar ${a.nome_arquivo}`} aoClicar={() => baixar(a)} />
                    <BotaoIcone icone={Trash2} titulo={`Remover ${a.nome_arquivo}`} aoClicar={() => remover(a)} />
                  </li>
                ))}
              </ul>
            )}
            <label htmlFor="detalhe-arquivo" className={`${classeBotaoSecundario} mt-3 cursor-pointer`}>
              <Paperclip className="w-4 h-4" aria-hidden="true" />
              {enviando ? 'Enviando...' : 'Anexar comprovante'}
            </label>
            <input id="detalhe-arquivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" disabled={enviando} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) anexar(f); }} />
            {erro && <p role="alert" className="text-red-700 mt-2">{erro}</p>}
          </div>

          {historico.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Histórico</h3>
              <ul className="space-y-1 text-gray-600">
                {historico.map((h, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                    {ROTULO_ACAO[h.acao] ?? h.acao} · {new Date(h.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
