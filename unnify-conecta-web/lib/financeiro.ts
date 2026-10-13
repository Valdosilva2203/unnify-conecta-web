// Utilitários do Financeiro. Regra: o navegador NÃO calcula totais (isso é feito no banco,
// em resumo_financeiro). Valores digitados viram texto decimal exato ("1234.56"), nunca float.

export type TipoLancamento = 'receita' | 'despesa';
export type Situacao = 'pendente' | 'vencido' | 'pago' | 'cancelado';

export interface Categoria {
  id: string;
  tipo: TipoLancamento;
  nome: string;
  cor: string;
  icone: string;
  ativa: boolean;
}

export interface Lancamento {
  id: string;
  id_empresa: string;
  tipo: TipoLancamento;
  descricao: string;
  valor: number;
  id_categoria: string;
  categoria_nome: string;
  categoria_cor: string;
  categoria_icone: string;
  data_competencia: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: 'pendente' | 'pago' | 'cancelado';
  situacao: Situacao;
  contraparte: string | null;
  observacoes: string | null;
  qtd_anexos: number;
  id_conta_financeira: string | null;
  conta_nome: string | null;
  // Parcela de contrato (Parcelamentos)
  id_contrato: string | null;
  numero_parcela: number | null;
  natureza_financeira: 'operacional' | 'financiamento';
  valor_juros: number | null;
  contrato_nome: string | null;
  contrato_qtd_parcelas: number | null;
}

export const ROTULO_SITUACAO: Record<Situacao, { receita: string; despesa: string }> = {
  pendente: { receita: 'A receber', despesa: 'A pagar' },
  vencido: { receita: 'Vencido', despesa: 'Vencido' },
  pago: { receita: 'Recebido', despesa: 'Pago' },
  cancelado: { receita: 'Cancelado', despesa: 'Cancelado' },
};

export const SELO_SITUACAO = { pendente: 'alerta', vencido: 'perigo', pago: 'sucesso', cancelado: 'neutro' } as const;

const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatarMoeda = (valor: number | string | null | undefined) => formatador.format(Number(valor ?? 0));

// Máscara de digitação: só dígitos, interpretados como centavos ("123456" → "1.234,56").
export function mascaraMoeda(texto: string): string {
  const digitos = texto.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 14);
  if (!digitos) return '';
  const centavos = digitos.padStart(3, '0');
  const inteiro = centavos.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${inteiro},${centavos.slice(-2)}`;
}

// "1.234,56" → "1234.56" (texto decimal exato para o banco); null se inválido ou zero.
export function paraDecimal(texto: string): string | null {
  const digitos = texto.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digitos || /^0+$/.test(digitos) || digitos.length > 14) return null;
  const centavos = digitos.padStart(3, '0');
  return `${centavos.slice(0, -2)}.${centavos.slice(-2)}`;
}

// Valor vindo do banco (número com até 2 casas) → máscara de edição.
export const valorParaMascara = (valor: number) => mascaraMoeda(Math.round(Number(valor) * 100).toString());

// Datas civis de Brasília (mesma regra do banco: hoje_brasil()).
export const hojeBrasil = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export const inicioDoMes = (iso: string) => `${iso.slice(0, 7)}-01`;

export function somarMeses(isoInicioMes: string, meses: number): string {
  const [a, m] = isoInicioMes.split('-').map(Number);
  const total = a * 12 + (m - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

export function fimDoMes(isoInicioMes: string): string {
  const proximo = somarMeses(isoInicioMes, 1);
  const d = new Date(`${proximo}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const rotuloMes = (isoInicioMes: string) => `${MESES[Number(isoInicioMes.slice(5, 7)) - 1]} de ${isoInicioMes.slice(0, 4)}`;
export const rotuloMesCurto = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1].slice(0, 3);

// "2026-10-12" → "12/10/2026" sem passar por fuso horário.
export const formatarData = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

export interface ContaFinanceira {
  id: string;
  nome: string;
  instituicao: string | null;
  tipo: TipoConta;
  saldo_inicial: number;
  data_saldo_inicial: string;
  principal: boolean;
  permite_saldo_negativo: boolean;
  arquivada_em: string | null;
  saldo: number;
  cor: string;
}

// Cores disponíveis para o card da conta (só aparência)
export const CORES_CONTA = [
  { valor: '#ea580c', nome: 'Laranja' },
  { valor: '#2563eb', nome: 'Azul' },
  { valor: '#16a34a', nome: 'Verde' },
  { valor: '#7c3aed', nome: 'Roxo' },
  { valor: '#db2777', nome: 'Rosa' },
  { valor: '#dc2626', nome: 'Vermelho' },
  { valor: '#ca8a04', nome: 'Amarelo' },
  { valor: '#0d9488', nome: 'Verde-água' },
  { valor: '#0f172a', nome: 'Grafite' },
  { valor: '#64748b', nome: 'Cinza' },
];

export type TipoConta = 'conta_corrente' | 'poupanca' | 'caixa' | 'carteira_digital' | 'outra';
export const TIPOS_CONTA: Record<TipoConta, string> = {
  conta_corrente: 'Conta corrente',
  poupanca: 'Poupança',
  caixa: 'Caixa físico',
  carteira_digital: 'Carteira digital',
  outra: 'Outra',
};

// Prévia de saldo na tela (somente exibição): soma em centavos inteiros, sem acumular erro de float.
export function previaSaldo(saldo: number, valor: string | null, natureza: 'entrada' | 'saida'): number {
  const atual = Math.round(Number(saldo) * 100);
  const mov = valor ? Math.round(Number(valor) * 100) : 0;
  return (natureza === 'entrada' ? atual + mov : atual - mov) / 100;
}

// "-1.234,56" aceito para saldo inicial (pode ser negativo, ex.: cheque especial)
export function paraDecimalComSinal(texto: string): string | null {
  const negativo = texto.trim().startsWith('-');
  const digitos = texto.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (digitos.length > 14) return null;
  if (!digitos) return '0.00';
  const centavos = digitos.padStart(3, '0');
  const valor = `${centavos.slice(0, -2)}.${centavos.slice(-2)}`;
  return negativo && !/^0+\.00$/.test(valor) ? `-${valor}` : valor;
}

export const ARQUIVOS_COMPROVANTE = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const TAMANHO_MAXIMO_COMPROVANTE = 10 * 1024 * 1024;
