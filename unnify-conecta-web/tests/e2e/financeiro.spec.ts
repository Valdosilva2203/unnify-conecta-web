import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Financeiro (interface): empresa vazia, receitas/despesas, edição, baixa (sem duplicidade), estorno,
// cancelamento, exclusão lógica, comprovante, filtros, categorias, exportação e layout 320–1920px.

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
const marca = `fi${Date.now()}`;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
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

async function aba(page: Page, nome: string) {
  await page.getByRole('navigation', { name: 'Seções do financeiro' }).getByRole('button', { name: nome }).click();
}

async function cartao(page: Page, titulo: string) {
  // Intl usa espaço não separável entre "R$" e o número
  return ((await page.getByRole('region', { name: titulo }).textContent()) ?? '').replace(/ /g, ' ');
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(6 * 60 * 1000);

test.beforeAll(async () => {
  email = `delivered+${marca}@resend.dev`;
  senha = `Fi@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome_completo: 'Teste Financeiro' } });
  if (error) throw error;
  idUsuario = data.user.id;
  await admin().from('perfis').update({ tipo_usuario: 'empresa' }).eq('id_usuario', idUsuario);
  const cli = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email, password: senha });
  const { data: r } = await cli.rpc('criar_empresa', {
    p_cnpj: cnpjAleatorio(), p_razao_social: `EMPRESA ${marca} LTDA`, p_telefone: '63999990000', p_email_comercial: 'teste@resend.dev',
    p_cidade: 'Palmas', p_estado: 'TO', p_tipo_empresa: 'comum', p_nome_comercial: `Fin ${marca}`,
  });
  idEmpresa = r?.[0]?.id;
});

test.afterAll(async () => {
  const sb = admin();
  if (idEmpresa) {
    const { data: pastas } = await sb.storage.from('comprovantes-financeiros').list(idEmpresa);
    for (const p of pastas ?? []) {
      const { data: arquivos } = await sb.storage.from('comprovantes-financeiros').list(`${idEmpresa}/${p.name}`);
      if (arquivos?.length) await sb.storage.from('comprovantes-financeiros').remove(arquivos.map((a) => `${idEmpresa}/${p.name}/${a.name}`));
    }
    await sb.from('historico_lancamentos_financeiros').delete().eq('id_empresa', idEmpresa);
    await sb.from('anexos_financeiros').delete().eq('id_empresa', idEmpresa);
    await sb.from('movimentacoes_financeiras').delete().eq('id_empresa', idEmpresa);
    await sb.from('historico_contas_financeiras').delete().eq('id_empresa', idEmpresa);
    await sb.from('transferencias_financeiras').delete().eq('id_empresa', idEmpresa);
    await sb.from('lancamentos_financeiros').delete().eq('id_empresa', idEmpresa);
    await sb.from('contas_financeiras').delete().eq('id_empresa', idEmpresa);
    await sb.from('categorias_financeiras').delete().eq('id_empresa', idEmpresa);
  }
  if (idUsuario) await sb.auth.admin.deleteUser(idUsuario);
});

test('fluxo completo do financeiro pela interface', async ({ page }) => {
  const erros: string[] = [];
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 160)));
  page.on('pageerror', (e) => erros.push(e.message.slice(0, 160)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page);

  // Menu sem "Em breve" e empresa sem movimentações (sem valores fictícios)
  await page.locator('aside').first().getByRole('link', { name: 'Financeiro' }).click();
  await page.waitForURL('**/app/financeiro', { timeout: 60000 });
  await expect(page.getByText('Comece registrando suas receitas e despesas')).toBeVisible({ timeout: 30000 });
  expect(await cartao(page, 'Receitas do mês')).toContain('R$ 0,00');
  expect(await cartao(page, 'Saldo financeiro')).toContain('Cadastre suas contas em Contas e bancos');
  await expect.poll(async () => (await admin().from('categorias_financeiras').select('id').eq('id_empresa', idEmpresa)).data?.length).toBe(11);

  // Contas e bancos: sem conta, recebimento pede cadastro; cadastra banco (principal) e caixa
  await aba(page, 'Contas e bancos');
  await expect(page.getByText('Nenhuma conta cadastrada')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Nova conta' }).click();
  await page.getByLabel('Nome da conta').fill('Banco Teste');
  await page.getByLabel(/^Instituição/).fill('Banco Exemplo');
  await page.getByLabel('Saldo inicial (R$)').fill('100000');
  await page.getByRole('button', { name: 'Cor Azul' }).click();
  await expect(page.getByRole('button', { name: 'Cor Azul' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Salvar conta' }).click();
  await expect(page.getByText('Conta cadastrada.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('saldo-Banco Teste')).toHaveText(/1\.000,00/);
  await expect(page.getByTestId('card-Banco Teste')).toHaveCSS('border-top-color', 'rgb(37, 99, 235)');
  expect((await admin().from('contas_financeiras').select('cor').eq('id_empresa', idEmpresa).eq('nome', 'Banco Teste').single()).data?.cor).toBe('#2563eb');
  await page.getByRole('button', { name: 'Nova conta' }).click();
  await page.getByLabel('Nome da conta').fill('Caixa');
  await page.getByLabel('Tipo').selectOption('caixa');
  // Cor personalizada pelo seletor de espectro do sistema
  await page.getByRole('dialog').getByLabel('Cor personalizada').fill('#123456');
  await page.getByRole('button', { name: 'Salvar conta' }).click();
  await expect(page.getByText('Conta cadastrada.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('listitem').filter({ hasText: 'Banco Teste' }).getByText('Principal')).toBeVisible();
  await expect(page.getByTestId('card-Caixa')).toHaveCSS('border-top-color', 'rgb(18, 52, 86)');
  expect((await admin().from('contas_financeiras').select('cor').eq('id_empresa', idEmpresa).eq('nome', 'Caixa').single()).data?.cor).toBe('#123456');

  // Valor inválido
  await page.getByRole('button', { name: 'Novo lançamento', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Receita' }).click();
  await page.getByLabel('Descrição', { exact: true }).fill('Consultoria');
  await page.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(page.getByText('Informe um valor maior que zero.')).toBeVisible();

  // Receita já recebida
  await page.getByLabel('Valor (R$)').fill('150050');
  await expect(page.getByLabel('Valor (R$)')).toHaveValue('1.500,50');
  await page.getByLabel('Categoria').selectOption({ label: 'Prestação de serviços' });
  await page.getByLabel(/^Cliente/).fill('Cliente ABC');
  await page.getByText('Já foi recebido').click();
  await expect(page.getByLabel('Conta de destino')).toHaveValue(/.+/); // principal pré-selecionada
  await expect(page.getByTestId('previa-saldo')).toContainText('Depois: R$ 2.500,50');
  await page.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(page.getByText('Receita lançada.')).toBeVisible({ timeout: 15000 });
  await aba(page, 'Visão geral');
  await expect.poll(async () => cartao(page, 'Receitas do mês')).toContain('R$ 1.500,50');
  expect(await cartao(page, 'Saldo financeiro')).toContain('R$ 2.500,50');
  expect(await cartao(page, 'Saldo financeiro')).toContain('não é saldo bancário');

  // Despesa pendente com comprovante
  await page.getByRole('button', { name: 'Novo lançamento', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Despesa' }).click();
  await page.getByLabel('Descrição', { exact: true }).fill(`Energia ${marca}`);
  await page.getByLabel('Valor (R$)').fill('48035');
  await page.getByLabel('Categoria').selectOption({ label: 'Energia' });
  await page.getByLabel(/^Fornecedor/).fill('Energisa');
  await page.locator('#lanc-arquivo').setInputFiles({ name: 'conta-luz.pdf', mimeType: 'application/pdf', buffer: PDF });
  await page.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(page.getByText('Despesa lançada.')).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => cartao(page, 'Contas a vencer')).toContain('R$ 480,35');
  expect(await cartao(page, 'Despesas do mês'), 'pendente não conta como pago').toContain('R$ 0,00');

  // Contas a pagar: edição, comprovante e baixa com clique duplo
  await aba(page, 'Contas a pagar');
  await expect(page.getByText(`Energia ${marca}`)).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: `Editar Energia ${marca}` }).click();
  await page.getByLabel('Descrição', { exact: true }).fill(`Energia elétrica ${marca}`);
  await page.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(page.getByText('Lançamento atualizado.')).toBeVisible({ timeout: 15000 });
  const nome = `Energia elétrica ${marca}`;

  await page.getByRole('button', { name: `Detalhes de ${nome}` }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByText('conta-luz.pdf')).toBeVisible({ timeout: 15000 });
  const [baixado] = await Promise.all([page.waitForEvent('download'), dialogo.getByRole('button', { name: 'Baixar conta-luz.pdf' }).click()]);
  expect(baixado.suggestedFilename()).toBe('conta-luz.pdf');
  await expect(dialogo.getByText('Criado')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Fechar', exact: true }).last().click();

  await page.getByRole('button', { name: 'Pagar', exact: true }).first().click();
  // Conta de origem, valor, data e prévia do saldo antes/depois
  await expect(page.getByLabel('Conta de origem')).toHaveValue(/.+/);
  await expect(page.getByTestId('previa-saldo')).toContainText('Antes: R$ 2.500,50');
  await expect(page.getByTestId('previa-saldo')).toContainText('Depois: R$ 2.020,15');
  await page.getByLabel('Valor pago (R$)').fill('10000');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('dialog').getByText('Pagamento parcial ainda não é suportado', { exact: false }).first()).toBeVisible({ timeout: 15000 });
  await page.getByLabel('Valor pago (R$)').fill('48035');
  const confirmar = page.getByRole('dialog').getByRole('button', { name: 'Confirmar' });
  // Dois cliques no mesmo instante (antes da tela reagir): a trava do componente e o banco evitam baixa dupla
  await confirmar.evaluate((b: HTMLButtonElement) => {
    b.click();
    b.click();
  });
  await expect(page.getByText('Pagamento registrado.')).toBeVisible({ timeout: 15000 });
  const { data: lanc } = await admin().from('lancamentos_financeiros').select('id, status, baixado_por').eq('id_empresa', idEmpresa).eq('descricao', nome).single();
  expect(lanc).toMatchObject({ status: 'pago', baixado_por: idUsuario });
  const { data: baixas } = await admin().from('historico_lancamentos_financeiros').select('id').eq('id_lancamento', lanc!.id).eq('acao', 'baixado');
  expect(baixas, 'clique duplo não gera baixa duplicada').toHaveLength(1);
  await expect(page.getByText(nome)).toHaveCount(0); // saiu de "Em aberto"
  await aba(page, 'Contas e bancos');
  await expect(page.getByTestId('saldo-Banco Teste')).toHaveText(/2\.020,15/, { timeout: 15000 });

  // Lançamentos: busca, filtro, estorno, cancelamento, exclusão, exportação
  await aba(page, 'Lançamentos');
  await page.getByLabel('Buscar por descrição, cliente ou fornecedor').fill('Cliente ABC');
  await expect(page.getByText('Consultoria')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(nome)).toHaveCount(0);
  await page.getByLabel('Buscar por descrição, cliente ou fornecedor').fill('');
  await expect(page.getByText(nome)).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: `Estornar ${nome}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Estornar' }).click();
  await expect(page.getByText('Baixa estornada.', { exact: false })).toBeVisible({ timeout: 15000 });
  const { data: movEstornada } = await admin().from('movimentacoes_financeiras').select('estornada_em').eq('id_lancamento', lanc!.id);
  expect(movEstornada?.length, 'movimentação preservada').toBe(1);
  expect(movEstornada?.[0].estornada_em).not.toBeNull();
  await page.getByRole('button', { name: `Cancelar ${nome}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar lançamento' }).click();
  await expect(page.getByText('Lançamento cancelado.')).toBeVisible({ timeout: 15000 });
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar CSV' }).click()]);
  const conteudoCsv = readFileSync((await csv.path())!, 'utf8');
  expect(conteudoCsv).toContain('Consultoria');
  expect(conteudoCsv).toContain('1500,50');
  await page.getByRole('button', { name: `Excluir ${nome}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByText('Lançamento excluído.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(nome)).toHaveCount(0);
  const { data: excluido } = await admin().from('lancamentos_financeiros').select('excluido_em, status').eq('id', lanc!.id).single();
  expect(excluido?.excluido_em, 'exclusão lógica').not.toBeNull();

  // Transferência entre contas, extrato e arquivamento
  await aba(page, 'Contas e bancos');
  await expect(page.getByTestId('saldo-Banco Teste')).toHaveText(/2\.500,50/, { timeout: 15000 });
  await page.getByRole('button', { name: 'Transferir' }).click();
  await page.getByLabel('Conta de destino').selectOption({ label: 'Caixa' });
  await page.getByLabel('Valor (R$)').fill('50000');
  await page.getByRole('dialog').getByRole('button', { name: 'Transferir' }).click();
  await expect(page.getByText('Transferência registrada.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('saldo-Banco Teste')).toHaveText(/2\.000,50/);
  await expect(page.getByTestId('saldo-Caixa')).toHaveText(/500,00/);
  await page.getByRole('button', { name: 'Movimentações de Caixa' }).click();
  await expect(page.getByRole('dialog').getByText('Transferência de Banco Teste')).toBeVisible({ timeout: 15000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).last().click();
  await page.getByRole('button', { name: 'Arquivar Caixa' }).click();
  await expect(page.getByText('Conta arquivada.', { exact: false })).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('saldo-Caixa')).toHaveCount(0);
  await page.getByText('Mostrar contas arquivadas').click();
  await expect(page.getByTestId('saldo-Caixa')).toHaveText(/500,00/);

  // Categorias: criar, duplicada, desativar (some do formulário)
  await aba(page, 'Categorias');
  await page.getByRole('tab', { name: 'Despesas' }).click();
  // Ícone e cor: busca, escolha, prévia, persistência após recarregar e edição
  const linhaCategoria = (nome: string) => page.getByRole('listitem').filter({ hasText: nome });
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  await page.getByLabel('Nome').fill('Contabilidade');
  // Digitação tecla a tecla (como o usuário): o foco não pode voltar para o campo Nome
  const buscaIcone = page.getByLabel('Buscar ícone');
  await buscaIcone.click();
  await buscaIcone.pressSequentially('contador', { delay: 40 });
  await expect(buscaIcone).toHaveValue('contador');
  await expect(buscaIcone).toBeFocused();
  await expect(page.getByLabel('Nome')).toHaveValue('Contabilidade');
  await expect(page.getByRole('button', { name: /^Ícone / })).toHaveCount(1);
  await page.getByRole('button', { name: 'Ícone Contabilidade' }).click();
  await page.getByRole('button', { name: 'Cor Roxo' }).click();
  await expect(page.getByTestId('previa-categoria').locator('[data-icone="calculator"]')).toHaveCSS('background-color', 'rgb(139, 92, 246)');
  await page.getByLabel('Buscar ícone').fill('xyzinexistente');
  await expect(page.getByText('Nenhum ícone encontrado.')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Categoria criada.')).toBeVisible({ timeout: 15000 });
  await expect(linhaCategoria('Contabilidade').locator('[data-icone="calculator"]')).toBeVisible();
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  await page.getByLabel('Nome').fill('Sem ícone escolhido');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Categoria criada.')).toBeVisible({ timeout: 15000 });
  await expect(linhaCategoria('Sem ícone escolhido').locator('[data-icone="tag"]'), 'ícone padrão').toBeVisible();
  await page.reload();
  await aba(page, 'Categorias');
  await page.getByRole('tab', { name: 'Despesas' }).click();
  await expect(linhaCategoria('Contabilidade').locator('[data-icone="calculator"]'), 'persiste após recarregar').toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Editar Contabilidade' }).click();
  await expect(page.getByRole('button', { name: 'Ícone Contabilidade' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Ícone Jurídico' }).click();
  await page.getByRole('button', { name: 'Cor Verde-água' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Categoria atualizada.')).toBeVisible({ timeout: 15000 });
  await expect(linhaCategoria('Contabilidade').locator('[data-icone="scale"]')).toHaveCSS('background-color', 'rgb(13, 148, 136)');
  await expect.poll(async () => (await admin().from('categorias_financeiras').select('icone, cor').eq('id_empresa', idEmpresa).eq('nome', 'Contabilidade').single()).data, { timeout: 15000 }).toEqual({ icone: 'scale', cor: '#0d9488' });
  // Cor personalizada pelo código: inválido não muda; válido (bem claro) salva e o ícone fica escuro (contraste)
  await page.getByRole('button', { name: 'Editar Contabilidade' }).click();
  const codigoCor = page.getByRole('dialog').getByLabel('Código da cor');
  await codigoCor.fill('#ZZZZZZ');
  await expect(page.getByRole('dialog').getByText('Use o formato #RRGGBB')).toBeVisible();
  await expect(page.getByTestId('previa-categoria').locator('[data-icone="scale"]')).toHaveCSS('background-color', 'rgb(13, 148, 136)');
  await codigoCor.fill('#FFD6E7');
  await expect(page.getByTestId('previa-categoria').locator('[data-icone="scale"]')).toHaveCSS('background-color', 'rgb(255, 214, 231)');
  await expect(page.getByRole('dialog').getByLabel('Cor personalizada')).toHaveValue('#ffd6e7');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Categoria atualizada.')).toBeVisible({ timeout: 15000 });
  await expect(linhaCategoria('Contabilidade').locator('[data-icone="scale"]')).toHaveCSS('color', 'rgb(17, 24, 39)');
  // O aviso "Categoria atualizada." do salvamento anterior ainda está na tela: espera o banco refletir o novo valor
  await expect.poll(async () => (await admin().from('categorias_financeiras').select('cor').eq('id_empresa', idEmpresa).eq('nome', 'Contabilidade').single()).data?.cor, { timeout: 15000 }).toBe('#ffd6e7');
  // Exibição nos lançamentos e no formulário
  await aba(page, 'Lançamentos');
  await expect(page.getByRole('row').filter({ hasText: 'Consultoria' }).locator('[data-icone="briefcase"]')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Novo lançamento', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Despesa' }).click();
  await page.getByLabel('Categoria').selectOption({ label: 'Contabilidade' });
  await expect(page.getByTestId('categoria-escolhida').locator('[data-icone="scale"]')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await aba(page, 'Categorias');
  await page.getByRole('tab', { name: 'Despesas' }).click();
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  await page.getByLabel('Nome').fill('aluguel');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('dialog').getByText('Já existe uma categoria com este nome.')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Contabilidade' }).getByRole('button', { name: 'Desativar' }).click();
  await expect(page.getByText('Categoria desativada.')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Novo lançamento', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Despesa' }).click();
  await expect(page.getByLabel('Categoria').locator('option', { hasText: 'Contabilidade' })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();

  // Visão geral reflete os dados reais
  await aba(page, 'Visão geral');
  await expect.poll(async () => cartao(page, 'Receitas do mês')).toContain('R$ 1.500,50');
  expect(await cartao(page, 'Despesas do mês')).toContain('R$ 0,00');
  // Esperados: 409 (categoria duplicada) e 400 (pagamento parcial) — tentativas propositais recusadas pelo banco
  expect(erros.filter((e) => !/status of (400|409)/.test(e))).toEqual([]);
});

test('layout do financeiro sem rolagem lateral de 320 a 1920px', async ({ page }) => {
  await entrar(page);
  for (const secao of ['visao', 'lancamentos', 'pagar', 'receber', 'contas', 'categorias']) {
    await page.goto(`${BASE}/app/financeiro#${secao}`);
    await expect(page.getByRole('heading', { name: 'Financeiro', level: 1 })).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(400);
    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.waitForTimeout(150);
      const excesso = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(excesso, `${secao} @${largura}px`).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
});
