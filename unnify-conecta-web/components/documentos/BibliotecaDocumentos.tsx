'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarRange, Download, Eye, FileText, FolderOpen, Pencil, Share2, Tag, Trash2, Upload, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import {
  CATEGORIAS_DOCUMENTO, ORIGENS_DOCUMENTO, formatarTamanho, rotuloTipo, tamanhoMaximoBytes, type CategoriaDocumento, type Documento,
} from '@/lib/documentos';
import { BarraFiltros, BotaoIcone, BotaoLimparFiltros, Celula, CampoBusca, EstadoTabela, FiltroSelect, Linha, Paginacao, Selo, Tabela } from '@/components/admin/tabela';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { abrirDocumento, enviarDocumento } from './acoes';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
const ACEITOS = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png';

const desde = (periodo: string) => {
  const dias = { '7': 7, '30': 30, '365': 365 }[periodo];
  return dias ? new Date(Date.now() - dias * 86400000).toISOString() : null;
};

interface Props {
  idEmpresa: string;
  papel: 'empresa' | 'contador';
  podeEnviar: boolean;
  idUsuario: string;
  versao: number;
  aoAlterar: (mensagem: string) => void;
  somenteCompartilhados?: boolean; // Meu Contador: o que o contador está vendo
}

// Biblioteca da empresa. Empresário: envia, renomeia, organiza, compartilha e exclui.
// Contador: vê só o que foi compartilhado (RLS) e envia se tiver a permissão "enviar_documentos".
export function BibliotecaDocumentos({ idEmpresa, papel, podeEnviar, idUsuario, versao, aoAlterar, somenteCompartilhados = false }: Props) {
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [categoria, setCategoria] = useState('');
  const [origem, setOrigem] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState<Documento | null>(null);
  const [excluindo, setExcluindo] = useState<Documento | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const empresario = papel === 'empresa';

  useEffect(() => {
    const t = setTimeout(() => { setBuscaAplicada(busca.trim()); setPagina(1); }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  // Nomes de quem enviou (equipe e contadores autorizados), sem expor perfis de terceiros
  useEffect(() => {
    createClient().rpc('responsaveis_obrigacoes', { p_id_empresa: idEmpresa }).then(({ data }) => {
      setNomes(Object.fromEntries(((data ?? []) as { id_usuario: string; nome: string }[]).map((r) => [r.id_usuario, r.nome])));
    });
  }, [idEmpresa]);

  useEffect(() => {
    let ativo = true;
    let q = createClient().from('documentos_empresa').select('*', { count: 'exact' }).eq('id_empresa', idEmpresa);
    if (somenteCompartilhados) q = q.eq('compartilhado_contador', true);
    if (categoria) q = q.eq('categoria', categoria);
    if (origem) q = q.eq('origem', origem);
    const inicio = desde(periodo);
    if (inicio) q = q.gte('enviado_em', inicio);
    if (buscaAplicada) q = q.ilike('nome', `%${buscaAplicada.replace(/[%_,()]/g, ' ')}%`);
    const de = (pagina - 1) * porPagina;
    setCarregando(true);
    q.order('enviado_em', { ascending: false }).range(de, de + porPagina - 1).then(({ data, count, error }) => {
      if (!ativo) return;
      setCarregando(false);
      if (error) return setErro(mensagemDeErro(error, 'Não foi possível carregar os documentos.'));
      setErro(null);
      setDocs((data ?? []) as Documento[]);
      setTotal(count ?? 0);
    });
    return () => { ativo = false; };
  }, [idEmpresa, categoria, origem, periodo, buscaAplicada, pagina, porPagina, versao, somenteCompartilhados]);

  const autor = (d: Documento) => (d.enviado_por === idUsuario ? 'Você' : (d.enviado_por && nomes[d.enviado_por]) || ORIGENS_DOCUMENTO[d.origem]);

  const abrir = async (d: Documento, baixar: boolean) => {
    try { await abrirDocumento(d, baixar); } catch (e) { aoAlterar(`Atenção: ${(e as Error).message}`); }
  };

  const excluir = async () => {
    if (!excluindo) return;
    setErroAcao(null);
    const supabase = createClient();
    const { data: caminho, error } = await supabase.rpc('excluir_documento', { p_id: excluindo.id });
    if (error) return setErroAcao(mensagemDeErro(error, 'Não foi possível excluir o documento.'));
    // Registro já excluído (com auditoria); agora o arquivo sai do Storage (a política só permite para documento excluído)
    const { error: erroArquivo } = await supabase.storage.from('documentos-empresas').remove([caminho as string]);
    setExcluindo(null);
    aoAlterar(erroArquivo ? 'Documento excluído. Atenção: o arquivo será removido do armazenamento depois.' : 'Documento excluído.');
  };

  const filtros = busca || categoria || origem || periodo;

  return (
    <section aria-label="Biblioteca de documentos" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 space-y-4 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900">{empresario && !somenteCompartilhados ? 'Documentos da empresa' : 'Documentos compartilhados'}</h2>
          <p className="text-xs text-gray-500">
            {!empresario ? 'Você vê apenas os documentos que a empresa compartilhou.'
              : somenteCompartilhados ? 'É o que o seu contador vê. Para deixar de compartilhar, use “Editar”.'
              : 'Só você decide o que o contador vê: use “Compartilhar com o contador”.'}
          </p>
        </div>
        {podeEnviar && (
          <button type="button" onClick={() => setEnviando(true)} className={classeBotaoPrimario}>
            <Upload className="w-4 h-4" aria-hidden="true" />Enviar documento
          </button>
        )}
      </div>
      <BarraFiltros>
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar pelo nome do documento" />
        <FiltroSelect icone={Tag} valor={categoria} aoMudar={(v) => { setCategoria(v); setPagina(1); }}>
          <option value="">Todas as categorias</option>
          {Object.entries(CATEGORIAS_DOCUMENTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </FiltroSelect>
        <FiltroSelect icone={UserRound} valor={origem} aoMudar={(v) => { setOrigem(v); setPagina(1); }}>
          <option value="">Qualquer origem</option>
          {Object.entries(ORIGENS_DOCUMENTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </FiltroSelect>
        <FiltroSelect icone={CalendarRange} valor={periodo} aoMudar={(v) => { setPeriodo(v); setPagina(1); }}>
          <option value="">Qualquer data</option>
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="365">Últimos 12 meses</option>
        </FiltroSelect>
        {filtros && <BotaoLimparFiltros aoClicar={() => { setBusca(''); setCategoria(''); setOrigem(''); setPeriodo(''); setPagina(1); }} />}
      </BarraFiltros>

      {erro ? (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{erro}</div>
      ) : carregando ? (
        <EstadoTabela carregando mensagemVazio="">{null}</EstadoTabela>
      ) : docs.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
          <p className="font-semibold text-gray-900">
            {filtros ? 'Nenhum documento encontrado com esses filtros.' : empresario ? 'Nenhum documento ainda.' : 'A empresa ainda não compartilhou documentos.'}
          </p>
          {!filtros && empresario && <p className="text-sm text-gray-600 mt-1">Envie contratos, documentos societários, fiscais e comprovantes (PDF, JPG ou PNG).</p>}
        </div>
      ) : (
        <Tabela colunas={[{ titulo: 'Documento' }, { titulo: 'Categoria' }, { titulo: 'Enviado por' }, { titulo: 'Data' }, { titulo: 'Tamanho' }, { titulo: 'Ações', alinhar: 'centro' }]}>
          {docs.map((d) => (
            <Linha key={d.id}>
              <Celula>
                <div className="flex items-center gap-3 min-w-0" data-testid={`documento-${d.nome}`}>
                  <span className="w-10 h-10 shrink-0 rounded-lg bg-orange-50 text-orange-600 inline-flex items-center justify-center"><FileText className="w-5 h-5" aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 break-words">{d.nome}</p>
                    <p className="text-xs text-gray-500 flex flex-wrap items-center gap-1.5">
                      {rotuloTipo(d.tipo_mime)}
                      {empresario && d.compartilhado_contador && <span className="inline-flex items-center gap-1 text-blue-700"><Share2 className="w-3 h-3" aria-hidden="true" />Compartilhado com o contador</span>}
                      {d.id_solicitacao && <span className="text-purple-700">Resposta a solicitação</span>}
                    </p>
                  </div>
                </div>
              </Celula>
              <Celula><Selo tipo="neutro" texto={CATEGORIAS_DOCUMENTO[d.categoria]} /></Celula>
              <Celula>{autor(d)}</Celula>
              <Celula><span className="whitespace-nowrap">{new Date(d.enviado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span></Celula>
              <Celula>{formatarTamanho(d.tamanho)}</Celula>
              <Celula>
                <div className="flex items-center justify-end min-[85rem]:justify-center gap-2 min-[85rem]:gap-1.5">
                  <BotaoIcone icone={Eye} titulo={`Visualizar ${d.nome}`} aoClicar={() => abrir(d, false)} />
                  <BotaoIcone icone={Download} titulo={`Baixar ${d.nome}`} aoClicar={() => abrir(d, true)} />
                  {empresario && <BotaoIcone icone={Pencil} titulo={`Editar ${d.nome}`} aoClicar={() => { setErroAcao(null); setEditando(d); }} />}
                  {empresario && <BotaoIcone icone={Trash2} titulo={`Excluir ${d.nome}`} aoClicar={() => { setErroAcao(null); setExcluindo(d); }} />}
                </div>
              </Celula>
            </Linha>
          ))}
        </Tabela>
      )}
      {!erro && !carregando && total > 0 && <Paginacao pagina={pagina} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={setPorPagina} total={total} />}

      <FormEnvio aberto={enviando} idEmpresa={idEmpresa} empresario={empresario} aoFechar={() => setEnviando(false)}
        aoEnviar={(m) => { setEnviando(false); aoAlterar(m); }} />
      <FormEdicao documento={editando} aoFechar={() => setEditando(null)} aoSalvar={(m) => { setEditando(null); aoAlterar(m); }} />
      <Modal aberto={!!excluindo} aoFechar={() => setExcluindo(null)} titulo="Excluir documento"
        descricao={excluindo ? `“${excluindo.nome}” sai da biblioteca e o arquivo é apagado. A exclusão fica registrada no histórico.` : undefined}
        rodape={<>
          <button type="button" className={classeBotaoSecundario} onClick={() => setExcluindo(null)}>Voltar</button>
          <button type="button" className={classeBotaoPerigo} onClick={excluir}>Excluir</button>
        </>}>
        <p className="text-sm text-gray-700">Esta ação não pode ser desfeita.</p>
        {erroAcao && <p role="alert" className="text-sm text-red-700 mt-2">{erroAcao}</p>}
      </Modal>
    </section>
  );
}

// Envio (também usado para responder solicitações): devolve o id do documento criado
export function FormEnvio({ aberto, idEmpresa, empresario, aoFechar, aoEnviar, titulo = 'Enviar documento', categoriaInicial = 'outros', nomeInicial = '', esconderCompartilhar = false }: {
  aberto: boolean; idEmpresa: string; empresario: boolean; aoFechar: () => void; aoEnviar: (mensagem: string, id: string) => void;
  titulo?: string; categoriaInicial?: CategoriaDocumento; nomeInicial?: string; esconderCompartilhar?: boolean;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<string>('outros');
  const [compartilhar, setCompartilhar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Nome sugerido a partir do arquivo acompanha a troca de arquivo até o usuário digitar o próprio
  const [nomeDigitado, setNomeDigitado] = useState(false);
  const travado = useRef(false);
  const limite = tamanhoMaximoBytes();

  useEffect(() => {
    if (!aberto) return;
    setArquivo(null); setNome(nomeInicial); setNomeDigitado(!!nomeInicial); setCategoria(categoriaInicial); setCompartilhar(false); setErro(null);
  }, [aberto, nomeInicial, categoriaInicial]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (travado.current) return;
    if (!arquivo) return setErro('Escolha o arquivo.');
    if (!/\.(pdf|jpe?g|png)$/i.test(arquivo.name)) return setErro('Envie PDF, JPG, JPEG ou PNG.');
    if (arquivo.size > limite) return setErro(`O arquivo deve ter até ${Math.round(limite / 1024 / 1024)} MB.`);
    travado.current = true;
    setSalvando(true);
    setErro(null);
    try {
      const id = await enviarDocumento({ arquivo, idEmpresa, nome: nome.trim(), categoria, compartilhar: empresario && compartilhar });
      aoEnviar('Documento enviado.', id);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      travado.current = false;
      setSalvando(false);
    }
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={titulo}
      rodape={<>
        <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="submit" form="form-envio-documento" disabled={salvando} className={classeBotaoPrimario}>{salvando ? 'Enviando...' : 'Enviar'}</button>
      </>}>
      <form id="form-envio-documento" onSubmit={enviar} noValidate className="space-y-4">
        <div>
          <label htmlFor="doc-arquivo" className={rotulo}>Arquivo</label>
          <input id="doc-arquivo" type="file" accept={ACEITOS} onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setArquivo(f);
            setErro(null);
            if (f && !nomeDigitado) setNome(f.name.replace(/\.[^.]+$/, '').slice(0, 150));
          }} className="block w-full text-sm text-gray-700 file:mr-3 file:min-h-11 file:px-4 file:rounded-lg file:border-0 file:bg-orange-50 file:text-orange-700 file:font-semibold" />
          <p className="text-xs text-gray-500 mt-1">PDF, JPG ou PNG, até {Math.round(limite / 1024 / 1024)} MB.</p>
        </div>
        <div>
          <label htmlFor="doc-nome" className={rotulo}>Nome do documento</label>
          <input id="doc-nome" maxLength={150} value={nome} onChange={(e) => { setNome(e.target.value); setNomeDigitado(e.target.value.trim() !== ''); }} className={campo} />
        </div>
        <div>
          <label htmlFor="doc-categoria" className={rotulo}>Categoria</label>
          <select id="doc-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campo}>
            {Object.entries(CATEGORIAS_DOCUMENTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </div>
        {empresario && !esconderCompartilhar && (
          <label className="flex items-center gap-2 min-h-11 text-sm text-gray-800 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-orange-600" checked={compartilhar} onChange={(e) => setCompartilhar(e.target.checked)} />
            Compartilhar com o contador
          </label>
        )}
        {!empresario && <p className="text-xs text-gray-500">Documentos enviados pelo contador ficam visíveis para a empresa e para o escritório.</p>}
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      </form>
    </Modal>
  );
}

function FormEdicao({ documento, aoFechar, aoSalvar }: { documento: Documento | null; aoFechar: () => void; aoSalvar: (m: string) => void }) {
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<string>('outros');
  const [compartilhar, setCompartilhar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!documento) return;
    setNome(documento.nome); setCategoria(documento.categoria); setCompartilhar(documento.compartilhado_contador); setErro(null);
  }, [documento]);

  const salvar = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!documento) return;
    if (!nome.trim()) return setErro('Informe o nome.');
    setSalvando(true);
    const { error } = await createClient().rpc('atualizar_documento', { p_id: documento.id, p_nome: nome.trim(), p_categoria: categoria, p_compartilhar: compartilhar });
    setSalvando(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar.'));
    aoSalvar('Documento atualizado.');
  }, [documento, nome, categoria, compartilhar, aoSalvar]);

  return (
    <Modal aberto={!!documento} aoFechar={aoFechar} titulo="Editar documento"
      rodape={<>
        <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="submit" form="form-edicao-documento" disabled={salvando} className={classeBotaoPrimario}>Salvar</button>
      </>}>
      <form id="form-edicao-documento" onSubmit={salvar} noValidate className="space-y-4">
        <div>
          <label htmlFor="doc-edit-nome" className={rotulo}>Nome do documento</label>
          <input id="doc-edit-nome" maxLength={150} value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
        </div>
        <div>
          <label htmlFor="doc-edit-categoria" className={rotulo}>Categoria</label>
          <select id="doc-edit-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campo}>
            {Object.entries(CATEGORIAS_DOCUMENTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 min-h-11 text-sm text-gray-800 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-orange-600" checked={compartilhar} onChange={(e) => setCompartilhar(e.target.checked)} />
          Compartilhar com o contador
        </label>
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      </form>
    </Modal>
  );
}
