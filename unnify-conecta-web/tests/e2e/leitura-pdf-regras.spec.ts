// teste-sem-banco: só funções puras ou API simulada por route (não acessa o Supabase)
import { test, expect } from '@playwright/test';
import { analisarTexto, cnpjValido } from '../../lib/leitura-pdf';
import { normalizarTexto } from '../../lib/leitura-pdf/comum';

// Regras de identificação/extração (sem navegador). Dados FICTÍCIOS: CNPJs de exemplo com dígitos válidos.
const CNPJ = '11.222.333/0001-81';
const DAS = [
  'Documento de Arrecadação do Simples Nacional',
  'CNPJ Razão Social',
  `${CNPJ} EMPRESA EXEMPLO LTDA`,
  'Período de Apuração Data de Vencimento Número do Documento',
  'Setembro/2026 20/10/2026 07.20.26271.1234567-8',
  'Pagar este documento até 20/10/2026',
  'Valor Total do Documento 1.250,40',
  'Composição do Documento de Arrecadação',
  'Código Denominação Principal Multa Juros Total',
  '1001 IRPJ - SIMPLES NACIONAL 1.000,00 150,00 100,40 1.250,40',
  'Totais 1.000,00 150,00 100,40 1.250,40',
].join('\n');
const CND = [
  'MINISTÉRIO DA FAZENDA',
  'Secretaria da Receita Federal do Brasil',
  'Procuradoria-Geral da Fazenda Nacional',
  'CERTIDÃO NEGATIVA DE DÉBITOS RELATIVOS AOS TRIBUTOS FEDERAIS E À DÍVIDA ATIVA DA UNIÃO',
  'Nome: EMPRESA EXEMPLO LTDA',
  `CNPJ: ${CNPJ}`,
  'Ressalvado o direito de a Fazenda Nacional cobrar e inscrever quaisquer dívidas...',
  'Emitida às 10:22:33 do dia 06/08/2026 <hora e data de Brasília>.',
  'Válida até 02/02/2027.',
  'Código de controle da certidão: 1A2B.3C4D.5E6F.7A8B',
  'Qualquer rasura ou emenda invalidará este documento.',
].join('\n');

test('CNPJ: dígitos verificadores', () => {
  expect(cnpjValido(CNPJ)).toBe(true);
  expect(cnpjValido('11.222.333/0001-82')).toBe(false);
  expect(cnpjValido('00.000.000/0000-00')).toBe(false);
});

test('DAS completo: campos, composição (principal, multa, juros, total) e nada inventado', () => {
  const r = analisarTexto(normalizarTexto(DAS));
  expect(r.status).toBe('das');
  if (r.status !== 'das') return;
  expect(r.extracao.dados).toEqual({ cnpj: '11222333000181', razaoSocial: 'EMPRESA EXEMPLO LTDA', competencia: '2026-09', vencimento: '2026-10-20',
    numeroDocumento: '07.20.26271.1234567-8', valorTotal: 1250.4, principal: 1000, multa: 150, juros: 100.4 });
  expect(r.extracao.faltando).toEqual([]);
  expect(r.extracao.alertas).toEqual([]);
});

test('DAS parcial: campos ausentes ficam ausentes e aparecem como não identificados', () => {
  const r = analisarTexto('Documento de Arrecadação do Simples Nacional\nPeríodo de Apuração 09/2026\nValor Total do Documento 80,00');
  expect(r.status).toBe('das');
  if (r.status !== 'das') return;
  expect(r.extracao.dados).toEqual({ competencia: '2026-09', valorTotal: 80 });
  expect(r.extracao.faltando).toEqual(expect.arrayContaining(['cnpj', 'razaoSocial', 'vencimento', 'numeroDocumento', 'principal', 'multa', 'juros']));
});

test('DAS inconsistente: composição que não fecha não é usada; CNPJ inválido e data impossível são ignorados', () => {
  const r = analisarTexto(DAS.replace('Totais 1.000,00 150,00 100,40 1.250,40', 'Totais 1.000,00 150,00 100,40 9.999,99')
    .replace(CNPJ, '11.222.333/0001-82').replace('Pagar este documento até 20/10/2026', 'Pagar este documento até 31/02/2026').replace('Setembro/2026 20/10/2026', 'Setembro/2026 31/02/2026'));
  if (r.status !== 'das') throw new Error('deveria ser DAS');
  expect(r.extracao.dados.cnpj).toBeUndefined();
  expect(r.extracao.dados.vencimento).toBeUndefined();
  expect(r.extracao.dados.principal).toBeUndefined();
  expect(r.extracao.dados.valorTotal).toBe(1250.4); // o "Valor Total do Documento" continua valendo
  expect(r.extracao.alertas.join(' ')).toContain('não confere');
});

test('Certidão Federal negativa: tipo, órgão, datas e código; aviso de que a leitura não comprova autenticidade', () => {
  const r = analisarTexto(normalizarTexto(CND));
  expect(r.status).toBe('certidao_federal');
  if (r.status !== 'certidao_federal') return;
  expect(r.extracao.dados).toEqual({ tipoCertidao: 'negativa', orgaoEmissor: 'Receita Federal do Brasil / PGFN', cnpj: '11222333000181', razaoSocial: 'EMPRESA EXEMPLO LTDA',
    emissao: '2026-08-06', validade: '2027-02-02', codigoControle: '1A2B.3C4D.5E6F.7A8B' });
  expect(r.extracao.alertas[0]).toContain('não confirma a autenticidade');
});

test('Certidão positiva com efeitos de negativa; sem "Válida até" a validade NÃO é presumida', () => {
  const r = analisarTexto(CND.replace('CERTIDÃO NEGATIVA', 'CERTIDÃO POSITIVA COM EFEITOS DE NEGATIVA').replace('Válida até 02/02/2027.', ''));
  if (r.status !== 'certidao_federal') throw new Error('deveria ser certidão');
  expect(r.extracao.dados.tipoCertidao).toBe('positiva_efeitos_negativa');
  expect(r.extracao.dados.validade).toBeUndefined();
  expect(r.extracao.faltando).toContain('validade');
});

test('Formato do modelo (Emissão:/Validade:) e validade anterior à emissão é descartada', () => {
  const r = analisarTexto(CND.replace('Emitida às 10:22:33 do dia 06/08/2026 <hora e data de Brasília>.', 'Emissão: 06/08/2026').replace('Válida até 02/02/2027.', 'Validade: 01/08/2026'));
  if (r.status !== 'certidao_federal') throw new Error('deveria ser certidão');
  expect(r.extracao.dados.emissao).toBe('2026-08-06');
  expect(r.extracao.dados.validade).toBeUndefined();
  expect(r.extracao.alertas.join(' ')).toContain('anterior');
});

test('Identificação só pelo conteúdo: texto qualquer não é reconhecido', () => {
  expect(analisarTexto('Nota fiscal de serviço eletrônica\nCNPJ 11.222.333/0001-81\nValor 100,00').status).toBe('nao_reconhecido');
  expect(analisarTexto('DAS.pdf certidao.pdf').status).toBe('nao_reconhecido');
});
