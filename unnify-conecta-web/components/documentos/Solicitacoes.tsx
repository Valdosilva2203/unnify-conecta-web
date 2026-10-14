'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Clock, FileText, History, Inbox, Plus, RotateCcw, Send, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, hojeBrasil } from '@/lib/financeiro';
import { CATEGORIAS_DOCUMENTO, SELO_SOLICITACAO, STATUS_SOLICITACAO, tamanhoMaximoBytes, type Documento, type Solicitacao } from '@/lib/documentos';
import { FiltroSelect, Selo } from '@/components/admin/tabela';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { abrirDocumento, enviarDocumento } from './acoes';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
const ACOES: Record<string, string> = {
  criada: 'Solicitação criada', documento_enviado: 'Documento enviado', aceito: 'Documento aceito',
  correcao_solicitada: 'Correção solicitada', cancelada: 'Solicitação cancelada',
};
// Aguardando quem: empresa (pendente/correção) ou contador (enviado)
const ORDEM: Record<string, number> = { correcao_solicitada: 0, pendente: 1, enviado: 2, aceito: 3, cancelado: 4 };

interface Props {
  idEmpresa: string;
  papel: 'empresa' | 'contador';
  versao: number;
  aoAlterar: (mensagem: string) => void;
}

export function Solicitacoes({ idEmpresa, papel, versao, aoAlterar }: Props) {
  const [lista, setLista] = useState<Solicitacao[]>([]);
  const [docs, setDocs] = useState<Record<string, Documento>>({});
  const [filtro, setFiltro] = useState('abertas');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [respondendo, setRespondendo] = useState<Solicitacao | null>(null);
  const [analisando, setAnalisando] = useState<{ s: Solicitacao; aceitar: boolean } | null>(null);
  const [cancelando, setCancelando] = useState<Solicitacao | null>(null);
  const [historico, setHistorico] = useState<Record<string, { acao: string; criado_em: string }[]>>({});
  const empresario = papel === 'empresa';

  useEffect(() => {
    let ativo = true;
    const supabase = createClient();
    setCarregando(true);
    supabase.from('solicitacoes_documentos').select('*').eq('id_empresa', idEmpresa).order('criado_em', { ascending: false }).limit(200).then(async ({ data, error }) => {
      if (!ativo) return;
      if (error) { setCarregando(false); return setErro(mensagemDeErro(error, 'Não foi possível carregar as solicitações.')); }
      const itens = ((data ?? []) as Solicitacao[]).sort((a, b) => ORDEM[a.status] - ORDEM[b.status]);
      const ids = itens.map((s) => s.id_documento).filter(Boolean) as string[];
      const { data: d } = ids.length ? await supabase.from('documentos_empresa').select('*').in('id', ids) : { data: [] };
      if (!ativo) return;
      setErro(null);
      setLista(itens);
      setDocs(Object.fromEntries(((d ?? []) as Documento[]).map((x) => [x.id, x])));
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, [idEmpresa, versao]);

  const verHistorico = async (s: Solicitacao) => {
    if (historico[s.id]) return setHistorico(({ [s.id]: _, ...resto }) => resto);
    const { data } = await createClient().from('historico_solicitacoes_documentos').select('acao, criado_em').eq('id_solicitacao', s.id).order('criado_em');
    setHistorico((h) => ({ ...h, [s.id]: data ?? [] }));
  };

  const hoje = hojeBrasil();
  const visiveis = lista.filter((s) => (filtro === 'abertas' ? ['pendente', 'correcao_solicitada', 'enviado'].includes(s.status) : filtro ? s.status === filtro : true));
  const aguardandoMim = lista.filter((s) => (empresario ? ['pendente', 'correcao_solicitada'] : ['enviado']).includes(s.status)).length;

  return (
    <section aria-label="Solicitações de documentos" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 space-y-4 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900">{empresario ? 'Solicitações do contador' : 'Solicitações de documentos'}</h2>
          <p className="text-xs text-gray-500" data-testid="aguardando">
            {aguardandoMim > 0 ? `${aguardandoMim} ${aguardandoMim === 1 ? 'aguarda' : 'aguardam'} ${empresario ? 'o seu envio' : 'a sua análise'}` : 'Nada aguardando você agora.'}
          </p>
        </div>
        <div className="flex gap-2">
          <FiltroSelect valor={filtro} aoMudar={setFiltro}>
            <option value="abertas">Em aberto</option>
            <option value="">Todas</option>
            {Object.entries(STATUS_SOLICITACAO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </FiltroSelect>
          {!empresario && (
            <button type="button" onClick={() => setNova(true)} className={classeBotaoPrimario}><Plus className="w-4 h-4" aria-hidden="true" />Nova solicitação</button>
          )}
        </div>
      </div>

      {erro ? <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{erro}</div>
        : carregando ? <div role="status" aria-label="Carregando" className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-20 rounded-xl bg-gray-50 animate-pulse" />)}</div>
        : visiveis.length === 0 ? (
          <div className="text-center py-10">
            <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
            <p className="font-semibold text-gray-900">{lista.length ? 'Nenhuma solicitação com esse filtro.' : empresario ? 'O contador ainda não solicitou documentos.' : 'Nenhuma solicitação para esta empresa.'}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {visiveis.map((s) => {
              const doc = s.id_documento ? docs[s.id_documento] : null;
              const vencida = s.prazo && s.prazo < hoje && ['pendente', 'correcao_solicitada'].includes(s.status);
              return (
                <li key={s.id} className="rounded-xl border border-gray-200 p-3 sm:p-4" data-testid={`solicitacao-${s.titulo}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 break-words">{s.titulo}</p>
                      {s.descricao && <p className="text-sm text-gray-600 break-words">{s.descricao}</p>}
                      <p className={`text-xs mt-1 inline-flex items-center gap-1 ${vencida ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>
                        <Clock className="w-3 h-3" aria-hidden="true" />{s.prazo ? `Prazo ${formatarData(s.prazo)}${vencida ? ' · vencido' : ''}` : 'Sem prazo'}
                      </p>
                      {s.status === 'correcao_solicitada' && s.motivo_correcao && <p className="text-sm text-red-700 mt-1">Correção pedida: {s.motivo_correcao}</p>}
                      {s.status === 'cancelado' && s.motivo_cancelamento && <p className="text-sm text-gray-500 mt-1">Cancelada: {s.motivo_cancelamento}</p>}
                      {doc && (
                        <button type="button" onClick={() => abrirDocumento(doc, false).catch((e) => aoAlterar(`Atenção: ${(e as Error).message}`))}
                          className="mt-1 inline-flex items-center gap-1 text-sm text-orange-700 hover:underline min-h-11 sm:min-h-0">
                          <FileText className="w-4 h-4" aria-hidden="true" />{doc.nome}
                        </button>
                      )}
                    </div>
                    <Selo tipo={SELO_SOLICITACAO[s.status]} texto={STATUS_SOLICITACAO[s.status]} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {empresario && ['pendente', 'correcao_solicitada'].includes(s.status) && (
                      <button type="button" className={classeBotaoPrimario} onClick={() => setRespondendo(s)}><Send className="w-4 h-4" aria-hidden="true" />Enviar documento</button>
                    )}
                    {!empresario && s.status === 'enviado' && (
                      <>
                        <button type="button" className={classeBotaoPrimario} onClick={() => setAnalisando({ s, aceitar: true })}><CheckCircle2 className="w-4 h-4" aria-hidden="true" />Aceitar</button>
                        <button type="button" className={classeBotaoSecundario} onClick={() => setAnalisando({ s, aceitar: false })}><RotateCcw className="w-4 h-4" aria-hidden="true" />Pedir correção</button>
                      </>
                    )}
                    {!empresario && !['aceito', 'cancelado'].includes(s.status) && (
                      <button type="button" className={classeBotaoSecundario} onClick={() => setCancelando(s)}><XCircle className="w-4 h-4" aria-hidden="true" />Cancelar</button>
                    )}
                    <button type="button" className={classeBotaoSecundario} aria-expanded={!!historico[s.id]} onClick={() => verHistorico(s)}><History className="w-4 h-4" aria-hidden="true" />Histórico</button>
                  </div>
                  {historico[s.id] && (
                    <ol className="mt-3 border-l-2 border-orange-200 pl-3 space-y-1 text-sm" aria-label={`Histórico de ${s.titulo}`}>
                      {historico[s.id].map((h, i) => (
                        <li key={i} className="flex justify-between gap-3"><span className="text-gray-800">{ACOES[h.acao] ?? h.acao}</span>
                          <span className="text-gray-500 whitespace-nowrap">{new Date(h.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</span></li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        )}

      <FormSolicitacao aberto={nova} idEmpresa={idEmpresa} aoFechar={() => setNova(false)} aoCriar={(m) => { setNova(false); aoAlterar(m); }} />
      <Responder solicitacao={respondendo} idEmpresa={idEmpresa} aoFechar={() => setRespondendo(null)} aoConcluir={(m) => { setRespondendo(null); aoAlterar(m); }} />
      <Analisar alvo={analisando} aoFechar={() => setAnalisando(null)} aoConcluir={(m) => { setAnalisando(null); aoAlterar(m); }} />
      <Cancelar solicitacao={cancelando} aoFechar={() => setCancelando(null)} aoConcluir={(m) => { setCancelando(null); aoAlterar(m); }} />
    </section>
  );
}

function FormSolicitacao({ aberto, idEmpresa, aoFechar, aoCriar }: { aberto: boolean; idEmpresa: string; aoFechar: () => void; aoCriar: (m: string) => void }) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prazo, setPrazo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (aberto) { setTitulo(''); setDescricao(''); setPrazo(''); setErro(null); } }, [aberto]);
  const criar = async (e: FormEvent) => {
    e.preventDefault();
    if (titulo.trim().length < 3) return setErro('Informe o título (mínimo 3 caracteres).');
    const { error } = await createClient().rpc('criar_solicitacao_documento', { p_id_empresa: idEmpresa, p_titulo: titulo.trim(), p_descricao: descricao.trim() || null, p_prazo: prazo || null });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível criar a solicitação.'));
    aoCriar('Solicitação enviada à empresa.');
  };
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Nova solicitação de documento"
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="submit" form="form-solicitacao" className={classeBotaoPrimario}>Solicitar</button></>}>
      <form id="form-solicitacao" onSubmit={criar} noValidate className="space-y-4">
        <div><label htmlFor="sol-titulo" className={rotulo}>Título</label>
          <input id="sol-titulo" maxLength={150} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Extrato bancário de setembro/2026" className={campo} /></div>
        <div><label htmlFor="sol-descricao" className={rotulo}>Descrição <span className="font-normal text-gray-500">(opcional)</span></label>
          <textarea id="sol-descricao" rows={3} maxLength={2000} value={descricao} onChange={(e) => setDescricao(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
        <div><label htmlFor="sol-prazo" className={rotulo}>Prazo <span className="font-normal text-gray-500">(opcional)</span></label>
          <input id="sol-prazo" type="date" min={hojeBrasil()} value={prazo} onChange={(e) => setPrazo(e.target.value)} className={campo} /></div>
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      </form>
    </Modal>
  );
}

// Empresário responde: arquivo novo (enviado e registrado) ou documento que já está na biblioteca
function Responder({ solicitacao, idEmpresa, aoFechar, aoConcluir }: { solicitacao: Solicitacao | null; idEmpresa: string; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const [modo, setModo] = useState<'novo' | 'existente'>('novo');
  const [existentes, setExistentes] = useState<{ id: string; nome: string }[]>([]);
  const [escolhido, setEscolhido] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [categoria, setCategoria] = useState('outros');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!solicitacao) return;
    setModo('novo'); setEscolhido(''); setArquivo(null); setCategoria('outros'); setErro(null);
    createClient().from('documentos_empresa').select('id, nome').eq('id_empresa', idEmpresa).order('enviado_em', { ascending: false }).limit(100)
      .then(({ data }) => setExistentes(data ?? []));
  }, [solicitacao, idEmpresa]);

  const responder = async () => {
    if (!solicitacao || enviando) return;
    setErro(null);
    let idDocumento = escolhido;
    if (modo === 'novo') {
      if (!arquivo) return setErro('Escolha o arquivo.');
      setEnviando(true);
      try {
        idDocumento = await enviarDocumento({ arquivo, idEmpresa, nome: solicitacao.titulo, categoria, compartilhar: true });
      } catch (e) {
        setEnviando(false);
        return setErro((e as Error).message);
      }
    } else if (!idDocumento) {
      return setErro('Escolha o documento.');
    }
    setEnviando(true);
    const { error } = await createClient().rpc('responder_solicitacao_documento', { p_id: solicitacao.id, p_id_documento: idDocumento });
    setEnviando(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível responder a solicitação.'));
    aoConcluir('Documento enviado ao contador.');
  };

  return (
    <Modal aberto={!!solicitacao} aoFechar={aoFechar} titulo={`Responder: ${solicitacao?.titulo ?? ''}`} descricao="O documento enviado passa a ser compartilhado com o contador."
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={enviando} onClick={responder}>{enviando ? 'Enviando...' : 'Enviar ao contador'}</button></>}>
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Como enviar" className="grid grid-cols-2 rounded-lg bg-gray-100 p-1">
          {(['novo', 'existente'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={modo === m} onClick={() => setModo(m)}
              className={`min-h-10 rounded-md text-sm font-semibold ${modo === m ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600'}`}>
              {m === 'novo' ? 'Arquivo novo' : 'Da biblioteca'}
            </button>
          ))}
        </div>
        {modo === 'novo' ? (
          <>
            <div>
              <label htmlFor="sol-arquivo" className={rotulo}>Arquivo</label>
              <input id="sol-arquivo" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-700 file:mr-3 file:min-h-11 file:px-4 file:rounded-lg file:border-0 file:bg-orange-50 file:text-orange-700 file:font-semibold" />
              <p className="text-xs text-gray-500 mt-1">PDF, JPG ou PNG, até {Math.round(tamanhoMaximoBytes() / 1024 / 1024)} MB.</p>
            </div>
            <div>
              <label htmlFor="sol-categoria" className={rotulo}>Categoria</label>
              <select id="sol-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campo}>
                {Object.entries(CATEGORIAS_DOCUMENTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
            </div>
          </>
        ) : (
          <div>
            <label htmlFor="sol-existente" className={rotulo}>Documento da biblioteca</label>
            <select id="sol-existente" value={escolhido} onChange={(e) => setEscolhido(e.target.value)} className={campo}>
              <option value="">Selecione</option>
              {existentes.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>
        )}
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}

function Analisar({ alvo, aoFechar, aoConcluir }: { alvo: { s: Solicitacao; aceitar: boolean } | null; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (alvo) { setMotivo(''); setErro(null); } }, [alvo]);
  const confirmar = async () => {
    if (!alvo) return;
    if (!alvo.aceitar && motivo.trim().length < 3) return setErro('Explique o que precisa ser corrigido.');
    const { error } = await createClient().rpc('analisar_solicitacao_documento', { p_id: alvo.s.id, p_aceitar: alvo.aceitar, p_motivo: motivo.trim() || null });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível registrar a análise.'));
    aoConcluir(alvo.aceitar ? 'Documento aceito.' : 'Correção solicitada à empresa.');
  };
  return (
    <Modal aberto={!!alvo} aoFechar={aoFechar} titulo={alvo?.aceitar ? 'Aceitar documento' : 'Pedir correção'} descricao={alvo?.s.titulo}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Voltar</button>
        <button type="button" className={alvo?.aceitar ? classeBotaoPrimario : classeBotaoPerigo} onClick={confirmar}>{alvo?.aceitar ? 'Aceitar' : 'Pedir correção'}</button></>}>
      {alvo?.aceitar ? <p className="text-sm text-gray-700">A solicitação será concluída.</p> : (
        <>
          <label htmlFor="sol-motivo" className={rotulo}>O que precisa ser corrigido?</label>
          <textarea id="sol-motivo" rows={3} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </>
      )}
      {erro && <p role="alert" className="text-sm text-red-700 mt-2">{erro}</p>}
    </Modal>
  );
}

function Cancelar({ solicitacao, aoFechar, aoConcluir }: { solicitacao: Solicitacao | null; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (solicitacao) { setMotivo(''); setErro(null); } }, [solicitacao]);
  const confirmar = async () => {
    if (!solicitacao) return;
    const { error } = await createClient().rpc('cancelar_solicitacao_documento', { p_id: solicitacao.id, p_motivo: motivo.trim() || null });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível cancelar.'));
    aoConcluir('Solicitação cancelada.');
  };
  return (
    <Modal aberto={!!solicitacao} aoFechar={aoFechar} titulo="Cancelar solicitação" descricao={solicitacao?.titulo}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Voltar</button>
        <button type="button" className={classeBotaoPerigo} onClick={confirmar}>Cancelar solicitação</button></>}>
      <label htmlFor="sol-cancelar" className={rotulo}>Motivo <span className="font-normal text-gray-500">(opcional)</span></label>
      <textarea id="sol-cancelar" rows={2} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
      {erro && <p role="alert" className="text-sm text-red-700 mt-2">{erro}</p>}
    </Modal>
  );
}
