'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Pencil, Plus, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, formatarMoeda, mascaraMoeda, paraDecimal, valorParaMascara } from '@/lib/financeiro';
import { VINCULOS, type Vinculo } from '@/lib/funcionarios';
import {
  ROTULO_DATA, ROTULO_VALOR, SITUACAO_FUNCIONARIO, SITUACOES_JUSTIFICATIVA, TIPOS_OCORRENCIA, abrirArquivoFolha, dataHora, enviarArquivoFolha, matricula, resumoOcorrencia,
  type DocumentoFolha, type EventoFolha, type FuncionarioFolha, type Ocorrencia, type PendenciaFolha, type SituacaoJustificativa, type TipoOcorrencia,
  somaAjustes,
} from '@/lib/folha-pagamento';
import { Avatar, Selo } from '@/components/admin/tabela';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
const area = 'w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
type Aba = 'ocorrencias' | 'dados' | 'historico';
interface Formulario {
  id: string | null; tipo: TipoOcorrencia; quantidade: string; valor: string; data_inicio: string; data_fim: string;
  situacao_justificativa: SituacaoJustificativa | ''; justificativa: string; observacoes: string; arquivo: File | null;
}
const vazio = (tipo: TipoOcorrencia = 'horas_extras'): Formulario => ({ id: null, tipo, quantidade: '', valor: '', data_inicio: '', data_fim: '', situacao_justificativa: '', justificativa: '', observacoes: '', arquivo: null });

export function PainelFuncionario({ funcionario: f, ocorrencias, documentos, pendencias, eventos, editavel, mostrarSalario, idEmpresa, competencia, abrirFormulario, aoFechar, aoAlterar }: {
  funcionario: FuncionarioFolha; ocorrencias: Ocorrencia[]; documentos: DocumentoFolha[]; pendencias: PendenciaFolha[]; eventos: EventoFolha[];
  editavel: boolean; mostrarSalario: boolean; idEmpresa: string; competencia: string; abrirFormulario: boolean;
  aoFechar: () => void; aoAlterar: (mensagem: string) => Promise<void> | void;
}) {
  const idTitulo = useId();
  const [aba, setAba] = useState<Aba>('ocorrencias');
  const [form, setForm] = useState<Formulario | null>(abrirFormulario && editavel ? vazio() : null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [novaPendencia, setNovaPendencia] = useState<string | null>(null);
  const [resolvendo, setResolvendo] = useState<{ id: string; texto: string } | null>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const aoFecharRef = useRef(aoFechar);
  useEffect(() => { aoFecharRef.current = aoFechar; });

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    painelRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) aoFecharRef.current(); };
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('keydown', tecla); anterior?.focus?.(); };
  }, []);

  const executar = async (acao: () => PromiseLike<{ error: { message?: string; code?: string } | null }>, sucesso: string, padrao: string) => {
    setOcupado(true); setErro(null);
    const { error } = await acao();
    setOcupado(false);
    if (error) { setErro(mensagemDeErro(error, padrao)); return false; }
    await aoAlterar(sucesso);
    return true;
  };

  const editar = (o: Ocorrencia) => {
    setErro(null);
    setForm({ id: o.id, tipo: o.tipo, quantidade: o.quantidade != null ? String(Number(o.quantidade)).replace('.', ',') : '', valor: o.valor != null ? valorParaMascara(Number(o.valor)) : '',
      data_inicio: o.data_inicio ?? '', data_fim: o.data_fim ?? '', situacao_justificativa: o.situacao_justificativa ?? '', justificativa: o.justificativa ?? '', observacoes: o.observacoes ?? '', arquivo: null });
  };

  const salvar = async () => {
    if (!form) return;
    const t = TIPOS_OCORRENCIA[form.tipo];
    const usa = (c: string) => t.campos.includes(c as never);
    const quantidade = usa('quantidade') && form.quantidade.trim() ? Number(form.quantidade.replace(',', '.')) : null;
    const valor = usa('valor') && form.valor ? paraDecimal(form.valor) : null;
    if (quantidade !== null && (!Number.isFinite(quantidade) || quantidade <= 0)) return setErro('Quantidade inválida.');
    const falta = t.obrigatorios.find((c) => (c === 'quantidade' && quantidade === null) || (c === 'valor' && !valor) || (c === 'data_inicio' && !form.data_inicio)
      || (c === 'data_fim' && !form.data_fim) || (c === 'justificativa_situacao' && !form.situacao_justificativa) || (c === 'justificativa' && !form.justificativa.trim()));
    if (falta) {
      const nomes: Record<string, string> = { quantidade: 'a quantidade', valor: 'o valor', data_inicio: 'a data', data_fim: 'a data final', justificativa_situacao: 'se há justificativa', justificativa: (t.rotuloTexto ?? 'a justificativa').toLowerCase() };
      return setErro(`Informe ${nomes[falta]}.`);
    }
    setOcupado(true); setErro(null);
    const supabase = createClient();
    const { data: id, error } = await supabase.rpc('salvar_ocorrencia_folha', {
      p_id: form.id, p_id_empresa: idEmpresa, p_competencia: competencia, p_id_funcionario: f.id, p_tipo: form.tipo, p_quantidade: quantidade, p_valor: valor,
      p_data_inicio: usa('data_inicio') ? form.data_inicio || null : null, p_data_fim: usa('data_fim') ? form.data_fim || null : null,
      p_situacao_justificativa: usa('justificativa_situacao') ? form.situacao_justificativa || null : null,
      p_justificativa: form.justificativa.trim() || null, p_observacoes: form.observacoes.trim() || null,
    });
    if (error) { setOcupado(false); return setErro(mensagemDeErro(error, 'Não foi possível salvar a ocorrência.')); }
    let aviso = form.id ? 'Ocorrência atualizada.' : 'Ocorrência registrada.';
    if (form.arquivo && id) {
      const falha = await enviarArquivoFolha(idEmpresa, form.arquivo, async (caminho) =>
        supabase.rpc('anexar_documento_ocorrencia_folha', { p_id_ocorrencia: id as string, p_caminho: caminho, p_nome_arquivo: form.arquivo!.name }));
      if (falha) aviso += ` Documento não anexado: ${falha}`;
    }
    setOcupado(false);
    setForm(null);
    await aoAlterar(aviso);
  };

  const pendenciasDe = (idOc: string) => pendencias.find((p) => p.origem === 'ocorrencia' && p.id === idOc);
  const pendenciasAvulsas = pendencias.filter((p) => p.origem !== 'ocorrencia');
  const situacao = SITUACAO_FUNCIONARIO[f.situacao];
  const t = form ? TIPOS_OCORRENCIA[form.tipo] : null;
  const usa = (c: string) => !!t?.campos.includes(c as never);
  const obrig = (c: string) => (t?.obrigatorios.includes(c as never) ? ' *' : '');
  const abrir = async (d: DocumentoFolha) => { const e = await abrirArquivoFolha(d.caminho, d.nome_arquivo); if (e) setErro(e); };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <div className="absolute inset-0 bg-gray-900/40" aria-hidden="true" onClick={aoFechar} />
      <div ref={painelRef} role="dialog" aria-modal="true" aria-labelledby={idTitulo} data-testid="painel-funcionario"
        className="relative bg-white w-full sm:max-w-[480px] h-full flex flex-col shadow-2xl mt-12 sm:mt-0 rounded-t-2xl sm:rounded-none">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
          <Avatar nome={f.nome} />
          <div className="min-w-0 flex-1">
            <h2 id={idTitulo} className="text-lg font-bold text-gray-900 truncate">{f.nome}</h2>
            <p className="text-sm text-gray-600">Matrícula {matricula(f.matricula)}{f.cargo ? ` · ${f.cargo}` : ''}</p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div role="tablist" aria-label="Seções do funcionário" className="px-5 pt-3 flex gap-1 border-b border-gray-100">
          {([['ocorrencias', 'Ocorrências'], ['dados', 'Dados'], ['historico', 'Histórico']] as [Aba, string][]).map(([id, r]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
              className={`min-h-11 px-3 text-sm font-semibold border-b-2 -mb-px ${aba === id ? 'border-orange-600 text-orange-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>{r}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {erro && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}

          {aba === 'ocorrencias' && (
            <>
              {mostrarSalario && (
                <section aria-label="Adicionais e descontos" className="rounded-xl border border-gray-200 p-3 space-y-2" data-testid="painel-ajustes">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900">Adicionais e descontos</p>
                    <span className="text-[11px] text-gray-500">lançados em Funcionários</span>
                  </div>
                  {!f.ajustes?.length ? <p className="text-sm text-gray-600">Nenhum nesta competência.</p> : (
                    <>
                      <ul className="divide-y divide-gray-100 text-sm">
                        {f.ajustes.map((x) => (
                          <li key={x.id} className="py-1.5 flex items-start justify-between gap-2">
                            <span className="min-w-0">{x.descricao}{x.recorrente && <span className="ml-1.5 align-middle text-[10px] font-bold uppercase bg-orange-50 text-orange-700 rounded px-1.5 py-0.5">Recorrente</span>}
                              {x.calculo && <span className="block text-xs text-gray-500">{x.calculo}</span>}</span>
                            <span className={`shrink-0 font-semibold ${x.tipo === 'adicional' ? 'text-green-700' : 'text-red-700'}`}>{x.tipo === 'adicional' ? '+' : '−'} {formatarMoeda(Number(x.valor))}</span>
                          </li>
                        ))}
                      </ul>
                      <dl className="border-t border-gray-100 pt-2 text-sm space-y-0.5">
                        <div className="flex justify-between"><dt className="text-gray-600">Salário base</dt><dd>{formatarMoeda(f.salario_base)}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-600">Adicionais</dt><dd className="text-green-700">{formatarMoeda(somaAjustes(f.ajustes, 'adicional'))}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-600">Descontos</dt><dd className="text-red-700">{formatarMoeda(somaAjustes(f.ajustes, 'desconto'))}</dd></div>
                        <div className="flex justify-between font-bold"><dt>Total previsto</dt><dd>{formatarMoeda(Number(f.salario_base) + somaAjustes(f.ajustes, 'adicional') - somaAjustes(f.ajustes, 'desconto'))}</dd></div>
                      </dl>
                    </>
                  )}
                </section>
              )}
              {pendenciasAvulsas.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                  <p className="text-sm font-semibold text-red-800">Pendências</p>
                  {pendenciasAvulsas.map((p) => (
                    <div key={p.id} className="text-sm text-red-800">
                      <p><span className="font-semibold">{p.origem === 'contador' ? 'Contador' : 'RH'}:</span> {p.descricao}</p>
                      {editavel && (resolvendo?.id === p.id ? (
                        <div className="mt-2 space-y-2">
                          <label htmlFor={`res-${p.id}`} className="sr-only">Como foi resolvida</label>
                          <input id={`res-${p.id}`} value={resolvendo.texto} maxLength={500} onChange={(e) => setResolvendo({ id: p.id, texto: e.target.value })} placeholder="Como foi resolvida" className={campo} />
                          <div className="flex gap-2">
                            <button type="button" className={classeBotaoPrimario} disabled={ocupado}
                              onClick={async () => { if (await executar(() => createClient().rpc('resolver_pendencia_folha', { p_id: p.id, p_resolucao: resolvendo.texto }), 'Pendência resolvida.', 'Não foi possível resolver.')) setResolvendo(null); }}>Resolver</button>
                            <button type="button" className={classeBotaoSecundario} onClick={() => setResolvendo(null)}>Cancelar</button>
                          </div>
                        </div>
                      ) : <button type="button" className="mt-1 min-h-9 text-sm font-semibold text-red-700 underline" onClick={() => setResolvendo({ id: p.id, texto: '' })}>Marcar como resolvida</button>)}
                    </div>
                  ))}
                </div>
              )}

              {ocorrencias.length === 0 && !form && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-4">Nenhuma ocorrência registrada neste mês.{f.situacao !== 'apto' && editavel ? ' Se não houve nenhuma, use “Confirmar sem ocorrências”.' : ''}</p>
              )}
              <ul className="space-y-3">
                {ocorrencias.map((o) => {
                  const pend = pendenciasDe(o.id);
                  const docs = documentos.filter((d) => d.id_ocorrencia === o.id);
                  return (
                    <li key={o.id} className="rounded-xl border border-gray-200 p-3" data-testid="ocorrencia">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900">{TIPOS_OCORRENCIA[o.tipo].rotulo}</p>
                          <p className="text-sm text-gray-700">{resumoOcorrencia(o, formatarMoeda)}{o.data_inicio ? ` · ${formatarData(o.data_inicio)}${o.data_fim ? ` a ${formatarData(o.data_fim)}` : ''}` : ''}</p>
                        </div>
                        {pend ? <Selo tipo="perigo" texto={pend.descricao} /> : <Selo tipo="sucesso" texto="Completa" />}
                      </div>
                      {o.situacao_justificativa && <p className="text-sm text-gray-700 mt-1">{SITUACOES_JUSTIFICATIVA[o.situacao_justificativa]}</p>}
                      {o.justificativa && <p className="text-sm text-gray-700 mt-1 break-words">{o.justificativa}</p>}
                      {o.observacoes && <p className="text-xs text-gray-500 mt-1 break-words">Obs.: {o.observacoes}</p>}
                      {docs.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {docs.map((d) => (
                            <li key={d.id} className="inline-flex items-center gap-1 max-w-full rounded-lg bg-gray-100 pl-2 text-xs text-gray-800 [contain:inline-size]">
                              <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <button type="button" className="truncate min-h-9 underline" onClick={() => abrir(d)}>{d.nome_arquivo}</button>
                              {editavel && <button type="button" aria-label={`Remover ${d.nome_arquivo}`} className="w-9 h-9 inline-flex items-center justify-center text-gray-500 hover:text-red-600"
                                onClick={() => executar(() => createClient().rpc('excluir_documento_folha', { p_id: d.id }), 'Documento removido.', 'Não foi possível remover.')}><X className="w-3.5 h-3.5" aria-hidden="true" /></button>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {editavel && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" className="min-h-9 px-3 inline-flex items-center gap-1 rounded-lg border border-gray-200 text-sm font-semibold text-gray-800 hover:bg-gray-50" onClick={() => editar(o)}>
                            <Pencil className="w-4 h-4" aria-hidden="true" />Editar</button>
                          {excluindo === o.id ? (
                            <>
                              <button type="button" className="min-h-9 px-3 rounded-lg bg-red-600 text-white text-sm font-semibold" disabled={ocupado}
                                onClick={async () => { if (await executar(() => createClient().rpc('excluir_ocorrencia_folha', { p_id: o.id }), 'Ocorrência excluída.', 'Não foi possível excluir.')) setExcluindo(null); }}>Confirmar exclusão</button>
                              <button type="button" className="min-h-9 px-3 rounded-lg border border-gray-200 text-sm font-semibold" onClick={() => setExcluindo(null)}>Manter</button>
                            </>
                          ) : (
                            <button type="button" className="min-h-9 px-3 inline-flex items-center gap-1 rounded-lg border border-gray-200 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => setExcluindo(o.id)}>
                              <Trash2 className="w-4 h-4" aria-hidden="true" />Excluir</button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {form && t && (
                <fieldset className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 space-y-3" data-testid="form-ocorrencia">
                  <legend className="px-1 text-sm font-bold text-gray-900">{form.id ? 'Editar ocorrência' : 'Nova ocorrência'}</legend>
                  <div>
                    <label htmlFor="oc-tipo" className={rotulo}>Tipo *</label>
                    <select id="oc-tipo" className={campo} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoOcorrencia })}>
                      {(Object.keys(TIPOS_OCORRENCIA) as TipoOcorrencia[]).map((k) => <option key={k} value={k}>{TIPOS_OCORRENCIA[k].rotulo}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {usa('quantidade') && <div><label htmlFor="oc-qtd" className={rotulo}>Quantidade{t.unidade ? ` (${t.unidade})` : ''}{obrig('quantidade')}</label>
                      <input id="oc-qtd" inputMode="decimal" className={campo} value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value.replace(/[^\d,]/g, '') })} /></div>}
                    {usa('valor') && <div><label htmlFor="oc-valor" className={rotulo}>{ROTULO_VALOR[form.tipo] ?? 'Valor'} (R$){obrig('valor')}</label>
                      <input id="oc-valor" inputMode="numeric" className={campo} value={form.valor} onChange={(e) => setForm({ ...form, valor: mascaraMoeda(e.target.value) })} /></div>}
                    {usa('data_inicio') && <div><label htmlFor="oc-ini" className={rotulo}>{ROTULO_DATA[form.tipo] ?? (usa('data_fim') ? 'Data inicial' : 'Data')}{obrig('data_inicio')}</label>
                      <input id="oc-ini" type="date" className={campo} value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} /></div>}
                    {usa('data_fim') && <div><label htmlFor="oc-fim" className={rotulo}>Data final{obrig('data_fim')}</label>
                      <input id="oc-fim" type="date" className={campo} value={form.data_fim} min={form.data_inicio || undefined} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} /></div>}
                  </div>
                  {usa('justificativa_situacao') && <div><label htmlFor="oc-sj" className={rotulo}>Justificativa{obrig('justificativa_situacao')}</label>
                    <select id="oc-sj" className={campo} value={form.situacao_justificativa} onChange={(e) => setForm({ ...form, situacao_justificativa: e.target.value as SituacaoJustificativa })}>
                      <option value="">Selecione</option>
                      {(Object.keys(SITUACOES_JUSTIFICATIVA) as SituacaoJustificativa[]).map((k) => <option key={k} value={k}>{SITUACOES_JUSTIFICATIVA[k]}</option>)}
                    </select>
                    {form.situacao_justificativa === 'pendente' && <p className="text-xs text-red-700 mt-1">O funcionário ficará pendente até a justificativa ser informada.</p>}
                  </div>}
                  <div><label htmlFor="oc-just" className={rotulo}>{t.rotuloTexto ?? 'Justificativa / detalhes'}{obrig('justificativa')}</label>
                    <textarea id="oc-just" rows={2} maxLength={1000} className={area} value={form.justificativa} onChange={(e) => setForm({ ...form, justificativa: e.target.value })} /></div>
                  <div><label htmlFor="oc-obs" className={rotulo}>Observações</label>
                    <textarea id="oc-obs" rows={2} maxLength={1000} className={area} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
                  <div>
                    <label htmlFor="oc-arq" className={rotulo}>Documento {t.documento === 'obrigatorio' ? '(obrigatório — sem ele fica pendente)' : '(opcional)'}</label>
                    <input id="oc-arq" type="file" accept="application/pdf,image/jpeg,image/png" className="block w-full text-sm" onChange={(e) => setForm({ ...form, arquivo: e.target.files?.[0] ?? null })} />
                    <p className="text-xs text-gray-500 mt-1">PDF, JPG ou PNG até 10 MB.</p>
                  </div>
                </fieldset>
              )}
              {editavel && !form && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={classeBotaoSecundario} onClick={() => { setErro(null); setForm(vazio()); }}><Plus className="w-4 h-4" aria-hidden="true" />Adicionar ocorrência</button>
                  {novaPendencia === null && <button type="button" className={classeBotaoSecundario} onClick={() => setNovaPendencia('')}><AlertTriangle className="w-4 h-4" aria-hidden="true" />Registrar pendência</button>}
                </div>
              )}
              {editavel && novaPendencia !== null && !form && (
                <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                  <label htmlFor="nova-pend" className={rotulo}>O que está faltando?</label>
                  <input id="nova-pend" value={novaPendencia} maxLength={500} onChange={(e) => setNovaPendencia(e.target.value)} className={campo} />
                  <div className="flex gap-2">
                    <button type="button" className={classeBotaoPrimario} disabled={ocupado}
                      onClick={async () => { if (await executar(() => createClient().rpc('registrar_pendencia_folha', { p_id_empresa: idEmpresa, p_competencia: competencia, p_id_funcionario: f.id, p_descricao: novaPendencia }), 'Pendência registrada.', 'Não foi possível registrar.')) setNovaPendencia(null); }}>Registrar</button>
                    <button type="button" className={classeBotaoSecundario} onClick={() => setNovaPendencia(null)}>Cancelar</button>
                  </div>
                </div>
              )}
            </>
          )}

          {aba === 'dados' && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div><dt className="text-gray-500">Matrícula</dt><dd className="font-semibold text-gray-900">{matricula(f.matricula)}</dd></div>
              <div><dt className="text-gray-500">Cargo</dt><dd className="font-semibold text-gray-900">{f.cargo || '—'}</dd></div>
              <div><dt className="text-gray-500">Vínculo</dt><dd className="font-semibold text-gray-900">{VINCULOS[f.vinculo as Vinculo] ?? f.vinculo}</dd></div>
              <div><dt className="text-gray-500">Admissão</dt><dd className="font-semibold text-gray-900">{formatarData(f.data_admissao)}</dd></div>
              {mostrarSalario && <div><dt className="text-gray-500">Salário base</dt><dd className="font-semibold text-gray-900">{formatarMoeda(f.salario_base)}</dd></div>}
              <div><dt className="text-gray-500">Cadastro</dt><dd className="font-semibold text-gray-900">{f.status_funcionario === 'ativo' ? 'Ativo' : 'Desligado'}</dd></div>
              <p className="col-span-2 text-xs text-gray-500">Dados cadastrais completos ficam em Funcionários.</p>
            </dl>
          )}

          {aba === 'historico' && (
            eventos.length === 0 ? <p className="text-sm text-gray-600">Sem registros nesta competência.</p> : (
              <ol className="space-y-3">
                {eventos.map((e) => (
                  <li key={e.id} className="text-sm border-l-2 border-orange-200 pl-3">
                    <p className="text-gray-900">{e.descricao}</p>
                    <p className="text-xs text-gray-500">{dataHora(e.criado_em)}</p>
                  </li>
                ))}
              </ol>
            )
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 space-y-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-gray-600">Situação</span>
            <Selo tipo={situacao.selo} texto={situacao.rotulo} />
          </div>
          {f.conferencia && <p className="text-xs text-gray-500"><CheckCircle2 className="inline w-3.5 h-3.5 text-green-600 mr-1" aria-hidden="true" />
            {f.conferencia.sem_ocorrencias ? 'Confirmado sem ocorrências' : 'Conferência confirmada'} por {f.conferencia.confirmado_por ?? '—'} em {dataHora(f.conferencia.confirmado_em)}</p>}
          {editavel && !form && (
            f.situacao === 'apto' ? (
              <button type="button" className={`${classeBotaoSecundario} w-full`} disabled={ocupado}
                onClick={() => executar(() => createClient().rpc('desfazer_conferencia_folha', { p_id_empresa: idEmpresa, p_competencia: competencia, p_id_funcionario: f.id }), 'Conferência desfeita.', 'Não foi possível desfazer.')}>Desfazer conferência</button>
            ) : (
              <button type="button" className={`${classeBotaoPrimario} w-full`} disabled={ocupado || f.situacao === 'pendente'}
                onClick={() => executar(() => createClient().rpc('confirmar_conferencia_folha', { p_id_empresa: idEmpresa, p_competencia: competencia, p_id_funcionario: f.id, p_sem_ocorrencias: ocorrencias.length === 0 }),
                  ocorrencias.length === 0 ? 'Confirmado sem ocorrências.' : 'Conferência confirmada.', 'Não foi possível confirmar.')}>
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />{ocorrencias.length === 0 ? 'Confirmar sem ocorrências' : 'Confirmar conferência'}
              </button>
            )
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" className={classeBotaoSecundario} onClick={() => (form ? (setForm(null), setErro(null)) : aoFechar())}>Cancelar</button>
            {editavel && <button type="button" className={classeBotaoPrimario} disabled={!form || ocupado} onClick={salvar}>{ocupado && form ? 'Salvando...' : 'Salvar alterações'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
