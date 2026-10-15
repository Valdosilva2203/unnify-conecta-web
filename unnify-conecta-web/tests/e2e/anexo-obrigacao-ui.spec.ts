import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, USUARIO_SIMULADO, type Rotas } from './apoio/sessao-simulada';

// Anexo de arquivo em obrigações (interface) com a API do Supabase e a rota /api/documentos SIMULADAS: não acessa o banco.
// Regras de acesso, Storage e consistência estão em tests/sql/anexo-obrigacao.mjs (PostgreSQL local).

const BASE = 'http://localhost:3000';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dia = (d: number) => new Date(Date.parse(`${hoje}T12:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'ALFA LTDA', nome_comercial: 'Alfa', cnpj: '12345678000190', tipo_empresa: 'comum' };
const DOC_PDF = { id: 'd1', nome: 'Guia DAS', caminho: `${EMPRESA.id}/11111111-1111-4111-8111-111111111111.pdf`, tipo_mime: 'application/pdf', tamanho: 254000 };
const DOC_XLSX = { id: 'd2', nome: 'Planilha de apuração', caminho: `${EMPRESA.id}/22222222-2222-4222-8222-222222222222.xlsx`, tipo_mime: XLSX, tamanho: 3_400_000 };
const OBRIGACOES = [
  { id: 'o1', id_empresa: EMPRESA.id, titulo: 'DAS de setembro', descricao: null, categoria: 'fiscal', id_responsavel: null, data_vencimento: dia(5), status: 'pendente', situacao: 'pendente',
    dias_para_vencer: 5, observacoes: null, id_documento: 'd1', id_tarefa: null, motivo_cancelamento: null },
  { id: 'o2', id_empresa: EMPRESA.id, titulo: 'Planilha mensal', descricao: null, categoria: 'contabil', id_responsavel: null, data_vencimento: dia(8), status: 'pendente', situacao: 'pendente',
    dias_para_vencer: 8, observacoes: null, id_documento: 'd2', id_tarefa: null, motivo_cancelamento: null },
  { id: 'o3', id_empresa: EMPRESA.id, titulo: 'Sem anexo', descricao: null, categoria: 'outras', id_responsavel: null, data_vencimento: dia(9), status: 'pendente', situacao: 'pendente',
    dias_para_vencer: 9, observacoes: null, id_documento: null, id_tarefa: null, motivo_cancelamento: null },
];

function rotas(extra?: Rotas): Rotas {
  return (caminho, url, req) => {
    const e = extra?.(caminho, url, req);
    if (e) return e;
    if (caminho === 'perfis') return { corpo: [{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }] };
    if (caminho === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (caminho === 'rpc/responsaveis_obrigacoes') return { corpo: [{ id_usuario: USUARIO_SIMULADO.id, nome: 'Ana Souza', papel: 'empresa' }] };
    if (caminho === 'rpc/resumo_documentos_obrigacoes') return { corpo: { obrigacoes_atrasadas: 0, obrigacoes_7_dias: 1, obrigacoes_abertas: 3, obrigacoes_concluidas_mes: 0 } };
    if (caminho === 'documentos_empresa') {
      const ids = url.searchParams.get('id') ?? '';
      return { corpo: [DOC_PDF, DOC_XLSX].filter((d) => !ids || ids.includes(d.id)), total: 2 };
    }
    if (caminho === 'obrigacoes_empresa_situacao') return { corpo: OBRIGACOES, total: OBRIGACOES.length };
    if (caminho.startsWith('/storage/v1/object/sign/')) return { corpo: { signedURL: '/storage/v1/object/sign/x?token=simulado' } };
    if (caminho === 'empresas') return { corpo: [] };
    return undefined;
  };
}

async function abrir(ctx: BrowserContext, fecharPopups = true): Promise<Page> {
  const page = await ctx.newPage();
  if (fecharPopups) page.on('popup', (p) => p.close());
  await page.goto(`${BASE}/app/obrigacoes`);
  await expect(page.getByRole('heading', { name: 'Obrigações', exact: true })).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole('row').filter({ hasText: 'Sem anexo' })).toBeVisible({ timeout: 30000 });
  return page;
}
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF');
const corpoRpc = (r: { chamadas: { caminho: string; corpo: unknown }[] }, nome: string) => r.chamadas.filter((c) => c.caminho === `rpc/${nome}`).at(-1)?.corpo as Record<string, unknown> | undefined;

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('lista mostra nome, tipo e tamanho; visualizar abre URL temporária; planilha só baixa', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const abertas: string[] = []; // URLs abertas pelas ações (a assinatura 60s devolve /sign/x; o ?download só entra quando é baixar)
  const registro = await sessaoSimulada(ctx, rotas((c, u) => (c.endsWith('/object/sign/x') ? (abertas.push(decodeURIComponent(u.search.replaceAll('+', ' '))), { corpo: 'arquivo' }) : undefined)));
  const page = await abrir(ctx, false);
  await expect(page.getByTestId('anexo-Guia DAS')).toContainText('PDF · 248 KB');
  await expect(page.getByTestId('anexo-Planilha de apuração')).toContainText('XLSX · 3,2 MB');
  await expect(page.getByRole('button', { name: 'Visualizar anexo Planilha de apuração' })).toHaveCount(0); // planilha não abre no navegador
  const p1 = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Visualizar anexo Guia DAS' }).click();
  await (await p1).waitForLoadState('domcontentloaded');
  const p2 = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Baixar anexo Planilha de apuração' }).click();
  await (await p2).waitForLoadState('domcontentloaded');
  await expect.poll(() => abertas.length).toBe(2);
  expect(abertas[0]).not.toContain('download'); // PDF: visualizar
  expect(abertas[1]).toContain('download=Planilha de apuracao.xlsx'); // planilha: baixa com a extensão certa e nome sem acento (evita %C3%A7)
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('novo: valida tipo e tamanho, mostra o arquivo, remove antes de salvar e envia ao salvar', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const envios: string[] = [];
  await ctx.route('**/api/documentos', async (route) => {
    envios.push(route.request().headers()['content-type'] ?? '');
    const corpo = route.request().postDataBuffer()?.toString('latin1') ?? '';
    expect(corpo).toContain('name="finalidade"');
    expect(corpo).toContain('obrigacao');
    expect(corpo).toContain('name="compartilhar"');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'd9' }) });
  });
  const registro = await sessaoSimulada(ctx, rotas((c) => (c === 'rpc/salvar_obrigacao' ? { corpo: 'ok' } : undefined)));
  const page = await abrir(ctx);
  await page.getByRole('button', { name: 'Nova obrigação' }).click();
  const d = page.getByRole('dialog');
  await expect(d.getByLabel(/^Anexar arquivo/)).toBeVisible();
  await expect(d.getByText('PDF, JPG, PNG ou XLSX, até 10 MB.')).toBeVisible();
  // Tipo não permitido
  await d.getByLabel(/^Anexar arquivo/).setInputFiles({ name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
  await expect(d.getByRole('alert')).toHaveText('Envie PDF, JPG, PNG ou XLSX.');
  await expect(d.getByTestId('anexo-selecionado')).toHaveCount(0);
  // Acima de 10 MB
  await d.getByLabel(/^Anexar arquivo/).setInputFiles({ name: 'grande.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 1) });
  await expect(d.getByRole('alert')).toHaveText('O arquivo deve ter até 10 MB.');
  // Arquivo válido: nome e tamanho; remover antes de salvar
  await d.getByLabel(/^Anexar arquivo/).setInputFiles({ name: 'guia.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(d.getByTestId('anexo-selecionado')).toContainText('guia.pdf');
  await expect(d.getByTestId('anexo-selecionado')).toContainText('1 KB');
  await d.getByRole('button', { name: 'Remover guia.pdf' }).click();
  await expect(d.getByTestId('anexo-selecionado')).toHaveCount(0);
  // Salvar sem anexo: nada é enviado
  await d.getByLabel('Título').fill('Obrigação sem arquivo');
  await d.getByLabel('Vencimento').fill(dia(10));
  await d.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Obrigação cadastrada.')).toBeVisible({ timeout: 15000 });
  expect(envios).toHaveLength(0);
  expect(corpoRpc(registro, 'salvar_obrigacao')).toMatchObject({ p_id: null, p_id_documento: null });
  // Salvar com anexo: envia o arquivo e vincula o documento retornado
  await page.getByRole('button', { name: 'Nova obrigação' }).click();
  await d.getByLabel('Título').fill('Obrigação com arquivo');
  await d.getByLabel('Vencimento').fill(dia(10));
  await d.getByLabel(/^Anexar arquivo/).setInputFiles({ name: 'guia.pdf', mimeType: 'application/pdf', buffer: PDF });
  await d.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => corpoRpc(registro, 'salvar_obrigacao')?.p_titulo).toBe('Obrigação com arquivo');
  expect(envios).toHaveLength(1);
  expect(corpoRpc(registro, 'salvar_obrigacao')).toMatchObject({ p_titulo: 'Obrigação com arquivo', p_id_documento: 'd9' });
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('falha no envio não salva a obrigação; falha ao salvar descarta o anexo enviado', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let envioFalha = true;
  await ctx.route('**/api/documentos', (route) => (envioFalha
    ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ erro: 'Não foi possível enviar o arquivo. Verifique sua permissão para esta empresa.' }) })
    : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'd9' }) })));
  const registro = await sessaoSimulada(ctx, rotas((c) => {
    if (c === 'rpc/salvar_obrigacao') return { status: 400, corpo: { code: '23514', message: 'Dados inválidos', details: null, hint: null } };
    if (c === 'rpc/excluir_documento') return { corpo: DOC_PDF.caminho };
    if (c.startsWith('/storage/v1/object/documentos-empresas')) return { corpo: [] };
  }));
  const page = await abrir(ctx);
  await page.getByRole('button', { name: 'Nova obrigação' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Título').fill('Com falha');
  await d.getByLabel('Vencimento').fill(dia(10));
  await d.getByLabel(/^Anexar arquivo/).setInputFiles({ name: 'guia.pdf', mimeType: 'application/pdf', buffer: PDF });
  await d.getByRole('button', { name: 'Salvar' }).click();
  await expect(d.getByRole('alert')).toContainText('Não foi possível enviar o arquivo');
  expect(corpoRpc(registro, 'salvar_obrigacao')).toBeUndefined(); // upload falhou: a obrigação nem é salva
  // Upload ok, salvar falha: descarta o documento recém-enviado
  envioFalha = false;
  await d.getByRole('button', { name: 'Salvar' }).click();
  await expect(d.getByRole('alert')).toBeVisible();
  await expect.poll(() => corpoRpc(registro, 'excluir_documento')).toMatchObject({ p_id: 'd9' });
  await expect(d).toBeVisible(); // modal segue aberto para o usuário corrigir
  await ctx.close();
});

test('editar: adicionar/substituir anexo vincula o novo documento; responsivo 320–1920px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.route('**/api/documentos', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'd7' }) }));
  const registro = await sessaoSimulada(ctx, rotas((c) => (c === 'rpc/salvar_obrigacao' ? { corpo: 'ok' } : undefined)));
  const page = await abrir(ctx);
  await page.getByRole('button', { name: 'Editar DAS de setembro' }).click();
  const d = page.getByRole('dialog');
  await expect(d.getByLabel(/^Documento relacionado/)).toHaveValue('d1');
  await d.getByLabel(/^Anexar arquivo/).setInputFiles({ name: 'novo.xlsx', mimeType: XLSX, buffer: Buffer.from('PK\u0003\u0004') });
  await expect(d.getByText('Ao anexar, substitui o documento relacionado acima.')).toBeVisible();
  await d.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Obrigação atualizada.')).toBeVisible({ timeout: 15000 });
  expect(corpoRpc(registro, 'salvar_obrigacao')).toMatchObject({ p_id: 'o1', p_id_documento: 'd7' });
  // Editar sem anexar mantém o vínculo atual; "Nenhum" remove
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Editar Planilha mensal' }).click();
  await d.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => corpoRpc(registro, 'salvar_obrigacao')?.p_id).toBe('o2');
  expect(corpoRpc(registro, 'salvar_obrigacao')).toMatchObject({ p_id_documento: 'd2' });
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('responsivo de 320 a 1920px: lista com anexos e modal com arquivo selecionado, sem rolagem lateral', async ({ browser }) => {
  for (const largura of [320, 375, 768, 1440, 1920]) {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
    await sessaoSimulada(ctx, rotas());
    const page = await abrir(ctx);
    const estouro = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const quem = await page.evaluate(() => [...document.querySelectorAll('main tr:last-child *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 6).map((e) => `${e.tagName}.${String(e.className).slice(0, 50)}=${Math.round(e.getBoundingClientRect().right)}`));
    expect(await estouro(), `lista @${largura} ${quem.join(' | ')}`).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Nova obrigação' }).click();
    await page.getByRole('dialog').getByLabel(/^Anexar arquivo/).setInputFiles({ name: 'um-nome-de-arquivo-bem-comprido-para-testar-o-corte-no-celular.pdf', mimeType: 'application/pdf', buffer: PDF });
    await expect(page.getByTestId('anexo-selecionado')).toBeVisible();
    expect(await estouro(), `modal @${largura}`).toBeLessThanOrEqual(1);
    await ctx.close();
  }
});

test('contador sem "Enviar documentos" não vê o campo de anexo', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await sessaoSimulada(ctx, rotas((c) => {
    if (c === 'perfis') return { corpo: [{ nome_completo: 'Carlos Contador', tipo_usuario: 'contador', funcao_global: 'user' }] };
    if (c === 'rpc/empresas_do_contador') return { corpo: [{ id_empresa: EMPRESA.id, razao_social: EMPRESA.razao_social, nome_comercial: 'Alfa', cnpj: EMPRESA.cnpj, status: 'ativo', permissoes: ['gerenciar_obrigacoes'], total: 1 }] };
  }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/contador/obrigacoes`);
  await expect(page.getByRole('row').filter({ hasText: 'Sem anexo' })).toBeVisible({ timeout: 90000 });
  await page.getByRole('button', { name: 'Nova obrigação' }).click();
  await expect(page.getByRole('dialog').getByLabel(/^Anexar arquivo/)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('Seu vínculo não inclui enviar documentos');
  await ctx.close();
});
