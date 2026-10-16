'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2, Fingerprint, MapPin, MapPinOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, hojeBrasil } from '@/lib/financeiro';
import { AVISO_REP, DIAS_SEMANA, TIPOS_MARCACAO, diaDaSemana, horaLocal, horaMarcacao, proximaMarcacao, registroUnico, type MarcacaoPonto, type TipoMarcacao } from '@/lib/portal-colaborador';
import { useColaborador } from '@/components/colaborador/LayoutColaborador';
import { Cartao, Carregando, Erro, Sucesso, campo, rotulo } from '@/components/colaborador/comum';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

type Local = { situacao: 'capturada'; lat: number; lon: number; precisao: number } | { situacao: 'negada' | 'indisponivel' } | { situacao: 'buscando' };
type Foto = { situacao: 'pendente'; blob: Blob; url: string } | { situacao: 'negada' | 'indisponivel' } | { situacao: 'camera' } | { situacao: 'iniciando' };

const seteDiasAtras = (iso: string, dias = 6) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - dias); return d.toISOString().slice(0, 10); };

function Relogio() {
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => { setAgora(new Date()); const t = setInterval(() => setAgora(new Date()), 1000); return () => clearInterval(t); }, []);
  if (!agora) return <p className="text-5xl font-black text-gray-900 tabular-nums">--:--:--</p>;
  return <p className="text-5xl font-black text-gray-900 tabular-nums" aria-live="off">{new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(agora)}</p>;
}

// Registro de ponto: hora do SERVIDOR; foto e localização opcionais, só no momento da marcação (sem monitoramento contínuo).
// Falta de câmera/GPS não impede a marcação — fica registrada como "negada"/"indisponível" para o RH conferir.
export default function MeuPontoPage() {
  const { vinculo } = useColaborador();
  const [hoje] = useState(hojeBrasil);
  const [marcacoes, setMarcacoes] = useState<MarcacaoPonto[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<TipoMarcacao>('entrada');
  const [local, setLocal] = useState<Local>({ situacao: 'buscando' });
  const [foto, setFoto] = useState<Foto>({ situacao: 'iniciando' });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const idPendente = useRef<string | null>(null); // mesmo id em nova tentativa = sem duplicidade
  const video = useRef<HTMLVideoElement>(null);
  const fluxo = useRef<MediaStream | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await createClient().rpc('meu_ponto', { p_id_funcionario: vinculo.id_funcionario, p_de: seteDiasAtras(hoje), p_ate: hoje });
    if (error) { setErroLista(mensagemDeErro(error, 'Não foi possível carregar suas marcações.')); return; }
    setErroLista(null);
    setMarcacoes((data ?? []) as MarcacaoPonto[]);
  }, [vinculo.id_funcionario, hoje]);
  useEffect(() => {
    carregar();
    const voltar = () => document.visibilityState === 'visible' && carregar();
    document.addEventListener('visibilitychange', voltar);
    return () => document.removeEventListener('visibilitychange', voltar);
  }, [carregar]);

  const pararCamera = () => { fluxo.current?.getTracks().forEach((t) => t.stop()); fluxo.current = null; };
  useEffect(() => pararCamera, []);

  async function abrir() {
    // Sem marcação hoje e turno de ontem aberto (virou a meia-noite): a sugestão continua aquele turno
    const validas = (marcacoes ?? []).filter((m) => !m.desconsiderada);
    const deHoje = validas.filter((m) => m.data_local === hoje);
    const deOntem = validas.filter((m) => m.data_local === seteDiasAtras(hoje, 1));
    setTipo(proximaMarcacao(deHoje.length || deOntem.length % 2 === 0 ? deHoje : deOntem));
    setErro(null); setAviso(null); setAberto(true);
    idPendente.current = null;
    // Localização: uma leitura só, agora
    setLocal({ situacao: 'buscando' });
    if (!window.isSecureContext || !('geolocation' in navigator)) setLocal({ situacao: 'indisponivel' });
    else navigator.geolocation.getCurrentPosition(
      (p) => setLocal({ situacao: 'capturada', lat: p.coords.latitude, lon: p.coords.longitude, precisao: p.coords.accuracy }),
      (e) => setLocal({ situacao: e.code === e.PERMISSION_DENIED ? 'negada' : 'indisponivel' }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    // Câmera
    setFoto({ situacao: 'iniciando' });
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setFoto({ situacao: 'indisponivel' }); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false });
      fluxo.current = s;
      setFoto({ situacao: 'camera' });
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); } });
    } catch (e) {
      setFoto({ situacao: (e as DOMException)?.name === 'NotAllowedError' ? 'negada' : 'indisponivel' });
    }
  }

  function capturar() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const escala = Math.min(1, 640 / v.videoWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * escala); c.height = Math.round(v.videoHeight * escala);
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      if (!b) return setFoto({ situacao: 'indisponivel' });
      pararCamera();
      setFoto({ situacao: 'pendente', blob: b, url: URL.createObjectURL(b) });
    }, 'image/jpeg', 0.8);
  }

  function fechar() {
    if (ocupado) return;
    pararCamera();
    if (foto.situacao === 'pendente') URL.revokeObjectURL(foto.url);
    setAberto(false);
  }

  async function confirmar() {
    if (ocupado || local.situacao === 'buscando' || foto.situacao === 'camera' || foto.situacao === 'iniciando') return;
    setOcupado(true); setErro(null);
    const s = createClient();
    const id = idPendente.current ?? crypto.randomUUID();
    idPendente.current = id;
    const { data, error } = await s.rpc('registrar_marcacao_ponto', {
      p_id: id, p_id_funcionario: vinculo.id_funcionario, p_tipo: tipo, p_situacao_localizacao: local.situacao,
      p_latitude: local.situacao === 'capturada' ? local.lat : null, p_longitude: local.situacao === 'capturada' ? local.lon : null,
      p_precisao: local.situacao === 'capturada' ? Math.round(local.precisao * 10) / 10 : null, p_situacao_foto: foto.situacao,
    });
    if (error) { setErro(mensagemDeErro(error, 'Não foi possível registrar. Verifique a conexão e tente novamente.')); setOcupado(false); return; }
    const r = registroUnico<{ registrado_em: string }>(data);
    let semFoto = false;
    if (foto.situacao === 'pendente') {
      const { error: e1 } = await s.storage.from('ponto').upload(`${vinculo.id_empresa}/${vinculo.id_funcionario}/${id}.jpg`, foto.blob, { contentType: 'image/jpeg', upsert: false });
      const { error: e2 } = await s.rpc('anexar_foto_marcacao', { p_id: id, p_ok: !e1 });
      semFoto = !!e1 || !!e2;
      URL.revokeObjectURL(foto.url);
    }
    idPendente.current = null;
    setOcupado(false); setAberto(false);
    setAviso(`${TIPOS_MARCACAO[tipo]} registrada às ${r ? horaLocal(r.registrado_em) : '—'}${semFoto ? ' (a foto não pôde ser enviada)' : ''}.`);
    carregar();
  }

  const porDia = (marcacoes ?? []).reduce<Record<string, MarcacaoPonto[]>>((acc, m) => { (acc[m.data_local] ??= []).push(m); return acc; }, {});
  const dias = Object.keys(porDia).sort().reverse();
  const podeConfirmar = !ocupado && local.situacao !== 'buscando' && foto.situacao !== 'camera' && foto.situacao !== 'iniciando';

  return (
    <>
      <h1 className="text-2xl font-black text-gray-900">Meu ponto</h1>
      <Cartao>
        <div className="text-center space-y-3">
          <p className="text-sm text-gray-500">{DIAS_SEMANA[diaDaSemana(hoje)]}, {formatarData(hoje)}</p>
          <Relogio />
          <p className="text-xs text-gray-500">O horário registrado é o do servidor, não o do seu aparelho.</p>
          <button type="button" onClick={abrir} disabled={marcacoes === null} className={`${classeBotaoPrimario} w-full sm:w-auto min-h-14 text-base`}>
            <Fingerprint className="w-5 h-5" aria-hidden="true" />Registrar ponto</button>
        </div>
      </Cartao>
      <Sucesso texto={aviso} />
      <Cartao titulo="Últimos 7 dias" id="titulo-ultimos">
        {erroLista ? <Erro texto={erroLista} /> : marcacoes === null ? <Carregando rotulo="Carregando marcações" /> : dias.length === 0 ? <p className="text-sm text-gray-500">Nenhuma marcação nos últimos 7 dias.</p> : (
          <ul className="divide-y divide-gray-100" data-testid="lista-marcacoes">
            {dias.map((d) => (
              <li key={d} className="py-3">
                <p className="text-sm font-bold text-gray-900 mb-1">{DIAS_SEMANA[diaDaSemana(d)]}, {formatarData(d)}</p>
                <ul className="flex flex-wrap gap-2">{porDia[d].map((m) => (
                  <li key={m.id} className={`text-xs rounded-lg border px-2.5 py-1.5 ${m.desconsiderada ? 'border-gray-200 text-gray-400 line-through' : 'border-gray-200 text-gray-800'}`}>
                    <strong>{horaMarcacao(m.registrado_em, m.data_local)}</strong> · {TIPOS_MARCACAO[m.tipo]}{m.origem === 'correcao' && ' · correção'}
                    {m.origem === 'portal' && <span className="sr-only">{m.situacao_foto === 'capturada' ? ', com foto' : ', sem foto'}{m.situacao_localizacao === 'capturada' || m.situacao_localizacao === 'imprecisa' ? ', com localização' : ', sem localização'}</span>}
                  </li>))}</ul>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      <p className="text-xs text-gray-500">{AVISO_REP} Foto e localização são usadas só para comprovar a marcação e ficam visíveis apenas para você e o RH da empresa.</p>

      <Modal aberto={aberto} aoFechar={fechar} titulo="Registrar ponto"
        rodape={<div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button type="button" onClick={fechar} disabled={ocupado} className={classeBotaoSecundario}>Cancelar</button>
          <button type="button" onClick={confirmar} disabled={!podeConfirmar} className={classeBotaoPrimario}>{ocupado ? 'Registrando…' : `Registrar ${TIPOS_MARCACAO[tipo].toLowerCase()}`}</button>
        </div>}>
        <div className="space-y-4">
          <div>
            <label htmlFor="tipo-marcacao" className={rotulo}>Tipo de marcação</label>
            <select id="tipo-marcacao" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMarcacao)} className={campo}>
              {Object.entries(TIPOS_MARCACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="rounded-xl bg-gray-50 p-3" data-testid="foto-marcacao">
            {foto.situacao === 'camera' && (
              <div className="space-y-2">
                <video ref={video} playsInline muted className="w-full max-h-72 rounded-lg bg-black object-cover" aria-label="Pré-visualização da câmera" />
                <div className="flex flex-col sm:flex-row gap-2">
                  <button type="button" onClick={capturar} className={`${classeBotaoPrimario} flex-1`}><Camera className="w-4 h-4" aria-hidden="true" />Tirar foto</button>
                  <button type="button" onClick={() => { pararCamera(); setFoto({ situacao: 'indisponivel' }); }} className={`${classeBotaoSecundario} flex-1`}>Continuar sem foto</button>
                </div>
              </div>
            )}
            {foto.situacao === 'pendente' && (
              // eslint-disable-next-line @next/next/no-img-element
              <div className="flex items-center gap-3"><img src={foto.url} alt="Foto capturada para a marcação" className="w-20 h-20 rounded-lg object-cover" />
                <p className="text-sm text-green-700 inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" aria-hidden="true" />Foto capturada agora</p></div>
            )}
            {foto.situacao === 'iniciando' && <p className="text-sm text-gray-600" role="status">Abrindo a câmera…</p>}
            {(foto.situacao === 'negada' || foto.situacao === 'indisponivel') && (
              <p className="text-sm text-gray-700 inline-flex items-start gap-2"><CameraOff className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                {foto.situacao === 'negada' ? 'Câmera não autorizada.' : 'Câmera indisponível.'} A marcação será registrada sem foto e o RH verá essa informação.</p>
            )}
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-sm" data-testid="local-marcacao">
            {local.situacao === 'buscando' && <p role="status" className="text-gray-600 inline-flex items-center gap-2"><MapPin className="w-4 h-4" aria-hidden="true" />Obtendo localização…</p>}
            {local.situacao === 'capturada' && <p className="text-green-700 inline-flex items-center gap-2"><MapPin className="w-4 h-4" aria-hidden="true" />Localização obtida (precisão de {Math.round(local.precisao)} m)</p>}
            {(local.situacao === 'negada' || local.situacao === 'indisponivel') && (
              <p className="text-gray-700 inline-flex items-start gap-2"><MapPinOff className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                {local.situacao === 'negada' ? 'Localização não autorizada.' : 'Localização indisponível.'} A marcação será registrada sem localização.</p>
            )}
          </div>
          <Erro texto={erro} />
        </div>
      </Modal>
    </>
  );
}
