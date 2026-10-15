// Validadores e utilidades da leitura de PDF (sem IA/OCR). Funções puras: rodam no navegador e nos testes em Node.

export const LIMITES_LEITURA = { bytes: 10 * 1024 * 1024, paginas: 5, caracteres: 100_000, tempoMs: 15_000 };

// Texto extraído: sem espaços duros/controles, espaços repetidos colapsados, linhas preservadas
// Caracteres montados por código (sem escapes no fonte)
const NBSP = String.fromCharCode(0xa0);
const CONTROLES = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(11)}${String.fromCharCode(12)}${String.fromCharCode(14)}-${String.fromCharCode(31)}]`, 'g');
const QUEBRA = String.fromCharCode(10);
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFC').split(NBSP).join(' ').replace(CONTROLES, ' ')
    .split(QUEBRA).map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join(QUEBRA);
}

export function cnpjValido(valor: string): boolean {
  const d = valor.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (base: string) => {
    let soma = 0, peso = base.length - 7;
    for (const c of base) { soma += Number(c) * peso--; if (peso < 2) peso = 9; }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(d.slice(0, 12)) === Number(d[12]) && dv(d.slice(0, 13)) === Number(d[13]);
}

const RE_CNPJ = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
// Primeiro CNPJ com dígitos verificadores corretos (só dígitos)
export function primeiroCnpj(texto: string): string | undefined {
  return (texto.match(RE_CNPJ) ?? []).map((c) => c.replace(/\D/g, '')).find(cnpjValido);
}

// dd/mm/aaaa → aaaa-mm-dd, só datas reais entre 2000 e 2100
export function dataBrParaIso(valor: string): string | undefined {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor.trim());
  if (!m) return undefined;
  const [, d, mes, a] = m;
  const data = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d)));
  if (Number(a) < 2000 || Number(a) > 2100 || data.getUTCDate() !== Number(d) || data.getUTCMonth() !== Number(mes) - 1) return undefined;
  return `${a}-${mes}-${d}`;
}

// "1.234,56" → 1234.56 (até R$ 999 milhões; nada de negativos)
export function dinheiroParaNumero(valor: string): number | undefined {
  if (!/^\d{1,3}(\.\d{3}){0,2},\d{2}$/.test(valor.trim())) return undefined;
  return Number(valor.trim().replace(/\./g, '').replace(',', '.'));
}

const ESCAPAR = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Primeiro valor que casa `valor` até `janela` caracteres depois do rótulo
export function valorAposRotulo(texto: string, rotulo: RegExp, valor: RegExp, janela = 200): string | undefined {
  const r = new RegExp(rotulo.source, rotulo.flags.replace('g', '') + 'g');
  for (let m = r.exec(texto); m; m = r.exec(texto)) {
    const trecho = texto.slice(m.index + m[0].length, m.index + m[0].length + janela);
    const v = new RegExp(valor.source, valor.flags.replace('g', '')).exec(trecho);
    if (v) return v[1] ?? v[0];
  }
  return undefined;
}

export const RE_DATA = /(\d{2}\/\d{2}\/\d{4})/;
export const RE_DINHEIRO = /(\d{1,3}(?:\.\d{3}){0,2},\d{2})/;
export const MESES: Record<string, string> = {
  janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
};
export const semAcento = (s: string) => s.normalize('NFD').replace(new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g'), '');
export { ESCAPAR };

// Nome/razão social: letras, números e pontuação comum; 3–150 caracteres; nunca um rótulo do documento
export function nomeLimpo(valor: string | undefined): string | undefined {
  const v = (valor ?? '').replace(/\s+/g, ' ').trim().replace(/[;:,.\-]+$/, '');
  if (v.length < 3 || v.length > 150 || !/[A-Za-zÀ-ú]{2}/.test(v) || /^(cnpj|nome|raz[aã]o social|per[ií]odo|data)\b/i.test(v)) return undefined;
  return /^[\p{L}\p{N} &.,'/()\-ºª]+$/u.test(v) ? v : undefined;
}
