'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, ClipboardList, Download, Eye, FileText, History, ListChecks, Paperclip, Pencil, Play, Plus, RotateCcw, Tag, X, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, hojeBrasil } from '@/lib/financeiro';
import { ANEXO_OBRIGACAO_ACEITOS, CATEGORIAS_OBRIGACAO, LIMITE_BUCKET_BYTES, MIME_XLSX, SELO_OBRIGACAO, SITUACOES_OBRIGACAO, extensaoDoNome, formatarTamanho, nomeSeguro, rotuloTipo, type Documento, type Obrigacao } from '@/lib/documentos';
import { abrirDocumento, enviarDocumento } from '@/components/documentos/acoes';
import { BarraFiltros, BotaoIcone, BotaoLimparFiltros, Celula, CampoBusca, FiltroSelect, Linha, Paginacao, Selo, Tabela } from '@/components/admin/tabela';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { Indicador } from '@/components/financeiro/Indicador';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
const ACOES: Record<string, string> = { criada: 'Criada', editada: 'Editada', iniciar: 'Iniciada', concluir: 'Concluída', cancelar: 'Cancelada', reabrir: 'Reaberta', tarefa_criada: 'Tarefa criada' };

interface Resumo { obrigacoes_atrasadas: number; obrigacoes_7_dias: number; obrigacoes_abertas: number; obrigacoes_concluidas_mes: number }
type Pessoa = { id_usuario: string; nome: string; papel: string };
type Anexo = Pick<Documento, 'id' | 'nome' | 'caminho' | 'tipo_mime' | 'tamanho'>;

function prazo(o: Obrigacao): string {
  if (o.situacao === 'concluida' || o.situacao === 'cancelada') return formatarData(o.data_vencimento);
  const d = o.dias_para_vencer;
  if (d < 0) return `Venceu há ${-d} ${d === -1 ? 'dia' : 'dias'}`;
  if (d === 0) return 'Vence hoje';
  return d === 1 ? 'Vence amanhã' : `Vence em ${d} dias`;
}

// Obrigações da empresa: cadastradas por quem tem permissão (dono/sócio ou contador com "gerenciar_obrigacoes").
// Nada é gerado automaticamente (sem impostos, valores ou datas inventadas).
export function ModuloObrigacoes({ idEmpresa, papel, versao, aoAlterar, compacto = false, podeAnexar = true }: {
  idEmpresa: string; papel: 'empresa' | 'contador'; versao: number; aoAlterar: (m: string) => void; compacto?: boolean; // compacto: sem os indicadores
  podeAnexar?: boolean; // contador: precisa da permissão "enviar_documentos" para anexar arquivo
}) {
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [situacao, setSituacao] = useState('abertas');
  const [categoria, setCategoria] = useState('');
  const [janela, setJanela] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [lista, setLista] = useState<Obrigacao[]>([]);
  const [anexos, setAnexos] = useState<Record<string, Anexo>>({});
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<{ o: Obrigacao | null } | null>(null);
  const [cancelando, setCancelando] = useState<Obrigacao | null>(null);
  const [historico, setHistorico] = useState<{ o: Obrigacao; itens: { acao: string; criado_em: string }[] } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setBuscaAplicada(busca.trim()); setPagina(1); }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    createClient().rpc('responsaveis_obrigacoes', { p_id_empresa: idEmpresa }).then(({ data }) => setPessoas((data ?? []) as Pessoa[]));
  }, [idEmpresa]);

  useEffect(() => {
    let ativo = true;
    const supabase = createClient();
    const hoje = hojeBrasil();
    const mais = (d: number) => new Date(Date.parse(`${hoje}T12:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
    let q = supabase.from('obrigacoes_empresa_situacao').select('*', { count: 'exact' }).eq('id_empresa', idEmpresa);
    if (situacao === 'abertas') q = q.in('status', ['pendente', 'em_andamento']);
    else if (situacao) q = q.eq('situacao', situacao);
    if (categoria) q = q.eq('categoria', categoria);
    if (janela === 'atrasadas') q = q.lt('data_vencimento', hoje).in('status', ['pendente', 'em_andamento']);
    if (janela === '7') q = q.gte('data_vencimento', hoje).lte('data_vencimento', mais(7));
    if (janela === '30') q = q.gte('data_vencimento', hoje).lte('data_vencimento', mais(30));
    if (buscaAplicada) q = q.ilike('titulo', `%${buscaAplicada.replace(/[%_,()]/g, ' ')}%`);
    const de = (pagina - 1) * porPagina;
    setCarregando(true);
    Promise.all([
      q.order('data_vencimento').range(de, de + porPagina - 1),
      supabase.rpc('resumo_documentos_obrigacoes', { p_id_empresa: idEmpresa }),
    ]).then(([l, r]) => {
      if (!ativo) return;
      setCarregando(false);
      if (l.error) return setErro(mensagemDeErro(l.error, 'Não foi possível carregar as obrigações.'));
      setErro(null);
      const itens = (l.data ?? []) as Obrigacao[];
      setLista(itens);
      setTotal(l.count ?? 0);
      setResumo(r.error ? null : (r.data as Resumo));
      // Anexos: só os que quem está vendo consegue ler (RLS de documentos_empresa)
      const ids = itens.map((o) => o.id_documento).filter((x): x is string => !!x);
      if (!ids.length) return setAnexos({});
      supabase.from('documentos_empresa').select('id, nome, caminho, tipo_mime, tamanho').in('id', ids)
        .then(({ data }) => { if (ativo) setAnexos(Object.fromEntries(((data ?? []) as Anexo[]).map((d) => [d.id, d]))); });
    });
    return () => { ativo = false; };
  }, [idEmpresa, situacao, categoria, janela, buscaAplicada, pagina, porPagina, versao]);

  const acao = async (o: Obrigacao, a: 'iniciar' | 'concluir' | 'reabrir') => {
    const { error } = await createClient().rpc('alterar_situacao_obrigacao', { p_id: o.id, p_acao: a, p_motivo: null });
    aoAlterar(error ? `Atenção: ${mensagemDeErro(error, 'Não foi possível alterar a obrigação.')}` : a === 'concluir' ? 'Obrigação concluída.' : a === 'iniciar' ? 'Obrigação em andamento.' : 'Obrigação reaberta.');
  };
  const criarTarefa = async (o: Obrigacao) => {
    const { error } = await createClient().rpc('criar_tarefa_da_obrigacao', { p_id: o.id });
    aoAlterar(error ? `Atenção: ${mensagemDeErro(error, 'Não foi possível criar a tarefa.')}` : 'Tarefa criada em Tarefas.');
  };
  const verHistorico = async (o: Obrigacao) => {
    const { data } = await createClient().from('historico_obrigacoes').select('acao, criado_em').eq('id_obrigacao', o.id).order('criado_em');
    setHistorico({ o, itens: data ?? [] });
  };

  const nome = (id: string | null) => (id ? pessoas.find((p) => p.id_usuario === id)?.nome ?? '—' : 'Sem responsável');
  const filtros = busca || situacao !== 'abertas' || categoria || janela;

  return (
    <div className="space-y-5 min-w-0">
      <div hidden={compacto} className="grid gap-3 sm:gap-4 grid-cols-1 min-[360px]:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Atrasadas" valor={String(resumo?.obrigacoes_atrasadas ?? 0)} icone={AlertCircle} cor="bg-red-100 text-red-600" destaque={resumo?.obrigacoes_atrasadas ? 'text-red-700' : undefined} />
        <Indicador titulo="Vencem em 7 dias" valor={String(resumo?.obrigacoes_7_dias ?? 0)} icone={CalendarClock} cor="bg-orange-100 text-orange-600" />
        <Indicador titulo="Em aberto" valor={String(resumo?.obrigacoes_abertas ?? 0)} icone={ClipboardList} cor="bg-blue-100 text-blue-600" />
        <Indicador titulo="Concluídas no mês" valor={String(resumo?.obrigacoes_concluidas_mes ?? 0)} icone={CheckCircle2} cor="bg-green-100 text-green-600" />
      </div>

      <section aria-label="Lista de obrigações" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-gray-500">Cadastre as obrigações combinadas com o seu contador. O sistema não cria obrigações, valores ou prazos automaticamente.</p>
          <button type="button" onClick={() => setForm({ o: null })} className={classeBotaoPrimario}><Plus className="w-4 h-4" aria-hidden="true" />Nova obrigação</button>
        </div>
        <BarraFiltros>
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar obrigação" />
          <FiltroSelect valor={situacao} aoMudar={(v) => { setSituacao(v); setPagina(1); }}>
            <option value="abertas">Em aberto</option>
            <option value="">Todas as situações</option>
            {Object.entries(SITUACOES_OBRIGACAO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </FiltroSelect>
          <FiltroSelect icone={Tag} valor={categoria} aoMudar={(v) => { setCategoria(v); setPagina(1); }}>
            <option value="">Todas as categorias</option>
            {Object.entries(CATEGORIAS_OBRIGACAO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </FiltroSelect>
          <FiltroSelect icone={CalendarClock} valor={janela} aoMudar={(v) => { setJanela(v); setPagina(1); }}>
            <option value="">Qualquer vencimento</option>
            <option value="atrasadas">Vencidas</option>
            <option value="7">Próximos 7 dias</option>
            <option value="30">Próximos 30 dias</option>
          </FiltroSelect>
          {filtros && <BotaoLimparFiltros aoClicar={() => { setBusca(''); setSituacao('abertas'); setCategoria(''); setJanela(''); setPagina(1); }} />}
        </BarraFiltros>

        {erro ? <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{erro}</div>
          : carregando ? <div role="status" aria-label="Carregando" className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-gray-50 animate-pulse" />)}</div>
          : lista.length === 0 ? (
            <div className="text-center py-12">
              <ListChecks className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
              <p className="font-semibold text-gray-900">{filtros ? 'Nenhuma obrigação com esses filtros.' : 'Nenhuma obrigação em aberto.'}</p>
            </div>
          ) : (
            <Tabela colunas={[{ titulo: 'Obrigação' }, { titulo: 'Categoria' }, { titulo: 'Responsável' }, { titulo: 'Vencimento' }, { titulo: 'Situação' }, { titulo: 'Ações', alinhar: 'centro' }]}>
              {lista.map((o) => {
                const aberta = o.status === 'pendente' || o.status === 'em_andamento';
                return (
                  <Linha key={o.id}>
                    <Celula>
                      <div className="min-w-0" data-testid={`obrigacao-${o.titulo}`}>
                        <p className="text-sm font-bold text-gray-900 break-words">{o.titulo}</p>
                        {o.descricao && <p className="text-xs text-gray-500 break-words">{o.descricao}</p>}
                        <p className="text-xs text-gray-500">{[o.id_documento && !anexos[o.id_documento] && 'Com documento', o.id_tarefa && 'Com tarefa'].filter(Boolean).join(' · ')}</p>
                        {o.id_documento && anexos[o.id_documento] && (
                          <div className="min-w-0 [contain:inline-size]"><AnexoDaObrigacao anexo={anexos[o.id_documento]} aoErro={(m) => aoAlterar(`Atenção: ${m}`)} /></div> // não aumenta a largura mínima do cartão no celular
                        )}
                      </div>
                    </Celula>
                    <Celula>{CATEGORIAS_OBRIGACAO[o.categoria]}</Celula>
                    <Celula>{nome(o.id_responsavel)}</Celula>
                    <Celula>
                      <span className="whitespace-nowrap">{formatarData(o.data_vencimento)}</span>
                      <span className={`block text-xs ${o.situacao === 'atrasada' ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>{prazo(o)}</span>
                    </Celula>
                    <Celula><Selo tipo={SELO_OBRIGACAO[o.situacao]} texto={SITUACOES_OBRIGACAO[o.situacao]} /></Celula>
                    <Celula>
                      <div className="flex items-center justify-end min-[85rem]:justify-center gap-2 min-[85rem]:gap-1.5 flex-wrap">
                        {aberta && <BotaoIcone icone={Pencil} titulo={`Editar ${o.titulo}`} aoClicar={() => setForm({ o })} />}
                        {o.status === 'pendente' && <BotaoIcone icone={Play} titulo={`Iniciar ${o.titulo}`} aoClicar={() => acao(o, 'iniciar')} />}
                        {aberta && <BotaoIcone icone={CheckCircle2} titulo={`Concluir ${o.titulo}`} aoClicar={() => acao(o, 'concluir')} />}
                        {aberta && <BotaoIcone icone={XCircle} titulo={`Cancelar ${o.titulo}`} aoClicar={() => setCancelando(o)} />}
                        {!aberta && <BotaoIcone icone={RotateCcw} titulo={`Reabrir ${o.titulo}`} aoClicar={() => acao(o, 'reabrir')} />}
                        {papel === 'empresa' && aberta && !o.id_tarefa && <BotaoIcone icone={ListChecks} titulo={`Criar tarefa de ${o.titulo}`} aoClicar={() => criarTarefa(o)} />}
                        <BotaoIcone icone={History} titulo={`Histórico de ${o.titulo}`} aoClicar={() => verHistorico(o)} />
                      </div>
                    </Celula>
                  </Linha>
                );
              })}
            </Tabela>
          )}
        {!erro && !carregando && total > 0 && <Paginacao pagina={pagina} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={setPorPagina} total={total} />}
      </section>

      <FormObrigacao alvo={form} idEmpresa={idEmpresa} pessoas={pessoas} podeAnexar={podeAnexar} aoFechar={() => setForm(null)} aoSalvar={(m) => { setForm(null); aoAlterar(m); }} />
      <CancelarObrigacao obrigacao={cancelando} aoFechar={() => setCancelando(null)} aoConcluir={(m) => { setCancelando(null); aoAlterar(m); }} />
      <Modal aberto={!!historico} aoFechar={() => setHistorico(null)} titulo="Histórico da obrigação" descricao={historico?.o.titulo}>
        <ol className="border-l-2 border-orange-200 pl-3 space-y-1.5 text-sm">
          {historico?.itens.map((h, i) => (
            <li key={i} className="flex justify-between gap-3"><span className="text-gray-800">{ACOES[h.acao] ?? h.acao}</span>
              <span className="text-gray-500 whitespace-nowrap">{new Date(h.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</span></li>
          ))}
        </ol>
      </Modal>
    </div>
  );
}

// Anexo já cadastrado: nome, tipo, tamanho e abrir/baixar (URL temporária, autorizada pelo Storage). Planilha só baixa.
function BotaoAnexo({ icone: Icone, titulo, aoClicar }: { icone: typeof Eye; titulo: string; aoClicar: () => void }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} onClick={aoClicar}
      className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-md text-gray-700 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
      <Icone className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}

function AnexoDaObrigacao({ anexo, aoErro }: { anexo: Anexo; aoErro: (m: string) => void }) {
  const abrir = (baixar: boolean) => abrirDocumento(anexo, baixar).catch((e: Error) => aoErro(e.message));
  return (
    <div className="mt-1 flex w-fit max-w-full min-w-0 items-center gap-1.5 rounded-lg bg-gray-50 border border-gray-200 px-2 py-1 text-xs text-gray-700" data-testid={`anexo-${anexo.nome}`}>
      <Paperclip className="w-3.5 h-3.5 shrink-0 text-orange-600" aria-hidden="true" />
      <span className="min-w-0 truncate">{anexo.nome}</span><span className="shrink-0 text-gray-500 whitespace-nowrap">{rotuloTipo(anexo.tipo_mime)} · {formatarTamanho(anexo.tamanho)}</span>
      {anexo.tipo_mime !== MIME_XLSX && <BotaoAnexo icone={Eye} titulo={`Visualizar anexo ${anexo.nome}`} aoClicar={() => abrir(false)} />}
      <BotaoAnexo icone={Download} titulo={`Baixar anexo ${anexo.nome}`} aoClicar={() => abrir(true)} />
    </div>
  );
}

function FormObrigacao({ alvo, idEmpresa, pessoas, podeAnexar, aoFechar, aoSalvar }: { alvo: { o: Obrigacao | null } | null; idEmpresa: string; pessoas: Pessoa[]; podeAnexar: boolean; aoFechar: () => void; aoSalvar: (m: string) => void }) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('outras');
  const [responsavel, setResponsavel] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [documento, setDocumento] = useState('');
  const [docs, setDocs] = useState<{ id: string; nome: string }[]>([]);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [seletorArquivo, setSeletorArquivo] = useState(0); // troca a chave do <input> para limpar a seleção
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!alvo) return;
    const o = alvo.o;
    setTitulo(o?.titulo ?? ''); setDescricao(o?.descricao ?? ''); setCategoria(o?.categoria ?? 'outras'); setResponsavel(o?.id_responsavel ?? '');
    setVencimento(o?.data_vencimento ?? ''); setObservacoes(o?.observacoes ?? ''); setDocumento(o?.id_documento ?? ''); setErro(null); setArquivo(null);
    // Só documentos que quem está editando consegue ver (RLS)
    createClient().from('documentos_empresa').select('id, nome').eq('id_empresa', idEmpresa).order('enviado_em', { ascending: false }).limit(100)
      .then(({ data }) => setDocs(data ?? []));
  }, [alvo, idEmpresa]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (titulo.trim().length < 3) return setErro('Informe o título (mínimo 3 caracteres).');
    if (!vencimento) return setErro('Informe o vencimento.');
    setSalvando(true);
    const supabase = createClient();
    // 1) Envia o anexo (vira documento privado da empresa, visível a quem acessa a obrigação). Falhou: nada é salvo.
    let idDocumento: string | null = documento || null;
    let novoDocumento: string | null = null;
    if (arquivo) {
      try {
        novoDocumento = await enviarDocumento({ arquivo, idEmpresa, nome: nomeSeguro(arquivo.name.replace(/\.[^.]+$/, ''), 'Anexo'), categoria: 'outros', compartilhar: true, finalidade: 'obrigacao' });
        idDocumento = novoDocumento;
      } catch (e) {
        setSalvando(false);
        return setErro((e as Error).message || 'Não foi possível enviar o anexo.');
      }
    }
    // 2) Salva a obrigação já com o vínculo. Falhou: descarta o anexo recém-enviado (sem referência inválida nem arquivo órfão)
    const { error } = await supabase.rpc('salvar_obrigacao', {
      p_id: alvo?.o?.id ?? null, p_id_empresa: idEmpresa, p_titulo: titulo.trim(), p_descricao: descricao.trim() || null, p_categoria: categoria,
      p_id_responsavel: responsavel || null, p_data_vencimento: vencimento, p_observacoes: observacoes.trim() || null, p_id_documento: idDocumento,
    });
    if (error && novoDocumento) {
      const { data: caminho } = await supabase.rpc('excluir_documento', { p_id: novoDocumento });
      if (caminho) await supabase.storage.from('documentos-empresas').remove([caminho as string]);
    }
    setSalvando(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar a obrigação.'));
    aoSalvar(alvo?.o ? 'Obrigação atualizada.' : 'Obrigação cadastrada.');
  };

  return (
    <Modal aberto={!!alvo} aoFechar={aoFechar} titulo={alvo?.o ? 'Editar obrigação' : 'Nova obrigação'}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="submit" form="form-obrigacao" disabled={salvando} className={classeBotaoPrimario}>{salvando ? 'Salvando...' : 'Salvar'}</button></>}>
      <form id="form-obrigacao" onSubmit={salvar} noValidate className="space-y-4">
        <div><label htmlFor="obr-titulo" className={rotulo}>Título</label>
          <input id="obr-titulo" maxLength={150} value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="obr-categoria" className={rotulo}>Categoria</label>
            <select id="obr-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campo}>
              {Object.entries(CATEGORIAS_OBRIGACAO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select></div>
          <div><label htmlFor="obr-vencimento" className={rotulo}>Vencimento</label>
            <input id="obr-vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={campo} /></div>
        </div>
        <div><label htmlFor="obr-responsavel" className={rotulo}>Responsável</label>
          <select id="obr-responsavel" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={campo}>
            <option value="">Sem responsável</option>
            {pessoas.map((p) => <option key={p.id_usuario} value={p.id_usuario}>{p.nome}{p.papel === 'contador' ? ' (contador)' : ''}</option>)}
          </select></div>
        <div><label htmlFor="obr-descricao" className={rotulo}>Descrição <span className="font-normal text-gray-500">(opcional)</span></label>
          <textarea id="obr-descricao" rows={2} maxLength={2000} value={descricao} onChange={(e) => setDescricao(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
        <div><label htmlFor="obr-documento" className={rotulo}>Documento relacionado <span className="font-normal text-gray-500">(opcional)</span></label>
          <select id="obr-documento" value={documento} onChange={(e) => setDocumento(e.target.value)} className={campo}>
            <option value="">Nenhum</option>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select></div>
        <div><label htmlFor="obr-anexo" className={rotulo}>Anexar arquivo <span className="font-normal text-gray-500">(opcional)</span></label>
          {podeAnexar ? (
            <>
              <input id="obr-anexo" key={seletorArquivo} type="file" accept={ANEXO_OBRIGACAO_ACEITOS} aria-describedby="obr-anexo-ajuda"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (!f) return setArquivo(null);
                  if (!extensaoDoNome(f.name)) { setErro('Envie PDF, JPG, PNG ou XLSX.'); setArquivo(null); return setSeletorArquivo((n) => n + 1); }
                  if (f.size === 0 || f.size > LIMITE_BUCKET_BYTES) { setErro('O arquivo deve ter até 10 MB.'); setArquivo(null); return setSeletorArquivo((n) => n + 1); }
                  setErro(null); setArquivo(f);
                }}
                className="block w-full text-sm text-gray-700 file:mr-3 file:h-10 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-sm file:font-semibold file:text-gray-800 hover:file:bg-gray-200" />
              <p id="obr-anexo-ajuda" className="mt-1 text-xs text-gray-500">PDF, JPG, PNG ou XLSX, até 10 MB. {documento ? 'Ao anexar, substitui o documento relacionado acima.' : 'Fica visível para a empresa e para o contador desta obrigação.'}</p>
              {arquivo && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm" data-testid="anexo-selecionado">
                  <FileText className="w-4 h-4 shrink-0 text-orange-600" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{arquivo.name}</span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{formatarTamanho(arquivo.size)}</span>
                  <button type="button" aria-label={`Remover ${arquivo.name}`} onClick={() => { setArquivo(null); setSeletorArquivo((n) => n + 1); }}
                    className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"><X className="w-4 h-4" aria-hidden="true" /></button>
                </div>
              )}
            </>
          ) : <p className="text-xs text-gray-500">Seu vínculo não inclui enviar documentos. Peça à empresa para liberar "Enviar documentos".</p>}
        </div>
        <div><label htmlFor="obr-observacoes" className={rotulo}>Observações <span className="font-normal text-gray-500">(opcional)</span></label>
          <textarea id="obr-observacoes" rows={2} maxLength={2000} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      </form>
    </Modal>
  );
}

function CancelarObrigacao({ obrigacao, aoFechar, aoConcluir }: { obrigacao: Obrigacao | null; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (obrigacao) { setMotivo(''); setErro(null); } }, [obrigacao]);
  const confirmar = async () => {
    if (!obrigacao) return;
    if (motivo.trim().length < 3) return setErro('Informe o motivo do cancelamento.');
    const { error } = await createClient().rpc('alterar_situacao_obrigacao', { p_id: obrigacao.id, p_acao: 'cancelar', p_motivo: motivo.trim() });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível cancelar.'));
    aoConcluir('Obrigação cancelada.');
  };
  return (
    <Modal aberto={!!obrigacao} aoFechar={aoFechar} titulo="Cancelar obrigação" descricao={obrigacao?.titulo}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Voltar</button>
        <button type="button" className={classeBotaoPerigo} onClick={confirmar}>Cancelar obrigação</button></>}>
      <label htmlFor="obr-motivo" className={rotulo}>Motivo</label>
      <textarea id="obr-motivo" rows={2} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
      {erro && <p role="alert" className="text-sm text-red-700 mt-2">{erro}</p>}
    </Modal>
  );
}
