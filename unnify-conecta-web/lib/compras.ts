// Compras (Etapa 1) — tipos e rótulos. O banco (migration 042) recalcula e valida tudo de novo.
import type { FormaPagamento } from './estoque-vendas';

export type SituacaoCompra = 'rascunho' | 'solicitada' | 'parcialmente_recebida' | 'recebida' | 'cancelada';

export interface CompraLinha {
  id: string; numero: number; data_compra: string; fornecedor: string | null; id_fornecedor: string | null; condicao: 'a_vista' | 'a_prazo';
  forma_pagamento: FormaPagamento; parcelas: number; itens: number; total: number; valor_recebido: number; pago: number; a_pagar: number;
  situacao: SituacaoCompra; total_linhas: number;
}
export interface ResumoCompras {
  comprado: number; comprado_anterior: number; quantidade: number; a_pagar: number; a_pagar_vencido: number; pago: number; aguardando_entrega: number; recebidas: number;
}
export interface Fornecedor {
  id: string; tipo_pessoa: 'pf' | 'pj'; nome: string; nome_fantasia: string | null; documento: string | null; telefone: string | null; email: string | null;
  cidade: string | null; estado: string | null; status: 'ativo' | 'inativo'; compras: number; total_comprado: number; a_pagar: number; total: number;
}
export interface FornecedorCompleto extends Omit<Fornecedor, 'compras' | 'total_comprado' | 'a_pagar' | 'total'> { endereco: string | null; observacoes: string | null }

export const SITUACAO_COMPRA: Record<SituacaoCompra, { rotulo: string; selo: 'sucesso' | 'alerta' | 'neutro' | 'info' | 'perigo' }> = {
  rascunho: { rotulo: 'Rascunho', selo: 'neutro' },
  solicitada: { rotulo: 'Solicitada', selo: 'info' },
  parcialmente_recebida: { rotulo: 'Parcialmente recebida', selo: 'alerta' },
  recebida: { rotulo: 'Recebida', selo: 'sucesso' },
  cancelada: { rotulo: 'Cancelada', selo: 'perigo' },
};
export const nomeFornecedor = (f: { nome: string; nome_fantasia: string | null }) => f.nome_fantasia || f.nome;
