// Rótulos e listas do domínio contábil. Os valores espelham as restrições do banco
// (vinculos_contabeis e perfis_profissionais) — alterar os dois juntos.
import { MENSAGEM_RECURSO_AUSENTE, recursoAusente } from './erros-banco';

export const ESPECIALIDADES = [
  'MEI',
  'Simples Nacional',
  'Lucro Presumido',
  'Lucro Real',
  'Folha de Pagamento',
  'Abertura de Empresas',
  'Fiscal',
  'Contábil',
  'Trabalhista',
  'BPO Financeiro',
  'Planejamento Tributário',
  'Imposto de Renda',
] as const;

export const MODALIDADES = {
  online: 'Online',
  presencial: 'Presencial no escritório',
  visita_cliente: 'Visita à empresa do cliente',
  telefone_whatsapp: 'Telefone/WhatsApp',
} as const;
export type Modalidade = keyof typeof MODALIDADES;

export const descreverModalidades = (lista: string[] | null | undefined) =>
  (lista ?? []).map((m) => MODALIDADES[m as Modalidade] ?? m).join(' · ');

export const FUNCOES = {
  principal: 'Contador principal',
  fiscal: 'Fiscal',
  folha_pagamento: 'Folha de pagamento',
  consultoria: 'Consultoria',
  auxiliar: 'Auxiliar',
} as const;
export type Funcao = keyof typeof FUNCOES;

export const PERMISSOES = {
  ver_dados_cadastrais: 'Ver dados cadastrais',
  ver_documentos: 'Ver documentos',
  enviar_documentos: 'Enviar documentos',
  ver_financeiro: 'Ver financeiro e saúde empresarial',
  gerenciar_obrigacoes: 'Gerenciar obrigações',
  ver_folha: 'Ver folha de pagamento',
  ver_comprovantes_financeiros: 'Ver comprovantes financeiros',
  exportar_financeiro: 'Exportar financeiro',
  gerenciar_financeiro: 'Gerenciar lançamentos financeiros',
  gerenciar_impostos: 'Gerenciar impostos e parcelamentos',
  gerenciar_agenda: 'Agenda compartilhada (compromissos com a empresa)',
  gerenciar_certidoes: 'Gerenciar certidões',
  processar_folha: 'Processar folha de pagamento (receber, corrigir e devolver)',
} as const;
export type Permissao = keyof typeof PERMISSOES;

export const STATUS_VINCULO = {
  pendente: 'Pendente',
  ativo: 'Ativo',
  recusado: 'Recusado',
  encerrado: 'Encerrado',
} as const;
export type StatusVinculo = keyof typeof STATUS_VINCULO;

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export function formatarTelefone(valor: string | null | undefined): string {
  const d = (valor || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor || '';
}

export function formatarCnpj(valor: string | null | undefined): string {
  const d = (valor || '').replace(/\D/g, '');
  if (d.length !== 14) return valor || '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function iniciaisDe(nome: string): string {
  return nome
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-ZÀ-Ú]/.test(p))
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

// Traduz erros das funções do banco sem expor detalhes internos.
export function mensagemDeErro(erro: { message?: string; code?: string } | null | undefined, padrao: string): string {
  // Função/tabela ainda inexistente neste banco (migration pendente): explica em vez de dar erro genérico
  if (recursoAusente(erro)) return MENSAGEM_RECURSO_AUSENTE;
  const texto = erro?.message ?? '';
  // Mensagens das nossas funções já vêm em português e sem detalhes internos.
  if (/[áéíóúãõç]/i.test(texto) && texto.length < 200 && !/violates|duplicate key|relation /i.test(texto)) return texto;
  return padrao;
}
