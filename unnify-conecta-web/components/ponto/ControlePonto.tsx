'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Eye, MessageCircleQuestion, RefreshCw, Send, ShieldCheck, Trash2, Undo2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, hojeBrasil, inicioDoMes, rotuloMes, somarMeses } from '@/lib/financeiro';
import {
  AVISO_REP, CLASSIFICACOES, DIAS_CURTOS, EXIGE_JUSTIFICATIVA, SITUACOES_APURACAO, TIPOS_MARCACAO, classificacoesPermitidas, diaDaSemana, duracao, horaMarcacao, sinaisApuracao,
  type Apuracao, type Classificacao, type SituacaoApuracao, type TipoMarcacao,
} from '@/lib/portal-colaborador';
import { Selo } from '@/components/admin/tabela';
import { CabecalhoModulo } from '@/components/navegacao/NavegacaoModulos';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
const Erro = ({ texto }: { texto: string | null }) => (texto ? <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{texto}</p> : null);
const STATUS_FOLHA: Record<string, string> = {
  preparacao: 'Em preparação', enviada: 'Enviada ao contador', em_processamento: 'Em processamento', correcao_solicitada: 'Correção solicitada',
  devolvida: 'Devolvida pelo contador', revisao_solicitada: 'Revisão solicitada', aprovada: 'Aprovada',
};

interface Solicitacao { id: string; id_funcionario: string; funcionario: string; tipo: 'incluir' | 'desconsiderar'; data: string; horario: string | null; tipo_marcacao: TipoMarcacao | null; dia_seguinte?: boolean; motivo: string; marcacao_original: string | null; criado_em: string }
interface Painel { status_folha: string; apuracoes: Apuracao[]; solicitacoes: Solicitacao[]; sem_jornada: { id: string; nome: string }[]; feriados: { id: string; data: string; descricao: string }[] }
interface Evidencia { id: string; tipo: TipoMarcacao; registrado_em: string; origem: 'portal' | 'correcao'; desconsiderada: boolean; situacao_foto: string; foto_caminho: string | null; situacao_localizacao: string; latitude: number | null; longitude: number | null; precisao_metros: number | null; motivo_correcao: string | null }

function Rodape({ aoCancelar, aoConfirmar, ocupado, texto, perigo }: { aoCancelar: () => void; aoConfirmar: () => void; ocupado: boolean; texto: string; perigo?: boolean }) {
  return <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
    <button type="button" onClick={aoCancelar} className={classeBotaoSecundario}>Cancelar</button>
    <button type="button" onClick={aoConfirmar} disabled={ocupado} className={perigo ? classeBotaoPerigo : classeBotaoPrimario}>{ocupado ? 'Salvando…' : texto}</button></div>;
}

function ModalConferir({ a, aoFechar, aoConcluir }: { a: Apuracao; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const opcoes = classificacoesPermitidas(a);
  const padrao = a.tratamento_padrao && a.tratamento_padrao !== 'conferir' && opcoes.includes(a.tratamento_padrao) ? a.tratamento_padrao : opcoes[0];
  const [cls, setCls] = useState<Classificacao>(padrao);
  const [just, setJust] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function salvar() {
    if (ocupado) return;
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('conferir_apuracao_ponto', { p_id: a.id, p_classificacao: cls, p_justificativa: just.trim() || null });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível conferir.'));
    aoConcluir('Ocorrência conferida.');
  }
  return (
    <Modal aberto aoFechar={aoFechar} titulo="Conferir ocorrência" descricao={`${a.funcionario} · ${formatarData(a.data)}`}
      rodape={<Rodape aoCancelar={aoFechar} aoConfirmar={salvar} ocupado={ocupado} texto="Confirmar conferência" />}>
      <div className="space-y-4">
        <div className="rounded-xl bg-gray-50 p-3 text-sm space-y-0.5">
          <p>Previsto: <strong>{a.jornada_prevista ?? '—'}</strong> ({duracao(a.previsto_minutos)})</p>
          <p>Registrado: <strong>{a.jornada_registrada ?? '—'}</strong> ({duracao(a.trabalhado_minutos)})</p>
          <p className="text-orange-700 font-semibold">{sinaisApuracao(a).join(' · ')}</p>
          {a.resposta_colaborador && <p className="text-blue-800">Resposta do colaborador: {a.resposta_colaborador}</p>}
        </div>
        <fieldset>
          <legend className={rotulo}>Classificação</legend>
          <div className="space-y-2">
            {opcoes.map((o) => (
              <label key={o} className={`min-h-11 flex items-center gap-2 rounded-lg border px-3 text-sm cursor-pointer ${cls === o ? 'border-orange-500 bg-orange-50' : 'border-gray-300'}`}>
                <input type="radio" name="classificacao" value={o} checked={cls === o} onChange={() => setCls(o)} className="accent-orange-600" />{CLASSIFICACOES[o]}</label>
            ))}
          </div>
        </fieldset>
        <div><label htmlFor="just-conferencia" className={rotulo}>Justificativa{EXIGE_JUSTIFICATIVA.includes(cls) ? '' : ' (opcional)'}</label>
          <textarea id="just-conferencia" value={just} onChange={(e) => setJust(e.target.value)} maxLength={500} rows={3} className={`${campo} h-auto py-2`} /></div>
        {a.excedente_minutos > 0 && <p className="text-xs text-gray-500">Horas efetivamente registradas não são apagadas: se a marcação estiver errada, corrija-a em “Evidências”.</p>}
        <Erro texto={erro} />
      </div>
    </Modal>
  );
}

function ModalEsclarecimento({ a, aoFechar, aoConcluir }: { a: Apuracao; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function salvar() {
    if (ocupado) return;
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('solicitar_esclarecimento_ponto', { p_id: a.id, p_pergunta: texto });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível enviar o pedido.'));
    aoConcluir('Pedido de esclarecimento enviado ao colaborador.');
  }
  return (
    <Modal aberto aoFechar={aoFechar} titulo="Pedir esclarecimento" descricao={`${a.funcionario} · ${formatarData(a.data)}`} rodape={<Rodape aoCancelar={aoFechar} aoConfirmar={salvar} ocupado={ocupado} texto="Enviar pedido" />}>
      <div className="space-y-3">
        <div><label htmlFor="pergunta-ponto" className={rotulo}>O que precisa ser esclarecido?</label>
          <textarea id="pergunta-ponto" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} rows={3} className={`${campo} h-auto py-2`} /></div>
        <p className="text-xs text-gray-500">O colaborador vê o pedido no portal (Minha jornada) e recebe uma notificação.</p>
        <Erro texto={erro} />
      </div>
    </Modal>
  );
}

function Foto({ caminho }: { caminho: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { createClient().storage.from('ponto').createSignedUrl(caminho, 60).then(({ data }) => setUrl(data?.signedUrl ?? null)); }, [caminho]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="Foto registrada na marcação" className="w-20 h-20 rounded-lg object-cover border border-gray-200" /> : <span className="w-20 h-20 rounded-lg bg-gray-100 inline-block" aria-hidden="true" />;
}

function ModalEvidencias({ a, aoFechar, aoConcluir }: { a: Apuracao; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const [lista, setLista] = useState<Evidencia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [acao, setAcao] = useState<{ tipo: 'incluir' } | { tipo: 'desconsiderar'; id: string } | null>(null);
  const [horario, setHorario] = useState('');
  const [tipoMarc, setTipoMarc] = useState<TipoMarcacao>('saida');
  const [diaSeguinte, setDiaSeguinte] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    createClient().rpc('marcacoes_do_dia', { p_id_funcionario: a.id_funcionario, p_data: a.data }).then(({ data, error }) => {
      if (error) setErro(mensagemDeErro(error, 'Não foi possível carregar as marcações.')); else setLista((data ?? []) as Evidencia[]);
    });
  }, [a.id_funcionario, a.data]);
  async function corrigir() {
    if (ocupado || !acao) return;
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('corrigir_ponto_rh', {
      p_id_funcionario: a.id_funcionario, p_tipo: acao.tipo, p_data: a.data, p_horario: acao.tipo === 'incluir' ? horario : null,
      p_tipo_marcacao: acao.tipo === 'incluir' ? tipoMarc : null, p_id_marcacao: acao.tipo === 'desconsiderar' ? acao.id : null, p_motivo: motivo,
      p_dia_seguinte: acao.tipo === 'incluir' && diaSeguinte,
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível registrar a correção.'));
    aoConcluir('Correção registrada. As marcações originais foram mantidas.');
  }
  const integrada = a.situacao === 'integrada';
  return (
    <Modal aberto aoFechar={aoFechar} tamanho="lg" titulo="Evidências do dia" descricao={`${a.funcionario} · ${DIAS_CURTOS[diaDaSemana(a.data)]} ${formatarData(a.data)}`}
      rodape={acao ? <Rodape aoCancelar={() => setAcao(null)} aoConfirmar={corrigir} ocupado={ocupado} texto="Registrar correção" /> : undefined}>
      <div className="space-y-3">
        {!lista && !erro && <div role="status" aria-label="Carregando marcações" className="h-20 rounded-lg bg-gray-50 animate-pulse" />}
        {lista && (lista.length === 0 ? <p className="text-sm text-gray-500">Nenhuma marcação neste dia.</p> : (
          <ul className="divide-y divide-gray-100" data-testid="evidencias">
            {lista.map((m) => (
              <li key={m.id} className="py-3 flex gap-3 text-sm">
                {m.foto_caminho ? <Foto caminho={m.foto_caminho} /> : <span className="w-20 h-20 shrink-0 rounded-lg bg-gray-50 border border-dashed border-gray-200 text-[11px] text-gray-500 inline-flex items-center justify-center text-center p-1">{m.origem === 'correcao' ? 'Correção' : m.situacao_foto === 'negada' ? 'Câmera negada' : 'Sem foto'}</span>}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className={`font-semibold ${m.desconsiderada ? 'line-through text-gray-400' : 'text-gray-900'}`}>{horaMarcacao(m.registrado_em, a.data)} · {TIPOS_MARCACAO[m.tipo]}</p>
                  <p className="text-xs text-gray-600">{m.origem === 'correcao' ? `Correção: ${m.motivo_correcao ?? ''}` : 'Registrada pelo colaborador'}{m.desconsiderada && ' · desconsiderada'}</p>
                  {m.origem === 'portal' && (m.latitude !== null && m.longitude !== null ? (
                    <p className="text-xs text-gray-600">Local: {Number(m.latitude).toFixed(5)}, {Number(m.longitude).toFixed(5)} (precisão {Math.round(Number(m.precisao_metros))} m{m.situacao_localizacao === 'imprecisa' ? ', imprecisa' : ''}) ·{' '}
                      <a href={`https://www.openstreetmap.org/?mlat=${m.latitude}&mlon=${m.longitude}#map=17/${m.latitude}/${m.longitude}`} target="_blank" rel="noopener noreferrer" className="text-orange-700 font-semibold hover:underline">ver no mapa</a></p>
                  ) : <p className="text-xs text-gray-600">Localização {m.situacao_localizacao === 'negada' ? 'não autorizada' : 'indisponível'}</p>)}
                  {!integrada && !m.desconsiderada && !acao && (
                    <button type="button" onClick={() => { setAcao({ tipo: 'desconsiderar', id: m.id }); setMotivo(''); }} className="mt-1 min-h-9 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 inline-flex items-center gap-1">
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />Desconsiderar</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ))}
        {!integrada && !acao && lista && <button type="button" onClick={() => { setAcao({ tipo: 'incluir' }); setMotivo(''); setHorario(''); setDiaSeguinte(false); }} className={`${classeBotaoSecundario} w-full`}>Incluir marcação</button>}
        {acao && (
          <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-3 space-y-3">
            <p className="text-sm font-semibold text-gray-900">{acao.tipo === 'incluir' ? 'Incluir marcação' : 'Desconsiderar marcação'}</p>
            {acao.tipo === 'incluir' && (
              <div className="grid grid-cols-2 gap-2">
                <div><label htmlFor="ev-hora" className={rotulo}>Horário</label><input id="ev-hora" type="time" value={horario} onChange={(e) => setHorario(e.target.value)} className={campo} /></div>
                <div><label htmlFor="ev-tipo" className={rotulo}>Tipo</label><select id="ev-tipo" value={tipoMarc} onChange={(e) => setTipoMarc(e.target.value as TipoMarcacao)} className={campo}>
                  {Object.entries(TIPOS_MARCACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <label className="col-span-2 min-h-11 flex items-center gap-2 text-sm"><input type="checkbox" checked={diaSeguinte} onChange={(e) => setDiaSeguinte(e.target.checked)} className="w-5 h-5 accent-orange-600" />Horário no dia seguinte (turno que passou da meia-noite)</label>
              </div>
            )}
            <div><label htmlFor="ev-motivo" className={rotulo}>Motivo</label><textarea id="ev-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={2} className={`${campo} h-auto py-2`} /></div>
          </div>
        )}
        {integrada && <p className="text-xs text-gray-500">Este dia já foi enviado à folha: correções exigem revisão formal da folha.</p>}
        <Erro texto={erro} />
      </div>
    </Modal>
  );
}

function Solicitacoes({ lista, aoConcluir }: { lista: Solicitacao[]; aoConcluir: (m: string) => void }) {
  const [recusando, setRecusando] = useState<string | null>(null);
  const [resposta, setResposta] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  async function responder(id: string, aprovar: boolean) {
    if (ocupado) return;
    setOcupado(id); setErro(null);
    const { error } = await createClient().rpc('responder_solicitacao_ponto', { p_id: id, p_aprovar: aprovar, p_resposta: aprovar ? null : resposta });
    setOcupado(null);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível responder.'));
    setRecusando(null); setResposta('');
    aoConcluir(aprovar ? 'Correção aprovada; o dia foi reapurado.' : 'Solicitação recusada.');
  }
  if (!lista.length) return <p className="text-sm text-gray-500">Nenhuma solicitação pendente.</p>;
  return (
    <div className="space-y-2">
      <Erro texto={erro} />
      <ul className="divide-y divide-gray-100" data-testid="solicitacoes-rh">
        {lista.map((s) => (
          <li key={s.id} className="py-3 text-sm space-y-1">
            <p className="font-semibold text-gray-900">{s.funcionario} · {formatarData(s.data)}</p>
            <p className="text-gray-700">{s.tipo === 'incluir' ? `Incluir ${TIPOS_MARCACAO[s.tipo_marcacao!].toLowerCase()} às ${s.horario?.slice(0, 5)}${s.dia_seguinte ? ' (dia seguinte)' : ''}` : `Desconsiderar a marcação ${s.marcacao_original ?? ''}`}</p>
            <p className="text-gray-600">Motivo: {s.motivo}</p>
            {recusando === s.id ? (
              <div className="space-y-2">
                <label htmlFor={`recusa-${s.id}`} className="sr-only">Motivo da recusa</label>
                <textarea id={`recusa-${s.id}`} value={resposta} onChange={(e) => setResposta(e.target.value)} maxLength={500} rows={2} placeholder="Motivo da recusa" className={`${campo} h-auto py-2`} />
                <div className="flex gap-2"><button type="button" onClick={() => setRecusando(null)} className={classeBotaoSecundario}>Voltar</button>
                  <button type="button" onClick={() => responder(s.id, false)} disabled={!!ocupado} className={classeBotaoPerigo}>Recusar</button></div>
              </div>
            ) : (
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => responder(s.id, true)} disabled={!!ocupado} className={classeBotaoPrimario}>Aprovar</button>
                <button type="button" onClick={() => { setRecusando(s.id); setResposta(''); }} className={classeBotaoSecundario}>Recusar</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Feriados({ idEmpresa, lista, aoConcluir }: { idEmpresa: string; lista: Painel['feriados']; aoConcluir: (m: string) => void }) {
  const [data, setData] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function salvar() {
    if (ocupado) return;
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('salvar_feriado_empresa', { p_id_empresa: idEmpresa, p_data: data || null, p_descricao: descricao });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar o feriado.'));
    setData(''); setDescricao('');
    aoConcluir('Feriado salvo. Atualize a apuração para recalcular.');
  }
  async function excluir(id: string) {
    const { error } = await createClient().rpc('excluir_feriado_empresa', { p_id: id });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível excluir.'));
    aoConcluir('Feriado excluído.');
  }
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-[10rem_1fr_auto] gap-2 items-end">
        <div><label htmlFor="feriado-data" className={rotulo}>Data</label><input id="feriado-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} /></div>
        <div><label htmlFor="feriado-desc" className={rotulo}>Descrição</label><input id="feriado-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={80} className={campo} /></div>
        <button type="button" onClick={salvar} disabled={ocupado} className={classeBotaoPrimario}><CalendarPlus className="w-4 h-4" aria-hidden="true" />Adicionar</button>
      </div>
      <Erro texto={erro} />
      {lista.length === 0 ? <p className="text-sm text-gray-500">Nenhum feriado cadastrado. Cadastre os feriados que valem para a empresa.</p> : (
        <ul className="divide-y divide-gray-100">{lista.map((f) => (
          <li key={f.id} className="py-2 flex items-center justify-between gap-2 text-sm"><span><strong>{formatarData(f.data)}</strong> · {f.descricao}</span>
            <button type="button" onClick={() => excluir(f.id)} aria-label={`Excluir feriado ${formatarData(f.data)}`} className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="w-4 h-4" aria-hidden="true" /></button></li>
        ))}</ul>
      )}
    </div>
  );
}

interface Politica { prazo_dias: number | null; exclusao_ativa: boolean; fundamento: string | null; atualizado_em: string }
interface RetencaoLegal { id: string; id_funcionario: string | null; motivo: string; criado_em: string }

// Retenção das fotos: sem prazo padrão; a exclusão automática só vale com prazo e fundamento jurídico validado (e o agendamento habilitado no servidor)
function Retencao({ idEmpresa, aoConcluir }: { idEmpresa: string; aoConcluir: (m: string) => void }) {
  const [pol, setPol] = useState<Politica | null | undefined>(undefined);
  const [legais, setLegais] = useState<RetencaoLegal[]>([]);
  const [excluidas, setExcluidas] = useState(0);
  const [prazo, setPrazo] = useState('');
  const [ativa, setAtiva] = useState(false);
  const [fundamento, setFundamento] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const carregar = useCallback(async () => {
    const s = createClient();
    const [p, l, e] = await Promise.all([
      s.from('politicas_retencao_ponto').select('prazo_dias, exclusao_ativa, fundamento, atualizado_em').eq('id_empresa', idEmpresa).maybeSingle(),
      s.from('retencoes_legais_ponto').select('id, id_funcionario, motivo, criado_em').eq('id_empresa', idEmpresa).is('encerrado_em', null).order('criado_em'),
      s.from('expurgos_fotos_ponto').select('id_marcacao', { count: 'exact', head: true }).eq('id_empresa', idEmpresa).not('excluido_em', 'is', null),
    ]);
    if (p.error) { setErro(mensagemDeErro(p.error, 'Não foi possível carregar a política de retenção.')); setPol(null); return; }
    const d = p.data as Politica | null;
    setPol(d); setPrazo(d?.prazo_dias ? String(d.prazo_dias) : ''); setAtiva(!!d?.exclusao_ativa); setFundamento(d?.fundamento ?? '');
    setLegais((l.data ?? []) as RetencaoLegal[]); setExcluidas(e.count ?? 0);
  }, [idEmpresa]);
  useEffect(() => { carregar(); }, [carregar]);
  async function salvar() {
    if (ocupado) return;
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('salvar_politica_retencao_ponto', { p_id_empresa: idEmpresa, p_prazo_dias: prazo ? Number(prazo) : null, p_exclusao_ativa: ativa, p_fundamento: fundamento });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar a política.'));
    aoConcluir('Política de retenção salva.'); carregar();
  }
  async function reter() {
    if (ocupado) return;
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('criar_retencao_legal_ponto', { p_id_empresa: idEmpresa, p_id_funcionario: null, p_motivo: motivo });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível registrar a retenção.'));
    setMotivo(''); aoConcluir('Retenção legal registrada: nenhuma foto será excluída enquanto ela estiver ativa.'); carregar();
  }
  async function encerrar(id: string) {
    const { error } = await createClient().rpc('encerrar_retencao_legal_ponto', { p_id: id });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível encerrar.'));
    aoConcluir('Retenção legal encerrada.'); carregar();
  }
  if (pol === undefined) return <div role="status" aria-label="Carregando retenção" className="h-24 rounded-lg bg-gray-50 animate-pulse" />;
  return (
    <div className="space-y-5" data-testid="retencao-fotos">
      <p className="text-sm text-gray-700">As fotos das marcações ficam em armazenamento privado (só o colaborador e o RH veem). Defina o prazo de guarda <strong>conforme orientação jurídica</strong>: o sistema não presume prazo legal. Sem política ativa, nenhuma foto é excluída.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label htmlFor="ret-prazo" className={rotulo}>Prazo de guarda (dias)</label><input id="ret-prazo" type="number" inputMode="numeric" min={30} max={3650} value={prazo} onChange={(e) => setPrazo(e.target.value)} className={campo} placeholder="Não definido" /></div>
        <label className="min-h-11 self-end flex items-center gap-2 text-sm font-semibold text-gray-900"><input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} className="w-5 h-5 accent-orange-600" />Excluir automaticamente após o prazo</label>
        <div className="sm:col-span-2"><label htmlFor="ret-fund" className={rotulo}>Fundamento jurídico validado</label>
          <textarea id="ret-fund" value={fundamento} onChange={(e) => setFundamento(e.target.value)} maxLength={500} rows={2} className={`${campo} h-auto py-2`} placeholder="Ex.: parecer do jurídico, cláusula da convenção, política interna aprovada" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={salvar} disabled={ocupado} className={classeBotaoPrimario}>Salvar política</button>
        <p className="text-xs text-gray-500">{pol?.exclusao_ativa ? `Exclusão automática ativa (${pol.prazo_dias} dias).` : 'Exclusão automática desativada.'} {excluidas} foto(s) já excluída(s) pela rotina.</p>
      </div>
      <div className="space-y-2">
        <h3 className="font-bold text-gray-900 inline-flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-orange-600" aria-hidden="true" />Retenção legal (litígio, fiscalização)</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <label htmlFor="ret-motivo" className="sr-only">Motivo da retenção legal</label>
          <input id="ret-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="Motivo (ex.: processo nº…)" className={campo} />
          <button type="button" onClick={reter} disabled={ocupado} className={`${classeBotaoSecundario} shrink-0`}>Preservar todas as fotos</button>
        </div>
        {legais.length === 0 ? <p className="text-sm text-gray-500">Nenhuma retenção legal ativa.</p> : (
          <ul className="divide-y divide-gray-100">{legais.map((l) => (
            <li key={l.id} className="py-2 flex items-center justify-between gap-2 text-sm"><span>{l.motivo} · desde {formatarData(l.criado_em.slice(0, 10))}{l.id_funcionario ? ' · um funcionário' : ' · empresa toda'}</span>
              <button type="button" onClick={() => encerrar(l.id)} className="min-h-10 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700">Encerrar</button></li>
          ))}</ul>
        )}
      </div>
      <Erro texto={erro} />
    </div>
  );
}

// Controle de Ponto (RH): marcações do Portal do Colaborador → apuração → conferência → ocorrências da Folha de Pagamento
export function ControlePonto({ idEmpresa }: { idEmpresa: string }) {
  const [competencia, setCompetencia] = useState(inicioDoMes(hojeBrasil()));
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aba, setAba] = useState<'ocorrencias' | 'solicitacoes' | 'feriados' | 'retencao'>('ocorrencias');
  const [filtro, setFiltro] = useState<SituacaoApuracao | 'todas'>('todas');
  const [modal, setModal] = useState<{ tipo: 'conferir' | 'esclarecer' | 'evidencias'; a: Apuracao } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await createClient().rpc('painel_ponto', { p_id_empresa: idEmpresa, p_competencia: competencia });
    if (error) { setErro(mensagemDeErro(error, 'Não foi possível carregar o controle de ponto.')); return; }
    setErro(null);
    setPainel(data as Painel);
  }, [idEmpresa, competencia]);
  useEffect(() => { setPainel(null); carregar(); }, [carregar]);

  const concluir = (m: string) => { setModal(null); setAviso(m); carregar(); };
  async function executar(nome: 'apurar_ponto_competencia' | 'integrar_ponto_folha') {
    if (ocupado) return;
    setOcupado(nome); setAviso(null); setErro(null);
    const { data, error } = await createClient().rpc(nome, { p_id_empresa: idEmpresa, p_competencia: competencia });
    setOcupado(null);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível concluir.'));
    concluir(nome === 'apurar_ponto_competencia' ? `Apuração atualizada (${data} colaborador(es) com jornada).`
      : Number(data) ? `${data} ocorrência(s) enviada(s) à Folha de Pagamento de ${rotuloMes(competencia)}.` : 'Nada novo para enviar à folha.');
  }
  async function desfazer(a: Apuracao) {
    const { error } = await createClient().rpc('desfazer_conferencia_ponto', { p_id: a.id });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível desfazer.'));
    concluir('Conferência desfeita.');
  }

  const ap = painel?.apuracoes ?? [];
  const contar = (s: SituacaoApuracao) => ap.filter((a) => a.situacao === s).length;
  const folhaAberta = painel ? ['preparacao', 'correcao_solicitada'].includes(painel.status_folha) : false;
  const prontas = ap.filter((a) => a.situacao === 'conferida' && ['hora_extra', 'falta', 'falta_justificada', 'atraso', 'atraso_justificado'].includes(a.classificacao ?? '')).length;
  const visiveis = filtro === 'todas' ? ap : ap.filter((a) => a.situacao === filtro);

  return (
    <div className="space-y-5 min-w-0">
      <CabecalhoModulo icone={Clock} titulo="Controle de Ponto" descricao="Marcações do Portal do Colaborador, apuração da jornada e conferência antes da folha."
        acoes={<div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => executar('apurar_ponto_competencia')} disabled={!!ocupado} className={classeBotaoSecundario}><RefreshCw className={`w-4 h-4 ${ocupado === 'apurar_ponto_competencia' ? 'animate-spin' : ''}`} aria-hidden="true" />Atualizar apuração</button>
          <button type="button" onClick={() => executar('integrar_ponto_folha')} disabled={!!ocupado || !folhaAberta || prontas === 0} className={classeBotaoPrimario}><Send className="w-4 h-4" aria-hidden="true" />Enviar conferidas à folha{prontas ? ` (${prontas})` : ''}</button>
        </div>} />
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setCompetencia(somarMeses(competencia, -1))} aria-label="Mês anterior" className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white"><ChevronLeft className="w-5 h-5" aria-hidden="true" /></button>
        <h2 className="font-bold text-gray-900 min-w-40 text-center">{rotuloMes(competencia)}</h2>
        <button type="button" onClick={() => setCompetencia(somarMeses(competencia, 1))} disabled={competencia >= inicioDoMes(hojeBrasil())} aria-label="Próximo mês" className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white disabled:opacity-40"><ChevronRight className="w-5 h-5" aria-hidden="true" /></button>
        {painel && <span className="text-sm text-gray-600 ml-2">Folha: <strong>{STATUS_FOLHA[painel.status_folha] ?? painel.status_folha}</strong></span>}
      </div>
      <p className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2">{AVISO_REP} Conferências e correções ficam no histórico; marcações originais nunca são alteradas.</p>
      {aviso && <p role="status" className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{aviso}</p>}
      <Erro texto={erro} />
      {!painel && !erro && <div role="status" aria-label="Carregando controle de ponto" className="h-40 rounded-2xl bg-white border border-gray-200 animate-pulse" />}
      {painel && (
        <>
          {painel.status_folha && !folhaAberta && <p className="text-sm text-orange-900 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">A folha deste mês já foi enviada ao contador: novas ocorrências só entram após uma solicitação de correção/revisão.</p>}
          {painel.sem_jornada.length > 0 && <p className="text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2" data-testid="sem-jornada">Sem jornada configurada (o ponto não é apurado): <strong>{painel.sem_jornada.map((s) => s.nome).join(', ')}</strong>. Configure em Funcionários → Visão geral.</p>}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {([['A conferir', contar('apurada')], ['Esclarecimento', contar('esclarecimento')], ['Conferidas', contar('conferida')], ['Enviadas à folha', contar('integrada')], ['Solicitações', painel.solicitacoes.length]] as const).map(([r, n]) => (
              <div key={r} className="bg-white rounded-2xl border border-gray-200 p-4"><p className="text-xs text-gray-500">{r}</p><p className="text-2xl font-black text-gray-900">{n}</p></div>
            ))}
          </div>
          <div role="tablist" aria-label="Controle de ponto" className="grid grid-cols-2 sm:grid-cols-4 gap-1 bg-white rounded-xl border border-gray-200 p-1 max-w-2xl">
            {([['ocorrencias', 'Ocorrências'], ['solicitacoes', `Solicitações (${painel.solicitacoes.length})`], ['feriados', 'Feriados'], ['retencao', 'Retenção de fotos']] as const).map(([a, r]) => (
              <button key={a} type="button" role="tab" aria-selected={aba === a} onClick={() => setAba(a)} className={`min-h-11 px-2 rounded-lg text-sm font-semibold ${aba === a ? 'bg-orange-600 text-white' : 'text-gray-700'}`}>{r}</button>
            ))}
          </div>
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 min-w-0">
            {aba === 'ocorrencias' && (
              <div className="space-y-3">
                <label className="inline-flex items-center gap-2 text-sm"><span className="font-semibold text-gray-700">Situação</span>
                  <select value={filtro} onChange={(e) => setFiltro(e.target.value as SituacaoApuracao | 'todas')} className="h-10 rounded-lg border border-gray-300 px-2 text-sm">
                    <option value="todas">Todas</option>{Object.entries(SITUACOES_APURACAO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select></label>
                {visiveis.length === 0 ? <p className="text-sm text-gray-500">Nenhuma ocorrência apurada neste mês. Use “Atualizar apuração” para recalcular os dias.</p> : (
                  <ul className="divide-y divide-gray-100" data-testid="apuracoes">
                    {visiveis.map((a) => (
                      <li key={a.id} className="py-3 text-sm" data-testid="apuracao">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-2 justify-between">
                          <div className="min-w-0 space-y-0.5">
                            <p className="font-bold text-gray-900">{a.funcionario} · {DIAS_CURTOS[diaDaSemana(a.data)]} {formatarData(a.data)}{a.feriado && <span className="ml-1 text-xs text-purple-700">Feriado</span>}</p>
                            <p className="text-gray-600">Previsto: {a.jornada_prevista ?? '—'} · Registrado: {a.jornada_registrada ?? '—'} ({duracao(a.trabalhado_minutos)})</p>
                            <p className="text-orange-700 font-semibold">{sinaisApuracao(a).join(' · ')}</p>
                            {a.classificacao && <p className="text-gray-800">Classificação: <strong>{CLASSIFICACOES[a.classificacao]}</strong>{a.justificativa && ` · ${a.justificativa}`}</p>}
                            {a.situacao === 'esclarecimento' && <p className="text-blue-800">Aguardando o colaborador: “{a.pedido_esclarecimento}”</p>}
                            {a.resposta_colaborador && a.situacao !== 'esclarecimento' && <p className="text-blue-800">Resposta do colaborador: {a.resposta_colaborador}</p>}
                          </div>
                          <Selo tipo={SITUACOES_APURACAO[a.situacao].selo} texto={a.ocorrencia_processada ? 'Processada na folha' : SITUACOES_APURACAO[a.situacao].rotulo} />
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {(a.situacao === 'apurada' || a.situacao === 'esclarecimento') && !a.incompleta && <button type="button" onClick={() => setModal({ tipo: 'conferir', a })} className="min-h-10 px-3 rounded-lg bg-orange-600 text-white text-xs font-semibold">Conferir</button>}
                          {(a.situacao === 'apurada' || a.situacao === 'esclarecimento') && <button type="button" onClick={() => setModal({ tipo: 'esclarecer', a })} className="min-h-10 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 inline-flex items-center gap-1"><MessageCircleQuestion className="w-3.5 h-3.5" aria-hidden="true" />Esclarecimento</button>}
                          <button type="button" onClick={() => setModal({ tipo: 'evidencias', a })} className="min-h-10 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" aria-hidden="true" />Evidências</button>
                          {a.situacao === 'conferida' && <button type="button" onClick={() => desfazer(a)} className="min-h-10 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 inline-flex items-center gap-1"><Undo2 className="w-3.5 h-3.5" aria-hidden="true" />Desfazer conferência</button>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {aba === 'solicitacoes' && <Solicitacoes lista={painel.solicitacoes} aoConcluir={concluir} />}
            {aba === 'feriados' && <Feriados idEmpresa={idEmpresa} lista={painel.feriados} aoConcluir={concluir} />}
            {aba === 'retencao' && <Retencao idEmpresa={idEmpresa} aoConcluir={(m) => setAviso(m)} />}
          </section>
        </>
      )}
      {modal?.tipo === 'conferir' && <ModalConferir a={modal.a} aoFechar={() => setModal(null)} aoConcluir={concluir} />}
      {modal?.tipo === 'esclarecer' && <ModalEsclarecimento a={modal.a} aoFechar={() => setModal(null)} aoConcluir={concluir} />}
      {modal?.tipo === 'evidencias' && <ModalEvidencias a={modal.a} aoFechar={() => setModal(null)} aoConcluir={concluir} />}
    </div>
  );
}
