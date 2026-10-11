'use client';

import { useState } from 'react';
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
  IconePlano,
} from '@/components/admin/tabela';

interface Contador {
  id: string;
  nome: string;
  cpfCnpj: string;
  telefone: string;
  email: string;
  cidade: string;
  uf: string;
  plano: string;
  empresas: number;
  status: 'ativo' | 'pendente' | 'inativo';
  cadastro: string;
}

const contadoresFicticios: Contador[] = [
  {
    id: '1',
    nome: 'Antônio De Sousa',
    cpfCnpj: '43.885.538/0001-33',
    telefone: '6 3999559555',
    email: 'suportedeepweb@gmail.com',
    cidade: 'Augustinópolis',
    uf: 'TO',
    plano: 'Pro',
    empresas: 3,
    status: 'ativo',
    cadastro: '08/10/2026',
  },
  {
    id: '2',
    nome: 'Maria Clara',
    cpfCnpj: '12.345.678/0001-90',
    telefone: '6 3991234567',
    email: 'maria@claracontabil.com',
    cidade: 'Araguatins',
    uf: 'TO',
    plano: 'Pro',
    empresas: 5,
    status: 'ativo',
    cadastro: '01/10/2026',
  },
  {
    id: '3',
    nome: 'João Silva',
    cpfCnpj: '98.765.432/0001-11',
    telefone: '6 3992345678',
    email: 'joao@silvacont.com.br',
    cidade: 'Sampaio',
    uf: 'TO',
    plano: 'Básico',
    empresas: 2,
    status: 'ativo',
    cadastro: '28/09/2026',
  },
  {
    id: '4',
    nome: 'Ana Fernandes',
    cpfCnpj: '56.789.123/0001-44',
    telefone: '6 3993456789',
    email: 'ana@afcontabil.com.br',
    cidade: 'Axixá',
    uf: 'TO',
    plano: 'Pro',
    empresas: 1,
    status: 'pendente',
    cadastro: '25/09/2026',
  },
  {
    id: '5',
    nome: 'Ricardo Pereira',
    cpfCnpj: '22.333.444/0001-55',
    telefone: '6 3994567890',
    email: 'ricardo@rpcontabil.com.br',
    cidade: 'Imperatriz',
    uf: 'MA',
    plano: 'Básico',
    empresas: 0,
    status: 'inativo',
    cadastro: '20/09/2026',
  },
  {
    id: '6',
    nome: 'Patricia Santos',
    cpfCnpj: '33.444.555/0001-66',
    telefone: '6 3995678901',
    email: 'patricia@santoscont.com',
    cidade: 'Palmas',
    uf: 'TO',
    plano: 'Pro',
    empresas: 4,
    status: 'ativo',
    cadastro: '15/09/2026',
  },
  {
    id: '7',
    nome: 'Carlos Oliveira',
    cpfCnpj: '44.555.666/0001-77',
    telefone: '6 3996789012',
    email: 'carlos@oliveiracont.com.br',
    cidade: 'Gurupi',
    uf: 'TO',
    plano: 'Básico',
    empresas: 2,
    status: 'ativo',
    cadastro: '10/09/2026',
  },
  {
    id: '8',
    nome: 'Fernanda Costa',
    cpfCnpj: '55.666.777/0001-88',
    telefone: '6 3997890123',
    email: 'fernanda@costacont.com',
    cidade: 'Araguacema',
    uf: 'TO',
    plano: 'Pro',
    empresas: 6,
    status: 'ativo',
    cadastro: '05/09/2026',
  },
  {
    id: '9',
    nome: 'Bruno Martins',
    cpfCnpj: '66.777.888/0001-99',
    telefone: '6 3998901234',
    email: 'bruno@martinscont.com.br',
    cidade: 'Porto Nacional',
    uf: 'TO',
    plano: 'Básico',
    empresas: 1,
    status: 'ativo',
    cadastro: '01/09/2026',
  },
  {
    id: '10',
    nome: 'Juliana Rocha',
    cpfCnpj: '77.888.999/0001-00',
    telefone: '6 3999012345',
    email: 'juliana@rochacont.com',
    cidade: 'Tocantinópolis',
    uf: 'TO',
    plano: 'Pro',
    empresas: 3,
    status: 'ativo',
    cadastro: '28/08/2026',
  },
  {
    id: '11',
    nome: 'Roberto Alves',
    cpfCnpj: '88.999.000/0001-11',
    telefone: '6 3990123456',
    email: 'roberto@alvescont.com.br',
    cidade: 'Dianópolis',
    uf: 'TO',
    plano: 'Básico',
    empresas: 2,
    status: 'ativo',
    cadastro: '20/08/2026',
  },
  {
    id: '12',
    nome: 'Camila Souza',
    cpfCnpj: '99.000.111/0001-22',
    telefone: '6 3991234567',
    email: 'camila@souzacont.com',
    cidade: 'Miracema',
    uf: 'TO',
    plano: 'Pro',
    empresas: 4,
    status: 'ativo',
    cadastro: '15/08/2026',
  },
];

export default function ContadoresPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [cityFilter, setCityFilter] = useState('todas');
  const [planoFilter, setPlanFilter] = useState('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Calcular stats
  const totalContadores = contadoresFicticios.length;
  const ativosCount = contadoresFicticios.filter((c) => c.status === 'ativo').length;
  const pendentesCount = contadoresFicticios.filter((c) => c.status === 'pendente').length;
  const inativos = contadoresFicticios.filter((c) => c.status === 'inativo').length;

  // Filtrar contadores
  const filteredContadores = contadoresFicticios.filter((contador) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      contador.nome.toLowerCase().includes(searchLower) ||
      contador.cpfCnpj.includes(searchTerm) ||
      contador.email.toLowerCase().includes(searchLower) ||
      contador.telefone.includes(searchTerm);

    const matchesStatus =
      statusFilter === 'todos' ||
      (statusFilter === 'ativo' && contador.status === 'ativo') ||
      (statusFilter === 'pendente' && contador.status === 'pendente') ||
      (statusFilter === 'inativo' && contador.status === 'inativo');

    const matchesCity = cityFilter === 'todas' || contador.cidade === cityFilter;

    const matchesPlano =
      planoFilter === 'todos' ||
      (planoFilter === 'pro' && contador.plano === 'Pro') ||
      (planoFilter === 'basico' && contador.plano === 'Básico');

    return matchesSearch && matchesStatus && matchesCity && matchesPlano;
  });

  // Paginar
  const paginatedContadores = filteredContadores.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Cidades únicas
  const cidades = Array.from(new Set(contadoresFicticios.map((c) => c.cidade))).sort();

  return (
    <AdminLayout>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Contadores</h1>
          <p className="text-gray-600 mt-2">Gerencie todos os contadores cadastrados no Unnify Conecta.</p>
        </div>
        <button className="self-start shrink-0 min-h-11 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 rounded-lg flex items-center gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
          <span>+</span> Novo contador
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-gray-600 text-sm">Total de contadores</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalContadores}</p>
              <p className="text-xs text-green-600 font-semibold mt-2">↑ +20% em relação ao mês anterior</p>
            </div>
            <span className="text-2xl">👥</span>
          </div>
        </div>

        <div className="bg-green-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-gray-600 text-sm">Contadores ativos</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{ativosCount}</p>
              <p className="text-xs text-green-700 font-semibold mt-2">
                {totalContadores > 0 ? ((ativosCount / totalContadores) * 100).toFixed(1) : '0'}% do total
              </p>
            </div>
            <span className="text-2xl">✓</span>
          </div>
        </div>

        <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-gray-600 text-sm">Contadores pendentes</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{pendentesCount}</p>
              <p className="text-xs text-orange-700 font-semibold mt-2">
                {totalContadores > 0 ? ((pendentesCount / totalContadores) * 100).toFixed(1) : '0'}% do total
              </p>
            </div>
            <span className="text-2xl">⏱</span>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-gray-600 text-sm">Contadores inativos</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{inativos}</p>
              <p className="text-xs text-red-700 font-semibold mt-2">
                {totalContadores > 0 ? ((inativos / totalContadores) * 100).toFixed(1) : '0'}% do total
              </p>
            </div>
            <span className="text-2xl">✕</span>
          </div>
        </div>
      </div>

      <TabelaCard>
        <BarraFiltros>
          <CampoBusca
            valor={searchTerm}
            aoMudar={(v) => {
              setSearchTerm(v);
              setCurrentPage(1);
            }}
            placeholder="Buscar por nome, CPF, CNPJ, e-mail ou telefone..."
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
          <FiltroSelect
            icone={IconePlano}
            valor={planoFilter}
            aoMudar={(v) => {
              setPlanFilter(v);
              setCurrentPage(1);
            }}
          >
            <option value="todos">Plano: Todos</option>
            <option value="pro">Pro</option>
            <option value="basico">Básico</option>
          </FiltroSelect>
          {(searchTerm || statusFilter !== 'todos' || cityFilter !== 'todas' || planoFilter !== 'todos') && (
            <BotaoLimparFiltros
              aoClicar={() => {
                setSearchTerm('');
                setStatusFilter('todos');
                setCityFilter('todas');
                setPlanFilter('todos');
                setCurrentPage(1);
              }}
            />
          )}
        </BarraFiltros>

        <EstadoTabela vazio={filteredContadores.length === 0} mensagemVazio="Nenhum contador encontrado.">
          <Tabela
            colunas={[
              { titulo: 'Contador' },
              { titulo: 'Contato' },
              { titulo: 'Cidade/UF' },
              { titulo: 'Plano' },
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
                    detalhes={[`CPF/CNPJ ${contador.cpfCnpj}`]}
                    indice={(currentPage - 1) * itemsPerPage + i}
                  />
                </Celula>
                <Celula>
                  <CelulaContato telefone={contador.telefone} email={contador.email} />
                </Celula>
                <Celula>
                  <CelulaCidade cidade={contador.cidade} uf={contador.uf} />
                </Celula>
                <Celula>
                  <Selo tipo={contador.plano === 'Pro' ? 'info' : 'roxo'} texto={contador.plano} />
                </Celula>
                <Celula alinhar="centro">
                  <Contagem valor={contador.empresas} />
                </Celula>
                <Celula>
                  <Selo tipo={SELO_STATUS[contador.status]} texto={ROTULO_STATUS[contador.status]} />
                </Celula>
                <Celula className="whitespace-nowrap">{contador.cadastro}</Celula>
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
