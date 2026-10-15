// Recibos (Etapa 1) — tipos, rótulos e documento para impressão/PDF. Os dados do documento são os gravados na emissão
// (migration 043); a página só lê sob RLS — nada fica em arquivo público.
import { formatarData, formatarMoeda } from './financeiro';
import { mascaraCnpj } from './convites';
import { mascaraCpf } from './clientes';

export type TipoRecibo = 'recebimento' | 'pagamento';
export type FormaRecibo = 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'transferencia' | 'cheque' | 'outro';
export interface ReciboLinha {
  id: string; numero: number; tipo: TipoRecibo; situacao: 'emitido' | 'cancelado'; origem: 'financeiro' | 'manual'; conciliado: boolean; pessoa_nome: string; descricao: string;
  valor: number; data_pagamento: string; forma_pagamento: FormaRecibo; parcial: boolean; id_cliente: string | null; emitido_em: string; total: number;
}
export interface Recibo extends Omit<ReciboLinha, 'total'> {
  emitente_nome: string; emitente_documento: string | null; emitente_cidade: string | null; emitente_contato: string | null; pessoa_documento: string | null;
  valor_extenso: string; valor_total_operacao: number | null; observacoes: string | null; motivo_cancelamento: string | null; cancelado_em: string | null;
  id_lancamento: string | null; id_venda: string | null; id_compra: string | null;
}
export interface ResumoRecibos {
  emitidos: number; emitidos_anterior: number; valor_recebido: number; valor_recebido_anterior: number; valor_pago: number; cancelados: number;
  nao_conciliados: number; mes_quantidade: number; mes_valor: number;
}

export const FORMAS_RECIBO: Record<FormaRecibo, string> = {
  pix: 'Pix', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', boleto: 'Boleto', transferencia: 'Transferência', cheque: 'Cheque', outro: 'Outro',
};
export const TIPO_RECIBO: Record<TipoRecibo, { rotulo: string; titulo: string; selo: 'sucesso' | 'alerta' }> = {
  recebimento: { rotulo: 'Recebimento', titulo: 'RECIBO', selo: 'sucesso' },
  pagamento: { rotulo: 'Pagamento', titulo: 'COMPROVANTE DE PAGAMENTO', selo: 'alerta' },
};
export const numeroRecibo = (n: number) => String(n).padStart(6, '0');
export const mascaraDocumentoLivre = (d: string | null) => (!d ? '' : d.length === 14 ? mascaraCnpj(d) : mascaraCpf(d));

// Texto da declaração (o mesmo na tela e no PDF)
export function declaracao(r: Pick<Recibo, 'tipo' | 'pessoa_nome' | 'valor' | 'valor_extenso' | 'descricao' | 'parcial' | 'valor_total_operacao' | 'emitente_nome'>): string {
  const valor = `${formatarMoeda(r.valor)} (${r.valor_extenso})`;
  const parcial = r.parcial ? `, como pagamento PARCIAL${r.valor_total_operacao ? ` de uma operação de ${formatarMoeda(r.valor_total_operacao)}` : ''}, sem quitação integral` : '';
  return r.tipo === 'recebimento'
    ? `Recebemos de ${r.pessoa_nome} a importância de ${valor}, referente a ${r.descricao}${parcial}.`
    : `${r.emitente_nome} declara que pagou a ${r.pessoa_nome} a importância de ${valor}, referente a ${r.descricao}${parcial}.`;
}

// Mensagem para WhatsApp/e-mail/compartilhar: sem CPF/CNPJ (LGPD). Não envia nada sozinho: só abre o aplicativo.
export function mensagemCompartilhar(r: Recibo): string {
  return `${TIPO_RECIBO[r.tipo].titulo === 'RECIBO' ? 'Recibo' : 'Comprovante de pagamento'} nº ${numeroRecibo(r.numero)} — ${r.emitente_nome}\n`
    + `${r.tipo === 'recebimento' ? 'Pagador' : 'Beneficiário'}: ${r.pessoa_nome}\nValor: ${formatarMoeda(r.valor)}${r.parcial ? ' (pagamento parcial)' : ''}\n`
    + `Referente a: ${r.descricao}\nData do pagamento: ${formatarData(r.data_pagamento)}${r.situacao === 'cancelado' ? '\nATENÇÃO: este documento foi CANCELADO.' : ''}`;
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Documento para imprimir / salvar em PDF pelo navegador
export function htmlRecibo(r: Recibo, segundaVia: boolean): string {
  const t = TIPO_RECIBO[r.tipo];
  const cancelado = r.situacao === 'cancelado';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(t.titulo === 'RECIBO' ? 'Recibo' : 'Comprovante')} ${numeroRecibo(r.numero)} — ${esc(r.emitente_nome)}</title>
<style>@page{size:A4;margin:16mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:13px}.doc{max-width:720px;margin:24px auto;border:1px solid #e5e7eb;border-radius:12px;padding:28px;position:relative}
.top{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #ea580c;padding-bottom:14px}.marca{color:#ea580c;font-weight:900;font-size:13px;letter-spacing:.5px}
h1{font-size:22px;margin:0;text-align:right}.n{text-align:right;color:#444}.sec{margin-top:16px}.sec h2{font-size:11px;color:#666;letter-spacing:.6px;margin:0 0 4px}
.valor{margin:18px 0;background:#f9fafb;border:1px solid #eee;border-radius:10px;padding:16px;text-align:center}.valor b{display:block;font-size:28px}.ext{color:#444}
.aviso{margin-top:14px;font-size:11px;color:#555;border-top:1px solid #eee;padding-top:10px}.ass{margin-top:46px;display:flex;justify-content:flex-end}.ass div{width:300px;border-top:1px solid #333;text-align:center;padding-top:6px;font-size:12px}
.parcial{margin-top:10px;padding:8px 10px;border:1px solid #f59e0b;background:#fffbeb;border-radius:8px;font-weight:bold}
.cancel{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}.cancel span{transform:rotate(-24deg);font-size:72px;font-weight:900;color:rgba(220,38,38,.18);border:6px solid rgba(220,38,38,.18);padding:4px 24px;border-radius:12px}
@media print{.acoes{display:none}.doc{border:none;margin:0}}</style></head><body>
<div class="doc">${cancelado ? '<div class="cancel"><span>CANCELADO</span></div>' : ''}
<div class="top"><div><p class="marca">${esc(r.emitente_nome)}</p>${r.emitente_documento ? `<div>CNPJ: ${esc(mascaraCnpj(r.emitente_documento))}</div>` : ''}${r.emitente_cidade ? `<div>${esc(r.emitente_cidade)}</div>` : ''}${r.emitente_contato ? `<div>${esc(r.emitente_contato)}</div>` : ''}</div>
<div><h1>${esc(t.titulo)}</h1><div class="n">Nº ${numeroRecibo(r.numero)}${segundaVia ? ' — 2ª via' : ''}</div><div class="n">Emitido em ${esc(new Date(r.emitido_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }))}</div></div></div>
<div class="sec"><h2>${r.tipo === 'recebimento' ? 'PAGADOR' : 'BENEFICIÁRIO'}</h2><div><b>${esc(r.pessoa_nome)}</b></div>${r.pessoa_documento ? `<div>${r.pessoa_documento.length === 14 ? 'CNPJ' : 'CPF'}: ${esc(mascaraDocumentoLivre(r.pessoa_documento))}</div>` : ''}</div>
<div class="sec"><h2>DESCRIÇÃO</h2><div>${esc(r.descricao)}</div></div>
<div class="valor">${r.tipo === 'recebimento' ? 'VALOR RECEBIDO' : 'VALOR PAGO'}<b>${esc(formatarMoeda(r.valor))}</b><span class="ext">${esc(r.valor_extenso)}</span></div>
${r.parcial ? `<div class="parcial">PAGAMENTO PARCIAL${r.valor_total_operacao ? ` — valor total da operação: ${esc(formatarMoeda(r.valor_total_operacao))}` : ''}. Este documento não dá quitação integral.</div>` : ''}
<div class="sec">Forma de pagamento: <b>${esc(FORMAS_RECIBO[r.forma_pagamento])}</b> · Data do pagamento: <b>${esc(formatarData(r.data_pagamento))}</b></div>
<p class="sec">${esc(declaracao(r))}</p>
${r.observacoes ? `<p class="sec">Observações: ${esc(r.observacoes)}</p>` : ''}
${cancelado ? `<p class="sec" style="color:#b91c1c"><b>Documento cancelado</b>${r.motivo_cancelamento ? ` — ${esc(r.motivo_cancelamento)}` : ''}.</p>` : ''}
<div class="ass"><div>${esc(r.tipo === 'recebimento' ? r.emitente_nome : 'Assinatura do responsável')}</div></div>
<p class="aviso">${r.tipo === 'pagamento' ? 'Comprovante emitido pela empresa pagadora: não substitui o recibo de quitação emitido por quem recebeu. ' : ''}${r.origem === 'manual' && !r.conciliado ? 'Recibo emitido manualmente, ainda não conciliado com o financeiro da empresa. ' : ''}Recibo não substitui nota fiscal. Documento sem assinatura digital certificada.</p>
<p class="acoes"><button onclick="window.print()">Imprimir / salvar em PDF</button></p></div>
<script>window.onload=function(){window.print()}</script></body></html>`;
}
