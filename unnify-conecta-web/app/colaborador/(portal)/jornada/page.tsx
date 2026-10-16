'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageCircleQuestion, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, hojeBrasil, inicioDoMes, rotuloMes, somarMeses } from '@/lib/financeiro';
import { Selo } from '@/components/admin/tabela';
import {
  DIAS_CURTOS, DIAS_SEMANA, SITUACOES_APURACAO, TIPOS_MARCACAO, diaDaSemana, duracao, horaMarcacao, sinaisApuracao,
  type DiaEspelho, type JornadaColaborador, type MarcacaoPonto, type SolicitacaoPonto, type TipoMarcacao,
} from '@/lib/portal-colaborador';
import { useColaborador } from '@/components/colaborador/LayoutColaborador';
import { Cartao, Carregando, Erro, Sucesso, campo, rotulo } from '@/components/colaborador/comum';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

type Aba = 'escala' | 'espelho' | 'horas' | 'correcoes';
const SIT_SOL: Record<SolicitacaoPonto['situacao'], { r: string; s: 'alerta' | 'sucesso' | 'perigo' | 'neutro' }> = {
  pendente: { r: 'Em análise', s: 'alerta' }, aprovada: { r: 'Aprovada', s: 'sucesso' }, recusada: { r: 'Recusada', s: 'perigo' }, cancelada: { r: 'Cancelada', s: 'neutro' },
};

function Responder({ dia, aoConcluir }: { dia: DiaEspelho; aoConcluir: (m: string) => void }) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function enviar() {
    if (ocupado) return;
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('responder_esclarecimento_ponto', { p_id: dia.id_apuracao, p_resposta: texto });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível enviar a resposta.'));
    aoConcluir('Resposta enviada ao RH.');
  }
  return (
    <div className="mt-2 rounded-xl bg-blue-50 border border-blue-100 p-3 space-y-2">
      <p className="text-sm text-blue-900 inline-flex items-start gap-2"><MessageCircleQuestion className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />O RH pediu: “{dia.pedido_esclarecimento}”</p>
      <label htmlFor={`resp-${dia.data}`} className="sr-only">Sua resposta para {formatarData(dia.data)}</label>
      <textarea id={`resp-${dia.data}`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} rows={2} className={`${campo} h-auto py-2`} placeholder="Sua resposta" />
      <Erro texto={erro} />
      <button type="button" onClick={enviar} disabled={ocupado || texto.trim().length < 3} className={classeBotaoPrimario}>{ocupado ? 'Enviando…' : 'Responder'}</button>
    </div>
  );
}

function ModalCorrecao({ aberto, aoFechar, hoje, aoConcluir }: { aberto: boolean; aoFechar: () => void; hoje: string; aoConcluir: (m: string) => void }) {
  const { vinculo } = useColaborador();
  const [tipo, setTipo] = useState<'incluir' | 'desconsiderar'>('incluir');
  const [data, setData] = useState(hoje);
  const [horario, setHorario] = useState('');
  const [tipoMarc, setTipoMarc] = useState<TipoMarcacao>('saida');
  const [diaSeguinte, setDiaSeguinte] = useState(false);
  const [idMarc, setIdMarc] = useState('');
  const [motivo, setMotivo] = useState('');
  const [doDia, setDoDia] = useState<MarcacaoPonto[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (aberto) { setTipo('incluir'); setData(hoje); setHorario(''); setMotivo(''); setIdMarc(''); setErro(null); setDiaSeguinte(false); } }, [aberto, hoje]);
  useEffect(() => {
    if (!aberto || tipo !== 'desconsiderar' || !data) return;
    createClient().rpc('meu_ponto', { p_id_funcionario: vinculo.id_funcionario, p_de: data, p_ate: data })
      .then(({ data: d }) => { const l = ((d ?? []) as MarcacaoPonto[]).filter((m) => !m.desconsiderada); setDoDia(l); setIdMarc(l[0]?.id ?? ''); });
  }, [aberto, tipo, data, vinculo.id_funcionario]);
  async function enviar() {
    if (ocupado) return;
    setErro(null);
    if (motivo.trim().length < 3) return setErro('Informe o motivo da correção.');
    if (tipo === 'incluir' && !horario) return setErro('Informe o horário.');
    if (tipo === 'desconsiderar' && !idMarc) return setErro('Escolha a marcação.');
    setOcupado(true);
    const { error } = await createClient().rpc('solicitar_correcao_ponto', {
      p_id_funcionario: vinculo.id_funcionario, p_tipo: tipo, p_data: data, p_horario: tipo === 'incluir' ? horario : null,
      p_tipo_marcacao: tipo === 'incluir' ? tipoMarc : null, p_id_marcacao: tipo === 'desconsiderar' ? idMarc : null, p_motivo: motivo.trim(),
      p_dia_seguinte: tipo === 'incluir' && diaSeguinte,
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível enviar a solicitação.'));
    aoConcluir('Solicitação enviada ao RH. Seus registros originais continuam guardados.');
  }
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Solicitar correção de ponto" descricao="O RH analisa o pedido. As marcações originais nunca são alteradas."
      rodape={<div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <button type="button" onClick={aoFechar} className={classeBotaoSecundario}>Cancelar</button>
        <button type="button" onClick={enviar} disabled={ocupado} className={classeBotaoPrimario}>{ocupado ? 'Enviando…' : 'Enviar solicitação'}</button></div>}>
      <div className="space-y-4">
        <fieldset>
          <legend className={rotulo}>O que precisa corrigir?</legend>
          <div className="grid sm:grid-cols-2 gap-2">
            {([['incluir', 'Incluir marcação esquecida'], ['desconsiderar', 'Desconsiderar marcação errada']] as const).map(([v, r]) => (
              <label key={v} className={`min-h-11 flex items-center gap-2 rounded-lg border px-3 text-sm cursor-pointer ${tipo === v ? 'border-orange-500 bg-orange-50' : 'border-gray-300'}`}>
                <input type="radio" name="tipo-correcao" value={v} checked={tipo === v} onChange={() => setTipo(v)} className="accent-orange-600" />{r}</label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="data-correcao" className={rotulo}>Data</label>
          <input id="data-correcao" type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} className={campo} />
        </div>
        {tipo === 'incluir' ? (
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="hora-correcao" className={rotulo}>Horário</label><input id="hora-correcao" type="time" value={horario} onChange={(e) => setHorario(e.target.value)} className={campo} /></div>
            <div><label htmlFor="tipo-correcao-marc" className={rotulo}>Tipo</label>
              <select id="tipo-correcao-marc" value={tipoMarc} onChange={(e) => setTipoMarc(e.target.value as TipoMarcacao)} className={campo}>
                {Object.entries(TIPOS_MARCACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <label className="col-span-2 min-h-11 flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" checked={diaSeguinte} onChange={(e) => setDiaSeguinte(e.target.checked)} className="w-5 h-5 accent-orange-600" />
              Horário no dia seguinte (turno que passou da meia-noite)</label>
          </div>
        ) : (
          <div><label htmlFor="marc-correcao" className={rotulo}>Marcação</label>
            {doDia.length === 0 ? <p className="text-sm text-gray-500">Nenhuma marcação nesta data.</p> : (
              <select id="marc-correcao" value={idMarc} onChange={(e) => setIdMarc(e.target.value)} className={campo}>
                {doDia.map((m) => <option key={m.id} value={m.id}>{horaMarcacao(m.registrado_em, m.data_local)} · {TIPOS_MARCACAO[m.tipo]}</option>)}</select>)}
          </div>
        )}
        <div><label htmlFor="motivo-correcao" className={rotulo}>Motivo</label>
          <textarea id="motivo-correcao" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={3} className={`${campo} h-auto py-2`} /></div>
        <Erro texto={erro} />
      </div>
    </Modal>
  );
}

// Minha jornada: escala, espelho de ponto (calculado no banco) e solicitações de correção
export default function MinhaJornadaPage() {
  const { vinculo } = useColaborador();
  const [hoje] = useState(hojeBrasil);
  const [aba, setAba] = useState<Aba>('escala');
  useEffect(() => { // links das notificações abrem a aba certa (?aba=)
    const a = new URLSearchParams(window.location.search).get('aba');
    if (a === 'espelho' || a === 'horas' || a === 'correcoes') setAba(a);
  }, []);
  const [competencia, setCompetencia] = useState(inicioDoMes(hoje));
  const [dados, setDados] = useState<JornadaColaborador | null>(null);
  const [sols, setSols] = useState<SolicitacaoPonto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [modal, setModal] = useState(false);

  const carregar = useCallback(async () => {
    const s = createClient();
    const [j, so] = await Promise.all([
      s.rpc('minha_jornada', { p_id_funcionario: vinculo.id_funcionario, p_competencia: competencia }),
      s.rpc('minhas_solicitacoes_ponto', { p_id_funcionario: vinculo.id_funcionario }),
    ]);
    if (j.error || so.error) { setErro(mensagemDeErro(j.error ?? so.error, 'Não foi possível carregar sua jornada.')); return; }
    setErro(null);
    setDados(j.data as JornadaColaborador);
    setSols((so.data ?? []) as SolicitacaoPonto[]);
  }, [vinculo.id_funcionario, competencia]);
  useEffect(() => { carregar(); }, [carregar]);

  const concluido = (m: string) => { setAviso(m); setModal(false); carregar(); };
  async function cancelar(id: string) {
    const { error } = await createClient().rpc('cancelar_solicitacao_ponto', { p_id: id });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível cancelar.'));
    concluido('Solicitação cancelada.');
  }
  const pendentesEsclarecimento = dados?.dias.filter((d) => d.situacao === 'esclarecimento').length ?? 0;
  const dias = (dados?.dias ?? []).filter((d) => !d.em_andamento || d.registrado).slice().reverse();

  return (
    <>
      <h1 className="text-2xl font-black text-gray-900">Minha jornada</h1>
      <div role="tablist" aria-label="Minha jornada" className="grid grid-cols-4 gap-1 bg-white rounded-xl border border-gray-200 p-1">
        {([['escala', 'Escala'], ['espelho', 'Espelho'], ['horas', 'Horas extras'], ['correcoes', 'Correções']] as const).map(([a, r]) => (
          <button key={a} type="button" role="tab" aria-selected={aba === a} onClick={() => setAba(a)} className={`min-h-11 px-1 rounded-lg text-xs sm:text-sm font-semibold leading-tight ${aba === a ? 'bg-orange-600 text-white' : 'text-gray-700'}`}>
            {r}{a === 'espelho' && pendentesEsclarecimento > 0 && <span className="ml-1 inline-flex w-5 h-5 items-center justify-center rounded-full bg-blue-600 text-white text-[11px]" aria-label={`${pendentesEsclarecimento} esclarecimento(s) pendente(s)`}>{pendentesEsclarecimento}</span>}
          </button>
        ))}
      </div>
      <Sucesso texto={aviso} />
      <Erro texto={erro} />
      {!dados && !erro && <Carregando rotulo="Carregando jornada" />}
      {dados && aba === 'escala' && (
        <Cartao titulo="Jornada atual" id="titulo-escala">
          {!dados.jornada ? <p className="text-sm text-gray-600">O RH ainda não configurou sua jornada. As marcações continuam sendo registradas normalmente.</p> : (
            <>
              <ul className="divide-y divide-gray-100" data-testid="escala">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const per = dados.jornada!.escala[String(d)] ?? [];
                  return <li key={d} className="py-2 flex justify-between gap-3 text-sm"><span className="font-semibold text-gray-900 w-24">{DIAS_SEMANA[d]}</span>
                    <span className={per.length ? 'text-gray-800 text-right' : 'text-gray-400'}>{per.length ? per.map(([a, b]) => `${a}–${b}`).join(' · ') : 'Descanso'}</span></li>;
                })}
              </ul>
              <p className="text-xs text-gray-500 mt-3">Vigente desde {formatarData(dados.jornada.vigente_desde)} · tolerância de {dados.jornada.tolerancia_minutos} min por dia.</p>
            </>
          )}
          {dados.proximos_feriados.length > 0 && (
            <div className="mt-4"><h3 className="text-sm font-bold text-gray-900 mb-1">Próximos feriados</h3>
              <ul className="text-sm text-gray-700 space-y-0.5">{dados.proximos_feriados.map((f) => <li key={f.data}>{formatarData(f.data)} · {f.descricao}</li>)}</ul></div>
          )}
        </Cartao>
      )}
      {dados && aba === 'espelho' && (
        <Cartao>
          <div className="flex items-center justify-between gap-2 mb-3">
            <button type="button" onClick={() => setCompetencia(somarMeses(competencia, -1))} aria-label="Mês anterior" className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-gray-200"><ChevronLeft className="w-5 h-5" aria-hidden="true" /></button>
            <h2 className="font-bold text-gray-900">{rotuloMes(competencia)}</h2>
            <button type="button" onClick={() => setCompetencia(somarMeses(competencia, 1))} disabled={competencia >= inicioDoMes(hoje)} aria-label="Próximo mês" className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40"><ChevronRight className="w-5 h-5" aria-hidden="true" /></button>
          </div>
          {dias.length === 0 ? <p className="text-sm text-gray-500">Sem dias para mostrar neste mês.</p> : (
            <ul className="divide-y divide-gray-100" data-testid="espelho">
              {dias.map((d) => {
                const sinais = sinaisApuracao(d);
                return (
                  <li key={d.data} className="py-3 text-sm" data-testid="dia-espelho">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900">{DIAS_CURTOS[diaDaSemana(d.data)]} {formatarData(d.data).slice(0, 5)}{d.feriado && <span className="ml-1 text-xs font-semibold text-purple-700">Feriado</span>}</p>
                        <p className="text-gray-600">Previsto: {d.previsto ?? '—'}</p>
                        <p className="text-gray-900">Registrado: {d.registrado ?? '—'}{d.trabalhado_minutos > 0 && ` (${duracao(d.trabalhado_minutos)})`}</p>
                        {sinais.length > 0 && <p className="text-orange-700 font-semibold">{sinais.join(' · ')}</p>}
                        {d.em_andamento && <p className="text-gray-500">Em andamento</p>}
                      </div>
                      {d.situacao && <Selo tipo={SITUACOES_APURACAO[d.situacao].selo} texto={SITUACOES_APURACAO[d.situacao].rotulo} />}
                    </div>
                    {d.situacao === 'esclarecimento' && d.id_apuracao && <Responder dia={d} aoConcluir={concluido} />}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-gray-500 mt-3">Horas excedentes identificadas aqui ainda passam pela conferência do RH antes de chegar à folha.</p>
        </Cartao>
      )}
      {dados && aba === 'horas' && (() => {
        const lista = (dados.dias ?? []).filter((d) => d.excedente_minutos > 0).slice().reverse();
        const total = lista.reduce((t, d) => t + d.excedente_minutos, 0);
        return (
          <Cartao>
            <div className="flex items-center justify-between gap-2 mb-3">
              <button type="button" onClick={() => setCompetencia(somarMeses(competencia, -1))} aria-label="Mês anterior" className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-gray-200"><ChevronLeft className="w-5 h-5" aria-hidden="true" /></button>
              <h2 className="font-bold text-gray-900">{rotuloMes(competencia)}</h2>
              <button type="button" onClick={() => setCompetencia(somarMeses(competencia, 1))} disabled={competencia >= inicioDoMes(hoje)} aria-label="Próximo mês" className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40"><ChevronRight className="w-5 h-5" aria-hidden="true" /></button>
            </div>
            <div className="rounded-xl bg-orange-50 p-3 mb-3" data-testid="total-horas-extras"><p className="text-xs text-orange-800">Horas excedentes identificadas no mês</p><p className="text-2xl font-black text-orange-700">{duracao(total)}</p></div>
            {lista.length === 0 ? <p className="text-sm text-gray-500">Nenhuma hora excedente identificada neste mês.</p> : (
              <ul className="divide-y divide-gray-100" data-testid="horas-extras">
                {lista.map((d) => (
                  <li key={d.data} className="py-3 flex items-start justify-between gap-2 text-sm">
                    <div><p className="font-bold text-gray-900">{DIAS_CURTOS[diaDaSemana(d.data)]} {formatarData(d.data).slice(0, 5)}</p>
                      <p className="text-gray-600">{d.registrado ?? '—'}</p><p className="text-orange-700 font-semibold">+{duracao(d.excedente_minutos)}</p></div>
                    <Selo tipo={d.situacao ? SITUACOES_APURACAO[d.situacao].selo : 'alerta'} texto={d.situacao ? SITUACOES_APURACAO[d.situacao].rotulo : 'A conferir'} />
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-500 mt-3">O RH confere cada dia e define o tratamento (hora extra, banco de horas ou compensação) conforme o contrato. Só o que for enviado à folha entra no pagamento.</p>
          </Cartao>
        );
      })()}
      {dados && aba === 'correcoes' && (
        <Cartao titulo="Solicitações de correção" id="titulo-correcoes"
          acao={<button type="button" onClick={() => setModal(true)} className={classeBotaoPrimario}><Plus className="w-4 h-4" aria-hidden="true" />Solicitar</button>}>
          {!sols || sols.length === 0 ? <p className="text-sm text-gray-500">Nenhuma solicitação.</p> : (
            <ul className="divide-y divide-gray-100" data-testid="solicitacoes">
              {sols.map((s) => (
                <li key={s.id} className="py-3 text-sm space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900">{s.tipo === 'incluir' ? `Incluir ${TIPOS_MARCACAO[s.tipo_marcacao!].toLowerCase()} às ${s.horario?.slice(0, 5)}${s.dia_seguinte ? ' (dia seguinte)' : ''}` : 'Desconsiderar marcação'} · {formatarData(s.data)}</p>
                    <Selo tipo={SIT_SOL[s.situacao].s} texto={SIT_SOL[s.situacao].r} />
                  </div>
                  <p className="text-gray-600">Motivo: {s.motivo}</p>
                  {s.resposta && <p className="text-gray-700">Resposta do RH: {s.resposta}</p>}
                  {s.situacao === 'pendente' && <button type="button" onClick={() => cancelar(s.id)} className="min-h-9 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700">Cancelar solicitação</button>}
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      )}
      <ModalCorrecao aberto={modal} aoFechar={() => setModal(false)} hoje={hoje} aoConcluir={concluido} />
    </>
  );
}
