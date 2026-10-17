'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Plus, RotateCcw, Send, Trash2, Upload, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, formatarMoeda, mascaraMoeda, paraDecimal, valorParaMascara, type ContaFinanceira } from '@/lib/financeiro';
import {
  CATEGORIAS_DEVOLUCAO, ROTULO_CATEGORIA_DOC, TIPOS_OCORRENCIA, abrirArquivoFolha, competenciaCurta, dataHora, enviarArquivoFolha, matricula,
  type CategoriaDocumento, type DocumentoFolha, type Ocorrencia, type PainelFolha, type ValorFolha,
} from '@/lib/folha-pagamento';
import type { LinhaFolha } from '@/lib/funcionarios';
import { Selo } from '@/components/admin/tabela';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { ModalPagamentoFolha } from '@/components/funcionarios/Modais';
import { ModalBaixa, type LancamentoParaBaixa } from '@/components/financeiro/ModalBaixa';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
const area = 'w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const cartao = 'bg-white rounded-2xl border border-gray-200 p-4 sm:p-5';
type Executar = (acao: () => PromiseLike<{ error: { message?: string; code?: string } | null }>, sucesso: string, padrao: string) => Promise<boolean>;

function Erro({ texto }: { texto: string | null }) {
  return texto ? <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{texto}</p> : null;
}
function useExecutar(aoAlterar: (m: string) => Promise<void> | void): [Executar, boolean, string | null, (e: string | null) => void] {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const executar: Executar = async (acao, sucesso, padrao) => {
    setOcupado(true); setErro(null);
    const { error } = await acao();
    setOcupado(false);
    if (error) { setErro(mensagemDeErro(error, padrao)); return false; }
    await aoAlterar(sucesso);
    return true;
  };
  return [executar, ocupado, erro, setErro];
}

// ===== Envio consolidado (empresa) =====
export function EnvioFolha({ painel, ocorrencias, idEmpresa, competencia, nomeUsuario, aoAlterar }: {
  painel: PainelFolha; ocorrencias: Ocorrencia[]; idEmpresa: string; competencia: string; nomeUsuario: string; aoAlterar: (m: string) => Promise<void> | void;
}) {
  const [aberto, setAberto] = useState(false);
  const [responsavel, setResponsavel] = useState(nomeUsuario);
  const [observacoes, setObservacoes] = useState('');
  const [confirmo, setConfirmo] = useState(false);
  const [executar, ocupado, erro, setErro] = useExecutar(async (m) => { setAberto(false); await aoAlterar(m); });
  const total = painel.funcionarios.length;
  const aptos = painel.funcionarios.filter((f) => f.situacao === 'apto').length;
  const pronto = total > 0 && aptos === total && painel.contador_habilitado;
  const porTipo = Object.entries(ocorrencias.reduce<Record<string, number>>((a, o) => ({ ...a, [o.tipo]: (a[o.tipo] ?? 0) + 1 }), {}));
  const correcao = painel.competencia?.status === 'correcao_solicitada';
  const motivo = !painel.contador_habilitado ? 'Nenhum contador com vínculo ativo e as permissões “Ver folha de pagamento” e “Processar folha de pagamento”. Libere em Meu contador.'
    : total === 0 ? 'Não há funcionários nesta competência.' : aptos < total ? `Faltam ${total - aptos} de ${total} funcionário(s) ficarem aptos.` : null;
  return (
    <section className={cartao} aria-labelledby="titulo-envio">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 id="titulo-envio" className="text-base font-bold text-gray-900">{correcao ? 'Reenviar folha corrigida' : 'Enviar folha ao contador'}</h2>
          <p className="text-sm text-gray-600">{motivo ?? `Todos os ${total} funcionários estão aptos. ${correcao ? `O reenvio cria a versão ${(painel.competencia?.versao_atual ?? 0) + 1}.` : 'Revise o resumo e envie.'}`}</p>
        </div>
        <button type="button" className={classeBotaoPrimario} disabled={!pronto} onClick={() => { setConfirmo(false); setErro(null); setAberto(true); }}>
          <Send className="w-4 h-4" aria-hidden="true" />{correcao ? 'Reenviar ao contador' : 'Enviar folha ao contador'}
        </button>
      </div>
      <Modal aberto={aberto} aoFechar={() => setAberto(false)} titulo="Enviar folha ao contador" descricao={`Competência ${competenciaCurta(competencia)} · versão ${(painel.competencia?.versao_atual ?? 0) + 1}`} tamanho="lg"
        rodape={<><button type="button" className={classeBotaoSecundario} onClick={() => setAberto(false)}>Cancelar</button>
          <button type="button" className={classeBotaoPrimario} disabled={ocupado || !confirmo}
            onClick={() => executar(() => createClient().rpc('enviar_folha_contador', { p_id_empresa: idEmpresa, p_competencia: competencia, p_responsavel: responsavel, p_observacoes: observacoes.trim() || null, p_confirmo: confirmo }),
              'Folha enviada ao contador.', 'Não foi possível enviar a folha.')}>{ocupado ? 'Enviando...' : 'Confirmar envio'}</button></>}>
        <div className="space-y-4">
          <Erro texto={erro} />
          <div className="rounded-xl bg-gray-50 p-4 text-sm space-y-1" data-testid="resumo-envio">
            <p><span className="font-semibold">{total}</span> funcionário(s), todos aptos.</p>
            <p><span className="font-semibold">{ocorrencias.length}</span> ocorrência(s){porTipo.length > 0 ? `: ${porTipo.map(([t, n]) => `${TIPOS_OCORRENCIA[t as keyof typeof TIPOS_OCORRENCIA].rotulo} (${n})`).join(', ')}` : ''}.</p>
            <p>{painel.funcionarios.filter((f) => f.conferencia?.sem_ocorrencias).length} confirmado(s) sem ocorrências.</p>
            <p className="text-gray-600">Depois do envio a competência fica bloqueada; correções geram uma nova versão.</p>
          </div>
          <div><label htmlFor="env-resp" className={rotulo}>Responsável pelo envio *</label>
            <input id="env-resp" className={campo} maxLength={120} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} /></div>
          <div><label htmlFor="env-obs" className={rotulo}>Observações para o contador</label>
            <textarea id="env-obs" rows={3} maxLength={1000} className={area} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} /></div>
          <label className="flex items-start gap-2 text-sm text-gray-800">
            <input type="checkbox" className="mt-1 w-4 h-4 accent-orange-600" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
            Confirmo que conferi as informações e autorizo o envio ao contador.
          </label>
        </div>
      </Modal>
    </section>
  );
}

// ===== Documentos e valores de uma devolução (leitura) =====
function DocumentosDevolucao({ documentos, painel, aoErro, aoRemover }: {
  documentos: DocumentoFolha[]; painel: PainelFolha; aoErro: (e: string) => void; aoRemover?: (d: DocumentoFolha) => void;
}) {
  const nome = (id: string | null) => painel.funcionarios.find((f) => f.id === id)?.nome ?? '';
  if (documentos.length === 0) return <p className="text-sm text-gray-600">Nenhum documento anexado.</p>;
  return (
    <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
      {documentos.map((d) => (
        <li key={d.id} data-testid="documento-devolucao" className="flex items-center gap-3 px-3 py-2 text-sm min-w-0 first:rounded-t-xl last:rounded-b-xl transition-colors motion-reduce:transition-none hover:bg-orange-50 focus-within:bg-orange-50">
          <FileText className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <button type="button" className="font-semibold text-gray-900 underline truncate block max-w-full text-left" onClick={async () => { const e = await abrirArquivoFolha(d.caminho, d.nome_arquivo); if (e) aoErro(e); }}>{d.nome_arquivo}</button>
            <p className="text-xs text-gray-500">{ROTULO_CATEGORIA_DOC[d.categoria]}{d.id_funcionario ? ` · ${nome(d.id_funcionario)}` : ''}</p>
          </div>
          {aoRemover && <button type="button" aria-label={`Remover ${d.nome_arquivo}`} className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50" onClick={() => aoRemover(d)}>
            <Trash2 className="w-4 h-4" aria-hidden="true" /></button>}
        </li>
      ))}
    </ul>
  );
}

function ValoresDevolucao({ valores, painel }: { valores: ValorFolha[]; painel: PainelFolha }) {
  const liquidos = valores.filter((v) => v.tipo === 'liquido');
  const encargos = valores.filter((v) => v.tipo === 'encargo');
  const nome = (id: string | null) => painel.funcionarios.find((f) => f.id === id)?.nome ?? '—';
  return (
    <div className="grid lg:grid-cols-2 gap-4 text-sm">
      <div>
        <p className="font-semibold text-gray-900 mb-1">Líquidos por funcionário</p>
        {liquidos.length === 0 ? <p className="text-gray-600">Não informados.</p> : (
          <ul className="border border-gray-100 rounded-xl divide-y divide-gray-100">
            {liquidos.map((v) => <li key={v.id} className="flex justify-between gap-2 px-3 py-2"><span className="truncate">{nome(v.id_funcionario)}</span><span className="font-semibold">{formatarMoeda(v.valor)}</span></li>)}
            <li className="flex justify-between gap-2 px-3 py-2 bg-gray-50"><span className="font-semibold">Total líquido</span><span className="font-bold">{formatarMoeda(liquidos.reduce((t, v) => t + Number(v.valor), 0))}</span></li>
          </ul>
        )}
      </div>
      <div>
        <p className="font-semibold text-gray-900 mb-1">Encargos e guias</p>
        {encargos.length === 0 ? <p className="text-gray-600">Nenhum encargo informado.</p> : (
          <ul className="border border-gray-100 rounded-xl divide-y divide-gray-100">
            {encargos.map((v) => <li key={v.id} className="flex justify-between gap-2 px-3 py-2"><span className="truncate">{v.descricao} · vence {formatarData(v.vencimento)}</span><span className="font-semibold">{formatarMoeda(v.valor)}</span></li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

// ===== Empresa: decisão sobre a devolução =====
export function DecisaoEmpresa({ painel, documentos, valores, aoAlterar }: {
  painel: PainelFolha; documentos: DocumentoFolha[]; valores: ValorFolha[]; aoAlterar: (m: string) => Promise<void> | void;
}) {
  const [modal, setModal] = useState<'aprovar' | 'revisao' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [executar, ocupado, erro, setErro] = useExecutar(async (m) => { setModal(null); await aoAlterar(m); });
  const dev = painel.devolucao!;
  const comp = painel.competencia!;
  return (
    <section className={`${cartao} space-y-4`} aria-labelledby="titulo-decisao">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 id="titulo-decisao" className="text-base font-bold text-gray-900">Folha processada pelo contador</h2>
          <p className="text-sm text-gray-600">Versão {comp.versao_atual} · devolução {dev.numero} · recebida em {dataHora(dev.enviada_em)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={classeBotaoSecundario} onClick={() => { setErro(null); setMotivo(''); setModal('revisao'); }}><RotateCcw className="w-4 h-4" aria-hidden="true" />Solicitar revisão</button>
          <button type="button" className={classeBotaoPrimario} onClick={() => { setErro(null); setModal('aprovar'); }}><CheckCircle2 className="w-4 h-4" aria-hidden="true" />Aprovar folha</button>
        </div>
      </div>
      {dev.observacoes && <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">Contador: {dev.observacoes}</p>}
      <Erro texto={erro && !modal ? erro : null} />
      <DocumentosDevolucao documentos={documentos} painel={painel} aoErro={setErro} />
      <ValoresDevolucao valores={valores} painel={painel} />
      <Modal aberto={modal === 'aprovar'} aoFechar={() => setModal(null)} titulo="Aprovar folha" descricao={`Versão ${comp.versao_atual}, devolução ${dev.numero}`}
        rodape={<><button type="button" className={classeBotaoSecundario} onClick={() => setModal(null)}>Cancelar</button>
          <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={() => executar(() => createClient().rpc('aprovar_folha', { p_id_competencia: comp.id, p_id_devolucao: dev.id }), 'Folha aprovada e lançada no Financeiro.', 'Não foi possível aprovar.')}>
            {ocupado ? 'Aprovando...' : 'Aprovar'}</button></>}>
        <div className="space-y-3 text-sm text-gray-700"><Erro texto={erro} />
          <p>Ao aprovar, os salários passam a valer o líquido informado e os encargos viram contas a pagar no Financeiro (uma única vez). Nenhuma transferência é feita.</p>
          <p>Sua identidade, a data/hora e a versão ficam registradas.</p></div>
      </Modal>
      <Modal aberto={modal === 'revisao'} aoFechar={() => setModal(null)} titulo="Solicitar revisão ao contador"
        rodape={<><button type="button" className={classeBotaoSecundario} onClick={() => setModal(null)}>Cancelar</button>
          <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={() => executar(() => createClient().rpc('solicitar_revisao_folha', { p_id_competencia: comp.id, p_id_devolucao: dev.id, p_motivo: motivo }), 'Revisão solicitada ao contador.', 'Não foi possível solicitar.')}>
            {ocupado ? 'Enviando...' : 'Solicitar revisão'}</button></>}>
        <div className="space-y-3"><Erro texto={erro} />
          <label htmlFor="rev-motivo" className={rotulo}>O que precisa ser revisado? *</label>
          <textarea id="rev-motivo" rows={4} maxLength={1000} className={area} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
      </Modal>
    </section>
  );
}

// ===== Empresa: pagamento depois da aprovação (baixa pelas funções existentes; comprovante anexado no próprio pagamento) =====
export function PagamentoFolha({ painel, documentos, valores, idEmpresa, hoje, aoAlterar }: {
  painel: PainelFolha; documentos: DocumentoFolha[]; valores: ValorFolha[]; idEmpresa: string; hoje: string; aoAlterar: (m: string) => Promise<void> | void;
}) {
  const [contas, setContas] = useState<ContaFinanceira[]>([]);
  const [pagandoSalario, setPagandoSalario] = useState<LinhaFolha | null>(null);
  const [pagandoEncargo, setPagandoEncargo] = useState<LancamentoParaBaixa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    createClient().from('contas_financeiras_saldo').select('id, nome, instituicao, tipo, saldo_inicial, data_saldo_inicial, principal, permite_saldo_negativo, arquivada_em, saldo, cor')
      .eq('id_empresa', idEmpresa).order('nome').then(({ data }) => setContas((data ?? []) as ContaFinanceira[]));
  }, [idEmpresa]);
  const pag = painel.pagamento!;
  const nome = (id: string) => painel.funcionarios.find((f) => f.id === id)?.nome ?? '—';
  const concluir = async (m: string) => { setPagandoSalario(null); setPagandoEncargo(null); await aoAlterar(m); };
  const dev = painel.devolucao;
  return (
    <section className={`${cartao} space-y-4`} aria-labelledby="titulo-pagamento">
      <div>
        <h2 id="titulo-pagamento" className="text-base font-bold text-gray-900">Pagamento</h2>
        <p className="text-sm text-gray-600">Folha aprovada{dev?.aprovada_por ? ` por ${dev.aprovada_por}` : ''} em {dataHora(dev?.aprovada_em)}. Registre os pagamentos já feitos (o sistema não faz transferências).</p>
      </div>
      <Erro texto={erro} />
      <div className="grid lg:grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Salários (líquido)</p>
          <ul className="border border-gray-100 rounded-xl divide-y divide-gray-100 text-sm">
            {pag.salarios.map((s) => {
              const pago = s.pendente != null && Number(s.pendente) === 0;
              return (
                <li key={s.id_funcionario} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="flex-1 min-w-0 truncate">{nome(s.id_funcionario)}</span>
                  <span className="font-semibold">{formatarMoeda(s.liquido)}</span>
                  {pago ? <Selo tipo="sucesso" texto="Pago" /> : s.id_folha ? (
                    <button type="button" className="min-h-9 px-3 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50"
                      onClick={() => setPagandoSalario({ id_folha: s.id_folha!, nome: nome(s.id_funcionario), pendente: Number(s.pendente ?? 0) } as LinhaFolha)}>Registrar pagamento</button>
                  ) : <Selo tipo="neutro" texto="Sem previsão" />}
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Encargos</p>
          {pag.encargos.length === 0 ? <p className="text-sm text-gray-600">Nenhum encargo informado.</p> : (
            <ul className="border border-gray-100 rounded-xl divide-y divide-gray-100 text-sm">
              {pag.encargos.map((e) => (
                <li key={e.id_valor} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="flex-1 min-w-0 truncate">{e.descricao} · vence {formatarData(e.vencimento)}</span>
                  <span className="font-semibold">{formatarMoeda(e.valor)}</span>
                  {e.status === 'pago' ? <Selo tipo="sucesso" texto="Pago" /> : e.id_lancamento ? (
                    <button type="button" className="min-h-9 px-3 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50"
                      onClick={() => setPagandoEncargo({ id: e.id_lancamento!, tipo: 'despesa', descricao: e.descricao, valor: Number(e.valor) })}>Registrar pagamento</button>
                  ) : <Selo tipo="neutro" texto="—" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <details className="text-sm"><summary className="cursor-pointer font-semibold text-gray-800 min-h-11 flex items-center">Documentos da folha aprovada</summary>
        <div className="mt-2 space-y-3"><DocumentosDevolucao documentos={documentos} painel={painel} aoErro={setErro} /><ValoresDevolucao valores={valores} painel={painel} /></div>
      </details>
      <ModalPagamentoFolha linha={pagandoSalario} aoFechar={() => setPagandoSalario(null)} idEmpresa={idEmpresa} contas={contas} hoje={hoje} aoConcluir={concluir} />
      <ModalBaixa lancamento={pagandoEncargo} idEmpresa={idEmpresa} contas={contas} aoFechar={() => setPagandoEncargo(null)} aoConcluir={concluir}
        aoIrParaContas={() => { window.location.href = '/app/financeiro'; }} />
    </section>
  );
}

// ===== Contador: receber, corrigir, processar e devolver =====
export function ProcessamentoContador({ painel, documentos, valores, idEmpresa, aoAlterar }: {
  painel: PainelFolha; documentos: DocumentoFolha[]; valores: ValorFolha[]; idEmpresa: string; aoAlterar: (m: string) => Promise<void> | void;
}) {
  const comp = painel.competencia!;
  const [modal, setModal] = useState<'correcao' | 'concluir' | null>(null);
  const [mensagem, setMensagem] = useState('');
  const [itens, setItens] = useState<Record<string, string>>({});
  const [categoria, setCategoria] = useState<Exclude<CategoriaDocumento, 'anexo_ocorrencia' | 'comprovante'>>('holerite');
  const [funcionario, setFuncionario] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [liquidos, setLiquidos] = useState<Record<string, string>>({});
  const [encargos, setEncargos] = useState<{ descricao: string; valor: string; vencimento: string }[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const [chaveArquivo, setChaveArquivo] = useState(0);
  const [executar, ocupado, erro, setErro] = useExecutar(async (m) => { setModal(null); await aoAlterar(m); });

  const rascunho = painel.devolucao?.situacao === 'rascunho' ? painel.devolucao : null;
  const valoresRascunho = rascunho ? valores.filter((v) => v.id_devolucao === rascunho.id) : [];
  const assinatura = valoresRascunho.map((v) => `${v.id}:${v.valor}`).join('|');
  useEffect(() => {
    setLiquidos(Object.fromEntries(valoresRascunho.filter((v) => v.tipo === 'liquido').map((v) => [v.id_funcionario!, valorParaMascara(Number(v.valor))])));
    setEncargos(valoresRascunho.filter((v) => v.tipo === 'encargo').map((v) => ({ descricao: v.descricao ?? '', valor: valorParaMascara(Number(v.valor)), vencimento: v.vencimento ?? '' })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura]);
  // Em processamento sem rascunho (iniciado antes da 059): abre o rascunho já com o que foi devolvido antes
  const precisaAbrir = painel.pode_processar && comp.status === 'em_processamento' && painel.devolucao?.situacao !== 'rascunho';
  useEffect(() => {
    if (!precisaAbrir) return;
    createClient().rpc('abrir_devolucao_folha', { p_id_competencia: comp.id }).then(({ error }) => { if (!error) aoAlterar(''); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precisaAbrir, comp.id]);

  if (!painel.pode_processar) return (
    <section className={cartao}><p className="text-sm text-gray-700">Você pode visualizar a folha. Para processar, a empresa precisa liberar “Processar folha de pagamento” no seu vínculo.</p></section>
  );
  const status = comp.status;
  const docsRascunho = rascunho ? documentos.filter((d) => d.id_devolucao === rascunho.id) : [];
  const holerites = new Set(docsRascunho.filter((d) => d.categoria === 'holerite').map((d) => d.id_funcionario));

  // O botão "Anexar documento" abre a escolha do arquivo e envia assim que ele é escolhido
  const escolherArquivo = () => {
    if (categoria === 'holerite' && !funcionario) return setErro('Escolha o funcionário do holerite.');
    setErro(null);
    document.getElementById('dev-arq')?.click();
  };
  const enviarDocumento = async (escolhido: File | null) => {
    setChaveArquivo((k) => k + 1);
    if (!escolhido) return;
    if (categoria === 'holerite' && !funcionario) return setErro('Escolha o funcionário do holerite.');
    setArquivo(escolhido); setErro(null);
    const falha = await enviarArquivoFolha(idEmpresa, escolhido, async (caminho) => createClient().rpc('registrar_documento_devolucao_folha', {
      p_id_competencia: comp.id, p_categoria: categoria, p_id_funcionario: categoria === 'holerite' ? funcionario : null, p_caminho: caminho, p_nome_arquivo: escolhido.name }));
    setArquivo(null);
    if (falha) return setErro(falha);
    // Holerite: já deixa selecionado o próximo funcionário que ainda não tem holerite
    if (categoria === 'holerite') {
      const proximo = painel.funcionarios.find((f) => f.id !== funcionario && !holerites.has(f.id));
      setFuncionario(proximo?.id ?? '');
    }
    await aoAlterar(categoria === 'holerite' ? 'Holerite anexado.' : 'Documento anexado.');
  };
  const salvarValores = () => {
    const l = Object.entries(liquidos).filter(([, v]) => v).map(([id_funcionario, v]) => ({ id_funcionario, valor: paraDecimal(v) ?? '0' }));
    const e = encargos.filter((x) => x.descricao || x.valor).map((x) => ({ descricao: x.descricao, valor: paraDecimal(x.valor), vencimento: x.vencimento || null }));
    return executar(() => createClient().rpc('informar_valores_folha', { p_id_competencia: comp.id, p_liquidos: l, p_encargos: e }), 'Valores salvos.', 'Não foi possível salvar os valores.');
  };

  return (
    <section className={`${cartao} space-y-4`} aria-labelledby="titulo-processamento">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 id="titulo-processamento" className="text-base font-bold text-gray-900">Processamento da folha</h2>
          <p className="text-sm text-gray-600">Versão {comp.versao_atual}{painel.pacote ? ` · enviada por ${painel.pacote.responsavel} em ${dataHora(painel.pacote.enviado_em)}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(status === 'enviada' || status === 'em_processamento') && (
            <button type="button" className={classeBotaoSecundario} onClick={() => { setErro(null); setMensagem(''); setItens({}); setModal('correcao'); }}><RotateCcw className="w-4 h-4" aria-hidden="true" />Solicitar correção</button>
          )}
          {(status === 'enviada' || status === 'revisao_solicitada') && (
            <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={() => executar(() => createClient().rpc('iniciar_processamento_folha', { p_id_competencia: comp.id }), 'Processamento iniciado.', 'Não foi possível iniciar.')}>
              {status === 'revisao_solicitada' ? 'Revisar devolução' : 'Iniciar processamento'}</button>
          )}
        </div>
      </div>
      {painel.pacote?.observacoes && <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">Empresa: {painel.pacote.observacoes}</p>}
      {status === 'revisao_solicitada' && painel.devolucao?.motivo_revisao && <p className="text-sm text-red-800 bg-red-50 rounded-xl p-3">Revisão pedida: {painel.devolucao.motivo_revisao}</p>}
      {status === 'em_processamento' && rascunho?.numero_origem && (
        <p className="text-sm text-blue-900 bg-blue-50 rounded-xl p-3" data-testid="aviso-origem">Valores e documentos trazidos da devolução nº {rascunho.numero_origem}. Confira e altere só o que mudou antes de devolver.</p>
      )}
      <Erro texto={erro && !modal ? erro : null} />

      {status === 'em_processamento' && (
        <div className="space-y-5">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-gray-900">Documentos da devolução</h3>
            <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div><label htmlFor="dev-cat" className={rotulo}>Tipo</label>
                <select id="dev-cat" className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value as typeof categoria)}>
                  {CATEGORIAS_DEVOLUCAO.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}</select></div>
              {categoria === 'holerite' && <div><label htmlFor="dev-func" className={rotulo}>Funcionário</label>
                <select id="dev-func" className={campo} value={funcionario} onChange={(e) => setFuncionario(e.target.value)}>
                  <option value="">Selecione</option>
                  {painel.funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}{holerites.has(f.id) ? ' ✓' : ''}</option>)}</select></div>}
              <div>
                <input key={chaveArquivo} id="dev-arq" type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden="true"
                  onChange={(e) => enviarDocumento(e.target.files?.[0] ?? null)} />
                <button type="button" className={`${classeBotaoPrimario} w-full`} disabled={ocupado || !!arquivo} onClick={escolherArquivo}>
                  <Upload className="w-4 h-4" aria-hidden="true" />{arquivo ? 'Enviando…' : 'Anexar documento'}</button>
              </div>
            </div>
            <p className="text-xs text-gray-600">PDF, JPG ou PNG. {categoria === 'holerite'
              ? 'O holerite fica ligado ao funcionário escolhido e aparece no Portal do Colaborador dele depois que a empresa aprovar a folha.'
              : 'Este documento vai para a empresa (não aparece para os funcionários).'} Holerites: {holerites.size} de {painel.funcionarios.length}.</p>
            <DocumentosDevolucao documentos={docsRascunho} painel={painel} aoErro={setErro}
              aoRemover={(d) => executar(() => createClient().rpc('excluir_documento_folha', { p_id: d.id }), 'Documento removido.', 'Não foi possível remover.')} />
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-gray-900">Valores apurados</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {painel.funcionarios.map((f) => (
                <div key={f.id}><label htmlFor={`liq-${f.id}`} className={rotulo}>Líquido — {f.nome} <span className="font-normal text-gray-500">({matricula(f.matricula)})</span></label>
                  <input id={`liq-${f.id}`} inputMode="numeric" className={campo} value={liquidos[f.id] ?? ''} onChange={(e) => setLiquidos({ ...liquidos, [f.id]: mascaraMoeda(e.target.value) })} /></div>
              ))}
            </div>
            <div className="space-y-2">
              {encargos.map((x, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
                  <div className="col-span-2 sm:col-span-1"><label htmlFor={`enc-d-${i}`} className={rotulo}>Encargo</label><input id={`enc-d-${i}`} placeholder="Ex.: FGTS, INSS" maxLength={120} className={campo} value={x.descricao} onChange={(e) => setEncargos(encargos.map((y, j) => (j === i ? { ...y, descricao: e.target.value } : y)))} /></div>
                  <div><label htmlFor={`enc-v-${i}`} className={rotulo}>Valor</label><input id={`enc-v-${i}`} inputMode="numeric" className={campo} value={x.valor} onChange={(e) => setEncargos(encargos.map((y, j) => (j === i ? { ...y, valor: mascaraMoeda(e.target.value) } : y)))} /></div>
                  <div><label htmlFor={`enc-venc-${i}`} className={rotulo}>Vencimento</label><input id={`enc-venc-${i}`} type="date" className={campo} value={x.vencimento} onChange={(e) => setEncargos(encargos.map((y, j) => (j === i ? { ...y, vencimento: e.target.value } : y)))} /></div>
                  <button type="button" aria-label={`Remover encargo ${i + 1}`} className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:text-red-600" onClick={() => setEncargos(encargos.filter((_, j) => j !== i))}><X className="w-4 h-4" aria-hidden="true" /></button>
                </div>
              ))}
              <button type="button" className="min-h-11 inline-flex items-center gap-1 text-sm font-semibold text-orange-700" onClick={() => setEncargos([...encargos, { descricao: '', valor: '', vencimento: '' }])}><Plus className="w-4 h-4" aria-hidden="true" />Adicionar encargo</button>
            </div>
            <button type="button" className={classeBotaoSecundario} disabled={ocupado} onClick={salvarValores}>Salvar valores</button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-gray-100 pt-4">
            <p className="text-sm text-gray-600">{rascunho ? (rascunho.faltas === 0 ? 'Devolução completa: pode ser enviada à empresa.' : `Faltam holerite ou líquido de ${rascunho.faltas} funcionário(s).`) : 'Anexe os holerites e informe os valores.'}</p>
            <button type="button" className={classeBotaoPrimario} disabled={!rascunho || rascunho.faltas > 0} onClick={() => { setErro(null); setObservacoes(''); setModal('concluir'); }}><Send className="w-4 h-4" aria-hidden="true" />Devolver à empresa</button>
          </div>
        </div>
      )}
      {(status === 'devolvida' || status === 'aprovada') && painel.devolucao && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">{status === 'aprovada' ? `Aprovada pela empresa em ${dataHora(painel.devolucao.aprovada_em)}.` : `Devolvida em ${dataHora(painel.devolucao.enviada_em)}. Aguardando aprovação da empresa.`}</p>
          <DocumentosDevolucao documentos={documentos.filter((d) => d.id_devolucao === painel.devolucao!.id)} painel={painel} aoErro={setErro} />
          <ValoresDevolucao valores={valores.filter((v) => v.id_devolucao === painel.devolucao!.id)} painel={painel} />
        </div>
      )}

      <Modal aberto={modal === 'correcao'} aoFechar={() => setModal(null)} titulo="Solicitar correção à empresa" tamanho="lg"
        rodape={<><button type="button" className={classeBotaoSecundario} onClick={() => setModal(null)}>Cancelar</button>
          <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={() => executar(() => createClient().rpc('solicitar_correcao_folha', {
            p_id_competencia: comp.id, p_mensagem: mensagem, p_itens: Object.entries(itens).filter(([, d]) => d.trim()).map(([id_funcionario, descricao]) => ({ id_funcionario, descricao })) }),
            'Correção solicitada à empresa.', 'Não foi possível solicitar.')}>{ocupado ? 'Enviando...' : 'Solicitar correção'}</button></>}>
        <div className="space-y-3"><Erro texto={erro} />
          <label htmlFor="cor-msg" className={rotulo}>Mensagem *</label>
          <textarea id="cor-msg" rows={3} maxLength={1000} className={area} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
          <p className="text-sm font-semibold text-gray-900">Pendência por funcionário (opcional)</p>
          {painel.funcionarios.map((f) => (
            <div key={f.id}><label htmlFor={`cor-${f.id}`} className="block text-sm text-gray-700 mb-1">{f.nome}</label>
              <input id={`cor-${f.id}`} maxLength={500} className={campo} value={itens[f.id] ?? ''} onChange={(e) => setItens({ ...itens, [f.id]: e.target.value })} /></div>
          ))}
        </div>
      </Modal>
      <Modal aberto={modal === 'concluir'} aoFechar={() => setModal(null)} titulo="Devolver folha processada"
        rodape={<><button type="button" className={classeBotaoSecundario} onClick={() => setModal(null)}>Cancelar</button>
          <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={() => executar(() => createClient().rpc('concluir_devolucao_folha', { p_id_competencia: comp.id, p_observacoes: observacoes.trim() || null }), 'Folha devolvida à empresa.', 'Não foi possível devolver.')}>
            {ocupado ? 'Enviando...' : 'Devolver'}</button></>}>
        <div className="space-y-3"><Erro texto={erro} />
          <p className="text-sm text-gray-700">Depois de devolvida, a empresa confere e aprova. Os documentos e valores desta devolução não podem mais ser alterados.</p>
          <label htmlFor="dev-obs" className={rotulo}>Observações</label>
          <textarea id="dev-obs" rows={3} maxLength={1000} className={area} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} /></div>
      </Modal>
    </section>
  );
}
