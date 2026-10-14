// E5 — Saúde Empresarial. Todos os números vêm prontos da função saude_empresarial (migration 000034).
// Aqui ficam só: tipos, a DOCUMENTAÇÃO da metodologia "saude-v1" (exibida na tela) e os textos das recomendações,
// montados exclusivamente a partir dos valores calculados no banco (nada é estimado ou gerado por IA).
import { formatarData, formatarMoeda } from './financeiro';

export type CodigoComponente = 'margem' | 'cobertura' | 'regularidade' | 'evolucao' | 'inadimplencia';
export type FaixaIndice = 'boa' | 'estavel' | 'atencao' | 'critica';
export type Severidade = 'alta' | 'media' | 'info' | 'positiva';

export interface Componente {
  codigo: CodigoComponente;
  peso: number;
  valor: number | null;
  pontos: number | null;
  aplicavel: boolean;
  motivo: string | null;
}
export interface Recomendacao { codigo: string; severidade: Severidade; dados: Record<string, unknown> }
export interface MesFluxo {
  mes: string; parcial: boolean; saldo_final: number | null;
  entradas: number; saidas: number; entradas_nao_operacionais: number; saidas_nao_operacionais: number;
}
export interface MesOperacional { mes: string; receitas_operacionais: number; despesas_operacionais: number }
export interface ContaAVencer { id: string; descricao: string; valor: number; data_vencimento: string; dias: number; natureza: string; categoria: string | null }
export interface CategoriaDespesa { id_categoria: string | null; categoria: string; cor: string; icone: string; valor: number; qtd: number; percentual: number }

export interface SaudeEmpresarial {
  metodologia: string;
  hoje: string;
  meses: number;
  periodo_inicio: string;
  periodo_fim: string;
  periodo_anterior_inicio: string;
  periodo_anterior_fim: string;
  tem_lancamentos: boolean;
  receita_operacional: number; receita_operacional_anterior: number; variacao_receita: number | null;
  despesa_operacional: number; despesa_operacional_anterior: number; variacao_despesa: number | null;
  resultado_operacional: number; resultado_operacional_anterior: number; variacao_resultado: number | null;
  lancamentos_operacionais: number;
  saldo_registrado: number | null;
  qtd_contas: number;
  obrigacoes: { vencidas_valor: number; vencidas_qtd: number; a_vencer_valor: number; a_vencer_qtd: number; total: number };
  indicadores: {
    margem: number | null; cobertura: number | null; comprometimento: number | null;
    inadimplencia: number | null; inadimplencia_base: number; inadimplencia_aberto: number;
    prazo_medio_recebimento: number | null; prazo_medio_base: number;
    regularidade: number | null; regularidade_base: number;
  };
  indice: { valor: number | null; faixa: FaixaIndice | null; cobertura_pesos: number; componentes: Componente[]; insuficiencias: string[] };
  recomendacoes: Recomendacao[];
  despesas_por_categoria: CategoriaDespesa[];
  serie_operacional: MesOperacional[];
  fluxo_caixa: MesFluxo[];
  contas_a_vencer: ContaAVencer[];
}

export const PERIODOS = [
  { meses: 1, rotulo: 'Último mês' },
  { meses: 3, rotulo: 'Últimos 3 meses' },
  { meses: 6, rotulo: 'Últimos 6 meses' },
  { meses: 12, rotulo: 'Últimos 12 meses' },
] as const;

// ===== Metodologia saude-v1 (espelha exatamente a função SQL; mudar regra ou peso = nova versão) =====
export const METODOLOGIA_VERSAO = 'saude-v1';
export const COMPONENTES: Record<CodigoComponente, { nome: string; peso: number; formula: string; fonte: string; criterio: string; ausente: string; limitacao: string }> = {
  margem: {
    nome: 'Margem operacional de caixa',
    peso: 30,
    formula: '(receitas operacionais recebidas − despesas operacionais pagas) ÷ receitas operacionais recebidas',
    fonte: 'Lançamentos pagos no período com classificação “Operacional” (aportes, empréstimos, pró-labore, distribuições e amortizações ficam fora).',
    criterio: '−10% ou menos = 0 ponto; 20% ou mais = 100 pontos; linear entre os dois. Despesas sem nenhuma receita = 0 ponto.',
    ausente: 'Sem receitas nem despesas operacionais liquidadas no período: não aplicável, e o índice não é calculado.',
    limitacao: 'Regime de caixa: não é lucro contábil nem DRE (não considera competência, estoques, depreciação ou impostos a apurar).',
  },
  cobertura: {
    nome: 'Cobertura de obrigações de curto prazo',
    peso: 25,
    formula: 'saldo registrado ÷ (contas a pagar vencidas + contas a pagar com vencimento nos próximos 30 dias)',
    fonte: 'Saldo calculado das contas financeiras e despesas pendentes de qualquer classificação.',
    criterio: '0,5 ou menos = 0 ponto; 1,5 ou mais = 100 pontos; linear entre os dois.',
    ausente: 'Sem contas financeiras cadastradas, ou sem contas a pagar nos próximos 30 dias: não aplicável.',
    limitacao: 'Usa o saldo registrado no sistema, não o saldo bancário confirmado. Não é liquidez corrente contábil (não há balanço patrimonial).',
  },
  regularidade: {
    nome: 'Regularidade de pagamentos',
    peso: 20,
    formula: 'despesas com vencimento no período pagas até o vencimento ÷ despesas com vencimento no período até ontem (canceladas não contam)',
    fonte: 'Datas de vencimento e de pagamento dos lançamentos de despesa.',
    criterio: 'O percentual em dia é a pontuação (ex.: 90% em dia = 90 pontos).',
    ausente: 'Menos de 3 despesas vencidas no período: não aplicável.',
    limitacao: 'Depende de a data de pagamento ser registrada corretamente.',
  },
  evolucao: {
    nome: 'Evolução de receitas e despesas',
    peso: 15,
    formula: 'variação % da receita operacional − variação % da despesa operacional, contra o período anterior de mesma duração',
    fonte: 'Os mesmos lançamentos operacionais pagos, nos dois períodos.',
    criterio: '−20 pontos percentuais ou menos = 0; empate = 50; +20 ou mais = 100; linear.',
    ausente: 'Sem receita ou sem despesa operacional no período anterior: não aplicável.',
    limitacao: 'Sazonalidade pode distorcer comparações de períodos curtos.',
  },
  inadimplencia: {
    nome: 'Inadimplência de recebíveis',
    peso: 10,
    formula: 'valor das receitas operacionais vencidas no período ainda em aberto ÷ valor de todas as receitas operacionais com vencimento no período até ontem',
    fonte: 'Lançamentos de receita operacional (exceto cancelados).',
    criterio: '2% ou menos = 100 pontos; 20% ou mais = 0 ponto; linear entre os dois.',
    ausente: 'Sem receitas com vencimento no período: não aplicável.',
    limitacao: 'Recebimentos não registrados no sistema aparecem como inadimplência.',
  },
};
export const REGRAS_INDICE = [
  'Índice = soma de (pontos × peso) ÷ soma dos pesos APLICÁVEIS, arredondado. Critérios sem dados não contam a favor nem contra.',
  'Só é calculado com: margem aplicável, pelo menos 5 lançamentos operacionais liquidados no período e critérios aplicáveis somando 50% ou mais dos pesos.',
  'Faixas: 80 a 100 Boa · 60 a 79 Estável · 40 a 59 Requer atenção · 0 a 39 Crítica.',
  'Cartões de indicador: “Favorável” com 70 pontos ou mais no critério, “Atenção” de 40 a 69, “Desfavorável” abaixo de 40.',
  'Indicadores complementares (fora do índice): comprometimento das receitas = despesas operacionais ÷ receitas operacionais; prazo médio de recebimento = dias entre competência e recebimento, ponderados pelo valor, só com 5 ou mais recebimentos no período.',
];
export const MOTIVO_COMPONENTE: Record<string, string> = {
  sem_movimento_operacional: 'Sem receitas nem despesas operacionais liquidadas no período.',
  sem_contas: 'Nenhuma conta financeira cadastrada.',
  sem_obrigacoes: 'Sem contas a pagar vencidas ou nos próximos 30 dias.',
  poucas_contas_vencidas: 'Menos de 3 despesas vencidas no período.',
  sem_periodo_anterior: 'Sem receita ou despesa operacional no período anterior.',
  sem_recebiveis_vencidos: 'Sem receitas com vencimento no período.',
};

export const FAIXAS: Record<FaixaIndice, { rotulo: string; cor: string; fundo: string; texto: string; descricao: string }> = {
  boa: { rotulo: 'Boa', cor: '#16a34a', fundo: 'bg-green-50', texto: 'text-green-700', descricao: 'Os indicadores calculados estão dentro das faixas favoráveis da metodologia.' },
  estavel: { rotulo: 'Estável', cor: '#65a30d', fundo: 'bg-lime-50', texto: 'text-lime-700', descricao: 'A maior parte dos indicadores está em faixa adequada, com pontos a acompanhar.' },
  atencao: { rotulo: 'Requer atenção', cor: '#d97706', fundo: 'bg-amber-50', texto: 'text-amber-700', descricao: 'Há indicadores em faixa desfavorável que merecem ação.' },
  critica: { rotulo: 'Crítica', cor: '#dc2626', fundo: 'bg-red-50', texto: 'text-red-700', descricao: 'Vários indicadores estão em faixa desfavorável. Priorize as recomendações.' },
};

export function avaliacaoPontos(pontos: number | null | undefined): { texto: string; classe: string } | null {
  if (pontos === null || pontos === undefined) return null;
  if (pontos >= 70) return { texto: 'Favorável', classe: 'text-green-700' };
  if (pontos >= 40) return { texto: 'Atenção', classe: 'text-amber-700' };
  return { texto: 'Desfavorável', classe: 'text-red-700' };
}

export const percentual = (v: number | null | undefined, casas = 1) =>
  v === null || v === undefined ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas })}%`;
export const decimal = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
export const rotuloPeriodo = (ini: string, fim: string) => `${formatarData(ini)} a ${formatarData(fim)}`;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// ===== Texto das recomendações: só a partir dos números calculados (cada código = uma regra do banco) =====
export interface TextoRecomendacao { titulo: string; explicacao: string; indicador: string; periodo: string; acao: string }
export function textoRecomendacao(r: Recomendacao, s: Pick<SaudeEmpresarial, 'periodo_inicio' | 'periodo_fim' | 'hoje'>): TextoRecomendacao {
  const d = r.dados as Record<string, number & string & string[]>;
  const periodo = `${rotuloPeriodo(s.periodo_inicio, s.periodo_fim)} (comparado ao período anterior de mesma duração)`;
  const hoje = `Situação em ${formatarData(s.hoje)}`;
  switch (r.codigo) {
    case 'saldo_insuficiente':
      return {
        titulo: 'Saldo insuficiente para as contas próximas',
        explicacao: `O saldo registrado (${formatarMoeda(d.saldo)}) não cobre as contas a pagar vencidas e a vencer em 30 dias (${formatarMoeda(d.obrigacoes)}). Faltam ${formatarMoeda(d.falta)}.`,
        indicador: `Cobertura de obrigações de curto prazo: ${d.cobertura === null ? 'saldo negativo' : decimal(d.cobertura)}`,
        periodo: `${hoje} e próximos 30 dias`,
        acao: 'Priorize os pagamentos essenciais, negocie prazos com fornecedores ou antecipe recebimentos.',
      };
    case 'contas_vencidas':
      return {
        titulo: d.aumentou ? 'Aumento de contas vencidas' : 'Contas a pagar vencidas',
        explicacao: `Há ${plural(Number(d.qtd), 'conta vencida', 'contas vencidas')}, somando ${formatarMoeda(d.valor)}. Há 30 dias eram ${Number(d.qtd_30_dias_atras)}.`,
        indicador: 'Contas a pagar vencidas',
        periodo: hoje,
        acao: 'Regularize as contas vencidas para evitar juros e multas, ou registre o pagamento se elas já foram pagas.',
      };
    case 'resultado_negativo':
      return {
        titulo: 'Resultado operacional de caixa negativo',
        explicacao: `As despesas operacionais pagas (${formatarMoeda(d.despesas)}) superaram as receitas operacionais recebidas (${formatarMoeda(d.receitas)}) em ${formatarMoeda(Math.abs(Number(d.resultado)))}.`,
        indicador: `Resultado operacional de caixa: ${formatarMoeda(d.resultado)}`,
        periodo,
        acao: 'Revise as maiores despesas e verifique se há valores a receber em atraso.',
      };
    case 'despesas_acima_receitas':
      return {
        titulo: 'Despesas crescendo acima das receitas',
        explicacao: `Suas despesas operacionais cresceram ${percentual(d.variacao_despesas)} em relação ao período anterior${
          d.variacao_receitas === null ? ', sem receita no período anterior para comparar' : `, enquanto as receitas variaram ${Number(d.variacao_receitas) > 0 ? '+' : ''}${percentual(d.variacao_receitas)}`}.`,
        indicador: 'Evolução de receitas e despesas',
        periodo,
        acao: 'Revise os principais grupos de despesas e identifique oportunidades de redução.',
      };
    case 'inadimplencia_alta':
      return {
        titulo: 'Recebimentos em atraso',
        explicacao: `${percentual(d.percentual)} do valor das receitas que venceram no período segue em aberto (${formatarMoeda(d.valor)} em ${plural(Number(d.qtd), 'lançamento', 'lançamentos')}).`,
        indicador: `Inadimplência de recebíveis: ${percentual(d.percentual)}`,
        periodo,
        acao: 'Cobre os clientes em atraso e registre os recebimentos que já aconteceram.',
      };
    case 'concentracao_despesas':
      return {
        titulo: 'Despesas concentradas em uma categoria',
        explicacao: `“${d.categoria}” representa ${percentual(d.percentual)} das despesas operacionais pagas no período (${formatarMoeda(d.valor)}).`,
        indicador: 'Composição das despesas',
        periodo,
        acao: 'Avalie se essa concentração é esperada e se há espaço para renegociar ou buscar alternativas.',
      };
    case 'sem_contas':
      return {
        titulo: 'Cadastre suas contas financeiras',
        explicacao: 'Sem contas cadastradas não é possível calcular o saldo registrado nem a cobertura das contas a pagar.',
        indicador: 'Saldo registrado',
        periodo: hoje,
        acao: 'Cadastre bancos, caixa e carteiras em Financeiro → Contas e bancos.',
      };
    case 'dados_insuficientes': {
      const motivos = (d.motivos as unknown as string[]).map((m) =>
        m === 'sem_movimento_operacional' ? 'não há receitas nem despesas operacionais liquidadas no período'
          : m === 'poucos_lancamentos' ? `há ${plural(Number(d.lancamentos), 'lançamento operacional liquidado', 'lançamentos operacionais liquidados')} (mínimo de 5)`
          : 'menos da metade dos critérios do índice tem dados');
      return {
        titulo: 'Dados insuficientes para uma análise confiável',
        explicacao: `O índice não foi calculado porque ${motivos.join('; ')}.`,
        indicador: 'Índice de Saúde Empresarial',
        periodo,
        acao: 'Registre as receitas e despesas pagas, os vencimentos em aberto e as contas financeiras da empresa.',
      };
    }
    case 'caixa_saudavel':
      return {
        titulo: 'Mantenha o bom nível de caixa',
        explicacao: `O saldo registrado cobre ${decimal(d.cobertura)} vezes as contas a pagar dos próximos 30 dias, e o resultado operacional de caixa foi positivo (${formatarMoeda(d.resultado)}).`,
        indicador: `Cobertura de obrigações de curto prazo: ${decimal(d.cobertura)}`,
        periodo,
        acao: 'Continue mantendo uma reserva e acompanhe os vencimentos.',
      };
    default:
      return { titulo: 'Recomendação', explicacao: '', indicador: '', periodo, acao: '' };
  }
}
