'use client';

import { useEffect, useRef, useState } from 'react';
import { Archive, CalendarClock, CheckCircle2, Download, Eye, FileBadge2, FileText, History, Pencil, Plus, RefreshCw, Save, ShieldCheck, ShieldX, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatarCnpj, mensagemDeErro } from '@/lib/contabil';
import { formatarData, hojeBrasil } from '@/lib/financeiro';
import { formatarTamanho } from '@/lib/documentos';
import { lerDocumentoPdf, type DadosCertidaoFederal, type ResultadoDocumentoPdf, type TipoCertidaoFederal } from '@/lib/leitura-pdf';
import {
  ACOES_CERTIDAO, RESULTADOS_CERTIDAO, SITUACOES_CERTIDAO, TIPOS_CERTIDAO, abrirPdfCertidao, descartarPdfCertidao, enviarPdfCertidao, situacaoPorValidade,
  validarPdfCertidao, type Certidao, type EventoCertidao, type ResumoCertidoes, type TipoCertidao, type VersaoCertidao,
} from '@/lib/certidoes';
import { BarraFiltros, BotaoIcone, BotaoLimparFiltros, Celula, CampoBusca, FiltroSelect, Linha, Selo, Tabela } from '@/components/admin/tabela';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { Indicador } from '@/components/financeiro/Indicador';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100 disabled:text-gray-600';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';

function prazo(c: Pick<Certidao, 'situacao' | 'dias_para_vencer'>): string | null {
  if (c.dias_para_vencer === null || c.situacao === 'sem_validade') return null;
  const d = c.dias_para_vencer;
  if (d < 0) return `Venceu há ${-d} ${d === -1 ? 'dia' : 'dias'}`;
  if (d === 0) return 'Vence hoje';
  return d === 1 ? 'Vence amanhã' : `Vence em ${d} dias`;
}

// Certidões da empresa, dentro de Documentos. Quem gerencia (dono/sócio ou contador com "gerenciar_certidoes") cadastra,
// atualiza e envia novas versões; quem só vê (contador com "ver_documentos") visualiza e baixa. O banco confere tudo.
export function ModuloCertidoes({ idEmpresa, cnpjEmpresa, podeGerenciar }: { idEmpresa: string; cnpjEmpresa?: string; podeGerenciar: boolean }) {
  const [hoje, setHoje] = useState<string | null>(null);
  const [lista, setLista] = useState<Certidao[] | null>(null);
  const [resumo, setResumo] = useState<ResumoCertidoes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [f, setF] = useState({ busca: '', situacao: '', tipo: '', ordem: 'validade' });
  const [busca, setBusca] = useState('');
  const [versao, setVersao] = useState(0);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [modal, setModal] = useState<null | { tipo: 'nova' } | { tipo: 'versao' | 'editar' | 'historico' | 'arquivar'; c: Certidao }>(null);

  useEffect(() => setHoje(hojeBrasil()), []); // data só no navegador
  useEffect(() => { const t = setTimeout(() => setBusca(f.busca.trim()), 300); return () => clearTimeout(t); }, [f.busca]);
  // Alertas de vencimento (idempotentes no banco): gera os que faltarem ao abrir a tela
  useEffect(() => { createClient().rpc('verificar_alertas_certidoes', { p_id_empresa: idEmpresa }).then(() => {}); }, [idEmpresa]);

  useEffect(() => {
    let ativo = true;
    const supabase = createClient();
    let q = supabase.from('certidoes_situacao').select('*').eq('id_empresa', idEmpresa).is('arquivada_em', null);
    if (f.situacao) q = q.eq('situacao', f.situacao);
    if (f.tipo) q = q.eq('tipo', f.tipo);
    if (busca) { const b = busca.replace(/[%_,()]/g, ' '); q = q.or(`nome.ilike.%${b}%,orgao_emissor.ilike.%${b}%,codigo_controle.ilike.%${b}%`); }
    q = f.ordem === 'validade' ? q.order('data_validade', { ascending: true, nullsFirst: false }) : q.order('atualizado_em', { ascending: false });
    Promise.all([q.limit(200), supabase.rpc('resumo_certidoes', { p_id_empresa: idEmpresa })]).then(([l, r]) => {
      if (!ativo) return;
      if (l.error) { setErro(mensagemDeErro(l.error, 'Não foi possível carregar as certidões.')); setLista([]); return; }
      setErro(null);
      setLista((l.data ?? []) as Certidao[]);
      setResumo(r.error ? null : (r.data as ResumoCertidoes));
    });
    return () => { ativo = false; };
  }, [idEmpresa, f.situacao, f.tipo, f.ordem, busca, versao]);

  const alterado = (texto: string) => { setModal(null); setAviso({ tipo: texto.startsWith('Atenção') ? 'erro' : 'ok', texto }); setVersao((v) => v + 1); };
  const abrir = async (c: { caminho: string | null; nome_arquivo?: string | null; nome: string }, baixar: boolean) => {
    if (!c.caminho) return;
    const e = await abrirPdfCertidao(c.caminho, c.nome, baixar);
    if (e) setAviso({ tipo: 'erro', texto: e });
  };
  const filtros = f.busca || f.situacao || f.tipo;

  return (
    <div className="space-y-5 min-w-0" data-testid="modulo-certidoes">
      {aviso && (
        <div role={aviso.tipo === 'erro' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm flex items-start justify-between gap-3 ${aviso.tipo === 'erro' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
          <span>{aviso.texto}</span><button type="button" onClick={() => setAviso(null)} className="text-xs font-semibold underline shrink-0">Fechar</button>
        </div>
      )}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[360px]:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Total" valor={String(resumo?.total ?? 0)} icone={FileBadge2} cor="bg-orange-100 text-orange-600" detalhe="Certidões cadastradas" />
        <Indicador titulo="Válidas" valor={String(resumo?.validas ?? 0)} icone={ShieldCheck} cor="bg-green-100 text-green-600" />
        <Indicador titulo="Vencem em 30 dias" valor={String(resumo?.vencendo ?? 0)} icone={CalendarClock} cor="bg-amber-100 text-amber-600" />
        <Indicador titulo="Vencidas" valor={String(resumo?.vencidas ?? 0)} icone={ShieldX} cor="bg-red-100 text-red-600" destaque={resumo?.vencidas ? 'text-red-700' : undefined} />
      </div>

      <section aria-label="Lista de certidões" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-gray-500">Certidões negativas e de regularidade da empresa, com validade e histórico de versões. A leitura do PDF não substitui a consulta de autenticidade no órgão emissor.</p>
          {podeGerenciar && <button type="button" onClick={() => setModal({ tipo: 'nova' })} className={classeBotaoPrimario}><Plus className="w-4 h-4" aria-hidden="true" />Nova certidão</button>}
        </div>
        <BarraFiltros>
          <CampoBusca valor={f.busca} aoMudar={(v) => setF((x) => ({ ...x, busca: v }))} placeholder="Buscar certidão, órgão ou código" />
          <FiltroSelect valor={f.situacao} aoMudar={(v) => setF((x) => ({ ...x, situacao: v }))}>
            <option value="">Todas as situações</option>
            {Object.entries(SITUACOES_CERTIDAO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </FiltroSelect>
          <FiltroSelect valor={f.tipo} aoMudar={(v) => setF((x) => ({ ...x, tipo: v }))}>
            <option value="">Todos os tipos</option>
            {Object.entries(TIPOS_CERTIDAO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </FiltroSelect>
          <FiltroSelect valor={f.ordem} aoMudar={(v) => setF((x) => ({ ...x, ordem: v }))}>
            <option value="validade">Ordenar por validade</option>
            <option value="recentes">Atualizadas recentemente</option>
          </FiltroSelect>
          {filtros && <BotaoLimparFiltros aoClicar={() => setF((x) => ({ ...x, busca: '', situacao: '', tipo: '' }))} />}
        </BarraFiltros>

        {erro ? <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{erro}</div>
          : lista === null ? <div role="status" aria-label="Carregando" className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-gray-50 animate-pulse" />)}</div>
          : lista.length === 0 ? (
            <div className="text-center py-12">
              <FileBadge2 className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
              <p className="font-semibold text-gray-900">{filtros ? 'Nenhuma certidão com esses filtros.' : 'Nenhuma certidão cadastrada.'}</p>
              {!filtros && podeGerenciar && <p className="text-sm text-gray-500 mt-1">Envie o PDF: os dados da Certidão Federal são lidos automaticamente para você conferir.</p>}
            </div>
          ) : (
            <Tabela colunas={[{ titulo: 'Certidão' }, { titulo: 'Emissão' }, { titulo: 'Validade' }, { titulo: 'Situação' }, { titulo: 'Ações', alinhar: 'centro' }]}>
              {lista.map((c) => (
                <Linha key={c.id}>
                  <Celula>
                    <div className="min-w-0" data-testid={`certidao-${c.nome}`}>
                      <p className="text-sm font-bold text-gray-900 break-words">{c.nome}</p>
                      <p className="text-xs text-gray-500 break-words">{c.orgao_emissor}{c.resultado ? ` · ${RESULTADOS_CERTIDAO[c.resultado]}` : ''}</p>
                      <p className="text-xs text-gray-500">{c.codigo_controle ? `Código ${c.codigo_controle} · ` : ''}Versão {c.versao_atual}</p>
                    </div>
                  </Celula>
                  <Celula><span className="whitespace-nowrap">{formatarData(c.data_emissao)}</span></Celula>
                  <Celula>
                    <span className="whitespace-nowrap">{c.data_validade ? formatarData(c.data_validade) : '—'}</span>
                    {prazo(c) && <span className={`block text-xs ${c.situacao === 'vencida' ? 'text-red-700 font-semibold' : c.situacao === 'vencendo' ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>{prazo(c)}</span>}
                  </Celula>
                  <Celula><Selo tipo={SITUACOES_CERTIDAO[c.situacao].selo} texto={SITUACOES_CERTIDAO[c.situacao].rotulo} /></Celula>
                  <Celula>
                    <div className="flex items-center justify-end min-[85rem]:justify-center gap-2 min-[85rem]:gap-1.5 flex-wrap">
                      <BotaoIcone icone={Eye} titulo={`Visualizar ${c.nome}`} aoClicar={() => abrir(c, false)} />
                      <BotaoIcone icone={Download} titulo={`Baixar ${c.nome}`} aoClicar={() => abrir(c, true)} />
                      <BotaoIcone icone={History} titulo={`Versões e histórico de ${c.nome}`} aoClicar={() => setModal({ tipo: 'historico', c })} />
                      {podeGerenciar && <BotaoIcone icone={Upload} titulo={`Enviar nova versão de ${c.nome}`} aoClicar={() => setModal({ tipo: 'versao', c })} />}
                      {podeGerenciar && <BotaoIcone icone={Pencil} titulo={`Editar ${c.nome}`} aoClicar={() => setModal({ tipo: 'editar', c })} />}
                      {podeGerenciar && <BotaoIcone icone={Archive} titulo={`Arquivar ${c.nome}`} aoClicar={() => setModal({ tipo: 'arquivar', c })} />}
                    </div>
                  </Celula>
                </Linha>
              ))}
            </Tabela>
          )}
      </section>

      {hoje && (modal?.tipo === 'nova' || modal?.tipo === 'versao' || modal?.tipo === 'editar') && (
        <ModalCertidao modo={modal.tipo} certidao={modal.tipo === 'nova' ? null : modal.c} idEmpresa={idEmpresa} cnpjEmpresa={cnpjEmpresa} hoje={hoje}
          aoFechar={() => setModal(null)} aoSalvar={alterado} />
      )}
      {modal?.tipo === 'historico' && <ModalHistorico certidao={modal.c} aoFechar={() => setModal(null)} aoErro={(t) => setAviso({ tipo: 'erro', texto: t })} />}
      {modal?.tipo === 'arquivar' && <ModalArquivar certidao={modal.c} aoFechar={() => setModal(null)} aoConcluir={alterado} />}
    </div>
  );
}

type Form = { tipo: TipoCertidao | ''; nome: string; orgao: string; resultado: TipoCertidaoFederal | ''; emissao: string; validade: string; codigo: string; observacoes: string };
type Leitura = { estado: 'lendo' } | { estado: 'fim'; r: ResultadoDocumentoPdf; preenchidos: (keyof Form)[]; cnpj?: string; razao?: string; bloqueio: string | null };
const ROTULOS: Partial<Record<keyof Form, string>> = { tipo: 'Tipo', orgao: 'Órgão emissor', resultado: 'Resultado', emissao: 'Data de emissão', validade: 'Data de validade', codigo: 'Código de controle' };

function camposDaCertidao(d: DadosCertidaoFederal): Partial<Form> {
  const c: Partial<Form> = { tipo: 'federal', nome: TIPOS_CERTIDAO.federal.rotulo };
  if (d.orgaoEmissor) c.orgao = d.orgaoEmissor;
  if (d.tipoCertidao) c.resultado = d.tipoCertidao;
  if (d.emissao) c.emissao = d.emissao;
  if (d.validade) c.validade = d.validade;
  if (d.codigoControle) c.codigo = d.codigoControle;
  return c;
}

// Nova certidão / nova versão (com PDF) / editar dados (sem PDF). Lê o PDF no navegador, preenche só campos vazios e exige conferência.
function ModalCertidao({ modo, certidao, idEmpresa, cnpjEmpresa, hoje, aoFechar, aoSalvar }: {
  modo: 'nova' | 'versao' | 'editar'; certidao: Certidao | null; idEmpresa: string; cnpjEmpresa?: string; hoje: string; aoFechar: () => void; aoSalvar: (m: string) => void;
}) {
  const novaVersao = modo === 'versao';
  const [f, setF] = useState<Form>({
    tipo: certidao?.tipo ?? '', nome: certidao?.nome ?? '', orgao: certidao?.orgao_emissor ?? '', resultado: (!novaVersao && certidao?.resultado) || '',
    emissao: (!novaVersao && certidao?.data_emissao) || '', validade: (!novaVersao && certidao?.data_validade) || '', codigo: (!novaVersao && certidao?.codigo_controle) || '',
    observacoes: certidao?.observacoes ?? '',
  });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [conferido, setConferido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fAtual = useRef(f);
  fAtual.current = f;
  const seletorTipo = useRef<HTMLSelectElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const leituraAtual = useRef(0);
  const inicial = useRef(f);
  const autoPreenchido = useRef<Partial<Form>>({}); // o que a última leitura preencheu (para desfazer ao trocar de arquivo)
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);

  const set = (k: keyof Form, v: string) => setF((x) => {
    const n = { ...x, [k]: v } as Form;
    if (k === 'tipo' && v) {
      const t = TIPOS_CERTIDAO[v as TipoCertidao];
      if (!x.nome || Object.values(TIPOS_CERTIDAO).some((y) => y.rotulo === x.nome)) n.nome = v === 'outra' ? '' : t.rotulo;
      if (!x.orgao || Object.values(TIPOS_CERTIDAO).some((y) => y.orgao === x.orgao)) n.orgao = t.orgao;
    }
    return n;
  });

  const escolher = async (a: File | null) => {
    setErro(null); setConferido(false); setLeitura(null);
    // Trocar o arquivo desfaz o preenchimento automático anterior (só campos que o usuário não alterou depois)
    const anterior = autoPreenchido.current;
    autoPreenchido.current = {};
    setF((x) => ({ ...x, ...Object.fromEntries((Object.keys(anterior) as (keyof Form)[]).filter((k) => x[k] === anterior[k]).map((k) => [k, inicial.current[k]])) }));
    fAtual.current = { ...fAtual.current, ...Object.fromEntries((Object.keys(anterior) as (keyof Form)[]).filter((k) => fAtual.current[k] === anterior[k]).map((k) => [k, inicial.current[k]])) };
    const id = ++leituraAtual.current;
    setArquivo(null); setPrevia(null);
    if (!a) return;
    const problema = await validarPdfCertidao(a);
    if (id !== leituraAtual.current) return;
    if (problema) { setErro(problema); if (entrada.current) entrada.current.value = ''; return; }
    setArquivo(a); setPrevia(URL.createObjectURL(a));
    setLeitura({ estado: 'lendo' });
    const r = await lerDocumentoPdf(a);
    if (id !== leituraAtual.current) return;
    if (r.status !== 'certidao_federal') return setLeitura({ estado: 'fim', r, preenchidos: [], bloqueio: null });
    const d = r.extracao.dados;
    const cnpjEmp = (cnpjEmpresa ?? '').replace(/\D/g, '');
    const bloqueio = d.cnpj && cnpjEmp.length === 14 && d.cnpj !== cnpjEmp
      ? `O CNPJ da certidão (${formatarCnpj(d.cnpj)}) é diferente do CNPJ desta empresa (${formatarCnpj(cnpjEmp)}). Envie a certidão correta: o cadastro está bloqueado.` : null;
    const atual = fAtual.current;
    const novos = camposDaCertidao(d);
    const preenchidos = (Object.keys(novos) as (keyof Form)[]).filter((k) => !atual[k]); // nunca sobrescreve o que já está preenchido
    autoPreenchido.current = Object.fromEntries(preenchidos.map((k) => [k, novos[k]!]));
    setF((x) => ({ ...x, ...autoPreenchido.current }));
    setLeitura({ estado: 'fim', r, preenchidos: preenchidos.filter((k) => k !== 'nome'), cnpj: d.cnpj, razao: d.razaoSocial, bloqueio });
  };

  const salvar = async () => {
    if (leitura?.estado === 'lendo') return setErro('Aguarde a leitura do PDF.');
    if (leitura?.estado === 'fim' && leitura.bloqueio) return setErro(leitura.bloqueio);
    if (modo !== 'editar' && !arquivo) return setErro('Envie o PDF da certidão.');
    if (!f.tipo) return setErro('Escolha o tipo de certidão.');
    if (f.nome.trim().length < 2 || f.orgao.trim().length < 2) return setErro('Informe o nome e o órgão emissor.');
    if (!f.emissao) return setErro('Informe a data de emissão.');
    if (f.emissao > hoje) return setErro('A data de emissão não pode ser futura.');
    if (f.validade && f.validade < f.emissao) return setErro('A validade não pode ser anterior à emissão.');
    if (modo !== 'editar' && !conferido) return setErro('Confirme que conferiu os dados da certidão antes de salvar.');
    setOcupado(true); setErro(null);
    let caminho: string | null = null;
    try {
      if (arquivo) caminho = await enviarPdfCertidao(idEmpresa, arquivo);
    } catch (e) { setOcupado(false); return setErro((e as Error).message); }
    const { error } = await createClient().rpc('salvar_certidao', {
      p_id: certidao?.id ?? null, p_id_empresa: idEmpresa, p_tipo: f.tipo, p_nome: f.nome.trim(), p_orgao: f.orgao.trim(), p_resultado: f.resultado || null,
      p_emissao: f.emissao, p_validade: f.validade || null, p_codigo: f.codigo.trim() || null, p_observacoes: f.observacoes.trim() || null,
      p_caminho: caminho, p_nome_arquivo: arquivo?.name ?? null,
    });
    if (error) {
      if (caminho) await descartarPdfCertidao(caminho); // sem arquivo órfão nem referência inválida
      setOcupado(false);
      return setErro(mensagemDeErro(error, 'Não foi possível salvar a certidão.'));
    }
    setOcupado(false);
    aoSalvar(modo === 'nova' ? 'Certidão cadastrada.' : modo === 'versao' ? 'Nova versão da certidão salva. A anterior continua no histórico.' : 'Certidão atualizada.');
  };

  const situacao = situacaoPorValidade(f.validade || null, hoje);
  const passo = !arquivo ? 1 : leitura?.estado === 'lendo' ? 2 : 3;
  const titulo = modo === 'nova' ? 'Nova certidão' : modo === 'versao' ? 'Nova versão da certidão' : 'Editar certidão';
  const comPdf = modo !== 'editar';

  return (
    <Modal aberto aoFechar={aoFechar} tamanho={comPdf ? 'xl' : 'md'} titulo={titulo}
      descricao={comPdf ? 'Envie o PDF da certidão. O sistema lê o documento e preenche os dados para você conferir.' : certidao?.nome}
      rodape={<>
        {comPdf && arquivo && <button type="button" className={`${classeBotaoSecundario} sm:mr-auto`} onClick={() => entrada.current?.click()}><RefreshCw className="w-4 h-4" aria-hidden="true" />Trocar arquivo</button>}
        <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado || leitura?.estado === 'lendo' || (leitura?.estado === 'fim' && !!leitura.bloqueio)} onClick={salvar}>
          <Save className="w-4 h-4" aria-hidden="true" />{ocupado ? 'Salvando...' : 'Salvar certidão'}
        </button>
      </>}>
      <div className="space-y-4">
        {comPdf && (
          <ol aria-label="Etapas" className="flex items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm">
            {['Enviar PDF', 'Analisar documento', 'Conferir e salvar'].map((t, i) => (
              <li key={t} aria-current={passo === i + 1 ? 'step' : undefined} className="flex items-center gap-2 min-w-0">
                <span className={`w-7 h-7 shrink-0 rounded-full inline-flex items-center justify-center font-bold ${passo >= i + 1 ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                <span className={`hidden min-[480px]:inline ${passo === i + 1 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{t}</span>
                {i < 2 && <span className="hidden sm:block w-10 lg:w-20 h-px bg-gray-200" aria-hidden="true" />}
              </li>
            ))}
          </ol>
        )}
        {erro && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
        <div className={comPdf ? 'grid gap-4 lg:grid-cols-2 min-w-0' : ''}>
          {comPdf && (
            <div className="min-w-0 space-y-3">
              <input ref={entrada} id="cert-pdf" type="file" accept="application/pdf,.pdf" aria-label="PDF da certidão" className="sr-only" onChange={(e) => escolher(e.target.files?.[0] ?? null)} />
              {!arquivo ? (
                <button type="button" onClick={() => entrada.current?.click()} className="w-full min-h-48 rounded-2xl border-2 border-dashed border-gray-300 hover:border-orange-400 hover:bg-orange-50/40 flex flex-col items-center justify-center gap-2 p-6 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                  <Upload className="w-8 h-8 text-orange-600" aria-hidden="true" />
                  <span className="font-semibold text-gray-900">Selecionar PDF da certidão</span>
                  <span className="text-xs text-gray-500">Somente PDF, até 10 MB. O arquivo é lido no seu navegador.</span>
                </button>
              ) : (
                <>
                  <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 min-w-0" data-testid="arquivo-certidao">
                    <FileText className="w-6 h-6 text-red-500 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-gray-900">{arquivo.name}</span><span className="block text-xs text-gray-500">{formatarTamanho(arquivo.size)}</span></span>
                    {leitura?.estado === 'lendo' && <span role="status" className="text-xs text-gray-600 inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />Analisando…</span>}
                    {leitura?.estado === 'fim' && leitura.r.status === 'certidao_federal' && <span className="text-xs font-semibold text-green-700 bg-green-50 rounded-full px-2 py-1 inline-flex items-center gap-1 whitespace-nowrap"><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />Documento analisado</span>}
                  </div>
                  {previa && <iframe title="Prévia do PDF" src={previa} className="hidden lg:block w-full h-[26rem] rounded-xl border border-gray-200 bg-gray-50" />}
                </>
              )}
            </div>
          )}

          <div className="min-w-0 space-y-4">
            {leitura?.estado === 'fim' && <CartaoLeitura leitura={leitura} aoAlterarTipo={() => seletorTipo.current?.focus()} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="cert-tipo" className={rotulo}>Tipo de certidão</label>
                <select ref={seletorTipo} id="cert-tipo" value={f.tipo} onChange={(e) => set('tipo', e.target.value)} className={campo}>
                  <option value="">Selecione</option>{Object.entries(TIPOS_CERTIDAO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
                </select></div>
              <div><label htmlFor="cert-orgao" className={rotulo}>Órgão emissor</label><input id="cert-orgao" maxLength={120} value={f.orgao} onChange={(e) => set('orgao', e.target.value)} className={campo} /></div>
              <div className="sm:col-span-2"><label htmlFor="cert-nome" className={rotulo}>Nome da certidão</label><input id="cert-nome" maxLength={120} value={f.nome} onChange={(e) => set('nome', e.target.value)} className={campo} /></div>
              {leitura?.estado === 'fim' && leitura.r.status === 'certidao_federal' && (
                <>
                  <div><label htmlFor="cert-cnpj" className={rotulo}>CNPJ</label><input id="cert-cnpj" disabled value={leitura.cnpj ? formatarCnpj(leitura.cnpj) : 'Não identificado'} className={campo} /></div>
                  <div><label htmlFor="cert-razao" className={rotulo}>Razão social</label><input id="cert-razao" disabled value={leitura.razao ?? 'Não identificada'} className={campo} /></div>
                </>
              )}
              <div><label htmlFor="cert-emissao" className={rotulo}>Data de emissão</label><input id="cert-emissao" type="date" max={hoje} value={f.emissao} onChange={(e) => set('emissao', e.target.value)} className={campo} /></div>
              <div><label htmlFor="cert-validade" className={rotulo}>Data de validade</label><input id="cert-validade" type="date" min={f.emissao || undefined} value={f.validade} onChange={(e) => set('validade', e.target.value)} className={campo} /></div>
              <div><label htmlFor="cert-codigo" className={rotulo}>Código de controle</label><input id="cert-codigo" maxLength={60} value={f.codigo} onChange={(e) => set('codigo', e.target.value.toUpperCase())} className={`${campo} font-mono`} /></div>
              <div><label htmlFor="cert-resultado" className={rotulo}>Resultado</label>
                <select id="cert-resultado" value={f.resultado} onChange={(e) => set('resultado', e.target.value)} className={campo}>
                  <option value="">Não informado</option>{Object.entries(RESULTADOS_CERTIDAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              <div className="sm:col-span-2 flex items-center gap-2 text-sm" data-testid="situacao-certidao">
                <span className="font-semibold text-gray-900">Situação pela validade:</span><Selo tipo={SITUACOES_CERTIDAO[situacao].selo} texto={SITUACOES_CERTIDAO[situacao].rotulo} />
              </div>
              <div className="sm:col-span-2"><label htmlFor="cert-obs" className={rotulo}>Observações <span className="font-normal text-gray-500">(opcional)</span></label>
                <textarea id="cert-obs" rows={2} maxLength={500} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                <p className="text-right text-xs text-gray-400">{f.observacoes.length}/500</p></div>
            </div>
            {comPdf && arquivo && !(leitura?.estado === 'fim' && leitura.bloqueio) && (
              <label className="flex items-start gap-2 text-sm text-gray-900 cursor-pointer">
                <input type="checkbox" checked={conferido} onChange={(e) => setConferido(e.target.checked)} className="mt-0.5 w-4 h-4 accent-orange-600" />
                Conferi os dados da certidão
              </label>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CartaoLeitura({ leitura, aoAlterarTipo }: { leitura: Extract<Leitura, { estado: 'fim' }>; aoAlterarTipo: () => void }) {
  const { r } = leitura;
  const amarelo = 'rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900';
  if (r.status === 'erro') return <p role="status" data-testid="leitura-certidao" className={amarelo}>{r.mensagem}</p>;
  if (r.status === 'das') return <p role="status" data-testid="leitura-certidao" className={amarelo}>Este PDF é uma guia DAS, não uma certidão. Envie o PDF da certidão.</p>;
  if (r.status === 'nao_reconhecido') return <p role="status" data-testid="leitura-certidao" className={amarelo}>Não identificamos o tipo automaticamente (a leitura reconhece a Certidão Federal RFB/PGFN). Preencha os campos manualmente.</p>;
  const { faltando, alertas } = r.extracao;
  const naoIdentificados = faltando.filter((k) => k !== 'cnpj' && k !== 'razaoSocial');
  return (
    <div data-testid="leitura-certidao" className={`rounded-xl border px-3 py-2.5 text-sm space-y-1.5 ${leitura.bloqueio ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0"><CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" aria-hidden="true" />
          <p className="min-w-0"><span className="block font-semibold text-gray-900">Documento identificado</span><span className="block text-gray-800">Certidão Federal (RFB/PGFN)</span></p></div>
        <button type="button" onClick={aoAlterarTipo} className="shrink-0 min-h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold inline-flex items-center gap-1 hover:bg-gray-50"><Pencil className="w-3.5 h-3.5" aria-hidden="true" />Alterar tipo</button>
      </div>
      {leitura.bloqueio && <p role="alert" className="text-red-800 font-semibold">{leitura.bloqueio}</p>}
      {leitura.preenchidos.length > 0 && <p className="text-xs text-gray-700">Preenchido automaticamente: {leitura.preenchidos.map((k) => ROTULOS[k] ?? k).join(', ')}. Confira antes de salvar.</p>}
      {naoIdentificados.length > 0 && <p className="text-xs text-gray-700" data-testid="nao-identificados">Não identificado no PDF: {naoIdentificados.map((k) => ({ tipoCertidao: 'resultado', orgaoEmissor: 'órgão emissor', emissao: 'data de emissão', validade: 'data de validade', codigoControle: 'código de controle' } as Record<string, string>)[k] ?? k).join(', ')}.</p>}
      {alertas.map((a) => <p key={a} className="text-xs text-amber-900">{a}</p>)}
    </div>
  );
}

function ModalHistorico({ certidao, aoFechar, aoErro }: { certidao: Certidao; aoFechar: () => void; aoErro: (t: string) => void }) {
  const [versoes, setVersoes] = useState<VersaoCertidao[] | null>(null);
  const [eventos, setEventos] = useState<EventoCertidao[]>([]);
  useEffect(() => {
    const s = createClient();
    s.from('versoes_certidoes').select('id, numero, caminho, nome_arquivo, tamanho, data_emissao, data_validade, codigo_controle, enviado_em').eq('id_certidao', certidao.id).order('numero', { ascending: false })
      .then(({ data }) => setVersoes((data ?? []) as VersaoCertidao[]));
    s.from('historico_certidoes').select('acao, dados, criado_em').eq('id_certidao', certidao.id).order('criado_em', { ascending: false }).then(({ data }) => setEventos((data ?? []) as EventoCertidao[]));
  }, [certidao.id]);
  const abrir = async (v: VersaoCertidao, baixar: boolean) => { const e = await abrirPdfCertidao(v.caminho, `${certidao.nome} v${v.numero}`, baixar); if (e) aoErro(e); };
  return (
    <Modal aberto aoFechar={aoFechar} titulo="Versões e histórico" descricao={certidao.nome} tamanho="lg">
      <div className="space-y-5">
        <section aria-label="Versões">
          <h3 className="text-sm font-bold text-gray-900 mb-2">Versões do PDF</h3>
          {versoes === null ? <div className="h-12 rounded-lg bg-gray-50 animate-pulse" /> : (
            <ul className="space-y-2">
              {versoes.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm" data-testid={`versao-${v.numero}`}>
                  <span className="font-semibold text-gray-900">Versão {v.numero}{v.numero === certidao.versao_atual ? ' (atual)' : ''}</span>
                  <span className="text-xs text-gray-500 flex-1 min-w-0">Emissão {formatarData(v.data_emissao)} · {v.data_validade ? `validade ${formatarData(v.data_validade)}` : 'sem validade'} · {formatarTamanho(Number(v.tamanho))}</span>
                  <BotaoIcone icone={Eye} titulo={`Visualizar versão ${v.numero}`} aoClicar={() => abrir(v, false)} />
                  <BotaoIcone icone={Download} titulo={`Baixar versão ${v.numero}`} aoClicar={() => abrir(v, true)} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Histórico">
          <h3 className="text-sm font-bold text-gray-900 mb-2">Histórico</h3>
          <ol className="border-l-2 border-orange-200 pl-3 space-y-1.5 text-sm">
            {eventos.map((h, i) => (
              <li key={i} className="flex justify-between gap-3"><span className="text-gray-800">{ACOES_CERTIDAO[h.acao] ?? h.acao}{h.dados?.versao ? ` (versão ${String(h.dados.versao)})` : ''}{h.dados?.motivo ? ` · ${String(h.dados.motivo)}` : ''}</span>
                <span className="text-gray-500 whitespace-nowrap">{new Date(h.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</span></li>
            ))}
          </ol>
        </section>
      </div>
    </Modal>
  );
}

function ModalArquivar({ certidao, aoFechar, aoConcluir }: { certidao: Certidao; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const confirmar = async () => {
    if (motivo.trim().length < 3) return setErro('Informe o motivo.');
    const { error } = await createClient().rpc('arquivar_certidao', { p_id: certidao.id, p_motivo: motivo.trim() });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível arquivar.'));
    aoConcluir('Certidão arquivada. O histórico e os arquivos continuam guardados.');
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo="Arquivar certidão" descricao={certidao.nome}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Voltar</button><button type="button" className={classeBotaoPerigo} onClick={confirmar}>Arquivar</button></>}>
      <label htmlFor="cert-motivo" className={rotulo}>Motivo</label>
      <textarea id="cert-motivo" rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
      {erro && <p role="alert" className="text-sm text-red-700 mt-2">{erro}</p>}
    </Modal>
  );
}
