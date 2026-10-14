import { test, expect } from '@playwright/test';
import { detectarTipo, extensaoDoNome, nomeSeguro, pdfTemConteudoAtivo, tamanhoMaximoBytes } from '../../lib/documentos';

// Validação de arquivos usada pela rota /api/documentos (sem navegador e sem banco).
const bytes = (s: string | number[]) => (typeof s === 'string' ? new TextEncoder().encode(s) : Uint8Array.from(s));

test('tipo real pelo conteúdo, não pelo nome', () => {
  expect(detectarTipo(bytes('%PDF-1.7\n1 0 obj'))).toEqual({ mime: 'application/pdf', extensao: 'pdf' });
  expect(detectarTipo(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toEqual({ mime: 'image/jpeg', extensao: 'jpg' });
  expect(detectarTipo(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toEqual({ mime: 'image/png', extensao: 'png' });
  // HTML/SVG/executável renomeado para .pdf ou .png: recusado
  expect(detectarTipo(bytes('<html><script>alert(1)</script>'))).toBeNull();
  expect(detectarTipo(bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="x()">'))).toBeNull();
  expect(detectarTipo(bytes([0x4d, 0x5a, 0x90, 0]))).toBeNull(); // MZ (executável)
  expect(detectarTipo(bytes(''))).toBeNull();
});

test('extensões aceitas e coerência com o conteúdo', () => {
  expect(extensaoDoNome('contrato.PDF')).toBe('pdf');
  expect(extensaoDoNome('foto.jpeg')).toBe('jpg');
  expect(extensaoDoNome('foto.JPG')).toBe('jpg');
  expect(extensaoDoNome('logo.png')).toBe('png');
  expect(extensaoDoNome('script.svg')).toBeNull();
  expect(extensaoDoNome('nota.pdf.exe')).toBeNull();
  expect(extensaoDoNome('semextensao')).toBeNull();
});

test('PDF com conteúdo ativo é recusado; PDF comum passa', () => {
  expect(pdfTemConteudoAtivo(bytes('%PDF-1.7 /OpenAction << /S /JavaScript /JS (app.alert(1)) >>'))).toBe(true);
  expect(pdfTemConteudoAtivo(bytes('%PDF-1.7 << /Type /Action /S /Launch /F (cmd.exe) >>'))).toBe(true);
  expect(pdfTemConteudoAtivo(bytes('%PDF-1.7 << /Type /EmbeddedFile >>'))).toBe(true);
  expect(pdfTemConteudoAtivo(bytes('%PDF-1.7 << /AA << /O 5 0 R >> >>'))).toBe(true);
  expect(pdfTemConteudoAtivo(bytes('%PDF-1.7 << /Type /Catalog /Pages 2 0 R >> << /Type /Page /Contents 4 0 R >>'))).toBe(false);
  // Palavras parecidas não disparam falso positivo
  expect(pdfTemConteudoAtivo(bytes('%PDF-1.7 << /JSON (x) /AAPL (y) >>'))).toBe(false);
});

test('nome seguro e limite de tamanho', () => {
  expect(nomeSeguro('../../etc/passwd', 'x')).toBe('.. .. etc passwd');
  expect(nomeSeguro('  Contrato\u0000 social <b>2026</b> ', 'x')).toBe('Contrato social b 2026 b');
  expect(nomeSeguro('   ', 'Padrão')).toBe('Padrão');
  expect(nomeSeguro('a'.repeat(300), 'x')).toHaveLength(150);
  expect(tamanhoMaximoBytes()).toBeLessThanOrEqual(10 * 1024 * 1024);
});
