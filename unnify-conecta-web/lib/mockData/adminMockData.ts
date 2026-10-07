// Mock data for admin dashboard
// All data is fictional and static
// No connection to Supabase - for UI development only

export const adminMockData = {
  // KPI Cards
  stats: {
    companies: {
      value: 1247,
      change: 42,
      period: 'este mês',
    },
    offices: {
      value: 86,
      change: 7,
      period: 'este mês',
    },
    activeSubscriptions: {
      value: 1038,
      percentage: 83.2,
      label: 'da base',
    },
    mrr: {
      value: 103696,
      change: 8.4,
      period: 'no mês',
    },
  },

  // Growth Chart Data
  growthData: {
    companies: [
      { month: 'Jan', value: 320 },
      { month: 'Fev', value: 450 },
      { month: 'Mar', value: 620 },
      { month: 'Abr', value: 710 },
      { month: 'Mai', value: 700 },
      { month: 'Jun', value: 800 },
      { month: 'Jul', value: 970 },
      { month: 'Ago', value: 1050 },
      { month: 'Set', value: 1150 },
      { month: 'Out', value: 1247 },
    ],
    subscriptions: [
      { month: 'Jan', value: 280 },
      { month: 'Fev', value: 380 },
      { month: 'Mar', value: 520 },
      { month: 'Abr', value: 610 },
      { month: 'Mai', value: 650 },
      { month: 'Jun', value: 720 },
      { month: 'Jul', value: 850 },
      { month: 'Ago', value: 940 },
      { month: 'Set', value: 1038 },
      { month: 'Out', value: 1100 },
    ],
    mrr: [
      { month: 'Jan', value: 14000 },
      { month: 'Fev', value: 19000 },
      { month: 'Mar', value: 26000 },
      { month: 'Abr', value: 35000 },
      { month: 'Mai', value: 43000 },
      { month: 'Jun', value: 52000 },
      { month: 'Jul', value: 65000 },
      { month: 'Ago', value: 78000 },
      { month: 'Set', value: 93000 },
      { month: 'Out', value: 103696 },
    ],
  },

  // Plans Distribution
  plansDistribution: [
    { name: 'Essencial', value: 327, percentage: 31.5 },
    { name: 'Inteligente', value: 548, percentage: 52.8 },
    { name: 'Performance', value: 163, percentage: 15.7 },
  ],

  // Recent Companies
  recentCompanies: [
    {
      id: 1,
      name: 'Comercial Silva LTDA',
      date: 'Hoje, 10:24',
      status: 'Ativa',
      icon: '🏢',
    },
    {
      id: 2,
      name: 'Farmácia Vida Nova',
      date: 'Hoje, 09:17',
      status: 'Ativa',
      icon: '💊',
    },
    {
      id: 3,
      name: 'Construtora Horizonte',
      date: 'Ontem, 16:42',
      status: 'Ativa',
      icon: '🏗️',
    },
    {
      id: 4,
      name: 'Mercado Bom Preço',
      date: 'Ontem, 14:03',
      status: 'Ativa',
      icon: '🛒',
    },
    {
      id: 5,
      name: 'Auto Peças Centro',
      date: 'Ontem, 11:28',
      status: 'Ativa',
      icon: '🚗',
    },
  ],

  // Recent Offices
  recentOffices: [
    {
      id: 1,
      initials: 'OC',
      name: 'Oliveira Assessoria Contábil',
      date: 'Hoje, 09:45',
      status: 'Ativo',
    },
    {
      id: 2,
      initials: 'MC',
      name: 'Matos Contabilidade',
      date: 'Ontem, 15:31',
      status: 'Ativo',
    },
    {
      id: 3,
      initials: 'RS',
      name: 'Ribeiro & Souza Contábil',
      date: 'Ontem, 10:22',
      status: 'Ativo',
    },
    {
      id: 4,
      initials: 'LC',
      name: 'Lima Consultoria',
      date: '28/09/2026',
      status: 'Ativo',
    },
    {
      id: 5,
      initials: 'BC',
      name: 'Barros Contabilidade',
      date: '27/09/2026',
      status: 'Ativo',
    },
  ],

  // Recent Activity
  recentActivity: [
    {
      id: 1,
      type: 'company_created',
      title: 'Nova empresa cadastrada',
      detail: 'Comercial Silva LTDA',
      date: 'Hoje, 10:24',
      icon: '🏢',
    },
    {
      id: 2,
      type: 'subscription_activated',
      title: 'Assinatura ativada',
      detail: 'Farmácia Vida Nova — Plano Inteligente',
      date: 'Hoje, 09:17',
      icon: '✅',
    },
    {
      id: 3,
      type: 'office_created',
      title: 'Novo escritório cadastrado',
      detail: 'Oliveira Assessoria Contábil',
      date: 'Hoje, 09:45',
      icon: '🏢',
    },
    {
      id: 4,
      type: 'payment_confirmed',
      title: 'Pagamento confirmado',
      detail: 'Mercado Bom Preço — R$ 99,90',
      date: 'Ontem, 14:03',
      icon: '💰',
    },
    {
      id: 5,
      type: 'plan_changed',
      title: 'Plano alterado',
      detail: 'Construtora Horizonte — Essencial → Inteligente',
      date: 'Ontem, 11:28',
      icon: '📈',
    },
  ],

  // Attention Items
  attention: [
    {
      id: 1,
      count: 12,
      title: 'Pagamentos pendentes',
      description: 'Assinaturas com faturas em aberto',
    },
    {
      id: 2,
      count: 3,
      title: 'Contas sinalizadas',
      description: 'Necessitam de análise',
    },
    {
      id: 3,
      count: 2,
      title: 'Ações administrativas pendentes',
      description: 'Aguardando revisão',
    },
  ],

  // Admin User
  admin: {
    name: 'Valdo Silva',
    role: 'Admin Master',
    avatar: '/brand/unnify-icon.png',
  },

  // Period
  period: {
    start: '01 de Set de 2026',
    end: '30 de Set de 2026',
  },
};
