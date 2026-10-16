'use client';

import { useEffect, useState } from 'react';
import { Pause, Pencil, Play, Plus, Square } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarMoeda, mascaraMoeda, paraDecimal, rotuloMes, valorParaMascara } from '@/lib/financeiro';
import { paraPercentual, textoPercentual, valorPercentual, type Funcionario, type LinhaFolha } from '@/lib/funcionarios';
import { Selo } from '@/components/admin/tabela';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

// Lançamentos recorrentes (migration 055): configurados uma vez, aplicados pelo banco em cada competência aberta.
// A tela só envia a configuração; geração, cálculo, unicidade e proteção de meses fechados ficam no banco.
const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
const Erro = ({ texto }: { texto: string | null }) => (texto ? <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{texto}</p> : null);

export interface Recorrencia {
  id: string; tipo: 'adicional' | 'desconto'; descricao: string; modalidade: 'fixo' | 'percentual'; valor: number | null; percentual: number | null;
  competencia_inicial: string; competencia_final: string | null; suspensa_de: string | null; suspensa_ate: string | null;
  situacao: 'ativa' | 'suspensa' | 'encerrada'; observacoes: string | null; versao: number;
}
const SITUACAO: Record<Recorrencia['situacao'], { rotulo: string; selo: 'sucesso' | 'alerta' | 'neutro' }> = {
  ativa: { rotulo: 'Ativo', selo: 'sucesso' }, suspensa: { rotulo: 'Suspenso', selo: 'alerta' }, encerrada: { rotulo: 'Encerrado', selo: 'neutro' },
};
const mes = (iso: string | null) => (iso ? iso.slice(0, 7) : '');
const deMes = (v: string) => (v ? `${v}-01` : null);
const curto = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function SecaoRecorrentes({ funcionario: f, linha, competencia, versao, aoAlterar }: {
  funcionario: Funcionario; linha: LinhaFolha; competencia: string; versao: number; aoAlterar: (m: string) => void;
}) {
  const [lista, setLista] = useState<Recorrencia[] | null>(null);
  const [editando, setEditando] = useState<Recorrencia | 'nova' | null>(null);
  const [acao, setAcao] = useState<{ tipo: 'suspender' | 'reativar' | 'encerrar'; r: Recorrencia } | null>(null);
  useEffect(() => {
    createClient().from('recorrencias_folha').select('id, tipo, descricao, modalidade, valor, percentual, competencia_inicial, competencia_final, suspensa_de, suspensa_ate, situacao, observacoes, versao')
      .eq('id_funcionario', f.id).order('situacao').order('criado_em').then(({ data }) => setLista((data ?? []) as Recorrencia[]));
  }, [f.id, versao]);
  const base = Number(linha.salario_base);
  const concluir = (m: string) => { setEditando(null); setAcao(null); aoAlterar(m); };
  return (
    <section aria-label="Lançamentos recorrentes" className="space-y-2 border-t border-gray-100 pt-3">
      <h3 className="text-sm font-bold text-gray-900">Lançamentos recorrentes</h3>
      {lista === null ? <div className="h-12 rounded-lg bg-gray-50 animate-pulse" /> : lista.length === 0 ? <p className="text-sm text-gray-500">Nenhum lançamento recorrente.</p> : (
        <ul className="divide-y divide-gray-100 text-sm">
          {lista.map((r) => {
            const mensal = r.modalidade === 'fixo' ? Number(r.valor) : valorPercentual(base, String(r.percentual));
            return (
              <li key={r.id} className="py-2 space-y-1" data-testid="recorrente">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-medium text-gray-900 break-words">{r.descricao}</span>
                    <span className="block text-xs text-gray-500">
                      {r.tipo === 'adicional' ? 'Adicional' : 'Desconto'} · {r.modalidade === 'fixo' ? 'Valor fixo' : `${textoPercentual(Number(r.percentual))} do salário-base`} · desde {curto(r.competencia_inicial)}
                      {r.competencia_final ? ` até ${curto(r.competencia_final)}` : ''}{r.situacao === 'suspensa' && r.suspensa_de ? ` · suspenso de ${curto(r.suspensa_de)}${r.suspensa_ate ? ` a ${curto(r.suspensa_ate)}` : ''}` : ''}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className={`block ${r.tipo === 'adicional' ? 'text-green-700' : 'text-red-700'}`}>{r.tipo === 'adicional' ? '+' : '−'} {formatarMoeda(mensal)}<span className="text-xs text-gray-500">/mês</span></span>
                    <Selo tipo={SITUACAO[r.situacao].selo} texto={SITUACAO[r.situacao].rotulo} />
                  </span>
                </div>
                {r.situacao !== 'encerrada' && (
                  <div className="flex flex-wrap gap-1">
                    <button type="button" onClick={() => setEditando(r)} aria-label={`Editar ${r.descricao}`} className="min-h-9 px-2 inline-flex items-center gap-1 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100"><Pencil className="w-3.5 h-3.5" aria-hidden="true" />Editar</button>
                    {r.situacao === 'ativa'
                      ? <button type="button" onClick={() => setAcao({ tipo: 'suspender', r })} aria-label={`Suspender ${r.descricao}`} className="min-h-9 px-2 inline-flex items-center gap-1 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100"><Pause className="w-3.5 h-3.5" aria-hidden="true" />Suspender</button>
                      : <button type="button" onClick={() => setAcao({ tipo: 'reativar', r })} aria-label={`Reativar ${r.descricao}`} className="min-h-9 px-2 inline-flex items-center gap-1 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100"><Play className="w-3.5 h-3.5" aria-hidden="true" />Reativar</button>}
                    <button type="button" onClick={() => setAcao({ tipo: 'encerrar', r })} aria-label={`Encerrar ${r.descricao}`} className="min-h-9 px-2 inline-flex items-center gap-1 rounded-lg text-xs font-semibold text-red-700 hover:bg-red-50"><Square className="w-3.5 h-3.5" aria-hidden="true" />Encerrar</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {f.status === 'ativo' && <button type="button" onClick={() => setEditando('nova')} className={`${classeBotaoSecundario} w-full`}><Plus className="w-4 h-4" aria-hidden="true" />Novo recorrente</button>}
      <ModalRecorrencia aberto={editando !== null} recorrencia={editando === 'nova' ? null : editando} funcionario={f} base={base} competencia={competencia} aoFechar={() => setEditando(null)} aoConcluir={concluir} />
      <ModalAcaoRecorrencia acao={acao} competencia={competencia} aoFechar={() => setAcao(null)} aoConcluir={concluir} />
    </section>
  );
}

function ModalRecorrencia({ aberto, recorrencia: r, funcionario: f, base, competencia, aoFechar, aoConcluir }: {
  aberto: boolean; recorrencia: Recorrencia | null; funcionario: Funcionario; base: number; competencia: string; aoFechar: () => void; aoConcluir: (m: string) => void;
}) {
  const [tipo, setTipo] = useState<'adicional' | 'desconto'>('adicional');
  const [descricao, setDescricao] = useState('');
  const [modalidade, setModalidade] = useState<'fixo' | 'percentual'>('fixo');
  const [valor, setValor] = useState('');
  const [percentual, setPercentual] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setTipo(r?.tipo ?? 'adicional'); setDescricao(r?.descricao ?? ''); setModalidade(r?.modalidade ?? 'fixo');
    setValor(r?.valor != null ? valorParaMascara(Number(r.valor)) : ''); setPercentual(r?.percentual != null ? String(Number(r.percentual)).replace('.', ',') : '');
    setInicio(mes(r?.competencia_inicial ?? competencia)); setFim(mes(r?.competencia_final ?? null)); setObservacoes(r?.observacoes ?? ''); setMotivo(''); setErro(null);
  }, [aberto, r, competencia]);
  const pct = paraPercentual(percentual);
  const fixo = paraDecimal(valor);
  const previa = modalidade === 'fixo' ? (fixo ? Number(fixo) : null) : pct && base > 0 ? valorPercentual(base, pct) : null;
  const salvar = async () => {
    if (descricao.trim().length < 2) return setErro('Descreva o lançamento.');
    if (modalidade === 'fixo' && !fixo) return setErro('Informe o valor.');
    if (modalidade === 'percentual' && !pct) return setErro('Informe uma porcentagem maior que zero (até 4 casas decimais).');
    if (modalidade === 'percentual' && tipo === 'desconto' && Number(pct) > 100) return setErro('Um desconto percentual não pode passar de 100% do salário-base.');
    if (!inicio) return setErro('Informe a competência inicial.');
    if (fim && fim < inicio) return setErro('A competência final não pode ser anterior à inicial.');
    if (r && motivo.trim().length < 3) return setErro('Informe o motivo da alteração.');
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('salvar_recorrencia_folha', {
      p_id: r?.id ?? null, p_id_funcionario: f.id, p_tipo: tipo, p_descricao: descricao, p_modalidade: modalidade,
      p_valor: modalidade === 'fixo' ? fixo : null, p_percentual: modalidade === 'percentual' ? pct : null,
      p_competencia_inicial: deMes(inicio), p_competencia_final: deMes(fim), p_observacoes: observacoes.trim() || null, p_motivo: r ? motivo : null,
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar o lançamento recorrente.'));
    aoConcluir(r ? 'Recorrência atualizada nas competências abertas; meses fechados foram preservados.' : 'Lançamento recorrente criado e aplicado às competências abertas.');
  };
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={r ? 'Editar lançamento recorrente' : 'Novo lançamento recorrente'} descricao={f.nome}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando...' : 'Salvar'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <div role="radiogroup" aria-label="Tipo" className="flex gap-2">
          {(['adicional', 'desconto'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => setTipo(t)}
              className={`flex-1 min-h-11 rounded-lg border text-sm font-semibold ${tipo === t ? (t === 'adicional' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-500 bg-red-50 text-red-700') : 'border-gray-200 text-gray-600'}`}>
              {t === 'adicional' ? 'Adicional' : 'Desconto'}</button>
          ))}
        </div>
        <div><label htmlFor="rec-desc" className={rotulo}>Descrição</label><input id="rec-desc" maxLength={120} placeholder="Ex.: Periculosidade, ajuda de custo" value={descricao} onChange={(e) => setDescricao(e.target.value)} className={campo} /></div>
        <div><label htmlFor="rec-modalidade" className={rotulo}>Modalidade</label>
          <select id="rec-modalidade" value={modalidade} onChange={(e) => setModalidade(e.target.value as 'fixo' | 'percentual')} className={campo}>
            <option value="fixo">Valor fixo (R$)</option><option value="percentual">Porcentagem (%)</option>
          </select></div>
        {modalidade === 'fixo' ? (
          <div><label htmlFor="rec-valor" className={rotulo}>Valor mensal (R$)</label><input id="rec-valor" inputMode="numeric" placeholder="0,00" value={valor} onChange={(e) => setValor(mascaraMoeda(e.target.value))} className={campo} /></div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label htmlFor="rec-base" className={rotulo}>Base de cálculo</label>
              <select id="rec-base" className={campo} defaultValue="salario_base"><option value="salario_base">Salário-base da competência</option></select></div>
            <div><label htmlFor="rec-percentual" className={rotulo}>Porcentagem (%)</label>
              <input id="rec-percentual" inputMode="decimal" placeholder="Ex.: 30" value={percentual} onChange={(e) => setPercentual(e.target.value.replace(/[^\d,]/g, ''))} className={campo} /></div>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="rec-inicio" className={rotulo}>Competência inicial</label><input id="rec-inicio" type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} /></div>
          <div><label htmlFor="rec-fim" className={rotulo}>Competência final <span className="font-normal text-gray-500">(opcional)</span></label><input id="rec-fim" type="month" value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} className={campo} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked readOnly className="w-4 h-4 accent-orange-600" aria-describedby="rec-mensal" />Repetir mensalmente</label>
        <p id="rec-mensal" className="text-xs text-gray-500 -mt-3">Aplicado em cada competência aberta. Meses pagos, enviados ao contador ou aprovados não mudam. Não calcula INSS, IRRF, FGTS nem confirma se a rubrica é devida.</p>
        <div><label htmlFor="rec-obs" className={rotulo}>Observações <span className="font-normal text-gray-500">(opcional)</span></label><input id="rec-obs" maxLength={500} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className={campo} /></div>
        {r && <div><label htmlFor="rec-motivo" className={rotulo}>Motivo da alteração</label><input id="rec-motivo" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} /></div>}
        {previa !== null && previa > 0 && (
          <div data-testid="previa-recorrente" className={`rounded-xl border px-4 py-3 text-sm ${tipo === 'adicional' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
            <p className="font-semibold">{tipo === 'adicional' ? 'Valor mensal: + ' : 'Valor mensal: − '}{formatarMoeda(previa)}</p>
            {modalidade === 'percentual' && pct && <p className="text-xs mt-0.5">{pct.replace('.', ',')}% × {formatarMoeda(base)} (salário-base atual; cada mês usa o salário da própria competência)</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ModalAcaoRecorrencia({ acao, competencia, aoFechar, aoConcluir }: {
  acao: { tipo: 'suspender' | 'reativar' | 'encerrar'; r: Recorrencia } | null; competencia: string; aoFechar: () => void; aoConcluir: (m: string) => void;
}) {
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (acao) { setDe(mes(competencia)); setAte(''); setMotivo(''); setErro(null); } }, [acao, competencia]);
  if (!acao) return null;
  const { tipo, r } = acao;
  const titulo = { suspender: 'Suspender recorrência', reativar: 'Reativar recorrência', encerrar: 'Encerrar recorrência' }[tipo];
  const confirmar = async () => {
    if (motivo.trim().length < 3) return setErro('Informe o motivo.');
    if (tipo !== 'reativar' && !de) return setErro(tipo === 'suspender' ? 'Informe a competência inicial da suspensão.' : 'Informe a última competência.');
    if (tipo === 'suspender' && ate && ate < de) return setErro('O fim da suspensão não pode ser anterior ao início.');
    setOcupado(true); setErro(null);
    const supabase = createClient();
    const { error } = tipo === 'suspender' ? await supabase.rpc('suspender_recorrencia_folha', { p_id: r.id, p_de: deMes(de), p_ate: deMes(ate), p_motivo: motivo })
      : tipo === 'reativar' ? await supabase.rpc('reativar_recorrencia_folha', { p_id: r.id, p_motivo: motivo })
      : await supabase.rpc('encerrar_recorrencia_folha', { p_id: r.id, p_ultima_competencia: deMes(de), p_motivo: motivo });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível concluir.'));
    aoConcluir({ suspender: 'Recorrência suspensa.', reativar: 'Recorrência reativada.', encerrar: 'Recorrência encerrada; o histórico foi preservado.' }[tipo]);
  };
  return (
    <Modal aberto={!!acao} aoFechar={aoFechar} titulo={titulo} descricao={r.descricao}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={confirmar}>{ocupado ? 'Salvando...' : 'Confirmar'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        {tipo === 'suspender' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label htmlFor="sus-de" className={rotulo}>Suspender a partir de</label><input id="sus-de" type="month" value={de} onChange={(e) => setDe(e.target.value)} className={campo} /></div>
            <div><label htmlFor="sus-ate" className={rotulo}>Até <span className="font-normal text-gray-500">(opcional)</span></label><input id="sus-ate" type="month" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} className={campo} /></div>
          </div>
        )}
        {tipo === 'encerrar' && (
          <div><label htmlFor="enc-ultima" className={rotulo}>Última competência em que vale</label><input id="enc-ultima" type="month" value={de} onChange={(e) => setDe(e.target.value)} className={campo} />
            <p className="text-xs text-gray-500 mt-1">{de ? `Deixa de ser aplicado depois de ${rotuloMes(`${de}-01`)}.` : ''} Meses anteriores e fechados não mudam.</p></div>
        )}
        <div><label htmlFor="acao-motivo" className={rotulo}>Motivo</label><input id="acao-motivo" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} /></div>
      </div>
    </Modal>
  );
}

// "Não aplicar nesta competência" para um lançamento gerado por recorrência (motivo obrigatório)
export function NaoAplicarRecorrencia({ idRecorrencia, competencia, descricao, aoConcluir, aoCancelar }: {
  idRecorrencia: string; competencia: string; descricao: string; aoConcluir: (m: string) => void; aoCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const confirmar = async () => {
    if (motivo.trim().length < 3) return setErro('Informe o motivo.');
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('nao_aplicar_recorrencia_folha', { p_id: idRecorrencia, p_competencia: competencia, p_motivo: motivo });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível retirar o lançamento.'));
    aoConcluir(`"${descricao}" não será aplicado em ${rotuloMes(competencia)}; a recorrência continua nos próximos meses.`);
  };
  return (
    <div className="mt-2 space-y-2 text-xs">
      <label htmlFor={`na-${idRecorrencia}`} className="block font-semibold text-gray-700">Não aplicar nesta competência — motivo</label>
      <input id={`na-${idRecorrencia}`} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} />
      {erro && <p role="alert" className="text-red-700">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={aoCancelar} className="min-h-9 px-3 rounded-lg border border-gray-200 font-semibold text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button type="button" disabled={ocupado} onClick={confirmar} className="min-h-9 px-3 rounded-lg bg-red-600 font-semibold text-white hover:bg-red-700">Não aplicar</button>
      </div>
    </div>
  );
}
