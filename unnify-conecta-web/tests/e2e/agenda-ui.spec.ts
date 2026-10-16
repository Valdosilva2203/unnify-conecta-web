import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, USUARIO_SIMULADO, type Rotas } from './apoio/sessao-simulada';

// Agenda com a API do Supabase SIMULADA (não acessa banco). Regras de banco (privacidade, isolamento, contador, fuso,
// sincronização de status, CRUD) em tests/sql/agenda.mjs.
const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'EMPRESA EXEMPLO LTDA', nome_comercial: 'Empresa Exemplo', cnpj: '12345678000190', tipo_empresa: 'comum' };
const dia = (h: string) => `${hoje}T${h}:00-03:00`;
const proximoDia = new Date(Date.parse(`${hoje}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
const base = { descricao: null, local: null, dia_inteiro: false, id_responsavel: USUARIO_SIMULADO.id, responsavel_nome: 'Ana Souza', visibilidade: null, valor: null };
const EVENTOS = [
  { ...base, origem: 'compromisso', id: 'c1', titulo: 'Reunião com cliente', local: 'Escritório / Online', inicio: dia('09:00'), fim: dia('10:00'), categoria: 'reuniao', status: 'confirmado', status_origem: 'confirmado', visibilidade: 'empresa', link: '/app/agenda', editavel: true },
  { ...base, origem: 'tarefa', id: 't1', titulo: 'Enviar notas fiscais', inicio: dia('10:30'), fim: dia('11:00'), categoria: 'tarefa', status: 'pendente', status_origem: 'pendente', link: '/app/tarefas', editavel: false },
  { ...base, origem: 'obrigacao', id: 'o1', titulo: 'DAS Simples Nacional', inicio: dia('00:00'), fim: `${proximoDia}T00:00:00-03:00`, dia_inteiro: true, categoria: 'obrigacao', status: 'pendente', status_origem: 'pendente', link: '/app/obrigacoes', editavel: false },
  { ...base, origem: 'financeiro', id: 'l1', titulo: 'Pagar: Internet', inicio: dia('00:00'), fim: `${proximoDia}T00:00:00-03:00`, dia_inteiro: true, categoria: 'pagar', status: 'pendente', status_origem: 'pendente', valor: 150, responsavel_nome: null, id_responsavel: null, link: '/app/financeiro#pagar', editavel: false },
];

function rotas(extra?: Rotas): Rotas {
  return (c, u, req) => {
    const e = extra?.(c, u, req);
    if (e) return e;
    if (c === 'perfis') return { corpo: [{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (c === 'rpc/agenda_eventos') return { corpo: EVENTOS };
    if (c === 'rpc/membros_agenda') return { corpo: [{ id_usuario: USUARIO_SIMULADO.id, nome: 'Ana Souza' }, { id_usuario: 'u2', nome: 'Bruno Sócio' }] };
    if (c === 'rpc/salvar_compromisso') return { corpo: 'novo' };
    if (c === 'rpc/excluir_compromisso' || c === 'rpc/alterar_status_tarefa' || c === 'rpc/alterar_situacao_obrigacao') return { status: 204 };
    if (c === 'notificacoes') return { corpo: [] };
    return undefined;
  };
}
async function abrir(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/agenda`);
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible({ timeout: 90000 });
  return page;
}
const chamadas = (r: { chamadas: { caminho: string; corpo: unknown }[] }, c: string) => r.chamadas.filter((x) => x.caminho === c);

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('mês: eventos das 4 origens no dia, indicadores, filtros e acesso ao registro original', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await expect(page.getByRole('navigation', { name: 'Módulos do departamento' }).getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/app/agenda');
  await expect(page.getByTestId(`dia-${hoje}`)).toContainText('DAS Simples Nacional'); // dia inteiro primeiro; demais no "+2"
  await expect(page.getByTestId(`dia-${hoje}`)).toContainText('+2');
  const dia = page.getByTestId('itens-do-dia');
  await expect(dia.locator('li')).toHaveCount(4);
  await expect(page.getByTestId('evento-compromisso-Reunião com cliente')).toContainText('09:00 - 10:00');
  await expect(page.getByTestId('evento-compromisso-Reunião com cliente')).toContainText('Confirmado');
  await expect(page.getByTestId('evento-financeiro-Pagar: Internet')).toContainText('R$ 150,00');
  await expect(page.getByTestId('evento-financeiro-Pagar: Internet').getByRole('link', { name: /Abrir vencimento/ })).toHaveAttribute('href', '/app/financeiro#pagar');
  await expect(page.getByTestId('evento-obrigacao-DAS Simples Nacional').getByRole('link')).toHaveAttribute('href', '/app/obrigacoes');
  // Itens de outros módulos não são editados aqui (só pelo módulo de origem)
  await expect(page.getByTestId('evento-tarefa-Enviar notas fiscais').getByRole('button', { name: /Editar/ })).toHaveCount(0);
  // Indicadores do mês
  for (const [t, v] of [['Compromissos este mês', '1'], ['Tarefas pendentes', '1'], ['Obrigações este mês', '1'], ['Vencimentos este mês', '1']]) {
    await expect(page.getByRole('region', { name: t })).toContainText(v);
  }
  // Filtro por origem
  await page.getByLabel('Filtrar por origem').selectOption('tarefa');
  await expect(dia.locator('li')).toHaveCount(1);
  await page.getByLabel('Filtrar por origem').selectOption('');
  // Sincronização: concluir tarefa usa a função do módulo de tarefas
  await page.getByTestId('evento-tarefa-Enviar notas fiscais').getByRole('button', { name: 'Concluir' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/alterar_status_tarefa').length).toBe(1);
  expect(chamadas(registro, 'rpc/alterar_status_tarefa')[0].corpo).toMatchObject({ p_id: 't1', p_status: 'concluida' });
  // Período consultado = grade do mês (42 dias)
  const corpo = chamadas(registro, 'rpc/agenda_eventos')[0].corpo as { p_inicio: string; p_fim: string; p_id_empresa: string };
  expect(corpo.p_id_empresa).toBe(EMPRESA.id);
  expect((Date.parse(corpo.p_fim) - Date.parse(corpo.p_inicio)) / 86400000).toBe(41);
  await ctx.close();
});

test('CRUD de compromisso: criar com fuso de São Paulo, editar e excluir', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await page.getByRole('button', { name: 'Novo compromisso' }).first().click();
  const modal = page.getByRole('dialog', { name: 'Novo compromisso' });
  await modal.getByRole('button', { name: 'Salvar' }).click();
  await expect(modal.getByRole('alert')).toContainText('título');
  await modal.getByLabel('Título').fill('Planejamento semanal');
  await modal.getByLabel('Hora de início').fill('16:00');
  await modal.getByLabel('Hora de término').fill('15:00');
  await modal.getByRole('button', { name: 'Salvar' }).click();
  await expect(modal.getByRole('alert')).toContainText('término deve ser depois');
  await modal.getByLabel('Hora de término').fill('17:00');
  await modal.getByLabel('Visibilidade').selectOption('empresa');
  await modal.getByLabel('Responsável').selectOption('u2');
  await modal.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_compromisso').length).toBe(1);
  expect(chamadas(registro, 'rpc/salvar_compromisso')[0].corpo).toMatchObject({
    p_id: null, p_id_empresa: EMPRESA.id, p_titulo: 'Planejamento semanal', p_inicio: `${hoje}T16:00:00-03:00`, p_fim: `${hoje}T17:00:00-03:00`,
    p_categoria: 'reuniao', p_visibilidade: 'empresa', p_id_responsavel: 'u2', p_dia_inteiro: false });
  await expect(page.getByRole('status').filter({ hasText: 'Compromisso criado.' })).toBeVisible();
  // Editar: abre com os dados atuais (horário convertido para São Paulo)
  await page.getByRole('button', { name: 'Editar Reunião com cliente' }).click();
  const edicao = page.getByRole('dialog', { name: 'Editar compromisso' });
  await expect(edicao.getByLabel('Título')).toHaveValue('Reunião com cliente');
  await expect(edicao.getByLabel('Hora de início')).toHaveValue('09:00');
  await edicao.getByLabel('Status').selectOption('concluido');
  await edicao.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_compromisso').length).toBe(2);
  expect(chamadas(registro, 'rpc/salvar_compromisso')[1].corpo).toMatchObject({ p_id: 'c1', p_status: 'concluido' });
  // Excluir
  await page.getByRole('button', { name: 'Excluir Reunião com cliente' }).click();
  await page.getByRole('dialog', { name: 'Excluir compromisso' }).getByRole('button', { name: 'Excluir' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/excluir_compromisso').length).toBe(1);
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('semana e lista; estados de vazio, erro e banco sem a migration', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await page.getByRole('tab', { name: 'Semana' }).click();
  await expect(page.getByTestId('grade-semana')).toContainText('Reunião com cliente');
  const sem = chamadas(registro, 'rpc/agenda_eventos').at(-1)!.corpo as { p_inicio: string; p_fim: string };
  expect((Date.parse(sem.p_fim) - Date.parse(sem.p_inicio)) / 86400000).toBe(6);
  await page.getByRole('tab', { name: 'Lista' }).click();
  await expect(page.getByTestId('lista-agenda')).toContainText('DAS Simples Nacional');
  await ctx.close();

  const vazio = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(vazio, rotas((c) => (c === 'rpc/agenda_eventos' ? { corpo: [] } : undefined)));
  const pv = await abrir(vazio);
  await expect(pv.getByText('Nenhum compromisso, tarefa, obrigação ou vencimento neste dia.')).toBeVisible({ timeout: 15000 });
  await expect(pv.getByRole('region', { name: 'Compromissos este mês' })).toContainText('0');
  await vazio.close();

  const erro = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(erro, rotas((c) => (c === 'rpc/agenda_eventos' ? { status: 500, corpo: { message: 'falha', code: 'XX000' } } : undefined)));
  const pe = await abrir(erro);
  await expect(pe.getByRole('alert').filter({ hasText: 'Não foi possível carregar a agenda.' })).toBeVisible({ timeout: 15000 });
  await expect(pe.getByRole('region', { name: 'Compromissos este mês' })).toContainText('—'); // erro não vira 0
  await erro.close();

  const ausente = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ausente, rotas((c) => (c === 'rpc/agenda_eventos' ? { status: 404, corpo: { code: 'PGRST202', message: 'Could not find the function public.agenda_eventos in the schema cache' } } : undefined)));
  const pa = await abrir(ausente);
  await expect(pa.getByTestId('agenda-indisponivel')).toContainText('falta aplicar uma atualização do banco', { timeout: 15000 });
  await ausente.close();
});

test('layout sem rolagem lateral de 320 a 1920px (mês e formulário)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await expect(page.getByTestId('grade-mes')).toBeVisible();
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `@${largura}`).toBeLessThanOrEqual(1);
  }
  await page.getByRole('button', { name: 'Novo compromisso' }).first().click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await ctx.close();
});
