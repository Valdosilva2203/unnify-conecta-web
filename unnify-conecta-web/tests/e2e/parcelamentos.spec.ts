import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Parcelamentos (interface): contratos fixos e personalizados com entrada, parcelas em Contas a pagar,
// pagamento pela janela única com prévia de saldo, estorno, empréstimo fora das despesas operacionais,
// cancelamento e layout 320–1920px.

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
const marca = `pu${Date.now()}`;
const LARGURAS = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
let idUsuario = '';
let idEmpresa = '';
let email = '';
let senha = '';

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

async function entrar(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await page.waitForURL((u) => u.pathname === '/app', { timeout: 60000 });
  await page.waitForLoadState('networkidle');
}

const texto = async (page: Page, testId: string) => ((await page.getByTestId(testId).first().textContent()) ?? '').replace(/ /g, ' ');
const aba = (page: Page, nome: string) => page.getByRole('navigation', { name: 'Seções do financeiro' }).getByRole('button', { name: nome }).click();

test.describe.configure({ mode: 'serial' });
test.setTimeout(6 * 60 * 1000);

test.beforeAll(async () => {
  email = `delivered+${marca}@resend.dev`;
  senha = `Pu@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome_completo: 'Teste Parcelamentos' } });
  if (error) throw error;
  idUsuario = data.user.id;
  await admin().from('perfis').update({ tipo_usuario: 'empresa' }).eq('id_usuario', idUsuario);
  const cli = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email, password: senha });
  const { data: r } = await cli.rpc('criar_empresa', {
    p_cnpj: cnpjAleatorio(), p_razao_social: `EMPRESA ${marca} LTDA`, p_telefone: '63999990000', p_email_comercial: 'teste@resend.dev',
    p_cidade: 'Palmas', p_estado: 'TO', p_tipo_empresa: 'comum', p_nome_comercial: `Parc ${marca}`,
  });
  idEmpresa = r?.[0]?.id;
  await cli.rpc('inicializar_categorias_financeiras', { p_id_empresa: idEmpresa });
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  await cli.rpc('salvar_conta_financeira', { p_id: null, p_id_empresa: idEmpresa, p_nome: 'Banco Teste', p_instituicao: 'Banco', p_tipo: 'conta_corrente', p_saldo_inicial: '50000.00', p_data_saldo_inicial: `${hoje.slice(0, 7)}-01`, p_permite_saldo_negativo: false });
});

test.afterAll(async () => {
  const sb = admin();
  if (idEmpresa) {
    for (const t of ['historico_lancamentos_financeiros', 'anexos_financeiros', 'movimentacoes_financeiras', 'historico_contas_financeiras', 'transferencias_financeiras',
      'historico_contratos', 'anexos_contratos', 'lancamentos_financeiros', 'contratos_parcelados', 'contas_financeiras', 'categorias_financeiras']) {
      await sb.from(t).delete().eq('id_empresa', idEmpresa);
    }
  }
  if (idUsuario) await sb.auth.admin.deleteUser(idUsuario);
});

test('contratos pela interface: fixo, personalizado com entrada, pagamento, estorno, empréstimo e cancelamento', async ({ page }) => {
  const erros: string[] = [];
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 160)));
  page.on('pageerror', (e) => erros.push(e.message.slice(0, 160)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page);
  await page.goto(`${BASE}/app/financeiro#parcelamentos`);
  await expect(page.getByText('Nenhum contrato parcelado ainda.')).toBeVisible({ timeout: 30000 });

  // 1. Parcelas fixas: 12.000 em 12
  await page.getByRole('button', { name: 'Novo contrato' }).click();
  await page.getByRole('button', { name: 'Gerar parcelas' }).click();
  await expect(page.getByRole('dialog').getByText('Informe o nome do contrato.')).toBeVisible();
  await page.getByLabel('Nome do contrato').fill('Compra da máquina');
  await page.getByLabel(/^Fornecedor/).fill('Fornecedor ABC');
  await page.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Fornecedores' });
  await page.getByLabel('Valor principal (R$)').fill('1200000');
  await page.getByLabel('Valor total previsto (R$)').fill('1200000');
  await page.getByLabel('Quantidade de parcelas').fill('12');
  await page.getByRole('button', { name: 'Gerar parcelas' }).click();
  await expect(page.getByTestId('soma-parcelas')).toContainText('12.000,00', { timeout: 15000 });
  await expect(page.getByRole('dialog').locator('tbody tr')).toHaveCount(12);
  await page.getByRole('button', { name: 'Criar contrato' }).click();
  await expect(page.getByText('Contrato criado com 12 parcelas.')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('region', { name: 'Detalhes de Compra da máquina' })).toBeVisible();
  expect(await texto(page, 'saldo-devedor')).toContain('R$ 12.000,00');

  // 2. Parcelas aparecem em Contas a pagar (uma vez cada)
  await aba(page, 'Contas a pagar');
  await page.getByLabel('Buscar por descrição, cliente ou fornecedor').fill('Compra da máquina');
  await expect(page.getByRole('row').filter({ hasText: 'Compra da máquina — parcela 1/12' })).toHaveCount(1, { timeout: 15000 });

  // 3. Pagar parcela 1 pela janela única com prévia de saldo
  await aba(page, 'Parcelamentos');
  await page.getByTestId('contrato-Compra da máquina').click();
  await page.getByRole('button', { name: 'Pagar parcela 1' }).click();
  await expect(page.getByTestId('previa-saldo')).toContainText('Antes: R$ 50.000,00');
  await expect(page.getByTestId('previa-saldo')).toContainText('Depois: R$ 49.000,00');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Pagamento registrado.')).toBeVisible({ timeout: 15000 });
  await expect.poll(() => texto(page, 'saldo-devedor')).toContain('R$ 11.000,00');
  await expect(page.getByRole('region', { name: 'Parcelas pagas' })).toContainText('1');

  // 4. Estorno pela aba Parcelas
  await page.getByRole('region', { name: 'Detalhes de Compra da máquina' }).getByRole('button', { name: 'Parcelas', exact: true }).click();
  await page.getByRole('button', { name: 'Estornar parcela 1' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Estornar' }).click();
  await expect(page.getByText('Pagamento estornado.', { exact: false })).toBeVisible({ timeout: 15000 });
  await page.getByRole('region', { name: 'Detalhes de Compra da máquina' }).getByRole('button', { name: 'Resumo' }).click();
  await expect.poll(() => texto(page, 'saldo-devedor')).toContain('R$ 12.000,00');

  // 5. Personalizadas com entrada: soma conferida ao vivo
  await page.getByRole('button', { name: 'Novo contrato' }).click();
  await page.getByLabel('Nome do contrato').fill('Boleto com entrada');
  await page.getByRole('radio', { name: 'Boleto parcelado' }).click();
  await page.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Fornecedores' });
  await page.getByLabel('Valor principal (R$)').fill('1200000');
  await page.getByLabel('Valor total previsto (R$)').fill('1200000');
  await page.getByLabel('Quantidade de parcelas').fill('10');
  await page.getByText('Tem entrada').click();
  await page.getByLabel('Valor da entrada (R$)').fill('200000');
  await page.getByRole('radio', { name: 'Parcelas personalizadas' }).click();
  await page.getByRole('button', { name: 'Gerar parcelas' }).click();
  await expect(page.getByLabel('Valor da parcela 1', { exact: true })).toHaveValue('1.000,00', { timeout: 15000 });
  await page.getByLabel('Valor da parcela 1', { exact: true }).fill('150000');
  await expect(page.getByTestId('soma-parcelas')).toContainText('Sobram R$ 500,00');
  await expect(page.getByRole('button', { name: 'Criar contrato' })).toBeDisabled();
  await page.getByLabel('Valor da parcela 2', { exact: true }).fill('50000');
  await expect(page.getByTestId('soma-parcelas')).toContainText('12.000,00');
  await page.getByRole('button', { name: 'Criar contrato' }).click();
  await expect(page.getByText('Contrato criado com 10 parcelas.')).toBeVisible({ timeout: 20000 });
  const { data: entrada } = await admin().from('lancamentos_financeiros').select('valor, status').eq('id_empresa', idEmpresa).eq('numero_parcela', 0).single();
  expect(entrada).toEqual({ valor: 2000, status: 'pendente' });
  const { data: p12 } = await admin().from('lancamentos_financeiros').select('numero_parcela, valor').eq('id_empresa', idEmpresa).like('descricao', 'Boleto com entrada%').in('numero_parcela', [1, 2]).order('numero_parcela');
  expect(p12).toEqual([{ numero_parcela: 1, valor: 1500 }, { numero_parcela: 2, valor: 500 }]);

  // 6. Empréstimo: juros por parcela; pagamento não vira despesa operacional
  await page.getByRole('button', { name: 'Novo contrato' }).click();
  await page.getByLabel('Nome do contrato').fill('Capital de giro');
  await page.getByRole('radio', { name: 'Empréstimo' }).click();
  await page.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Outras despesas' });
  await page.getByLabel('Valor principal (R$)').fill('200000');
  await page.getByLabel('Valor total previsto (R$)').fill('220000');
  await page.getByLabel('Quantidade de parcelas').fill('2');
  await page.getByRole('button', { name: 'Gerar parcelas' }).click();
  await page.getByLabel('Juros da parcela 1', { exact: true }).fill('10000');
  await page.getByRole('button', { name: 'Criar contrato' }).click();
  await expect(page.getByText('Contrato criado com 2 parcelas.')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Pagar parcela 1' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Pagamento registrado.')).toBeVisible({ timeout: 15000 });
  await aba(page, 'Visão geral');
  await expect(page.getByTestId('pagamentos-financiamentos')).toContainText('R$ 1.100,00 em empréstimos/financiamentos (juros R$ 100,00)', { timeout: 15000 });
  expect(((await page.getByRole('region', { name: 'Despesas do mês' }).textContent()) ?? '').replace(/ /g, ' ')).toContain('R$ 0,00');

  // 7. Cancelar contrato (motivo obrigatório)
  await aba(page, 'Parcelamentos');
  await page.getByTestId('contrato-Boleto com entrada').click();
  await page.getByRole('region', { name: 'Detalhes de Boleto com entrada' }).getByRole('button', { name: 'Informações' }).click();
  await page.getByRole('button', { name: 'Cancelar contrato' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar contrato' }).click();
  await expect(page.getByRole('dialog').getByText('Informe o motivo do cancelamento.')).toBeVisible({ timeout: 15000 });
  await page.getByLabel('Motivo').fill('Renegociado com o fornecedor');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar contrato' }).click();
  await expect(page.getByText('Contrato cancelado.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('contrato-Boleto com entrada')).toContainText('Cancelado');

  // Esperados: 400 nas tentativas propositais recusadas pelo banco (motivo vazio)
  expect(erros.filter((e) => !/status of 400/.test(e))).toEqual([]);
});

test('layout de Parcelamentos sem rolagem lateral de 320 a 1920px', async ({ page }) => {
  await entrar(page);
  await page.goto(`${BASE}/app/financeiro#parcelamentos`);
  await expect(page.getByText('Lista de contratos')).toBeVisible({ timeout: 30000 });
  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(150);
    const excesso = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(excesso, `parcelamentos @${largura}px`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 375, height: 800 });
  await page.getByRole('button', { name: 'Novo contrato' }).click();
  await page.getByLabel('Nome do contrato').fill('Celular');
  await page.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Fornecedores' });
  await page.getByLabel('Valor principal (R$)').fill('100000');
  await page.getByLabel('Valor total previsto (R$)').fill('100000');
  await page.getByRole('radio', { name: 'Parcelas personalizadas' }).click();
  await page.getByRole('button', { name: 'Gerar parcelas' }).click();
  await expect(page.getByLabel('Valor da parcela 1', { exact: true })).toBeVisible({ timeout: 15000 });
  const excesso = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(excesso, 'formulário no celular').toBeLessThanOrEqual(1);
});
