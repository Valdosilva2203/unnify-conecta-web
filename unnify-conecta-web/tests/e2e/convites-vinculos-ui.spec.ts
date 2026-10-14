import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, SUPABASE, type Rotas } from './apoio/sessao-simulada';

// E4.1 — convites e vinculação recíproca com a API do Supabase e as rotas /api SIMULADAS: não acessa banco nem envia e-mail.
// Regras de banco (tokens, e-mail confirmado, CNPJ, permissões, concorrência, isolamento) em tests/sql/convites-vinculos.mjs.

const BASE = 'http://localhost:3000';
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'EMPRESA EXEMPLO LTDA', nome_comercial: 'Empresa Exemplo', cnpj: '12345678000190', tipo_empresa: 'comum' };
const CNPJ_OK = '11.222.333/0001-81';
const TOKEN = 'tok_' + 'a'.repeat(43);
const expira = new Date(Date.now() + 6 * 86400000).toISOString();
const CONVITE_CONTADOR = { sentido: 'contador_para_empresa', remetente: 'João da Silva', escritorio: 'Escritório Contábil Exemplo', cnpj_convidado: '11222333000181',
  mensagem: 'Vamos organizar tudo por aqui.', email_mascarado: 'm•••@empresa.test', situacao: 'pendente', expira_em: expira, funcao: 'principal',
  permissoes: ['ver_dados_cadastrais', 'ver_documentos'] };
const CONVITE_EMPRESA = { ...CONVITE_CONTADOR, sentido: 'empresa_para_contador', remetente: 'Empresa Exemplo', escritorio: null, cnpj_convidado: null, funcao: 'fiscal', permissoes: ['ver_documentos'] };
const CONVITES = [
  { id: 'c1', sentido: 'contador_para_empresa', email_destino: 'maria@empresa.test', nome_destino: null, cnpj_convidado: '11222333000181', situacao: 'pendente', envio_status: 'falhou', criado_em: new Date().toISOString(), expira_em: expira },
  { id: 'c2', sentido: 'contador_para_empresa', email_destino: 'velho@empresa.test', nome_destino: null, cnpj_convidado: '11444777000161', situacao: 'expirado', envio_status: 'enviado', criado_em: new Date().toISOString(), expira_em: expira },
  { id: 'c3', sentido: 'contador_para_empresa', email_destino: 'ok@empresa.test', nome_destino: null, cnpj_convidado: '11444777000161', situacao: 'aceito', envio_status: 'enviado', criado_em: new Date().toISOString(), expira_em: expira },
];

type Chamada = { caminho: string; corpo: unknown };
function rotas(papel: 'empresa' | 'contador', extra?: Rotas): Rotas {
  return (caminho, url, req) => {
    const e = extra?.(caminho, url, req);
    if (e) return e;
    if (caminho === 'perfis') return { corpo: [{ nome_completo: papel === 'empresa' ? 'Ana Souza' : 'João da Silva', tipo_usuario: papel, funcao_global: 'user' }] };
    if (caminho === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA, id_empresa: EMPRESA.id }], total: 1 };
    if (caminho === 'rpc/convites_enviados') return { corpo: CONVITES };
    if (caminho === 'rpc/empresas_do_contador') return { corpo: [] };
    if (caminho === 'rpc/vinculos_da_empresa') return { corpo: [] };
    if (caminho === 'rpc/buscar_catalogo_contadores') return { corpo: [] };
    if (caminho === 'notificacoes') return { corpo: [{ id: 'n1', titulo: 'Nova solicitação de vínculo', mensagem: 'Empresa Exemplo quer trabalhar com você.', link: '/contador/empresas', lida_em: null, criado_em: new Date().toISOString() }] };
    if (caminho === 'rpc/marcar_notificacoes_lidas') return { corpo: 1 };
    if (caminho === 'empresas') return { corpo: [] };
    return undefined;
  };
}
async function rotasApi(ctx: BrowserContext, convite: { enviado: boolean } | { status: number; erro: string } = { enviado: true }) {
  const corpos: unknown[] = [];
  await ctx.route(`${BASE}/api/convites`, async (r) => {
    corpos.push(JSON.parse(r.request().postData() ?? '{}'));
    if ('status' in convite) return r.fulfill({ status: convite.status, contentType: 'application/json', body: JSON.stringify({ erro: convite.erro }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'novo', enviado: convite.enviado }) });
  });
  await ctx.route(`${BASE}/api/notificacoes/processar`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"processados":0}' }));
  await ctx.route(`${BASE}/api/auth/check-role`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"role":"user"}' }));
  return corpos;
}
async function abrir(ctx: BrowserContext, caminho: string, titulo: string | RegExp): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${caminho}`);
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible({ timeout: 90000 });
  return page;
}
const chamou = (registro: { chamadas: Chamada[] }, caminho: string) => registro.chamadas.filter((c) => c.caminho === caminho);

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('A: contador vincula empresa cadastrada pelo CNPJ (validação, dados mínimos, solicitação)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const registro = await sessaoSimulada(ctx, rotas('contador', (c) => {
    if (c === 'rpc/consultar_empresa_por_cnpj') return { corpo: [{ encontrada: true, nome: 'Comércio Alfa', cidade: 'Palmas', estado: 'TO', situacao_vinculo: null }] };
    if (c === 'rpc/solicitar_vinculo_por_cnpj') return { corpo: 'v-novo' };
    return undefined;
  }));
  await rotasApi(ctx);
  const page = await abrir(ctx, '/contador/empresas', 'Minhas empresas');
  await page.getByRole('button', { name: 'Vincular empresa' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('CNPJ da empresa').fill('11222333000180');
  await modal.getByRole('button', { name: 'Buscar empresa' }).click();
  await expect(modal.getByRole('alert')).toContainText('CNPJ inválido');
  expect(chamou(registro, 'rpc/consultar_empresa_por_cnpj')).toHaveLength(0); // inválido nem chega ao banco
  await modal.getByLabel('CNPJ da empresa').fill(CNPJ_OK);
  await modal.getByRole('button', { name: 'Buscar empresa' }).click();
  await expect(modal.getByTestId('empresa-encontrada')).toContainText('Comércio Alfa');
  await expect(modal.getByTestId('empresa-encontrada')).toContainText('Palmas/TO');
  await modal.getByRole('button', { name: 'Solicitar vínculo' }).click();
  await expect(modal.getByRole('status')).toContainText('Aguardando resposta da empresa');
  expect((chamou(registro, 'rpc/solicitar_vinculo_por_cnpj')[0].corpo as { p_cnpj: string }).p_cnpj).toBe(CNPJ_OK);
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('B: empresa não cadastrada → convite por e-mail; falha no envio não aparece como entregue; lista de convites', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ctx, rotas('contador', (c) => (c === 'rpc/consultar_empresa_por_cnpj' ? { corpo: [{ encontrada: false, nome: null, cidade: null, estado: null, situacao_vinculo: null }] } : undefined)));
  const corpos = await rotasApi(ctx, { enviado: false });
  const page = await abrir(ctx, '/contador/empresas', 'Minhas empresas');
  // Convites enviados: situações e falha de envio
  const lista = page.getByRole('region', { name: 'Convites enviados' });
  await expect(lista.getByTestId('convite-maria@empresa.test')).toContainText('E-mail não enviado');
  await expect(lista.getByTestId('convite-velho@empresa.test')).toContainText('Expirado');
  await expect(lista.getByTestId('convite-velho@empresa.test').getByRole('button', { name: 'Reenviar' })).toBeVisible();
  await expect(lista.getByTestId('convite-ok@empresa.test')).toContainText('Aceito');
  await expect(lista.getByTestId('convite-ok@empresa.test').getByRole('button')).toHaveCount(0);

  await page.getByRole('button', { name: 'Vincular empresa' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('CNPJ da empresa').fill(CNPJ_OK);
  await modal.getByRole('button', { name: 'Buscar empresa' }).click();
  await expect(modal).toContainText('Não encontramos essa empresa no Unnify Conecta. Convide o empresário para criar sua conta e conectar-se ao seu escritório.');
  await expect(modal).toContainText(CNPJ_OK);
  await modal.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(modal.getByRole('alert')).toContainText('e-mail válido');
  await modal.getByLabel('E-mail do empresário').fill('maria@empresa.test');
  await modal.getByLabel('Mensagem (opcional)').fill('Olá, Maria!');
  await modal.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(modal.getByRole('status')).toContainText('não conseguimos enviar o e-mail');
  await expect(modal.getByRole('status')).not.toContainText('Convite enviado');
  expect(corpos[0]).toMatchObject({ sentido: 'contador_para_empresa', cnpj: CNPJ_OK, email: 'maria@empresa.test', mensagem: 'Olá, Maria!' });
  await ctx.close();
});

test('C/D: empresário — convidar contador não cadastrado e aceitar solicitação definindo permissões', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const registro = await sessaoSimulada(ctx, rotas('empresa', (c, _u, req) => {
    if (c === 'rpc/vinculos_da_empresa' && JSON.parse(req.postData() ?? '{}').p_status === 'ativo') return { corpo: [] };
    if (c === 'rpc/vinculos_da_empresa') return { corpo: [{ id: 'v1', funcao: 'principal', status: 'pendente', permissoes: ['ver_dados_cadastrais', 'ver_documentos', 'ver_financeiro'], origem: 'contador',
      criado_em: new Date().toISOString(), aprovado_em: null, encerrado_em: null, motivo_encerramento: null, id_contador: 'c1', contador_nome: 'João da Silva', contador_email: 'j@x.test',
      id_escritorio: null, escritorio_nome: null, nome_profissional: 'João da Silva', foto_caminho: null }] };
    if (c === 'rpc/aceitar_vinculo_contabil') return { corpo: null };
    if (c === 'rpc/convites_enviados') return { corpo: [] };
    return undefined;
  }));
  const corpos = await rotasApi(ctx, { enviado: true });
  // D: convite pelo "Encontre seu contador"
  const busca = await abrir(ctx, '/app/meu-contador/buscar', 'Encontre seu contador');
  const cartao = busca.getByRole('region', { name: 'Convidar meu contador' });
  await expect(cartao).toContainText('Não encontrou seu contador?');
  await cartao.getByRole('button', { name: 'Convidar meu contador' }).click();
  const modal = busca.getByRole('dialog');
  await modal.getByLabel('Nome do contador ou escritório (opcional)').fill('Escritório Novo');
  await modal.getByLabel('E-mail profissional').fill('contador@novo.test');
  await modal.getByLabel('Ver financeiro e saúde empresarial').check();
  await modal.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(modal.getByRole('status')).toContainText('Convite enviado para contador@novo.test');
  expect(corpos[0]).toMatchObject({ sentido: 'empresa_para_contador', id_empresa: EMPRESA.id, email: 'contador@novo.test', funcao: 'principal' });
  expect((corpos[0] as { permissoes: string[] }).permissoes).toContain('ver_financeiro');
  // A (lado da empresa): aceitar solicitação recebida definindo as permissões
  const mc = await abrir(ctx, '/app/meu-contador', 'Meu Contador');
  await mc.getByRole('button', { name: 'Aceitar' }).click();
  const aceite = mc.getByRole('dialog', { name: 'Aceitar e definir permissões' });
  await aceite.getByLabel('Ver financeiro e saúde empresarial').uncheck();
  await aceite.getByRole('button', { name: 'Aceitar e ativar' }).click();
  await expect.poll(() => chamou(registro, 'rpc/aceitar_vinculo_contabil').length).toBe(1);
  expect((chamou(registro, 'rpc/aceitar_vinculo_contabil')[0].corpo as { p_permissoes: string[] }).p_permissoes).toEqual(['ver_dados_cadastrais', 'ver_documentos']);
  expect(chamou(registro, 'rpc/responder_vinculo_contabil')).toHaveLength(0); // não ativa sem definir permissões
  await ctx.close();
});

test('Página do convite: sem login mostra remetente e cadastro; token sai da URL; inválido não revela nada', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route(`${SUPABASE}/**`, (r) => {
    const corpo = JSON.parse(r.request().postData() ?? '{}');
    if (r.request().url().endsWith('/rpc/dados_convite')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo.p_token === TOKEN ? [CONVITE_CONTADOR] : []) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/convite#${TOKEN}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Você recebeu um convite' })).toBeVisible({ timeout: 90000 });
  await expect(page.getByText('João da Silva (Escritório Contábil Exemplo)')).toBeVisible();
  await expect(page.getByText('11.222.333/0001-81')).toBeVisible();
  await expect(page.getByText('m•••@empresa.test', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Criar minha conta' })).toHaveAttribute('href', '/signup');
  expect(page.url()).not.toContain(TOKEN);
  expect(await page.evaluate(() => localStorage.getItem('unnify:convite'))).toBe(TOKEN);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  const p2 = await ctx.newPage();
  await p2.evaluate(() => localStorage.clear()).catch(() => {});
  await p2.goto(`${BASE}/convite#token-qualquer-mas-longo-o-suficiente-para-teste`);
  await expect(p2.getByRole('heading', { level: 1, name: 'Convite inválido' })).toBeVisible({ timeout: 30000 });
  await ctx.close();
});

test('Página do convite: contador logado aceita (permissões só leitura); expirado não oferece aceite', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let situacao = 'pendente';
  const registro = await sessaoSimulada(ctx, rotas('contador', (c) => {
    if (c === 'rpc/dados_convite') return { corpo: [{ ...CONVITE_EMPRESA, situacao }] };
    if (c === 'rpc/aceitar_convite_vinculo') return { corpo: 'v-novo' };
    return undefined;
  }));
  await rotasApi(ctx);
  const page = await abrir(ctx, `/convite#${TOKEN}`, 'Você recebeu um convite');
  await expect(page.getByText('Acessos autorizados pela empresa')).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Aceitar vínculo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Convite aceito: vínculo ativado.' })).toBeVisible();
  const corpo = chamou(registro, 'rpc/aceitar_convite_vinculo')[0].corpo as { p_token: string; p_aceitar: boolean; p_permissoes: unknown };
  expect(corpo).toMatchObject({ p_token: TOKEN, p_aceitar: true, p_permissoes: null });
  situacao = 'expirado';
  const p2 = await abrir(ctx, `/convite#${TOKEN}`, 'Você recebeu um convite');
  await expect(p2.getByTestId('situacao-convite')).toContainText('expirou');
  await expect(p2.getByRole('button', { name: 'Aceitar vínculo' })).toHaveCount(0);
  await ctx.close();
});

test('Onboarding da empresa com convite: aceite explícito obrigatório e vínculo criado após o cadastro', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((t) => { try { localStorage.setItem('unnify:convite', t); } catch { /* */ } }, TOKEN);
  const registro = await sessaoSimulada(ctx, rotas('empresa', (c) => {
    if (c === 'rpc/dados_convite') return { corpo: [CONVITE_CONTADOR] };
    if (c === 'rpc/criar_empresa') return { corpo: [{ id: 'emp-nova', sucesso: true, mensagem: 'ok' }] };
    if (c === 'rpc/aceitar_convite_vinculo') return { corpo: 'v-novo' };
    return undefined;
  }));
  await rotasApi(ctx);
  const page = await abrir(ctx, '/onboarding/empresa?tipo=comum', 'Dados da empresa');
  await expect(page.getByText('Convite de vínculo')).toBeVisible();
  await expect(page.locator('#emp-cnpj')).toHaveValue(CNPJ_OK);
  for (const [sel, v] of [['#emp-legalName', 'Empresa Nova Ltda'], ['#emp-phone', '11999999999'], ['#emp-email', 'maria@empresa.test'], ['#emp-city', 'Palmas']] as const) await page.locator(sel).fill(v);
  await page.locator('#emp-state').selectOption('TO');
  const enviar = page.locator('button[type="submit"]');
  await enviar.click();
  await expect(page.getByText('Escolha se deseja aceitar o vínculo com o contador.')).toBeVisible();
  expect(chamou(registro, 'rpc/criar_empresa')).toHaveLength(0);
  await page.getByLabel(/Aceito o vínculo/).check();
  await enviar.click();
  await page.waitForURL('**/onboarding/conclusao', { timeout: 30000 });
  await expect.poll(() => chamou(registro, 'rpc/aceitar_convite_vinculo').length).toBe(1);
  expect(chamou(registro, 'rpc/criar_empresa')).toHaveLength(1); // empresa criada ANTES do aceite
  const corpo = chamou(registro, 'rpc/aceitar_convite_vinculo')[0].corpo as Record<string, unknown>;
  expect(corpo).toMatchObject({ p_token: TOKEN, p_aceitar: true, p_id_empresa: 'emp-nova', p_permissoes: ['ver_dados_cadastrais', 'ver_documentos'] });
  expect(await page.evaluate(() => localStorage.getItem('unnify:convite'))).toBeNull();
  await ctx.close();
});

test('Notificações no sino e layout sem rolagem lateral de 320 a 1920px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const registro = await sessaoSimulada(ctx, rotas('contador'));
  await rotasApi(ctx);
  const page = await abrir(ctx, '/contador/empresas', 'Minhas empresas');
  const sino = page.getByRole('button', { name: /Notificações \(1 não lidas\)/ });
  await sino.click();
  await expect(page.getByRole('dialog', { name: 'Notificações' })).toContainText('Nova solicitação de vínculo');
  await expect.poll(() => chamou(registro, 'rpc/marcar_notificacoes_lidas').length).toBe(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Vincular empresa' }).click();
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `contador @${largura}`).toBeLessThanOrEqual(1);
  }
  await ctx.close();
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await sessaoSimulada(ctx2, rotas('empresa'));
  await rotasApi(ctx2);
  const busca = await abrir(ctx2, '/app/meu-contador/buscar', 'Encontre seu contador');
  await busca.getByRole('button', { name: 'Convidar meu contador' }).click();
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    await busca.setViewportSize({ width: largura, height: 900 });
    await busca.waitForTimeout(200);
    expect(await busca.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `empresa @${largura}`).toBeLessThanOrEqual(1);
  }
  await ctx2.close();
});

// Banco SEM as migrations 033/035 (como o Supabase compartilhado hoje): PostgREST responde 404/PGRST202.
const AUSENTE = (nome: string) => ({ status: 404, corpo: { code: 'PGRST202', message: `Could not find the function public.${nome} in the schema cache` } });

test('banco sem as migrations: painel do contador explica a indisponibilidade (≠ erro, ≠ vazio) e convite devolve 503 claro', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let leiturasNotificacoes = 0;
  const registro = await sessaoSimulada(ctx, rotas('contador', (c) => {
    if (c === 'rpc/painel_contador') return AUSENTE('painel_contador');
    if (c === 'rpc/proximas_obrigacoes_contador') return AUSENTE('proximas_obrigacoes_contador');
    if (c === 'rpc/convites_enviados') return AUSENTE('convites_enviados');
    if (c === 'notificacoes') { leiturasNotificacoes++; return { status: 404, corpo: { code: 'PGRST205', message: "Could not find the table 'public.notificacoes' in the schema cache" } }; }
    return undefined;
  }));
  await rotasApi(ctx);
  const page = await abrir(ctx, '/contador', 'Painel do Contador');
  await expect(page.getByTestId('painel-indisponivel')).toContainText('falta aplicar uma atualização do banco', { timeout: 15000 });
  await expect(page.getByRole('link', { name: 'Ver minhas empresas' })).toHaveAttribute('href', '/contador/empresas');
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toHaveCount(0); // não é falha passageira
  await expect(page.getByTestId('empresa-Empresa Exemplo')).toHaveCount(0); // nada inventado
  await expect(page.locator('section[aria-label="Empresas vinculadas"]')).toContainText('Indisponível');
  // /contador/empresas segue funcionando (usa função antiga); só a lista de convites mostra aviso neutro
  const emp = await abrir(ctx, '/contador/empresas', 'Minhas empresas');
  await expect(emp.getByTestId('convites-indisponivel')).toBeVisible({ timeout: 15000 });
  await emp.waitForTimeout(500);
  expect(leiturasNotificacoes).toBeLessThanOrEqual(4); // 2 páginas × 2 (efeito duplo do StrictMode em dev); sem repetição periódica
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();

  // Empresário: a rota devolve 503 (não 400) e a tela mostra a explicação; nada é dado como enviado
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ctx2, rotas('empresa'));
  await rotasApi(ctx2, { status: 503, erro: 'Esta área ainda não está disponível neste ambiente: falta aplicar uma atualização do banco de dados. Avise o suporte.' });
  const busca = await abrir(ctx2, '/app/meu-contador/buscar', 'Encontre seu contador');
  await busca.getByRole('button', { name: 'Convidar meu contador' }).click();
  const modal = busca.getByRole('dialog');
  await modal.getByLabel('E-mail profissional').fill('contador@novo.test');
  await modal.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(modal.getByRole('alert')).toContainText('falta aplicar uma atualização do banco');
  await expect(modal.getByRole('status')).toHaveCount(0);
  await expect(modal.getByRole('alert')).toBeInViewport(); // visível mesmo com o formulário rolável (antes ficava no fim e parecia "enviando")
  await ctx2.close();

  // Banco COM as funções e conta sem empresas: estado vazio normal, sem aviso de erro
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ctx3, rotas('contador', (c) => (c === 'rpc/painel_contador' || c === 'rpc/proximas_obrigacoes_contador' ? { corpo: [] } : undefined)));
  await rotasApi(ctx3);
  const vazio = await abrir(ctx3, '/contador', 'Painel do Contador');
  await expect(vazio.getByText('Nenhuma empresa vinculada ainda')).toBeVisible({ timeout: 15000 });
  await expect(vazio.getByTestId('painel-indisponivel')).toHaveCount(0);
  await expect(vazio.getByRole('alert').filter({ hasText: 'Não foi possível' })).toHaveCount(0);
  await ctx3.close();
});

test('Convite aberto com outra conta logada: mostra a conta e permite sair para seguir como destinatário', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await sessaoSimulada(ctx, rotas('empresa', (c) => {
    if (c === 'rpc/dados_convite') return { corpo: [CONVITE_EMPRESA] };
    if (c === 'auth/logout') return { status: 204 };
    return undefined;
  }));
  const page = await abrir(ctx, `/convite#${TOKEN}`, 'Você recebeu um convite');
  const aviso = page.getByTestId('conta-incompativel');
  await expect(aviso).toContainText('Você está conectado como simulado@exemplo.test');
  await expect(aviso).toContainText('Este convite é para uma conta de contador.');
  await aviso.getByRole('button', { name: 'Sair e continuar como contador' }).click();
  await expect(page.getByRole('link', { name: 'Criar minha conta' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Já tenho conta' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('unnify:convite'))).toBe(TOKEN); // convite segue guardado para o cadastro
  await ctx.close();
});
