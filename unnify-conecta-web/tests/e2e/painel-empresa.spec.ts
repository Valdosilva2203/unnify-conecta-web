import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Painel /app (E1) com dados REAIS do banco. ESCREVE no banco (contas temporárias, removidas no afterAll):
// só executar com autorização e com as migrations 000029 (E0) e 000030 aplicadas.

function carregarEnv(): Record<string, string> {
  const texto = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
  return Object.fromEntries(texto.split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
}

const env = carregarEnv();
const BASE = 'http://localhost:3000';
const admin = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonimo = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const marca = `pe${Date.now()}`;
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const inicioMes = `${hoje.slice(0, 7)}-01`;
const somar = (d: number) => { const x = new Date(`${hoje}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const usuarios: string[] = [];
const empresas: string[] = [];

function cnpjAleatorio(): string {
  const n = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).concat([0, 0, 0, 1]);
  const dv = (b: number[], p: number[]) => { const r = b.reduce((s, d, i) => s + d * p[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = dv(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...n, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const s = [...n, d1, d2].join('');
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}

async function criarUsuario(rotulo: string, comEmpresa: boolean) {
  const email = `delivered+${marca}${rotulo}@resend.dev`;
  const senha = `Pe@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome_completo: `Teste ${rotulo}` } });
  if (error) throw error;
  usuarios.push(data.user.id);
  await admin().from('perfis').update({ nome_completo: `Pessoa ${rotulo.toUpperCase()} Teste` }).eq('id_usuario', data.user.id);
  const cliente = anonimo();
  await cliente.auth.signInWithPassword({ email, password: senha });
  let idEmpresa = '';
  if (comEmpresa) {
    const { data: r } = await cliente.rpc('criar_empresa', {
      p_cnpj: cnpjAleatorio(), p_razao_social: `PAINEL ${rotulo} ${marca} LTDA`, p_telefone: '63999990000', p_email_comercial: 'teste@resend.dev',
      p_cidade: 'Palmas', p_estado: 'TO', p_tipo_empresa: 'comum', p_nome_comercial: `Painel ${rotulo}`,
    });
    idEmpresa = r?.[0]?.id;
    empresas.push(idEmpresa);
    await cliente.rpc('inicializar_categorias_financeiras', { p_id_empresa: idEmpresa });
  }
  return { id: data.user.id, email, senha, cliente, idEmpresa };
}

async function lancar(cli: SupabaseClient, idEmpresa: string, tipo: 'receita' | 'despesa', descricao: string, valor: string, venc: string, pagoEm: string | null, conta: string) {
  const { data: cat } = await cli.from('categorias_financeiras').select('id').eq('id_empresa', idEmpresa).eq('tipo', tipo).limit(1).single();
  const { data: id, error } = await cli.rpc('salvar_lancamento_financeiro', {
    p_id: null, p_id_empresa: idEmpresa, p_tipo: tipo, p_descricao: descricao, p_valor: valor, p_id_categoria: cat!.id, p_data_competencia: venc,
    p_data_vencimento: venc, p_data_pagamento: null, p_contraparte: null, p_observacoes: null, p_id_conta_financeira: null,
  });
  if (error) throw error;
  if (pagoEm) {
    const r = await cli.rpc('registrar_baixa_lancamento', { p_id: id, p_data_pagamento: pagoEm, p_id_conta: conta, p_valor: valor });
    if (r.error) throw r.error;
  }
}

async function entrar(page: Page, u: { email: string; senha: string }) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('E-mail').fill(u.email);
  await page.getByLabel('Senha', { exact: true }).fill(u.senha);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await page.waitForURL((x) => x.pathname === '/app', { timeout: 60000 });
}

const texto = async (page: Page, regiao: string) => ((await page.getByRole('region', { name: regiao, exact: true }).textContent()) ?? '').replace(/ /g, ' ');

test.describe.configure({ mode: 'serial' });
test.setTimeout(5 * 60 * 1000);

let A: Awaited<ReturnType<typeof criarUsuario>>;
let B: Awaited<ReturnType<typeof criarUsuario>>;

test.beforeAll(async () => {
  A = await criarUsuario('a', true);
  B = await criarUsuario('b', true);
  const { data: conta } = await A.cliente.rpc('salvar_conta_financeira', {
    p_id: null, p_id_empresa: A.idEmpresa, p_nome: 'Banco Painel', p_instituicao: 'Banco', p_tipo: 'conta_corrente', p_saldo_inicial: '10000.00',
    p_data_saldo_inicial: `${somar(-70).slice(0, 7)}-01`, p_permite_saldo_negativo: false,
  });
  const c = conta as string;
  await lancar(A.cliente, A.idEmpresa, 'receita', 'Venda paga', '3000.00', hoje, hoje, c);
  await lancar(A.cliente, A.idEmpresa, 'despesa', 'Aluguel pago', '1000.00', hoje, hoje, c);
  await lancar(A.cliente, A.idEmpresa, 'receita', 'Cliente a receber', '700.00', somar(5), null, c);
  await lancar(A.cliente, A.idEmpresa, 'despesa', 'Internet a pagar', '200.00', somar(3), null, c);
  await lancar(B.cliente, B.idEmpresa, 'receita', 'Receita da B', '99999.00', hoje, null, c).catch(() => undefined);
});

test.afterAll(async () => {
  const sb = admin();
  if (empresas.length) {
    await sb.from('auditoria').delete().in('id_registro', empresas);
    for (const t of ['historico_lancamentos_financeiros', 'movimentacoes_financeiras', 'historico_contas_financeiras', 'lancamentos_financeiros', 'contas_financeiras', 'categorias_financeiras', 'vinculos_contabeis']) {
      await sb.from(t).delete().in('id_empresa', empresas);
    }
    await sb.from('usuarios_empresas').delete().in('id_empresa', empresas);
    await sb.from('empresas').delete().in('id', empresas);
  }
  for (const id of usuarios) await sb.auth.admin.deleteUser(id);
});

test('painel mostra os valores do banco (resumo_financeiro) e só da empresa do usuário', async ({ page }) => {
  const { data: r } = await A.cliente.rpc('resumo_financeiro', { p_id_empresa: A.idEmpresa, p_mes: inicioMes });
  expect(r.a_receber_30_valor, 'migration 000030 aplicada').toBeDefined();
  await entrar(page, A);
  await expect(page.getByRole('heading', { name: 'Olá, Pessoa!' })).toBeVisible({ timeout: 30000 });
  await expect.poll(() => texto(page, 'Receitas do mês')).toContain('R$ 3.000,00');
  expect(await texto(page, 'Despesas do mês')).toContain('R$ 1.000,00');
  expect(await texto(page, 'A receber')).toContain('R$ 700,00');
  expect(await texto(page, 'A receber')).toContain('1 conta nos próximos 30 dias');
  expect(await texto(page, 'A pagar')).toContain('R$ 200,00');
  await expect(page.getByTestId('conta-Internet a pagar')).toBeVisible();
  await expect(page.getByTestId('conta-Cliente a receber')).toBeVisible();
  await expect(page.getByText('Receita da B')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Situação financeira', exact: true })).toContainText('75%');
});

test('edição cadastral pela função segura; outra empresa não edita; dados refletem no painel', async ({ page }) => {
  expect((await B.cliente.rpc('atualizar_dados_empresa', {
    p_id_empresa: A.idEmpresa, p_nome_comercial: 'Invasão', p_telefone: null, p_email_comercial: 'x@resend.dev', p_cidade: 'Palmas', p_estado: 'TO', p_cnae_principal: null,
  })).error).not.toBeNull();
  await entrar(page, A);
  await page.getByRole('button', { name: 'Editar dados da empresa' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Nome comercial').fill(`Painel Editado ${marca}`);
  await d.getByLabel('Telefone').fill('63988887777');
  await d.getByLabel(/^Cidade/).fill('Araguaína');
  await d.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Dados da empresa atualizados.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('Dados cadastrais')).toContainText('(63) 98888-7777');
  await expect(page.getByLabel('Dados cadastrais')).toContainText('Araguaína - TO');
  const { data: e } = await admin().from('empresas').select('nome_comercial, telefone, cidade, razao_social').eq('id', A.idEmpresa).single();
  expect(e).toEqual({ nome_comercial: `Painel Editado ${marca}`, telefone: '63988887777', cidade: 'Araguaína', razao_social: `PAINEL a ${marca} LTDA` });
});

test('layout com dados reais sem rolagem lateral de 320 a 1920px', async ({ page }) => {
  await entrar(page, A);
  await expect(page.getByText('Dados da empresa', { exact: true })).toBeVisible({ timeout: 30000 });
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `@${largura}`).toBeLessThanOrEqual(1);
  }
});
