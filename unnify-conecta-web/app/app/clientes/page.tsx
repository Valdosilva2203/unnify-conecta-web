'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, CircleDollarSign, FileText, Link2, Mail, MapPin, Pencil, Phone, Plus, RefreshCw, StickyNote, Unlink, UserPlus, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, formatarMoeda, rotuloMesCurto } from '@/lib/financeiro';
import { recursoAusente } from '@/lib/erros-banco';
import { SITUACAO_FIN, STATUS_CLIENTE, iniciaisCliente, mascaraCep, mascaraDocumento, mascaraTelefone, type Cliente, type ClienteCompleto, type StatusCliente } from '@/lib/clientes';
import { Paginacao, Selo } from '@/components/admin/tabela';
import { Indicador } from '@/components/financeiro/Indicador';
import { GraficoRosca } from '@/components/financeiro/GraficoRosca';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { ModalCliente, ModalVincularReceita } from '@/components/clientes/ModaisCliente';

interface Resumo { total: number; ativos: number; inativos: number; prospects: number; novos_mes: number; novos_mes_anterior: number; a_receber: number | null; a_receber_vencido: number | null; evolucao: { mes: string; novos: number; cadastrados: number }[] }
type Lista = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string; ausente: boolean } | { tipo: 'ok'; linhas: Cliente[]; total: number };
const filtro = 'min-h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500';

export default function ClientesPage() {
  const { empresa } = useEmpresaAtual();
  const [resumo, setResumo] = useState<Resumo | null | 'erro'>(null);
  const [lista, setLista] = useState<Lista>({ tipo: 'carregando' });
  const [recentes, setRecentes] = useState<{ id: string; nome: string; tipo_pessoa: string; criado_em: string; status: StatusCliente }[]>([]);
  const [aba, setAba] = useState<'' | StatusCliente>('');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [fin, setFin] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [modal, setModal] = useState<{ c: ClienteCompleto | null } | null>(null);
  const [versao, setVersao] = useState(0);
  const req = useRef(0);

  const carregarLista = useCallback(() => {
    if (!empresa) return;
    const atual = ++req.current;
    setLista((l) => (l.tipo === 'ok' ? l : { tipo: 'carregando' }));
    createClient().rpc('buscar_clientes', { p_id_empresa: empresa.id, p_busca: busca.trim() || null, p_status: aba || null, p_tipo: tipo || null, p_financeiro: fin || null, p_limite: porPagina, p_deslocamento: (pagina - 1) * porPagina })
      .then(({ data, error }) => {
        if (atual !== req.current) return;
        if (error) return setLista({ tipo: 'erro', mensagem: mensagemDeErro(error, 'Não foi possível carregar os clientes.'), ausente: recursoAusente(error) });
        const linhas = (data ?? []) as Cliente[];
        setLista({ tipo: 'ok', linhas, total: Number(linhas[0]?.total ?? 0) });
        setSelecionado((s) => (s && linhas.some((l) => l.id === s) ? s : linhas[0]?.id ?? s));
      });
  }, [empresa, busca, aba, tipo, fin, pagina, porPagina]);
  useEffect(() => { const t = setTimeout(carregarLista, 250); return () => clearTimeout(t); }, [carregarLista, versao]);
  useEffect(() => {
    if (!empresa) return;
    const supabase = createClient();
    supabase.rpc('resumo_clientes', { p_id_empresa: empresa.id }).then(({ data, error }) => setResumo(error ? 'erro' : (data as Resumo)));
    supabase.from('clientes').select('id, nome, tipo_pessoa, criado_em, status').eq('id_empresa', empresa.id).order('criado_em', { ascending: false }).limit(4)
      .then(({ data }) => setRecentes((data ?? []) as typeof recentes));
  }, [empresa, versao]);
  useEffect(() => {
    const voltar = () => document.visibilityState === 'visible' && setVersao((v) => v + 1);
    document.addEventListener('visibilitychange', voltar);
    return () => document.removeEventListener('visibilitychange', voltar);
  }, []);

  if (!empresa) return null;
  const alterado = (m: string, id?: string) => { setAviso(m); setModal(null); if (id) setSelecionado(id); setVersao((v) => v + 1); };
  const r = resumo && resumo !== 'erro' ? resumo : null;
  const valorCard = (v: string | null) => (r ? v ?? '—' : resumo === 'erro' ? 'Indisponível' : '…');
  const variacao = r && r.novos_mes_anterior > 0 ? Math.round(((r.novos_mes - r.novos_mes_anterior) / r.novos_mes_anterior) * 100) : null;
  const linhas = lista.tipo === 'ok' ? lista.linhas : [];

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-orange-100 text-orange-600 inline-flex items-center justify-center"><Users className="w-7 h-7" aria-hidden="true" /></span>
          <div className="min-w-0"><h1 className="text-2xl sm:text-3xl font-black text-gray-900">Clientes</h1>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">Gerencie seus clientes, histórico e recebimentos.</p></div>
        </div>
        <button type="button" className={`${classeBotaoPrimario} whitespace-nowrap self-start xl:self-auto`} onClick={() => setModal({ c: null })}><Plus className="w-4 h-4" aria-hidden="true" />Novo cliente</button>
      </div>

      {aviso && <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex justify-between gap-3"><span>{aviso}</span><button type="button" className="underline" onClick={() => setAviso(null)}>Fechar</button></div>}
      {lista.tipo === 'erro' && (lista.ausente
        ? <p role="status" data-testid="clientes-indisponivel" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{lista.mensagem}</p>
        : <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-wrap justify-between gap-3">{lista.mensagem}
            <button type="button" onClick={() => setVersao((v) => v + 1)} className="min-h-11 px-3 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button></div>)}

      <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Clientes cadastrados" valor={valorCard(r ? String(r.total) : null)} icone={Users} cor="bg-blue-100 text-blue-600" />
        <Indicador titulo="Clientes ativos" valor={valorCard(r ? String(r.ativos) : null)} icone={CheckCircle2} cor="bg-green-100 text-green-600" detalhe={r && r.total ? `${Math.round((r.ativos / r.total) * 100)}% do total` : undefined} />
        <Indicador titulo="A receber" valor={valorCard(r ? (r.a_receber === null ? 'Sem acesso' : formatarMoeda(r.a_receber)) : null)} icone={CircleDollarSign} cor="bg-orange-100 text-orange-600"
          detalhe={r && r.a_receber_vencido ? `${formatarMoeda(r.a_receber_vencido)} vencido` : 'Receitas vinculadas a clientes'} />
        <Indicador titulo="Novos no mês" valor={valorCard(r ? String(r.novos_mes) : null)} icone={UserPlus} cor="bg-purple-100 text-purple-600"
          detalhe={variacao === null ? 'Sem base no mês anterior' : `${variacao > 0 ? '+' : ''}${variacao}% em relação ao mês anterior`} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <section aria-label="Lista de clientes" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 min-w-0 space-y-3">
          <div role="tablist" aria-label="Situação" className="flex flex-wrap gap-1">
            {([['', 'Todos'], ['ativo', 'Ativos'], ['inativo', 'Inativos'], ['prospect', 'Prospects']] as const).map(([v, rot]) => (
              <button key={v} type="button" role="tab" aria-selected={aba === v} onClick={() => { setAba(v); setPagina(1); }}
                className={`min-h-11 px-3 sm:px-4 rounded-lg text-sm font-semibold ${aba === v ? 'bg-orange-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>{rot}</button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="search" aria-label="Buscar clientes" placeholder="Buscar por nome, CPF/CNPJ, telefone ou e-mail..." value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} className={`${filtro} flex-1 min-w-0`} />
            <select aria-label="Filtrar por tipo" value={tipo} onChange={(e) => { setTipo(e.target.value); setPagina(1); }} className={filtro}><option value="">Todos os tipos</option><option value="pf">Pessoa física</option><option value="pj">Pessoa jurídica</option></select>
            <select aria-label="Filtrar por financeiro" value={fin} onChange={(e) => { setFin(e.target.value); setPagina(1); }} className={filtro}><option value="">Todas as situações</option>{Object.entries(SITUACAO_FIN).map(([k, s]) => <option key={k} value={k}>{s.rotulo}</option>)}</select>
          </div>
          {lista.tipo === 'carregando' && <div role="status" aria-label="Carregando clientes" className="h-56 rounded-xl bg-gray-50 animate-pulse" />}
          {lista.tipo === 'ok' && (linhas.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-semibold text-gray-900">{busca || tipo || fin || aba ? 'Nenhum cliente com esses filtros.' : 'Nenhum cliente cadastrado ainda.'}</p>
              {!(busca || tipo || fin || aba) && <button type="button" className={`${classeBotaoPrimario} mt-4`} onClick={() => setModal({ c: null })}><Plus className="w-4 h-4" aria-hidden="true" />Novo cliente</button>}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-3 sm:mx-0">
                <table className="w-full text-sm min-w-[52rem]">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">{['Cliente', 'Tipo', 'Telefone', 'E-mail', 'Situação', 'Financeiro', 'Último movimento'].map((h) => <th key={h} className="py-2 px-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {linhas.map((c) => (
                      <tr key={c.id} onClick={() => setSelecionado(c.id)} data-testid={`cliente-${c.nome}`} className={`border-b border-gray-50 cursor-pointer ${selecionado === c.id ? 'bg-orange-50/60' : 'hover:bg-gray-50'}`}>
                        <td className="py-2.5 px-2"><button type="button" onClick={() => setSelecionado(c.id)} className="flex items-center gap-2 text-left">
                          <span className="w-9 h-9 shrink-0 rounded-full bg-blue-50 text-blue-700 text-xs font-bold inline-flex items-center justify-center">{iniciaisCliente(c.nome_fantasia || c.nome)}</span>
                          <span className="min-w-[10rem]"><span className="block font-semibold text-gray-900">{c.nome_fantasia || c.nome}</span><span className="block text-xs text-gray-500">Cliente desde {formatarData(c.criado_em.slice(0, 10))}</span></span></button></td>
                        <td className="py-2.5 px-2"><span className="px-2 py-0.5 rounded-md bg-gray-100 text-xs font-semibold">{c.tipo_pessoa.toUpperCase()}</span></td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{c.telefone ? mascaraTelefone(c.telefone) : '—'}</td>
                        <td className="py-2.5 px-2 max-w-[12rem] truncate">{c.email ?? '—'}</td>
                        <td className="py-2.5 px-2"><Selo tipo={STATUS_CLIENTE[c.status].selo} texto={STATUS_CLIENTE[c.status].rotulo} /></td>
                        <td className="py-2.5 px-2">{c.situacao_financeira ? <Selo tipo={SITUACAO_FIN[c.situacao_financeira].selo} texto={SITUACAO_FIN[c.situacao_financeira].rotulo} /> : <span className="text-xs text-gray-400">Sem acesso</span>}</td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{c.ultimo_movimento ? formatarData(c.ultimo_movimento) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacao pagina={pagina} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={(n) => { setPorPagina(n); setPagina(1); }} total={lista.total} />
            </>
          ))}
        </section>

        <PainelCliente id={selecionado} idEmpresa={empresa.id} versao={versao} aoEditar={(c) => setModal({ c })} aoAlterar={alterado} />
      </div>

      {r && r.total > 0 && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-label="Evolução de clientes" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0">
            <div className="flex items-center justify-between mb-3"><h2 className="font-bold text-gray-900">Evolução de clientes</h2>
              <span className="flex gap-3 text-xs text-gray-600"><span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-300" />Novos</span><span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-600" />Total cadastrado</span></span></div>
            <Barras dados={r.evolucao} />
          </section>
          <section aria-label="Situação dos clientes" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0">
            <h2 className="font-bold text-gray-900 mb-3">Situação dos clientes</h2>
            <GraficoRosca empilhado rotulo="Situação dos clientes" total={r.total} itens={[
              { categoria: 'Ativos', cor: '#16a34a', icone: 'users', valor: r.ativos }, { categoria: 'Inativos', cor: '#9ca3af', icone: 'users', valor: r.inativos },
              { categoria: 'Prospects', cor: '#f97316', icone: 'users', valor: r.prospects }].filter((i) => i.valor > 0)} />
          </section>
          <section aria-label="Últimos clientes cadastrados" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0">
            <h2 className="font-bold text-gray-900 mb-3">Últimos clientes cadastrados</h2>
            <ul className="divide-y divide-gray-100">{recentes.map((c) => (
              <li key={c.id}><button type="button" onClick={() => setSelecionado(c.id)} className="w-full py-2.5 flex items-center gap-3 text-left">
                <span className="w-9 h-9 shrink-0 rounded-full bg-blue-50 text-blue-700 text-xs font-bold inline-flex items-center justify-center">{iniciaisCliente(c.nome)}</span>
                <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-gray-900 truncate">{c.nome}</span><span className="block text-xs text-gray-500">{c.tipo_pessoa.toUpperCase()} · {formatarData(c.criado_em.slice(0, 10))}</span></span>
                <Selo tipo={STATUS_CLIENTE[c.status].selo} texto={STATUS_CLIENTE[c.status].rotulo} />
              </button></li>))}</ul>
          </section>
        </div>
      )}

      <ModalCliente aberto={!!modal} aoFechar={() => setModal(null)} idEmpresa={empresa.id} cliente={modal?.c ?? null} aoSalvar={alterado} />
    </div>
  );
}

function Barras({ dados }: { dados: { mes: string; novos: number; cadastrados: number }[] }) {
  const max = Math.max(1, ...dados.map((d) => Number(d.cadastrados)));
  return (
    <div>
      <div className="flex items-end gap-1 sm:gap-2 h-36" role="img" aria-label="Novos clientes e total cadastrado por mês">
        {dados.map((d) => (
          <div key={d.mes} className="flex-1 h-full flex items-end justify-center gap-0.5" title={`${rotuloMesCurto(d.mes)}: ${d.novos} novos · ${d.cadastrados} no total`}>
            <span className="w-1/3 max-w-3 rounded-t bg-orange-300" style={{ height: `${(Number(d.novos) / max) * 100}%` }} />
            <span className="w-1/3 max-w-3 rounded-t bg-orange-600" style={{ height: `${(Number(d.cadastrados) / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1 sm:gap-2 mt-1">{dados.map((d) => <span key={d.mes} className="flex-1 text-center text-[10px] sm:text-xs text-gray-500">{rotuloMesCurto(d.mes)}</span>)}</div>
    </div>
  );
}

interface Movimento { id: string; descricao: string; valor: number; status: string; situacao: string; data_vencimento: string | null; data_pagamento: string | null; categoria: string | null }
interface EventoHist { acao: string; dados: Record<string, unknown> | null; criado_em: string }
const ROTULO_ACAO: Record<string, string> = { criado: 'Cliente cadastrado', editado: 'Dados atualizados', status: 'Situação alterada', receita_vinculada: 'Receita vinculada', receita_desvinculada: 'Receita desvinculada' };
const CAMPOS: Record<string, string> = { tipo: 'tipo', nome: 'nome', documento: 'documento', contato: 'contato', endereco: 'endereço', observacoes: 'observações' };

function PainelCliente({ id, idEmpresa, versao, aoEditar, aoAlterar }: { id: string | null; idEmpresa: string; versao: number; aoEditar: (c: ClienteCompleto) => void; aoAlterar: (m: string) => void }) {
  const [c, setC] = useState<ClienteCompleto | null | 'erro'>(null);
  const [aba, setAba] = useState<'geral' | 'historico' | 'financeiro' | 'documentos'>('geral');
  const [movs, setMovs] = useState<Movimento[] | null | 'sem_acesso'>(null);
  const [hist, setHist] = useState<EventoHist[] | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [podeGerir, setPodeGerir] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    setC(null); setMovs(null); setHist(null); setErro(null);
    supabase.from('clientes').select('id, tipo_pessoa, nome, nome_fantasia, documento, telefone, email, cep, logradouro, numero, complemento, bairro, cidade, estado, status, observacoes, criado_em').eq('id', id).maybeSingle()
      .then(({ data, error }) => setC(error || !data ? 'erro' : (data as ClienteCompleto)));
    supabase.rpc('financeiro_cliente', { p_id_cliente: id }).then(({ data, error }) => setMovs(error ? 'sem_acesso' : (data ?? []) as Movimento[]));
    supabase.from('historico_clientes').select('acao, dados, criado_em').eq('id_cliente', id).order('criado_em', { ascending: false }).limit(50).then(({ data }) => setHist((data ?? []) as EventoHist[]));
    supabase.rpc('pode_gerenciar_clientes', { p_id_empresa: idEmpresa }).then(({ data }) => setPodeGerir(!!data));
  }, [id, idEmpresa, versao]);

  if (!id) return <aside aria-label="Detalhes do cliente" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 text-sm text-gray-500 self-start">Selecione um cliente.</aside>;
  if (c === null) return <aside aria-label="Detalhes do cliente" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 self-start"><div role="status" aria-label="Carregando cliente" className="h-64 rounded-xl bg-gray-50 animate-pulse" /></aside>;
  if (c === 'erro') return <aside aria-label="Detalhes do cliente" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 text-sm text-red-700 self-start" role="alert">Não foi possível carregar o cliente.</aside>;

  const lista = Array.isArray(movs) ? movs : [];
  const recebido = lista.filter((m) => m.status === 'pago').reduce((t, m) => t + Number(m.valor), 0);
  const aReceber = lista.filter((m) => m.status === 'pendente').reduce((t, m) => t + Number(m.valor), 0);
  const nome = c.nome_fantasia || c.nome;
  const endereco = [c.logradouro && `${c.logradouro}${c.numero ? `, ${c.numero}` : ''}${c.complemento ? ` - ${c.complemento}` : ''}`, [c.bairro, c.cidade && `${c.cidade}${c.estado ? `/${c.estado}` : ''}`].filter(Boolean).join(' - '), c.cep && `CEP ${mascaraCep(c.cep)}`].filter(Boolean);
  const desvincular = async (idL: string) => {
    const { error } = await createClient().rpc('vincular_cliente_lancamento', { p_id_lancamento: idL, p_id_cliente: null });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível desvincular.'));
    aoAlterar('Receita desvinculada do cliente.');
  };

  return (
    <aside aria-label="Detalhes do cliente" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 min-w-0 space-y-3 self-start">
      <div className="flex items-center gap-3">
        <span className="w-14 h-14 shrink-0 rounded-full bg-blue-50 text-blue-700 text-lg font-bold inline-flex items-center justify-center">{iniciaisCliente(nome)}</span>
        <div className="flex-1 min-w-0"><p className="font-bold text-gray-900 break-words">{nome}</p><p className="text-xs text-gray-500">Cliente desde {formatarData(c.criado_em.slice(0, 10))}</p></div>
        <Selo tipo={STATUS_CLIENTE[c.status].selo} texto={STATUS_CLIENTE[c.status].rotulo} />
      </div>
      <div role="tablist" aria-label="Detalhes" className="grid grid-cols-4 gap-1">
        {([['geral', 'Visão geral'], ['historico', 'Histórico'], ['financeiro', 'Financeiro'], ['documentos', 'Documentos']] as const).map(([a, rot]) => (
          <button key={a} type="button" role="tab" aria-selected={aba === a} onClick={() => setAba(a)} className={`min-h-11 rounded-lg text-[11px] sm:text-xs font-semibold px-1 ${aba === a ? 'bg-orange-600 text-white' : 'bg-gray-50 text-gray-700'}`}>{rot}</button>
        ))}
      </div>
      {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      {aba === 'geral' && (
        <>
          <dl className="text-sm space-y-2">
            {c.documento && <div className="flex gap-2"><dt className="w-24 shrink-0 text-gray-500 inline-flex items-center gap-1.5"><FileText className="w-4 h-4" aria-hidden="true" />{c.tipo_pessoa === 'pf' ? 'CPF' : 'CNPJ'}</dt><dd className="text-gray-900">{mascaraDocumento(c.tipo_pessoa, c.documento)}</dd></div>}
            {c.nome_fantasia && <div className="flex gap-2"><dt className="w-24 shrink-0 text-gray-500">Razão social</dt><dd className="text-gray-900 break-words">{c.nome}</dd></div>}
            {c.telefone && <div className="flex gap-2"><dt className="w-24 shrink-0 text-gray-500 inline-flex items-center gap-1.5"><Phone className="w-4 h-4" aria-hidden="true" />Telefone</dt><dd><a href={`tel:+55${c.telefone}`} className="text-gray-900 hover:text-orange-600">{mascaraTelefone(c.telefone)}</a></dd></div>}
            {c.email && <div className="flex gap-2"><dt className="w-24 shrink-0 text-gray-500 inline-flex items-center gap-1.5"><Mail className="w-4 h-4" aria-hidden="true" />E-mail</dt><dd className="break-all"><a href={`mailto:${c.email}`} className="text-gray-900 hover:text-orange-600">{c.email}</a></dd></div>}
            {endereco.length > 0 && <div className="flex gap-2"><dt className="w-24 shrink-0 text-gray-500 inline-flex items-center gap-1.5"><MapPin className="w-4 h-4" aria-hidden="true" />Endereço</dt><dd className="text-gray-900">{endereco.map((l) => <span key={l as string} className="block">{l}</span>)}</dd></div>}
            {c.observacoes && <div className="flex gap-2"><dt className="w-24 shrink-0 text-gray-500 inline-flex items-center gap-1.5"><StickyNote className="w-4 h-4" aria-hidden="true" />Notas</dt><dd className="text-gray-900 whitespace-pre-line">{c.observacoes}</dd></div>}
          </dl>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-gray-100 p-3"><p className="text-lg font-black text-gray-900">{movs === 'sem_acesso' ? '—' : movs === null ? '…' : lista.filter((m) => m.status !== 'cancelado').length}</p><p className="text-xs text-gray-500">Receitas vinculadas</p></div>
            <div className="rounded-xl border border-gray-100 p-3"><p className="text-lg font-black text-gray-900" data-testid="total-recebido">{movs === 'sem_acesso' ? '—' : movs === null ? '…' : formatarMoeda(recebido)}</p><p className="text-xs text-gray-500">Total recebido</p></div>
          </div>
        </>
      )}
      {aba === 'historico' && (hist === null ? <div role="status" aria-label="Carregando" className="h-24 rounded-lg bg-gray-50 animate-pulse" /> : (
        <ul className="divide-y divide-gray-100 text-sm max-h-80 overflow-y-auto" data-testid="historico-cliente">
          {hist.map((h, i) => (
            <li key={i} className="py-2">
              <p className="font-medium text-gray-900">{ROTULO_ACAO[h.acao] ?? h.acao}</p>
              <p className="text-xs text-gray-500">{new Date(h.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                {h.acao === 'editado' && Array.isArray(h.dados?.campos) ? ` · ${(h.dados!.campos as string[]).map((x) => CAMPOS[x] ?? x).join(', ')}` : ''}
                {h.acao === 'status' ? ` · ${STATUS_CLIENTE[h.dados?.de as StatusCliente]?.rotulo} → ${STATUS_CLIENTE[h.dados?.para as StatusCliente]?.rotulo}` : ''}
                {h.acao.startsWith('receita') ? ` · ${h.dados?.descricao} (${formatarMoeda(h.dados?.valor as number)})` : ''}</p>
            </li>
          ))}
        </ul>
      ))}
      {aba === 'financeiro' && (movs === 'sem_acesso' ? <p className="text-sm text-gray-500">Sem acesso ao financeiro desta empresa.</p> : movs === null ? <div role="status" aria-label="Carregando" className="h-24 rounded-lg bg-gray-50 animate-pulse" /> : (
        <div className="space-y-3" data-testid="financeiro-cliente">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-green-50 p-2"><p className="text-xs text-gray-600">Recebido</p><p className="font-bold text-green-700">{formatarMoeda(recebido)}</p></div>
            <div className="rounded-lg bg-orange-50 p-2"><p className="text-xs text-gray-600">A receber</p><p className="font-bold text-orange-700">{formatarMoeda(aReceber)}</p></div>
          </div>
          {lista.length === 0 ? <p className="text-sm text-gray-500">Nenhuma receita vinculada a este cliente.</p> : (
            <ul className="divide-y divide-gray-100 text-sm max-h-72 overflow-y-auto">
              {lista.map((m) => (
                <li key={m.id} className="py-2 flex items-center gap-2">
                  <span className="flex-1 min-w-0"><span className="block font-medium text-gray-900 truncate">{m.descricao}</span>
                    <span className="block text-xs text-gray-500">{m.situacao === 'pago' ? `Recebida em ${formatarData(m.data_pagamento)}` : `Vence ${formatarData(m.data_vencimento)}`}</span></span>
                  <span className="text-right"><span className="block font-semibold whitespace-nowrap">{formatarMoeda(m.valor)}</span>
                    <Selo tipo={m.situacao === 'pago' ? 'sucesso' : m.situacao === 'vencido' ? 'perigo' : m.situacao === 'cancelado' ? 'neutro' : 'alerta'} texto={{ pago: 'Recebida', vencido: 'Vencida', cancelado: 'Cancelada', pendente: 'A receber' }[m.situacao] ?? m.situacao} /></span>
                  {podeGerir && <button type="button" onClick={() => desvincular(m.id)} aria-label={`Desvincular ${m.descricao}`} className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"><Unlink className="w-4 h-4" aria-hidden="true" /></button>}
                </li>
              ))}
            </ul>
          )}
          {podeGerir && <button type="button" onClick={() => setVinculando(true)} className={`${classeBotaoSecundario} w-full`}><Link2 className="w-4 h-4" aria-hidden="true" />Vincular receita existente</button>}
          <Link href="/app/financeiro#receber" className="block text-center text-sm font-semibold text-orange-600 hover:underline min-h-11 leading-[2.75rem]">Abrir contas a receber</Link>
        </div>
      ))}
      {aba === 'documentos' && <p className="text-sm text-gray-500 py-6 text-center">Documentos por cliente ainda não estão disponíveis. Use Meus documentos para os arquivos da empresa.</p>}
      {podeGerir && <button type="button" onClick={() => aoEditar(c)} className={`${classeBotaoSecundario} w-full`}><Pencil className="w-4 h-4" aria-hidden="true" />Editar cliente</button>}
      <ModalVincularReceita aberto={vinculando} aoFechar={() => setVinculando(false)} idEmpresa={idEmpresa} idCliente={c.id} nomeCliente={nome}
        aoConcluir={(m) => { setVinculando(false); aoAlterar(m); }} />
    </aside>
  );
}
