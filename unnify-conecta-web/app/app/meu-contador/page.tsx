'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ClipboardList, FileText, History, Mail, MessageCircle, MoreHorizontal, Phone, UsersRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { FUNCOES, PERMISSOES, formatarTelefone, iniciaisDe, mensagemDeErro, type Funcao, type Permissao } from '@/lib/contabil';
import { Selo } from '@/components/admin/tabela';
import { Modal, classeBotaoSecundario } from '@/components/ui/Modal';
import { Indicador } from '@/components/financeiro/Indicador';
import { Abas, CabecalhoPagina, useAvisoEVersao } from '@/components/documentos/PaginaComAviso';
import { Solicitacoes } from '@/components/documentos/Solicitacoes';
import { BibliotecaDocumentos } from '@/components/documentos/BibliotecaDocumentos';
import { ModuloObrigacoes } from '@/components/obrigacoes/ModuloObrigacoes';
import { GestaoVinculos } from '@/components/meu-contador/GestaoVinculos';

interface VinculoAtivo {
  id: string;
  funcao: Funcao;
  permissoes: Permissao[];
  aprovado_em: string | null;
  contador_nome: string | null;
  contador_email: string | null;
  escritorio_nome: string | null;
  nome_profissional: string | null;
  crc: string | null;
  cidade: string | null;
  estado: string | null;
  especialidades: string[] | null;
  email_comercial: string | null;
  telefone_comercial: string | null;
}
interface Resumo { documentos_solicitados: number; obrigacoes_pendentes: number; aguardando_resposta: number; itens_concluidos: number; aguardando_contador: number }
type Evento = { quando: string; tipo: string; descricao: string; autor: string };
type Aba = 'solicitacoes' | 'obrigacoes' | 'documentos' | 'permissoes' | 'historico';
type Estado<T> = { carregando: true } | { carregando: false; erro: string } | { carregando: false; dados: T };

const nomeEscritorio = (v: VinculoAtivo) => v.escritorio_nome || v.nome_profissional || v.contador_nome || 'Contador';
const ROTULO_EVENTO: Record<string, string> = { vinculo: 'Vínculo', solicitacao: 'Solicitação', documento: 'Documento', obrigacao: 'Obrigação' };

export default function MeuContadorPage() {
  const { empresa, usuario } = useEmpresaAtual();
  const { aviso, setAviso, versao, alterado, recarregar } = useAvisoEVersao();
  const [vinculo, setVinculo] = useState<Estado<VinculoAtivo | null>>({ carregando: true });
  const [resumo, setResumo] = useState<Estado<Resumo>>({ carregando: true });
  const [aba, setAba] = useState<Aba>('solicitacoes');
  const [perfil, setPerfil] = useState(false);

  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (['solicitacoes', 'obrigacoes', 'documentos', 'permissoes', 'historico'].includes(h)) setAba(h as Aba);
  }, []);

  const carregar = useCallback(() => {
    if (!empresa) return;
    const supabase = createClient();
    supabase.rpc('vinculos_da_empresa', { p_id_empresa: empresa.id, p_status: 'ativo' }).then(({ data, error }) => {
      if (error) return setVinculo({ carregando: false, erro: mensagemDeErro(error, 'Não foi possível carregar o seu contador.') });
      const ativos = (data ?? []) as VinculoAtivo[];
      setVinculo({ carregando: false, dados: ativos.find((v) => v.funcao === 'principal') ?? ativos[0] ?? null });
    });
    supabase.rpc('resumo_relacionamento_contabil', { p_id_empresa: empresa.id }).then(({ data, error }) => {
      setResumo(error || !data ? { carregando: false, erro: 'Indisponível' } : { carregando: false, dados: data as Resumo });
    });
  }, [empresa]);

  useEffect(() => { carregar(); }, [carregar, versao]);

  if (!empresa || !usuario) return null;
  const mudar = (a: Aba) => { setAba(a); window.history.replaceState(null, '', `#${a}`); };
  const v = !vinculo.carregando && 'dados' in vinculo ? vinculo.dados : null;
  const semVinculo = !vinculo.carregando && 'dados' in vinculo && !vinculo.dados;
  const valor = (campo: keyof Resumo) => (resumo.carregando ? '…' : 'erro' in resumo ? 'Indisponível' : String(resumo.dados[campo]));

  return (
    <div className="space-y-5 min-w-0">
      <CabecalhoPagina titulo="Meu Contador" subtitulo="Gerencie seu relacionamento contábil." aviso={aviso} aoFecharAviso={() => setAviso(null)} />

      {vinculo.carregando ? (
        <div role="status" aria-label="Carregando" className="h-44 rounded-2xl bg-white border border-gray-200 animate-pulse" />
      ) : 'erro' in vinculo ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between gap-3">
          {vinculo.erro}
          <button type="button" className={classeBotaoSecundario} onClick={carregar}>Tentar novamente</button>
        </div>
      ) : semVinculo ? (
        // Sem vínculo ativo: a gestão de vínculos mostra o convite ("Buscar contador") e os pedidos pendentes
        <GestaoVinculos aoAlterar={recarregar} />
      ) : v && (
        <>
          <section aria-label="Seu escritório contábil" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <span className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-full bg-slate-800 text-white text-xl sm:text-2xl font-black inline-flex items-center justify-center" aria-hidden="true">
                {iniciaisDe(nomeEscritorio(v)) || 'C'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-black text-gray-900 break-words">{nomeEscritorio(v)}</h2>
                  <Selo tipo="sucesso" texto="Vínculo ativo" />
                </div>
                {v.contador_nome && <p className="text-sm text-gray-700">Responsável: {v.contador_nome} (Contador)</p>}
                {v.crc && <p className="text-sm text-gray-700">CRC: {v.crc}</p>}
                {(v.email_comercial || v.contador_email) && (
                  <p className="text-sm text-gray-700 inline-flex items-center gap-1.5 break-all"><Mail className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />{v.email_comercial || v.contador_email}</p>
                )}
                {v.telefone_comercial && (
                  <p className="text-sm text-gray-700 flex items-center gap-1.5"><Phone className="w-4 h-4 text-gray-400" aria-hidden="true" />{formatarTelefone(v.telefone_comercial)}</p>
                )}
              </div>
              <button type="button" onClick={() => setPerfil(true)} className={`${classeBotaoSecundario} self-start`}>
                <MoreHorizontal className="w-4 h-4" aria-hidden="true" />Ver perfil completo
              </button>
            </div>
            <div className="grid gap-3 grid-cols-1 min-[360px]:grid-cols-2 xl:grid-cols-4">
              <Indicador titulo="Documentos solicitados" valor={valor('documentos_solicitados')} icone={FileText} cor="bg-orange-100 text-orange-600" destaque={'erro' in resumo ? 'text-gray-400' : undefined} />
              <Indicador titulo="Obrigações pendentes" valor={valor('obrigacoes_pendentes')} icone={ClipboardList} cor="bg-red-100 text-red-600" destaque={'erro' in resumo ? 'text-gray-400' : undefined} />
              <Indicador titulo="Aguardando resposta" valor={valor('aguardando_resposta')} icone={MessageCircle} cor="bg-blue-100 text-blue-600" destaque={'erro' in resumo ? 'text-gray-400' : undefined}
                detalhe={!resumo.carregando && 'dados' in resumo ? 'suas, para enviar' : undefined} />
              <Indicador titulo="Itens concluídos" valor={valor('itens_concluidos')} icone={CheckCircle2} cor="bg-green-100 text-green-600" destaque={'erro' in resumo ? 'text-gray-400' : undefined} />
            </div>
          </section>

          <Abas rotulo="Relacionamento com o contador" atual={aba} aoMudar={mudar} abas={[
            { id: 'solicitacoes', titulo: 'Solicitações', contador: !resumo.carregando && 'dados' in resumo ? resumo.dados.aguardando_resposta : 0 },
            { id: 'obrigacoes', titulo: 'Obrigações' },
            { id: 'documentos', titulo: 'Documentos' },
            { id: 'permissoes', titulo: 'Permissões' },
            { id: 'historico', titulo: 'Histórico' },
          ]} />

          {aba === 'solicitacoes' && <Solicitacoes idEmpresa={empresa.id} papel="empresa" versao={versao} aoAlterar={alterado} />}
          {aba === 'obrigacoes' && (
            <div className="space-y-3">
              <div className="flex justify-end"><Link href="/app/obrigacoes" className="min-h-11 inline-flex items-center text-sm font-semibold text-orange-600 hover:underline">Abrir o módulo de Obrigações →</Link></div>
              <ModuloObrigacoes idEmpresa={empresa.id} papel="empresa" versao={versao} aoAlterar={alterado} compacto />
            </div>
          )}
          {aba === 'documentos' && <BibliotecaDocumentos idEmpresa={empresa.id} papel="empresa" podeEnviar idUsuario={usuario.id} versao={versao} aoAlterar={alterado} somenteCompartilhados />}
          {aba === 'permissoes' && <GestaoVinculos aoAlterar={recarregar} />}
          {aba === 'historico' && <HistoricoRelacionamento idEmpresa={empresa.id} versao={versao} />}

          <Modal aberto={perfil} aoFechar={() => setPerfil(false)} titulo={nomeEscritorio(v)} descricao="Dados do contador vinculado à sua empresa.">
            <dl className="space-y-2 text-sm">
              {[
                ['Responsável', v.contador_nome], ['Nome profissional', v.nome_profissional], ['CRC', v.crc],
                ['Cidade/UF', [v.cidade, v.estado].filter(Boolean).join(' - ')], ['E-mail', v.email_comercial || v.contador_email],
                ['Telefone', v.telefone_comercial && formatarTelefone(v.telefone_comercial)], ['Função', FUNCOES[v.funcao]],
                ['Vínculo desde', v.aprovado_em && new Date(v.aprovado_em).toLocaleDateString('pt-BR')],
                ['Especialidades', (v.especialidades ?? []).join(', ')], ['Permissões concedidas', v.permissoes.map((p) => PERMISSOES[p] ?? p).join(', ') || 'Nenhuma'],
              ].filter(([, x]) => x).map(([r, x]) => (
                <div key={r as string} className="grid grid-cols-[8.5rem_1fr] gap-2"><dt className="text-gray-500">{r}</dt><dd className="text-gray-900 break-words">{x}</dd></div>
              ))}
            </dl>
          </Modal>
        </>
      )}
    </div>
  );
}

function HistoricoRelacionamento({ idEmpresa, versao }: { idEmpresa: string; versao: number }) {
  const [estado, setEstado] = useState<Estado<Evento[]>>({ carregando: true });
  useEffect(() => {
    setEstado({ carregando: true });
    createClient().rpc('historico_relacionamento_contabil', { p_id_empresa: idEmpresa, p_limite: 100 }).then(({ data, error }) => {
      setEstado(error ? { carregando: false, erro: mensagemDeErro(error, 'Não foi possível carregar o histórico.') } : { carregando: false, dados: (data ?? []) as Evento[] });
    });
  }, [idEmpresa, versao]);
  return (
    <section aria-label="Histórico do relacionamento" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
      <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><History className="w-5 h-5 text-orange-600" aria-hidden="true" />Histórico de atividades</h2>
      {estado.carregando ? <div role="status" aria-label="Carregando" className="h-24 rounded-xl bg-gray-50 animate-pulse" />
        : 'erro' in estado ? <p role="alert" className="text-sm text-red-700">{estado.erro}</p>
        : estado.dados.length === 0 ? <p className="text-sm text-gray-500 py-6 text-center">Nenhuma atividade registrada ainda.</p>
        : (
          <ol className="border-l-2 border-orange-200 pl-4 space-y-3">
            {estado.dados.map((e, i) => (
              <li key={i} className="text-sm" data-testid="evento-historico">
                <p className="text-gray-900 break-words"><span className="text-xs font-semibold uppercase text-orange-700 mr-2">{ROTULO_EVENTO[e.tipo] ?? e.tipo}</span>{e.descricao}</p>
                <p className="text-xs text-gray-500 inline-flex items-center gap-1"><UsersRound className="w-3 h-3" aria-hidden="true" />{e.autor} · {new Date(e.quando).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</p>
              </li>
            ))}
          </ol>
        )}
    </section>
  );
}
