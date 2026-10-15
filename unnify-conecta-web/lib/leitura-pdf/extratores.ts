// Identificação e extração por regras (expressões regulares) sobre o TEXTO do PDF. Nunca pelo nome do arquivo.
// Campos não encontrados ficam ausentes (nada é inventado); inconsistências viram alertas para conferência.
import { MESES, RE_DATA, RE_DINHEIRO, dataBrParaIso, dinheiroParaNumero, nomeLimpo, primeiroCnpj, semAcento, valorAposRotulo } from './comum';

export type TipoDocumentoPdf = 'das' | 'certidao_federal';

export function identificarDocumento(texto: string): TipoDocumentoPdf | null {
  const t = semAcento(texto).toLowerCase().replace(/\s+/g, ' ');
  if (/certidao (negativa|positiva)/.test(t) && t.includes('tributos federais') && t.includes('divida ativa da uniao')) return 'certidao_federal';
  if (t.includes('documento de arrecadacao do simples nacional') || (t.includes('simples nacional') && /\bdas\b/.test(t) && t.includes('periodo de apuracao'))) return 'das';
  return null;
}

export interface Extracao<T> { dados: T; faltando: (keyof T)[]; alertas: string[] }

// ---------- DAS — Simples Nacional ----------
export interface DadosDas {
  cnpj?: string; razaoSocial?: string; competencia?: string; vencimento?: string; numeroDocumento?: string;
  valorTotal?: number; principal?: number; multa?: number; juros?: number;
}
export const CAMPOS_DAS: Record<keyof DadosDas, string> = {
  cnpj: 'CNPJ', razaoSocial: 'Razão social', competencia: 'Competência', vencimento: 'Vencimento', numeroDocumento: 'Número do documento',
  valorTotal: 'Valor total', principal: 'Principal', multa: 'Multa', juros: 'Juros',
};

function razaoSocialAposCnpj(texto: string, cnpj: string | undefined): string | undefined {
  if (!cnpj) return undefined;
  const formatado = `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
  const linha = texto.split('\n').find((l) => l.includes(formatado));
  const resto = linha?.slice(linha.indexOf(formatado) + formatado.length);
  return nomeLimpo(resto) ?? nomeLimpo(/Raz[aã]o Social:?\s*\n?([^\n]+)/i.exec(texto)?.[1]?.replace(/^CNPJ.*$/i, ''));
}

export function extrairDas(texto: string): Extracao<DadosDas> {
  const d: DadosDas = {};
  const alertas: string[] = [];
  d.cnpj = primeiroCnpj(texto);
  d.razaoSocial = razaoSocialAposCnpj(texto, d.cnpj);
  const comp = /\b(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*\/\s*(\d{4})\b/i.exec(texto);
  if (comp) d.competencia = `${comp[2]}-${MESES[semAcento(comp[1]).toLowerCase()]}`;
  else {
    const pa = valorAposRotulo(texto, /Per[ií]odo de Apura[cç][aã]o/i, /\b(?:0[1-9]|1[0-2])\/20\d{2}\b/);
    const m = pa && /^(\d{2})\/(\d{4})$/.exec(pa);
    if (m) d.competencia = `${m[2]}-${m[1]}`;
  }
  const venc = valorAposRotulo(texto, /Pagar (este documento )?at[eé]/i, RE_DATA) ?? valorAposRotulo(texto, /Data de Vencimento/i, RE_DATA);
  d.vencimento = venc ? dataBrParaIso(venc) : undefined;
  d.numeroDocumento = /\b\d{2}\.\d{2}\.\d{5}\.\d{7}-\d\b/.exec(texto)?.[0];
  const total = valorAposRotulo(texto, /Valor Total do Documento/i, RE_DINHEIRO, 120);
  d.valorTotal = total ? dinheiroParaNumero(total) : undefined;
  // Composição: linha "Totais <principal> <multa> <juros> <total>"
  const comp4 = /Totais\s+(\d[\d.]*,\d{2})\s+(\d[\d.]*,\d{2})\s+(\d[\d.]*,\d{2})\s+(\d[\d.]*,\d{2})/i.exec(texto);
  if (comp4) {
    const [p, m, j, t] = comp4.slice(1).map((x) => dinheiroParaNumero(x));
    if ([p, m, j, t].every((x) => x !== undefined)) {
      if (Math.abs(p! + m! + j! - t!) > 0.01) alertas.push('A soma de principal, multa e juros não confere com o total da composição.');
      else { d.principal = p; d.multa = m; d.juros = j; }
      if (d.valorTotal === undefined) d.valorTotal = t;
      else if (Math.abs(d.valorTotal - t!) > 0.01) alertas.push('O total da composição difere do "Valor Total do Documento". Confira o valor.');
    }
  }
  if (d.valorTotal !== undefined && d.valorTotal <= 0) { d.valorTotal = undefined; alertas.push('Valor total inválido no documento.'); }
  return { dados: d, faltando: (Object.keys(CAMPOS_DAS) as (keyof DadosDas)[]).filter((k) => d[k] === undefined), alertas };
}

// ---------- Certidão Federal (RFB/PGFN) ----------
export type TipoCertidaoFederal = 'negativa' | 'positiva_efeitos_negativa' | 'positiva';
export const TIPOS_CERTIDAO_FEDERAL: Record<TipoCertidaoFederal, string> = {
  negativa: 'Certidão Negativa de Débitos (CND)',
  positiva_efeitos_negativa: 'Certidão Positiva com Efeitos de Negativa (CPEND)',
  positiva: 'Certidão Positiva de Débitos',
};
export interface DadosCertidaoFederal {
  cnpj?: string; razaoSocial?: string; tipoCertidao?: TipoCertidaoFederal; orgaoEmissor?: string; emissao?: string; validade?: string; codigoControle?: string;
}
export const CAMPOS_CERTIDAO: Record<keyof DadosCertidaoFederal, string> = {
  cnpj: 'CNPJ', razaoSocial: 'Razão social', tipoCertidao: 'Tipo de certidão', orgaoEmissor: 'Órgão emissor', emissao: 'Data de emissão', validade: 'Data de validade', codigoControle: 'Código de controle',
};

export function extrairCertidaoFederal(texto: string): Extracao<DadosCertidaoFederal> {
  const d: DadosCertidaoFederal = {};
  const alertas: string[] = ['A leitura do PDF não confirma a autenticidade nem a regularidade fiscal: valide o código de controle no site da Receita Federal.'];
  const t = semAcento(texto).toUpperCase().replace(/\s+/g, ' ');
  if (t.includes('POSITIVA COM EFEITOS DE NEGATIVA')) d.tipoCertidao = 'positiva_efeitos_negativa';
  else if (t.includes('CERTIDAO NEGATIVA')) d.tipoCertidao = 'negativa';
  else if (t.includes('CERTIDAO POSITIVA')) d.tipoCertidao = 'positiva';
  const rfb = t.includes('RECEITA FEDERAL'), pgfn = t.includes('PROCURADORIA-GERAL DA FAZENDA NACIONAL') || t.includes('PGFN');
  if (rfb || pgfn) d.orgaoEmissor = rfb && pgfn ? 'Receita Federal do Brasil / PGFN' : rfb ? 'Receita Federal do Brasil' : 'PGFN';
  const cnpjRotulo = /CNPJ:?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i.exec(texto)?.[1];
  d.cnpj = cnpjRotulo ? primeiroCnpj(cnpjRotulo) : primeiroCnpj(texto);
  d.razaoSocial = nomeLimpo(/Nome:\s*([^\n]+?)(?:\s+CNPJ\b|\n|$)/i.exec(texto)?.[1]);
  const emissao = /Emitida\s+[àa]s?\s+\d{2}:\d{2}(?::\d{2})?\s+do\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i.exec(texto)?.[1] ?? valorAposRotulo(texto, /Emiss[aã]o:/i, RE_DATA, 40);
  d.emissao = emissao ? dataBrParaIso(emissao) : undefined;
  const validade = /V[aá]lida\s+at[eé]\s+(\d{2}\/\d{2}\/\d{4})/i.exec(texto)?.[1] ?? valorAposRotulo(texto, /Validade:/i, RE_DATA, 40);
  d.validade = validade ? dataBrParaIso(validade) : undefined; // nunca presumida (sem "180 dias" automático)
  d.codigoControle = /C[oó]digo\s+de\s+controle\s+da\s+certid[aã]o:?\s*([0-9A-Z]{4}(?:\.[0-9A-Z]{4}){3})/i.exec(texto)?.[1]?.toUpperCase();
  if (d.emissao && d.validade && d.validade < d.emissao) { alertas.push('A data de validade é anterior à de emissão. Confira as datas.'); d.validade = undefined; }
  return { dados: d, faltando: (Object.keys(CAMPOS_CERTIDAO) as (keyof DadosCertidaoFederal)[]).filter((k) => d[k] === undefined), alertas };
}
