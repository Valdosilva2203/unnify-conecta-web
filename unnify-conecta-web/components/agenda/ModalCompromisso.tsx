'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { CATEGORIAS, diaDe, horaDe, paraInstante, somarDias, type CategoriaCompromisso, type EventoAgenda } from '@/lib/agenda';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';

type Visibilidade = 'privado' | 'empresa' | 'compartilhado';
// Criar/editar compromisso. O banco valida tudo de novo (salvar_compromisso): acesso, datas, categoria, responsável, visibilidade.
// Empresário: idEmpresa fixo. Contador: empresasContador = empresas com "gerenciar_agenda"; "pessoal" = sem empresa (só ele vê).
export function ModalCompromisso({ aberto, aoFechar, idEmpresa, empresasContador, empresaPadrao, permitirPessoal = true, diaPadrao, evento, membros, idUsuario, aoSalvar }: {
  aberto: boolean; aoFechar: () => void; idEmpresa: string | null; empresasContador?: { id: string; nome: string }[]; empresaPadrao?: string; permitirPessoal?: boolean;
  diaPadrao: string; evento: EventoAgenda | null;
  membros: { id_usuario: string; nome: string }[]; idUsuario: string; aoSalvar: (m: string) => void;
}) {
  const modoContador = !!empresasContador;
  const [empresaSel, setEmpresaSel] = useState(''); // '' = compromisso pessoal (só contador)
  const [membrosContador, setMembrosContador] = useState<{ id_usuario: string; nome: string }[]>([]);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [local, setLocal] = useState('');
  const [diaIni, setDiaIni] = useState(diaPadrao);
  const [horaIni, setHoraIni] = useState('09:00');
  const [diaFim, setDiaFim] = useState(diaPadrao);
  const [horaFim, setHoraFim] = useState('10:00');
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [categoria, setCategoria] = useState<CategoriaCompromisso>('reuniao');
  const [status, setStatus] = useState('agendado');
  const [responsavel, setResponsavel] = useState(idUsuario);
  const [visibilidade, setVisibilidade] = useState<Visibilidade>('privado');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErro(null);
    if (evento) {
      setTitulo(evento.titulo); setDescricao(evento.descricao ?? ''); setLocal(evento.local ?? '');
      setDiaInteiro(evento.dia_inteiro);
      setDiaIni(diaDe(evento.inicio)); setHoraIni(horaDe(evento.inicio));
      const fimExibido = evento.dia_inteiro ? new Date(new Date(evento.fim).getTime() - 1) : new Date(evento.fim);
      setDiaFim(diaDe(fimExibido)); setHoraFim(horaDe(evento.fim));
      setCategoria(evento.categoria as CategoriaCompromisso); setStatus(evento.status_origem);
      setResponsavel(evento.id_responsavel ?? ''); setVisibilidade(evento.visibilidade ?? 'empresa'); setEmpresaSel(evento.id_empresa ?? '');
    } else {
      setTitulo(''); setDescricao(''); setLocal(''); setDiaInteiro(false);
      setDiaIni(diaPadrao); setHoraIni('09:00'); setDiaFim(diaPadrao); setHoraFim('10:00');
      setCategoria('reuniao'); setStatus('agendado'); setResponsavel(idUsuario); setVisibilidade('privado'); setEmpresaSel(empresaPadrao ?? '');
    }
  }, [aberto, evento, diaPadrao, idUsuario, empresaPadrao]);

  // Contador: participantes da empresa escolhida (ele mesmo + donos/sócios)
  useEffect(() => {
    if (!aberto || !modoContador || !empresaSel) { setMembrosContador([]); return; }
    let ativo = true;
    createClient().rpc('membros_agenda', { p_id_empresa: empresaSel }).then(({ data }) => { if (ativo) setMembrosContador((data ?? []) as { id_usuario: string; nome: string }[]); });
    return () => { ativo = false; };
  }, [aberto, modoContador, empresaSel]);
  const escolherEmpresa = (id: string) => { setEmpresaSel(id); setResponsavel(idUsuario); setVisibilidade('privado'); };
  const idEmpresaEnvio = modoContador ? empresaSel || null : idEmpresa;
  const listaMembros = modoContador ? membrosContador : membros;
  const mostrarResponsavel = !modoContador || !!empresaSel;

  const salvar = async () => {
    if (titulo.trim().length < 2) return setErro('Informe o título.');
    if (!diaIni || !diaFim) return setErro('Informe as datas.');
    const inicio = diaInteiro ? paraInstante(diaIni, '00:00') : paraInstante(diaIni, horaIni);
    const fim = diaInteiro ? paraInstante(somarDias(diaFim, 1), '00:00') : paraInstante(diaFim, horaFim);
    if (new Date(fim) <= new Date(inicio)) return setErro('O término deve ser depois do início.');
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('salvar_compromisso', {
      p_id: evento?.id ?? null, p_id_empresa: idEmpresaEnvio, p_titulo: titulo, p_descricao: descricao || null, p_local: local || null,
      p_inicio: inicio, p_fim: fim, p_dia_inteiro: diaInteiro, p_categoria: categoria, p_status: evento ? status : 'agendado',
      p_id_responsavel: mostrarResponsavel ? responsavel || null : null, p_visibilidade: modoContador && !empresaSel ? 'privado' : visibilidade,
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar o compromisso.'));
    aoSalvar(evento ? 'Compromisso atualizado.' : 'Compromisso criado.');
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={evento ? 'Editar compromisso' : 'Novo compromisso'}
      rodape={<>
        <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando...' : 'Salvar'}</button>
      </>}>
      <div className="space-y-4">
        {erro && <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
        <div>
          <label htmlFor="comp-titulo" className={rotulo}>Título <span className="text-red-600">*</span></label>
          <input id="comp-titulo" maxLength={120} placeholder="Ex.: Reunião com cliente" value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} />
        </div>
        <div>
          <label htmlFor="comp-descricao" className={rotulo}>Descrição</label>
          <textarea id="comp-descricao" rows={2} maxLength={2000} placeholder="Adicione detalhes do compromisso..." value={descricao} onChange={(e) => setDescricao(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <label className="flex items-center gap-2 min-h-11 cursor-pointer text-sm text-gray-800">
          <input type="checkbox" className="w-5 h-5 accent-orange-600" checked={diaInteiro} onChange={(e) => setDiaInteiro(e.target.checked)} />Dia inteiro
        </label>
        <div className="grid sm:grid-cols-2 gap-4">
          <fieldset>
            <legend className={rotulo}>Início <span className="text-red-600">*</span></legend>
            <div className="flex gap-2">
              <input type="date" aria-label="Data de início" value={diaIni} onChange={(e) => { setDiaIni(e.target.value); if (e.target.value > diaFim) setDiaFim(e.target.value); }} className={`${campo} flex-1 min-w-0`} />
              {!diaInteiro && <input type="time" aria-label="Hora de início" value={horaIni} onChange={(e) => setHoraIni(e.target.value)} className={`${campo} w-28`} />}
            </div>
          </fieldset>
          <fieldset>
            <legend className={rotulo}>Término <span className="text-red-600">*</span></legend>
            <div className="flex gap-2">
              <input type="date" aria-label="Data de término" value={diaFim} onChange={(e) => setDiaFim(e.target.value)} className={`${campo} flex-1 min-w-0`} />
              {!diaInteiro && <input type="time" aria-label="Hora de término" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className={`${campo} w-28`} />}
            </div>
          </fieldset>
        </div>
        {modoContador && (
          <div>
            <label htmlFor="comp-empresa" className={rotulo}>Empresa</label>
            <select id="comp-empresa" value={empresaSel} disabled={!!evento} onChange={(e) => escolherEmpresa(e.target.value)} className={`${campo} disabled:bg-gray-50`}>
              {permitirPessoal && <option value="">Pessoal (só eu vejo)</option>}
              {(empresasContador ?? []).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              {evento?.id_empresa && !(empresasContador ?? []).some((x) => x.id === evento.id_empresa) && <option value={evento.id_empresa}>{evento.empresa_nome ?? 'Empresa'}</option>}
            </select>
            {(empresasContador ?? []).length === 0 && <p className="text-xs text-gray-500 mt-1">Para compartilhar com uma empresa, ela precisa liberar a permissão &quot;Agenda compartilhada&quot; no seu vínculo.</p>}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="comp-categoria" className={rotulo}>Categoria <span className="text-red-600">*</span></label>
            <select id="comp-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaCompromisso)} className={campo}>
              {Object.entries(CATEGORIAS).map(([v, c]) => <option key={v} value={v}>{c.rotulo}</option>)}
            </select>
          </div>
          {mostrarResponsavel && (
            <div>
              <label htmlFor="comp-responsavel" className={rotulo}>Responsável</label>
              <select id="comp-responsavel" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={campo}>
                {listaMembros.map((m) => <option key={m.id_usuario} value={m.id_usuario}>{m.nome}</option>)}
              </select>
            </div>
          )}
          {mostrarResponsavel && (
            <div>
              <label htmlFor="comp-visibilidade" className={rotulo}>Visibilidade</label>
              <select id="comp-visibilidade" value={visibilidade} onChange={(e) => setVisibilidade(e.target.value as Visibilidade)} className={campo}>
                {modoContador ? (
                  <>
                    <option value="privado">Só eu (a empresa não vê)</option>
                    <option value="compartilhado">Compartilhado com a empresa</option>
                  </>
                ) : (
                  <>
                    <option value="privado">Privado (eu e o responsável)</option>
                    <option value="empresa">Empresa (todos os membros)</option>
                    <option value="compartilhado">Empresa e meu contador (compartilhado)</option>
                  </>
                )}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="comp-local" className={rotulo}>Local</label>
            <input id="comp-local" maxLength={120} placeholder="Escritório, online..." value={local} onChange={(e) => setLocal(e.target.value)} className={campo} />
          </div>
          {evento && (
            <div>
              <label htmlFor="comp-status" className={rotulo}>Status</label>
              <select id="comp-status" value={status} onChange={(e) => setStatus(e.target.value)} className={campo}>
                <option value="agendado">Agendado</option><option value="confirmado">Confirmado</option>
                <option value="concluido">Concluído</option><option value="cancelado">Cancelado</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
