'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, Clock, CreditCard, Pencil, Plus, RefreshCw, Trash2, UserMinus, UserPlus, Users, Wallet } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, formatarMoeda, hojeBrasil, inicioDoMes, rotuloMes, rotuloMesCurto, somarMeses, type ContaFinanceira } from '@/lib/financeiro';
import { recursoAusente } from '@/lib/erros-banco';
import { SITUACOES, VINCULOS, calculoDoAjuste, iniciais, type Ajuste, type EventoHistorico, type Funcionario, type LinhaFolha } from '@/lib/funcionarios';
import { Selo } from '@/components/admin/tabela';
import { Indicador } from '@/components/financeiro/Indicador';
import { GraficoRosca } from '@/components/financeiro/GraficoRosca';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { ModalAjuste, ModalDesligar, ModalFuncionario, ModalPagamentoFolha } from '@/components/funcionarios/Modais';
import { NaoAplicarRecorrencia, SecaoRecorrentes } from '@/components/funcionarios/Recorrentes';
import { PortalJornada } from '@/components/funcionarios/PortalJornada';
import { CabecalhoModulo, classePilula } from '@/components/navegacao/NavegacaoModulos';

type Estado = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string; ausente: boolean } | { tipo: 'ok'; linhas: LinhaFolha[] };
type Aba = 'colaboradores' | 'lancamentos' | 'historico';
const filtro = 'min-h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500';

export default function FuncionariosPage() {
  const { empresa } = useEmpresaAtual();
  const [hoje, setHoje] = useState('');
  const [competencia, setCompetencia] = useState('');
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [evolucao, setEvolucao] = useState<{ competencia: string; previsto: number; pago: number }[]>([]);
  const [contas, setContas] = useState<ContaFinanceira[]>([]);
  const [aba, setAba] = useState<Aba>('colaboradores');
  const [busca, setBusca] = useState('');
  const [vinculo, setVinculo] = useState('');
  const [situacao, setSituacao] = useState('');
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [editando, setEditando] = useState<{ f: Funcionario | null } | null>(null);
  const [pagando, setPagando] = useState<LinhaFolha | null>(null);
  const [ajustando, setAjustando] = useState<LinhaFolha | null>(null);
  const [desligando, setDesligando] = useState<Funcionario | null>(null);

  useEffect(() => { const h = hojeBrasil(); setHoje(h); setCompetencia(inicioDoMes(h)); }, []);

  const carregar = useCallback(async (silencioso = false) => {
    if (!empresa || !competencia || !hoje) return;
    if (!silencioso) setEstado({ tipo: 'carregando' });
    const supabase = createClient();
    // Previsões da competência são geradas (idempotente) antes de ler — até o mês seguinte ao atual
    if (competencia <= somarMeses(inicioDoMes(hoje), 1)) {
      const g = await supabase.rpc('gerar_folha', { p_id_empresa: empresa.id, p_competencia: competencia });
      if (g.error && recursoAusente(g.error)) return setEstado({ tipo: 'erro', mensagem: mensagemDeErro(g.error, ''), ausente: true });
    }
    const [res, fu, ev, ct] = await Promise.all([
      supabase.rpc('resumo_folha', { p_id_empresa: empresa.id, p_competencia: competencia }),
      supabase.from('funcionarios').select('id, nome, cargo, data_admissao, vinculo, salario_base, dia_pagamento, pagamento_mes_seguinte, status, data_desligamento, observacoes').eq('id_empresa', empresa.id).order('nome'),
      supabase.rpc('evolucao_folha', { p_id_empresa: empresa.id, p_ano: Number(competencia.slice(0, 4)) }),
      supabase.from('contas_financeiras_saldo').select('id, nome, instituicao, tipo, saldo_inicial, data_saldo_inicial, principal, permite_saldo_negativo, arquivada_em, saldo, cor').eq('id_empresa', empresa.id).order('nome'),
    ]);
    if (res.error) return setEstado({ tipo: 'erro', mensagem: mensagemDeErro(res.error, 'Não foi possível carregar a folha.'), ausente: recursoAusente(res.error) });
    const linhas = (res.data ?? []) as LinhaFolha[];
    setFuncionarios((fu.data ?? []) as Funcionario[]);
    setEvolucao((ev.data ?? []) as { competencia: string; previsto: number; pago: number }[]);
    setContas((ct.data ?? []) as ContaFinanceira[]);
    const ids = linhas.map((l) => l.id_folha);
    const aj = ids.length ? await supabase.from('ajustes_folha').select('id, id_folha, tipo, descricao, valor, criado_em, modalidade, percentual, valor_base, id_recorrencia').in('id_folha', ids).order('criado_em') : { data: [] };
    setAjustes((aj.data ?? []) as Ajuste[]);
    setEstado({ tipo: 'ok', linhas });
    setSelecionado((s) => (s && linhas.some((l) => l.id_funcionario === s) ? s : linhas[0]?.id_funcionario ?? null));
  }, [empresa, competencia, hoje]);
  useEffect(() => { carregar(); }, [carregar, versao]);
  useEffect(() => {
    const voltar = () => document.visibilityState === 'visible' && carregar(true);
    document.addEventListener('visibilitychange', voltar);
    return () => document.removeEventListener('visibilitychange', voltar);
  }, [carregar]);

  const linhas = estado.tipo === 'ok' ? estado.linhas : [];
  const visiveis = useMemo(() => linhas.filter((l) => {
    const t = busca.trim().toLowerCase();
    if (t && !`${l.nome} ${l.cargo ?? ''} ${SITUACOES[l.situacao].rotulo}`.toLowerCase().includes(t)) return false;
    if (vinculo && l.vinculo !== vinculo) return false;
    if (situacao && l.situacao !== situacao) return false;
    return true;
  }), [linhas, busca, vinculo, situacao]);
  const soma = (c: keyof Pick<LinhaFolha, 'total' | 'pago' | 'pendente' | 'salario_base' | 'adicionais' | 'descontos'>) =>
    linhas.filter((l) => l.situacao !== 'cancelada').reduce((t, l) => t + Number(l[c]), 0);

  if (!empresa || !competencia) return null;
  const alterado = (m: string) => { setAviso(m); setErroAcao(null); setEditando(null); setPagando(null); setAjustando(null); setDesligando(null); setVersao((v) => v + 1); };
  const linhaSel = linhas.find((l) => l.id_funcionario === selecionado) ?? null;
  const funcSel = funcionarios.find((f) => f.id === selecionado) ?? null;
  const ativos = funcionarios.filter((f) => f.status === 'ativo').length;
  const pendentesQtd = linhas.filter((l) => Number(l.pendente) > 0 && l.situacao !== 'cancelada').length;
  const ok = estado.tipo === 'ok';
  const v = (n: number) => (ok ? formatarMoeda(n) : estado.tipo === 'carregando' ? '…' : 'Indisponível');

  const reativar = async (f: Funcionario) => {
    const { error } = await createClient().rpc('reativar_funcionario', { p_id: f.id });
    if (error) return setErroAcao(mensagemDeErro(error, 'Não foi possível reativar.'));
    alterado('Funcionário reativado.');
  };
  const removerAjuste = async (id: string) => {
    const { error } = await createClient().rpc('remover_ajuste_folha', { p_id: id });
    if (error) return setErroAcao(mensagemDeErro(error, 'Não foi possível remover o ajuste.'));
    alterado('Ajuste removido; a previsão foi atualizada.');
  };

  return (
    <div className="space-y-5 min-w-0">
      <CabecalhoModulo icone={Users} titulo="Funcionários" descricao="Gerencie seus colaboradores, salários, pagamentos e histórico."
        acoes={<>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-1">
            <CalendarDays className="w-4 h-4 text-gray-500 ml-2" aria-hidden="true" />
            <span className="px-2 text-sm font-semibold text-gray-900 whitespace-nowrap" aria-live="polite">{rotuloMes(competencia)}</span>
            <button type="button" aria-label="Competência anterior" onClick={() => setCompetencia(somarMeses(competencia, -1))} className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-gray-50"><ChevronLeft className="w-5 h-5" aria-hidden="true" /></button>
            <button type="button" aria-label="Próxima competência" onClick={() => setCompetencia(somarMeses(competencia, 1))} className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-gray-50"><ChevronRight className="w-5 h-5" aria-hidden="true" /></button>
          </div>
          <button type="button" className={`${classeBotaoPrimario} whitespace-nowrap`} onClick={() => setEditando({ f: null })}><Plus className="w-4 h-4" aria-hidden="true" />Novo funcionário</button>
        </div>
        </>} />

      {aviso && <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex justify-between gap-3"><span>{aviso}</span><button type="button" className="underline" onClick={() => setAviso(null)}>Fechar</button></div>}
      {erroAcao && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erroAcao}</p>}
      {estado.tipo === 'erro' && (estado.ausente
        ? <p role="status" data-testid="folha-indisponivel" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{estado.mensagem}</p>
        : <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-wrap justify-between gap-3">{estado.mensagem}
            <button type="button" onClick={() => carregar()} className="min-h-11 px-3 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button></div>)}

      <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Funcionários ativos" valor={ok ? String(ativos) : estado.tipo === 'carregando' ? '…' : 'Indisponível'} icone={Users} cor="bg-blue-100 text-blue-600" detalhe="Total de colaboradores" />
        <Indicador titulo="Folha prevista do mês" valor={v(soma('total'))} icone={CircleDollarSign} cor="bg-green-100 text-green-600" detalhe="Salários + adicionais − descontos" />
        <Indicador titulo="Pagamentos realizados" valor={v(soma('pago'))} icone={CreditCard} cor="bg-orange-100 text-orange-600" detalhe="Nesta competência" />
        <Indicador titulo="Pendente de pagamento" valor={v(soma('pendente'))} icone={Clock} cor="bg-red-100 text-red-600" detalhe={ok ? `${pendentesQtd} ${pendentesQtd === 1 ? 'colaborador' : 'colaboradores'}` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Folha da competência" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 min-w-0 space-y-3">
          <div role="tablist" aria-label="Seções" className="flex flex-wrap gap-1">
            {([['colaboradores', 'Colaboradores'], ['lancamentos', 'Lançamentos do mês'], ['historico', 'Histórico']] as const).map(([a, r]) => (
              <button key={a} type="button" role="tab" aria-selected={aba === a} onClick={() => setAba(a)}
                className={classePilula(aba === a)}>{r}</button>
            ))}
          </div>

          {estado.tipo === 'carregando' && <div role="status" aria-label="Carregando" className="h-64 rounded-xl bg-gray-50 animate-pulse" />}

          {ok && aba === 'colaboradores' && (
            <>
              <div className="flex flex-col sm:flex-row gap-2">
                <input type="search" aria-label="Buscar" placeholder="Buscar por nome, cargo ou situação..." value={busca} onChange={(e) => setBusca(e.target.value)} className={`${filtro} flex-1 min-w-0`} />
                <select aria-label="Filtrar por vínculo" value={vinculo} onChange={(e) => setVinculo(e.target.value)} className={filtro}><option value="">Todos os vínculos</option>{Object.entries(VINCULOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
                <select aria-label="Filtrar por situação" value={situacao} onChange={(e) => setSituacao(e.target.value)} className={filtro}><option value="">Todas as situações</option>{Object.entries(SITUACOES).map(([k, s]) => <option key={k} value={k}>{s.rotulo}</option>)}</select>
              </div>
              {linhas.length === 0 ? (
                <div className="text-center py-12">
                  <p className="font-semibold text-gray-900">Nenhum funcionário nesta competência</p>
                  <p className="text-sm text-gray-600 mt-1">Cadastre colaboradores para gerar a previsão da folha no Financeiro.</p>
                  <button type="button" className={`${classeBotaoPrimario} mt-4`} onClick={() => setEditando({ f: null })}><UserPlus className="w-4 h-4" aria-hidden="true" />Novo funcionário</button>
                </div>
              ) : visiveis.length === 0 ? <p className="text-sm text-gray-500 text-center py-8">Nenhum colaborador com esses filtros.</p> : (
                <div className="overflow-x-auto -mx-3 sm:mx-0">
                  <table className="w-full text-sm min-w-[56rem]">
                    <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                      {['Nome', 'Cargo', 'Salário base', 'Adicionais', 'Descontos', 'Total previsto', 'Pago', 'Pendente', 'Vencimento', 'Situação'].map((h) => <th key={h} className="py-2 px-2 font-medium">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {visiveis.map((l) => (
                        <tr key={l.id_folha} onClick={() => setSelecionado(l.id_funcionario)} data-testid={`linha-${l.nome}`}
                          className={`border-b border-gray-50 cursor-pointer ${selecionado === l.id_funcionario ? 'bg-orange-50/60' : 'hover:bg-gray-50'}`}>
                          <td className="py-2.5 px-2"><button type="button" className="flex items-center gap-2 text-left" onClick={() => setSelecionado(l.id_funcionario)}>
                            <span className="w-9 h-9 shrink-0 rounded-full bg-orange-100 text-orange-700 text-xs font-bold inline-flex items-center justify-center">{iniciais(l.nome)}</span>
                            <span className="min-w-[11rem]"><span className="block font-semibold text-gray-900 whitespace-nowrap">{l.nome}</span><span className="block text-xs text-gray-500">Admissão: {formatarData(l.data_admissao)}{l.status_funcionario === 'inativo' ? ' · desligado' : ''}</span></span>
                          </button></td>
                          <td className="py-2.5 px-2 text-gray-700">{l.cargo ?? '—'}</td>
                          <td className="py-2.5 px-2 whitespace-nowrap">{formatarMoeda(l.salario_base)}</td>
                          <td className="py-2.5 px-2 whitespace-nowrap text-green-700">{formatarMoeda(l.adicionais)}</td>
                          <td className="py-2.5 px-2 whitespace-nowrap text-red-700">{formatarMoeda(l.descontos)}</td>
                          <td className="py-2.5 px-2 whitespace-nowrap font-semibold">{formatarMoeda(l.total)}</td>
                          <td className="py-2.5 px-2 whitespace-nowrap text-green-700">{formatarMoeda(l.pago)}</td>
                          <td className="py-2.5 px-2 whitespace-nowrap text-orange-700">{formatarMoeda(l.pendente)}</td>
                          <td className="py-2.5 px-2 whitespace-nowrap">{formatarData(l.vencimento)}</td>
                          <td className="py-2.5 px-2"><Selo tipo={SITUACOES[l.situacao].selo} texto={SITUACOES[l.situacao].rotulo} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {ok && aba === 'lancamentos' && (
            ajustes.length === 0 ? <p className="text-sm text-gray-500 text-center py-10">Nenhum adicional ou desconto nesta competência.</p> : (
              <ul className="divide-y divide-gray-100" data-testid="ajustes-mes">
                {ajustes.map((a) => {
                  const l = linhas.find((x) => x.id_folha === a.id_folha);
                  return (
                    <li key={a.id} className="py-2.5 flex items-center gap-3 text-sm">
                      <span className="flex-1 min-w-0"><span className="block font-semibold text-gray-900">{a.descricao}{a.id_recorrencia && <span className="ml-1.5 align-middle text-[10px] font-bold uppercase bg-orange-50 text-orange-700 rounded px-1.5 py-0.5">Recorrente</span>}</span><span className="block text-xs text-gray-500">{l?.nome} · {formatarData(a.criado_em.slice(0, 10))}{calculoDoAjuste(a, formatarMoeda) ? ` · ${calculoDoAjuste(a, formatarMoeda)}` : ''}</span></span>
                      <span className={`font-semibold whitespace-nowrap ${a.tipo === 'adicional' ? 'text-green-700' : 'text-red-700'}`}>{a.tipo === 'adicional' ? '+' : '−'} {formatarMoeda(a.valor)}</span>
                      {l && l.situacao !== 'cancelada' && !a.id_recorrencia && <button type="button" onClick={() => removerAjuste(a.id)} aria-label={`Remover ${a.descricao}`} className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"><Trash2 className="w-4 h-4" aria-hidden="true" /></button>}
                    </li>
                  );
                })}
              </ul>
            )
          )}

          {ok && aba === 'historico' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[28rem]" data-testid="historico-mensal">
                <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100"><th className="py-2 px-2 font-medium">Competência</th><th className="py-2 px-2 font-medium">Previsto</th><th className="py-2 px-2 font-medium">Pago</th><th className="py-2 px-2 font-medium">Pendente</th></tr></thead>
                <tbody>{evolucao.filter((e) => Number(e.previsto) > 0 || Number(e.pago) > 0).map((e) => (
                  <tr key={e.competencia} className="border-b border-gray-50"><td className="py-2 px-2">{rotuloMes(e.competencia)}</td><td className="py-2 px-2">{formatarMoeda(e.previsto)}</td>
                    <td className="py-2 px-2 text-green-700">{formatarMoeda(e.pago)}</td><td className="py-2 px-2 text-orange-700">{formatarMoeda(Number(e.previsto) - Number(e.pago))}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <PainelColaborador linha={linhaSel} funcionario={funcSel} ajustes={ajustes.filter((a) => a.id_folha === linhaSel?.id_folha)} competencia={competencia} versao={versao}
          aoEditar={() => funcSel && setEditando({ f: funcSel })} aoPagar={() => linhaSel && setPagando(linhaSel)} aoAjustar={() => linhaSel && setAjustando(linhaSel)}
          aoDesligar={() => funcSel && setDesligando(funcSel)} aoReativar={() => funcSel && reativar(funcSel)} aoRemoverAjuste={removerAjuste} aoAlterado={alterado} />
      </div>

      {ok && linhas.length > 0 && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-label="Evolução da folha" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0">
            <div className="flex items-center justify-between mb-3"><h2 className="font-bold text-gray-900">Evolução da folha de pagamento</h2>
              <span className="flex gap-3 text-xs text-gray-600"><span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-200" />Previsto</span><span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-600" />Pago</span></span></div>
            <BarrasFolha dados={evolucao} competencia={competencia} />
          </section>
          <section aria-label="Distribuição da folha" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0">
            <h2 className="font-bold text-gray-900 mb-3">Distribuição da folha ({rotuloMesCurto(competencia)}/{competencia.slice(0, 4)})</h2>
            <GraficoRosca empilhado rotulo="Distribuição da folha" total={soma('salario_base') + soma('adicionais') + soma('descontos')} itens={[
              { categoria: 'Salários base', cor: '#ea580c', icone: 'users', valor: soma('salario_base') },
              { categoria: 'Adicionais', cor: '#fdba74', icone: 'trending-up', valor: soma('adicionais') },
              { categoria: 'Descontos', cor: '#fca5a5', icone: 'receipt', valor: soma('descontos') },
            ].filter((i) => i.valor > 0)} />
            <p className="text-xs text-gray-500 mt-2">Total previsto: {formatarMoeda(soma('total'))} (descontos reduzem o total).</p>
          </section>
        </div>
      )}

      <ModalFuncionario aberto={!!editando} aoFechar={() => setEditando(null)} idEmpresa={empresa.id} funcionario={editando?.f ?? null} competencia={competencia} aoSalvar={alterado} />
      <ModalPagamentoFolha linha={pagando} aoFechar={() => setPagando(null)} idEmpresa={empresa.id} contas={contas} hoje={hoje} aoConcluir={alterado} />
      <ModalAjuste linha={ajustando} aoFechar={() => setAjustando(null)} aoConcluir={alterado} />
      <ModalDesligar funcionario={desligando} aoFechar={() => setDesligando(null)} hoje={hoje} aoConcluir={alterado} />
    </div>
  );
}

function BarrasFolha({ dados, competencia }: { dados: { competencia: string; previsto: number; pago: number }[]; competencia: string }) {
  const max = Math.max(1, ...dados.flatMap((d) => [Number(d.previsto), Number(d.pago)]));
  return (
    <div>
      <div className="flex items-end gap-1 sm:gap-2 h-40" role="img" aria-label="Previsto e pago por mês">
        {dados.map((d) => (
          <div key={d.competencia} className={`flex-1 h-full flex items-end justify-center gap-0.5 rounded ${d.competencia === competencia ? 'bg-orange-50' : ''}`} title={`${rotuloMes(d.competencia)}: previsto ${formatarMoeda(d.previsto)} · pago ${formatarMoeda(d.pago)}`}>
            <span className="w-1/3 max-w-3 rounded-t bg-orange-200" style={{ height: `${(Number(d.previsto) / max) * 100}%` }} />
            <span className="w-1/3 max-w-3 rounded-t bg-orange-600" style={{ height: `${(Number(d.pago) / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1 sm:gap-2 mt-1">{dados.map((d) => <span key={d.competencia} className={`flex-1 text-center text-[10px] sm:text-xs ${d.competencia === competencia ? 'font-bold text-orange-700' : 'text-gray-500'}`}>{rotuloMesCurto(d.competencia)}</span>)}</div>
    </div>
  );
}

function PainelColaborador({ linha, funcionario: f, ajustes, competencia, versao, aoEditar, aoPagar, aoAjustar, aoDesligar, aoReativar, aoRemoverAjuste, aoAlterado }: {
  linha: LinhaFolha | null; funcionario: Funcionario | null; ajustes: Ajuste[]; competencia: string; versao: number;
  aoEditar: () => void; aoPagar: () => void; aoAjustar: () => void; aoDesligar: () => void; aoReativar: () => void; aoRemoverAjuste: (id: string) => Promise<void>; aoAlterado: (m: string) => void;
}) {
  const [aba, setAba] = useState<'geral' | 'lancamentos' | 'historico'>('geral');
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [historico, setHistorico] = useState<EventoHistorico[] | null>(null);
  useEffect(() => {
    if (!f || aba !== 'historico') return;
    setHistorico(null);
    createClient().rpc('historico_funcionario', { p_id_funcionario: f.id }).then(({ data }) => setHistorico((data ?? []) as EventoHistorico[]));
  }, [f, aba, versao]);
  if (!linha || !f) return <aside aria-label="Resumo do colaborador" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 text-sm text-gray-500">Selecione um colaborador.</aside>;
  const aberto = linha.situacao !== 'cancelada';
  return (
    <aside aria-label="Resumo do colaborador" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 min-w-0 space-y-3 self-start">
      <h2 className="font-bold text-gray-900">Resumo do colaborador</h2>
      <div className="flex items-center gap-3">
        <span className="w-12 h-12 shrink-0 rounded-full bg-orange-100 text-orange-700 font-bold inline-flex items-center justify-center">{iniciais(f.nome)}</span>
        <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 break-words">{f.nome}</p><p className="text-sm text-gray-500">{f.cargo ?? VINCULOS[f.vinculo]}</p></div>
        <Selo tipo={f.status === 'ativo' ? 'sucesso' : 'neutro'} texto={f.status === 'ativo' ? 'Ativo' : 'Desligado'} />
      </div>
      <div role="tablist" aria-label="Detalhes do colaborador" className="flex gap-1">
        {([['geral', 'Visão geral'], ['lancamentos', 'Lançamentos'], ['historico', 'Histórico']] as const).map(([a, r]) => (
          <button key={a} type="button" role="tab" aria-selected={aba === a} onClick={() => setAba(a)} className={`flex-1 min-h-11 rounded-lg text-xs sm:text-sm font-semibold ${aba === a ? 'bg-orange-600 text-white' : 'bg-gray-50 text-gray-700'}`}>{r}</button>
        ))}
      </div>
      {aba === 'geral' && (
        <>
          <dl className="text-sm space-y-1.5">
            {[['Admissão', formatarData(f.data_admissao)], ['Vínculo', VINCULOS[f.vinculo]], ['Dia de pagamento', `${String(f.dia_pagamento).padStart(2, '0')}${f.pagamento_mes_seguinte ? ' (mês seguinte)' : ''}`], ['Salário base atual', formatarMoeda(f.salario_base)]]
              .concat(f.data_desligamento ? [['Desligamento', formatarData(f.data_desligamento)]] : []).map(([k, val]) => (
              <div key={k} className="flex justify-between gap-2"><dt className="text-gray-500">{k}</dt><dd className="text-gray-900 font-medium text-right">{val}</dd></div>))}
          </dl>
          <div className="rounded-xl border border-gray-100 p-3 text-sm space-y-1" data-testid="resumo-competencia">
            <p className="font-bold text-gray-900 mb-1">{rotuloMes(competencia)}</p>
            <div className="flex justify-between"><span className="text-gray-600">Salário base</span><span>{formatarMoeda(linha.salario_base)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Adicionais</span><span className="text-green-700">{formatarMoeda(linha.adicionais)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Descontos</span><span className="text-red-700">{formatarMoeda(linha.descontos)}</span></div>
            <div className="flex justify-between border-t border-gray-100 pt-1 font-bold"><span>Total previsto</span><span>{formatarMoeda(linha.total)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Pago</span><span className="text-green-700 font-semibold">{formatarMoeda(linha.pago)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Pendente</span><span className="text-orange-700 font-semibold">{formatarMoeda(linha.pendente)}</span></div>
            <div className="flex justify-between text-xs text-gray-500"><span>Vencimento</span><span>{formatarData(linha.vencimento)}</span></div>
          </div>
          <PortalJornada funcionario={f} versao={versao} aoAlterado={aoAlterado} />
        </>
      )}
      {aba === 'lancamentos' && (
        <div className="space-y-2">
          {ajustes.length === 0 ? <p className="text-sm text-gray-500">Sem adicionais ou descontos nesta competência.</p> : (
            <ul className="divide-y divide-gray-100 text-sm">{ajustes.map((a) => (
              <li key={a.id} className="py-2" data-testid="ajuste-colaborador">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">{a.descricao}{a.id_recorrencia && <span className="ml-1.5 align-middle text-[10px] font-bold uppercase bg-orange-50 text-orange-700 rounded px-1.5 py-0.5">Recorrente</span>}{calculoDoAjuste(a, formatarMoeda) && <span className="block text-xs text-gray-500">{calculoDoAjuste(a, formatarMoeda)}</span>}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <span className={a.tipo === 'adicional' ? 'text-green-700' : 'text-red-700'}>{a.tipo === 'adicional' ? '+' : '−'} {formatarMoeda(a.valor)}</span>
                    {linha.situacao !== 'cancelada' && excluindo !== a.id && (
                      <button type="button" onClick={() => setExcluindo(a.id)} aria-label={a.id_recorrencia ? `Não aplicar ${a.descricao} nesta competência` : `Excluir ${a.descricao}`} className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                    )}
                  </span>
                </div>
                {excluindo === a.id && a.id_recorrencia && (
                  <NaoAplicarRecorrencia idRecorrencia={a.id_recorrencia} competencia={competencia} descricao={a.descricao} aoCancelar={() => setExcluindo(null)}
                    aoConcluir={(m) => { setExcluindo(null); aoAlterado(m); }} />
                )}
                {excluindo === a.id && !a.id_recorrencia && (
                  <div className="mt-2 flex items-center justify-end gap-2 text-xs">
                    <span className="text-gray-600 mr-auto">Excluir este lançamento?</span>
                    <button type="button" onClick={() => setExcluindo(null)} className="min-h-9 px-3 rounded-lg border border-gray-200 font-semibold text-gray-700 hover:bg-gray-50">Cancelar</button>
                    <button type="button" onClick={async () => { await aoRemoverAjuste(a.id); setExcluindo(null); }} className="min-h-9 px-3 rounded-lg bg-red-600 font-semibold text-white hover:bg-red-700">Excluir</button>
                  </div>
                )}
              </li>
            ))}</ul>
          )}
          {aberto && <button type="button" onClick={aoAjustar} className={`${classeBotaoSecundario} w-full`}><Plus className="w-4 h-4" aria-hidden="true" />Adicional ou desconto</button>}
          <SecaoRecorrentes funcionario={f} linha={linha} competencia={competencia} versao={versao} aoAlterar={aoAlterado} />
        </div>
      )}
      {aba === 'historico' && (
        historico === null ? <div role="status" aria-label="Carregando histórico" className="h-24 rounded-lg bg-gray-50 animate-pulse" /> : historico.length === 0 ? <p className="text-sm text-gray-500">Sem histórico.</p> : (
          <ul className="divide-y divide-gray-100 text-sm max-h-80 overflow-y-auto" data-testid="historico-colaborador">
            {historico.map((h, i) => (
              <li key={i} className="py-2">
                <p className="flex justify-between gap-2"><span className="font-medium text-gray-900">{{ pagamento: 'Pagamento', adicional: 'Adicional', desconto: 'Desconto', salario: 'Salário-base' }[h.tipo]}</span>
                  <span className={h.tipo === 'desconto' ? 'text-red-700' : h.tipo === 'salario' ? 'text-gray-900' : 'text-green-700'}>{formatarMoeda(h.valor)}</span></p>
                <p className="text-xs text-gray-500">{formatarData(h.data)} · competência {rotuloMesCurto(h.competencia)}/{h.competencia.slice(0, 4)}</p>
              </li>
            ))}
          </ul>
        )
      )}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 pt-1">
        <button type="button" onClick={aoEditar} className={classeBotaoSecundario}><Pencil className="w-4 h-4" aria-hidden="true" />Editar</button>
        {aberto && Number(linha.pendente) > 0
          ? <button type="button" onClick={aoPagar} className={`${classeBotaoPrimario} !px-3 whitespace-nowrap`}><Wallet className="w-4 h-4" aria-hidden="true" />Registrar pagamento</button>
          : <span className="text-xs text-gray-500 self-center text-center">{aberto ? 'Competência quitada' : 'Competência cancelada'}</span>}
      </div>
      {f.status === 'ativo'
        ? <button type="button" onClick={aoDesligar} className="w-full min-h-11 inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-red-700"><UserMinus className="w-4 h-4" aria-hidden="true" />Desligar funcionário</button>
        : <button type="button" onClick={aoReativar} className="w-full min-h-11 inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-orange-600"><UserPlus className="w-4 h-4" aria-hidden="true" />Reativar funcionário</button>}
    </aside>
  );
}
