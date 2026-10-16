'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, LayoutGrid, List, MoreVertical, Pencil, Pin, PinOff, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import {
  CATEGORIAS_ANOTACAO, COR_CATEGORIA, LIMITE_CONTEUDO, LIMITE_TAG, LIMITE_TAGS, LIMITE_TITULO, ROTULO_CATEGORIA, casaComBusca, dataHoraAnotacao, limparTags, ordenarAnotacoes,
  type Anotacao, type CategoriaAnotacao,
} from '@/lib/anotacoes';
import { classePilula } from '@/components/navegacao/NavegacaoModulos';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
const COLUNAS = 'id, titulo, conteudo, categoria, tags, fixada, criado_por, atualizado_em';

function Etiqueta({ categoria }: { categoria: CategoriaAnotacao }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${COR_CATEGORIA[categoria]}`}>{ROTULO_CATEGORIA[categoria]}</span>;
}

// Telas largas: painel ao lado; menores: gaveta (Modal). Decidido no navegador.
function useTelaLarga() {
  const [larga, setLarga] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1280px)');
    const ajustar = () => setLarga(m.matches);
    ajustar();
    m.addEventListener('change', ajustar);
    return () => m.removeEventListener('change', ajustar);
  }, []);
  return larga;
}

export function ModuloAnotacoes({ idEmpresa }: { idEmpresa: string }) {
  const [lista, setLista] = useState<Anotacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<'' | CategoriaAnotacao>('');
  const [vista, setVista] = useState<'grade' | 'lista'>('grade');
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [form, setForm] = useState<{ a: Anotacao | null } | null>(null);
  const [excluindo, setExcluindo] = useState<Anotacao | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [versao, setVersao] = useState(0);
  const larga = useTelaLarga();

  useEffect(() => {
    let ativo = true;
    createClient().from('anotacoes').select(COLUNAS).eq('id_empresa', idEmpresa).order('fixada', { ascending: false }).order('atualizado_em', { ascending: false }).limit(500)
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) { setErro(mensagemDeErro(error, 'Não foi possível carregar as anotações.')); setLista([]); return; }
        setErro(null);
        setLista(ordenarAnotacoes((data ?? []) as Anotacao[]));
      });
    return () => { ativo = false; };
  }, [idEmpresa, versao]);

  useEffect(() => {
    if (!menu) return;
    const fechar = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) return e.key === 'Escape' && setMenu(null);
      if (!(e.target as HTMLElement).closest('[data-menu-anotacao]')) setMenu(null);
    };
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', fechar);
    return () => { document.removeEventListener('mousedown', fechar); document.removeEventListener('keydown', fechar); };
  }, [menu]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  const filtradas = useMemo(() => (lista ?? []).filter((a) => (!categoria || a.categoria === categoria) && casaComBusca(a, busca)), [lista, categoria, busca]);
  const atual = (lista ?? []).find((a) => a.id === selecionada) ?? null;
  const filtrosAtivos = !!busca.trim() || !!categoria;

  const salvarCampos = async (a: Anotacao, campos: Partial<Pick<Anotacao, 'categoria' | 'tags'>>, msg: string) => {
    const { error } = await createClient().rpc('salvar_anotacao', {
      p_id: a.id, p_id_empresa: idEmpresa, p_titulo: a.titulo, p_conteudo: a.conteudo, p_categoria: campos.categoria ?? a.categoria, p_tags: campos.tags ?? a.tags,
    });
    if (error) return setAviso({ tipo: 'erro', texto: mensagemDeErro(error, 'Não foi possível salvar a anotação.') });
    setAviso({ tipo: 'ok', texto: msg });
    recarregar();
  };
  const alternarFixacao = async (a: Anotacao) => {
    setMenu(null);
    const { error } = await createClient().rpc('alternar_fixacao_anotacao', { p_id: a.id, p_fixada: !a.fixada });
    if (error) return setAviso({ tipo: 'erro', texto: mensagemDeErro(error, 'Não foi possível fixar a anotação.') });
    setAviso({ tipo: 'ok', texto: a.fixada ? 'Anotação desafixada.' : 'Anotação fixada.' });
    recarregar();
  };

  const detalhe = atual && (
    <DetalheAnotacao a={atual} aoFechar={() => setSelecionada(null)} aoFixar={() => alternarFixacao(atual)} aoEditar={() => setForm({ a: atual })} aoExcluir={() => setExcluindo(atual)}
      aoCategoria={(c) => salvarCampos(atual, { categoria: c }, 'Categoria atualizada.')} aoTags={(t) => salvarCampos(atual, { tags: t }, 'Tags atualizadas.')} />
  );

  return (
    <div className="space-y-4 min-w-0" data-testid="modulo-anotacoes">
      {aviso && (
        <div role={aviso.tipo === 'erro' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm flex items-start justify-between gap-3 ${aviso.tipo === 'erro' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
          <span>{aviso.texto}</span><button type="button" onClick={() => setAviso(null)} className="text-xs font-semibold underline shrink-0">Fechar</button>
        </div>
      )}

      <section aria-label="Anotações" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 space-y-4 min-w-0">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1 min-w-0 lg:max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input type="search" aria-label="Pesquisar anotações" placeholder="Pesquisar anotações..." value={busca} onChange={(e) => setBusca(e.target.value)}
              className="w-full h-11 pl-9 pr-3 rounded-xl bg-gray-100 border border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white" />
          </div>
          <div role="tablist" aria-label="Filtrar por categoria" className="flex flex-wrap gap-2">
            {[{ id: '' as const, rotulo: 'Todas' }, ...CATEGORIAS_ANOTACAO.map((c) => ({ id: c.id, rotulo: c.rotulo }))].map((c) => (
              <button key={c.id || 'todas'} type="button" role="tab" aria-selected={categoria === c.id} onClick={() => setCategoria(c.id)} className={classePilula(categoria === c.id)}>{c.rotulo}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 lg:ml-auto">
            <button type="button" onClick={() => setForm({ a: null })} className={`${classeBotaoPrimario} whitespace-nowrap`}><Plus className="w-4 h-4" aria-hidden="true" />Nova anotação</button>
            <div role="group" aria-label="Modo de visualização" className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
              {([['grade', 'Grade', LayoutGrid], ['lista', 'Lista', List]] as const).map(([v, r, Icone]) => (
                <button key={v} type="button" aria-label={`Visualizar em ${r.toLowerCase()}`} aria-pressed={vista === v} onClick={() => setVista(v)}
                  className={`w-11 h-11 inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 ${vista === v ? 'bg-orange-100 text-orange-600' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                  <Icone className="w-5 h-5" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={`grid gap-4 min-w-0 ${atual && larga ? 'xl:grid-cols-[minmax(0,1fr)_24rem]' : ''}`}>
          <div className="min-w-0">
            {erro ? (
              <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex flex-wrap items-center justify-between gap-3">
                {erro}<button type="button" onClick={recarregar} className="min-h-11 px-3 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button>
              </div>
            ) : lista === null ? (
              <div role="status" aria-label="Carregando" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-44 rounded-2xl bg-gray-50 animate-pulse" />)}</div>
            ) : filtradas.length === 0 ? (
              <div className="text-center py-14">
                <Pencil className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
                <p className="font-semibold text-gray-900">{filtrosAtivos ? 'Nenhuma anotação com esses filtros.' : 'Você ainda não tem anotações.'}</p>
                {!filtrosAtivos && <p className="text-sm text-gray-500 mt-1">Clique em "Nova anotação" para registrar sua primeira ideia ou lembrete.</p>}
              </div>
            ) : (
              <ul className={vista === 'grade' ? `grid gap-3 sm:grid-cols-2 ${atual && larga ? 'xl:grid-cols-2 2xl:grid-cols-3' : 'xl:grid-cols-3'}` : 'space-y-2'} aria-label="Lista de anotações">
                {filtradas.map((a) => (
                  <li key={a.id} className="min-w-0" data-testid={`anotacao-${a.titulo}`}>
                    <CartaoAnotacao a={a} vista={vista} selecionada={a.id === selecionada} menuAberto={menu === a.id} aoSelecionar={() => setSelecionada(a.id)}
                      aoFixar={() => alternarFixacao(a)} aoMenu={() => setMenu(menu === a.id ? null : a.id)}
                      aoEditar={() => { setMenu(null); setForm({ a }); }} aoExcluir={() => { setMenu(null); setExcluindo(a); }} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          {atual && larga && <aside aria-label="Detalhes da anotação" className="min-w-0 self-start rounded-2xl border border-gray-200 bg-white p-4 xl:sticky xl:top-20">{detalhe}</aside>}
        </div>
      </section>

      {atual && !larga && (
        <Modal aberto aoFechar={() => setSelecionada(null)} titulo="Anotação"><div aria-label="Detalhes da anotação" role="region">{detalhe}</div></Modal>
      )}
      {form && <FormAnotacao anotacao={form.a} idEmpresa={idEmpresa} categoriaInicial={categoria || 'pessoal'} aoFechar={() => setForm(null)}
        aoSalvar={(id, msg) => { setForm(null); setAviso({ tipo: 'ok', texto: msg }); setSelecionada(id); recarregar(); }} />}
      {excluindo && <ModalExcluir a={excluindo} aoFechar={() => setExcluindo(null)}
        aoConcluir={() => { if (selecionada === excluindo.id) setSelecionada(null); setExcluindo(null); setAviso({ tipo: 'ok', texto: 'Anotação excluída.' }); recarregar(); }} />}
    </div>
  );
}

function CartaoAnotacao({ a, vista, selecionada, menuAberto, aoSelecionar, aoFixar, aoMenu, aoEditar, aoExcluir }: {
  a: Anotacao; vista: 'grade' | 'lista'; selecionada: boolean; menuAberto: boolean; aoSelecionar: () => void; aoFixar: () => void; aoMenu: () => void; aoEditar: () => void; aoExcluir: () => void;
}) {
  const barra = (
    <div className="flex items-center gap-1 shrink-0" data-menu-anotacao>
      <button type="button" onClick={aoFixar} aria-label={`${a.fixada ? 'Desafixar' : 'Fixar'} ${a.titulo}`} aria-pressed={a.fixada}
        className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
        {a.fixada ? <Pin className="w-4 h-4 text-orange-600 fill-orange-600" aria-hidden="true" /> : <Pin className="w-4 h-4" aria-hidden="true" />}
      </button>
      <div className="relative">
        <button type="button" onClick={aoMenu} aria-label={`Ações de ${a.titulo}`} aria-haspopup="menu" aria-expanded={menuAberto}
          className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"><MoreVertical className="w-4 h-4" aria-hidden="true" /></button>
        {menuAberto && (
          <div role="menu" aria-label={`Ações de ${a.titulo}`} className="absolute right-0 mt-1 w-40 bg-white rounded-xl border border-gray-200 shadow-lg z-20 py-1">
            <button type="button" role="menuitem" onClick={aoEditar} className="w-full min-h-10 px-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 inline-flex items-center gap-2"><Pencil className="w-4 h-4" aria-hidden="true" />Editar</button>
            <button type="button" role="menuitem" onClick={aoFixar} className="w-full min-h-10 px-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 inline-flex items-center gap-2">
              {a.fixada ? <PinOff className="w-4 h-4" aria-hidden="true" /> : <Pin className="w-4 h-4" aria-hidden="true" />}{a.fixada ? 'Desafixar' : 'Fixar'}</button>
            <button type="button" role="menuitem" onClick={aoExcluir} className="w-full min-h-10 px-3 text-left text-sm font-medium text-red-700 hover:bg-red-50 inline-flex items-center gap-2"><Trash2 className="w-4 h-4" aria-hidden="true" />Excluir</button>
          </div>
        )}
      </div>
    </div>
  );
  const moldura = `rounded-2xl border bg-white transition-colors ${selecionada ? 'border-orange-400 bg-orange-50/40' : 'border-gray-200 hover:border-gray-300'}`;
  if (vista === 'lista') {
    return (
      <div className={`${moldura} flex items-center gap-3 px-3 py-2`}>
        <button type="button" onClick={aoSelecionar} aria-label={`Abrir ${a.titulo}`} aria-current={selecionada ? 'true' : undefined} className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-lg">
          <Etiqueta categoria={a.categoria} />
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-gray-900 truncate">{a.titulo}</span><span className="block text-xs text-gray-500 truncate">{a.conteudo.replace(/\s+/g, ' ')}</span></span>
          <span className="hidden sm:inline text-xs text-gray-500 whitespace-nowrap">{dataHoraAnotacao(a.atualizado_em)}</span>
        </button>
        {barra}
      </div>
    );
  }
  return (
    <div className={`${moldura} p-4 flex flex-col h-full`}>
      <div className="flex items-start justify-between gap-2 mb-2"><Etiqueta categoria={a.categoria} />{barra}</div>
      <button type="button" onClick={aoSelecionar} aria-label={`Abrir ${a.titulo}`} aria-current={selecionada ? 'true' : undefined} className="flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-lg">
        <span className="block text-lg font-bold text-gray-900 break-words">{a.titulo}</span>
        <span className="block text-sm text-gray-600 mt-1 line-clamp-3 whitespace-pre-line break-words">{a.conteudo}</span>
        <span className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500"><CalendarDays className="w-4 h-4" aria-hidden="true" />{dataHoraAnotacao(a.atualizado_em)}</span>
      </button>
    </div>
  );
}

function DetalheAnotacao({ a, aoFechar, aoFixar, aoEditar, aoExcluir, aoCategoria, aoTags }: {
  a: Anotacao; aoFechar: () => void; aoFixar: () => void; aoEditar: () => void; aoExcluir: () => void; aoCategoria: (c: CategoriaAnotacao) => void; aoTags: (t: string[]) => void;
}) {
  const [novaTag, setNovaTag] = useState<string | null>(null);
  const botao = 'w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500';
  const adicionar = () => {
    const t = (novaTag ?? '').trim();
    setNovaTag(null);
    if (t && a.tags.length < LIMITE_TAGS) aoTags(limparTags([...a.tags, t]));
  };
  return (
    <div className="space-y-4 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <Etiqueta categoria={a.categoria} />
        <div className="flex items-center gap-1">
          <button type="button" onClick={aoFixar} aria-label={a.fixada ? 'Desafixar anotação' : 'Fixar anotação'} aria-pressed={a.fixada} className={`${botao} text-gray-600`}>
            <Pin className={`w-4 h-4 ${a.fixada ? 'text-orange-600 fill-orange-600' : ''}`} aria-hidden="true" /></button>
          <button type="button" onClick={aoEditar} aria-label="Editar anotação" className={`${botao} text-gray-600`}><Pencil className="w-4 h-4" aria-hidden="true" /></button>
          <button type="button" onClick={aoExcluir} aria-label="Excluir anotação" className={`${botao} text-orange-600`}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
          <button type="button" onClick={aoFechar} aria-label="Fechar detalhes" className={`${botao} text-gray-600`}><X className="w-4 h-4" aria-hidden="true" /></button>
        </div>
      </div>
      <div>
        <h2 className="text-xl font-black text-gray-900 break-words">{a.titulo}</h2>
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-gray-500"><CalendarDays className="w-4 h-4" aria-hidden="true" />{dataHoraAnotacao(a.atualizado_em)}</p>
      </div>
      <div data-testid="conteudo-anotacao" className="rounded-xl bg-amber-50/70 p-4 text-sm text-gray-800 whitespace-pre-wrap break-words max-h-[26rem] overflow-y-auto">{a.conteudo}</div>
      <div>
        <label htmlFor="det-categoria" className={rotulo}>Categoria</label>
        <select id="det-categoria" value={a.categoria} onChange={(e) => aoCategoria(e.target.value as CategoriaAnotacao)} className={campo}>
          {CATEGORIAS_ANOTACAO.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
        </select>
      </div>
      <div>
        <p className={rotulo}>Tags</p>
        <ul className="flex flex-wrap gap-2" aria-label="Tags da anotação">
          {a.tags.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white pl-3 pr-1 py-1 text-xs font-medium text-gray-700">
              {t}<button type="button" aria-label={`Remover a tag ${t}`} onClick={() => aoTags(a.tags.filter((x) => x !== t))} className="w-5 h-5 inline-flex items-center justify-center rounded-full hover:bg-gray-100"><X className="w-3 h-3" aria-hidden="true" /></button>
            </li>
          ))}
          <li>
            {novaTag === null ? (
              a.tags.length < LIMITE_TAGS && <button type="button" onClick={() => setNovaTag('')} aria-label="Adicionar tag" className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"><Plus className="w-4 h-4" aria-hidden="true" /></button>
            ) : (
              <input autoFocus aria-label="Nova tag" maxLength={LIMITE_TAG} value={novaTag} onChange={(e) => setNovaTag(e.target.value)} onBlur={adicionar}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } if (e.key === 'Escape') setNovaTag(null); }}
                className="h-8 w-28 px-3 rounded-full border border-orange-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500" />
            )}
          </li>
        </ul>
      </div>
    </div>
  );
}

// Editor leve: texto puro com quebras de linha e botões para listas simples (nada de HTML: sem risco de script injetado)
function FormAnotacao({ anotacao, idEmpresa, categoriaInicial, aoFechar, aoSalvar }: {
  anotacao: Anotacao | null; idEmpresa: string; categoriaInicial: CategoriaAnotacao; aoFechar: () => void; aoSalvar: (id: string, msg: string) => void;
}) {
  const [titulo, setTitulo] = useState(anotacao?.titulo ?? '');
  const [conteudo, setConteudo] = useState(anotacao?.conteudo ?? '');
  const [cat, setCat] = useState<CategoriaAnotacao>(anotacao?.categoria ?? categoriaInicial);
  const [tags, setTags] = useState<string[]>(anotacao?.tags ?? []);
  const [tagDigitada, setTagDigitada] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  // Lista simples: prefixa as linhas selecionadas ("- " ou "1. ", "2. "…); repetir o botão remove o prefixo
  const lista = (numerada: boolean) => {
    const el = area.current;
    if (!el) return;
    const ini = conteudo.lastIndexOf('\n', el.selectionStart - 1) + 1;
    let fim = conteudo.indexOf('\n', el.selectionEnd);
    if (fim === -1) fim = conteudo.length;
    const linhas = conteudo.slice(ini, fim).split('\n');
    const prefixo = /^(\s*)(?:[-*]|\d+\.)\s+/;
    const todas = linhas.every((l) => prefixo.test(l));
    const novas = linhas.map((l, i) => (todas ? l.replace(prefixo, '$1') : `${numerada ? `${i + 1}. ` : '- '}${l.replace(prefixo, '$1')}`));
    setConteudo(conteudo.slice(0, ini) + novas.join('\n') + conteudo.slice(fim));
    requestAnimationFrame(() => el.focus());
  };
  const adicionarTag = (texto = tagDigitada) => {
    setTags((atuais) => limparTags([...atuais, ...texto.split(',')]));
    setTagDigitada('');
  };

  const salvar = async () => {
    const t = titulo.trim();
    if (t.length < 2) return setErro('Informe o título (mínimo 2 caracteres).');
    if (!conteudo.trim()) return setErro('Escreva o conteúdo da anotação.');
    setSalvando(true); setErro(null);
    const todas = limparTags([...tags, ...tagDigitada.split(',')]);
    const { data, error } = await createClient().rpc('salvar_anotacao', { p_id: anotacao?.id ?? null, p_id_empresa: idEmpresa, p_titulo: t, p_conteudo: conteudo, p_categoria: cat, p_tags: todas });
    setSalvando(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar a anotação.'));
    aoSalvar((data as string) ?? anotacao?.id ?? '', anotacao ? 'Anotação atualizada.' : 'Anotação criada.');
  };

  return (
    <Modal aberto aoFechar={aoFechar} tamanho="lg" titulo={anotacao ? 'Editar anotação' : 'Nova anotação'}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando...' : 'Salvar anotação'}</button></>}>
      <div className="space-y-4">
        {erro && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div><label htmlFor="an-titulo" className={rotulo}>Título</label><input id="an-titulo" maxLength={LIMITE_TITULO} value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} /></div>
          <div><label htmlFor="an-categoria" className={rotulo}>Categoria</label>
            <select id="an-categoria" value={cat} onChange={(e) => setCat(e.target.value as CategoriaAnotacao)} className={campo}>{CATEGORIAS_ANOTACAO.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}</select></div>
        </div>
        {cat === 'pessoal' && <p className="text-xs text-gray-500 -mt-2">Anotações pessoais só você vê. As demais ficam visíveis para a equipe da empresa.</p>}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label htmlFor="an-conteudo" className="block text-sm font-semibold text-gray-900">Conteúdo</label>
            <div className="flex gap-1.5" role="group" aria-label="Formatação">
              <button type="button" onClick={() => lista(false)} className="min-h-9 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50">Lista</button>
              <button type="button" onClick={() => lista(true)} className="min-h-9 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50">Lista numerada</button>
            </div>
          </div>
          <textarea id="an-conteudo" ref={area} rows={10} maxLength={LIMITE_CONTEUDO} value={conteudo} onChange={(e) => setConteudo(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-orange-500 resize-y" />
          <p className="text-right text-xs text-gray-400">{conteudo.length.toLocaleString('pt-BR')}/{LIMITE_CONTEUDO.toLocaleString('pt-BR')}</p>
        </div>
        <div>
          <label htmlFor="an-tag" className={rotulo}>Tags <span className="font-normal text-gray-500">(opcional — Enter ou vírgula para adicionar)</span></label>
          <div className="flex flex-wrap gap-2 mb-2" aria-label="Tags escolhidas">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white pl-3 pr-1 py-1 text-xs font-medium text-gray-700">
                {t}<button type="button" aria-label={`Remover a tag ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))} className="w-5 h-5 inline-flex items-center justify-center rounded-full hover:bg-gray-100"><X className="w-3 h-3" aria-hidden="true" /></button>
              </span>
            ))}
          </div>
          <input id="an-tag" maxLength={LIMITE_TAG} disabled={tags.length >= LIMITE_TAGS} value={tagDigitada} onChange={(e) => (e.target.value.includes(',') ? adicionarTag(e.target.value) : setTagDigitada(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarTag(); } }} onBlur={() => tagDigitada.trim() && adicionarTag()} className={campo} />
        </div>
      </div>
    </Modal>
  );
}

function ModalExcluir({ a, aoFechar, aoConcluir }: { a: Anotacao; aoFechar: () => void; aoConcluir: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const confirmar = async () => {
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('excluir_anotacao', { p_id: a.id });
    if (error) { setOcupado(false); return setErro(mensagemDeErro(error, 'Não foi possível excluir a anotação.')); }
    aoConcluir();
  };
  return (
    <Modal aberto aoFechar={() => { if (!ocupado) aoFechar(); }} titulo="Excluir anotação" descricao={a.titulo}
      rodape={<><button type="button" className={classeBotaoSecundario} disabled={ocupado} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPerigo} disabled={ocupado} onClick={confirmar}>{ocupado ? 'Excluindo...' : 'Excluir anotação'}</button></>}>
      <p className="text-sm text-gray-700">A anotação deixará de aparecer. Esta ação não pode ser desfeita pela tela.</p>
      {erro && <p role="alert" className="mt-3 text-sm text-red-700">{erro}</p>}
    </Modal>
  );
}
