import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { SUPABASE, sessaoSimulada, type Rotas } from './apoio/sessao-simulada';
import { inspecionarPdf, tipoRealConfere } from '../../lib/documentos-admin';

// Documentos administrativos com a API do Supabase SIMULADA (não acessa banco nem storage real). Regras de banco/storage
// em tests/sql/documentos-admin.mjs. O PDF editado é conferido de verdade (pdf.js extrai o texto do arquivo gerado).
const BASE = 'http://localhost:3000';
const hoje = new Date().toISOString();
async function pdfExemplo(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const p1 = pdf.addPage([595, 842]);
  p1.drawText('RECIBO Tech Suprimentos', { x: 60, y: 780, size: 18, font: f });
  p1.drawText('Cabo de rede CAT6 Quantidade 10 Total R$ 50,00', { x: 60, y: 700, size: 12, font: f });
  p1.drawText('CNPJ: 24.214.920/0001-70', { x: 60, y: 660, size: 11, font: await pdf.embedFont(StandardFonts.HelveticaBold) });
  pdf.addPage([595, 842]).drawText('Segunda pagina', { x: 60, y: 780, size: 12, font: f });
  return Buffer.from(await pdf.save());
}
const DOCS = [
  { id: 'd1', id_pasta: 'p1', pasta: 'Recibos', nome: 'Recibo fornecedor', extensao: 'pdf', tipo_mime: 'application/pdf', versao_atual: 2, tamanho_atual: 250880, assinado: false, protegido: false, atualizado_em: hoje, criado_em: hoje, excluido_em: null, total: 2 },
  { id: 'd2', id_pasta: null, pasta: null, nome: 'Planilha despesas', extensao: 'xlsx', tipo_mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', versao_atual: 1, tamanho_atual: 97280, assinado: false, protegido: false, atualizado_em: hoje, criado_em: hoje, excluido_em: null, total: 2 },
];
const VERSOES = [
  { numero: 2, caminho: 'envios/22222222-2222-4222-8222-222222222222.pdf', tamanho: 250880, tipo_mime: 'application/pdf', sha256: 'b'.repeat(64), origem: 'edicao', observacao: 'Ajuste', assinado: false, criado_em: hoje, criado_por: null },
  { numero: 1, caminho: 'envios/11111111-1111-4111-8111-111111111111.pdf', tamanho: 245760, tipo_mime: 'application/pdf', sha256: 'a'.repeat(64), origem: 'upload', observacao: null, assinado: false, criado_em: hoje, criado_por: null },
];

function rotas(extra?: Rotas): Rotas {
  return (c, u, req) => {
    const e = extra?.(c, u, req);
    if (e) return e;
    if (c === 'perfis') return { corpo: [{ funcao_global: 'admin_master', nome_completo: 'Valdo Silva', tipo_usuario: null }] };
    if (c === 'rpc/admin_master_ativo') return { corpo: true };
    if (c === 'rpc/resumo_documentos_admin') return { corpo: { documentos: 128, novos_mes: 15, lixeira: 1, pastas: 12, bytes: 1932735283, versoes: 140, ultima_atualizacao: hoje } };
    if (c === 'pastas_documentos_admin') return { corpo: [{ id: 'p1', nome: 'Recibos' }, { id: 'p2', nome: 'Contratos' }] };
    if (c === 'documentos_admin') return { corpo: [{ id_pasta: 'p1' }, { id_pasta: null }] };
    if (c === 'rpc/buscar_documentos_admin') return { corpo: DOCS };
    if (c === 'versoes_documentos_admin') return { corpo: VERSOES };
    if (c === 'rpc/registrar_download_documento_admin' || c === 'rpc/salvar_pasta_documentos_admin' || c === 'rpc/atualizar_documento_admin' || c === 'rpc/excluir_documento_admin') return { corpo: null, status: 200 };
    if (c === 'notificacoes') return { corpo: [] };
    return undefined;
  };
}
async function preparar(ctx: BrowserContext, extra?: Rotas) {
  const registro = await sessaoSimulada(ctx, rotas(extra));
  const pdf = await pdfExemplo();
  const enviados: { caminho: string; corpo: Buffer }[] = [];
  const api: Record<string, unknown>[] = [];
  // Storage (download/envio) e a rota do servidor também simulados — nada sai do navegador de teste
  await ctx.route(`${SUPABASE}/storage/v1/object/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'GET' || (req.method() === 'POST' && /\/object\/authenticated\//.test(req.url()) === false && req.url().includes('/download'))) {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: pdf });
    }
    if (req.method() === 'POST') { enviados.push({ caminho: new URL(req.url()).pathname, corpo: req.postDataBuffer() ?? Buffer.alloc(0) }); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'ok' }) }); }
    return route.fulfill({ status: 200, contentType: 'application/pdf', body: pdf });
  });
  await ctx.route('**/api/admin/documentos', async (route) => {
    const b = JSON.parse(route.request().postData() ?? '{}'); api.push(b);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: b.id_documento ?? 'novo', versao: b.acao === 'versao' ? 3 : 1, assinado: false }) });
  });
  return { registro, enviados, api, pdf };
}
async function abrir(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/documentos`);
  await expect(page.getByRole('heading', { level: 1, name: 'Documentos' })).toBeVisible({ timeout: 90000 });
  return page;
}
const chamadas = (r: { chamadas: { caminho: string; corpo: unknown }[] }, c: string) => r.chamadas.filter((x) => x.caminho === c);
const texto = async (p: Page, nome: string) => ((await p.getByRole('region', { name: nome, exact: true }).textContent()) ?? '').replace(/ /g, ' ');

test.describe.configure({ mode: 'serial' });
test.setTimeout(4 * 60 * 1000);

test('validação do tipo real e detecção de assinatura (biblioteca usada no navegador e no servidor)', async () => {
  const pdf = new Uint8Array(await pdfExemplo());
  expect(tipoRealConfere('pdf', pdf.slice(0, 8192))).toBe(true);
  expect(tipoRealConfere('docx', pdf.slice(0, 8192))).toBe(false); // PDF renomeado para .docx
  expect(tipoRealConfere('png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  expect(tipoRealConfere('jpg', new TextEncoder().encode('<script>alert(1)</script>'))).toBe(false);
  expect(tipoRealConfere('txt', new Uint8Array([0x41, 0x00, 0x42]))).toBe(false); // binário disfarçado de texto
  expect(tipoRealConfere('exe', pdf)).toBe(false);
  expect(inspecionarPdf(pdf)).toEqual({ assinado: false, criptografado: false });
  const assinado = new TextEncoder().encode('%PDF-1.7\n1 0 obj << /Type /Sig /Filter /Adobe.PPKLite /ByteRange [0 100 200 300] >> endobj');
  expect(inspecionarPdf(assinado).assinado).toBe(true);
});

test('rota do servidor exige sessão de Admin Master', async ({ request }) => {
  const r = await request.post(`${BASE}/api/admin/documentos`, { data: { acao: 'documento', extensao: 'pdf', caminho: 'envios/11111111-1111-4111-8111-111111111111.pdf', nome: 'x' } });
  expect(r.status()).toBe(401);
});

test('painel, pastas, lista com filtros no servidor, versões e download auditado; menu só no Admin', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const { registro } = await preparar(ctx);
  const page = await abrir(ctx);
  await expect(page.getByRole('link', { name: 'Documentos' }).first()).toHaveAttribute('href', '/admin/documentos');
  await expect.poll(() => texto(page, 'Total de documentos')).toContain('128');
  expect(await texto(page, 'Armazenamento usado')).toContain('1,80 GB');
  expect(await texto(page, 'Pastas')).toContain('12');
  await expect(page.getByTestId('documento-Recibo fornecedor')).toContainText('v2');
  await page.getByRole('navigation', { name: 'Pastas' }).getByRole('button', { name: /^Recibos/ }).click();
  await expect.poll(() => chamadas(registro, 'rpc/buscar_documentos_admin').some((x) => (x.corpo as { p_id_pasta: string }).p_id_pasta === 'p1')).toBe(true);
  await page.getByLabel('Buscar documentos').fill('fornecedor');
  await page.getByLabel('Filtrar por formato').selectOption('pdf');
  await page.getByLabel('Ordenar').selectOption('nome');
  await expect.poll(() => chamadas(registro, 'rpc/buscar_documentos_admin').some((x) => { const b = x.corpo as Record<string, unknown>; return b.p_busca === 'fornecedor' && b.p_extensao === 'pdf' && b.p_ordem === 'nome'; })).toBe(true);
  await page.getByRole('navigation', { name: 'Pastas' }).getByRole('button', { name: /^Lixeira/ }).click();
  await expect.poll(() => chamadas(registro, 'rpc/buscar_documentos_admin').some((x) => (x.corpo as { p_lixeira: boolean }).p_lixeira === true)).toBe(true);
  await page.getByRole('navigation', { name: 'Pastas' }).getByRole('button', { name: /^Todos os documentos/ }).click();
  const painel = page.getByRole('complementary', { name: 'Detalhes do documento' });
  await expect(painel.getByTestId('versoes')).toContainText('v1 · original');
  await expect(painel.getByTestId('versoes')).toContainText('v2 (atual)');
  const [dl] = await Promise.all([page.waitForEvent('download'), painel.getByRole('button', { name: 'Baixar versão 1' }).click()]);
  expect(dl.suggestedFilename()).toBe('Recibo fornecedor.pdf');
  await expect.poll(() => chamadas(registro, 'rpc/registrar_download_documento_admin').map((x) => x.corpo)).toEqual([{ p_id_documento: 'd1', p_versao: 1 }]);
  // Formato sem pré-visualização continua disponível para download
  await page.getByTestId('documento-Planilha despesas').click();
  await expect(painel).toContainText('Pré-visualização indisponível para XLSX');
  await expect(painel.getByRole('button', { name: 'Abrir editor' })).toHaveCount(0);
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('upload valida o tipo real antes de enviar; nova pasta', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const { registro, enviados, api, pdf } = await preparar(ctx);
  const page = await abrir(ctx);
  await page.getByRole('button', { name: 'Upload de documento' }).click();
  const m = page.getByRole('dialog', { name: 'Upload de documento' });
  await m.getByLabel('Arquivos').setInputFiles([{ name: 'falso.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: pdf },
    { name: 'contrato.pdf', mimeType: 'application/pdf', buffer: pdf }]);
  await m.getByLabel('Pasta').selectOption('p2');
  await m.getByRole('button', { name: 'Enviar' }).click();
  await expect(m.getByRole('alert')).toContainText('falso.docx: o conteúdo não confere com a extensão .docx');
  expect(enviados).toHaveLength(1);
  expect(enviados[0].caminho).toMatch(/\/documentos-admin\/envios\/[0-9a-f-]{36}\.pdf$/);
  expect(api[0]).toMatchObject({ acao: 'documento', nome: 'contrato', id_pasta: 'p2', extensao: 'pdf' });
  await m.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Nova pasta' }).first().click();
  const np = page.getByRole('dialog', { name: 'Nova pasta' });
  await np.getByLabel('Nome da pasta').fill('Jurídico');
  await np.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_pasta_documentos_admin').map((x) => x.corpo)).toEqual([{ p_id: null, p_nome: 'Jurídico' }]);
  await ctx.close();
});

test('editor PDF: clicar na palavra e editar no lugar mantendo tamanho/negrito, apagar trecho, texto novo, pré-visualizar e salvar (PDF real conferido)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const { enviados, api } = await preparar(ctx);
  const page = await abrir(ctx);
  const painel = page.getByRole('complementary', { name: 'Detalhes do documento' });
  await painel.getByRole('button', { name: 'Abrir editor' }).click();
  const ed = page.getByRole('dialog', { name: /Editor de PDF/ });
  await expect(ed.getByTestId('indicador-pagina')).toHaveText('Página 1 de 2', { timeout: 30000 });
  await expect(ed.getByRole('button', { name: 'Editar texto' })).toHaveAttribute('aria-pressed', 'true');
  await expect(ed.getByTestId('aviso-sobreposicao')).toContainText('sobreposição');
  // 1) Clique direto na palavra: abre a edição no lugar, com o cursor ali
  const linha = ed.locator('.camada-texto span', { hasText: 'Quantidade 10' });
  await expect(linha).toHaveCount(1, { timeout: 15000 });
  await linha.click();
  const caixa = ed.getByRole('textbox', { name: /Editar trecho: Cabo de rede CAT6/ });
  await expect(caixa).toBeFocused();
  await expect(ed.getByTestId('estilo-detectado')).toContainText('12 pt · normal');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Cabo de rede CAT6 Quantidade 12 Total R$ 60,00');
  await page.keyboard.press('Enter');
  await expect(caixa).not.toBeFocused();
  // 2) Trecho em negrito continua em negrito
  await ed.locator('.camada-texto span', { hasText: 'CNPJ' }).click();
  await expect(ed.getByTestId('estilo-detectado')).toContainText('11 pt · negrito');
  const cnpj = ed.getByRole('textbox', { name: /Editar trecho: CNPJ/ });
  await page.keyboard.press('End');
  await page.keyboard.type(' (matriz)');
  await page.keyboard.press('Enter');
  await expect(cnpj).toHaveText('CNPJ: 24.214.920/0001-70 (matriz)');
  // 3) Apagar um trecho inteiro
  await ed.locator('.camada-texto span', { hasText: 'RECIBO Tech' }).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Enter');
  await expect(ed.getByTestId('lista-alteracoes')).toContainText('Removido: “RECIBO Tech Suprimentos”');
  // 4) Texto novo na página 2
  await ed.getByRole('button', { name: 'Próxima página' }).click();
  await expect(ed.getByTestId('indicador-pagina')).toHaveText('Página 2 de 2');
  await ed.getByRole('button', { name: 'Novo texto' }).click();
  await ed.getByTestId('pagina-pdf').click({ position: { x: 100, y: 200 } });
  await page.keyboard.type('Conferido por Valdo');
  await page.keyboard.press('Enter');
  await expect(ed.getByTestId('lista-alteracoes')).toContainText('p.2 · Novo texto: Conferido por Valdo');
  // Pré-visualizar (o Chromium sem interface baixa o PDF em vez de mostrar)
  const [previa] = await Promise.all([page.waitForEvent('popup'), ed.getByRole('button', { name: 'Pré-visualizar' }).click()]);
  let abriu = false;
  previa.on('download', () => { abriu = true; });
  await expect.poll(() => abriu || previa.url().startsWith('blob:'), { timeout: 30000 }).toBe(true);
  await expect(ed.getByRole('alert')).toHaveCount(0);
  await previa.close();
  await ed.getByLabel('Descrição da versão (opcional)').fill('Correção da quantidade');
  await ed.getByRole('button', { name: 'Salvar como nova versão' }).click();
  await expect.poll(() => api.length).toBe(1);
  expect(api[0]).toMatchObject({ acao: 'versao', id_documento: 'd1', versao_base: 2, origem: 'edicao', observacao: 'Correção da quantidade', confirmar_protegido: false });
  await expect(page.getByRole('status').filter({ hasText: 'Versão v3 salva' })).toBeVisible();
  // Confere o PDF gerado de verdade
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const docEditado = await pdfjs.getDocument({ data: new Uint8Array(enviados[0].corpo) }).promise;
  const itens = async (n: number) => ((await (await docEditado.getPage(n)).getTextContent()).items as { str: string; transform: number[] }[]);
  const p1 = await itens(1);
  const novo = p1.find((i) => i.str.includes('Quantidade 12 Total R$ 60,00'))!;
  expect(novo).toBeTruthy();
  expect(Math.abs(novo.transform[5] - 700)).toBeLessThan(0.01); // mesma linha de base do original
  expect(Math.abs(novo.transform[4] - 60)).toBeLessThan(0.01);
  expect(Math.hypot(novo.transform[2], novo.transform[3])).toBeCloseTo(12, 1); // mesmo tamanho
  expect(p1.some((i) => i.str.includes('(matriz)'))).toBe(true);
  expect(p1.some((i) => i.str.includes('Quantidade 10'))).toBe(true); // sobreposição: original continua no arquivo
  expect((await itens(2)).some((i) => i.str.includes('Conferido por Valdo'))).toBe(true);
  // Negrito preservado: o texto acrescentado no trecho em negrito usa Helvetica-Bold
  const editado = await PDFDocument.load(enviados[0].corpo);
  const fontes = editado.context.enumerateIndirectObjects().map(([, o]) => String((o as { get?: (k: unknown) => unknown }).get?.(PDFName.of('BaseFont')) ?? '')).filter(Boolean);
  expect(fontes.filter((f) => f === '/Helvetica-Bold').length).toBeGreaterThanOrEqual(2); // original + o do texto novo
  await ctx.close();
});

test('documento assinado exige confirmação; acesso negado a não-master; estados e layout', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const { api } = await preparar(ctx, (c) => (c === 'rpc/buscar_documentos_admin' ? { corpo: [{ ...DOCS[0], assinado: true, protegido: true }] } : undefined));
  const page = await abrir(ctx);
  const painel = page.getByRole('complementary', { name: 'Detalhes do documento' });
  await expect(painel).toContainText('assinatura digital detectada');
  await painel.getByRole('button', { name: 'Abrir editor' }).click();
  const ed = page.getByRole('dialog', { name: /Editor de PDF/ });
  await expect(ed.getByTestId('indicador-pagina')).toHaveText('Página 1 de 2', { timeout: 30000 });
  await ed.getByRole('button', { name: 'Novo texto' }).click();
  await ed.getByTestId('pagina-pdf').click({ position: { x: 80, y: 80 } });
  await page.keyboard.type('Ok');
  await ed.getByRole('button', { name: 'Salvar como nova versão' }).click();
  await expect(ed.getByRole('alert')).toContainText('invalida a assinatura');
  expect(api).toHaveLength(0);
  await ed.getByLabel(/assinatura digital/).check();
  await ed.getByRole('button', { name: 'Salvar como nova versão' }).click();
  await expect.poll(() => api.length).toBe(1);
  expect(api[0]).toMatchObject({ confirmar_protegido: true });
  await ctx.close();

  const naoMaster = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(naoMaster, rotas((c) => (c === 'perfis' ? { corpo: [{ funcao_global: 'admin' }] } : c === 'rpc/admin_master_ativo' ? { corpo: false } : undefined)));
  const pn = await naoMaster.newPage();
  await pn.goto(`${BASE}/admin/documentos`);
  await expect(pn.getByRole('alert').filter({ hasText: 'acesso exclusivo do Admin Master' })).toBeVisible({ timeout: 90000 });
  await expect(pn.getByRole('link', { name: 'Documentos' })).toHaveCount(0);
  await naoMaster.close();

  const ausente = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await preparar(ausente, (c) => (c === 'rpc/buscar_documentos_admin' || c === 'rpc/resumo_documentos_admin' ? { status: 404, corpo: { code: 'PGRST202', message: 'Could not find the function in the schema cache' } } : undefined));
  const pa = await abrir(ausente);
  await expect(pa.getByTestId('documentos-indisponivel')).toContainText('falta aplicar uma atualização do banco', { timeout: 15000 });
  await ausente.close();

  const l = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await preparar(l);
  const pg = await abrir(l);
  await expect(pg.getByTestId('documento-Recibo fornecedor')).toBeVisible({ timeout: 15000 });
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    await pg.setViewportSize({ width: largura, height: 900 });
    await pg.waitForTimeout(200);
    expect(await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `@${largura}`).toBeLessThanOrEqual(1);
  }
  await l.close();
});
