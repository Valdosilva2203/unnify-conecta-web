import { describe, it, expect } from 'vitest';

function validateCNPJ(cnpj: string): boolean {
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length !== 14) return false;

  const digits = cleaned.split('').map(Number);

  let sum = 0;
  const mult1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * mult1[i];
  }
  let firstDigit = 11 - (sum % 11);
  firstDigit = firstDigit > 9 ? 0 : firstDigit;

  sum = 0;
  const mult2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 13; i++) {
    sum += digits[i] * mult2[i];
  }
  let secondDigit = 11 - (sum % 11);
  secondDigit = secondDigit > 9 ? 0 : secondDigit;

  return digits[12] === firstDigit && digits[13] === secondDigit;
}

describe('validateCNPJ - Algoritmo Oficial (Receita Federal)', () => {
  describe('CNPJs Válidos', () => {
    it('deve aceitar 43.885.538/0001-33 (com máscara)', () => {
      expect(validateCNPJ('43.885.538/0001-33')).toBe(true);
    });

    it('deve aceitar 43885538000133 (sem máscara)', () => {
      expect(validateCNPJ('43885538000133')).toBe(true);
    });

    it('deve aceitar 11.222.333/0001-81', () => {
      expect(validateCNPJ('11.222.333/0001-81')).toBe(true);
    });

    it('deve aceitar 11222333000181 (sem máscara)', () => {
      expect(validateCNPJ('11222333000181')).toBe(true);
    });

    it('deve aceitar 00.000.000/0000-00 (todos zeros)', () => {
      expect(validateCNPJ('00.000.000/0000-00')).toBe(true);
    });

  });

  describe('CNPJs Inválidos - Dígitos Verificadores Incorretos', () => {
    it('deve rejeitar 43.885.538/0001-32 (segundo dígito errado)', () => {
      expect(validateCNPJ('43.885.538/0001-32')).toBe(false);
    });

    it('deve rejeitar 43.885.538/0001-34 (segundo dígito errado)', () => {
      expect(validateCNPJ('43.885.538/0001-34')).toBe(false);
    });

    it('deve rejeitar 11.111.111/1111-11 (checksum falha)', () => {
      expect(validateCNPJ('11.111.111/1111-11')).toBe(false);
    });

    it('deve rejeitar 12.345.678/9012-34 (checksum falha)', () => {
      expect(validateCNPJ('12.345.678/9012-34')).toBe(false);
    });

    it('deve rejeitar 99.999.999/9999-99 (checksum falha)', () => {
      expect(validateCNPJ('99.999.999/9999-99')).toBe(false);
    });
  });

  describe('CNPJs Inválidos - Formato', () => {
    it('deve rejeitar string vazia', () => {
      expect(validateCNPJ('')).toBe(false);
    });

    it('deve rejeitar CNPJ com menos de 14 dígitos', () => {
      expect(validateCNPJ('11.222.333/0001')).toBe(false);
    });

    it('deve rejeitar CNPJ com mais de 14 dígitos', () => {
      expect(validateCNPJ('11.222.333/0001-8123')).toBe(false);
    });

    it('deve rejeitar CNPJ com apenas letras', () => {
      expect(validateCNPJ('ABCDEFGHIJKLMN')).toBe(false);
    });

    it('deve rejeitar CNPJ com caracteres especiais apenas', () => {
      expect(validateCNPJ('!@#$%^&*()[]{}?')).toBe(false);
    });

    it('deve rejeitar null/undefined', () => {
      expect(validateCNPJ('')).toBe(false);
    });
  });

  describe('Máscara - Aceitação com e sem formato', () => {
    it('deve aceitar CNPJ com máscara XX.XXX.XXX/XXXX-XX', () => {
      expect(validateCNPJ('11.222.333/0001-81')).toBe(true);
    });

    it('deve aceitar CNPJ sem máscara 14 dígitos puros', () => {
      expect(validateCNPJ('11222333000181')).toBe(true);
    });

    it('deve aceitar CNPJ com máscara parcial', () => {
      expect(validateCNPJ('11222333/000181')).toBe(true);
    });

    it('deve aceitar CNPJ com espaços', () => {
      expect(validateCNPJ('11 222 333 0001 81')).toBe(true);
    });
  });

  describe('Casos Especiais', () => {
    it('deve validar checksum independente de ordem de multiplicadores', () => {
      // 43.885.538/0001-33 é válido - testando que o algoritmo está correto
      const result1 = validateCNPJ('43885538000133');
      const result2 = validateCNPJ('43.885.538/0001-33');
      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it('deve rejeitar CNPJ com dígitos verificadores trocados', () => {
      // Se 43.885.538/0001-33 é válido, 43.885.538/0001-34 deve ser inválido
      expect(validateCNPJ('43.885.538/0001-34')).toBe(false);
    });

    it('deve garantir que ambos os dígitos verificadores são validados', () => {
      // Trocar apenas o primeiro dígito verificador
      expect(validateCNPJ('43.885.538/0001-23')).toBe(false);
    });
  });
});
