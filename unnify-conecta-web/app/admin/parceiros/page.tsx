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
  IconeTipo,
} from '@/components/admin/tabela';

interface Parceiro {
  id: string;
  nome: string;
  nomeComercial: string;
  tipo: 'Pessoa Física' | 'Pessoa Jurídica';
  cpfCnpj: string;
  telefone: string;
  email: string;
  cidade: string;
  uf: string;
  indicacoes: number;
  comissoes: number;
  status: 'ativo' | 'pendente' | 'inativo';
  cadastro: string;
  dataAcao: string;
}

const parceirosFicticios: Parceiro[] = [
  {
    id: '1',
    nome: 'Alex Lima',
    nomeComercial: 'AL Soluções em TI',
    tipo: 'Pessoa Física',
    cpfCnpj: '123.456.789-00',
    telefone: '63 99912-3456',
    email: 'alex@alsolucoes.com.br',
    cidade: 'Augustinópolis',
    uf: 'TO',
    indicacoes: 12,
    comissoes: 2398.80,
    status: 'ativo',
    cadastro: '10/10/2026',
    dataAcao: '10/10/2026 às 14:20',
  },
  {
    id: '2',
    nome: 'João Ribeiro',
    nomeComercial: 'JR Telecom',
    tipo: 'Pessoa Física',
    cpfCnpj: '234.567.890-11',
    telefone: '63 99234-5678',
    email: 'joao@jrtelecom.com.br',
    cidade: 'Araguatins',
    uf: 'TO',
    indicacoes: 8,
    comissoes: 1599.20,
    status: 'ativo',
    cadastro: '05/10/2026',
    dataAcao: '05/10/2026 às 11:45',
  },
  {
    id: '3',
    nome: 'Comercial Martins',
    nomeComercial: 'Martins Implementações',
    tipo: 'Pessoa Jurídica',
    cpfCnpj: '12.345.678/0001-90',
    telefone: '63 99345-6789',
    email: 'contato@martinsimp.com.br',
    cidade: 'Sampaio',
    uf: 'TO',
    indicacoes: 15,
    comissoes: 3299.00,
    status: 'ativo',
    cadastro: '28/09/2026',
    dataAcao: '28/09/2026 às 16:30',
  },
  {
    id: '4',
    nome: 'Silva Fiber',
    nomeComercial: 'Silva Fiber Internet',
    tipo: 'Pessoa Jurídica',
    cpfCnpj: '23.456.789/0001-01',
    telefone: '63 99123-4567',
    email: 'contato@silvafiber.com.br',
    cidade: 'Axixá',
    uf: 'TO',
    indicacoes: 5,
    comissoes: 999.50,
    status: 'pendente',
    cadastro: '25/09/2026',
    dataAcao: '25/09/2026 às 10:15',
  },
  {
    id: '5',
    nome: 'Ricardo Costa',
    nomeComercial: 'RC Marketing Digital',
    tipo: 'Pessoa Física',
    cpfCnpj: '345.678.901-22',
    telefone: '63 99678-9012',
    email: 'ricardo@rcmarketing.com.br',
    cidade: 'Imperatriz',
    uf: 'MA',
    indicacoes: 9,
    comissoes: 1849.10,
    status: 'ativo',
    cadastro: '20/09/2026',
    dataAcao: '20/09/2026 às 09:40',
  },
  {
    id: '6',
    nome: 'Top Serviços',
    nomeComercial: 'Top Serviços LTDA',
    tipo: 'Pessoa Jurídica',
    cpfCnpj: '34.567.890/0001-12',
    telefone: '63 99901-2345',
    email: 'contato@topservicos.com.br',
    cidade: 'Palmas',
    uf: 'TO',
    indicacoes: 3,
    comissoes: 599.70,
    status: 'inativo',
    cadastro: '15/09/2026',
    dataAcao: '15/09/2026 às 13:10',
  },
  {
    id: '7',
    nome: 'Fernanda Barbosa',
    nomeComercial: 'FB Consultoria',
    tipo: 'Pessoa Física',
    cpfCnpj: '456.789.012-33',
    telefone: '63 99222-3344',
    email: 'fernanda@fbconsult.com.br',
    cidade: 'Gurupi',
    uf: 'TO',
    indicacoes: 7,
    comissoes: 1399.30,
    status: 'ativo',
    cadastro: '10/09/2026',
    dataAcao: '10/09/2026 às 08:25',
  },
  {
    id: '8',
    nome: 'Norte Vendas',
    nomeComercial: 'Norte Vendas LTDA',
    tipo: 'Pessoa Jurídica',
    cpfCnpj: '45.678.901/0001-23',
    telefone: '63 99876-5432',
    email: 'contato@nortevendas.com.br',
    cidade: 'Porto Nacional',
    uf: 'TO',
    indicacoes: 4,
    comissoes: 799.60,
    status: 'pendente',
    cadastro: '05/09/2026',
    dataAcao: '05/09/2026 às 15:50',
  },
  {
    id: '9',
    nome: 'Diego Lima',
    nomeComercial: 'DL Tecnologia',
    tipo: 'Pessoa Física',
    cpfCnpj: '567.890.123-44',
    telefone: '63 99111-7788',
    email: 'diego@dltecnologia.com.br',
    cidade: 'Tocantinópolis',
    uf: 'TO',
    indicacoes: 11,
    comissoes: 2199.40,
    status: 'ativo',
    cadastro: '01/09/2026',
    dataAcao: '01/09/2026 às 12:35',
  },
  {
    id: '10',
    nome: 'Sampaio Parceiros',
    nomeComercial: 'Sampaio Parceiros LTDA',
    tipo: 'Pessoa Jurídica',
    cpfCnpj: '56.789.012/0001-34',
    telefone: '63 99444-8899',
    email: 'contato@sampaiop.com.br',
    cidade: 'Sampaio',
    uf: 'TO',
    indicacoes: 6,
    comissoes: 1199.00,
    status: 'ativo',
    cadastro: '28/08/2026',
    dataAcao: '28/08/2026 às 17:10',
  },
];

export default function ParceirosPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [cidadeFilter, setCidadeFilter] = useState('todas');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Calcular stats
  const totalParceiros = parceirosFicticios.length;
  const ativosCount = parceirosFicticios.filter((p) => p.status === 'ativo').length;
  const pendentesCount = parceirosFicticios.filter((p) => p.status === 'pendente').length;
  const inativos = parceirosFicticios.filter((p) => p.status === 'inativo').length;

  // Filtrar parceiros
  const filteredParceiros = parceirosFicticios.filter((parceiro) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      parceiro.nome.toLowerCase().includes(searchLower) ||
      parceiro.nomeComercial.toLowerCase().includes(searchLower) ||
      parceiro.cpfCnpj.includes(searchTerm) ||
      parceiro.email.toLowerCase().includes(searchLower) ||
      parceiro.telefone.includes(searchTerm);

    const matchesStatus =
      statusFilter === 'todos' ||
      (statusFilter === 'ativo' && parceiro.status === 'ativo') ||
      (statusFilter === 'pendente' && parceiro.status === 'pendente') ||
      (statusFilter === 'inativo' && parceiro.status === 'inativo');

    const matchesTipo =
      tipoFilter === 'todos' ||
      (tipoFilter === 'pessoa-fisica' && parceiro.tipo === 'Pessoa Física') ||
      (tipoFilter === 'pessoa-juridica' && parceiro.tipo === 'Pessoa Jurídica');

    const matchesCidade = cidadeFilter === 'todas' || parceiro.cidade === cidadeFilter;

    return matchesSearch && matchesStatus && matchesTipo && matchesCidade;
  });

  // Paginar
  const paginatedParceiros = filteredParceiros.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Cidades únicas
  const cidades = Array.from(new Set(parceirosFicticios.map((p) => p.cidade))).sort();

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Parceiros</h1>
            <p className="text-gray-600 mt-2">Gerencie todos os parceiros comerciais cadastrados no Unnify Conecta.</p>
          </div>
          <button className="self-start shrink-0 min-h-11 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 rounded-lg flex items-center gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
            <span>+</span> Novo parceiro
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Total de parceiros</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{totalParceiros}</p>
                <p className="text-xs text-green-600 font-semibold mt-2">↑ +28% em relação ao mês anterior</p>
              </div>
              <span className="text-2xl">👥</span>
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Parceiros ativos</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{ativosCount}</p>
                <p className="text-xs text-green-700 font-semibold mt-2">
                  {totalParceiros > 0 ? ((ativosCount / totalParceiros) * 100).toFixed(1) : '0'}% do total
                </p>
              </div>
              <span className="text-2xl">✓</span>
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Parceiros pendentes</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{pendentesCount}</p>
                <p className="text-xs text-orange-700 font-semibold mt-2">
                  {totalParceiros > 0 ? ((pendentesCount / totalParceiros) * 100).toFixed(1) : '0'}% do total
                </p>
              </div>
              <span className="text-2xl">⏱</span>
            </div>
          </div>

          <div className="bg-red-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Parceiros inativos</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{inativos}</p>
                <p className="text-xs text-red-700 font-semibold mt-2">
                  {totalParceiros > 0 ? ((inativos / totalParceiros) * 100).toFixed(1) : '0'}% do total
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
              placeholder="Buscar por nome, CPF/CNPJ, e-mail ou telefone..."
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
              icone={IconeTipo}
              valor={tipoFilter}
              aoMudar={(v) => {
                setTipoFilter(v);
                setCurrentPage(1);
              }}
            >
              <option value="todos">Tipo: Todos</option>
              <option value="pessoa-fisica">Pessoa Física</option>
              <option value="pessoa-juridica">Pessoa Jurídica</option>
            </FiltroSelect>
            <FiltroSelect
              icone={IconeCidade}
              valor={cidadeFilter}
              aoMudar={(v) => {
                setCidadeFilter(v);
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
            {(searchTerm || statusFilter !== 'todos' || tipoFilter !== 'todos' || cidadeFilter !== 'todas') && (
              <BotaoLimparFiltros
                aoClicar={() => {
                  setSearchTerm('');
                  setStatusFilter('todos');
                  setTipoFilter('todos');
                  setCidadeFilter('todas');
                  setCurrentPage(1);
                }}
              />
            )}
          </BarraFiltros>

          <EstadoTabela vazio={filteredParceiros.length === 0} mensagemVazio="Nenhum parceiro encontrado.">
            <Tabela
              colunas={[
                { titulo: 'Parceiro' },
                { titulo: 'Tipo' },
                { titulo: 'Contato' },
                { titulo: 'Cidade/UF' },
                { titulo: 'Indicações', alinhar: 'centro' },
                { titulo: 'Comissões' },
                { titulo: 'Status' },
                { titulo: 'Cadastro' },
                { titulo: 'Ações', alinhar: 'centro' },
              ]}
            >
              {paginatedParceiros.map((parceiro, i) => (
                <Linha key={parceiro.id}>
                  <Celula>
                    <CelulaNome
                      nome={parceiro.nome}
                      detalhes={[parceiro.nomeComercial, parceiro.cpfCnpj]}
                      indice={(currentPage - 1) * itemsPerPage + i}
                    />
                  </Celula>
                  <Celula>
                    <Selo tipo={parceiro.tipo === 'Pessoa Física' ? 'info' : 'roxo'} texto={parceiro.tipo.replace('Pessoa ', '')} />
                  </Celula>
                  <Celula>
                    <CelulaContato telefone={parceiro.telefone} email={parceiro.email} />
                  </Celula>
                  <Celula>
                    <CelulaCidade cidade={parceiro.cidade} uf={parceiro.uf} />
                  </Celula>
                  <Celula alinhar="centro">
                    <Contagem valor={parceiro.indicacoes} />
                  </Celula>
                  <Celula className="font-semibold whitespace-nowrap">
                    {parceiro.comissoes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </Celula>
                  <Celula>
                    <Selo tipo={SELO_STATUS[parceiro.status]} texto={ROTULO_STATUS[parceiro.status]} />
                  </Celula>
                  <Celula className="whitespace-nowrap">{parceiro.cadastro}</Celula>
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
              total={filteredParceiros.length}
            />
          </EstadoTabela>
        </TabelaCard>
      </div>
    </AdminLayout>
  );
}
