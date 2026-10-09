'use client';

import { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import Image from 'next/image';

type SecaoAtiva = 'geral' | 'planos' | 'comissoes' | 'seguranca' | 'notificacoes' | 'integracoes' | 'sistema';

interface ConfigGeral {
  nomePlataforma: string;
  nomeFantasia: string;
  cnpj: string;
  emailContato: string;
  telefone: string;
  site: string;
  descricao: string;
  cep: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  pais: string;
}

export default function ConfiguracoesPage() {
  const [secaoAtiva, setSecaoAtiva] = useState<SecaoAtiva>('geral');
  const [configGeral, setConfigGeral] = useState<ConfigGeral>({
    nomePlataforma: 'Unnify Conecta',
    nomeFantasia: 'Unnify Conecta',
    cnpj: '24.214.920/0001-70',
    emailContato: 'contato@unnifyconecta.com.br',
    telefone: '(63) 99999-9999',
    site: 'https://www.unnifyconecta.com.br',
    descricao:
      'O Unnify Conecta é uma plataforma que conecta contadores e empresários, facilitando a gestão documental, obrigações fiscais, financeiro e acesso a crédito empresarial.',
    cep: '77960-000',
    endereco: 'Rua Alagoas, 200',
    bairro: 'Centro',
    cidade: 'Augustinópolis',
    estado: 'TO',
    pais: 'Brasil',
  });

  const secoes = [
    { id: 'geral' as const, label: 'Geral', icon: '⚙️', descricao: 'Informações da plataforma' },
    { id: 'planos' as const, label: 'Planos', icon: '📚', descricao: 'Planos e mensalidades' },
    { id: 'comissoes' as const, label: 'Comissões', icon: '%', descricao: 'Percentuais e regras' },
    { id: 'seguranca' as const, label: 'Segurança', icon: '🔒', descricao: 'Acesso e autenticação' },
    { id: 'notificacoes' as const, label: 'Notificações', icon: '🔔', descricao: 'E-mails e avisos' },
    { id: 'integracoes' as const, label: 'Integrações', icon: '🔗', descricao: 'Serviços externos e APIs' },
    { id: 'sistema' as const, label: 'Sistema', icon: '💾', descricao: 'Informações e manutenção' },
  ];

  const handleSalvarAlteracoes = () => {
    alert('Configurações salvas com sucesso! (Demonstração)');
  };

  const handleInputChange = (field: keyof ConfigGeral, value: string) => {
    setConfigGeral((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Configurações</h1>
            <p className="text-gray-600 mt-2">Gerencie as configurações gerais da plataforma Unnify Conecta.</p>
          </div>
        </div>

        {/* Container com Menu Lateral e Conteúdo */}
        <div className="flex gap-6">
          {/* Menu Lateral */}
          <div className="w-56 flex-shrink-0">
            <nav className="space-y-2">
              {secoes.map((secao) => (
                <button
                  key={secao.id}
                  onClick={() => setSecaoAtiva(secao.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition flex items-start gap-3 ${
                    secaoAtiva === secao.id
                      ? 'bg-orange-50 border-l-4 border-orange-500'
                      : 'hover:bg-gray-50 border-l-4 border-transparent'
                  }`}
                >
                  <span className="text-xl mt-0.5">{secao.icon}</span>
                  <div>
                    <p
                      className={`font-semibold ${
                        secaoAtiva === secao.id ? 'text-orange-600' : 'text-gray-700'
                      }`}
                    >
                      {secao.label}
                    </p>
                    <p className="text-xs text-gray-500">{secao.descricao}</p>
                  </div>
                </button>
              ))}
            </nav>
          </div>

          {/* Conteúdo Principal */}
          <div className="flex-1 bg-white rounded-lg border border-gray-200 p-6">
            {/* SEÇÃO GERAL */}
            {secaoAtiva === 'geral' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Informações gerais</h2>
                  <p className="text-gray-600 mb-6">Configure as informações principais da plataforma.</p>
                </div>

                {/* Campos de Informações */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Nome da plataforma</label>
                    <input
                      type="text"
                      value={configGeral.nomePlataforma}
                      onChange={(e) => handleInputChange('nomePlataforma', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Nome fantasia</label>
                    <input
                      type="text"
                      value={configGeral.nomeFantasia}
                      onChange={(e) => handleInputChange('nomeFantasia', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">CNPJ</label>
                    <input
                      type="text"
                      value={configGeral.cnpj}
                      onChange={(e) => handleInputChange('cnpj', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">E-mail de contato</label>
                    <input
                      type="email"
                      value={configGeral.emailContato}
                      onChange={(e) => handleInputChange('emailContato', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Telefone</label>
                    <input
                      type="text"
                      value={configGeral.telefone}
                      onChange={(e) => handleInputChange('telefone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Site</label>
                    <input
                      type="text"
                      value={configGeral.site}
                      onChange={(e) => handleInputChange('site', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>

                {/* Logo da Plataforma */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Logo da plataforma</h3>
                  <p className="text-sm text-gray-600 mb-4">Imagem em PNG ou JPG. Tamanho máximo de 2MB.</p>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center justify-center bg-gray-50">
                    <div className="relative w-32 h-32 mb-4">
                      <Image
                        src="/brand/unnify-conecta.svg"
                        alt="Unnify Conecta"
                        width={128}
                        height={128}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center gap-2">
                        <span>⬆️</span> Alterar logo
                      </button>
                      <button className="px-4 py-2 bg-white border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition flex items-center gap-2">
                        <span>🗑️</span> Remover
                      </button>
                    </div>
                  </div>
                </div>

                {/* Descrição */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Descrição da plataforma</h3>
                  <div className="relative">
                    <textarea
                      value={configGeral.descricao}
                      onChange={(e) => handleInputChange('descricao', e.target.value)}
                      maxLength={500}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none h-32"
                    />
                    <p className="text-xs text-gray-500 mt-2 text-right">
                      {configGeral.descricao.length}/500
                    </p>
                  </div>
                </div>

                {/* Endereço */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Endereço</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">CEP</label>
                      <input
                        type="text"
                        value={configGeral.cep}
                        onChange={(e) => handleInputChange('cep', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Endereço</label>
                      <input
                        type="text"
                        value={configGeral.endereco}
                        onChange={(e) => handleInputChange('endereco', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Bairro</label>
                      <input
                        type="text"
                        value={configGeral.bairro}
                        onChange={(e) => handleInputChange('bairro', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Cidade</label>
                      <input
                        type="text"
                        value={configGeral.cidade}
                        onChange={(e) => handleInputChange('cidade', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Estado</label>
                      <select
                        value={configGeral.estado}
                        onChange={(e) => handleInputChange('estado', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                      >
                        <option value="TO">TO</option>
                        <option value="SP">SP</option>
                        <option value="RJ">RJ</option>
                        <option value="MG">MG</option>
                        <option value="BA">BA</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">País</label>
                    <select
                      value={configGeral.pais}
                      onChange={(e) => handleInputChange('pais', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    >
                      <option value="Brasil">Brasil</option>
                    </select>
                  </div>
                </div>

                {/* Botão Salvar */}
                <div className="border-t pt-6 flex justify-end">
                  <button
                    onClick={handleSalvarAlteracoes}
                    className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition flex items-center gap-2"
                  >
                    <span>💾</span> Salvar alterações
                  </button>
                </div>
              </div>
            )}

            {/* SEÇÃO PLANOS */}
            {secaoAtiva === 'planos' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Planos e Mensalidades</h2>
                  <p className="text-gray-600 mb-6">Gerencie os planos disponíveis na plataforma.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { nome: 'Básico', preco: '49,90', cor: 'blue' },
                    { nome: 'Pro', preco: '99,90', cor: 'purple' },
                    { nome: 'Premium', preco: '149,90', cor: 'violet' },
                  ].map((plano) => (
                    <div key={plano.nome} className={`bg-${plano.cor}-50 border border-${plano.cor}-200 rounded-lg p-6`}>
                      <h3 className={`text-xl font-bold text-${plano.cor}-900 mb-2`}>{plano.nome}</h3>
                      <p className={`text-3xl font-bold text-${plano.cor}-600 mb-2`}>R$ {plano.preco}</p>
                      <p className="text-sm text-gray-600 mb-4">/mês</p>
                      <p className="text-sm text-gray-700 mb-4">
                        Plano {plano.nome.toLowerCase()} com acesso completo à plataforma.
                      </p>
                      <button className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm font-semibold">
                        Editar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SEÇÃO COMISSÕES */}
            {secaoAtiva === 'comissoes' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Configuração de Comissões</h2>
                  <p className="text-gray-600 mb-6">Defina percentuais e regras de comissões.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Comissão de contadores (%)</label>
                    <input
                      type="number"
                      defaultValue="20"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Comissão de parceiros (%)</label>
                    <input
                      type="number"
                      defaultValue="15"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Recorrência da comissão</label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none">
                      <option>Mensal</option>
                      <option>Trimestral</option>
                      <option>Anual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Prazo de pagamento (dias)</label>
                    <input
                      type="number"
                      defaultValue="30"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>

                <div className="border-t pt-6 flex justify-end">
                  <button className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition">
                    Salvar alterações
                  </button>
                </div>
              </div>
            )}

            {/* SEÇÃO SEGURANÇA */}
            {secaoAtiva === 'seguranca' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Configurações de Segurança</h2>
                  <p className="text-gray-600 mb-6">Gerencie políticas de acesso e autenticação.</p>
                </div>

                <div className="space-y-4">
                  {[
                    { label: 'Autenticação multifator', desc: 'Exigir 2FA para login' },
                    { label: 'Força de senha', desc: 'Política de senhas robustas' },
                    { label: 'Sessão expirada', desc: 'Tempo de inatividade antes de logout' },
                    { label: 'Tentativas de login', desc: 'Limite de tentativas incorretas' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-900">{item.label}</p>
                        <p className="text-sm text-gray-600">{item.desc}</p>
                      </div>
                      <input type="checkbox" className="w-5 h-5 rounded" />
                    </div>
                  ))}
                </div>

                <div className="border-t pt-6 flex justify-end">
                  <button className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition">
                    Salvar alterações
                  </button>
                </div>
              </div>
            )}

            {/* SEÇÃO NOTIFICAÇÕES */}
            {secaoAtiva === 'notificacoes' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Preferências de Notificações</h2>
                  <p className="text-gray-600 mb-6">Gerencie as notificações do sistema.</p>
                </div>

                <div className="space-y-4">
                  {[
                    { label: 'E-mails transacionais', desc: 'Confirmações e alertas operacionais' },
                    { label: 'Avisos de pagamento', desc: 'Notificações sobre vencimentos' },
                    { label: 'Novos cadastros', desc: 'Alertas de novos usuários' },
                    { label: 'Alertas administrativos', desc: 'Notificações críticas do sistema' },
                    { label: 'Notificações de segurança', desc: 'Alertas de segurança e violações' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-900">{item.label}</p>
                        <p className="text-sm text-gray-600">{item.desc}</p>
                      </div>
                      <input type="checkbox" className="w-5 h-5 rounded" defaultChecked />
                    </div>
                  ))}
                </div>

                <div className="border-t pt-6 flex justify-end">
                  <button className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition">
                    Salvar alterações
                  </button>
                </div>
              </div>
            )}

            {/* SEÇÃO INTEGRAÇÕES */}
            {secaoAtiva === 'integracoes' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Integrações Externas</h2>
                  <p className="text-gray-600 mb-6">Gerencie integrações com serviços externos.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { nome: 'Supabase', status: 'Conectado', icon: '🗄️' },
                    { nome: 'Gateway de Pagamento', status: 'Conectado', icon: '💳' },
                    { nome: 'Serviço de E-mail', status: 'Conectado', icon: '📧' },
                    { nome: 'API Bancária', status: 'Desconectado', icon: '🏦' },
                  ].map((integracao) => (
                    <div key={integracao.nome} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{integracao.icon}</span>
                          <p className="font-semibold text-gray-900">{integracao.nome}</p>
                        </div>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-full ${
                            integracao.status === 'Conectado'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {integracao.status}
                        </span>
                      </div>
                      <button className="text-sm text-orange-600 hover:text-orange-700 font-semibold">
                        Configurar →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SEÇÃO SISTEMA */}
            {secaoAtiva === 'sistema' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Informações do Sistema</h2>
                  <p className="text-gray-600 mb-6">Informações técnicas e manutenção.</p>
                </div>

                <div className="space-y-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Nome da aplicação</p>
                    <p className="font-semibold text-gray-900">Unnify Conecta</p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Versão</p>
                    <p className="font-semibold text-gray-900">1.0.0.2</p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Ambiente</p>
                    <p className="font-semibold text-gray-900">Produção</p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Status dos serviços</p>
                    <p className="font-semibold text-green-600">✓ Todos os serviços operacionais</p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Próxima manutenção programada</p>
                    <p className="font-semibold text-gray-900">Não há manutenção agendada</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
