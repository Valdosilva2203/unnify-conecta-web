'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Archive, ArchiveRestore, CheckCircle2, Clock, Download, FileText, Paperclip, Pencil, Play, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { ARQUIVOS_COMPROVANTE, TAMANHO_MAXIMO_COMPROVANTE, formatarData } from '@/lib/financeiro';
import { ROTULO_PRIORIDADE, ROTULO_STATUS, SELO_PRIORIDADE, SELO_STATUS, pastaAnexos, type StatusTarefa, type Tarefa } from '@/lib/tarefas';
import { Modal, classeBotaoSecundario } from '@/components/ui/Modal';
import { BotaoIcone, Selo } from '@/components/admin/tabela';
import { IconeCategoria } from '@/components/financeiro/IconeCategoria';

interface Detalhe {
  checklist: { id: string; texto: string; concluido: boolean }[];
  comentarios: { id: string; texto: string; criado_em: string; autor: string | null; meu: boolean }[];
  anexos: { id: string; caminho: string; nome_arquivo: string; tamanho: number }[];
  historico: { acao: string; dados: Record<string, unknown> | null; criado_em: string; usuario: string | null }[];
}

const ROTULO_ACAO: Record<string, string> = {
  criada: 'Tarefa criada', editada: 'Tarefa editada', status: 'Situação alterada', arquivada: 'Tarefa arquivada', desarquivada: 'Tarefa desarquivada',
  checklist: 'Checklist alterado', comentario: 'Comentário adicionado', anexo: 'Anexo alterado',
};

interface Props {
  tarefa: Tarefa | null;
  idEmpresa: string | null;
  aoFechar: () => void;
  aoEditar: (t: Tarefa) => void;
  aoAlterar: (mensagem: string) => void;
}

export function DetalheTarefa({ tarefa, idEmpresa, aoFechar, aoEditar, aoAlterar }: Props) {
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [novoItem, setNovoItem] = useState('');
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ocupado = useRef(false);

  const carregar = useCallback(async () => {
    if (!tarefa) return;
    const { data, error } = await createClient().rpc('detalhe_tarefa', { p_id: tarefa.id });
    if (error) return setErro('Não foi possível carregar a tarefa.');
    setDetalhe(data as Detalhe);
  }, [tarefa]);

  useEffect(() => {
    setDetalhe(null);
    setErro(null);
    setNovoItem('');
    setComentario('');
    carregar();
  }, [carregar]);

  // Executa uma ação, evita cliques repetidos e recarrega
  const acao = async (fn: () => PromiseLike<{ error: { message?: string } | null }>, sucesso: string, fecharDepois = false): Promise<boolean> => {
    // Aguarda a ação anterior terminar (não descarta o que o usuário pediu)
    while (ocupado.current) await new Promise((r) => setTimeout(r, 50));
    ocupado.current = true;
    setErro(null);
    const { error } = await fn();
    ocupado.current = false;
    if (error) {
      setErro(mensagemDeErro(error, 'Não foi possível concluir a ação.'));
      carregar();
      return false;
    }
    aoAlterar(sucesso);
    if (fecharDepois) aoFechar();
    else carregar();
    return true;
  };

  const status = (s: StatusTarefa, msg: string) => acao(() => createClient().rpc('alterar_status_tarefa', { p_id: tarefa!.id, p_status: s }), msg, true);

  const adicionarItem = async (e: FormEvent) => {
    e.preventDefault();
    const texto = novoItem.trim();
    if (!texto) return;
    if (await acao(() => createClient().rpc('adicionar_item_checklist', { p_id_tarefa: tarefa!.id, p_texto: texto }), 'Item adicionado ao checklist.')) setNovoItem('');
  };

  const comentar = async (e: FormEvent) => {
    e.preventDefault();
    const texto = comentario.trim();
    if (!texto) return;
    // O texto só é limpo depois de publicado (não se perde se algo falhar)
    if (await acao(() => createClient().rpc('comentar_tarefa', { p_id_tarefa: tarefa!.id, p_texto: texto }), 'Comentário publicado.')) setComentario('');
  };

  const anexar = async (arquivo: File) => {
    if (!tarefa) return;
    if (!ARQUIVOS_COMPROVANTE.includes(arquivo.type)) return setErro('Use PDF, JPG, PNG ou WebP.');
    if (arquivo.size > TAMANHO_MAXIMO_COMPROVANTE) return setErro('O anexo deve ter no máximo 10 MB.');
    setEnviando(true);
    setErro(null);
    const supabase = createClient();
    const extensao = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[arquivo.type];
    const caminho = `${pastaAnexos(idEmpresa, tarefa.id)}/${crypto.randomUUID()}.${extensao}`;
    const { error: erroEnvio } = await supabase.storage.from('anexos-tarefas').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
    if (erroEnvio) {
      setEnviando(false);
      return setErro('Não foi possível enviar o anexo.');
    }
    const { error } = await supabase.rpc('registrar_anexo_tarefa', { p_id_tarefa: tarefa.id, p_caminho: caminho, p_nome_arquivo: arquivo.name });
    setEnviando(false);
    if (error) {
      await supabase.storage.from('anexos-tarefas').remove([caminho]);
      return setErro('Não foi possível registrar o anexo.');
    }
    aoAlterar('Anexo adicionado.');
    carregar();
  };

  const baixar = async (a: Detalhe['anexos'][number]) => {
    const { data, error } = await createClient().storage.from('anexos-tarefas').createSignedUrl(a.caminho, 60, { download: a.nome_arquivo });
    if (error || !data) return setErro('Você não tem acesso a este anexo.');
    window.location.assign(data.signedUrl);
  };

  const removerAnexo = async (a: Detalhe['anexos'][number]) => {
    const supabase = createClient();
    const { data: caminho, error } = await supabase.rpc('remover_anexo_tarefa', { p_id: a.id });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível remover.'));
    await supabase.storage.from('anexos-tarefas').remove([caminho as string]);
    aoAlterar('Anexo removido.');
    carregar();
  };

  const t = tarefa;
  const aberta = t && (t.status === 'pendente' || t.status === 'em_andamento');
  const botaoAcao = 'min-h-11 px-3 inline-flex items-center gap-1.5 rounded-lg border text-sm font-semibold';

  return (
    <Modal aberto={!!t} aoFechar={aoFechar} titulo={t?.titulo ?? ''} rodape={<button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Fechar</button>}>
      {t && (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Selo tipo={SELO_STATUS[t.status]} texto={ROTULO_STATUS[t.status]} />
            <Selo tipo={SELO_PRIORIDADE[t.prioridade]} texto={`Prioridade ${ROTULO_PRIORIDADE[t.prioridade].toLowerCase()}`} />
            {t.atrasada && <Selo tipo="perigo" texto="Atrasada" />}
            {t.arquivada && <Selo tipo="neutro" texto="Arquivada" />}
          </div>
          {t.descricao && <p className="text-gray-700 whitespace-pre-line break-words">{t.descricao}</p>}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div><dt className="text-gray-500">Responsável</dt><dd className="text-gray-900">{t.responsavel_nome ?? '—'}</dd></div>
            <div><dt className="text-gray-500">Prazo</dt><dd className={t.atrasada ? 'text-red-700 font-semibold' : 'text-gray-900'}>{formatarData(t.prazo)}{t.hora ? ` às ${t.hora.slice(0, 5)}` : ''}</dd></div>
            <div className="col-span-2"><dt className="text-gray-500">Categoria</dt>
              <dd className="text-gray-900 flex items-center gap-1.5">{t.categoria_nome ? <><IconeCategoria icone={t.categoria_icone} cor={t.categoria_cor ?? '#9ca3af'} tamanho="sm" />{t.categoria_nome}</> : '—'}</dd></div>
          </dl>

          <div className="flex flex-wrap gap-2">
            {!t.arquivada && t.status === 'pendente' && <button type="button" className={`${botaoAcao} border-blue-200 bg-blue-50 text-blue-700`} onClick={() => status('em_andamento', 'Tarefa em andamento.')}><Play className="w-4 h-4" aria-hidden="true" />Iniciar</button>}
            {!t.arquivada && aberta && <button type="button" className={`${botaoAcao} border-green-200 bg-green-50 text-green-700`} onClick={() => status('concluida', 'Tarefa concluída.')}><CheckCircle2 className="w-4 h-4" aria-hidden="true" />Concluir</button>}
            {!t.arquivada && !aberta && <button type="button" className={`${botaoAcao} border-gray-200 text-gray-700`} onClick={() => status('pendente', 'Tarefa reaberta.')}><RotateCcw className="w-4 h-4" aria-hidden="true" />Reabrir</button>}
            {!t.arquivada && aberta && <button type="button" className={`${botaoAcao} border-gray-200 text-gray-700`} onClick={() => status('cancelada', 'Tarefa cancelada.')}><XCircle className="w-4 h-4" aria-hidden="true" />Cancelar tarefa</button>}
            {!t.arquivada && <button type="button" className={`${botaoAcao} border-gray-200 text-gray-700`} onClick={() => { aoFechar(); aoEditar(t); }}><Pencil className="w-4 h-4" aria-hidden="true" />Editar</button>}
            <button type="button" className={`${botaoAcao} border-gray-200 text-gray-700`} onClick={() => acao(() => createClient().rpc('arquivar_tarefa', { p_id: t.id, p_arquivar: !t.arquivada }), t.arquivada ? 'Tarefa desarquivada.' : 'Tarefa arquivada.', true)}>
              {t.arquivada ? <ArchiveRestore className="w-4 h-4" aria-hidden="true" /> : <Archive className="w-4 h-4" aria-hidden="true" />}
              {t.arquivada ? 'Desarquivar' : 'Arquivar'}
            </button>
          </div>

          {!detalhe ? (
            <div role="status" aria-label="Carregando" className="h-24 rounded-xl bg-gray-50 animate-pulse" />
          ) : (
            <>
              <section aria-label="Checklist">
                <h3 className="font-semibold text-gray-900 mb-2">
                  Checklist {detalhe.checklist.length > 0 && <span className="font-normal text-gray-500">({detalhe.checklist.filter((i) => i.concluido).length}/{detalhe.checklist.length})</span>}
                </h3>
                <ul className="space-y-1">
                  {detalhe.checklist.map((i) => (
                    <li key={i.id} className="flex items-center gap-2">
                      <label className="flex-1 flex items-center gap-2 min-h-11 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 accent-orange-600" checked={i.concluido}
                          onChange={(e) => {
                            const marcado = e.target.checked;
                            // Atualiza na hora; se o servidor recusar, o recarregamento desfaz
                            setDetalhe((d) => d && { ...d, checklist: d.checklist.map((x) => (x.id === i.id ? { ...x, concluido: marcado } : x)) });
                            acao(() => createClient().rpc('alternar_item_checklist', { p_id_item: i.id, p_concluido: marcado }), marcado ? 'Item concluído.' : 'Item reaberto.');
                          }} />
                        <span className={i.concluido ? 'line-through text-gray-400' : 'text-gray-800'}>{i.texto}</span>
                      </label>
                      <BotaoIcone icone={Trash2} titulo={`Remover item ${i.texto}`} aoClicar={() => acao(() => createClient().rpc('remover_item_checklist', { p_id_item: i.id }), 'Item removido.')} />
                    </li>
                  ))}
                </ul>
                <form onSubmit={adicionarItem} className="mt-2 flex gap-2">
                  <input value={novoItem} onChange={(e) => setNovoItem(e.target.value)} maxLength={200} placeholder="Adicionar item" aria-label="Novo item do checklist" className="flex-1 min-w-0 h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  <button type="submit" className={classeBotaoSecundario}>Adicionar</button>
                </form>
              </section>

              <section aria-label="Anexos">
                <h3 className="font-semibold text-gray-900 mb-2">Anexos</h3>
                {detalhe.anexos.length === 0 ? <p className="text-gray-500">Nenhum anexo.</p> : (
                  <ul className="space-y-2">
                    {detalhe.anexos.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2">
                        <FileText className="w-5 h-5 text-orange-600 shrink-0" aria-hidden="true" />
                        <span className="flex-1 min-w-0 truncate">{a.nome_arquivo}</span>
                        <BotaoIcone icone={Download} titulo={`Baixar ${a.nome_arquivo}`} aoClicar={() => baixar(a)} />
                        <BotaoIcone icone={Trash2} titulo={`Remover ${a.nome_arquivo}`} aoClicar={() => removerAnexo(a)} />
                      </li>
                    ))}
                  </ul>
                )}
                <label htmlFor="anexo-tarefa" className={`${classeBotaoSecundario} mt-2 cursor-pointer`}>
                  <Paperclip className="w-4 h-4" aria-hidden="true" />{enviando ? 'Enviando...' : 'Anexar arquivo'}
                </label>
                <input id="anexo-tarefa" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" disabled={enviando}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) anexar(f); }} />
              </section>

              <section aria-label="Comentários">
                <h3 className="font-semibold text-gray-900 mb-2">Comentários</h3>
                {detalhe.comentarios.length === 0 ? <p className="text-gray-500">Nenhum comentário.</p> : (
                  <ul className="space-y-3">
                    {detalhe.comentarios.map((c) => (
                      <li key={c.id} className="rounded-lg bg-gray-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-700">{c.autor ?? 'Usuário'} · <span className="font-normal text-gray-500">{new Date(c.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span></p>
                          {c.meu && <button type="button" onClick={() => acao(() => createClient().rpc('excluir_comentario_tarefa', { p_id: c.id }), 'Comentário excluído.')} className="min-h-11 px-2 text-xs text-gray-500 underline">Excluir</button>}
                        </div>
                        <p className="text-gray-800 whitespace-pre-line break-words">{c.texto}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <form onSubmit={comentar} className="mt-2 space-y-2">
                  <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} maxLength={2000} placeholder="Escreva um comentário" aria-label="Novo comentário" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  <button type="submit" className={classeBotaoSecundario}>Comentar</button>
                </form>
              </section>

              {detalhe.historico.length > 0 && (
                <section aria-label="Histórico">
                  <h3 className="font-semibold text-gray-900 mb-2">Histórico</h3>
                  <ul className="space-y-1 text-gray-600">
                    {detalhe.historico.map((h, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Clock className="w-3.5 h-3.5 mt-0.5 text-gray-400 shrink-0" aria-hidden="true" />
                        <span>
                          {ROTULO_ACAO[h.acao] ?? h.acao}
                          {h.acao === 'status' && h.dados ? `: ${ROTULO_STATUS[h.dados.para as StatusTarefa] ?? h.dados.para}` : ''}
                          {' · '}{h.usuario ?? 'Usuário'} · {new Date(h.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
          {erro && <p role="alert" className="text-red-700">{erro}</p>}
        </div>
      )}
    </Modal>
  );
}
