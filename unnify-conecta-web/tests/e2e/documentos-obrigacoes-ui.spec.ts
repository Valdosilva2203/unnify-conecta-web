import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, USUARIO_SIMULADO, type Rotas } from './apoio/sessao-simulada';

// E3 — Documentos e Obrigações (interface) com a API do Supabase SIMULADA: não acessa o banco.
// Regras de acesso, Storage e fluxos estão em tests/sql/documentos-obrigacoes.mjs (PostgreSQL local).

const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dia = (d: number) => new Date(Date.parse(`${hoje}T12:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'ALFA LTDA', nome_comercial: 'Alfa', cnpj: '12345678000190', tipo_empresa: 'comum' };
const CONTADOR = '22222222-2222-4222-8222-222222222222';
const DOCS = [
  { id: 'd1', id_empresa: EMPRESA.id, nome: 'Contrato social', categoria: 'societarios', caminho: `${EMPRESA.id}/11111111-1111-4111-8111-111111111111.pdf`, nome_arquivo_original: 'contrato.pdf',
    tipo_mime: 'application/pdf', tamanho: 254000, origem: 'empresa', compartilhado_contador: true, id_solicitacao: null, enviado_por: USUARIO_SIMULADO.id, enviado_em: `${hoje}T10:00:00Z` },
  { id: 'd2', id_empresa: EMPRESA.id, nome: 'Balancete agosto', categoria: 'contabeis', caminho: `${EMPRESA.id}/22222222-2222-4222-8222-222222222222.png`, nome_arquivo_original: 'balancete.png',
    tipo_mime: 'image/png', tamanho: 3_400_000, origem: 'contador', compartilhado_contador: true, id_solicitacao: null, enviado_por: CONTADOR, enviado_em: `${hoje}T09:00:00Z` },
];
const SOLICITACOES = [
  { id: 's1', id_empresa: EMPRESA.id, titulo: 'Extrato bancário de setembro/2026', descricao: 'Conta principal', prazo: dia(3), status: 'pendente', id_documento: null,
    motivo_correcao: null, motivo_cancelamento: null, criado_em: `${hoje}T08:00:00Z`, respondido_em: null, analisado_em: null },
  { id: 's2', id_empresa: EMPRESA.id, titulo: 'Folha de agosto', descricao: null, prazo: null, status: 'enviado', id_documento: 'd1',
    motivo_correcao: null, motivo_cancelamento: null, criado_em: `${hoje}T07:00:00Z`, respondido_em: `${hoje}T08:00:00Z`, analisado_em: null },
];
const OBRIGACOES = [
  { id: 'o1', id_empresa: EMPRESA.id, titulo: 'Entrega da DCTFWeb', descricao: 'Competência setembro', categoria: 'fiscal', id_responsavel: CONTADOR, data_vencimento: dia(-2),
    status: 'pendente', situacao: 'atrasada', dias_para_vencer: -2, observacoes: null, id_documento: null, id_tarefa: null, motivo_cancelamento: null },
  { id: 'o2', id_empresa: EMPRESA.id, titulo: 'Renovar alvará', descricao: null, categoria: 'societaria', id_responsavel: USUARIO_SIMULADO.id, data_vencimento: dia(5),
    status: 'em_andamento', situacao: 'em_andamento', dias_para_vencer: 5, observacoes: null, id_documento: 'd1', id_tarefa: 't1', motivo_cancelamento: null },
];
const PESSOAS = [{ id_usuario: USUARIO_SIMULADO.id, nome: 'Ana Souza', papel: 'empresa' }, { id_usuario: CONTADOR, nome: 'Carlos Contador', papel: 'contador' }];
const RESUMO = { obrigacoes_atrasadas: 1, obrigacoes_7_dias: 1, obrigacoes_abertas: 2, obrigacoes_concluidas_mes: 0, solicitacoes_aguardando_empresa: 1, solicitacoes_aguardando_analise: 1 };

function rotas(papel: 'empresa' | 'contador', extra?: Rotas): Rotas {
  return (caminho, url, req) => {
    const e = extra?.(caminho, url, req);
    if (e) return e;
    if (caminho === 'perfis') return { corpo: [{ nome_completo: papel === 'empresa' ? 'Ana Souza' : 'Carlos Contador', tipo_usuario: papel === 'empresa' ? 'empresa' : 'contador', funcao_global: 'user' }] };
    if (caminho === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (caminho === 'rpc/empresas_do_contador') return { corpo: [{ id_empresa: EMPRESA.id, razao_social: EMPRESA.razao_social, nome_comercial: 'Alfa', cnpj: EMPRESA.cnpj, status: 'ativo',
      permissoes: ['ver_documentos', 'gerenciar_obrigacoes'], total: 1 }] };
    if (caminho === 'rpc/responsaveis_obrigacoes') return { corpo: PESSOAS };
    if (caminho === 'rpc/resumo_documentos_obrigacoes') return { corpo: RESUMO };
    if (caminho === 'documentos_empresa') {
      const ids = url.searchParams.get('id');
      const lista = papel === 'contador' ? DOCS.filter((d) => d.compartilhado_contador) : DOCS;
      return { corpo: ids ? lista.filter((d) => ids.includes(d.id)) : lista, total: lista.length };
    }
    if (caminho === 'solicitacoes_documentos') return { corpo: SOLICITACOES };
    if (caminho === 'historico_solicitacoes_documentos') return { corpo: [{ acao: 'criada', criado_em: `${hoje}T08:00:00Z` }] };
    if (caminho === 'obrigacoes_empresa_situacao') return { corpo: OBRIGACOES, total: OBRIGACOES.length };
    if (caminho.startsWith('/storage/v1/object/sign/')) return { corpo: { signedURL: '/storage/v1/object/sign/x?token=simulado' } };
    if (caminho === 'empresas') return { corpo: [] };
    return undefined;
  };
}

async function abrir(ctx: BrowserContext, caminho: string, titulo: string): Promise<Page> {
  const page = await ctx.newPage();
  page.on('popup', (p) => p.close()); // visualizar/baixar abrem a URL temporária em nova aba
  await page.goto(`${BASE}${caminho}`);
  await expect(page.getByRole('heading', { name: titulo, exact: true })).toBeVisible({ timeout: 90000 });
  return page;
}
const corpoRpc = (registro: { chamadas: { caminho: string; corpo: unknown }[] }, nome: string) =>
  registro.chamadas.filter((c) => c.caminho === `rpc/${nome}`).at(-1)?.corpo as Record<string, unknown> | undefined;

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('empresário: biblioteca, envio validado no servidor, edição, compartilhamento, exclusão e URL temporária', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas('empresa', (caminho) => {
    if (caminho === 'rpc/atualizar_documento') return { status: 204 };
    if (caminho === 'rpc/excluir_documento') return { corpo: DOCS[1].caminho };
    if (caminho === '/storage/v1/object/documentos-empresas') return { corpo: [] };
    return undefined;
  }));
  const envios: Record<string, string>[] = [];
  await ctx.route('**/api/documentos', async (route) => {
    const corpo = route.request().postDataBuffer()?.toString('latin1') ?? '';
    const campos = Object.fromEntries([...corpo.matchAll(/name="([^"]+)"\r\n\r\n([^\r]*)/g)].map((m) => [m[1], m[2]]));
    envios.push(campos);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'novo' }) });
  });
  const page = await abrir(ctx, '/app/documentos', 'Meus documentos');
  // Menu: item habilitado
  await expect(page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Meus documentos' })).toHaveAttribute('href', '/app/documentos');
  await expect(page.getByTestId('documento-Contrato social')).toBeVisible();
  await expect(page.getByTestId('documento-Contrato social')).toContainText('Compartilhado com o contador');
  await expect(page.getByRole('row').filter({ hasText: 'Balancete agosto' })).toContainText('Carlos Contador');
  await expect(page.getByRole('row').filter({ hasText: 'Balancete agosto' })).toContainText('3,2 MB');
  await expect(page.getByRole('button', { name: /Solicitações do contador/ })).toContainText('1');

  // Envio: validações no navegador e envio pela rota do servidor
  await page.getByRole('button', { name: 'Enviar documento' }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'Enviar' }).click();
  await expect(d.getByRole('alert')).toHaveText('Escolha o arquivo.');
  await d.getByLabel('Arquivo').setInputFiles({ name: 'script.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await d.getByRole('button', { name: 'Enviar' }).click();
  await expect(d.getByRole('alert')).toHaveText('Envie PDF, JPG, JPEG ou PNG.');
  await d.getByLabel('Arquivo').setInputFiles({ name: 'alteracao-contratual.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 teste') });
  await expect(d.getByLabel('Nome do documento')).toHaveValue('alteracao-contratual');
  await d.getByLabel('Categoria').selectOption('societarios');
  await d.getByText('Compartilhar com o contador').click();
  await d.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Documento enviado.')).toBeVisible({ timeout: 15000 });
  expect(envios.at(-1)).toMatchObject({ id_empresa: EMPRESA.id, nome: 'alteracao-contratual', categoria: 'societarios', compartilhar: 'true' });

  // URL temporária ao visualizar
  await page.getByRole('button', { name: 'Visualizar Contrato social' }).click();
  await expect.poll(() => registro.chamadas.some((c) => c.caminho.startsWith('/storage/v1/object/sign/documentos-empresas/'))).toBe(true);

  // Editar: nome, categoria e compartilhamento pela função
  await page.getByRole('button', { name: 'Editar Contrato social' }).click();
  await page.getByRole('dialog').getByLabel('Nome do documento').fill('Contrato social consolidado');
  await page.getByRole('dialog').getByText('Compartilhar com o contador').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Documento atualizado.')).toBeVisible({ timeout: 15000 });
  expect(corpoRpc(registro, 'atualizar_documento')).toEqual({ p_id: 'd1', p_nome: 'Contrato social consolidado', p_categoria: 'societarios', p_compartilhar: false });

  // Excluir com confirmação: registro (função) e depois o arquivo
  await page.getByRole('button', { name: 'Excluir Balancete agosto' }).click();
  await expect(page.getByRole('dialog')).toContainText('fica registrada no histórico');
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByText('Documento excluído.')).toBeVisible({ timeout: 15000 });
  expect(registro.chamadas.some((c) => c.caminho === '/storage/v1/object/documentos-empresas')).toBe(true);
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('empresário responde solicitação; contador aceita ou pede correção', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const registro = await sessaoSimulada(ctx, rotas('empresa', (c) => (c === 'rpc/responder_solicitacao_documento' ? { status: 204 } : undefined)));
  const page = await abrir(ctx, '/app/documentos#solicitacoes', 'Meus documentos');
  await expect(page.getByTestId('aguardando')).toHaveText('1 aguarda o seu envio');
  const card = page.getByTestId('solicitacao-Extrato bancário de setembro/2026');
  await card.getByRole('button', { name: 'Enviar documento' }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('radio', { name: 'Da biblioteca' }).click();
  await d.getByLabel('Documento da biblioteca').selectOption('d1');
  await d.getByRole('button', { name: 'Enviar ao contador' }).click();
  await expect(page.getByText('Documento enviado ao contador.')).toBeVisible({ timeout: 15000 });
  expect(corpoRpc(registro, 'responder_solicitacao_documento')).toEqual({ p_id: 's1', p_id_documento: 'd1' });
  // Empresário não analisa
  await expect(page.getByRole('button', { name: 'Aceitar' })).toHaveCount(0);
  await ctx.close();

  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const regC = await sessaoSimulada(ctxC, rotas('contador', (c) => (['rpc/analisar_solicitacao_documento', 'rpc/criar_solicitacao_documento'].includes(c) ? { status: 200, corpo: 'novo' } : undefined)));
  const pc = await abrir(ctxC, '/contador/documentos', 'Documentos');
  await expect(pc.getByTestId('aguardando')).toHaveText('1 aguarda a sua análise');
  const enviado = pc.getByTestId('solicitacao-Folha de agosto');
  await enviado.getByRole('button', { name: 'Pedir correção' }).click();
  await pc.getByRole('dialog').getByRole('button', { name: 'Pedir correção' }).click();
  await expect(pc.getByRole('dialog').getByRole('alert')).toHaveText('Explique o que precisa ser corrigido.');
  await pc.getByRole('dialog').getByLabel('O que precisa ser corrigido?').fill('Falta a página 2');
  await pc.getByRole('dialog').getByRole('button', { name: 'Pedir correção' }).click();
  await expect(pc.getByText('Correção solicitada à empresa.')).toBeVisible({ timeout: 15000 });
  expect(corpoRpc(regC, 'analisar_solicitacao_documento')).toEqual({ p_id: 's2', p_aceitar: false, p_motivo: 'Falta a página 2' });
  await pc.getByRole('button', { name: 'Nova solicitação' }).click();
  await pc.getByRole('dialog').getByLabel('Título').fill('Notas fiscais de outubro');
  await pc.getByRole('dialog').getByRole('button', { name: 'Solicitar' }).click();
  await expect(pc.getByText('Solicitação enviada à empresa.')).toBeVisible({ timeout: 15000 });
  expect(corpoRpc(regC, 'criar_solicitacao_documento')).toMatchObject({ p_id_empresa: EMPRESA.id, p_titulo: 'Notas fiscais de outubro' });
  // Contador vê só documentos compartilhados e não edita/exclui
  await pc.getByRole('button', { name: 'Documentos compartilhados' }).click();
  await expect(pc.getByTestId('documento-Contrato social')).toBeVisible({ timeout: 15000 });
  await expect(pc.getByRole('button', { name: /^Editar / })).toHaveCount(0);
  await expect(pc.getByRole('button', { name: /^Excluir / })).toHaveCount(0);
  await expect(pc.getByRole('button', { name: 'Enviar documento' })).toHaveCount(0); // sem "enviar_documentos"
  await ctxC.close();
});

test('obrigações: indicadores, criação com responsável, cancelamento com motivo, tarefa só para a empresa', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas('empresa', (c) => (['rpc/salvar_obrigacao', 'rpc/alterar_situacao_obrigacao', 'rpc/criar_tarefa_da_obrigacao'].includes(c) ? { status: 200, corpo: 'ok' } : undefined)));
  const page = await abrir(ctx, '/app/obrigacoes', 'Obrigações');
  await expect(page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Obrigações' })).toHaveAttribute('href', '/app/obrigacoes');
  await expect(page.getByRole('region', { name: 'Atrasadas', exact: true })).toContainText('1', { timeout: 15000 }); // espera o resumo carregar
  const atrasada = page.getByRole('row').filter({ hasText: 'Entrega da DCTFWeb' });
  await expect(atrasada).toContainText('Atrasada');
  await expect(atrasada).toContainText('Venceu há 2 dias');
  await expect(atrasada).toContainText('Carlos Contador');
  await expect(page.getByRole('row').filter({ hasText: 'Renovar alvará' })).toContainText('Com documento · Com tarefa');

  await page.getByRole('button', { name: 'Nova obrigação' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Título').fill('Entrega do eSocial');
  await d.getByLabel('Categoria').selectOption('trabalhista');
  await d.getByLabel('Vencimento').fill(dia(10));
  await d.getByLabel('Responsável').selectOption(CONTADOR);
  await d.getByLabel(/^Documento relacionado/).selectOption('d1');
  await d.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Obrigação cadastrada.')).toBeVisible({ timeout: 15000 });
  expect(corpoRpc(registro, 'salvar_obrigacao')).toMatchObject({ p_id: null, p_id_empresa: EMPRESA.id, p_titulo: 'Entrega do eSocial', p_categoria: 'trabalhista', p_id_responsavel: CONTADOR, p_data_vencimento: dia(10), p_id_documento: 'd1' });

  await page.getByRole('button', { name: 'Cancelar Entrega da DCTFWeb' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar obrigação' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Informe o motivo do cancelamento.');
  await page.getByRole('dialog').getByLabel('Motivo').fill('Dispensada pela Receita');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar obrigação' }).click();
  await expect(page.getByText('Obrigação cancelada.')).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: 'Criar tarefa de Entrega da DCTFWeb' }).click();
  await expect(page.getByText('Tarefa criada em Tarefas.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Criar tarefa de Renovar alvará' })).toHaveCount(0); // já tem tarefa
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();

  // Contador (gerenciar_obrigacoes): mesma tela, sem criar tarefa da empresa
  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ctxC, rotas('contador'));
  const pc = await abrir(ctxC, '/contador/obrigacoes', 'Obrigações');
  await expect(pc.getByRole('row').filter({ hasText: 'Entrega da DCTFWeb' })).toBeVisible({ timeout: 15000 });
  await expect(pc.getByRole('button', { name: /^Criar tarefa/ })).toHaveCount(0);
  await ctxC.close();
});

test('layout sem rolagem lateral de 320 a 1920px (documentos, obrigações e contador)', async ({ browser }) => {
  for (const [papel, caminho, titulo] of [['empresa', '/app/documentos', 'Meus documentos'], ['empresa', '/app/obrigacoes', 'Obrigações'], ['contador', '/contador/documentos', 'Documentos']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await sessaoSimulada(ctx, rotas(papel));
    const page = await abrir(ctx, caminho, titulo);
    await page.waitForTimeout(500);
    for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${caminho} @${largura}`).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  }
});
