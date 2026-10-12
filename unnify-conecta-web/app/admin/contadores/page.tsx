'use client';

import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import {
  BarraFiltros,
  BotaoLimparFiltros,
  BotoesAcao,
  CampoBusca,
  Celula,
  CelulaCidade,
  CelulaContato,
  CelulaNome,
  Contagem,
  EstadoTabela,
  FiltroSelect,
  IconeCidade,
  Linha,
  Paginacao,
  ROTULO_STATUS,
  SELO_STATUS,
  Selo,
  Tabela,
  TabelaCard,
} from '@/components/admin/tabela';
import { createClient } from '@/lib/supabase/client';

interface Contador {
  id: string;
  nome: string;
  email: string;
  escritorio: string | null;
  cnpj: string | null;
  telefone: string;
  cidade: string;
  uf: string;
  status: 'ativo' | 'pendente' | 'inativo';
  criadoEm: string;
}

function formatarTelefone(valor: string | null): string {
  const d = (valor || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor || '';
}

export default function ContadoresPage() {
  const [contadores, setContadores] = useState<Contador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [novosNoMes, setNovosNoMes] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [cityFilter, setCityFilter] = useState('todas');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    const carregar = async () => {
      try {
        const supabase = createClient();

        const { data: perfis, error: erroPerfis } = await supabase
          .from('perfis')
          .select('id_usuario, nome_completo, email, status, criado_em')
          .eq('tipo_usuario', 'contador')
          .order('criado_em', { ascending: false });
        if (erroPerfis) throw erroPerfis;
        if (!perfis || perfis.length === 0) {
          setContadores([]);
          return;
        }

        const agora = new Date();
        const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
        setNovosNoMes(perfis.filter((p) => new Date(p.criado_em) >= inicioDoMes).length);

        const { data: vinculos, error: erroVinculos } = await supabase
          .from('usuarios_empresas')
          .select('id_usuario, id_empresa')
          .in(
            'id_usuario',
            perfis.map((p) => p.id_usuario)
          )
          .eq('ativo', true);
        if (erroVinculos) throw erroVinculos;

        const idsEmpresas = Array.from(new Set((vinculos || []).map((v) => v.id_empresa)));
        const { data: escritorios, error: erroEscritorios } = idsEmpresas.length
          ? await supabase
              .from('empresas')
              .select('id, razao_social, nome_comercial, cnpj, telefone, cidade, estado')
              .in('id', idsEmpresas)
              .eq('tipo_empresa', 'escritorio_contabil')
          : { data: [], error: null };
        if (erroEscritorios) throw erroEscritorios;

        const escritorioPorId = new Map((escritorios || []).map((e) => [e.id, e]));
        const escritorioDoUsuario = new Map<string, NonNullable<typeof escritorios>[number]>();
        for (const v of vinculos || []) {
          const esc = escritorioPorId.get(v.id_empresa);
          if (esc && !escritorioDoUsuario.has(v.id_usuario)) escritorioDoUsuario.set(v.id_usuario, esc);
        }

        setContadores(
          perfis.map((p) => {
            const esc = escritorioDoUsuario.get(p.id_usuario);
            const status: Contador['status'] =
              p.status !== 'active' ? 'inativo' : esc ? 'ativo' : 'pendente';
            return {
              id: p.id_usuario,
              nome: p.nome_completo || p.email || 'Sem nome',
              email: p.email || '',
              escritorio: esc ? esc.nome_comercial || esc.razao_social : null,
              cnpj: esc?.cnpj ?? null,
              telefone: formatarTelefone(esc?.telefone ?? null),
              cidade: esc?.cidade || '',
              uf: esc?.estado || '',
              status,
              criadoEm: p.criado_em,
            };
          })
        );
      } catch (e) {
        console.error('Erro ao carregar contadores:', e);
        setErro('falha');
      } finally {
        setCarregando(false);
      }
    };

    carregar();
  }, []);

  const totalContadores = contadores.length;
  const ativosCount = contadores.filter((c) => c.status === 'ativo').length;
  const pendentesCount = contadores.filter((c) => c.status === 'pendente').length;
  const inativos = contadores.filter((c) => c.status === 'inativo').length;
  const percentual = (n: number) => (totalContadores > 0 ? ((n / totalContadores) * 100).toFixed(1) : '0');

  const filteredContadores = contadores.filter((contador) => {
    const busca = searchTerm.toLowerCase();
    const digitos = searchTerm.replace(/\D/g, '');
    const matchesSearch =
      contador.nome.toLowerCase().includes(busca) ||
      contador.email.toLowerCase().includes(busca) ||
      (contador.escritorio ?? '').toLowerCase().includes(busca) ||
      (digitos.length > 0 &&
        ((contador.cnpj ?? '').replace(/\D/g, '').includes(digitos) ||
          contador.telefone.replace(/\D/g, '').includes(digitos)));
    const matchesStatus = statusFilter === 'todos' || contador.status === statusFilter;
    const matchesCity = cityFilter === 'todas' || contador.cidade === cityFilter;
    return matchesSearch && matchesStatus && matchesCity;
  });

  const paginatedContadores = filteredContadores.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const cidades = Array.from(new Set(contadores.map((c) => c.cidade).filter(Boolean))).sort();
  const hasActiveFilters = searchTerm || statusFilter !== 'todos' || cityFilter !== 'todas';

  const cartoes = [
    { rotulo: 'Total de contadores', valor: totalContadores, rodape: `${novosNoMes} ${novosNoMes === 1 ? 'cadastrado' : 'cadastrados'} este mês`, fundo: 'bg-orange-50', cor: 'text-green-600', icone: '👥' },
    { rotulo: 'Contadores ativos', valor: ativosCount, rodape: `${percentual(ativosCount)}% do total`, fundo: 'bg-green-50', cor: 'text-green-700', icone: '✓' },
    { rotulo: 'Contadores pendentes', valor: pendentesCount, rodape: `${percentual(pendentesCount)}% do total`, fundo: 'bg-orange-50', cor: 'text-orange-700', icone: '⏱' },
    { rotulo: 'Contadores inativos', valor: inativos, rodape: `${percentual(inativos)}% do total`, fundo: 'bg-gray-50', cor: 'text-red-700', icone: '✕' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Contadores</h1>
            <p className="text-gray-600 mt-2">Gerencie todos os contadores cadastrados no Unnify Conecta.</p>
          </div>
          <button
            type="button"
            className="self-start shrink-0 min-h-11 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 rounded-lg flex items-center gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
          >
            <span aria-hidden="true">+</span> Novo contador
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {cartoes.map((c) => (
            <div key={c.rotulo} className={`${c.fundo} rounded-lg p-4 border border-gray-200`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-gray-600 text-sm">{c.rotulo}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{carregando ? '—' : c.valor}</p>
                  <p className={`text-xs ${c.cor} font-semibold mt-2 min-h-4`}>{carregando ? '' : c.rodape}</p>
                </div>
                <span className="text-2xl" aria-hidden="true">
                  {c.icone}
                </span>
              </div>
            </div>
          ))}
        </div>

        <TabelaCard>
          <BarraFiltros>
            <CampoBusca
              valor={searchTerm}
              aoMudar={(v) => {
                setSearchTerm(v);
                setCurrentPage(1);
              }}
              placeholder="Buscar por nome, escritório, CNPJ, e-mail ou telefone..."
            />
            <FiltroSelect
              valor={statusFilter}
              aoMudar={(v) => {
                setStatusFilter(v);
                setCurrentPage(1);
              }}
            >
              <option value="todos">Status: Todos</option>
              <option value="ativo">Ativo</option>
              <option value="pendente">Pendente</option>
              <option value="inativo">Inativo</option>
            </FiltroSelect>
            <FiltroSelect
              icone={IconeCidade}
              valor={cityFilter}
              aoMudar={(v) => {
                setCityFilter(v);
                setCurrentPage(1);
              }}
            >
              <option value="todas">Cidade: Todas</option>
              {cidades.map((cidade) => (
                <option key={cidade} value={cidade}>
                  {cidade}
                </option>
              ))}
            </FiltroSelect>
            {hasActiveFilters && (
              <BotaoLimparFiltros
                aoClicar={() => {
                  setSearchTerm('');
                  setStatusFilter('todos');
                  setCityFilter('todas');
                  setCurrentPage(1);
                }}
              />
            )}
          </BarraFiltros>

          <EstadoTabela
            carregando={carregando}
            erro={erro}
            vazio={filteredContadores.length === 0}
            mensagemVazio={
              hasActiveFilters ? 'Nenhum contador encontrado com os filtros aplicados.' : 'Nenhum contador cadastrado ainda.'
            }
          >
            <Tabela
              colunas={[
                { titulo: 'Contador' },
                { titulo: 'Contato' },
                { titulo: 'Cidade/UF' },
                { titulo: 'Plano', alinhar: 'centro' },
                { titulo: 'Empresas', alinhar: 'centro' },
                { titulo: 'Status' },
                { titulo: 'Cadastro' },
                { titulo: 'Ações', alinhar: 'centro' },
              ]}
            >
              {paginatedContadores.map((contador, i) => (
                <Linha key={contador.id}>
                  <Celula>
                    <CelulaNome
                      nome={contador.nome}
                      detalhes={[
                        contador.escritorio ?? 'Sem escritório cadastrado',
                        contador.cnpj ? `CNPJ ${contador.cnpj}` : null,
                      ]}
                      indice={(currentPage - 1) * itemsPerPage + i}
                    />
                  </Celula>
                  <Celula>
                    <CelulaContato telefone={contador.telefone} email={contador.email} />
                  </Celula>
                  <Celula>
                    <CelulaCidade cidade={contador.cidade} uf={contador.uf} />
                  </Celula>
                  <Celula alinhar="centro">
                    <span className="text-gray-400 font-semibold" title="Planos ainda não implementados">
                      —
                    </span>
                  </Celula>
                  <Celula alinhar="centro">
                    <span title="Vínculo com empresas clientes ainda não implementado">
                      <Contagem valor={null} />
                    </span>
                  </Celula>
                  <Celula>
                    <Selo tipo={SELO_STATUS[contador.status]} texto={ROTULO_STATUS[contador.status]} />
                  </Celula>
                  <Celula className="whitespace-nowrap">
                    {new Date(contador.criadoEm).toLocaleDateString('pt-BR')}
                  </Celula>
                  <Celula alinhar="centro">
                    <BotoesAcao />
                  </Celula>
                </Linha>
              ))}
            </Tabela>
            <Paginacao
              pagina={currentPage}
              aoMudarPagina={setCurrentPage}
              porPagina={itemsPerPage}
              aoMudarPorPagina={setItemsPerPage}
              total={filteredContadores.length}
            />
          </EstadoTabela>
        </TabelaCard>
      </div>
    </AdminLayout>
  );
}
