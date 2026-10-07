export function normalizeCNPJ(cnpj: string): string {
  return cnpj.replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export function validateCNPJ(cnpj: string): boolean {
  const normalized = normalizeCNPJ(cnpj);
  if (!/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(normalized)) return false;

  const digits = normalized.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^0+$|^1+$|^2+$|^3+$|^4+$|^5+$|^6+$|^7+$|^8+$|^9+$/.test(digits)) return false;

  const [a, b, c, d, e, f, g, h, i, j, k, l, m, n] = digits.split('').map(Number);

  let sum = (a * 5 + b * 4 + c * 3 + d * 2 + e * 9 + f * 8 + g * 7 + h * 6 + i * 5 + j * 4 + k * 3 + l * 2) % 11;
  const digit1 = sum < 2 ? 0 : 11 - sum;

  sum = (a * 6 + b * 5 + c * 4 + d * 3 + e * 2 + f * 9 + g * 8 + h * 7 + i * 6 + j * 5 + k * 4 + l * 3 + m * 2) % 11;
  const digit2 = sum < 2 ? 0 : 11 - sum;

  return digit1 === m && digit2 === n;
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  } else if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return phone;
}

export const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
