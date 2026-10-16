import { test, expect } from '@playwright/test';
import { sessaoSimulada, USUARIO_SIMULADO, type Rotas } from './apoio/sessao-simulada';

// Admin Master: só dados REAIS (do banco). API do Supabase SIMULADA — os números abaixo vêm do mock, nunca de dados fictícios fixos no código.
const BASE = 'http://localhost:3000';
const agora = new Date().toISOString();
const EU = { id_usuario: USUARIO_SIMULADO.id, nome_completo: 'Vado Silva', email: 'vado@exemplo.test', funcao_global: 'admin_master', tipo_usuario: 'empresa', status: 'active', criado_em: agora };
const PERFIS = [EU,
  { id_usuario: '22222222-2222-4222-8222-222222222222', nome_completo: 'Carla Contadora', email: 'carla@exemplo.test', funcao_global: 'user', tipo_usuario: 'contador', status: 'active', criado_em: agora },
  { id_usuario: '33333333-3333-4333-8333-333333333333', nome_completo: 'Paulo Dono', email: 'paulo@exemplo.test', funcao_global: 'user', tipo_usuario: 'empresa', status: 'active', criado_em: agora }];
const EMPRESAS = [
  { id: 'e1', razao_social: 'ALFA LTDA', nome_comercial: 'Alfa', tipo_empresa: 'comum', status_registro: 'ATIVA', criado_em: agora },
  { id: 'e2', razao_social: 'BETA LTDA', nome_comercial: null, tipo_empresa: 'comum', status_registro: 'PENDENTE', criado_em: agora },
  { id: 'e3', razao_social: 'Contábil Gama', nome_comercial: 'Gama Contabilidade', tipo_empresa: 'escritorio_contabil', status_registro: 'ATIVA', criado_em: agora },
];
const AUDITORIA = [{ id: 'a1', id_usuario: '22222222-2222-4222-8222-222222222222', acao: 'UPDATE', nome_tabela: 'empresas', id_registro: 'e1', criado_em: agora }];

const rotas: Rotas = (c, u) => {
  if (c === 'perfis') return { corpo: u.searchParams.get('id_usuario')?.startsWith('eq.') ? [EU] : PERFIS };
  if (c === 'empresas') return { corpo: EMPRESAS };
  if (c === 'auditoria') return { corpo: AUDITORIA };
  if (c === 'usuarios_empresas') return { corpo: [{ id_usuario: '33333333-3333-4333-8333-333333333333', empresas: { nome_comercial: 'Alfa', razao_social: 'ALFA LTDA' } }] };
  if (c === 'notificacoes') return { corpo: [] };
  return undefined;
};
const FICTICIOS = ['Comercial Silva LTDA', 'Farmácia Vida Nova', 'Oliveira Assessoria Contábil', 'MRR', 'Planos mais utilizados', '1.247', 'Ana Clara Souza', '179.189.25.14'];

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('dashboard do Admin Master: indicadores, gráficos, listas e atenção com os dados do banco; nada fictício', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  await sessaoSimulada(ctx, rotas);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin`);
  await expect(page.getByRole('heading', { level: 1, name: 'Visão geral da plataforma' })).toBeVisible({ timeout: 90000 });
  const corpo = page.locator('main');
  await expect(corpo).toContainText('Empresas', { timeout: 30000 });
  // 2 empresas (Alfa e Beta), 1 escritório (Gama), 1 contador, 3 usuários
  await expect(corpo.getByText('Gama Contabilidade')).toBeVisible();
  await expect(corpo.getByText('BETA LTDA')).toBeVisible();
  await expect(corpo.getByText('Registro alterado')).toBeVisible();
  await expect(corpo.getByText('Cadastros pendentes')).toBeVisible(); // Beta está PENDENTE
  for (const t of FICTICIOS) await expect(corpo.getByText(t, { exact: false })).toHaveCount(0);
  const valores = await corpo.locator('p.text-3xl').allTextContents();
  expect(valores).toEqual(['2', '1', '1', '3']);
  await ctx.close();
});

test('Usuários e Auditoria vêm do banco; Assinaturas, Comissões e Parceiros sem dados inventados', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  await sessaoSimulada(ctx, rotas);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/usuarios`);
  await expect(page.getByText('Carla Contadora')).toBeVisible({ timeout: 90000 });
  await expect(page.getByText('Paulo Dono')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Paulo Dono' })).toContainText('Alfa');
  for (const t of FICTICIOS) await expect(page.locator('main').getByText(t, { exact: false })).toHaveCount(0);

  await page.goto(`${BASE}/admin/auditoria`);
  await expect(page.getByRole('row').filter({ hasText: 'Carla Contadora' })).toContainText('Alteração de registro', { timeout: 90000 });
  await expect(page.locator('main').getByText('179.189.25.14')).toHaveCount(0);

  for (const [rota, msg] of [['/admin/assinaturas', 'Ainda não há assinaturas cadastradas no sistema.'], ['/admin/comissoes', 'Ainda não há comissões cadastradas no sistema.'], ['/admin/parceiros', 'Ainda não há parceiros cadastrados no sistema.']] as const) {
    await page.goto(`${BASE}${rota}`);
    await expect(page.getByText(msg)).toBeVisible({ timeout: 90000 });
  }
  await ctx.close();
});
