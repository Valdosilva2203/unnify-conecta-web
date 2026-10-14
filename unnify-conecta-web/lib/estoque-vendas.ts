// Estoque + Vendas — tipos, rótulos e cálculos de prévia. O banco (migration 041) recalcula e valida tudo de novo.
export type TipoItem = 'produto' | 'servico';
export type SituacaoEstoque = 'em_estoque' | 'estoque_baixo' | 'sem_estoque' | 'servico';
export type SituacaoVenda = 'rascunho' | 'aguardando_pagamento' | 'concluida' | 'cancelada';
export type FormaPagamento = 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'transferencia' | 'outro';

export interface Produto {
  id: string; tipo: TipoItem; nome: string; sku: string | null; codigo_barras: string | null; categoria: string | null; unidade: string;
  custo: number; preco_venda: number; estoque_atual: number; estoque_minimo: number; status: 'ativo' | 'inativo'; situacao_estoque: SituacaoEstoque; total: number;
}
export interface ProdutoCompleto extends Omit<Produto, 'situacao_estoque' | 'total'> { descricao: string | null; criado_em: string; atualizado_em: string }
export interface ResumoEstoque { cadastrados: number; produtos: number; servicos: number; em_estoque: number; estoque_baixo: number; sem_estoque: number; valor_estoque_custo: number; novos_mes: number }

export interface VendaLinha {
  id: string; numero: number; data_venda: string; cliente: string | null; id_cliente: string | null; condicao: 'a_vista' | 'a_prazo'; forma_pagamento: FormaPagamento;
  itens: number; tipos: string | null; total: number; recebido: number; a_receber: number; situacao: SituacaoVenda; total_linhas: number;
}
export interface ResumoVendas { vendido: number; vendido_anterior: number; quantidade: number; quantidade_anterior: number; a_receber: number; a_receber_vencido: number; recebido: number; recebido_anterior: number }

export const SITUACAO_ESTOQUE: Record<SituacaoEstoque, { rotulo: string; selo: 'sucesso' | 'alerta' | 'perigo' | 'info' }> = {
  em_estoque: { rotulo: 'Em estoque', selo: 'sucesso' },
  estoque_baixo: { rotulo: 'Estoque baixo', selo: 'alerta' },
  sem_estoque: { rotulo: 'Sem estoque', selo: 'perigo' },
  servico: { rotulo: 'Serviço', selo: 'info' },
};
export const SITUACAO_VENDA: Record<SituacaoVenda, { rotulo: string; selo: 'sucesso' | 'alerta' | 'neutro' | 'info' }> = {
  rascunho: { rotulo: 'Rascunho', selo: 'neutro' },
  aguardando_pagamento: { rotulo: 'Aguardando pagamento', selo: 'alerta' },
  concluida: { rotulo: 'Concluída', selo: 'sucesso' },
  cancelada: { rotulo: 'Cancelada', selo: 'neutro' },
};
export const FORMAS_PAGAMENTO: Record<FormaPagamento, string> = {
  pix: 'Pix', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', boleto: 'Boleto', transferencia: 'Transferência', outro: 'Outro',
};
export const TIPO_MOVIMENTO: Record<string, string> = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste', venda: 'Venda', estorno_venda: 'Estorno de venda' };

// Quantidades: até 3 casas decimais, vírgula como separador
const fmtQtd = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
export const formatarQuantidade = (v: number | string | null | undefined) => fmtQtd.format(Number(v ?? 0));
export function paraQuantidade(texto: string): number | null {
  const t = texto.trim().replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
export const mascaraQuantidade = (v: string) => v.replace(/[^\d,]/g, '').replace(/,(?=.*,)/g, '').replace(/,(\d{0,3}).*/, ',$1');
export const numeroVenda = (n: number) => `#${String(n).padStart(6, '0')}`;

// Mesma regra do banco: total do item = round(qtd × preço, 2) − desconto do item; total = Σ itens − desconto da venda
export interface ItemCarrinho { id_produto: string; tipo: TipoItem; nome: string; unidade: string; disponivel: number; quantidade: string; preco: string; desconto: string }
const centavos = (v: number) => Math.round(v * 100);
export function totaisCarrinho(itens: ItemCarrinho[], descontoVenda: number, lerValor: (t: string) => number) {
  const linhas = itens.map((i) => {
    const q = paraQuantidade(i.quantidade) ?? 0;
    const bruto = centavos(q * lerValor(i.preco));
    const total = bruto - centavos(lerValor(i.desconto));
    return { ...i, q, totalCentavos: total };
  });
  const subtotal = linhas.reduce((s, l) => s + l.totalCentavos, 0);
  const total = subtotal - centavos(descontoVenda);
  return { linhas, subtotal: subtotal / 100, total: total / 100, valido: linhas.every((l) => l.q > 0 && l.totalCentavos >= 0) && total >= 0 && subtotal >= 0 };
}

export function periodoVendas(chave: 'mes' | 'anterior' | '90' | 'ano', hoje: string): { inicio: string; fim: string } {
  const [a, m] = hoje.split('-').map(Number);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (chave === 'mes') return { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje };
  if (chave === 'anterior') return { inicio: iso(new Date(Date.UTC(a, m - 2, 1))), fim: iso(new Date(Date.UTC(a, m - 1, 0))) };
  if (chave === '90') return { inicio: iso(new Date(Date.UTC(a, m - 1, Number(hoje.slice(8)) - 89))), fim: hoje };
  return { inicio: `${a}-01-01`, fim: hoje };
}
