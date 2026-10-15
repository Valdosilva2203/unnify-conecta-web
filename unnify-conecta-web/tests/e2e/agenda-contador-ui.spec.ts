import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, USUARIO_SIMULADO, type Rotas } from './apoio/sessao-simulada';

// Agenda do contador e empresas clicáveis com a API do Supabase SIMULADA (não acessa banco). Regras de banco (privacidade,
// permissão "gerenciar_agenda", vínculo ativo, sincronização, isolamento) em tests/sql/agenda-contador.mjs.
const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dia = (h: string) => `${hoje}T${h}:00-03:00`;
const LOGAR = { id: 'aaaaaaaa-0000-4000-8000-0000000000a1', nome: 'Logar Digital', cnpj: '10.561.685/0001-07' };
const UNNIFY = { id: 'bbbbbbbb-0000-4000-8000-0000000000b2', nome: 'UNNIFY', cnpj: '24.214.920/0001-70' };
const PENDENTE = { id: 'cccccccc-0000-4000-8000-0000000000c3', nome: 'Padaria Pendente', cnpj: '11.111.111/0001-11' };
const base = { descricao: null, local: null, dia_inteiro: false, id_responsavel: USUARIO_SIMULADO.id, responsavel_nome: 'João da Silva', valor: null, link: '/contador/agenda', editavel: true };
const EVENTOS = [
  { ...base, origem: 'compromisso', id: 'p1', titulo: 'Estudo CRC', inicio: dia('08:00'), fim: dia('09:00'), categoria: 'treinamento', status: 'agendado', status_origem: 'agendado', visibilidade: 'privado', id_empresa: null, empresa_nome: null },
  { ...base, origem: 'compromisso', id: 'c1', titulo: 'Reunião de fechamento', inicio: dia('10:00'), fim: dia('11:00'), categoria: 'reuniao', status: 'confirmado', status_origem: 'confirmado', visibilidade: 'compartilhado', id_empresa: LOGAR.id, empresa_nome: LOGAR.nome },
  { ...base, origem: 'compromisso', id: 'c2', titulo: 'Visita à UNNIFY', inicio: dia('14:00'), fim: dia('15:00'), categoria: 'visita', status: 'concluido', status_origem: 'concluido', visibilidade: 'compartilhado', id_empresa: UNNIFY.id, empresa_nome: UNNIFY.nome, editavel: false },
  { ...base, origem: 'obrigacao', id: 'o1', titulo: 'DAS de outubro', inicio: dia('00:00'), fim: `${hoje}T23:59:59-03:00`, dia_inteiro: true, categoria: 'obrigacao', status: 'pendente', status_origem: 'pendente', visibilidade: null,
    link: `/contador/empresas/${LOGAR.id}#obrigacoes`, editavel: false, id_empresa: LOGAR.id, empresa_nome: LOGAR.nome },
];
const painel = [
  { id_empresa: LOGAR.id, nome: LOGAR.nome, cnpj: '10561685000107', permissoes: ['gerenciar_agenda', 'gerenciar_obrigacoes'], solicitacoes_aguardando_analise: 0, solicitacoes_aguardando_empresa: 0, obrigacoes_abertas: 0, obrigacoes_atrasadas: 0, obrigacoes_7_dias: 0, itens_concluidos: 0 },
  { id_empresa: UNNIFY.id, nome: UNNIFY.nome, cnpj: '24214920000170', permissoes: ['gerenciar_obrigacoes'], solicitacoes_aguardando_analise: 0, solicitacoes_aguardando_empresa: 0, obrigacoes_abertas: 0, obrigacoes_atrasadas: 0, obrigacoes_7_dias: 0, itens_concluidos: 0 },
];
const vinculo = (e: { id: string; nome: string; cnpj: string }, extra: Record<string, unknown> = {}) => ({ id_vinculo: `v-${e.id}`, id_empresa: e.id, razao_social: `${e.nome} LTDA`, nome_comercial: e.nome, cnpj: e.cnpj,
  cidade: 'Augustinópolis', estado: 'TO', funcao: 'principal', status: 'ativo', permissoes: [], origem: 'empresa', escritorio_nome: null, criado_em: '2026-10-01T12:00:00Z', aprovado_em: '2026-10-02T12:00:00Z', total: 3, ...extra });
const VINCULOS = [vinculo(LOGAR), vinculo(UNNIFY), vinculo(PENDENTE, { status: 'pendente', origem: 'contador', aprovado_em: null })];

function rotas(extra?: Rotas): Rotas {
  return (c, u, req) => {
    const e = extra?.(c, u, req);
    if (e) return e;
    if (c === 'perfis') return { corpo: [{ nome_completo: 'João da Silva', tipo_usuario: 'contador', funcao_global: 'user' }] };
    if (c === 'rpc/painel_contador') return { corpo: painel };
    if (c === 'rpc/agenda_contador') return { corpo: EVENTOS };
    if (c === 'rpc/membros_agenda') return { corpo: [{ id_usuario: USUARIO_SIMULADO.id, nome: 'João da Silva' }, { id_usuario: 'dono1', nome: 'Maria Dona' }] };
    if (c === 'rpc/salvar_compromisso') return { corpo: 'novo' };
    if (c === 'rpc/excluir_compromisso') return { status: 204 };
    if (c === 'rpc/empresas_do_contador') return { corpo: VINCULOS };
    if (c === 'empresas') return { corpo: [] };
    if (c === 'notificacoes') return { corpo: [] };
    return undefined;
  };
}
async function abrir(ctx: BrowserContext, caminho: string, titulo: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${caminho}`);
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible({ timeout: 90000 });
  return page;
}
const chamadas = (r: { chamadas: { caminho: string; corpo: unknown }[] }, c: string) => r.chamadas.filter((x) => x.caminho === c);
const texto = async (p: Page, nome: string) => ((await p.getByRole('region', { name: nome, exact: true }).textContent()) ?? '').replace(/ /g, ' ');

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('Agenda do contador abre pelo menu; pessoais, compartilhados e obrigações; filtros por empresa, origem e status', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx, '/contador/agenda', 'Agenda');
  await expect(page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/contador/agenda');
  expect(chamadas(registro, 'rpc/agenda_contador')[0].corpo).toMatchObject({ p_id_empresa: null });
  const itens = page.getByTestId('itens-do-dia');
  await expect(itens.locator('li')).toHaveCount(4);
  await expect(page.getByTestId('evento-compromisso-Estudo CRC')).toContainText('Pessoal (só você)');
  await expect(page.getByTestId('evento-compromisso-Reunião de fechamento')).toContainText('Logar Digital');
  await expect(page.getByTestId('evento-compromisso-Reunião de fechamento')).toContainText('Compartilhado com a empresa e o contador');
  await expect(page.getByTestId('evento-obrigacao-DAS de outubro').getByRole('link')).toHaveAttribute('href', `/contador/empresas/${LOGAR.id}#obrigacoes`);
  await expect(page.getByTestId('evento-compromisso-Visita à UNNIFY').getByRole('button', { name: /Editar/ })).toHaveCount(0); // não é dele: só leitura
  expect(await texto(page, 'Compartilhados com empresas')).toContain('2');
  expect(await texto(page, 'Pessoais este mês')).toContain('1');
  await page.getByLabel('Filtrar por empresa').selectOption('pessoal');
  await expect(itens.locator('li')).toHaveCount(1);
  await page.getByLabel('Filtrar por empresa').selectOption(LOGAR.id);
  await expect(itens.locator('li')).toHaveCount(2);
  await page.getByLabel('Filtrar por empresa').selectOption('');
  await page.getByLabel('Filtrar por origem').selectOption('obrigacao');
  await expect(itens.locator('li')).toHaveCount(1);
  await expect(page.getByLabel('Filtrar por origem').locator('option', { hasText: 'Tarefas' })).toHaveCount(0);
  await page.getByLabel('Filtrar por origem').selectOption('');
  await page.getByLabel('Filtrar por status').selectOption('concluido');
  await expect(itens.locator('li')).toHaveCount(1);
  await page.getByLabel('Filtrar por status').selectOption('');
  // Visualizações reutilizadas: semana e lista
  await page.getByRole('tab', { name: 'Semana' }).click();
  await expect(page.getByTestId('grade-semana')).toContainText('Reunião de fechamento');
  await page.getByRole('tab', { name: 'Lista' }).click();
  await expect(page.getByTestId('lista-agenda')).toContainText('Visita à UNNIFY');
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('criar compromisso pessoal e compartilhar com empresa autorizada; editar e excluir os próprios', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx, '/contador/agenda', 'Agenda');
  await page.getByRole('button', { name: 'Novo compromisso' }).click();
  const m = page.getByRole('dialog', { name: 'Novo compromisso' });
  // Só empresas com "Agenda compartilhada" aparecem para compartilhar
  const opcoes = await m.getByLabel('Empresa').locator('option').allTextContents();
  expect(opcoes).toEqual(['Pessoal (só eu vejo)', 'Logar Digital']);
  await expect(m.getByLabel('Visibilidade')).toHaveCount(0); // pessoal: sem escolha de visibilidade/responsável
  await m.getByLabel('Título').fill('Planejar o mês');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_compromisso').length).toBe(1);
  expect(chamadas(registro, 'rpc/salvar_compromisso')[0].corpo).toMatchObject({ p_id: null, p_id_empresa: null, p_titulo: 'Planejar o mês', p_visibilidade: 'privado', p_id_responsavel: null });
  // Compartilhado com a Logar Digital
  await page.getByRole('button', { name: 'Novo compromisso' }).click();
  const n = page.getByRole('dialog', { name: 'Novo compromisso' });
  await n.getByLabel('Título').fill('Reunião trimestral');
  await n.getByLabel('Empresa').selectOption(LOGAR.id);
  await expect.poll(() => chamadas(registro, 'rpc/membros_agenda').length).toBeGreaterThan(0);
  expect(chamadas(registro, 'rpc/membros_agenda').at(-1)!.corpo).toEqual({ p_id_empresa: LOGAR.id });
  expect(await n.getByLabel('Visibilidade').locator('option').allTextContents()).toEqual(['Só eu (a empresa não vê)', 'Compartilhado com a empresa']);
  await n.getByLabel('Visibilidade').selectOption('compartilhado');
  await n.getByLabel('Responsável').selectOption('dono1');
  await n.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_compromisso').length).toBe(2);
  expect(chamadas(registro, 'rpc/salvar_compromisso')[1].corpo).toMatchObject({ p_id: null, p_id_empresa: LOGAR.id, p_titulo: 'Reunião trimestral', p_visibilidade: 'compartilhado', p_id_responsavel: 'dono1' });
  // Editar o próprio (empresa não muda) e concluir
  await page.getByTestId('evento-compromisso-Reunião de fechamento').getByRole('button', { name: /Editar/ }).click();
  const ed = page.getByRole('dialog', { name: 'Editar compromisso' });
  await expect(ed.getByLabel('Empresa')).toBeDisabled();
  await expect(ed.getByLabel('Empresa')).toHaveValue(LOGAR.id);
  await ed.getByLabel('Status').selectOption('concluido');
  await ed.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_compromisso').length).toBe(3);
  expect(chamadas(registro, 'rpc/salvar_compromisso')[2].corpo).toMatchObject({ p_id: 'c1', p_id_empresa: LOGAR.id, p_status: 'concluido', p_visibilidade: 'compartilhado' });
  // Excluir o próprio
  await page.getByTestId('evento-compromisso-Estudo CRC').getByRole('button', { name: /Excluir/ }).click();
  await page.getByRole('dialog', { name: 'Excluir compromisso' }).getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect.poll(() => chamadas(registro, 'rpc/excluir_compromisso').length).toBe(1);
  expect(chamadas(registro, 'rpc/excluir_compromisso')[0].corpo).toEqual({ p_id: 'p1' });
  await ctx.close();
});

test('contador sem empresa com "Agenda compartilhada": só compromissos pessoais, com orientação; erro e indisponível', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await sessaoSimulada(ctx, rotas((c) => (c === 'rpc/painel_contador' ? { corpo: [{ ...painel[1] }] } : undefined)));
  const page = await abrir(ctx, '/contador/agenda', 'Agenda');
  await page.getByRole('button', { name: 'Novo compromisso' }).click();
  const m = page.getByRole('dialog', { name: 'Novo compromisso' });
  expect(await m.getByLabel('Empresa').locator('option').allTextContents()).toEqual(['Pessoal (só eu vejo)']);
  await expect(m).toContainText('ela precisa liberar a permissão "Agenda compartilhada"');
  await ctx.close();

  const ausente = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ausente, rotas((c) => (c === 'rpc/agenda_contador' ? { status: 404, corpo: { code: 'PGRST202', message: 'Could not find the function public.agenda_contador in the schema cache' } } : undefined)));
  const pa = await abrir(ausente, '/contador/agenda', 'Agenda');
  await expect(pa.getByTestId('agenda-indisponivel')).toContainText('falta aplicar uma atualização do banco', { timeout: 15000 });
  await ausente.close();

  const erro = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(erro, rotas((c) => (c === 'rpc/agenda_contador' ? { status: 500, corpo: { message: 'falha', code: 'XX000' } } : undefined)));
  const pe = await abrir(erro, '/contador/agenda', 'Agenda');
  await expect(pe.getByRole('alert').filter({ hasText: 'Não foi possível carregar a agenda.' })).toBeVisible({ timeout: 15000 });
  await erro.close();
});

test('empresário: opção "compartilhado com o contador" no compromisso', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, (c, u, req) => {
    if (c === 'perfis') return { corpo: [{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [{ empresas: { id: 'eeeeeeee-0000-4000-8000-000000000001', razao_social: 'EMPRESA EXEMPLO LTDA', nome_comercial: 'Empresa Exemplo', cnpj: '12345678000190', tipo_empresa: 'comum' } }] };
    if (c === 'rpc/agenda_eventos') return { corpo: [] };
    if (c === 'rpc/membros_agenda') return { corpo: [{ id_usuario: USUARIO_SIMULADO.id, nome: 'Ana Souza' }, { id_usuario: 'k1', nome: 'João da Silva (contador)' }] };
    if (c === 'rpc/salvar_compromisso') return { corpo: 'novo' };
    if (c === 'notificacoes') return { corpo: [] };
    return rotas()(c, u, req) && undefined;
  });
  const page = await abrir(ctx, '/app/agenda', 'Agenda');
  await page.getByRole('button', { name: 'Novo compromisso', exact: true }).click();
  const m = page.getByRole('dialog', { name: 'Novo compromisso' });
  expect(await m.getByLabel('Visibilidade').locator('option').allTextContents()).toEqual(['Privado (eu e o responsável)', 'Empresa (todos os membros)', 'Empresa e meu contador (compartilhado)']);
  await expect(m.getByLabel('Empresa', { exact: true })).toHaveCount(0); // seletor de empresa só no contador
  await m.getByLabel('Título').fill('Alinhamento mensal');
  await m.getByLabel('Visibilidade').selectOption('compartilhado');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_compromisso').length).toBe(1);
  expect(chamadas(registro, 'rpc/salvar_compromisso')[0].corpo).toMatchObject({ p_id_empresa: 'eeeeeeee-0000-4000-8000-000000000001', p_visibilidade: 'compartilhado' });
  await ctx.close();
});

test('Minhas empresas: clicar na linha abre a empresa certa (Logar Digital, UNNIFY); botões, teclado, filtros e paginação preservados', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx, '/contador/empresas', 'Minhas empresas');
  const linhaLogar = page.getByRole('row').filter({ hasText: 'Logar Digital' });
  const linhaUnnify = page.getByRole('row').filter({ hasText: 'UNNIFY' });
  await expect(linhaLogar).toBeVisible();
  // Clique em área da linha (coluna Cidade) → painel da empresa correta
  await linhaLogar.getByText('Augustinópolis').click();
  await expect(page).toHaveURL(new RegExp(`/contador/empresas/${LOGAR.id}$`), { timeout: 30000 });
  await page.goBack();
  await expect(linhaUnnify).toBeVisible();
  await linhaUnnify.getByText('Augustinópolis').click();
  await expect(page).toHaveURL(new RegExp(`/contador/empresas/${UNNIFY.id}$`), { timeout: 30000 });
  await page.goBack();
  // Botão de ação existente continua com a própria ação e NÃO navega
  await linhaLogar.getByRole('button', { name: /Encerrar vínculo com Logar Digital/ }).click();
  await expect(page.getByRole('dialog', { name: 'Encerrar vínculo' })).toBeVisible();
  await expect(page).toHaveURL(/\/contador\/empresas$/);
  await page.getByRole('dialog').getByRole('button', { name: 'Voltar' }).click();
  // Teclado: o nome é um link (Tab → Enter)
  const link = linhaUnnify.getByRole('link', { name: 'UNNIFY' });
  await expect(link).toHaveAttribute('href', `/contador/empresas/${UNNIFY.id}`);
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/contador/empresas/${UNNIFY.id}$`), { timeout: 30000 });
  await page.goBack();
  // Aparência: cursor de clique só em vínculo ativo
  expect(await linhaLogar.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
  const linhaPend = page.getByRole('row').filter({ hasText: 'Padaria Pendente' });
  expect(await linhaPend.evaluate((el) => getComputedStyle(el).cursor)).not.toBe('pointer');
  await expect(linhaPend.getByRole('link')).toHaveCount(0);
  await linhaPend.getByText('Augustinópolis').click();
  await expect(page).toHaveURL(/\/contador\/empresas$/);
  // Filtros e paginação continuam indo para o servidor
  await page.getByPlaceholder('Buscar por razão social, nome fantasia ou CNPJ...').fill('Logar');
  await expect.poll(() => chamadas(registro, 'rpc/empresas_do_contador').some((x) => (x.corpo as { p_busca: string }).p_busca === 'Logar')).toBe(true);
  await page.getByPlaceholder('Buscar por razão social, nome fantasia ou CNPJ...').fill('');
  await page.getByRole('combobox').first().selectOption('pendente');
  await expect.poll(() => chamadas(registro, 'rpc/empresas_do_contador').some((x) => (x.corpo as { p_status: string }).p_status === 'pendente')).toBe(true);
  await page.getByLabel('Itens por página').selectOption('20');
  await expect.poll(() => chamadas(registro, 'rpc/empresas_do_contador').some((x) => (x.corpo as { p_limite: number }).p_limite === 20)).toBe(true);
  // Nenhuma ação de vínculo foi disparada por cliques na linha (as POST bloqueadas são só leituras de outros blocos da página)
  expect(registro.escritasBloqueadas.filter((x) => /encerrar|responder|solicitar/.test(x))).toEqual([]);
  await ctx.close();
});

test('painel da empresa sem vínculo continua negando acesso; layout de 320 a 1920px (Agenda e Minhas empresas)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await sessaoSimulada(ctx, rotas((c) => (c === 'rpc/painel_contador' ? { corpo: [] } : undefined)));
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/contador/empresas/${LOGAR.id}`);
  await expect(pg.getByText('Você não tem acesso a esta empresa.')).toBeVisible({ timeout: 90000 });
  await ctx.close();

  const l = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await sessaoSimulada(l, rotas());
  for (const [rota, titulo] of [['/contador/agenda', 'Agenda'], ['/contador/empresas', 'Minhas empresas']] as const) {
    const p = await abrir(l, rota, titulo);
    await expect(p.getByText(rota === '/contador/agenda' ? 'Reunião de fechamento' : 'Logar Digital').first()).toBeVisible({ timeout: 15000 });
    for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
      await p.setViewportSize({ width: largura, height: 900 });
      await p.waitForTimeout(200);
      expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${rota} @${largura}`).toBeLessThanOrEqual(1);
    }
    await p.close();
  }
  await l.close();
});
