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


export default function ParceirosPage() {
  // Ainda não existe cadastro de parceiros no sistema: a lista fica vazia (nada fictício).
  const parceiros: Parceiro[] = [];
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [cidadeFilter, setCidadeFilter] = useState('todas');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Calcular stats
  const totalParceiros = parceiros.length;
  const ativosCount = parceiros.filter((p) => p.status === 'ativo').length;
  const pendentesCount = parceiros.filter((p) => p.status === 'pendente').length;
  const inativos = parceiros.filter((p) => p.status === 'inativo').length;

  // Filtrar parceiros
  const filteredParceiros = parceiros.filter((parceiro) => {
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
  const cidades = Array.from(new Set(parceiros.map((p) => p.cidade))).sort();

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

          <EstadoTabela vazio={filteredParceiros.length === 0} mensagemVazio="Ainda não há parceiros cadastrados no sistema.">
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
