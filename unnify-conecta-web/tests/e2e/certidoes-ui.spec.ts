import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// Certidões (dentro de Documentos) com a API do Supabase SIMULADA e PDFs FICTÍCIOS gerados aqui: nada real, nada no banco.
// Regras de acesso, Storage, versões e alertas estão em tests/sql/certidoes.mjs (PostgreSQL local).
const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dia = (d: number) => new Date(Date.parse(`${hoje}T12:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const EMP = { id: 'aaaaaaaa-0000-4000-8000-0000000000a1', nome: 'Empresa Exemplo', cnpj: '11222333000181' };
const cert = (id: string, nome: string, extra: Record<string, unknown>) => ({ id, id_empresa: EMP.id, tipo: 'federal', nome, orgao_emissor: 'Receita Federal do Brasil / PGFN', resultado: 'negativa',
  data_emissao: dia(-20), data_validade: dia(160), codigo_controle: 'AAAA.BBBB.CCCC.DDDD', observacoes: null, versao_atual: 2, situacao: 'valida', dias_para_vencer: 160,
  caminho: `${EMP.id}/11111111-1111-4111-8111-111111111111.pdf`, nome_arquivo: 'cnd.pdf', tamanho: 120000, arquivada_em: null, criado_em: `${hoje}T10:00:00Z`, atualizado_em: `${hoje}T10:00:00Z`, ...extra });
const LISTA = [
  cert('c1', 'Certidão Federal (RFB/PGFN)', {}),
  cert('c2', 'Certidão de Regularidade do FGTS (CRF)', { tipo: 'fgts', orgao_emissor: 'Caixa Econômica Federal', resultado: null, data_validade: dia(5), situacao: 'vencendo', dias_para_vencer: 5, versao_atual: 1, codigo_controle: null }),
  cert('c3', 'Certidão Municipal', { tipo: 'municipal', orgao_emissor: 'Prefeitura Municipal', resultado: null, data_validade: dia(-3), situacao: 'vencida', dias_para_vencer: -3, versao_atual: 1 }),
];

function rotas(papel: 'contador' | 'empresa', permissoes: string[], extra?: Rotas): Rotas {
  return (c, u, req) => {
    const e = extra?.(c, u, req);
    if (e) return e;
    if (c === 'perfis') return { corpo: [{ nome_completo: papel === 'contador' ? 'Contador Teste' : 'Dona Teste', tipo_usuario: papel, funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [{ empresas: { id: EMP.id, razao_social: 'EMPRESA EXEMPLO LTDA', nome_comercial: EMP.nome, cnpj: EMP.cnpj, tipo_empresa: 'comum' } }] };
    if (c === 'rpc/painel_contador') return { corpo: [{ id_empresa: EMP.id, nome: EMP.nome, cnpj: EMP.cnpj, permissoes, solicitacoes_aguardando_analise: 0, solicitacoes_aguardando_empresa: 0,
      obrigacoes_abertas: null, obrigacoes_atrasadas: null, obrigacoes_7_dias: null, itens_concluidos: 0 }] };
    if (c === 'rpc/verificar_alertas_certidoes') return { corpo: 0 };
    if (c === 'rpc/resumo_certidoes') return { corpo: { total: 3, validas: 1, vencendo: 1, vencidas: 1, sem_validade: 0 } };
    if (c === 'certidoes_situacao') return { corpo: LISTA };
    if (c === 'versoes_certidoes') return { corpo: [{ id: 'v2', numero: 2, caminho: LISTA[0].caminho, nome_arquivo: 'cnd.pdf', tamanho: 120000, data_emissao: dia(-20), data_validade: dia(160), codigo_controle: 'AAAA.BBBB.CCCC.DDDD', enviado_em: `${hoje}T10:00:00Z` },
      { id: 'v1', numero: 1, caminho: `${EMP.id}/22222222-2222-4222-8222-222222222222.pdf`, nome_arquivo: 'cnd-antiga.pdf', tamanho: 110000, data_emissao: dia(-200), data_validade: dia(-20), codigo_controle: null, enviado_em: `${hoje}T09:00:00Z` }] };
    if (c === 'historico_certidoes') return { corpo: [{ acao: 'nova_versao', dados: { versao: 2 }, criado_em: `${hoje}T10:00:00Z` }, { acao: 'cadastrada', dados: null, criado_em: `${hoje}T09:00:00Z` }] };
    if (c.startsWith('/storage/v1/object/sign/certidoes/')) return { corpo: { signedURL: '/object/sign/x?token=simulado' } };
    if (c === 'rpc/resumo_documentos_obrigacoes') return { corpo: { solicitacoes_aguardando_empresa: 0 } };
    if (['documentos_empresa', 'solicitacoes_documentos', 'notificacoes', 'empresas'].includes(c)) return { corpo: [] };
    return undefined;
  };
}

async function pdf(linhas: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const p = doc.addPage([595, 842]);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  linhas.forEach((l, i) => p.drawText(l, { x: 40, y: 800 - i * 18, size: 10, font: fonte }));
  return Buffer.from(await doc.save());
}
const linhasCnd = (cnpj = '11.222.333/0001-81') => ['MINISTÉRIO DA FAZENDA', 'Secretaria da Receita Federal do Brasil', 'Procuradoria-Geral da Fazenda Nacional',
  'CERTIDÃO NEGATIVA DE DÉBITOS RELATIVOS AOS TRIBUTOS FEDERAIS E À DÍVIDA ATIVA DA UNIÃO', 'Nome: EMPRESA EXEMPLO LTDA', `CNPJ: ${cnpj}`,
  `Emitida às 10:22:33 do dia ${br(dia(-1))} <hora e data de Brasília>.`, `Válida até ${br(dia(179))}.`, 'Código de controle da certidão: 1A2B.3C4D.5E6F.7A8B'];

async function abrirContador(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  page.on('popup', (p) => p.close());
  await page.goto(`${BASE}/contador/empresas/${EMP.id}/documentos#certidoes`);
  await expect(page.getByTestId('modulo-certidoes')).toBeVisible({ timeout: 90000 });
  return page;
}
const corpoRpc = (r: { chamadas: { caminho: string; corpo: unknown }[] }, n: string) => r.chamadas.filter((c) => c.caminho === `rpc/${n}`).at(-1)?.corpo as Record<string, unknown> | undefined;

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('contador: Certidões dentro de Documentos (sem item novo no menu), lista, situação e alertas verificados', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas('contador', ['ver_documentos', 'gerenciar_certidoes']));
  const page = await abrirContador(ctx);
  const menu = page.getByRole('navigation', { name: 'Espaço da empresa' });
  expect(await menu.getByRole('link').allTextContents()).toEqual(['Visão geral', 'Solicitações', 'Documentos', 'Tarefas']); // nenhuma opção "Certidões" no menu
  await expect(menu.getByRole('link', { name: 'Documentos' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Seções de documentos' }).getByRole('button', { name: 'Certidões' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('region', { name: 'Vencidas' })).toContainText('1');
  await expect(page.getByRole('row').filter({ hasText: 'Certidão de Regularidade do FGTS' })).toContainText('Vence em 5 dias');
  await expect(page.getByRole('row').filter({ hasText: 'Certidão Municipal' })).toContainText('Vencida');
  await expect(page.getByRole('row').filter({ hasText: 'Certidão Federal (RFB/PGFN)' })).toContainText('Código AAAA.BBBB.CCCC.DDDD · Versão 2');
  expect(corpoRpc(registro, 'verificar_alertas_certidoes')).toEqual({ p_id_empresa: EMP.id });
  // Versões e histórico
  await page.getByRole('button', { name: 'Versões e histórico de Certidão Federal (RFB/PGFN)' }).click();
  const h = page.getByRole('dialog', { name: 'Versões e histórico' });
  await expect(h.getByTestId('versao-2')).toContainText('Versão 2 (atual)');
  await expect(h.getByTestId('versao-1')).toContainText(`validade ${br(dia(-20))}`);
  await expect(h).toContainText('Nova versão enviada (versão 2)');
  await h.getByRole('button', { name: 'Baixar versão 1' }).click();
  await expect.poll(() => registro.chamadas.filter((c) => c.caminho === `/storage/v1/object/sign/certidoes/${EMP.id}/22222222-2222-4222-8222-222222222222.pdf`).length).toBe(1);
  // Aba Arquivos continua lá
  await page.keyboard.press('Escape');
  await page.getByRole('navigation', { name: 'Seções de documentos' }).getByRole('button', { name: 'Arquivos' }).click();
  await expect(page.getByTestId('modulo-certidoes')).toHaveCount(0);
  expect(registro.escritasBloqueadas.filter((x) => !x.includes('rpc/'))).toEqual([]);
  await ctx.close();
});

test('nova certidão: lê o PDF, preenche, mostra CNPJ/razão, exige conferência, envia e salva', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas('contador', ['gerenciar_certidoes'], (c) => {
    if (c.startsWith(`/storage/v1/object/certidoes/${EMP.id}/`)) return { corpo: { Key: 'ok' } };
    if (c === 'rpc/salvar_certidao') return { corpo: 'c9' };
  }));
  const page = await abrirContador(ctx);
  await expect(page.getByRole('navigation', { name: 'Seções de documentos' }).getByRole('button')).toHaveText(['Certidões']); // sem "ver_documentos": só Certidões
  await page.getByRole('button', { name: 'Nova certidão' }).click();
  const d = page.getByRole('dialog', { name: 'Nova certidão' });
  await expect(d.getByRole('list', { name: 'Etapas' }).getByRole('listitem').first()).toHaveAttribute('aria-current', 'step');
  await d.getByLabel('PDF da certidão').setInputFiles({ name: 'arquivo.pdf', mimeType: 'application/pdf', buffer: await pdf(linhasCnd()) });
  const l = d.getByTestId('leitura-certidao');
  await expect(l).toContainText('Documento identificado', { timeout: 30000 });
  await expect(l).toContainText('Certidão Federal (RFB/PGFN)');
  await expect(d.getByTestId('arquivo-certidao')).toContainText('arquivo.pdf');
  await expect(d.getByTestId('arquivo-certidao')).toContainText('Documento analisado');
  await expect(d.getByLabel('Tipo de certidão')).toHaveValue('federal');
  await expect(d.getByLabel('Órgão emissor')).toHaveValue('Receita Federal do Brasil / PGFN');
  await expect(d.getByLabel('CNPJ')).toHaveValue('11.222.333/0001-81');
  await expect(d.getByLabel('Razão social')).toHaveValue('EMPRESA EXEMPLO LTDA');
  await expect(d.getByLabel('Data de emissão')).toHaveValue(dia(-1));
  await expect(d.getByLabel('Data de validade')).toHaveValue(dia(179));
  await expect(d.getByLabel('Código de controle')).toHaveValue('1A2B.3C4D.5E6F.7A8B');
  await expect(d.getByLabel('Resultado')).toHaveValue('negativa');
  await expect(d.getByTestId('situacao-certidao')).toContainText('Válida');
  await expect(l).toContainText('não confirma a autenticidade');
  await expect(d.getByTitle('Prévia do PDF')).toBeVisible();
  await d.getByRole('button', { name: 'Alterar tipo' }).click();
  await expect(d.getByLabel('Tipo de certidão')).toBeFocused();
  await d.getByLabel('Observações (opcional)').fill('Conferida no site da Receita');
  await d.getByRole('button', { name: 'Salvar certidão' }).click();
  await expect(d.getByRole('alert')).toHaveText('Confirme que conferiu os dados da certidão antes de salvar.');
  expect(registro.chamadas.some((c) => c.caminho.startsWith('/storage/v1/object/certidoes/'))).toBe(false); // nada enviado antes de confirmar
  await d.getByLabel('Conferi os dados da certidão').check();
  await d.getByRole('button', { name: 'Salvar certidão' }).click();
  await expect(page.getByText('Certidão cadastrada.')).toBeVisible({ timeout: 15000 });
  const envio = registro.chamadas.find((c) => c.caminho.startsWith(`/storage/v1/object/certidoes/${EMP.id}/`));
  expect(envio?.caminho).toMatch(new RegExp(`^/storage/v1/object/certidoes/${EMP.id}/[0-9a-f-]{36}\\.pdf$`));
  expect(corpoRpc(registro, 'salvar_certidao')).toMatchObject({ p_id: null, p_id_empresa: EMP.id, p_tipo: 'federal', p_nome: 'Certidão Federal (RFB/PGFN)', p_orgao: 'Receita Federal do Brasil / PGFN',
    p_resultado: 'negativa', p_emissao: dia(-1), p_validade: dia(179), p_codigo: '1A2B.3C4D.5E6F.7A8B', p_observacoes: 'Conferida no site da Receita', p_nome_arquivo: 'arquivo.pdf',
    p_caminho: envio!.caminho.replace('/storage/v1/object/certidoes/', '') });
  await ctx.close();
});

test('bloqueios e falhas: CNPJ divergente, PDF inválido, sem texto e falha ao salvar descarta o arquivo', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas('contador', ['gerenciar_certidoes'], (c, _u, req) => {
    if (c.startsWith(`/storage/v1/object/certidoes`)) return req.method() === 'DELETE' ? { corpo: [] } : { corpo: { Key: 'ok' } };
    if (c === 'rpc/salvar_certidao') return { status: 400, corpo: { code: '23514', message: 'Dados da certidão inválidos: confira tipo, nome, órgão, datas e código.', details: null, hint: null } };
  }));
  const page = await abrirContador(ctx);
  await page.getByRole('button', { name: 'Nova certidão' }).click();
  const d = page.getByRole('dialog', { name: 'Nova certidão' });
  await d.getByLabel('PDF da certidão').setInputFiles({ name: 'outra.pdf', mimeType: 'application/pdf', buffer: await pdf(linhasCnd('11.444.777/0001-61')) });
  await expect(d.getByTestId('leitura-certidao').getByRole('alert')).toContainText('O CNPJ da certidão (11.444.777/0001-61) é diferente do CNPJ desta empresa (11.222.333/0001-81)', { timeout: 30000 });
  await expect(d.getByRole('button', { name: 'Salvar certidão' })).toBeDisabled();
  await d.getByLabel('PDF da certidão').setInputFiles({ name: 'falso.pdf', mimeType: 'application/pdf', buffer: Buffer.from('nao e pdf') });
  await expect(d.getByRole('alert')).toHaveText('Envie a certidão em PDF.');
  const vazio = await PDFDocument.create(); vazio.addPage();
  await d.getByLabel('PDF da certidão').setInputFiles({ name: 'escaneada.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await vazio.save()) });
  await expect(d.getByTestId('leitura-certidao')).toContainText('não tem texto legível', { timeout: 30000 });
  await expect(d.getByLabel('Tipo de certidão')).toHaveValue('');
  // Preenche à mão e o banco recusa: o PDF enviado é descartado
  await d.getByLabel('Tipo de certidão').selectOption('municipal');
  await expect(d.getByLabel('Órgão emissor')).toHaveValue('Prefeitura Municipal');
  await d.getByLabel('Data de emissão').fill(dia(-2));
  await d.getByLabel('Conferi os dados da certidão').check();
  await d.getByRole('button', { name: 'Salvar certidão' }).click();
  await expect(d.getByRole('alert')).toContainText('Dados da certidão inválidos');
  await expect.poll(() => registro.chamadas.filter((c) => c.caminho === '/storage/v1/object/certidoes').length).toBe(1); // remove([caminho]) = DELETE
  await ctx.close();
});

test('nova versão começa sem datas antigas; só "ver_documentos" não gerencia; empresário vê e baixa', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await sessaoSimulada(ctx, rotas('contador', ['gerenciar_certidoes']));
  const page = await abrirContador(ctx);
  await page.getByRole('button', { name: 'Enviar nova versão de Certidão Federal (RFB/PGFN)' }).click();
  const d = page.getByRole('dialog', { name: 'Nova versão da certidão' });
  await expect(d.getByLabel('Tipo de certidão')).toHaveValue('federal');
  await expect(d.getByLabel('Data de validade')).toHaveValue(''); // não reaproveita a validade anterior
  await d.getByLabel('PDF da certidão').setInputFiles({ name: 'cnd-nova.pdf', mimeType: 'application/pdf', buffer: await pdf(linhasCnd()) });
  await expect(d.getByLabel('Data de validade')).toHaveValue(dia(179), { timeout: 30000 });
  await ctx.close();

  const ctxV = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await sessaoSimulada(ctxV, rotas('contador', ['ver_documentos']));
  const pv = await abrirContador(ctxV);
  await expect(pv.getByRole('row').filter({ hasText: 'Certidão Municipal' })).toBeVisible();
  await expect(pv.getByRole('button', { name: 'Nova certidão' })).toHaveCount(0);
  await expect(pv.getByRole('button', { name: /^(Editar|Arquivar|Enviar nova versão) / })).toHaveCount(0);
  await expect(pv.getByRole('button', { name: 'Baixar Certidão Municipal' })).toBeVisible();
  await ctxV.close();

  const ctxE = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const reg = await sessaoSimulada(ctxE, rotas('empresa', []));
  const pe = await ctxE.newPage();
  pe.on('popup', (p) => p.close());
  await pe.goto(`${BASE}/app/documentos#certidoes`);
  await expect(pe.getByTestId('modulo-certidoes')).toBeVisible({ timeout: 90000 });
  await expect(pe.getByRole('row').filter({ hasText: 'Certidão Federal (RFB/PGFN)' })).toBeVisible();
  await pe.getByRole('button', { name: 'Baixar Certidão Federal (RFB/PGFN)' }).click();
  await expect.poll(() => reg.chamadas.filter((c) => c.caminho.startsWith('/storage/v1/object/sign/certidoes/')).length).toBe(1);
  await expect(pe.getByRole('button', { name: 'Nova certidão' })).toBeVisible();
  await ctxE.close();
});

test('responsivo de 320 a 1920px: lista e modal sem rolagem lateral', async ({ browser }) => {
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 900 } });
    await sessaoSimulada(ctx, rotas('contador', ['ver_documentos', 'gerenciar_certidoes']));
    const page = await abrirContador(ctx);
    await expect(page.getByRole('row').filter({ hasText: 'Certidão Municipal' })).toBeVisible();
    const estouro = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await estouro(), `lista @${largura}`).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Nova certidão' }).click();
    await page.getByRole('dialog').getByLabel('PDF da certidão').setInputFiles({ name: 'um-nome-de-arquivo-bem-comprido-de-certidao-federal.pdf', mimeType: 'application/pdf', buffer: await pdf(linhasCnd()) });
    await expect(page.getByTestId('leitura-certidao')).toBeVisible({ timeout: 30000 });
    expect(await estouro(), `modal @${largura}`).toBeLessThanOrEqual(1);
    await ctx.close();
  }
});
