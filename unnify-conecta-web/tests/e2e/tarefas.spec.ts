import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Tarefas (interface): Admin Master em /admin/tarefas, empresa em /app/tarefas e escritório em /contador/tarefas
// usando o MESMO componente; usuário comum barrado na área admin; layout 320–1920px.

function carregarEnv(): Record<string, string> {
  const texto = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
  return Object.fromEntries(
    texto
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
  );
}

const env = carregarEnv();
const BASE = 'http://localhost:3000';
const admin = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const marca = `tu${Date.now()}`;
const usuarios: string[] = [];
const empresas: string[] = [];
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const LARGURAS = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920];

function cnpjAleatorio(): string {
  const n = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).concat([0, 0, 0, 1]);
  const dv = (b: number[], p: number[]) => {
    const r = b.reduce((s, d, i) => s + d * p[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...n, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const s = [...n, d1, d2].join('');
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}

async function criarUsuario(rotulo: string, papel: 'empresa' | 'escritorio' | 'admin_master' | 'admin') {
  const email = `delivered+${marca}${rotulo}@resend.dev`;
  const senha = `Tu@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome_completo: `Pessoa ${rotulo}` } });
  if (error) throw error;
  usuarios.push(data.user.id);
  const dados: Record<string, string> = papel === 'empresa' ? { tipo_usuario: 'empresa' } : papel === 'escritorio' ? { tipo_usuario: 'contador' } : { funcao_global: papel };
  await admin().from('perfis').update(dados).eq('id_usuario', data.user.id);
  if (papel === 'empresa' || papel === 'escritorio') {
    const cli = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    await cli.auth.signInWithPassword({ email, password: senha });
    const { data: r } = await cli.rpc('criar_empresa', {
      p_cnpj: cnpjAleatorio(), p_razao_social: `EMPRESA ${rotulo} ${marca} LTDA`, p_telefone: '63999990000', p_email_comercial: 'teste@resend.dev',
      p_cidade: 'Palmas', p_estado: 'TO', p_tipo_empresa: papel === 'escritorio' ? 'escritorio_contabil' : 'comum', p_nome_comercial: `${rotulo} ${marca}`,
    });
    empresas.push(r?.[0]?.id);
  }
  return { id: data.user.id, email, senha };
}

async function entrar(browser: Browser, email: string, senha: string, destino: string) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erros: string[] = [];
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 160)));
  page.on('pageerror', (e) => erros.push(e.message.slice(0, 160)));
  await page.goto(`${BASE}/login`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await page.waitForURL((u) => u.pathname === destino, { timeout: 60000 });
  await page.waitForLoadState('networkidle');
  return { page, erros };
}

async function semRolagem(page: Page) {
  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(150);
    const excesso = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(excesso, `${page.url()} @${largura}px`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

const tarefa = (page: Page, titulo: string) => page.getByTestId(`tarefa-${titulo}`);

test.describe.configure({ mode: 'serial' });
test.setTimeout(6 * 60 * 1000);

let M: Awaited<ReturnType<typeof criarUsuario>>;
let N: Awaited<ReturnType<typeof criarUsuario>>;
let A: Awaited<ReturnType<typeof criarUsuario>>;
let K: Awaited<ReturnType<typeof criarUsuario>>;

test.beforeAll(async () => {
  M = await criarUsuario('master', 'admin_master');
  N = await criarUsuario('admin', 'admin');
  A = await criarUsuario('empresa', 'empresa');
  K = await criarUsuario('escritorio', 'escritorio');
});

test.afterAll(async () => {
  const sb = admin();
  for (const raiz of [...empresas, 'plataforma']) {
    const { data: subs } = await sb.storage.from('anexos-tarefas').list(raiz, { limit: 1000 });
    for (const s of subs ?? []) {
      const { data: arquivos } = await sb.storage.from('anexos-tarefas').list(`${raiz}/${s.name}`);
      if (arquivos?.length) await sb.storage.from('anexos-tarefas').remove(arquivos.map((f) => `${raiz}/${s.name}/${f.name}`));
    }
  }
  await sb.from('tarefas').delete().in('criado_por', usuarios);
  await sb.from('categorias_tarefas').delete().in('criado_por', usuarios);
  for (const id of usuarios.reverse()) await sb.auth.admin.deleteUser(id);
});

test('Admin Master: /admin/tarefas completo pelo menu, sem passar pelo onboarding', async ({ browser }) => {
  const { page, erros } = await entrar(browser, M.email, M.senha, '/admin');
  await page.getByRole('link', { name: 'Tarefas' }).filter({ visible: true }).first().click();
  await page.waitForURL('**/admin/tarefas', { timeout: 60000 });
  await expect(page.getByRole('heading', { name: 'Tarefas', level: 1 })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Nenhuma tarefa por aqui.')).toBeVisible({ timeout: 15000 });

  // Categoria com cor e ícone
  await page.getByRole('button', { name: 'Gerenciar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Nova categoria' }).click();
  await page.getByLabel('Nome').fill(`Operação ${marca}`);
  await page.getByRole('button', { name: 'Cor Roxo' }).click();
  await page.getByLabel('Buscar ícone').pressSequentially('tecno', { delay: 30 });
  await page.getByRole('button', { name: 'Ícone Tecnologia' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar categoria' }).click();
  await expect(page.getByText('Categoria criada.')).toBeVisible({ timeout: 15000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).last().click();

  // Nova tarefa atribuída a outro administrador
  await page.getByRole('button', { name: 'Nova tarefa' }).click();
  await page.getByLabel('Título', { exact: true }).fill('Revisar planos de assinatura');
  await page.getByLabel(/^Descrição/).fill('Conferir valores e benefícios.');
  await page.getByLabel('Categoria', { exact: true }).selectOption({ label: `Operação ${marca}` });
  await expect(page.getByLabel('Responsável', { exact: true }).locator('option', { hasText: 'Pessoa empresa' }), 'só administradores').toHaveCount(0);
  await page.getByLabel('Responsável', { exact: true }).selectOption({ label: 'Pessoa admin' });
  await page.getByRole('radio', { name: 'Alta' }).click();
  await page.getByRole('button', { name: 'Salvar tarefa' }).click();
  await expect(page.getByText('Tarefa criada.')).toBeVisible({ timeout: 15000 });
  const linha = tarefa(page, 'Revisar planos de assinatura');
  await expect(linha).toContainText('Pessoa admin');
  await expect(linha.locator('[data-icone="laptop"]')).toBeVisible();

  // Edição
  await page.getByRole('button', { name: 'Editar Revisar planos de assinatura' }).click();
  await page.getByLabel('Título', { exact: true }).fill('Revisar planos de assinatura 2027');
  await page.getByRole('button', { name: 'Salvar tarefa' }).click();
  await expect(page.getByText('Tarefa atualizada.')).toBeVisible({ timeout: 15000 });
  const titulo = 'Revisar planos de assinatura 2027';

  // Detalhes: checklist, comentário, anexo, iniciar
  await page.getByRole('button', { name: `Detalhes de ${titulo}` }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Novo item do checklist').fill('Levantar planos atuais');
  await dialogo.getByRole('button', { name: 'Adicionar' }).click();
  await expect(dialogo.getByText('Levantar planos atuais')).toBeVisible({ timeout: 15000 });
  await dialogo.getByRole('checkbox', { name: 'Levantar planos atuais' }).check();
  await expect(dialogo.getByText('(1/1)')).toBeVisible({ timeout: 15000 });
  await dialogo.getByLabel('Novo comentário').fill('Vou começar hoje.');
  await dialogo.getByRole('button', { name: 'Comentar' }).click();
  await expect(dialogo.getByText('Vou começar hoje.')).toBeVisible({ timeout: 15000 });
  await dialogo.locator('#anexo-tarefa').setInputFiles({ name: 'planos.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(dialogo.getByText('planos.pdf')).toBeVisible({ timeout: 15000 });
  await expect(dialogo.getByLabel('Histórico')).toContainText('Tarefa criada');
  await dialogo.getByRole('button', { name: 'Iniciar' }).click();
  await expect(page.getByText('Tarefa em andamento.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('region', { name: 'Em andamento' })).toContainText('1');

  // Concluir pela caixa da lista, reabrir, arquivar
  await page.getByRole('checkbox', { name: `Concluir ${titulo}` }).click();
  await expect(page.getByText('Tarefa concluída.')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Concluídas' }).click();
  await expect(tarefa(page, titulo)).toBeVisible({ timeout: 15000 });
  await page.getByRole('checkbox', { name: `Reabrir ${titulo}` }).click();
  await expect(page.getByText('Tarefa reaberta.')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Todas', exact: true }).click();
  await page.getByRole('button', { name: `Detalhes de ${titulo}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Arquivar' }).click();
  await expect(page.getByText('Tarefa arquivada.')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Arquivadas' }).click();
  await expect(tarefa(page, titulo)).toBeVisible({ timeout: 15000 });

  const { data } = await admin().from('tarefas').select('contexto, id_empresa, id_responsavel, status, arquivada_em').eq('titulo', titulo).single();
  expect(data).toMatchObject({ contexto: 'plataforma', id_empresa: null, id_responsavel: N.id, status: 'pendente' });
  expect(data?.arquivada_em).not.toBeNull();
  await semRolagem(page);
  expect(erros).toEqual([]);
  await page.close();
});

test('usuário comum não acessa /admin/tarefas; empresa e escritório usam o mesmo módulo, isolados', async ({ browser }) => {
  const e = await entrar(browser, A.email, A.senha, '/app');
  await e.page.goto(`${BASE}/admin/tarefas`);
  await e.page.waitForURL((u) => u.pathname === '/app', { timeout: 60000 });
  await expect(e.page.getByText('Revisar planos de assinatura 2027')).toHaveCount(0);

  // Empresa: menu → Tarefas, cria e vê só as próprias
  await e.page.locator('aside').first().getByRole('link', { name: 'Tarefas' }).click();
  await e.page.waitForURL('**/app/tarefas', { timeout: 60000 });
  await expect(e.page.getByText('Nenhuma tarefa por aqui.')).toBeVisible({ timeout: 30000 });
  // Categorias: sugestões de uma vez + criação rápida dentro do formulário da tarefa
  await e.page.getByRole('button', { name: 'Usar sugestões' }).click();
  await expect(e.page.getByText('Categorias sugeridas criadas.')).toBeVisible({ timeout: 20000 });
  const cards = e.page.getByRole('region', { name: 'Categorias' });
  for (const nome of ['Contabilidade', 'Financeiro', 'Administrativo', 'Fiscal', 'Reunião', 'Marketing']) await expect(cards.getByText(nome, { exact: true })).toBeVisible();
  await e.page.getByRole('button', { name: 'Nova tarefa' }).click();
  await e.page.getByRole('button', { name: 'Nova categoria' }).click();
  await e.page.getByLabel('Nome da nova categoria').fill('Bancos');
  await e.page.getByRole('button', { name: 'Cor Verde', exact: true }).click();
  await e.page.getByLabel('Buscar ícone').pressSequentially('dinheiro', { delay: 30 });
  await e.page.getByRole('button', { name: 'Ícone Dinheiro' }).click();
  await e.page.getByRole('button', { name: 'Criar e usar' }).click();
  await expect(e.page.getByTestId('categoria-tarefa-escolhida')).toContainText('Bancos', { timeout: 15000 });
  await expect(e.page.getByTestId('categoria-tarefa-escolhida').locator('[data-icone="banknote"]')).toBeVisible();
  await e.page.getByLabel('Título', { exact: true }).fill('Enviar notas ao contador');
  await expect(e.page.getByLabel('Responsável', { exact: true }).locator('option', { hasText: 'Pessoa master' }), 'admin não é membro da empresa').toHaveCount(0);
  await e.page.getByLabel('Responsável', { exact: true }).selectOption({ label: 'Pessoa empresa' });
  await e.page.getByRole('button', { name: 'Salvar tarefa' }).click();
  await expect(e.page.getByText('Tarefa criada.')).toBeVisible({ timeout: 15000 });
  await expect(e.page.getByRole('region', { name: 'Pendentes' })).toContainText('1');
  await expect(tarefa(e.page, 'Enviar notas ao contador').locator('[data-icone="banknote"]')).toBeVisible();
  await expect(cards.getByRole('button', { name: /Bancos/ })).toContainText('1');
  await semRolagem(e.page);
  expect(e.erros).toEqual([]);

  // Escritório
  const k = await entrar(browser, K.email, K.senha, '/contador');
  await k.page.getByRole('link', { name: 'Tarefas' }).filter({ visible: true }).first().click();
  await k.page.waitForURL('**/contador/tarefas', { timeout: 60000 });
  await expect(k.page.getByText('Nenhuma tarefa por aqui.')).toBeVisible({ timeout: 30000 });
  await expect(k.page.getByText('Enviar notas ao contador')).toHaveCount(0);
  await semRolagem(k.page);
  expect(k.erros).toEqual([]);

  // Admin Master não vê a tarefa da empresa na área administrativa
  const m = await entrar(browser, M.email, M.senha, '/admin');
  await m.page.goto(`${BASE}/admin/tarefas`);
  await m.page.getByRole('button', { name: 'Arquivadas' }).click();
  await expect(tarefa(m.page, 'Revisar planos de assinatura 2027')).toBeVisible({ timeout: 30000 });
  await m.page.getByRole('button', { name: 'Todas', exact: true }).click();
  await expect(m.page.getByText('Enviar notas ao contador')).toHaveCount(0);
  await Promise.all([e.page.close(), k.page.close(), m.page.close()]);
});
