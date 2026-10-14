// Relatórios (Etapa 1) — tipos, critérios do detalhamento e exportação. Números agregados vêm de relatorio_financeiro
// (migration 040); o detalhamento lê a visão lancamentos_financeiros_situacao (mesma RLS do Financeiro).
import { createClient } from './supabase/client';
import { formatarData, formatarMoeda } from './financeiro';

export interface Faixas { total: number; vencido: number; vencendo_7: number; em_dia: number; qtd: number }
export interface RelatorioFinanceiro {
  periodo_inicio: string; periodo_fim: string; anterior_inicio: string; anterior_fim: string; hoje: string;
  receitas: number; receitas_anterior: number; receitas_qtd: number;
  despesas: number; despesas_anterior: number; despesas_qtd: number;
  resultado: number; resultado_anterior: number;
  nao_operacionais_entradas: number; nao_operacionais_saidas: number;
  a_receber: Faixas; a_pagar: Faixas;
  despesas_por_categoria: { id_categoria: string | null; categoria: string; cor: string; icone: string; valor: number }[];
  serie: { mes: string; receitas: number; despesas: number; entradas: number; saidas: number }[];
}

// Critérios do detalhamento (os mesmos da função do banco)
export type ModoDetalhe = 'receitas' | 'despesas' | 'receber' | 'pagar' | 'todos';
export const MODOS: Record<ModoDetalhe, { rotulo: string; data: 'data_pagamento' | 'data_vencimento' | 'data_competencia'; criterio: string }> = {
  receitas: { rotulo: 'Receitas realizadas', data: 'data_pagamento', criterio: 'Receitas operacionais recebidas no período (data de pagamento).' },
  despesas: { rotulo: 'Despesas realizadas', data: 'data_pagamento', criterio: 'Despesas operacionais pagas no período (data de pagamento).' },
  receber: { rotulo: 'Contas a receber', data: 'data_vencimento', criterio: 'Receitas pendentes hoje, por vencimento (vencidas e a vencer).' },
  pagar: { rotulo: 'Contas a pagar', data: 'data_vencimento', criterio: 'Despesas pendentes hoje, por vencimento (vencidas e a vencer).' },
  todos: { rotulo: 'Todos os lançamentos', data: 'data_competencia', criterio: 'Todos os lançamentos com competência no período (previstos e realizados).' },
};
export const COLUNAS_DETALHE = 'id, tipo, descricao, valor, categoria_nome, data_competencia, data_vencimento, data_pagamento, status, situacao, contraparte, natureza_financeira';
export interface LinhaDetalhe { id: string; tipo: 'receita' | 'despesa'; descricao: string; valor: number; categoria_nome: string | null; data_competencia: string;
  data_vencimento: string | null; data_pagamento: string | null; status: string; situacao: string; contraparte: string | null; natureza_financeira: string }

export interface FiltrosDetalhe { idEmpresa: string; modo: ModoDetalhe; inicio: string; fim: string; idCategoria: string; situacao: string }
export function consultaDetalhe(f: FiltrosDetalhe) {
  let q = createClient().from('lancamentos_financeiros_situacao').select(COLUNAS_DETALHE, { count: 'exact' }).eq('id_empresa', f.idEmpresa);
  if (f.modo === 'receitas' || f.modo === 'despesas') {
    q = q.eq('tipo', f.modo === 'receitas' ? 'receita' : 'despesa').eq('natureza_financeira', 'operacional').eq('status', 'pago').gte('data_pagamento', f.inicio).lte('data_pagamento', f.fim);
  } else if (f.modo === 'receber' || f.modo === 'pagar') {
    q = q.eq('tipo', f.modo === 'receber' ? 'receita' : 'despesa').eq('status', 'pendente');
  } else {
    q = q.neq('status', 'cancelado').gte('data_competencia', f.inicio).lte('data_competencia', f.fim);
  }
  if (f.idCategoria) q = q.eq('id_categoria', f.idCategoria);
  if (f.situacao) q = q.eq('situacao', f.situacao);
  return q.order(MODOS[f.modo].data, { ascending: f.modo === 'receber' || f.modo === 'pagar', nullsFirst: false }).order('descricao');
}

export const ROTULO_SITUACAO_DETALHE: Record<string, string> = { pago: 'Realizado', pendente: 'A vencer', vencido: 'Vencido', cancelado: 'Cancelado' };

// ===== Exportação (mesmos filtros e mesma sessão/RLS da tela) =====
const LIMITE_EXPORTACAO = 10000;
export async function buscarTudo(f: FiltrosDetalhe): Promise<{ linhas: LinhaDetalhe[]; truncado: boolean } | { erro: string }> {
  const linhas: LinhaDetalhe[] = [];
  for (let ini = 0; ini < LIMITE_EXPORTACAO; ini += 1000) {
    const { data, error } = await consultaDetalhe(f).range(ini, ini + 999);
    if (error) return { erro: 'Não foi possível gerar a exportação.' };
    linhas.push(...((data ?? []) as LinhaDetalhe[]));
    if (!data || data.length < 1000) return { linhas, truncado: false };
  }
  return { linhas, truncado: true };
}

// CSV para Excel em português (; e BOM). Células que começam com = + - @ são neutralizadas (injeção de fórmula).
const celula = (v: unknown) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function gerarCsv(linhas: LinhaDetalhe[], modo: ModoDetalhe): string {
  const cab = ['Data', 'Descrição', 'Categoria', 'Tipo', 'Classificação', 'Valor', 'Situação', 'Cliente/Fornecedor'];
  const corpo = linhas.map((l) => [formatarData(l[MODOS[modo].data] ?? l.data_competencia), l.descricao, l.categoria_nome ?? '', l.tipo === 'receita' ? 'Receita' : 'Despesa',
    l.natureza_financeira === 'operacional' ? 'Operacional' : l.natureza_financeira, Number(l.valor).toFixed(2).replace('.', ','), ROTULO_SITUACAO_DETALHE[l.situacao] ?? l.situacao, l.contraparte ?? '']);
  return '﻿' + [cab, ...corpo].map((r) => r.map(celula).join(';')).join('\r\n');
}
export function baixarArquivo(conteudo: string, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// PDF: página de impressão (o navegador salva em PDF) com resumo + registros do detalhamento
export function htmlRelatorio(empresa: string, r: RelatorioFinanceiro, linhas: LinhaDetalhe[], modo: ModoDetalhe, truncado: boolean): string {
  const ind = [['Receitas realizadas', r.receitas], ['Despesas realizadas', r.despesas], ['Resultado gerencial (caixa)', r.resultado], ['A receber (hoje)', r.a_receber.total], ['A pagar (hoje)', r.a_pagar.total]];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório — ${esc(empresa)}</title>
<style>body{font-family:Arial,sans-serif;color:#111;margin:24px;font-size:12px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px}
.k{display:inline-block;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin:0 6px 6px 0;min-width:150px}.k b{display:block;font-size:14px}
table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #eee;padding:4px 6px;text-align:left}td.v{text-align:right;white-space:nowrap}
.n{color:#666;font-size:11px}@media print{button{display:none}}</style></head><body>
<p style="color:#ea580c;font-weight:bold;margin:0">UNNIFY CONECTA</p><h1>Relatório financeiro — ${esc(empresa)}</h1>
<p class="n">Período: ${formatarData(r.periodo_inicio)} a ${formatarData(r.periodo_fim)} · comparação: ${formatarData(r.anterior_inicio)} a ${formatarData(r.anterior_fim)} · gerado em ${esc(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</p>
<div>${ind.map(([t, v]) => `<span class="k">${esc(t)}<b>${esc(formatarMoeda(v as number))}</b></span>`).join('')}</div>
<p class="n">Resultado gerencial = receitas operacionais recebidas − despesas operacionais pagas. Não é lucro contábil. Contas a receber/pagar: pendentes na data de hoje.</p>
<h2>Despesas por categoria</h2><table><tr><th>Categoria</th><th class="v">Valor</th></tr>${r.despesas_por_categoria.map((c) => `<tr><td>${esc(c.categoria)}</td><td class="v">${esc(formatarMoeda(c.valor))}</td></tr>`).join('') || '<tr><td colspan="2">Sem despesas realizadas no período.</td></tr>'}</table>
<h2>${esc(MODOS[modo].rotulo)}</h2><p class="n">${esc(MODOS[modo].criterio)}${truncado ? ' Exibindo os primeiros 10.000 registros.' : ''}</p>
<table><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Situação</th><th>Cliente/Fornecedor</th><th class="v">Valor</th></tr>
${linhas.map((l) => `<tr><td>${esc(formatarData(l[MODOS[modo].data] ?? l.data_competencia))}</td><td>${esc(l.descricao)}</td><td>${esc(l.categoria_nome ?? '')}</td><td>${esc(ROTULO_SITUACAO_DETALHE[l.situacao] ?? l.situacao)}</td><td>${esc(l.contraparte ?? '')}</td><td class="v">${esc(formatarMoeda(l.valor))}</td></tr>`).join('') || '<tr><td colspan="6">Nenhum registro.</td></tr>'}
</table><p><button onclick="window.print()">Imprimir / salvar em PDF</button></p><script>window.onload=function(){window.print()}</script></body></html>`;
}

export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 1000) / 10;
}
