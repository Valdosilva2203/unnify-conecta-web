'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Cloud, Download, FilePen, FileText, Folder, FolderOpen, FolderPlus, Pencil, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, Trash2, Upload, Files } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';
import { useAcessoAdminConfirmado } from '@/components/admin/GuardaAdmin';
import { Paginacao, Selo } from '@/components/admin/tabela';
import { Indicador } from '@/components/financeiro/Indicador';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData } from '@/lib/financeiro';
import { recursoAusente } from '@/lib/erros-banco';
import {
  ACEITOS, FORMATOS, TAMANHO_MAXIMO_DOCUMENTO, enviarDocumento, extensaoDe, formatarBytes, limparNome, nomeSemExtensao, nomeValido, tipoRealConfere,
  type DocumentoAdmin, type PastaAdmin, type VersaoAdmin,
} from '@/lib/documentos-admin';
import { EditorPdf } from '@/components/documentos-admin/EditorPdf';

type Lista = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string; ausente: boolean } | { tipo: 'ok'; linhas: DocumentoAdmin[]; total: number };
interface Resumo { documentos: number; novos_mes: number; lixeira: number; pastas: number; bytes: number; versoes: number; ultima_atualizacao: string | null }
const filtro = 'min-h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500';
const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function DocumentosAdminPage() {
  const confirmado = useAcessoAdminConfirmado();
  return <AdminLayout>{confirmado && <Documentos />}</AdminLayout>;
}

function Documentos() {
  const [master, setMaster] = useState<boolean | null>(null);
  const [resumo, setResumo] = useState<Resumo | null | 'erro'>(null);
  const [pastas, setPastas] = useState<PastaAdmin[]>([]);
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [pasta, setPasta] = useState<string>(''); // '' = todos; 'lixeira'
  const [lista, setLista] = useState<Lista>({ tipo: 'carregando' });
  const [busca, setBusca] = useState('');
  const [formato, setFormato] = useState('');
  const [ordem, setOrdem] = useState('recentes');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [modal, setModal] = useState<null | { tipo: 'pasta'; pasta: PastaAdmin | null } | { tipo: 'upload' } | { tipo: 'editar'; doc: DocumentoAdmin } | { tipo: 'excluir'; doc: DocumentoAdmin } | { tipo: 'versao'; doc: DocumentoAdmin } | { tipo: 'excluir_pasta'; pasta: PastaAdmin }>(null);
  const [editor, setEditor] = useState<{ doc: DocumentoAdmin; versao: VersaoAdmin; bytes: ArrayBuffer } | null>(null);
  const [versao, setVersao] = useState(0);
  const req = useRef(0);

  useEffect(() => { createClient().rpc('admin_master_ativo').then(({ data }) => setMaster(data === true)); }, []);
  const carregar = useCallback(() => {
    if (!master) return;
    const atual = ++req.current;
    setLista((l) => (l.tipo === 'ok' ? l : { tipo: 'carregando' }));
    createClient().rpc('buscar_documentos_admin', { p_id_pasta: pasta && pasta !== 'lixeira' ? pasta : null, p_busca: busca.trim() || null, p_extensao: formato || null, p_ordem: ordem,
      p_lixeira: pasta === 'lixeira', p_limite: porPagina, p_deslocamento: (pagina - 1) * porPagina })
      .then(({ data, error }) => {
        if (atual !== req.current) return;
        if (error) return setLista({ tipo: 'erro', mensagem: mensagemDeErro(error, 'Não foi possível carregar os documentos.'), ausente: recursoAusente(error) });
        const linhas = (data ?? []) as DocumentoAdmin[];
        setLista({ tipo: 'ok', linhas, total: Number(linhas[0]?.total ?? 0) });
        setSelecionado((s) => (s && linhas.some((l) => l.id === s) ? s : linhas[0]?.id ?? null));
      });
  }, [master, pasta, busca, formato, ordem, pagina, porPagina]);
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [carregar, versao]);
  useEffect(() => {
    if (!master) return;
    const supabase = createClient();
    supabase.rpc('resumo_documentos_admin').then(({ data, error }) => setResumo(error ? 'erro' : (data as Resumo)));
    supabase.from('pastas_documentos_admin').select('id, nome').order('nome').then(({ data }) => setPastas((data ?? []) as PastaAdmin[]));
    supabase.from('documentos_admin').select('id_pasta').is('excluido_em', null).limit(5000)
      .then(({ data }) => setContagem((data ?? []).reduce((acc: Record<string, number>, d) => { const k = (d.id_pasta as string) ?? 'sem'; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})));
  }, [master, versao]);

  if (master === null) return <div role="status" aria-label="Carregando" className="h-64 rounded-2xl bg-white animate-pulse" />;
  if (!master) return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 flex gap-3"><ShieldAlert className="w-6 h-6 shrink-0" aria-hidden="true" />Documentos administrativos: acesso exclusivo do Admin Master.</div>;

  const alterado = (texto: string, id?: string) => { setAviso({ tipo: 'ok', texto }); setModal(null); if (id) setSelecionado(id); setVersao((v) => v + 1); };
  const r = resumo && resumo !== 'erro' ? resumo : null;
  const card = (v: string | undefined) => (r ? v ?? '—' : resumo === 'erro' ? 'Indisponível' : '…');
  const linhas = lista.tipo === 'ok' ? lista.linhas : [];
  const docSel = linhas.find((l) => l.id === selecionado) ?? null;
  const totalPastas = Object.values(contagem).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-orange-100 text-orange-600 inline-flex items-center justify-center"><FileText className="w-7 h-7" aria-hidden="true" /></span>
          <div className="min-w-0"><h1 className="text-2xl sm:text-3xl font-black text-gray-900">Documentos</h1>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">Armazene, organize e edite documentos importantes do Unnify Conecta.</p></div>
        </div>
        <div className="flex flex-col min-[420px]:flex-row gap-2">
          <button type="button" className={classeBotaoSecundario} onClick={() => setModal({ tipo: 'pasta', pasta: null })}><FolderPlus className="w-4 h-4" aria-hidden="true" />Nova pasta</button>
          <button type="button" className={classeBotaoPrimario} onClick={() => setModal({ tipo: 'upload' })}><Upload className="w-4 h-4" aria-hidden="true" />Upload de documento</button>
        </div>
      </div>
      {aviso && <div role={aviso.tipo === 'ok' ? 'status' : 'alert'} className={`rounded-xl border px-4 py-3 text-sm flex justify-between gap-3 ${aviso.tipo === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}><span>{aviso.texto}</span><button type="button" className="underline" onClick={() => setAviso(null)}>Fechar</button></div>}
      {lista.tipo === 'erro' && (lista.ausente
        ? <p role="status" data-testid="documentos-indisponivel" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{lista.mensagem}</p>
        : <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-wrap justify-between gap-3">{lista.mensagem}
            <button type="button" onClick={() => setVersao((v) => v + 1)} className="min-h-11 px-3 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button></div>)}

      <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Total de documentos" valor={card(r ? String(r.documentos) : undefined)} icone={Files} cor="bg-green-100 text-green-600" detalhe={r ? `${r.novos_mes} novos este mês · ${r.lixeira} na lixeira` : undefined} />
        <Indicador titulo="Pastas" valor={card(r ? String(r.pastas) : undefined)} icone={Folder} cor="bg-orange-100 text-orange-600" detalhe="Organizadas" />
        <Indicador titulo="Armazenamento usado" valor={card(r ? formatarBytes(Number(r.bytes)) : undefined)} icone={Cloud} cor="bg-blue-100 text-blue-600" detalhe={r ? `${r.versoes} versões (originais preservados)` : undefined} />
        <Indicador titulo="Última atualização" valor={card(r ? (r.ultima_atualizacao ? formatarData(r.ultima_atualizacao.slice(0, 10)) : '—') : undefined)} icone={Clock} cor="bg-purple-100 text-purple-600" detalhe={r?.ultima_atualizacao ? quando(r.ultima_atualizacao) : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] 2xl:grid-cols-[15rem_minmax(0,1fr)_24rem]">
        <nav aria-label="Pastas" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 self-start min-w-0">
          <div className="flex items-center justify-between mb-2"><h2 className="font-bold text-gray-900">Pastas</h2>
            <button type="button" aria-label="Nova pasta" onClick={() => setModal({ tipo: 'pasta', pasta: null })} className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-gray-100"><FolderPlus className="w-4 h-4" aria-hidden="true" /></button></div>
          <ul className="space-y-0.5 text-sm">
            {[{ id: '', nome: 'Todos os documentos', n: totalPastas }, ...pastas.map((p) => ({ ...p, n: contagem[p.id] ?? 0 })), { id: 'lixeira', nome: 'Lixeira', n: r?.lixeira ?? 0 }].map((p) => (
              <li key={p.id || 'todos'} className="group flex items-center">
                <button type="button" aria-current={pasta === p.id ? 'true' : undefined} onClick={() => { setPasta(p.id); setPagina(1); }}
                  className={`flex-1 min-w-0 min-h-11 px-2 rounded-lg flex items-center gap-2 text-left ${pasta === p.id ? 'bg-orange-50 text-orange-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}>
                  {p.id === 'lixeira' ? <Trash2 className="w-4 h-4 shrink-0" aria-hidden="true" /> : pasta === p.id ? <FolderOpen className="w-4 h-4 shrink-0" aria-hidden="true" /> : <Folder className="w-4 h-4 shrink-0" aria-hidden="true" />}
                  <span className="flex-1 truncate">{p.nome}</span><span className="text-xs text-gray-500">{p.n}</span></button>
                {p.id && p.id !== 'lixeira' && <>
                  <button type="button" aria-label={`Renomear pasta ${p.nome}`} onClick={() => setModal({ tipo: 'pasta', pasta: { id: p.id, nome: p.nome } })} className="w-9 h-11 inline-flex items-center justify-center text-gray-400 hover:text-gray-700"><Pencil className="w-3.5 h-3.5" aria-hidden="true" /></button>
                  {!p.n && <button type="button" aria-label={`Excluir pasta ${p.nome}`} onClick={() => setModal({ tipo: 'excluir_pasta', pasta: { id: p.id, nome: p.nome } })} className="w-9 h-11 inline-flex items-center justify-center text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></button>}
                </>}
              </li>
            ))}
          </ul>
        </nav>

        <section aria-label="Lista de documentos" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 min-w-0 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="search" aria-label="Buscar documentos" placeholder="Buscar por nome, pasta, tipo ou descrição da versão..." value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} className={`${filtro} flex-1 min-w-0`} />
            <select aria-label="Filtrar por formato" value={formato} onChange={(e) => { setFormato(e.target.value); setPagina(1); }} className={filtro}><option value="">Todos os formatos</option>{Object.keys(FORMATOS).filter((e) => e !== 'jpeg').map((e) => <option key={e} value={e}>{e.toUpperCase()}</option>)}</select>
            <select aria-label="Ordenar" value={ordem} onChange={(e) => setOrdem(e.target.value)} className={filtro}><option value="recentes">Mais recentes</option><option value="nome">Nome (A–Z)</option><option value="tamanho">Maiores</option></select>
          </div>
          {lista.tipo === 'carregando' && <div role="status" aria-label="Carregando documentos" className="h-56 rounded-xl bg-gray-50 animate-pulse" />}
          {lista.tipo === 'ok' && (linhas.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-semibold text-gray-900">{pasta === 'lixeira' ? 'A lixeira está vazia.' : busca || formato ? 'Nenhum documento com esses filtros.' : 'Nenhum documento nesta pasta.'}</p>
              {pasta !== 'lixeira' && !busca && !formato && <button type="button" className={`${classeBotaoPrimario} mt-4`} onClick={() => setModal({ tipo: 'upload' })}><Upload className="w-4 h-4" aria-hidden="true" />Enviar documento</button>}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-3 sm:mx-0">
                <table className="w-full text-sm min-w-[40rem]">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">{['Nome', 'Tipo', 'Tamanho', 'Versão', 'Atualizado'].map((h) => <th key={h} className="py-2 px-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {linhas.map((d) => (
                      <tr key={d.id} onClick={() => setSelecionado(d.id)} data-testid={`documento-${d.nome}`} className={`border-b border-gray-50 cursor-pointer ${selecionado === d.id ? 'bg-orange-50/60' : 'hover:bg-gray-50'}`}>
                        <td className="py-2.5 px-2"><button type="button" onClick={() => setSelecionado(d.id)} className="flex items-center gap-2 text-left">
                          <FileText className={`w-5 h-5 shrink-0 ${d.extensao === 'pdf' ? 'text-red-500' : ['xlsx', 'xls', 'csv', 'ods'].includes(d.extensao) ? 'text-green-600' : 'text-blue-500'}`} aria-hidden="true" />
                          <span className="min-w-[10rem]"><span className="block font-semibold text-gray-900 break-all">{d.nome}.{d.extensao}</span>{!pasta && d.pasta && <span className="block text-xs text-gray-500">{d.pasta}</span>}</span></button></td>
                        <td className="py-2.5 px-2">{d.extensao.toUpperCase()}{d.protegido && <ShieldCheck className="inline w-4 h-4 ml-1 text-red-600" aria-label="Protegido" />}</td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{formatarBytes(Number(d.tamanho_atual))}</td>
                        <td className="py-2.5 px-2">v{d.versao_atual}</td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{quando(d.atualizado_em)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacao pagina={pagina} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={(n) => { setPorPagina(n); setPagina(1); }} total={lista.total} />
            </>
          ))}
        </section>

        <PainelDocumento doc={docSel} versao={versao} aoAcao={(m) => setModal(m)} aoAviso={setAviso} aoAlterado={alterado}
          aoEditar={(doc, v, bytes) => setEditor({ doc, versao: v, bytes })} />
      </div>

      {modal?.tipo === 'pasta' && <ModalPasta pasta={modal.pasta} aoFechar={() => setModal(null)} aoSalvar={alterado} />}
      {modal?.tipo === 'excluir_pasta' && <ModalConfirmar titulo={`Excluir pasta "${modal.pasta.nome}"`} texto="A pasta está vazia e será removida. A ação fica registrada na auditoria." botao="Excluir pasta"
        aoFechar={() => setModal(null)} aoConfirmar={async () => { const { error } = await createClient().rpc('excluir_pasta_documentos_admin', { p_id: modal.pasta.id }); if (error) return mensagemDeErro(error, 'Não foi possível excluir a pasta.'); if (pasta === modal.pasta.id) setPasta(''); alterado('Pasta excluída.'); return null; }} />}
      {modal?.tipo === 'upload' && <ModalUpload pastas={pastas} pastaInicial={pasta && pasta !== 'lixeira' ? pasta : ''} aoFechar={() => setModal(null)} aoConcluir={alterado} />}
      {modal?.tipo === 'versao' && <ModalUpload pastas={pastas} pastaInicial="" doc={modal.doc} aoFechar={() => setModal(null)} aoConcluir={alterado} />}
      {modal?.tipo === 'editar' && <ModalEditar doc={modal.doc} pastas={pastas} aoFechar={() => setModal(null)} aoSalvar={alterado} />}
      {modal?.tipo === 'excluir' && <ModalConfirmar titulo={`Mover "${modal.doc.nome}" para a lixeira`} texto="O documento sai da lista, mas o arquivo original e todas as versões são preservados e podem ser restaurados." botao="Mover para a lixeira"
        aoFechar={() => setModal(null)} aoConfirmar={async () => { const { error } = await createClient().rpc('excluir_documento_admin', { p_id: modal.doc.id, p_restaurar: false }); if (error) return mensagemDeErro(error, 'Não foi possível excluir.'); alterado('Documento movido para a lixeira.'); return null; }} />}
      {editor && <EditorPdf nome={editor.doc.nome} versao={editor.versao.numero} bytes={editor.bytes} assinado={editor.doc.assinado || editor.doc.protegido} aoFechar={() => setEditor(null)}
        aoSalvar={async (pdf, observacao, confirmar) => {
          const res = await enviarDocumento(createClient(), new Blob([pdf as BlobPart], { type: 'application/pdf' }), 'pdf',
            { acao: 'versao', id_documento: editor.doc.id, versao_base: editor.doc.versao_atual, origem: 'edicao', observacao, confirmar_protegido: confirmar });
          if (!res.ok) return res.erro;
          setEditor(null); alterado(`Versão v${res.versao} salva. O original continua disponível no histórico de versões.`, editor.doc.id);
          return null;
        }} />}
    </div>
  );
}

function PainelDocumento({ doc, versao, aoAcao, aoAviso, aoAlterado, aoEditar }: {
  doc: DocumentoAdmin | null; versao: number; aoAcao: (m: { tipo: 'editar' | 'excluir' | 'versao'; doc: DocumentoAdmin }) => void;
  aoAviso: (a: { tipo: 'ok' | 'erro'; texto: string }) => void; aoAlterado: (m: string, id?: string) => void; aoEditar: (d: DocumentoAdmin, v: VersaoAdmin, b: ArrayBuffer) => void;
}) {
  const [versoes, setVersoes] = useState<VersaoAdmin[] | null>(null);
  const [previa, setPrevia] = useState<{ url: string; tipo: string } | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  useEffect(() => {
    setVersoes(null); setPrevia((p) => { if (p) URL.revokeObjectURL(p.url); return null; });
    if (!doc) return;
    createClient().from('versoes_documentos_admin').select('numero, caminho, tamanho, tipo_mime, sha256, origem, observacao, assinado, criado_em, criado_por').eq('id_documento', doc.id).order('numero', { ascending: false })
      .then(({ data }) => setVersoes((data ?? []) as VersaoAdmin[]));
  }, [doc, versao]);
  const caixa = 'bg-white rounded-2xl border border-gray-200 shadow-sm p-4 self-start min-w-0 lg:col-span-2 2xl:col-span-1';
  if (!doc) return <aside aria-label="Detalhes do documento" className={`${caixa} text-sm text-gray-500`}>Selecione um documento.</aside>;
  const atual = versoes?.find((v) => v.numero === doc.versao_atual) ?? null;
  const baixarBytes = async (v: VersaoAdmin) => {
    const { data, error } = await createClient().storage.from('documentos-admin').download(v.caminho);
    if (error || !data) { aoAviso({ tipo: 'erro', texto: 'Não foi possível baixar o arquivo.' }); return null; }
    return data;
  };
  const baixar = async (v: VersaoAdmin) => {
    const blob = await baixarBytes(v); if (!blob) return;
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `${doc.nome}${v.numero > 1 ? `-v${v.numero}` : ''}.${doc.extensao}`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    createClient().rpc('registrar_download_documento_admin', { p_id_documento: doc.id, p_versao: v.numero }).then(() => {}); // auditoria (consulta só é enviada com then)
  };
  const visualizar = async () => {
    if (!atual) return; setAbrindo(true);
    const blob = await baixarBytes(atual); setAbrindo(false); if (!blob) return;
    setPrevia({ url: URL.createObjectURL(new Blob([blob], { type: atual.tipo_mime })), tipo: atual.tipo_mime });
  };
  const editar = async () => {
    if (!atual) return; setAbrindo(true);
    const blob = await baixarBytes(atual); setAbrindo(false); if (!blob) return;
    aoEditar(doc, atual, await blob.arrayBuffer());
  };
  const restaurar = async () => {
    const { error } = await createClient().rpc('excluir_documento_admin', { p_id: doc.id, p_restaurar: true });
    if (error) return aoAviso({ tipo: 'erro', texto: mensagemDeErro(error, 'Não foi possível restaurar.') });
    aoAlterado('Documento restaurado.', doc.id);
  };
  const naLixeira = !!doc.excluido_em;
  const visualizavel = doc.extensao === 'pdf' || ['png', 'jpg', 'jpeg', 'webp'].includes(doc.extensao);
  return (
    <aside aria-label="Detalhes do documento" className={`${caixa} space-y-3`}>
      <div className="flex items-start gap-2"><FileText className="w-8 h-8 text-red-500 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1"><p className="font-bold text-gray-900 break-all">{doc.nome}.{doc.extensao}</p><p className="text-xs text-gray-500">{formatarBytes(Number(doc.tamanho_atual))} · v{doc.versao_atual} · {doc.pasta ?? 'Sem pasta'}</p></div></div>
      {(doc.assinado || doc.protegido) && <p className="text-xs rounded-lg border border-red-200 bg-red-50 text-red-800 p-2 flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
        {doc.assinado ? 'PDF com assinatura digital detectada.' : 'Marcado como protegido (fiscal/assinado).'} Qualquer edição gera nova versão e invalida a assinatura; exige confirmação.</p>}
      {naLixeira ? (
        <button type="button" onClick={restaurar} className={`${classeBotaoPrimario} w-full`}><RotateCcw className="w-4 h-4" aria-hidden="true" />Restaurar da lixeira</button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {visualizavel && <button type="button" disabled={abrindo || !atual} onClick={visualizar} className={`${classeBotaoSecundario} !px-2`}><FolderOpen className="w-4 h-4" aria-hidden="true" />Visualizar</button>}
          {doc.extensao === 'pdf' && <button type="button" disabled={abrindo || !atual} onClick={editar} className={`${classeBotaoPrimario} !px-2`}><FilePen className="w-4 h-4" aria-hidden="true" />{abrindo ? 'Abrindo...' : 'Abrir editor'}</button>}
          <button type="button" disabled={!atual} onClick={() => atual && baixar(atual)} className={`${classeBotaoSecundario} !px-2`}><Download className="w-4 h-4" aria-hidden="true" />Baixar</button>
          <button type="button" onClick={() => aoAcao({ tipo: 'versao', doc })} className={`${classeBotaoSecundario} !px-2`}><Upload className="w-4 h-4" aria-hidden="true" />Nova versão</button>
          <button type="button" onClick={() => aoAcao({ tipo: 'editar', doc })} className={`${classeBotaoSecundario} !px-2`}><Pencil className="w-4 h-4" aria-hidden="true" />Renomear / mover</button>
          <button type="button" onClick={() => aoAcao({ tipo: 'excluir', doc })} className={`${classeBotaoSecundario} !px-2 !text-red-700`}><Trash2 className="w-4 h-4" aria-hidden="true" />Excluir</button>
        </div>
      )}
      {!visualizavel && !naLixeira && <p className="text-xs text-gray-500">Pré-visualização indisponível para {doc.extensao.toUpperCase()}: o arquivo fica armazenado e pode ser baixado.</p>}
      {previa && (
        <div className="rounded-lg border border-gray-200 overflow-hidden" data-testid="previa-documento">
          {previa.tipo === 'application/pdf' ? <iframe src={previa.url} title={`Visualização de ${doc.nome}`} className="w-full h-96" /> : <img src={previa.url} alt={doc.nome} className="w-full" />}
        </div>
      )}
      <div>
        <h2 className="text-sm font-bold text-gray-900 mb-1">Versões</h2>
        {versoes === null ? <div role="status" aria-label="Carregando versões" className="h-16 rounded-lg bg-gray-50 animate-pulse" /> : (
          <ul className="divide-y divide-gray-100 text-sm" data-testid="versoes">
            {versoes.map((v) => (
              <li key={v.numero} className="py-2 flex items-start gap-2">
                <span className="flex-1 min-w-0"><span className="block font-semibold text-gray-900">v{v.numero} {v.numero === doc.versao_atual ? '(atual)' : ''}{v.numero === 1 ? ' · original' : ''}</span>
                  <span className="block text-xs text-gray-500">{quando(v.criado_em)} · {formatarBytes(Number(v.tamanho))} · {v.origem === 'edicao' ? 'editada no navegador' : 'enviada'}{v.assinado ? ' · assinada' : ''}</span>
                  {v.observacao && <span className="block text-xs text-gray-700">{v.observacao}</span>}
                  <span className="block text-[10px] text-gray-400 break-all">SHA-256 {v.sha256.slice(0, 16)}…</span></span>
                <button type="button" onClick={() => baixar(v)} aria-label={`Baixar versão ${v.numero}`} className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"><Download className="w-4 h-4" aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function ModalPasta({ pasta, aoFechar, aoSalvar }: { pasta: PastaAdmin | null; aoFechar: () => void; aoSalvar: (m: string) => void }) {
  const [nome, setNome] = useState(pasta?.nome ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const salvar = async () => {
    if (nome.trim().length < 2) return setErro('Nome da pasta: mínimo 2 caracteres.');
    const { error } = await createClient().rpc('salvar_pasta_documentos_admin', { p_id: pasta?.id ?? null, p_nome: nome });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar a pasta.'));
    aoSalvar(pasta ? 'Pasta renomeada.' : 'Pasta criada.');
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={pasta ? 'Renomear pasta' : 'Nova pasta'}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button><button type="button" className={classeBotaoPrimario} onClick={salvar}>Salvar</button></>}>
      <div className="space-y-3">{erro && <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
        <div><label htmlFor="pasta-nome" className="block text-sm font-semibold text-gray-900 mb-1.5">Nome da pasta</label><input id="pasta-nome" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} className={campo} /></div></div>
    </Modal>
  );
}

function ModalUpload({ pastas, pastaInicial, doc, aoFechar, aoConcluir }: { pastas: PastaAdmin[]; pastaInicial: string; doc?: DocumentoAdmin; aoFechar: () => void; aoConcluir: (m: string, id?: string) => void }) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [pasta, setPasta] = useState(pastaInicial);
  const [observacao, setObservacao] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    if (arquivos.length === 0) return setErros(['Escolha ao menos um arquivo.']);
    if (doc && (doc.assinado || doc.protegido) && !confirmar) return setErros(['Confirme que a nova versão substitui um documento assinado/protegido.']);
    setEnviando(true); setErros([]);
    const falhas: string[] = []; let ultimo: string | undefined;
    for (const f of arquivos) {
      const ext = extensaoDe(f.name);
      if (!FORMATOS[ext]) { falhas.push(`${f.name}: formato não aceito.`); continue; }
      if (doc && ext !== doc.extensao) { falhas.push(`${f.name}: a nova versão deve ser ${doc.extensao.toUpperCase()}.`); continue; }
      if (f.size === 0 || f.size > TAMANHO_MAXIMO_DOCUMENTO) { falhas.push(`${f.name}: até 25 MB.`); continue; }
      if (!tipoRealConfere(ext, new Uint8Array(await f.slice(0, 8192).arrayBuffer()))) { falhas.push(`${f.name}: o conteúdo não confere com a extensão .${ext}.`); continue; }
      const nome = limparNome(nomeSemExtensao(f.name));
      if (!nomeValido(nome)) { falhas.push(`${f.name}: nome inválido.`); continue; }
      const res = await enviarDocumento(createClient(), f, ext, doc
        ? { acao: 'versao', id_documento: doc.id, versao_base: doc.versao_atual, origem: 'upload', observacao, confirmar_protegido: confirmar }
        : { acao: 'documento', nome, id_pasta: pasta || null });
      if (!res.ok) falhas.push(`${f.name}: ${res.erro}`); else ultimo = res.id;
    }
    setEnviando(false);
    if (falhas.length === 0) return aoConcluir(doc ? 'Nova versão enviada. A anterior continua no histórico.' : `${arquivos.length} documento(s) enviado(s).`, ultimo);
    setErros(falhas);
    if (ultimo) setArquivos([]);
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={doc ? `Nova versão — ${doc.nome}` : 'Upload de documento'}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button><button type="button" className={classeBotaoPrimario} disabled={enviando} onClick={enviar}>{enviando ? 'Enviando...' : 'Enviar'}</button></>}>
      <div className="space-y-3">
        {erros.length > 0 && <ul role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 list-disc pl-6">{erros.map((e) => <li key={e}>{e}</li>)}</ul>}
        <div><label htmlFor="upload-arquivos" className="block text-sm font-semibold text-gray-900 mb-1.5">Arquivo{doc ? '' : 's'}</label>
          <input id="upload-arquivos" type="file" multiple={!doc} accept={doc ? `.${doc.extensao}` : ACEITOS} onChange={(e) => setArquivos(Array.from(e.target.files ?? []))} className="block w-full text-sm file:mr-3 file:min-h-11 file:px-3 file:rounded-lg file:border-0 file:bg-gray-100 file:font-semibold" />
          <p className="text-xs text-gray-500 mt-1">PDF, Word, Excel, PowerPoint, ODT/ODS, TXT, CSV, ZIP e imagens · até 25 MB. O tipo real do arquivo é conferido no servidor.</p></div>
        {!doc && <div><label htmlFor="upload-pasta" className="block text-sm font-semibold text-gray-900 mb-1.5">Pasta</label>
          <select id="upload-pasta" value={pasta} onChange={(e) => setPasta(e.target.value)} className={campo}><option value="">Sem pasta</option>{pastas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>}
        {doc && <div><label htmlFor="upload-obs" className="block text-sm font-semibold text-gray-900 mb-1.5">Descrição da versão (opcional)</label><input id="upload-obs" maxLength={300} value={observacao} onChange={(e) => setObservacao(e.target.value)} className={campo} /></div>}
        {doc && (doc.assinado || doc.protegido) && <label className="flex items-start gap-2 text-sm rounded-lg border border-red-200 bg-red-50 p-2 text-red-900"><input type="checkbox" checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)} className="mt-1" />Documento assinado/protegido: confirmo a nova versão (o original continua preservado).</label>}
      </div>
    </Modal>
  );
}

function ModalEditar({ doc, pastas, aoFechar, aoSalvar }: { doc: DocumentoAdmin; pastas: PastaAdmin[]; aoFechar: () => void; aoSalvar: (m: string, id?: string) => void }) {
  const [nome, setNome] = useState(doc.nome);
  const [pasta, setPasta] = useState(doc.id_pasta ?? '');
  const [protegido, setProtegido] = useState(doc.protegido);
  const [erro, setErro] = useState<string | null>(null);
  const salvar = async () => {
    if (!nomeValido(nome)) return setErro('Nome inválido (sem \\ / < > : " | ? *).');
    const { error } = await createClient().rpc('atualizar_documento_admin', { p_id: doc.id, p_nome: nome, p_id_pasta: pasta || null, p_protegido: protegido });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar.'));
    aoSalvar('Documento atualizado.', doc.id);
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo="Renomear / mover documento"
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button><button type="button" className={classeBotaoPrimario} onClick={salvar}>Salvar</button></>}>
      <div className="space-y-3">{erro && <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
        <div><label htmlFor="doc-nome" className="block text-sm font-semibold text-gray-900 mb-1.5">Nome</label><input id="doc-nome" maxLength={200} value={nome} onChange={(e) => setNome(e.target.value)} className={campo} /></div>
        <div><label htmlFor="doc-pasta" className="block text-sm font-semibold text-gray-900 mb-1.5">Pasta</label>
          <select id="doc-pasta" value={pasta} onChange={(e) => setPasta(e.target.value)} className={campo}><option value="">Sem pasta</option>{pastas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={protegido} disabled={doc.assinado} onChange={(e) => setProtegido(e.target.checked)} className="mt-1" />
          <span>Documento protegido (fiscal ou assinado){doc.assinado ? ' — assinatura digital detectada: proteção obrigatória' : ''}. Edições exigem confirmação.</span></label>
      </div>
    </Modal>
  );
}

function ModalConfirmar({ titulo, texto, botao, aoFechar, aoConfirmar }: { titulo: string; texto: string; botao: string; aoFechar: () => void; aoConfirmar: () => Promise<string | null> }) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  return (
    <Modal aberto aoFechar={aoFechar} titulo={titulo}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPerigo} disabled={ocupado} onClick={async () => { setOcupado(true); const e = await aoConfirmar(); setOcupado(false); if (e) setErro(e); }}>{botao}</button></>}>
      <div className="space-y-3">{erro && <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}<p className="text-sm text-gray-700">{texto}</p></div>
    </Modal>
  );
}
