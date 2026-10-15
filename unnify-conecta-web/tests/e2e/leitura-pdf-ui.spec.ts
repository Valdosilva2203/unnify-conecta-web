import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// Leitura automática do PDF no "Novo imposto" (contador). API SIMULADA e PDFs FICTÍCIOS gerados aqui: nada real, nada no banco.
const BASE = 'http://localhost:3000';
const EMP = { id: 'aaaaaaaa-0000-4000-8000-0000000000a1', nome: 'Empresa Exemplo', cnpj: '11222333000181' };
const rotas: Rotas = (c) => {
  if (c === 'perfis') return { corpo: [{ nome_completo: 'Contador Teste', tipo_usuario: 'contador', funcao_global: 'user' }] };
  if (c === 'rpc/painel_contador') return { corpo: [{ id_empresa: EMP.id, nome: EMP.nome, cnpj: EMP.cnpj, permissoes: ['gerenciar_impostos'], solicitacoes_aguardando_analise: null,
    solicitacoes_aguardando_empresa: null, obrigacoes_abertas: null, obrigacoes_atrasadas: null, obrigacoes_7_dias: null, itens_concluidos: 0 }] };
  if (c === 'rpc/resumo_impostos') return { corpo: { a_pagar: 0, qtd_a_pagar: 0, vencidos: 0, vencendo_7: 0, guias: 0, pagos_90: 0 } };
  if (c === 'rpc/buscar_impostos' || c === 'rpc/listar_parcelamentos_tributarios') return { corpo: [] };
  if (c === 'rpc/pode_gerenciar_financeiro') return { corpo: false };
  if (c === 'rpc/salvar_imposto') return { corpo: 'bbbbbbbb-0000-4000-8000-0000000000b1' };
  if (c.startsWith('/storage/v1/object/guias-impostos')) return { corpo: { Key: 'x' } };
  if (c === 'rpc/registrar_arquivo_imposto') return { status: 204 };
  if (c === 'notificacoes' || c === 'empresas') return { corpo: [] };
  return undefined;
};

async function pdf(linhas: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([595, 842]);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  linhas.forEach((l, i) => pagina.drawText(l, { x: 40, y: 800 - i * 18, size: 10, font: fonte }));
  if (!linhas.length) pagina.drawRectangle({ x: 40, y: 400, width: 300, height: 200, color: rgb(0.8, 0.8, 0.8) }); // "escaneado": sem texto
  return Buffer.from(await doc.save());
}
const linhasDas = (cnpj = '11.222.333/0001-81') => [
  'Documento de Arrecadação do Simples Nacional', 'CNPJ Razão Social', `${cnpj} EMPRESA EXEMPLO LTDA`,
  'Período de Apuração Data de Vencimento Número do Documento', 'Setembro/2026 20/10/2026 07.20.26271.1234567-8',
  'Pagar este documento até 20/10/2026', 'Valor Total do Documento 1.250,40', 'Totais 1.000,00 150,00 100,40 1.250,40',
];

async function abrirNovo(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/contador/empresas/${EMP.id}/impostos`);
  await page.getByRole('button', { name: /Novo imposto/ }).first().click({ timeout: 90000 });
  await expect(page.getByRole('dialog', { name: 'Novo imposto' })).toBeVisible();
  return page;
}
const corpoRpc = (r: { chamadas: { caminho: string; corpo: unknown }[] }, n: string) => r.chamadas.filter((c) => c.caminho === `rpc/${n}`).at(-1)?.corpo as Record<string, unknown> | undefined;

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('DAS: identifica, preenche, mostra composição e exige conferência antes de salvar', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas);
  const page = await abrirNovo(ctx);
  const d = page.getByRole('dialog');
  await d.getByLabel('Guia (PDF, opcional)').setInputFiles({ name: 'qualquer-nome.pdf', mimeType: 'application/pdf', buffer: await pdf(linhasDas()) });
  const r = d.getByTestId('leitura-pdf');
  await expect(r).toContainText('Documento identificado: DAS – Simples Nacional', { timeout: 30000 });
  await expect(r).toContainText('CNPJ:11.222.333/0001-81');
  await expect(r).toContainText('Razão social:EMPRESA EXEMPLO LTDA');
  await expect(r).toContainText('Multa:R$ 150,00');
  await expect(r).toContainText('Preenchido automaticamente: Tipo, Competência, Vencimento, Valor, Descrição.');
  await expect(d.getByLabel('Tipo')).toHaveValue('das');
  await expect(d.getByLabel('Órgão')).toHaveValue('Receita Federal');
  await expect(d.getByLabel('Competência')).toHaveValue('2026-09');
  await expect(d.getByLabel('Vencimento')).toHaveValue('2026-10-20');
  await expect(d.getByLabel('Valor (R$)')).toHaveValue('1.250,40');
  await expect(d.getByLabel('Descrição (opcional)')).toHaveValue(/DAS nº 07\.20\.26271\.1234567-8 · principal R\$\s1\.000,00 \+ multa R\$\s150,00 \+ juros R\$\s100,40/);
  expect(corpoRpc(registro, 'salvar_imposto')).toBeUndefined(); // ler NÃO cria conta a pagar
  // Correção manual continua livre; salvar exige a conferência
  await d.getByLabel('Valor (R$)').fill('125040');
  await d.getByRole('button', { name: 'Salvar' }).click();
  await expect(d.getByRole('alert').first()).toHaveText('Confirme que conferiu os dados lidos do PDF antes de salvar.');
  expect(corpoRpc(registro, 'salvar_imposto')).toBeUndefined();
  await d.getByLabel('Conferi os dados lidos do PDF').check();
  await d.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => corpoRpc(registro, 'salvar_imposto')).toMatchObject({ p_tipo: 'das', p_competencia: '2026-09-01', p_vencimento: '2026-10-20', p_valor: '1250.40', p_id_empresa: EMP.id });
  await ctx.close();
});

test('não sobrescreve o que o usuário já preencheu: mostra a divergência e "Usar do PDF"', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await sessaoSimulada(ctx, rotas);
  const page = await abrirNovo(ctx);
  const d = page.getByRole('dialog');
  await d.getByLabel('Valor (R$)').fill('99900');
  await d.getByLabel('Vencimento').fill('2026-10-25');
  await d.getByLabel('Guia (PDF, opcional)').setInputFiles({ name: 'guia.pdf', mimeType: 'application/pdf', buffer: await pdf(linhasDas()) });
  const r = d.getByTestId('leitura-pdf');
  await expect(r).toContainText('Valor: você informou um valor diferente; o PDF indica R$ 1.250,40.', { timeout: 30000 });
  await expect(r).toContainText('Vencimento: você informou um valor diferente; o PDF indica 20/10/2026.');
  await expect(d.getByLabel('Valor (R$)')).toHaveValue('999,00');
  await expect(d.getByLabel('Vencimento')).toHaveValue('2026-10-25');
  await r.getByRole('button', { name: 'Usar do PDF' }).first().click();
  await expect(d.getByLabel('Vencimento')).toHaveValue('2026-10-20');
  await expect(d.getByLabel('Valor (R$)')).toHaveValue('999,00');
  await ctx.close();
});

test('CNPJ diferente da empresa bloqueia o salvamento', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas);
  const page = await abrirNovo(ctx);
  const d = page.getByRole('dialog');
  await d.getByLabel('Guia (PDF, opcional)').setInputFiles({ name: 'guia.pdf', mimeType: 'application/pdf', buffer: await pdf(linhasDas('11.444.777/0001-61')) });
  await expect(d.getByTestId('leitura-pdf').getByRole('alert')).toContainText('O CNPJ da guia (11.444.777/0001-61) é diferente do CNPJ desta empresa (11.222.333/0001-81)', { timeout: 30000 });
  await expect(d.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  expect(corpoRpc(registro, 'salvar_imposto')).toBeUndefined();
  // Trocar por PDF sem texto desfaz o preenchimento do PDF anterior
  const vazio = await PDFDocument.create(); vazio.addPage();
  await d.getByLabel('Guia (PDF, opcional)').setInputFiles({ name: 'vazio.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await vazio.save()) });
  await expect(d.getByTestId('leitura-pdf')).toContainText('não tem texto legível', { timeout: 30000 });
  await expect(d.getByLabel('Valor (R$)')).toHaveValue('');
  await expect(d.getByLabel('Competência')).toHaveValue('');
  // Trocar por outro arquivo libera
  await d.getByLabel('Guia (PDF, opcional)').setInputFiles({ name: 'certa.pdf', mimeType: 'application/pdf', buffer: await pdf(linhasDas()) });
  await expect(d.getByTestId('leitura-pdf')).not.toContainText('diferente do CNPJ', { timeout: 30000 });
  await expect(d.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  await ctx.close();
});

test('PDF sem texto, falso, certidão e documento desconhecido: avisam e não preenchem nada', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
  await sessaoSimulada(ctx, rotas);
  const page = await abrirNovo(ctx);
  const d = page.getByRole('dialog');
  const casos: [string, Buffer, string][] = [
    ['escaneado.pdf', await pdf([]), 'Este PDF não tem texto legível (provavelmente é digitalizado). Preencha os campos manualmente.'],
    ['falso.pdf', Buffer.from('isto nao e um pdf'), 'O arquivo não é um PDF válido.'],
    ['das.pdf', await pdf(['MINISTÉRIO DA FAZENDA', 'Secretaria da Receita Federal do Brasil', 'CERTIDÃO NEGATIVA DE DÉBITOS RELATIVOS AOS TRIBUTOS FEDERAIS', 'E À DÍVIDA ATIVA DA UNIÃO', 'Nome: EMPRESA EXEMPLO LTDA', 'CNPJ: 11.222.333/0001-81']), 'Este PDF é uma Certidão Federal, não uma guia de imposto.'],
    ['das-setembro.pdf', await pdf(['Nota fiscal de serviço', 'Valor 100,00']), 'Não reconhecemos este PDF como um DAS.'],
  ];
  for (const [nome, buffer, msg] of casos) {
    await d.getByLabel('Guia (PDF, opcional)').setInputFiles({ name: nome, mimeType: 'application/pdf', buffer });
    await expect(d.getByTestId('leitura-pdf'), nome).toContainText(msg, { timeout: 30000 });
    await expect(d.getByLabel('Tipo')).toHaveValue('');
    await expect(d.getByLabel('Valor (R$)')).toHaveValue('');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await ctx.close();
});
