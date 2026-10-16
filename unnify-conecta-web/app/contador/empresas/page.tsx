'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X as IconeX, LogOut, Plus } from 'lucide-react';
import { ModalVincularEmpresa } from '@/components/convites/ModalVincularEmpresa';
import { ListaConvites } from '@/components/convites/ListaConvites';
import { dispararNotificacoes } from '@/lib/convites';
import { createClient } from '@/lib/supabase/client';
import { useContadorAtual } from '@/components/contador/LayoutContador';
import {
  BarraFiltros,
  BotaoIcone,
  CampoBusca,
  Celula,
  CelulaCidade,
  CelulaNome,
  EstadoTabela,
  FiltroSelect,
  Linha,
  Paginacao,
  Selo,
  Tabela,
  TabelaCard,
  type TipoSelo,
} from '@/components/admin/tabela';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { FUNCOES, STATUS_VINCULO, mensagemDeErro, type Funcao, type StatusVinculo } from '@/lib/contabil';

interface LinhaVinculo {
  id_vinculo: string;
  id_empresa: string;
  razao_social: string;
  nome_comercial: string | null;
  cnpj: string;
  cidade: string | null;
  estado: string | null;
  funcao: Funcao;
  status: StatusVinculo;
  origem: 'empresa' | 'contador' | 'escritorio';
  id_contador?: string | null;
  contador_nome?: string | null;
  escritorio_nome?: string | null;
  criado_em: string;
  aprovado_em: string | null;
  total: number;
}

const SELO: Record<StatusVinculo, TipoSelo> = { ativo: 'sucesso', pendente: 'alerta', recusado: 'perigo', encerrado: 'neutro' };
const dataCurta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

export default function EmpresasDoContadorPage() {
  const contador = useContadorAtual();
  const [aba, setAba] = useState<'minhas' | 'escritorio'>('minhas');
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [linhas, setLinhas] = useState<LinhaVinculo[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [encerrando, setEncerrando] = useState<LinhaVinculo | null>(null);
  const [designando, setDesignando] = useState<LinhaVinculo | null>(null);
  const [membros, setMembros] = useState<{ id_usuario: string; nome: string }[]>([]);
  const [membroEscolhido, setMembroEscolhido] = useState('');
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const requisicao = useRef(0);
  const [vinculando, setVinculando] = useState(false);
  const [versaoConvites, setVersaoConvites] = useState(0);

  // Dependências por id (não pelo objeto do contexto): o layout pode recriar o objeto sem mudar o contador,
  // e isso não deve recarregar a lista nem desmontar a linha/link em uso
  const idContador = contador?.id ?? null;
  const idEscritorio = contador?.escritorio?.id ?? null;
  const carregar = useCallback(async () => {
    if (!idContador) return;
    const atual = ++requisicao.current;
    setCarregando(true);
    const supabase = createClient();
    const filtros = {
      p_busca: busca.trim() || null,
      p_status: status || null,
      p_limite: porPagina,
      p_deslocamento: (pagina - 1) * porPagina,
    };
    const { data, error } =
      aba === 'escritorio' && idEscritorio
        ? await supabase.rpc('empresas_do_escritorio', { p_id_escritorio: idEscritorio, ...filtros })
        : await supabase.rpc('empresas_do_contador', filtros);
    if (atual !== requisicao.current) return;
    if (error) {
      setErro(mensagemDeErro(error, 'Não foi possível carregar as empresas.'));
    } else {
      setErro(null);
      setLinhas((data ?? []) as LinhaVinculo[]);
      setTotal((data?.[0] as LinhaVinculo | undefined)?.total ?? 0);
    }
    setCarregando(false);
  }, [idContador, idEscritorio, aba, busca, status, pagina, porPagina]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  const executar = async (acao: () => PromiseLike<{ error: { message?: string } | null }>, sucesso: string, padrao: string) => {
    setProcessando(true);
    setErroAcao(null);
    const { error } = await acao();
    setProcessando(false);
    if (error) {
      setErroAcao(mensagemDeErro(error, padrao));
      return;
    }
    setAviso(sucesso);
    setEncerrando(null);
    setDesignando(null);
    dispararNotificacoes();
    carregar();
  };

  const abrirDesignar = async (v: LinhaVinculo) => {
    if (!contador?.escritorio) return;
    setErroAcao(null);
    setMembroEscolhido('');
    setDesignando(v);
    const { data } = await createClient().rpc('membros_do_escritorio', { p_id_escritorio: contador.escritorio.id });
    setMembros((data ?? []) as { id_usuario: string; nome: string }[]);
  };

  if (!contador) return null;

  const colunas =
    aba === 'escritorio'
      ? [{ titulo: 'Empresa' }, { titulo: 'Cidade/UF' }, { titulo: 'Responsável' }, { titulo: 'Função' }, { titulo: 'Status' }, { titulo: 'Desde' }, { titulo: 'Ações', alinhar: 'centro' as const }]
      : [{ titulo: 'Empresa' }, { titulo: 'Cidade/UF' }, { titulo: 'Função' }, { titulo: 'Status' }, { titulo: 'Desde' }, { titulo: 'Ações', alinhar: 'centro' as const }];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Minhas empresas</h1>
          <p className="text-gray-600 mt-1">Empresas vinculadas, solicitações enviadas e recebidas.</p>
        </div>
        <button type="button" className={classeBotaoPrimario} onClick={() => setVinculando(true)}>
          <Plus className="w-4 h-4" aria-hidden="true" />Vincular empresa
        </button>
      </div>
      <ModalVincularEmpresa aberto={vinculando} aoFechar={() => setVinculando(false)} aoConcluir={() => { carregar(); setVersaoConvites((v) => v + 1); }} />

      {contador.escritorio && (
        <div role="tablist" aria-label="Visualização" className="inline-flex p-1 rounded-xl bg-gray-100 gap-1">
          {(
            [
              ['minhas', 'Atendidas por mim'],
              ['escritorio', `Escritório ${contador.escritorio.nome}`],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={aba === valor}
              onClick={() => {
                setAba(valor);
                setPagina(1);
              }}
              className={`min-h-11 px-4 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                aba === valor ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="line-clamp-1">{rotulo}</span>
            </button>
          ))}
        </div>
      )}

      {aviso && (
        <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex justify-between gap-3">
          <span>{aviso}</span>
          <button type="button" className="underline" onClick={() => setAviso(null)}>
            Fechar
          </button>
        </div>
      )}
      {erroAcao && !encerrando && !designando && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erroAcao}
        </p>
      )}

      <TabelaCard>
        <BarraFiltros>
          <CampoBusca
            valor={busca}
            aoMudar={(v) => {
              setBusca(v);
              setPagina(1);
            }}
            placeholder="Buscar por razão social, nome fantasia ou CNPJ..."
          />
          <FiltroSelect
            valor={status}
            aoMudar={(v) => {
              setStatus(v);
              setPagina(1);
            }}
          >
            <option value="">Status: Todos</option>
            {Object.entries(STATUS_VINCULO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </FiltroSelect>
        </BarraFiltros>

        <EstadoTabela
          carregando={carregando && linhas.length === 0}
          erro={erro}
          vazio={linhas.length === 0}
          mensagemVazio={
            busca || status
              ? 'Nenhuma empresa encontrada com esses filtros.'
              : 'Nenhuma empresa ainda. Publique seu perfil profissional para aparecer no catálogo das empresas.'
          }
        >
          <Tabela colunas={colunas}>
            {linhas.map((v, i) => {
              const nome = v.nome_comercial || v.razao_social;
              const pendente = v.status === 'pendente';
              const recebida = v.origem === 'empresa';
              const precisaDesignar = aba === 'escritorio' && pendente && recebida && !v.id_contador;
              const podeResponder = pendente && recebida && (aba === 'minhas' || precisaDesignar);
              // Só abre o painel da empresa quando o vínculo está ativo e é meu (o destino confere de novo o vínculo e as permissões)
              const destino = v.status === 'ativo' && (aba === 'minhas' || v.id_contador === contador.id) ? `/contador/empresas/${v.id_empresa}` : undefined;
              return (
                <Linha key={v.id_vinculo} href={destino}>
                  <Celula>
                    <CelulaNome nome={nome} detalhes={[v.nome_comercial ? v.razao_social : null, `CNPJ ${v.cnpj}`]} indice={(pagina - 1) * porPagina + i} href={destino} />
                  </Celula>
                  <Celula>
                    <CelulaCidade cidade={v.cidade} uf={v.estado} />
                  </Celula>
                  {aba === 'escritorio' && <Celula>{v.contador_nome ?? <span className="text-gray-400">A definir</span>}</Celula>}
                  <Celula>
                    <Selo tipo={v.funcao === 'principal' ? 'alerta' : 'info'} texto={FUNCOES[v.funcao]} />
                  </Celula>
                  <Celula>
                    <Selo tipo={SELO[v.status]} texto={pendente && !recebida ? 'Aguardando empresa' : STATUS_VINCULO[v.status]} />
                  </Celula>
                  <Celula className="whitespace-nowrap">{dataCurta(v.aprovado_em ?? v.criado_em)}</Celula>
                  <Celula alinhar="centro">
                    <div className="flex items-center justify-end min-[85rem]:justify-center gap-2">
                      {podeResponder && (
                        <>
                          <BotaoIcone
                            icone={Check}
                            titulo={`Aceitar ${nome}`}
                            aoClicar={() =>
                              precisaDesignar
                                ? abrirDesignar(v)
                                : executar(
                                    () => createClient().rpc('responder_vinculo_contabil', { p_id_vinculo: v.id_vinculo, p_aceitar: true }),
                                    'Vínculo aceito.',
                                    'Não foi possível aceitar.'
                                  )
                            }
                          />
                          <BotaoIcone
                            icone={IconeX}
                            titulo={`Recusar ${nome}`}
                            aoClicar={() =>
                              executar(
                                () => createClient().rpc('responder_vinculo_contabil', { p_id_vinculo: v.id_vinculo, p_aceitar: false }),
                                'Solicitação recusada.',
                                'Não foi possível recusar.'
                              )
                            }
                          />
                        </>
                      )}
                      {(v.status === 'ativo' || (pendente && !podeResponder)) && (
                        <BotaoIcone
                          icone={LogOut}
                          titulo={v.status === 'ativo' ? `Encerrar vínculo com ${nome}` : `Cancelar solicitação para ${nome}`}
                          aoClicar={() => {
                            setErroAcao(null);
                            setEncerrando(v);
                          }}
                        />
                      )}
                    </div>
                  </Celula>
                </Linha>
              );
            })}
          </Tabela>
          <Paginacao pagina={pagina} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={setPorPagina} total={total} />
        </EstadoTabela>
      </TabelaCard>

      <ListaConvites versao={versaoConvites} />

      <Modal
        aberto={!!encerrando}
        aoFechar={() => setEncerrando(null)}
        titulo={encerrando?.status === 'ativo' ? 'Encerrar vínculo' : 'Cancelar solicitação'}
        descricao={
          encerrando
            ? `Você deixará de ter acesso aos dados de ${encerrando.nome_comercial || encerrando.razao_social}. O histórico será mantido.`
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
                  () => createClient().rpc('encerrar_vinculo_contabil', { p_id_vinculo: encerrando.id_vinculo }),
                  'Vínculo encerrado.',
                  'Não foi possível encerrar.'
                )
              }
            >
              {processando ? 'Processando...' : 'Confirmar'}
            </button>
          </>
        }
      >
        {erroAcao && (
          <p role="alert" className="text-sm text-red-700">
            {erroAcao}
          </p>
        )}
      </Modal>

      <Modal
        aberto={!!designando}
        aoFechar={() => setDesignando(null)}
        titulo="Aceitar e designar responsável"
        descricao="Escolha qual membro do escritório vai atender esta empresa. Somente ele terá acesso aos dados."
        rodape={
          <>
            <button type="button" className={classeBotaoSecundario} onClick={() => setDesignando(null)}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={processando || !membroEscolhido}
              className={classeBotaoPrimario}
              onClick={() =>
                designando &&
                executar(
                  () =>
                    createClient().rpc('responder_vinculo_contabil', {
                      p_id_vinculo: designando.id_vinculo,
                      p_aceitar: true,
                      p_id_contador: membroEscolhido,
                    }),
                  'Vínculo aceito e responsável definido.',
                  'Não foi possível aceitar.'
                )
              }
            >
              {processando ? 'Salvando...' : 'Aceitar'}
            </button>
          </>
        }
      >
        <label htmlFor="membro-escritorio" className="block text-sm font-semibold text-gray-900 mb-2">
          Contador responsável
        </label>
        <select
          id="membro-escritorio"
          value={membroEscolhido}
          onChange={(e) => setMembroEscolhido(e.target.value)}
          className="w-full h-11 px-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="">Selecione</option>
          {membros.map((m) => (
            <option key={m.id_usuario} value={m.id_usuario}>
              {m.nome}
            </option>
          ))}
        </select>
        {erroAcao && (
          <p role="alert" className="text-sm text-red-700 mt-2">
            {erroAcao}
          </p>
        )}
      </Modal>
    </div>
  );
}
