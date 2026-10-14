'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, ShieldCheck, Clock3, BadgeCheck, Mail, Phone, MapPin, UserPlus, History } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { FotoPerfil } from '@/components/contabil/FotoPerfil';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { Selo, type TipoSelo } from '@/components/admin/tabela';
import { ListaConvites } from '@/components/convites/ListaConvites';
import { dispararNotificacoes } from '@/lib/convites';
import {
  FUNCOES,
  PERMISSOES,
  STATUS_VINCULO,
  formatarTelefone,
  mensagemDeErro,
  type Funcao,
  type Permissao,
  type StatusVinculo,
} from '@/lib/contabil';

interface Vinculo {
  id: string;
  funcao: Funcao;
  status: StatusVinculo;
  permissoes: Permissao[];
  origem: 'empresa' | 'contador' | 'escritorio';
  criado_em: string;
  aprovado_em: string | null;
  encerrado_em: string | null;
  motivo_encerramento: string | null;
  id_contador: string | null;
  contador_nome: string | null;
  id_escritorio: string | null;
  escritorio_nome: string | null;
  nome_profissional: string | null;
  crc: string | null;
  cidade: string | null;
  estado: string | null;
  especialidades: string[] | null;
  foto_caminho: string | null;
  email_comercial: string | null;
  telefone_comercial: string | null;
}

const SELO_STATUS: Record<StatusVinculo, TipoSelo> = {
  ativo: 'sucesso',
  pendente: 'alerta',
  recusado: 'perigo',
  encerrado: 'neutro',
};

const nomeDe = (v: Vinculo) => v.nome_profissional || v.contador_nome || v.escritorio_nome || 'Contador';
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

function Chips({ itens }: { itens: string[] }) {
  if (!itens.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Lista">
      {itens.map((t) => (
        <li key={t} className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
          {t}
        </li>
      ))}
    </ul>
  );
}

function Contatos({ v }: { v: Vinculo }) {
  if (!v.email_comercial && !v.telefone_comercial) {
    return <p className="text-xs text-gray-500">Contatos comerciais não compartilhados.</p>;
  }
  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-x-5 gap-y-1">
      {v.telefone_comercial && (
        <a href={`tel:${v.telefone_comercial}`} className="inline-flex items-center gap-2 min-h-9 text-sm text-gray-800 hover:text-orange-600">
          <Phone className="w-4 h-4 text-orange-500" aria-hidden="true" />
          {formatarTelefone(v.telefone_comercial)}
        </a>
      )}
      {v.email_comercial && (
        <a href={`mailto:${v.email_comercial}`} className="inline-flex items-center gap-2 min-h-9 text-sm text-gray-800 hover:text-orange-600 break-all">
          <Mail className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
          {v.email_comercial}
        </a>
      )}
    </div>
  );
}

function CartaoVinculo({
  v,
  destaque = false,
  aoGerenciar,
  aoEncerrar,
}: {
  v: Vinculo;
  destaque?: boolean;
  aoGerenciar: (v: Vinculo) => void;
  aoEncerrar: (v: Vinculo) => void;
}) {
  const nome = nomeDe(v);
  return (
    <article
      className={`bg-white rounded-2xl border shadow-sm p-4 sm:p-6 ${destaque ? 'border-orange-200 ring-1 ring-orange-100' : 'border-gray-200'}`}
      aria-label={`${FUNCOES[v.funcao]}: ${nome}`}
    >
      <div className="flex flex-col sm:flex-row gap-4">
        <FotoPerfil
          caminho={v.foto_caminho}
          nome={nome}
          escritorio={!v.id_contador}
          className={destaque ? 'w-20 h-20 sm:w-24 sm:h-24 text-2xl' : 'w-14 h-14 text-lg'}
          arredondado={destaque ? 'rounded-2xl' : 'rounded-full'}
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Selo tipo={v.funcao === 'principal' ? 'alerta' : 'info'} texto={FUNCOES[v.funcao]} />
            <Selo tipo={SELO_STATUS[v.status]} texto={STATUS_VINCULO[v.status]} />
          </div>
          <h3 className={`${destaque ? 'text-xl' : 'text-base'} font-bold text-gray-900 break-words`}>{nome}</h3>
          <p className="text-sm text-gray-600">
            {[v.crc ? `CRC ${v.crc}` : null, v.escritorio_nome && v.id_contador ? `Escritório ${v.escritorio_nome}` : null]
              .filter(Boolean)
              .join(' · ') || 'Contador vinculado'}
          </p>
          {(v.cidade || v.estado) && (
            <p className="flex items-center gap-1.5 text-sm text-gray-600">
              <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />
              {[v.cidade, v.estado].filter(Boolean).join('/')}
            </p>
          )}
          {destaque && <Chips itens={v.especialidades ?? []} />}
          <Contatos v={v} />
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">Permissões concedidas</p>
            <Chips itens={v.permissoes.map((p) => PERMISSOES[p] ?? p)} />
          </div>
          <p className="text-xs text-gray-500">Vinculado desde {data(v.aprovado_em)}</p>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" className={classeBotaoSecundario} onClick={() => aoEncerrar(v)}>
          Encerrar vínculo
        </button>
        <button type="button" className={classeBotaoPrimario} onClick={() => aoGerenciar(v)}>
          Gerenciar
        </button>
      </div>
    </article>
  );
}

// Gestão dos vínculos com contadores (convites, aceite, função, permissões e encerramento) — lógica original da
// página Meu contador, reaproveitada na aba "Permissões". Avisa a página para recarregar indicadores após mudanças.
export function GestaoVinculos({ aoAlterar }: { aoAlterar?: () => void }) {
  const { empresa } = useEmpresaAtual();
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  const [gerenciando, setGerenciando] = useState<Vinculo | null>(null);
  const [funcaoEdicao, setFuncaoEdicao] = useState<Funcao>('principal');
  const [permissoesEdicao, setPermissoesEdicao] = useState<Permissao[]>([]);
  const [encerrando, setEncerrando] = useState<Vinculo | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erroModal, setErroModal] = useState<string | null>(null);
  // E4.1: aceitar solicitação recebida = mesmo modal, definindo função e permissões antes de ativar
  const [modoAceite, setModoAceite] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresa) return;
    const { data: linhas, error } = await createClient().rpc('vinculos_da_empresa', { p_id_empresa: empresa.id });
    if (error) {
      setErro(mensagemDeErro(error, 'Não foi possível carregar seus contadores.'));
    } else {
      setErro(null);
      setVinculos((linhas ?? []) as Vinculo[]);
    }
    setCarregando(false);
  }, [empresa]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const executar = async (acao: () => PromiseLike<{ error: { message?: string } | null }>, sucesso: string, padraoErro: string) => {
    setProcessando(true);
    setErroModal(null);
    const { error } = await acao();
    setProcessando(false);
    if (error) {
      setErroModal(mensagemDeErro(error, padraoErro));
      return false;
    }
    setAviso(sucesso);
    setGerenciando(null);
    setEncerrando(null);
    dispararNotificacoes();
    await carregar();
    aoAlterar?.();
    return true;
  };

  const abrirGerenciar = (v: Vinculo, aceite = false) => {
    setModoAceite(aceite);
    setErroModal(null);
    setFuncaoEdicao(v.funcao);
    setPermissoesEdicao(v.permissoes);
    setGerenciando(v);
  };
  const abrirEncerrar = (v: Vinculo) => {
    setErroModal(null);
    setMotivo('');
    setEncerrando(v);
  };

  const ativos = vinculos.filter((v) => v.status === 'ativo');
  const principal = ativos.find((v) => v.funcao === 'principal') ?? null;
  const outros = ativos.filter((v) => v !== principal);
  const pendentes = vinculos.filter((v) => v.status === 'pendente');
  const historico = vinculos.filter((v) => v.status === 'encerrado' || v.status === 'recusado');
  const vazio = !carregando && !erro && ativos.length === 0 && pendentes.length === 0;

  if (!empresa) return null;

  return (
    <div className="space-y-6">
      {!vazio && !carregando && (
        <div className="flex justify-end">
          <Link href="/app/meu-contador/buscar" className={classeBotaoPrimario}>
            <Search className="w-4 h-4" aria-hidden="true" />
            Buscar contador
          </Link>
        </div>
      )}

      {aviso && (
        <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-start justify-between gap-3">
          <span>{aviso}</span>
          <button type="button" onClick={() => setAviso(null)} className="text-green-800 underline min-h-6">
            Fechar
          </button>
        </div>
      )}

      {carregando && (
        <div role="status" className="space-y-4" aria-label="Carregando">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 rounded-2xl bg-white border border-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {erro && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="text-red-700 font-medium">{erro}</p>
          <button type="button" className={`${classeBotaoSecundario} mt-3`} onClick={() => { setCarregando(true); carregar(); }}>
            Tentar novamente
          </button>
        </div>
      )}

      {vazio && (
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-10 sm:px-10 sm:py-14 text-center">
          <div className="mx-auto w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center relative">
            <BadgeCheck className="w-10 h-10 text-gray-400" aria-hidden="true" />
            <span className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-orange-600 text-white flex items-center justify-center shadow">
              <UserPlus className="w-5 h-5" aria-hidden="true" />
            </span>
          </div>
          <h2 className="mt-6 text-xl sm:text-2xl font-black text-gray-900">Você ainda não tem um contador</h2>
          <p className="mt-2 text-gray-600 max-w-xl mx-auto">
            Conecte um contador ou escritório contábil para facilitar sua gestão, organizar suas obrigações e manter sua empresa em dia.
          </p>
          <Link href="/app/meu-contador/buscar" className={`${classeBotaoPrimario} mt-6`}>
            <Search className="w-4 h-4" aria-hidden="true" />
            Buscar contador
          </Link>
          <ul className="mt-10 grid gap-6 sm:grid-cols-3 text-left max-w-4xl mx-auto">
            {[
              { Icone: ShieldCheck, titulo: 'Mais segurança', texto: 'Seus dados só são compartilhados com sua autorização.' },
              { Icone: Clock3, titulo: 'Gestão simplificada', texto: 'Documentos, obrigações e comunicação em um só lugar.' },
              { Icone: BadgeCheck, titulo: 'Profissionais cadastrados', texto: 'Contadores e escritórios com perfil profissional na plataforma.' },
            ].map(({ Icone, titulo, texto }) => (
              <li key={titulo} className="flex gap-3">
                <span className="w-11 h-11 shrink-0 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center">
                  <Icone className="w-5 h-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-semibold text-gray-900">{titulo}</span>
                  <span className="block text-sm text-gray-500">{texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!carregando && principal && (
        <section aria-labelledby="titulo-principal" className="space-y-3">
          <h2 id="titulo-principal" className="text-lg font-bold text-gray-900">Contador principal</h2>
          <CartaoVinculo v={principal} destaque aoGerenciar={abrirGerenciar} aoEncerrar={abrirEncerrar} />
        </section>
      )}

      {!carregando && !principal && ativos.length > 0 && (
        <p className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          Sua empresa ainda não tem um contador principal. Defina um dos vínculos abaixo como principal em “Gerenciar”.
        </p>
      )}

      {!carregando && outros.length > 0 && (
        <section aria-labelledby="titulo-outros" className="space-y-3">
          <h2 id="titulo-outros" className="text-lg font-bold text-gray-900">Outros contadores vinculados</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {outros.map((v) => (
              <CartaoVinculo key={v.id} v={v} aoGerenciar={abrirGerenciar} aoEncerrar={abrirEncerrar} />
            ))}
          </div>
        </section>
      )}

      {!carregando && pendentes.length > 0 && (
        <section aria-labelledby="titulo-pendentes" className="space-y-3">
          <h2 id="titulo-pendentes" className="text-lg font-bold text-gray-900">Solicitações pendentes</h2>
          <ul className="space-y-3">
            {pendentes.map((v) => {
              const recebida = v.origem !== 'empresa';
              const nome = nomeDe(v);
              return (
                <li key={v.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FotoPerfil caminho={v.foto_caminho} nome={nome} escritorio={!v.id_contador} />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 break-words">{nome}</p>
                      <p className="text-sm text-gray-600">
                        {FUNCOES[v.funcao]} · {recebida ? 'Quer atender sua empresa' : 'Aguardando resposta do contador'} · {data(v.criado_em)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row gap-2">
                    {recebida ? (
                      <>
                        <button
                          type="button"
                          disabled={processando}
                          className={classeBotaoSecundario}
                          onClick={() =>
                            executar(
                              () => createClient().rpc('responder_vinculo_contabil', { p_id_vinculo: v.id, p_aceitar: false }),
                              'Solicitação recusada.',
                              'Não foi possível recusar a solicitação.'
                            ).then((ok) => !ok && setAviso(null))
                          }
                        >
                          Recusar
                        </button>
                        <button
                          type="button"
                          disabled={processando}
                          className={classeBotaoPrimario}
                          onClick={() => abrirGerenciar(v, true)}
                        >
                          Aceitar
                        </button>
                      </>
                    ) : (
                      <button type="button" disabled={processando} className={classeBotaoSecundario} onClick={() => abrirEncerrar(v)}>
                        Cancelar solicitação
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {erroModal && !gerenciando && !encerrando && (
            <p role="alert" className="text-sm text-red-700">
              {erroModal}
            </p>
          )}
        </section>
      )}

      {!carregando && historico.length > 0 && (
        <details className="bg-white rounded-2xl border border-gray-200 group">
          <summary className="min-h-12 px-4 flex items-center gap-2 cursor-pointer font-semibold text-gray-800 list-none">
            <History className="w-4 h-4" aria-hidden="true" />
            Histórico de vínculos ({historico.length})
          </summary>
          <ul className="divide-y divide-gray-100 border-t border-gray-100">
            {historico.map((v) => (
              <li key={v.id} className="px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="font-medium text-gray-900">
                  {nomeDe(v)} <span className="text-gray-500 font-normal">· {FUNCOES[v.funcao]}</span>
                </span>
                <span className="text-gray-600">
                  {STATUS_VINCULO[v.status]} em {data(v.encerrado_em)}
                  {v.motivo_encerramento ? ` — ${v.motivo_encerramento}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!carregando && <ListaConvites idEmpresa={empresa.id} />}

      <Modal
        aberto={!!gerenciando}
        aoFechar={() => setGerenciando(null)}
        titulo={modoAceite ? 'Aceitar e definir permissões' : 'Gerenciar vínculo'}
        descricao={gerenciando ? nomeDe(gerenciando) : undefined}
        rodape={
          <>
            <button type="button" className={classeBotaoSecundario} onClick={() => setGerenciando(null)}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={processando || permissoesEdicao.length === 0}
              className={classeBotaoPrimario}
              onClick={() =>
                gerenciando &&
                executar(
                  () =>
                    createClient().rpc(modoAceite ? 'aceitar_vinculo_contabil' : 'alterar_vinculo_contabil', {
                      p_id_vinculo: gerenciando.id,
                      p_funcao: funcaoEdicao,
                      p_permissoes: permissoesEdicao,
                    }),
                  modoAceite ? 'Vínculo ativado com as permissões escolhidas.' : 'Vínculo atualizado.',
                  modoAceite ? 'Não foi possível aceitar a solicitação.' : 'Não foi possível salvar as alterações.'
                )
              }
            >
              {processando ? 'Salvando...' : modoAceite ? 'Aceitar e ativar' : 'Salvar alterações'}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <label htmlFor="funcao-vinculo" className="block text-sm font-semibold text-gray-900 mb-2">
              Função
            </label>
            <select
              id="funcao-vinculo"
              value={funcaoEdicao}
              onChange={(e) => setFuncaoEdicao(e.target.value as Funcao)}
              className="w-full h-11 px-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {Object.entries(FUNCOES).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">A empresa pode ter apenas um contador principal ativo.</p>
          </div>
          <fieldset>
            <legend className="text-sm font-semibold text-gray-900 mb-2">Permissões concedidas</legend>
            <div className="space-y-1">
              {Object.entries(PERMISSOES).map(([chave, rotulo]) => (
                <label key={chave} className="flex items-center gap-3 min-h-11 px-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-orange-600"
                    checked={permissoesEdicao.includes(chave as Permissao)}
                    onChange={(e) =>
                      setPermissoesEdicao((atual) =>
                        e.target.checked ? [...atual, chave as Permissao] : atual.filter((p) => p !== chave)
                      )
                    }
                  />
                  <span className="text-sm text-gray-800">{rotulo}</span>
                </label>
              ))}
            </div>
            {permissoesEdicao.length === 0 && <p className="text-xs text-red-600 mt-1">Selecione ao menos uma permissão.</p>}
          </fieldset>
          {erroModal && (
            <p role="alert" className="text-sm text-red-700">
              {erroModal}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        aberto={!!encerrando}
        aoFechar={() => setEncerrando(null)}
        titulo={encerrando?.status === 'pendente' ? 'Cancelar solicitação' : 'Encerrar vínculo'}
        descricao={
          encerrando
            ? `${nomeDe(encerrando)} deixará de ter acesso aos dados da sua empresa. O histórico será mantido.`
            : undefined
        }
        rodape={
          <>
            <button type="button" className={classeBotaoSecundario} onClick={() => setEncerrando(null)}>
              Voltar
            </button>
            <button
              type="button"
              disabled={processando}
              className={classeBotaoPerigo}
              onClick={() =>
                encerrando &&
                executar(
                  () => createClient().rpc('encerrar_vinculo_contabil', { p_id_vinculo: encerrando.id, p_motivo: motivo || null }),
                  encerrando.status === 'pendente' ? 'Solicitação cancelada.' : 'Vínculo encerrado.',
                  'Não foi possível encerrar o vínculo.'
                )
              }
            >
              {processando ? 'Processando...' : 'Confirmar'}
            </button>
          </>
        }
      >
        <label htmlFor="motivo-encerramento" className="block text-sm font-semibold text-gray-900 mb-2">
          Motivo (opcional)
        </label>
        <textarea
          id="motivo-encerramento"
          value={motivo}
          maxLength={500}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        {erroModal && (
          <p role="alert" className="text-sm text-red-700 mt-2">
            {erroModal}
          </p>
        )}
      </Modal>
    </div>
  );
}
