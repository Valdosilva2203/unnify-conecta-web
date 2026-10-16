'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Mail, ShieldOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, hojeBrasil } from '@/lib/financeiro';
import { DIAS_SEMANA, type Escala } from '@/lib/portal-colaborador';
import type { Funcionario } from '@/lib/funcionarios';
import { Selo } from '@/components/admin/tabela';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
const Erro = ({ texto }: { texto: string | null }) => (texto ? <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{texto}</p> : null);

interface Situacao { situacao: 'sem_convite' | 'convite_pendente' | 'convite_expirado' | 'ativo' | 'revogado'; email: string | null; convite_expira_em: string | null; convite_enviado: boolean | null; ativado_em: string | null; revogado_em: string | null; motivo_revogacao: string | null }
interface Jornada { id: string; vigente_desde: string; escala: Escala; tolerancia_minutos: number; intervalo_minimo_minutos: number; limite_sem_intervalo_minutos: number; tratamento_excedente: 'conferir' | 'hora_extra' | 'banco_horas' }
const SIT: Record<Situacao['situacao'], { r: string; s: 'sucesso' | 'alerta' | 'perigo' | 'neutro' | 'info' }> = {
  sem_convite: { r: 'Sem acesso', s: 'neutro' }, convite_pendente: { r: 'Convite enviado', s: 'info' }, convite_expirado: { r: 'Convite expirado', s: 'alerta' },
  ativo: { r: 'Acesso ativo', s: 'sucesso' }, revogado: { r: 'Acesso revogado', s: 'perigo' },
};
const PADRAO: Escala = { 0: [], 1: [['08:00', '12:00'], ['13:00', '17:00']], 2: [['08:00', '12:00'], ['13:00', '17:00']], 3: [['08:00', '12:00'], ['13:00', '17:00']], 4: [['08:00', '12:00'], ['13:00', '17:00']], 5: [['08:00', '12:00'], ['13:00', '17:00']], 6: [] };

function ModalConvite({ funcionario: f, situacao, aoFechar, aoConcluir }: { funcionario: Funcionario; situacao: Situacao; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const [email, setEmail] = useState(situacao.email ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function enviar() {
    if (ocupado) return;
    setErro(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErro('Informe um e-mail válido.');
    setOcupado(true);
    const r = await fetch('/api/colaborador/convites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id_funcionario: f.id, email: email.trim() }) }).catch(() => null);
    const corpo = await r?.json().catch(() => ({}));
    setOcupado(false);
    if (!r?.ok) return setErro(corpo?.erro ?? 'Não foi possível enviar o convite.');
    aoConcluir(corpo.enviado ? `Convite enviado para ${email.trim().toLowerCase()}.` : 'Convite criado, mas o e-mail não pôde ser enviado agora. Tente reenviar em alguns minutos.');
  }
  return (
    <Modal aberto aoFechar={aoFechar} titulo="Convidar para o Portal" descricao={`${f.nome} receberá um link seguro (válido por 7 dias, uso único) para definir a própria senha.`}
      rodape={<div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <button type="button" onClick={aoFechar} className={classeBotaoSecundario}>Cancelar</button>
        <button type="button" onClick={enviar} disabled={ocupado} className={classeBotaoPrimario}>{ocupado ? 'Enviando…' : 'Enviar convite'}</button></div>}>
      <div className="space-y-3">
        <div><label htmlFor="email-portal" className={rotulo}>E-mail do colaborador</label>
          <input id="email-portal" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} className={campo} /></div>
        <p className="text-xs text-gray-500">O e-mail fica no cadastro do funcionário. O acesso só é liberado quando o próprio colaborador abre o link e confirma com uma conta deste e-mail. Um convite anterior pendente é cancelado.</p>
        <Erro texto={erro} />
      </div>
    </Modal>
  );
}

function ModalRevogar({ funcionario: f, aoFechar, aoConcluir }: { funcionario: Funcionario; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function revogar() {
    if (ocupado) return;
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('revogar_acesso_colaborador', { p_id_funcionario: f.id, p_motivo: motivo });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível revogar o acesso.'));
    aoConcluir('Acesso ao portal revogado.');
  }
  return (
    <Modal aberto aoFechar={aoFechar} titulo="Revogar acesso ao portal" descricao={`${f.nome} perde o acesso imediatamente. As marcações já registradas são mantidas.`}
      rodape={<div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <button type="button" onClick={aoFechar} className={classeBotaoSecundario}>Cancelar</button>
        <button type="button" onClick={revogar} disabled={ocupado} className={classeBotaoPerigo}>{ocupado ? 'Revogando…' : 'Revogar acesso'}</button></div>}>
      <div className="space-y-3">
        <div><label htmlFor="motivo-revogar" className={rotulo}>Motivo</label>
          <textarea id="motivo-revogar" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} rows={3} className={`${campo} h-auto py-2`} /></div>
        <Erro texto={erro} />
      </div>
    </Modal>
  );
}

function ModalJornada({ funcionario: f, atual, aoFechar, aoConcluir }: { funcionario: Funcionario; atual: Jornada | null; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const [escala, setEscala] = useState<Escala>(atual?.escala ?? PADRAO);
  const [desde, setDesde] = useState(hojeBrasil());
  const [tolerancia, setTolerancia] = useState(String(atual?.tolerancia_minutos ?? 10));
  const [intervalo, setIntervalo] = useState(String(atual?.intervalo_minimo_minutos ?? 60));
  const [limite, setLimite] = useState(String(Math.round((atual?.limite_sem_intervalo_minutos ?? 360) / 60)));
  const [tratamento, setTratamento] = useState<Jornada['tratamento_excedente']>(atual?.tratamento_excedente ?? 'conferir');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const definir = (d: number, i: number, j: 0 | 1, v: string) => setEscala((e) => {
    const lista = (e[String(d)] ?? []).map((p) => [...p] as [string, string]);
    lista[i][j] = v;
    return { ...e, [String(d)]: lista };
  });
  const alternarDia = (d: number) => setEscala((e) => ({ ...e, [String(d)]: (e[String(d)] ?? []).length ? [] : [['08:00', '12:00'], ['13:00', '17:00']] }));
  async function salvar() {
    if (ocupado) return;
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('salvar_jornada_funcionario', {
      p_id_funcionario: f.id, p_vigente_desde: desde, p_escala: escala, p_tolerancia: Number(tolerancia), p_intervalo_minimo: Number(intervalo),
      p_limite_sem_intervalo: Math.round(Number(limite) * 60), p_tratamento: tratamento,
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar a jornada.'));
    aoConcluir('Jornada salva. Use "Atualizar apuração" no Controle de ponto para recalcular os dias.');
  }
  return (
    <Modal aberto aoFechar={aoFechar} tamanho="lg" titulo="Jornada de trabalho" descricao={`Horários previstos de ${f.nome}. A apuração do ponto compara as marcações com esta jornada.`}
      rodape={<div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <button type="button" onClick={aoFechar} className={classeBotaoSecundario}>Cancelar</button>
        <button type="button" onClick={salvar} disabled={ocupado} className={classeBotaoPrimario}>{ocupado ? 'Salvando…' : 'Salvar jornada'}</button></div>}>
      <div className="space-y-4">
        <ul className="space-y-2" data-testid="editor-escala">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const per = escala[String(d)] ?? [];
            return (
              <li key={d} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900">{DIAS_SEMANA[d]}</span>
                  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={per.length > 0} onChange={() => alternarDia(d)} className="w-5 h-5 accent-orange-600" />Dia de trabalho</label>
                </div>
                {per.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {per.map((p, i) => (
                      <fieldset key={i} className="flex items-center gap-1 text-sm min-w-0">
                        <legend className="sr-only">{DIAS_SEMANA[d]}, período {i + 1}</legend>
                        <input type="time" aria-label={`${DIAS_SEMANA[d]} período ${i + 1} início`} value={p[0]} onChange={(e) => definir(d, i, 0, e.target.value)} className={`${campo} px-2`} />
                        <span aria-hidden="true">–</span>
                        <input type="time" aria-label={`${DIAS_SEMANA[d]} período ${i + 1} fim`} value={p[1]} onChange={(e) => definir(d, i, 1, e.target.value)} className={`${campo} px-2`} />
                        {p[1] && p[0] && p[1] < p[0] && <span className="text-xs font-semibold text-purple-700 shrink-0" title="Termina no dia seguinte">+1</span>}
                      </fieldset>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label htmlFor="jornada-desde" className={rotulo}>Vale a partir de</label><input id="jornada-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={campo} /></div>
          <div><label htmlFor="jornada-tol" className={rotulo}>Tolerância por dia (min)</label><input id="jornada-tol" type="number" inputMode="numeric" min={0} max={60} value={tolerancia} onChange={(e) => setTolerancia(e.target.value)} className={campo} /></div>
          <div><label htmlFor="jornada-int" className={rotulo}>Intervalo mínimo (min)</label><input id="jornada-int" type="number" inputMode="numeric" min={0} max={240} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} className={campo} /></div>
          <div><label htmlFor="jornada-lim" className={rotulo}>Exigir intervalo acima de (horas)</label><input id="jornada-lim" type="number" inputMode="numeric" min={1} max={12} value={limite} onChange={(e) => setLimite(e.target.value)} className={campo} /></div>
          <div className="sm:col-span-2"><label htmlFor="jornada-trat" className={rotulo}>Horas excedentes (sugestão na conferência)</label>
            <select id="jornada-trat" value={tratamento} onChange={(e) => setTratamento(e.target.value as Jornada['tratamento_excedente'])} className={campo}>
              <option value="conferir">Decidir caso a caso</option><option value="hora_extra">Hora extra</option><option value="banco_horas">Banco de horas</option></select></div>
        </div>
        <p className="text-xs text-gray-500">Configure conforme o contrato e a convenção coletiva da empresa. O sistema não presume regras trabalhistas: tudo passa pela conferência do RH. Para turno que passa da meia-noite (ex.: 22:00–06:00), use fim menor que o início no último período do dia: o turno conta no dia em que começou. Adicional noturno não é calculado automaticamente.</p>
        <Erro texto={erro} />
      </div>
    </Modal>
  );
}

// Visão geral do colaborador (RH): acesso ao Portal do Colaborador e jornada configurada
export function PortalJornada({ funcionario: f, versao, aoAlterado }: { funcionario: Funcionario; versao: number; aoAlterado: (m: string) => void }) {
  const [sit, setSit] = useState<Situacao | null>(null);
  const [jornada, setJornada] = useState<Jornada | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [modal, setModal] = useState<'convite' | 'revogar' | 'jornada' | null>(null);
  const carregar = useCallback(async () => {
    const s = createClient();
    const [a, j] = await Promise.all([
      s.rpc('situacao_portal_funcionario', { p_id_funcionario: f.id }),
      s.from('jornadas_funcionario').select('id, vigente_desde, escala, tolerancia_minutos, intervalo_minimo_minutos, limite_sem_intervalo_minutos, tratamento_excedente')
        .eq('id_funcionario', f.id).lte('vigente_desde', hojeBrasil()).order('vigente_desde', { ascending: false }).limit(1),
    ]);
    if (a.error) { setErro(mensagemDeErro(a.error, 'Portal do colaborador indisponível.')); return; }
    setErro(null);
    setSit(((a.data as Situacao[] | null)?.[0]) ?? null);
    setJornada(((j.data ?? []) as Jornada[])[0] ?? null);
  }, [f.id]);
  useEffect(() => { carregar(); }, [carregar, versao]);
  const concluir = (m: string) => { setModal(null); aoAlterado(m); carregar(); };
  async function cancelarConvite() {
    const { error } = await createClient().rpc('revogar_convite_colaborador', { p_id_funcionario: f.id });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível cancelar o convite.'));
    concluir('Convite cancelado.');
  }
  if (erro) return <p className="text-sm text-gray-500">{erro}</p>;
  if (!sit) return <div role="status" aria-label="Carregando portal do colaborador" className="h-16 rounded-lg bg-gray-50 animate-pulse" />;
  const ativoFunc = f.status === 'ativo';
  const resumoEscala = jornada ? [1, 2, 3, 4, 5, 6, 0].filter((d) => (jornada.escala[String(d)] ?? []).length).map((d) => DIAS_SEMANA[d].slice(0, 3)).join(', ') : null;
  return (
    <div className="space-y-3" data-testid="portal-jornada">
      <div className="rounded-xl border border-gray-100 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2"><p className="font-bold text-gray-900 text-sm">Portal do colaborador</p><Selo tipo={SIT[sit.situacao].s} texto={SIT[sit.situacao].r} /></div>
        <p className="text-xs text-gray-600 break-all">
          {sit.situacao === 'ativo' && `Ativado em ${formatarData(sit.ativado_em?.slice(0, 10))} · ${sit.email ?? ''}`}
          {sit.situacao === 'convite_pendente' && `Enviado para ${sit.email} · válido até ${formatarData(sit.convite_expira_em?.slice(0, 10))}${sit.convite_enviado === false ? ' · e-mail não entregue' : ''}`}
          {sit.situacao === 'convite_expirado' && `O convite para ${sit.email} expirou.`}
          {sit.situacao === 'revogado' && `Revogado em ${formatarData(sit.revogado_em?.slice(0, 10))}${sit.motivo_revogacao ? ` · ${sit.motivo_revogacao}` : ''}`}
          {sit.situacao === 'sem_convite' && 'O colaborador ainda não foi convidado.'}
        </p>
        {ativoFunc && (
          <div className="flex flex-wrap gap-2">
            {sit.situacao !== 'ativo' && <button type="button" onClick={() => setModal('convite')} className={`${classeBotaoPrimario} flex-1`}><Mail className="w-4 h-4" aria-hidden="true" />{sit.situacao === 'sem_convite' ? 'Convidar para o Portal' : 'Reenviar convite'}</button>}
            {sit.situacao === 'convite_pendente' && <button type="button" onClick={cancelarConvite} className={`${classeBotaoSecundario} flex-1`}>Cancelar convite</button>}
            {sit.situacao === 'ativo' && <button type="button" onClick={() => setModal('revogar')} className={`${classeBotaoSecundario} flex-1`}><ShieldOff className="w-4 h-4" aria-hidden="true" />Revogar acesso</button>}
          </div>
        )}
      </div>
      <div className="rounded-xl border border-gray-100 p-3 space-y-2">
        <p className="font-bold text-gray-900 text-sm">Jornada de trabalho</p>
        <p className="text-xs text-gray-600">{jornada ? `${resumoEscala || 'Sem dias de trabalho'} · tolerância ${jornada.tolerancia_minutos} min · desde ${formatarData(jornada.vigente_desde)}` : 'Não configurada: o ponto é registrado, mas não é apurado.'}</p>
        {ativoFunc && <button type="button" onClick={() => setModal('jornada')} className={`${classeBotaoSecundario} w-full`}><CalendarClock className="w-4 h-4" aria-hidden="true" />{jornada ? 'Alterar jornada' : 'Configurar jornada'}</button>}
      </div>
      {modal === 'convite' && <ModalConvite funcionario={f} situacao={sit} aoFechar={() => setModal(null)} aoConcluir={concluir} />}
      {modal === 'revogar' && <ModalRevogar funcionario={f} aoFechar={() => setModal(null)} aoConcluir={concluir} />}
      {modal === 'jornada' && <ModalJornada funcionario={f} atual={jornada ?? null} aoFechar={() => setModal(null)} aoConcluir={concluir} />}
    </div>
  );
}
