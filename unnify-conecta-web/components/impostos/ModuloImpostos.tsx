'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, CalendarClock, CheckCircle2, Eye, FileText, HandCoins, History, MoreHorizontal, Paperclip, Pencil, Plus, Receipt, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { recursoAusente } from '@/lib/erros-banco';
import { Selo } from '@/components/admin/tabela';
import { Indicador } from '@/components/financeiro/Indicador';
import { SeletorConta } from '@/components/financeiro/SeletorConta';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { formatarData, formatarMoeda, hojeBrasil, mascaraMoeda, paraDecimal, valorParaMascara, type ContaFinanceira } from '@/lib/financeiro';
import {
  ARQUIVOS_IMPOSTO, ROTULO_HISTORICO, SITUACAO, SITUACAO_PARCELAMENTO, TAMANHO_MAXIMO_ARQUIVO_IMPOSTO, TIPOS_IMPOSTO, competenciaRotulo, gerarParcelas,
  type ImpostoLinha, type ParcelamentoLinha, type ResumoImpostos, type TipoImposto,
} from '@/lib/impostos';
import { formatarCnpj } from '@/lib/contabil';
import { CAMPOS_DAS, lerDocumentoPdf, type DadosDas, type ResultadoDocumentoPdf } from '@/lib/leitura-pdf';
import { classePilula } from '@/components/navegacao/NavegacaoModulos';

// Impostos e parcelamentos de UMA empresa — usado pelo contador (aba da empresa) e pelo empresário (/app/impostos).
// Tudo passa pelas funções do banco (migration 045), que conferem a permissão a cada chamada.
type Sub = 'correntes' | 'parcelamentos' | 'todos';
type Carga<T> = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string; ausente: boolean } | { tipo: 'ok'; dados: T };
const filtro = 'min-h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500';
const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
function Erro({ texto }: { texto: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (texto) ref.current?.scrollIntoView({ block: 'nearest' }); }, [texto]);
  return texto ? <p ref={ref} role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{texto}</p> : null;
}

// Envia guia/comprovante: <empresa>/<imposto>/<tipo>-<uuid>.<ext> no bucket privado e registra no banco
async function enviarArquivo(idEmpresa: string, idImposto: string, tipo: 'guia' | 'comprovante', arquivo: File): Promise<string | null> {
  const ext = ARQUIVOS_IMPOSTO[arquivo.type];
  if (!ext) return 'Use PDF, JPG ou PNG.';
  if (arquivo.size === 0 || arquivo.size > TAMANHO_MAXIMO_ARQUIVO_IMPOSTO) return 'O arquivo deve ter até 10 MB.';
  const inicio = new Uint8Array(await arquivo.slice(0, 8).arrayBuffer());
  const real = ext === 'pdf' ? String.fromCharCode(...inicio.slice(0, 5)) === '%PDF-' : ext === 'png' ? inicio[0] === 0x89 && inicio[1] === 0x50 : inicio[0] === 0xff && inicio[1] === 0xd8;
  if (!real) return 'O conteúdo do arquivo não confere com o formato.';
  const supabase = createClient();
  const caminho = `${idEmpresa}/${idImposto}/${tipo}-${crypto.randomUUID()}.${ext}`;
  const { error: e1 } = await supabase.storage.from('guias-impostos').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
  if (e1) return 'Não foi possível enviar o arquivo.';
  const { error: e2 } = await supabase.rpc('registrar_arquivo_imposto', { p_id_imposto: idImposto, p_tipo: tipo, p_caminho: caminho, p_nome: arquivo.name, p_tamanho: arquivo.size });
  if (e2) { await supabase.storage.from('guias-impostos').remove([caminho]); return mensagemDeErro(e2, 'Não foi possível registrar o arquivo.'); }
  return null;
}
async function abrirArquivo(caminho: string): Promise<string | null> {
  const janela = window.open('', '_blank'); // aberta no clique (evita bloqueio de pop-up)
  if (!janela) return 'Permita pop-ups para visualizar o arquivo.';
  const { data, error } = await createClient().storage.from('guias-impostos').download(caminho);
  if (error || !data) { janela.close(); return 'Não foi possível abrir o arquivo.'; }
  janela.location.href = URL.createObjectURL(data);
  return null;
}

export function ModuloImpostos({ idEmpresa, papel, cnpjEmpresa }: { idEmpresa: string; papel: 'contador' | 'empresa'; cnpjEmpresa?: string }) {
  const [hoje, setHoje] = useState<string | null>(null);
  useEffect(() => setHoje(hojeBrasil()), []);
  const [sub, setSub] = useState<Sub>('correntes');
  const [resumo, setResumo] = useState<ResumoImpostos | null | 'erro'>(null);
  const [lista, setLista] = useState<Carga<ImpostoLinha[]>>({ tipo: 'carregando' });
  const [parcs, setParcs] = useState<Carga<ParcelamentoLinha[]>>({ tipo: 'carregando' });
  const [parcelas, setParcelas] = useState<ImpostoLinha[]>([]);
  const [f, setF] = useState({ busca: '', situacao: '', tipo: '', venc: '' });
  const [selImposto, setSelImposto] = useState<string | null>(null);
  const [selParc, setSelParc] = useState<string | null>(null);
  const [podeFinanceiro, setPodeFinanceiro] = useState(false);
  const [contas, setContas] = useState<ContaFinanceira[]>([]);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [modal, setModal] = useState<null | { tipo: 'imposto'; imposto: ImpostoLinha | null } | { tipo: 'parcelamento' } | { tipo: 'informar' | 'confirmar' | 'cancelar' | 'excluir'; imposto: ImpostoLinha } | { tipo: 'cancelar_parc' | 'excluir_parc'; parc: ParcelamentoLinha }>(null);
  const [versao, setVersao] = useState(0);
  const req = useRef(0);

  const carregar = useCallback(() => {
    if (!hoje) return;
    const atual = ++req.current;
    const supabase = createClient();
    supabase.rpc('resumo_impostos', { p_id_empresa: idEmpresa }).then(({ data, error }) => atual === req.current && setResumo(error ? 'erro' : (data as ResumoImpostos)));
    if (sub === 'parcelamentos') {
      supabase.rpc('listar_parcelamentos_tributarios', { p_id_empresa: idEmpresa }).then(({ data, error }) => {
        if (atual !== req.current) return;
        setParcs(error ? { tipo: 'erro', mensagem: mensagemDeErro(error, 'Não foi possível carregar os parcelamentos.'), ausente: recursoAusente(error) } : { tipo: 'ok', dados: (data ?? []) as ParcelamentoLinha[] });
      });
      supabase.rpc('buscar_impostos', { p_id_empresa: idEmpresa, p_busca: null, p_situacao: null, p_tipo: null, p_vencimento: null, p_origem: 'parcelas', p_limite: 200, p_deslocamento: 0 })
        .then(({ data }) => atual === req.current && setParcelas((data ?? []) as ImpostoLinha[]));
      return;
    }
    supabase.rpc('buscar_impostos', { p_id_empresa: idEmpresa, p_busca: f.busca.trim() || null, p_situacao: f.situacao || null, p_tipo: sub === 'correntes' ? f.tipo || null : null,
      p_vencimento: f.venc || null, p_origem: sub, p_limite: 200, p_deslocamento: 0 })
      .then(({ data, error }) => {
        if (atual !== req.current) return;
        setLista(error ? { tipo: 'erro', mensagem: mensagemDeErro(error, 'Não foi possível carregar os impostos.'), ausente: recursoAusente(error) } : { tipo: 'ok', dados: (data ?? []) as ImpostoLinha[] });
      });
  }, [hoje, idEmpresa, sub, f]);
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [carregar, versao]);
  useEffect(() => {
    const supabase = createClient();
    supabase.rpc('pode_gerenciar_financeiro', { p_id_empresa: idEmpresa }).then(({ data }) => {
      setPodeFinanceiro(data === true);
      if (data === true) supabase.from('contas_financeiras_saldo').select('id, nome, instituicao, tipo, saldo_inicial, data_saldo_inicial, principal, permite_saldo_negativo, arquivada_em, saldo, cor').eq('id_empresa', idEmpresa).order('nome')
        .then(({ data: c }) => setContas((c ?? []) as ContaFinanceira[]));
    });
  }, [idEmpresa, versao]);

  if (!hoje) return <div role="status" aria-label="Carregando impostos" className="h-56 rounded-2xl bg-white border border-gray-200 animate-pulse" />;
  const alterado = (texto: string) => { setAviso({ tipo: 'ok', texto }); setModal(null); setVersao((v) => v + 1); };
  const r = resumo && resumo !== 'erro' ? resumo : null;
  const card = (v: string | undefined) => (r ? v ?? '—' : resumo === 'erro' ? 'Indisponível' : '…');
  const linhas = lista.tipo === 'ok' ? lista.dados : [];
  const todasParcelas = parcelas;
  const imposto = [...linhas, ...todasParcelas].find((i) => i.id === selImposto) ?? null;
  const parc = parcs.tipo === 'ok' ? parcs.dados.find((p) => p.id === selParc) ?? null : null;
  const erroAtual = sub === 'parcelamentos' ? parcs : lista;

  return (
    <div className="space-y-4 min-w-0" data-testid="modulo-impostos">
      {aviso && <div role={aviso.tipo === 'ok' ? 'status' : 'alert'} className={`rounded-xl border px-4 py-3 text-sm flex justify-between gap-3 ${aviso.tipo === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}><span>{aviso.texto}</span><button type="button" className="underline" onClick={() => setAviso(null)}>Fechar</button></div>}
      {erroAtual.tipo === 'erro' && (erroAtual.ausente
        ? <p role="status" data-testid="impostos-indisponivel" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{erroAtual.mensagem}</p>
        : <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-wrap justify-between gap-3">{erroAtual.mensagem}
            <button type="button" onClick={() => setVersao((v) => v + 1)} className="min-h-11 px-3 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button></div>)}

      <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Impostos a pagar" valor={card(r ? formatarMoeda(r.a_pagar) : undefined)} icone={Receipt} cor="bg-orange-100 text-orange-600" detalhe={r ? `${r.qtd_a_pagar} guias pendentes${r.vencidos ? ` · ${r.vencidos} vencidas` : ''}` : undefined} />
        <Indicador titulo="Vencendo em breve" valor={card(r ? String(r.vencendo_7) : undefined)} icone={CalendarClock} cor="bg-red-100 text-red-600" detalhe="Nos próximos 7 dias" />
        <Indicador titulo="Guias enviadas" valor={card(r ? String(r.guias) : undefined)} icone={FileText} cor="bg-blue-100 text-blue-600" detalhe="Impostos com guia disponível" />
        <Indicador titulo="Impostos pagos" valor={card(r ? String(r.pagos_90) : undefined)} icone={CheckCircle2} cor="bg-green-100 text-green-600" detalhe="Confirmados nos últimos 90 dias" />
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_25rem]">
        <section aria-label="Impostos e parcelamentos" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 min-w-0 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div role="tablist" aria-label="Tipo de lista" className="flex flex-wrap gap-2">
              {([['correntes', 'Impostos correntes'], ['parcelamentos', 'Parcelamentos'], ['todos', 'Todos']] as const).map(([v, rot]) => (
                <button key={v} type="button" role="tab" aria-selected={sub === v} onClick={() => { setSub(v); setSelImposto(null); }}
                  className={classePilula(sub === v)}>{rot}</button>
              ))}
            </div>
            <button type="button" className={`${classeBotaoPrimario} whitespace-nowrap`} onClick={() => setModal(sub === 'parcelamentos' ? { tipo: 'parcelamento' } : { tipo: 'imposto', imposto: null })}>
              <Plus className="w-4 h-4" aria-hidden="true" />{sub === 'parcelamentos' ? 'Novo parcelamento' : 'Novo imposto'}</button>
          </div>
          {sub !== 'parcelamentos' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2">
                <input type="search" aria-label="Buscar imposto" placeholder="Buscar imposto, órgão ou competência (MM/AAAA)..." value={f.busca} onChange={(e) => setF((x) => ({ ...x, busca: e.target.value }))} className={`${filtro} min-w-0`} />
                <select aria-label="Filtrar por status" value={f.situacao} onChange={(e) => setF((x) => ({ ...x, situacao: e.target.value }))} className={filtro}><option value="">Todos os status</option>{Object.entries(SITUACAO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select>
                {sub === 'correntes' && <select aria-label="Filtrar por tipo" value={f.tipo} onChange={(e) => setF((x) => ({ ...x, tipo: e.target.value }))} className={filtro}><option value="">Todos os tipos</option>{Object.entries(TIPOS_IMPOSTO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select>}
                <select aria-label="Filtrar por vencimento" value={f.venc} onChange={(e) => setF((x) => ({ ...x, venc: e.target.value }))} className={filtro}><option value="">Qualquer vencimento</option><option value="vencidos">Vencidos</option><option value="7">Próximos 7 dias</option><option value="30">Próximos 30 dias</option><option value="mes">Este mês</option></select>
              </div>
              {lista.tipo === 'carregando' && <div role="status" aria-label="Carregando impostos" className="h-48 rounded-xl bg-gray-50 animate-pulse" />}
              {lista.tipo === 'ok' && (linhas.length === 0 ? (
                <div className="text-center py-10"><p className="font-semibold text-gray-900">{f.busca || f.situacao || f.tipo || f.venc ? 'Nenhum imposto com esses filtros.' : 'Nenhum imposto cadastrado ainda.'}</p>
                  {!(f.busca || f.situacao || f.tipo || f.venc) && <p className="text-sm text-gray-500 mt-1">{papel === 'contador' ? 'Cadastre os impostos e envie as guias: eles entram nas Contas a pagar da empresa.' : 'Os impostos lançados aqui (ou pelo seu contador) entram nas suas Contas a pagar.'}</p>}</div>
              ) : <TabelaImpostos linhas={linhas} selecionado={selImposto} aoSelecionar={setSelImposto} mostrarOrigem={sub === 'todos'} aoAviso={(t) => setAviso({ tipo: 'erro', texto: t })}
                    aoEditar={(i) => setModal({ tipo: 'imposto', imposto: i })} />)}
            </>
          ) : (
            <>
              {parcs.tipo === 'carregando' && <div role="status" aria-label="Carregando parcelamentos" className="h-40 rounded-xl bg-gray-50 animate-pulse" />}
              {parcs.tipo === 'ok' && (parcs.dados.length === 0 ? <p className="text-center py-10 font-semibold text-gray-900">Nenhum parcelamento cadastrado.</p>
                : <TabelaParcelamentos linhas={parcs.dados} selecionado={selParc} aoSelecionar={(id) => { setSelParc(id); setSelImposto(null); }} />)}
            </>
          )}
        </section>

        {imposto ? (
          <PainelImposto imposto={imposto} idEmpresa={idEmpresa} papel={papel} podeFinanceiro={podeFinanceiro} versao={versao}
            aoFechar={() => setSelImposto(null)} aoAcao={(tipo) => setModal(tipo === 'editar' ? { tipo: 'imposto', imposto } : { tipo, imposto })}
            aoAlterado={alterado} aoAviso={(t) => setAviso({ tipo: 'erro', texto: t })} />
        ) : sub === 'parcelamentos' ? (
          parc ? <PainelParcelas parc={parc} parcelas={todasParcelas.filter((p) => p.id_parcelamento === parc.id).sort((a, b) => (a.numero_parcela ?? 0) - (b.numero_parcela ?? 0))}
            aoFechar={() => setSelParc(null)} aoAbrir={setSelImposto} aoCancelar={() => setModal({ tipo: 'cancelar_parc', parc })} aoExcluir={() => setModal({ tipo: 'excluir_parc', parc })} />
            : <aside aria-label="Parcelas" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 text-sm text-gray-500 self-start">Selecione um parcelamento para ver as parcelas.</aside>
        ) : <aside aria-label="Detalhes do imposto" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 text-sm text-gray-500 self-start">Selecione um imposto para ver os detalhes.</aside>}
      </div>

      {modal?.tipo === 'imposto' && <ModalImposto idEmpresa={idEmpresa} cnpjEmpresa={cnpjEmpresa} imposto={modal.imposto} aoFechar={() => setModal(null)} aoSalvar={alterado} />}
      {modal?.tipo === 'parcelamento' && <ModalParcelamento idEmpresa={idEmpresa} hoje={hoje} aoFechar={() => setModal(null)} aoSalvar={alterado} />}
      {modal?.tipo === 'informar' && <ModalInformar imposto={modal.imposto} hoje={hoje} aoFechar={() => setModal(null)} aoSalvar={alterado} />}
      {modal?.tipo === 'confirmar' && <ModalConfirmar imposto={modal.imposto} contas={contas} hoje={hoje} aoFechar={() => setModal(null)} aoSalvar={alterado} />}
      {modal?.tipo === 'cancelar' && <ModalMotivo titulo={`Cancelar ${modal.imposto.nome}`} texto="A conta a pagar deste imposto também é cancelada (não é apagada). Impostos pagos precisam ser estornados no Financeiro antes."
        aoFechar={() => setModal(null)} aoConfirmar={async (m) => { const { error } = await createClient().rpc('cancelar_imposto', { p_id: modal.imposto.id, p_motivo: m }); if (error) return mensagemDeErro(error, 'Não foi possível cancelar.'); setSelImposto(null); alterado('Imposto cancelado.'); return null; }} />}
      {modal?.tipo === 'excluir' && <ModalExcluir titulo={`Excluir ${modal.imposto.nome}`} botao="Excluir imposto"
        texto={`${modal.imposto.id_parcelamento ? 'A parcela' : 'O imposto'} sai das listas e da conta a pagar do Financeiro. O histórico fica guardado. Se já foi pago, estorne o pagamento no Financeiro antes.`}
        aoFechar={() => setModal(null)} aoConfirmar={async () => { const { error } = await createClient().rpc('excluir_imposto', { p_id: modal.imposto.id }); if (error) return mensagemDeErro(error, 'Não foi possível excluir o imposto.'); setSelImposto(null); alterado(modal.imposto.id_parcelamento ? 'Parcela excluída.' : 'Imposto excluído.'); return null; }} />}
      {modal?.tipo === 'excluir_parc' && <ModalExcluir titulo={`Excluir parcelamento ${modal.parc.numero_acordo}`} botao="Excluir parcelamento"
        texto="O parcelamento e TODAS as suas parcelas saem das listas e das contas a pagar do Financeiro. O histórico fica guardado. Só é possível se nenhuma parcela estiver paga."
        aoFechar={() => setModal(null)} aoConfirmar={async () => { const { error } = await createClient().rpc('excluir_parcelamento_tributario', { p_id: modal.parc.id }); if (error) return mensagemDeErro(error, 'Não foi possível excluir o parcelamento.'); setSelParc(null); alterado('Parcelamento excluído.'); return null; }} />}
      {modal?.tipo === 'cancelar_parc' && <ModalMotivo titulo={`Cancelar parcelamento ${modal.parc.numero_acordo}`} texto="As parcelas em aberto (e suas contas a pagar) são canceladas. Parcelas pagas são preservadas."
        aoFechar={() => setModal(null)} aoConfirmar={async (m) => { const { error } = await createClient().rpc('cancelar_parcelamento_tributario', { p_id: modal.parc.id, p_motivo: m }); if (error) return mensagemDeErro(error, 'Não foi possível cancelar.'); alterado('Parcelamento cancelado.'); return null; }} />}
    </div>
  );
}

function TabelaImpostos({ linhas, selecionado, aoSelecionar, mostrarOrigem, aoEditar, aoAviso }: {
  linhas: ImpostoLinha[]; selecionado: string | null; aoSelecionar: (id: string) => void; mostrarOrigem: boolean; aoEditar: (i: ImpostoLinha) => void; aoAviso: (t: string) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto -mx-3 sm:mx-0">
      <table className="w-full text-sm min-w-[56rem]">
        <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">{['Imposto', 'Órgão', mostrarOrigem ? 'Origem' : 'Competência', 'Vencimento', 'Valor', 'Status', 'Ações'].map((h) => <th key={h} className="py-2 px-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {linhas.map((i) => (
            <tr key={i.id} data-testid={`imposto-${i.nome}`} onClick={() => aoSelecionar(i.id)} className={`border-b border-gray-50 cursor-pointer ${selecionado === i.id ? 'bg-orange-50/60' : 'hover:bg-gray-50'}`}>
              <td className="py-2.5 px-2"><button type="button" onClick={() => aoSelecionar(i.id)} className="font-semibold text-gray-900 text-left">{i.nome}</button></td>
              <td className="py-2.5 px-2 text-gray-600">{i.orgao}</td>
              <td className="py-2.5 px-2">{mostrarOrigem ? (i.id_parcelamento ? 'Parcelamento' : 'Imposto') : competenciaRotulo(i.competencia)}</td>
              <td className="py-2.5 px-2 whitespace-nowrap">{formatarData(i.vencimento)}</td>
              <td className="py-2.5 px-2 whitespace-nowrap font-semibold">{formatarMoeda(i.valor)}</td>
              <td className="py-2.5 px-2"><Selo tipo={SITUACAO[i.situacao].selo} texto={SITUACAO[i.situacao].rotulo} /></td>
              <td className="py-2.5 px-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1 relative">
                  <button type="button" disabled={!i.guia_caminho} onClick={async () => { const e = await abrirArquivo(i.guia_caminho!); if (e) aoAviso(e); }} className="min-h-9 px-2 rounded-lg border border-gray-200 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40"><Eye className="w-3.5 h-3.5" aria-hidden="true" />Ver guia</button>
                  <button type="button" aria-label={`Mais ações de ${i.nome}`} aria-expanded={menu === i.id} onClick={() => setMenu(menu === i.id ? null : i.id)} className="w-9 h-9 rounded-lg border border-gray-200 inline-flex items-center justify-center"><MoreHorizontal className="w-4 h-4" aria-hidden="true" /></button>
                  {menu === i.id && (
                    <div role="menu" className="absolute right-0 top-10 z-10 w-44 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-sm">
                      <button type="button" role="menuitem" onClick={() => { setMenu(null); aoSelecionar(i.id); }} className="w-full min-h-10 px-3 text-left hover:bg-gray-50 inline-flex items-center gap-2"><FileText className="w-4 h-4" aria-hidden="true" />Ver detalhes</button>
                      <button type="button" role="menuitem" disabled={!!i.id_parcelamento || i.situacao === 'pago' || i.situacao === 'cancelado'} onClick={() => { setMenu(null); aoEditar(i); }} className="w-full min-h-10 px-3 text-left hover:bg-gray-50 inline-flex items-center gap-2 disabled:opacity-40"><Pencil className="w-4 h-4" aria-hidden="true" />Editar</button>
                      <button type="button" role="menuitem" onClick={() => { setMenu(null); aoSelecionar(i.id); }} className="w-full min-h-10 px-3 text-left hover:bg-gray-50 inline-flex items-center gap-2"><History className="w-4 h-4" aria-hidden="true" />Histórico</button>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Arquivo { id: string; tipo: 'guia' | 'comprovante'; caminho: string; nome_arquivo: string; tamanho: number; criado_em: string }
interface Evento { acao: string; dados: Record<string, unknown> | null; criado_em: string }
function PainelImposto({ imposto: i, idEmpresa, papel, podeFinanceiro, versao, aoFechar, aoAcao, aoAlterado, aoAviso }: {
  imposto: ImpostoLinha; idEmpresa: string; papel: 'contador' | 'empresa'; podeFinanceiro: boolean; versao: number; aoFechar: () => void;
  aoAcao: (t: 'editar' | 'informar' | 'confirmar' | 'cancelar' | 'excluir') => void; aoAlterado: (m: string) => void; aoAviso: (t: string) => void;
}) {
  const [aba, setAba] = useState<'detalhes' | 'historico'>('detalhes');
  const [arquivos, setArquivos] = useState<Arquivo[] | null>(null);
  const [hist, setHist] = useState<Evento[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [excluindoGuia, setExcluindoGuia] = useState<Arquivo | null>(null);
  const [erroExcluir, setErroExcluir] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);
  const inputGuia = useRef<HTMLInputElement>(null);
  const inputComp = useRef<HTMLInputElement>(null);
  const [daFolha, setDaFolha] = useState(false); // encargo da folha aprovada (migration 060): só a folha altera
  useEffect(() => {
    const supabase = createClient();
    setArquivos(null); setHist(null); setDaFolha(false);
    supabase.from('impostos').select('id_valor_folha').eq('id', i.id).maybeSingle().then(({ data }) => setDaFolha(!!(data as { id_valor_folha: string | null } | null)?.id_valor_folha));
    supabase.from('arquivos_impostos').select('id, tipo, caminho, nome_arquivo, tamanho, criado_em').eq('id_imposto', i.id).order('criado_em', { ascending: false }).then(({ data }) => setArquivos((data ?? []) as Arquivo[]));
    supabase.from('historico_impostos').select('acao, dados, criado_em').eq('id_imposto', i.id).order('criado_em', { ascending: false }).limit(50).then(({ data }) => setHist((data ?? []) as Evento[]));
  }, [i.id, versao]);
  const enviar = async (tipo: 'guia' | 'comprovante', arq: File | undefined) => {
    if (!arq) return;
    setEnviando(true); const e = await enviarArquivo(idEmpresa, i.id, tipo, arq); setEnviando(false);
    if (e) aoAviso(e); else aoAlterado(tipo === 'guia' ? 'Guia enviada. A empresa foi avisada.' : 'Comprovante anexado.');
  };
  // Excluir guia: remove o registro pelo banco (confere permissão e situação) e só então apaga o arquivo do bucket privado
  const excluirGuia = async () => {
    if (!excluindoGuia || apagando) return;
    setApagando(true); setErroExcluir(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('excluir_guia_imposto', { p_id_arquivo: excluindoGuia.id });
    if (error) { setApagando(false); return setErroExcluir(mensagemDeErro(error, 'Não foi possível excluir a guia.')); }
    if (typeof data === 'string') await supabase.storage.from('guias-impostos').remove([data]); // sem registro, o arquivo vira descartável pela política do Storage
    setApagando(false); setExcluindoGuia(null);
    aoAlterado('Guia excluída.');
  };
  const aberto = i.situacao === 'pendente' || i.situacao === 'vencido';
  const ativo = i.situacao !== 'cancelado';
  const podeExcluirGuia = i.situacao !== 'pago' && ativo; // guia de imposto pago fica como prova do pagamento
  const guias = (arquivos ?? []).filter((a) => a.tipo === 'guia');
  const comps = (arquivos ?? []).filter((a) => a.tipo === 'comprovante');
  const Arq = ({ a }: { a: Arquivo }) => (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 p-2 text-sm">
      {a.tipo === 'guia' ? <FileText className="w-5 h-5 text-red-500 shrink-0" aria-hidden="true" /> : <Paperclip className="w-5 h-5 text-gray-500 shrink-0" aria-hidden="true" />}
      <span className="flex-1 min-w-0"><span className="block truncate font-medium">{a.nome_arquivo}</span><span className="block text-xs text-gray-500">{Math.max(1, Math.round(Number(a.tamanho) / 1024))} KB · {formatarData(a.criado_em.slice(0, 10))}</span></span>
      <button type="button" onClick={async () => { const e = await abrirArquivo(a.caminho); if (e) aoAviso(e); }} className="min-h-9 px-2 rounded-lg border border-gray-200 text-xs font-semibold">{a.tipo === 'guia' ? 'Visualizar guia' : 'Abrir'}</button>
      {a.tipo === 'guia' && podeExcluirGuia && (
        <button type="button" aria-label={`Excluir guia ${a.nome_arquivo}`} title="Excluir guia" onClick={() => { setErroExcluir(null); setExcluindoGuia(a); }}
          className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
      )}
    </div>
  );
  return (
    <aside aria-label="Detalhes do imposto" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 self-start min-w-0 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0"><p className="text-lg font-black text-gray-900 break-words">{i.nome}</p><p className="text-xs text-gray-500">{i.orgao}</p>
          {daFolha && <span className="mt-1 inline-block text-[10px] font-bold uppercase bg-violet-50 text-violet-700 rounded px-1.5 py-0.5" data-testid="origem-folha">Folha de pagamento</span>}</div>
        <Selo tipo={SITUACAO[i.situacao].selo} texto={SITUACAO[i.situacao].rotulo} />
        <button type="button" aria-label="Fechar detalhes" onClick={aoFechar} className="w-9 h-9 -mt-1 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"><X className="w-4 h-4" aria-hidden="true" /></button>
      </div>
      <div role="tablist" aria-label="Detalhes do imposto" className="flex gap-1 border-b border-gray-100">
        {([['detalhes', 'Detalhes'], ['historico', 'Histórico']] as const).map(([v, rot]) => (
          <button key={v} type="button" role="tab" aria-selected={aba === v} onClick={() => setAba(v)} className={`min-h-10 px-3 text-sm font-semibold border-b-2 -mb-px ${aba === v ? 'border-orange-600 text-orange-700' : 'border-transparent text-gray-600'}`}>{rot}</button>
        ))}
      </div>
      {aba === 'detalhes' ? (
        <>
          <dl className="text-sm grid grid-cols-[7rem_minmax(0,1fr)] gap-y-1.5">
            {i.competencia && <><dt className="text-gray-500">Competência</dt><dd>{competenciaRotulo(i.competencia)}</dd></>}
            <dt className="text-gray-500">Vencimento</dt><dd>{formatarData(i.vencimento)}</dd>
            <dt className="text-gray-500">Valor</dt><dd className="font-semibold">{formatarMoeda(i.valor)}</dd>
            <dt className="text-gray-500">Descrição</dt><dd>{i.descricao ?? '—'}</dd>
            {i.data_pagamento && <><dt className="text-gray-500">Pago em</dt><dd>{formatarData(i.data_pagamento)}</dd></>}
            {i.situacao === 'pagamento_informado' && i.data_pagamento_informada && <><dt className="text-gray-500">Informado</dt><dd>pago em {formatarData(i.data_pagamento_informada)}</dd></>}
          </dl>
          {i.situacao === 'pagamento_informado' && <p className="text-xs rounded-lg border border-blue-200 bg-blue-50 p-2 text-blue-900">Pagamento <strong>informado</strong>: ainda depende da confirmação (baixa no Financeiro com a conta usada). Não conta como pago.</p>}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-900">Guia do imposto</p>
            {arquivos === null ? <div className="h-10 rounded bg-gray-50 animate-pulse" /> : guias.length ? guias.map((a) => <Arq key={a.id} a={a} />) : <p className="text-xs text-gray-500">Nenhuma guia enviada.</p>}
            <p className="text-sm font-semibold text-gray-900">Comprovantes</p>
            {arquivos !== null && (comps.length ? comps.map((a) => <Arq key={a.id} a={a} />) : <p className="text-xs text-gray-500">Nenhum comprovante anexado.</p>)}
          </div>
          {ativo && (
            <div className="grid gap-2">
              {aberto && podeFinanceiro && <button type="button" onClick={() => aoAcao('confirmar')} className={classeBotaoPrimario}><HandCoins className="w-4 h-4" aria-hidden="true" />Confirmar pagamento (baixa)</button>}
              {aberto && <button type="button" onClick={() => aoAcao('informar')} className={podeFinanceiro ? classeBotaoSecundario : classeBotaoPrimario}><CheckCircle2 className="w-4 h-4" aria-hidden="true" />Registrar informação de pagamento</button>}
              {i.situacao === 'pagamento_informado' && podeFinanceiro && <button type="button" onClick={() => aoAcao('confirmar')} className={classeBotaoPrimario}><HandCoins className="w-4 h-4" aria-hidden="true" />Confirmar pagamento (baixa)</button>}
              {papel === 'contador' && i.situacao !== 'pago' && <button type="button" disabled={enviando} onClick={() => inputGuia.current?.click()} className={classeBotaoSecundario}><Upload className="w-4 h-4" aria-hidden="true" />{guias.length ? 'Enviar nova guia' : 'Enviar guia'}</button>}
              <button type="button" disabled={enviando} onClick={() => inputComp.current?.click()} className={classeBotaoSecundario}><Paperclip className="w-4 h-4" aria-hidden="true" />{enviando ? 'Enviando...' : 'Anexar comprovante'}</button>
              {papel === 'empresa' && i.situacao !== 'pago' && <button type="button" disabled={enviando} onClick={() => inputGuia.current?.click()} className={classeBotaoSecundario}><Upload className="w-4 h-4" aria-hidden="true" />Anexar guia</button>}
              {daFolha && i.situacao !== 'pago' && <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2">Encargo da folha de pagamento aprovada: valor, vencimento e exclusão só mudam pela Folha de Pagamento. O pagamento é registrado aqui normalmente.</p>}
              {!daFolha && !i.id_parcelamento && i.situacao !== 'pago' && <button type="button" onClick={() => aoAcao('editar')} className={classeBotaoSecundario}><Pencil className="w-4 h-4" aria-hidden="true" />Editar imposto</button>}
              {!daFolha && !i.id_parcelamento && i.situacao !== 'pago' && <button type="button" onClick={() => aoAcao('cancelar')} className={`${classeBotaoSecundario} !text-red-700`}><Ban className="w-4 h-4" aria-hidden="true" />Cancelar imposto</button>}
              {!daFolha && i.situacao !== 'pago' && <button type="button" onClick={() => aoAcao('excluir')} className={`${classeBotaoSecundario} !text-red-700`}><Trash2 className="w-4 h-4" aria-hidden="true" />{i.id_parcelamento ? 'Excluir parcela' : 'Excluir imposto'}</button>}
              <input ref={inputGuia} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" aria-label="Arquivo da guia" onChange={(e) => { enviar('guia', e.target.files?.[0]); e.target.value = ''; }} />
              <input ref={inputComp} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" aria-label="Arquivo do comprovante" onChange={(e) => { enviar('comprovante', e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          )}
          {!podeFinanceiro && (i.situacao === 'pendente' || i.situacao === 'vencido' || i.situacao === 'pagamento_informado') && <p className="text-xs text-gray-500">A confirmação do pagamento é feita por quem gerencia o Financeiro da empresa (baixa em Contas a pagar).</p>}
        </>
      ) : (
        hist === null ? <div role="status" aria-label="Carregando histórico" className="h-16 rounded-lg bg-gray-50 animate-pulse" /> : (
          <ul className="text-sm space-y-2" data-testid="historico-imposto">
            {hist.map((h, k) => <li key={k}><span className="font-medium text-gray-900">{ROTULO_HISTORICO[h.acao] ?? h.acao}</span>
              <span className="block text-xs text-gray-500">{new Date(h.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}{h.dados?.motivo ? ` · ${h.dados.motivo}` : ''}{h.dados?.arquivo ? ` · ${h.dados.arquivo}` : ''}</span></li>)}
            {hist.length === 0 && <li className="text-gray-500">Sem registros.</li>}
          </ul>
        )
      )}
      <Modal aberto={!!excluindoGuia} aoFechar={() => { if (!apagando) setExcluindoGuia(null); }} titulo="Excluir guia" descricao={excluindoGuia?.nome_arquivo}
        rodape={<><button type="button" className={classeBotaoSecundario} disabled={apagando} onClick={() => setExcluindoGuia(null)}>Cancelar</button>
          <button type="button" className={classeBotaoPerigo} disabled={apagando} onClick={excluirGuia}>{apagando ? 'Excluindo...' : 'Excluir guia'}</button></>}>
        <p className="text-sm text-gray-700">A guia será apagada definitivamente. O imposto, o valor, o vencimento e o lançamento em Contas a pagar continuam como estão, e você pode enviar uma nova guia depois.</p>
        {erroExcluir && <p role="alert" className="mt-3 text-sm text-red-700">{erroExcluir}</p>}
      </Modal>
    </aside>
  );
}

function TabelaParcelamentos({ linhas, selecionado, aoSelecionar }: { linhas: ParcelamentoLinha[]; selecionado: string | null; aoSelecionar: (id: string) => void }) {
  return (
    <div className="overflow-x-auto -mx-3 sm:mx-0">
      <table className="w-full text-sm min-w-[60rem]">
        <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">{['Tributo', 'Órgão', 'Valor negociado', 'Parcelas', 'Pagas', 'Saldo restante', 'Próximo vencimento', 'Status', 'Ações'].map((h) => <th key={h} className="py-2 px-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {linhas.map((p) => (
            <tr key={p.id} data-testid={`parcelamento-${p.numero_acordo}`} onClick={() => aoSelecionar(p.id)} className={`border-b border-gray-50 cursor-pointer ${selecionado === p.id ? 'bg-orange-50/60' : 'hover:bg-gray-50'}`}>
              <td className="py-2.5 px-2 font-semibold text-gray-900">{p.tributo}<span className="block text-xs font-normal text-gray-500">Acordo {p.numero_acordo}</span></td>
              <td className="py-2.5 px-2 text-gray-600 max-w-[12rem]">{p.orgao}</td>
              <td className="py-2.5 px-2 whitespace-nowrap">{formatarMoeda(p.valor_negociado)}</td>
              <td className="py-2.5 px-2">{p.parcelas}</td>
              <td className="py-2.5 px-2">{p.pagas}/{p.parcelas}</td>
              <td className="py-2.5 px-2 whitespace-nowrap font-semibold">{formatarMoeda(p.saldo)}</td>
              <td className="py-2.5 px-2 whitespace-nowrap">{p.proximo_vencimento ? formatarData(p.proximo_vencimento) : '—'}{Number(p.atrasadas) > 0 && <span className="block text-xs text-red-700">{p.atrasadas} em atraso</span>}</td>
              <td className="py-2.5 px-2"><Selo tipo={SITUACAO_PARCELAMENTO[p.situacao].selo} texto={SITUACAO_PARCELAMENTO[p.situacao].rotulo} /></td>
              <td className="py-2.5 px-2"><button type="button" onClick={(e) => { e.stopPropagation(); aoSelecionar(p.id); }} className="min-h-9 px-2 rounded-lg border border-gray-200 text-xs font-semibold">{p.situacao === 'concluido' ? 'Ver histórico' : 'Ver parcelas'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PainelParcelas({ parc, parcelas, aoFechar, aoAbrir, aoCancelar, aoExcluir }: { parc: ParcelamentoLinha; parcelas: ImpostoLinha[]; aoFechar: () => void; aoAbrir: (id: string) => void; aoCancelar: () => void; aoExcluir: () => void }) {
  return (
    <aside aria-label="Parcelas" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 self-start min-w-0 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0"><p className="text-lg font-black text-gray-900">{parc.tributo}</p><p className="text-xs text-gray-500">{parc.orgao} · acordo {parc.numero_acordo}</p></div>
        <button type="button" aria-label="Fechar parcelas" onClick={aoFechar} className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"><X className="w-4 h-4" aria-hidden="true" /></button>
      </div>
      <p className="text-sm text-gray-700">{parc.pagas} de {parc.parcelas} pagas · saldo {formatarMoeda(parc.saldo)}</p>
      {parc.observacoes && <p className="text-xs text-gray-600">{parc.observacoes}</p>}
      <ul className="divide-y divide-gray-100 text-sm max-h-[28rem] overflow-y-auto" data-testid="lista-parcelas">
        {parcelas.map((x) => (
          <li key={x.id}><button type="button" onClick={() => aoAbrir(x.id)} className="w-full py-2 flex items-center gap-2 text-left hover:bg-gray-50 rounded" aria-label={`Parcela ${x.numero_parcela}`}>
            <span className="w-8 text-xs text-gray-500">{x.numero_parcela}ª</span>
            <span className="flex-1 min-w-0"><span className="block">{formatarData(x.vencimento)}</span><span className="block font-semibold">{formatarMoeda(x.valor)}</span></span>
            <Selo tipo={SITUACAO[x.situacao].selo} texto={SITUACAO[x.situacao].rotulo} />
            {x.guia_caminho && <FileText className="w-4 h-4 text-red-500" aria-label="Guia disponível" />}
          </button></li>
        ))}
      </ul>
      <p className="text-xs text-gray-500">Clique numa parcela para ver a guia, informar ou confirmar o pagamento.</p>
      {parc.situacao === 'em_andamento' && <button type="button" onClick={aoCancelar} className={`${classeBotaoSecundario} w-full !text-red-700`}><Ban className="w-4 h-4" aria-hidden="true" />Cancelar parcelamento</button>}
      {Number(parc.pagas) === 0
        ? <button type="button" onClick={aoExcluir} className={`${classeBotaoSecundario} w-full !text-red-700`}><Trash2 className="w-4 h-4" aria-hidden="true" />Excluir parcelamento</button>
        : <p className="text-xs text-gray-500">Para excluir o parcelamento, estorne antes os pagamentos das parcelas pagas no Financeiro.</p>}
    </aside>
  );
}

// ===== Formulários =====
type FormImposto = { tipo: string; nome: string; orgao: string; competencia: string; valor: string; vencimento: string; descricao: string };
type CampoForm = 'tipo' | 'competencia' | 'vencimento' | 'valor' | 'descricao';
const ROTULOS_FORM: Record<CampoForm, string> = { tipo: 'Tipo', competencia: 'Competência', vencimento: 'Vencimento', valor: 'Valor', descricao: 'Descrição' };
type Leitura = { estado: 'lendo' } | { estado: 'fim'; r: ResultadoDocumentoPdf; preenchidos: CampoForm[]; conflitos: { campo: CampoForm; valor: string }[]; bloqueio: string | null };
const mostrarCampoForm = (c: CampoForm, v: string) =>
  c === 'tipo' ? TIPOS_IMPOSTO[v as TipoImposto]?.rotulo ?? v : c === 'competencia' ? `${v.slice(5, 7)}/${v.slice(0, 4)}` : c === 'vencimento' ? formatarData(v) : c === 'valor' ? `R$ ${v}` : v;
const mostrarDas = (k: keyof DadosDas, v: DadosDas[keyof DadosDas]) =>
  k === 'cnpj' ? formatarCnpj(String(v)) : k === 'competencia' ? `${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : k === 'vencimento' ? formatarData(String(v))
    : typeof v === 'number' ? formatarMoeda(v) : String(v);

// Converte o DAS lido nos campos do formulário (só o que foi identificado; nada é inventado)
function camposDoDas(d: DadosDas): Partial<Record<CampoForm, string>> {
  const c: Partial<Record<CampoForm, string>> = { tipo: 'das' };
  if (d.competencia) c.competencia = d.competencia;
  if (d.vencimento) c.vencimento = d.vencimento;
  if (d.valorTotal !== undefined) c.valor = valorParaMascara(d.valorTotal);
  const partes = [d.numeroDocumento && `DAS nº ${d.numeroDocumento}`,
    (d.multa || d.juros) && d.principal !== undefined && `principal ${formatarMoeda(d.principal)} + multa ${formatarMoeda(d.multa ?? 0)} + juros ${formatarMoeda(d.juros ?? 0)}`].filter(Boolean);
  if (partes.length) c.descricao = partes.join(' · ').slice(0, 300);
  return c;
}

function ModalImposto({ idEmpresa, cnpjEmpresa, imposto, aoFechar, aoSalvar }: { idEmpresa: string; cnpjEmpresa?: string; imposto: ImpostoLinha | null; aoFechar: () => void; aoSalvar: (m: string) => void }) {
  const [f, setF] = useState<FormImposto>({ tipo: imposto && imposto.tipo !== 'parcelamento' ? imposto.tipo : '', nome: imposto?.nome ?? '', orgao: imposto?.orgao ?? '',
    competencia: imposto?.competencia?.slice(0, 7) ?? '', valor: imposto ? valorParaMascara(imposto.valor) : '', vencimento: imposto?.vencimento ?? '', descricao: imposto?.descricao ?? '' });
  const [guia, setGuia] = useState<File | null>(null);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [conferido, setConferido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fAtual = useRef(f);
  fAtual.current = f;
  const leituraAtual = useRef(0); // descarta resultado de um arquivo que já foi trocado
  const inicial = useRef(f);
  const autoPreenchido = useRef<Partial<FormImposto>>({}); // o que a última leitura preencheu (desfeito ao trocar de arquivo)
  const set = (k: keyof FormImposto, v: string) => setF((x) => {
    const n = { ...x, [k]: v };
    if (k === 'tipo' && v) { const t = TIPOS_IMPOSTO[v as TipoImposto]; if (!x.orgao || Object.values(TIPOS_IMPOSTO).some((y) => y.orgao === x.orgao)) n.orgao = t.orgao; if (!x.nome || Object.values(TIPOS_IMPOSTO).some((y) => y.rotulo === x.nome)) n.nome = v === 'outro' ? '' : t.rotulo; }
    return n;
  });

  // Ao escolher o PDF da guia: lê no navegador, preenche só campos VAZIOS e lista as divergências (nunca sobrescreve em silêncio)
  const escolherGuia = async (arquivo: File | null) => {
    setGuia(arquivo); setConferido(false); setErro(null);
    const anterior = autoPreenchido.current;
    autoPreenchido.current = {};
    const desfazer = (x: FormImposto) => ({ ...x, ...Object.fromEntries((Object.keys(anterior) as (keyof FormImposto)[]).filter((k) => x[k] === anterior[k]).map((k) => [k, inicial.current[k]])) });
    fAtual.current = desfazer(fAtual.current);
    setF(desfazer);
    const id = ++leituraAtual.current;
    if (!arquivo || arquivo.type !== 'application/pdf') return setLeitura(null);
    setLeitura({ estado: 'lendo' });
    const r = await lerDocumentoPdf(arquivo);
    if (id !== leituraAtual.current) return;
    if (r.status !== 'das') return setLeitura({ estado: 'fim', r, preenchidos: [], conflitos: [], bloqueio: null });
    const cnpjPdf = r.extracao.dados.cnpj;
    const cnpjEmp = (cnpjEmpresa ?? '').replace(/\D/g, '');
    const bloqueio = cnpjPdf && cnpjEmp.length === 14 && cnpjPdf !== cnpjEmp
      ? `O CNPJ da guia (${formatarCnpj(cnpjPdf)}) é diferente do CNPJ desta empresa (${formatarCnpj(cnpjEmp)}). Confira se a guia pertence a esta empresa: o cadastro está bloqueado.` : null;
    const atual = fAtual.current;
    const preenchidos: CampoForm[] = [];
    const conflitos: { campo: CampoForm; valor: string }[] = [];
    const novos = camposDoDas(r.extracao.dados);
    for (const [campo, valor] of Object.entries(novos) as [CampoForm, string][]) {
      if (!atual[campo]) preenchidos.push(campo);
      else if (atual[campo] !== valor) conflitos.push({ campo, valor });
    }
    if (preenchidos.includes('tipo')) set('tipo', 'das');
    setF((x) => ({ ...x, ...Object.fromEntries(preenchidos.filter((c) => c !== 'tipo').map((c) => [c, novos[c]!])) }));
    autoPreenchido.current = Object.fromEntries(preenchidos.map((c) => [c, novos[c]!]));
    setLeitura({ estado: 'fim', r, preenchidos, conflitos, bloqueio });
  };
  const usarDoPdf = (campo: CampoForm, valor: string) => {
    if (campo === 'tipo') set('tipo', valor); else setF((x) => ({ ...x, [campo]: valor }));
    setLeitura((l) => (l?.estado === 'fim' ? { ...l, preenchidos: [...l.preenchidos, campo], conflitos: l.conflitos.filter((c) => c.campo !== campo) } : l));
  };
  const lidoDoPdf = leitura?.estado === 'fim' && leitura.r.status === 'das';

  const salvar = async () => {
    if (leitura?.estado === 'lendo') return setErro('Aguarde a leitura do PDF.');
    if (leitura?.estado === 'fim' && leitura.bloqueio) return setErro(leitura.bloqueio);
    if (!f.tipo) return setErro('Escolha o tipo do imposto.');
    if (f.nome.trim().length < 2 || f.orgao.trim().length < 2) return setErro('Informe o nome e o órgão.');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(f.competencia)) return setErro('Informe a competência.');
    if (!paraDecimal(f.valor)) return setErro('Informe o valor.');
    if (!f.vencimento) return setErro('Informe o vencimento.');
    if (guia && (!ARQUIVOS_IMPOSTO[guia.type] || guia.size > TAMANHO_MAXIMO_ARQUIVO_IMPOSTO)) return setErro('Guia: PDF, JPG ou PNG até 10 MB.');
    if (lidoDoPdf && !conferido) return setErro('Confirme que conferiu os dados lidos do PDF antes de salvar.');
    setOcupado(true); setErro(null);
    const { data, error } = await createClient().rpc('salvar_imposto', { p_id: imposto?.id ?? null, p_id_empresa: idEmpresa, p_tipo: f.tipo, p_nome: f.nome, p_orgao: f.orgao,
      p_competencia: `${f.competencia}-01`, p_vencimento: f.vencimento, p_valor: paraDecimal(f.valor), p_descricao: f.descricao || null });
    if (error) { setOcupado(false); return setErro(mensagemDeErro(error, 'Não foi possível salvar o imposto.')); }
    const falhaGuia = guia ? await enviarArquivo(idEmpresa, data as string, 'guia', guia) : null;
    setOcupado(false);
    aoSalvar(`${imposto ? 'Imposto atualizado (a conta a pagar acompanhou).' : 'Imposto cadastrado e lançado em Contas a pagar.'}${falhaGuia ? ` A guia não foi enviada: ${falhaGuia}` : guia ? ' Guia enviada.' : ''}`);
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={imposto ? 'Editar imposto' : 'Novo imposto'}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button><button type="button" className={classeBotaoPrimario} disabled={ocupado || leitura?.estado === 'lendo' || (leitura?.estado === 'fim' && !!leitura.bloqueio)} onClick={salvar}>{ocupado ? 'Salvando...' : 'Salvar'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        {!imposto && (
          <div><label htmlFor="imp-guia" className={rotulo}>Guia (PDF, opcional)</label>
            <input id="imp-guia" type="file" accept="application/pdf,image/jpeg,image/png" aria-describedby="imp-guia-ajuda" onChange={(e) => escolherGuia(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:min-h-11 file:px-3 file:rounded-lg file:border-0 file:bg-gray-100 file:font-semibold" />
            <p id="imp-guia-ajuda" className="mt-1 text-xs text-gray-500">Envie o PDF do DAS: os dados são lidos no seu navegador e preenchem o formulário para você conferir.</p>
            <ResultadoLeituraGuia leitura={leitura} conferido={conferido} aoConferir={setConferido} aoUsar={usarDoPdf} />
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="imp-tipo" className={rotulo}>Tipo</label><select id="imp-tipo" value={f.tipo} onChange={(e) => set('tipo', e.target.value)} className={campo}><option value="">Selecione</option>{Object.entries(TIPOS_IMPOSTO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select></div>
          <div><label htmlFor="imp-nome" className={rotulo}>Nome</label><input id="imp-nome" maxLength={120} value={f.nome} onChange={(e) => set('nome', e.target.value)} className={campo} /></div>
          <div><label htmlFor="imp-orgao" className={rotulo}>Órgão</label><input id="imp-orgao" maxLength={120} value={f.orgao} onChange={(e) => set('orgao', e.target.value)} className={campo} /></div>
          <div><label htmlFor="imp-comp" className={rotulo}>Competência</label><input id="imp-comp" type="month" value={f.competencia} onChange={(e) => set('competencia', e.target.value)} className={campo} /></div>
          <div><label htmlFor="imp-venc" className={rotulo}>Vencimento</label><input id="imp-venc" type="date" value={f.vencimento} onChange={(e) => set('vencimento', e.target.value)} className={campo} /></div>
          <div><label htmlFor="imp-valor" className={rotulo}>Valor (R$)</label><input id="imp-valor" inputMode="numeric" placeholder="0,00" value={f.valor} onChange={(e) => set('valor', mascaraMoeda(e.target.value))} className={campo} /></div>
          <div className="sm:col-span-2"><label htmlFor="imp-desc" className={rotulo}>Descrição (opcional)</label><input id="imp-desc" maxLength={300} value={f.descricao} onChange={(e) => set('descricao', e.target.value)} className={campo} /></div>
        </div>
        <p className="text-xs text-gray-500">O imposto entra em Contas a pagar da empresa (um lançamento por imposto) só quando você salva. Valor e vencimento só mudam por aqui.</p>
      </div>
    </Modal>
  );
}

function ResultadoLeituraGuia({ leitura, conferido, aoConferir, aoUsar }: {
  leitura: Leitura | null; conferido: boolean; aoConferir: (v: boolean) => void; aoUsar: (campo: CampoForm, valor: string) => void;
}) {
  if (!leitura) return null;
  if (leitura.estado === 'lendo') return <p role="status" className="mt-2 text-sm text-gray-600 inline-flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />Lendo o PDF...</p>;
  const { r } = leitura;
  const caixa = 'mt-2 rounded-xl border px-3 py-2.5 text-sm';
  if (r.status === 'erro') return <p role="status" data-testid="leitura-pdf" className={`${caixa} border-amber-200 bg-amber-50 text-amber-900`}>{r.mensagem}</p>;
  if (r.status === 'nao_reconhecido') return <p role="status" data-testid="leitura-pdf" className={`${caixa} border-amber-200 bg-amber-50 text-amber-900`}>Não reconhecemos este PDF como um DAS. Preencha os campos manualmente.</p>;
  if (r.status === 'certidao_federal') return <p role="status" data-testid="leitura-pdf" className={`${caixa} border-amber-200 bg-amber-50 text-amber-900`}>Este PDF é uma Certidão Federal, não uma guia de imposto. Nada foi preenchido.</p>;
  const { dados, faltando, alertas } = r.extracao;
  const lidos = (Object.keys(CAMPOS_DAS) as (keyof DadosDas)[]).filter((k) => dados[k] !== undefined);
  return (
    <div data-testid="leitura-pdf" className={`${caixa} space-y-2 ${leitura.bloqueio ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
      <p className="font-semibold text-gray-900 inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-green-600" aria-hidden="true" />Documento identificado: DAS – Simples Nacional</p>
      {leitura.bloqueio && <p role="alert" className="text-red-800 font-semibold">{leitura.bloqueio}</p>}
      {lidos.length > 0 && <dl className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        {lidos.map((k) => <div key={k} className="flex gap-1 min-w-0"><dt className="text-gray-500 shrink-0">{CAMPOS_DAS[k]}:</dt><dd className="font-medium text-gray-900 truncate">{mostrarDas(k, dados[k])}</dd></div>)}
      </dl>}
      {leitura.preenchidos.length > 0 && <p className="text-xs text-gray-700">Preenchido automaticamente: {leitura.preenchidos.map((c) => ROTULOS_FORM[c]).join(', ')}.</p>}
      {faltando.length > 0 && <p className="text-xs text-gray-700" data-testid="nao-identificados">Não identificado no PDF: {faltando.map((k) => CAMPOS_DAS[k]).join(', ')}.</p>}
      {leitura.conflitos.map((c) => (
        <p key={c.campo} className="text-xs text-amber-900 flex flex-wrap items-center gap-2">
          <span>{ROTULOS_FORM[c.campo]}: você informou um valor diferente; o PDF indica <strong>{mostrarCampoForm(c.campo, c.valor)}</strong>.</span>
          <button type="button" onClick={() => aoUsar(c.campo, c.valor)} className="min-h-8 px-2 rounded-md border border-amber-300 bg-white font-semibold hover:bg-amber-100">Usar do PDF</button>
        </p>
      ))}
      {alertas.map((a) => <p key={a} className="text-xs text-amber-900">{a}</p>)}
      {!leitura.bloqueio && (
        <label className="flex items-start gap-2 text-sm text-gray-900 cursor-pointer">
          <input type="checkbox" checked={conferido} onChange={(e) => aoConferir(e.target.checked)} className="mt-0.5 w-4 h-4 accent-orange-600" />
          Conferi os dados lidos do PDF
        </label>
      )}
    </div>
  );
}

function ModalInformar({ imposto, hoje, aoFechar, aoSalvar }: { imposto: ImpostoLinha; hoje: string; aoFechar: () => void; aoSalvar: (m: string) => void }) {
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState(valorParaMascara(imposto.valor));
  const [erro, setErro] = useState<string | null>(null);
  const salvar = async () => {
    if (!data || data > hoje) return setErro('A data do pagamento não pode ser futura.');
    if (!paraDecimal(valor)) return setErro('Informe o valor pago.');
    const { error } = await createClient().rpc('informar_pagamento_imposto', { p_id: imposto.id, p_data: data, p_valor: paraDecimal(valor) });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível registrar a informação.'));
    aoSalvar('Pagamento informado. Ele só conta como pago depois da confirmação (baixa no Financeiro).');
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Registrar informação de pagamento — ${imposto.nome}`}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button><button type="button" className={classeBotaoPrimario} onClick={salvar}>Registrar informação</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <p className="text-sm text-gray-600">Informar o pagamento <strong>não</strong> é a confirmação bancária: o imposto fica como &quot;Pagamento informado&quot; até a baixa em Contas a pagar. Anexe o comprovante no painel.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="inf-data" className={rotulo}>Data do pagamento</label><input id="inf-data" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} className={campo} /></div>
          <div><label htmlFor="inf-valor" className={rotulo}>Valor pago (R$)</label><input id="inf-valor" inputMode="numeric" value={valor} onChange={(e) => setValor(mascaraMoeda(e.target.value))} className={campo} /></div>
        </div>
      </div>
    </Modal>
  );
}

function ModalConfirmar({ imposto, contas, hoje, aoFechar, aoSalvar }: { imposto: ImpostoLinha; contas: ContaFinanceira[]; hoje: string; aoFechar: () => void; aoSalvar: (m: string) => void }) {
  const [data, setData] = useState(imposto.data_pagamento_informada ?? hoje);
  const [conta, setConta] = useState(contas.find((c) => c.principal && !c.arquivada_em)?.id ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const salvar = async () => {
    if (!conta) return setErro('Escolha a conta usada no pagamento.');
    if (!data || data > hoje) return setErro('A data não pode ser futura.');
    const { error } = await createClient().rpc('confirmar_pagamento_imposto', { p_id: imposto.id, p_data: data, p_id_conta: conta });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível confirmar o pagamento.'));
    aoSalvar('Pagamento confirmado: baixa feita em Contas a pagar.');
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Confirmar pagamento — ${imposto.nome}`}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button><button type="button" className={classeBotaoPrimario} onClick={salvar}>Confirmar pagamento</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <p className="text-sm text-gray-600">Faz a baixa de <strong>{formatarMoeda(imposto.valor)}</strong> em Contas a pagar, saindo da conta escolhida (mesma baixa do Financeiro).</p>
        <div><label htmlFor="conf-data" className={rotulo}>Data do pagamento</label><input id="conf-data" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} className={campo} /></div>
        <SeletorConta id="conf-conta" rotulo="Conta usada no pagamento" contas={contas} idConta={conta} aoMudar={setConta} valor={String(imposto.valor)} natureza="saida" />
      </div>
    </Modal>
  );
}

function ModalParcelamento({ idEmpresa, hoje, aoFechar, aoSalvar }: { idEmpresa: string; hoje: string; aoFechar: () => void; aoSalvar: (m: string) => void }) {
  const [f, setF] = useState({ tributo: '', orgao: '', acordo: '', valor: '', qtd: '', primeiro: '', obs: '' });
  const [parcelas, setParcelas] = useState<{ vencimento: string; valor: string }[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const total = Number(paraDecimal(f.valor) ?? 0);
  const gerar = () => {
    const n = Number(f.qtd);
    if (!(n >= 1 && n <= 120) || !total || !f.primeiro) return setErro('Para gerar as parcelas, informe valor negociado, quantidade (1 a 120) e primeiro vencimento.');
    setParcelas(gerarParcelas(total, n, f.primeiro).map((p) => ({ vencimento: p.vencimento, valor: valorParaMascara(p.valor) }))); setErro(null);
  };
  const soma = parcelas.reduce((s, p) => s + Number(paraDecimal(p.valor) ?? 0), 0);
  const salvar = async () => {
    if (f.tributo.trim().length < 2 || f.orgao.trim().length < 2) return setErro('Informe o tributo e o órgão.');
    if (!f.acordo.trim()) return setErro('Informe o número do acordo.');
    if (!total) return setErro('Informe o valor negociado.');
    if (!parcelas.length) return setErro('Gere e confira as parcelas.');
    const ruim = parcelas.findIndex((p) => !p.vencimento || !paraDecimal(p.valor));
    if (ruim >= 0) return setErro(`Parcela ${ruim + 1}: informe vencimento e valor.`);
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('salvar_parcelamento_tributario', { p_id_empresa: idEmpresa, p_tributo: f.tributo, p_orgao: f.orgao, p_numero_acordo: f.acordo,
      p_valor_negociado: paraDecimal(f.valor), p_observacoes: f.obs || null, p_parcelas: parcelas.map((p) => ({ vencimento: p.vencimento, valor: Number(paraDecimal(p.valor)) })) });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar o parcelamento.'));
    aoSalvar(`Parcelamento cadastrado: ${parcelas.length} parcelas lançadas em Contas a pagar.`);
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo="Novo parcelamento" tamanho="lg"
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button><button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando...' : 'Salvar parcelamento'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="par-tributo" className={rotulo}>Tributo</label><input id="par-tributo" maxLength={120} value={f.tributo} onChange={(e) => set('tributo', e.target.value)} className={campo} placeholder="Ex.: Simples Nacional" /></div>
          <div><label htmlFor="par-orgao" className={rotulo}>Órgão</label><input id="par-orgao" maxLength={120} value={f.orgao} onChange={(e) => set('orgao', e.target.value)} className={campo} /></div>
          <div><label htmlFor="par-acordo" className={rotulo}>Número do acordo</label><input id="par-acordo" maxLength={60} value={f.acordo} onChange={(e) => set('acordo', e.target.value)} className={campo} /></div>
          <div><label htmlFor="par-valor" className={rotulo}>Valor negociado (R$)</label><input id="par-valor" inputMode="numeric" placeholder="0,00" value={f.valor} onChange={(e) => set('valor', mascaraMoeda(e.target.value))} className={campo} /></div>
          <div><label htmlFor="par-qtd" className={rotulo}>Quantidade de parcelas</label><input id="par-qtd" inputMode="numeric" value={f.qtd} onChange={(e) => set('qtd', e.target.value.replace(/\D/g, '').slice(0, 3))} className={campo} /></div>
          <div><label htmlFor="par-primeiro" className={rotulo}>Primeiro vencimento</label><input id="par-primeiro" type="date" min={hoje} value={f.primeiro} onChange={(e) => set('primeiro', e.target.value)} className={campo} /></div>
          <div className="sm:col-span-2"><label htmlFor="par-obs" className={rotulo}>Observações (opcional)</label><input id="par-obs" maxLength={500} value={f.obs} onChange={(e) => set('obs', e.target.value)} className={campo} /></div>
        </div>
        <button type="button" className={classeBotaoSecundario} onClick={gerar}>Gerar parcelas</button>
        {parcelas.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-900">Parcelas previstas <span className="font-normal text-gray-500">(ajuste vencimentos e valores se forem diferentes)</span></p>
            <ul className="max-h-64 overflow-y-auto space-y-1" data-testid="parcelas-previstas">
              {parcelas.map((p, i) => (
                <li key={i} className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 items-center text-sm">
                  <span className="text-gray-500">{i + 1}ª</span>
                  <input type="date" aria-label={`Vencimento da parcela ${i + 1}`} value={p.vencimento} onChange={(e) => setParcelas((xs) => xs.map((x, j) => (j === i ? { ...x, vencimento: e.target.value } : x)))} className={campo} />
                  <input inputMode="numeric" aria-label={`Valor da parcela ${i + 1}`} value={p.valor} onChange={(e) => setParcelas((xs) => xs.map((x, j) => (j === i ? { ...x, valor: mascaraMoeda(e.target.value) } : x)))} className={campo} />
                </li>
              ))}
            </ul>
            <p className={`text-xs ${Math.abs(soma - total) > 0.004 ? 'text-amber-800' : 'text-gray-600'}`} data-testid="soma-parcelas">
              Soma das parcelas: {formatarMoeda(soma)}{Math.abs(soma - total) > 0.004 ? ` — diferente do valor negociado (${formatarMoeda(total)}); confira se há juros/correção.` : ' (confere com o valor negociado).'}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Confirmação de exclusão (sem motivo): o banco confere a permissão e a situação; erro volta como mensagem
function ModalExcluir({ titulo, texto, botao, aoFechar, aoConfirmar }: { titulo: string; texto: string; botao: string; aoFechar: () => void; aoConfirmar: () => Promise<string | null> }) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const confirmar = async () => {
    if (ocupado) return;
    setOcupado(true); setErro(null);
    const e = await aoConfirmar();
    if (e) { setErro(e); setOcupado(false); }
  };
  return (
    <Modal aberto aoFechar={() => { if (!ocupado) aoFechar(); }} titulo={titulo}
      rodape={<><button type="button" className={classeBotaoSecundario} disabled={ocupado} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPerigo} disabled={ocupado} onClick={confirmar}>{ocupado ? 'Excluindo...' : botao}</button></>}>
      <p className="text-sm text-gray-700">{texto}</p>
      {erro && <p role="alert" className="mt-3 text-sm text-red-700">{erro}</p>}
    </Modal>
  );
}

function ModalMotivo({ titulo, texto, aoFechar, aoConfirmar }: { titulo: string; texto: string; aoFechar: () => void; aoConfirmar: (motivo: string) => Promise<string | null> }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  return (
    <Modal aberto aoFechar={aoFechar} titulo={titulo}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Voltar</button>
        <button type="button" className={classeBotaoPerigo} disabled={ocupado} onClick={async () => { if (motivo.trim().length < 3) return setErro('Informe o motivo.'); setOcupado(true); const e = await aoConfirmar(motivo); setOcupado(false); if (e) setErro(e); }}>Cancelar</button></>}>
      <div className="space-y-4"><Erro texto={erro} /><p className="text-sm text-gray-600">{texto}</p>
        <div><label htmlFor="motivo-imp" className={rotulo}>Motivo</label><input id="motivo-imp" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} /></div></div>
    </Modal>
  );
}

