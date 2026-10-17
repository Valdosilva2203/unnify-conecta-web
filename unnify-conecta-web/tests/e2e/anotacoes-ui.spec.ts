import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// Anotações (interface) com a API do Supabase SIMULADA e ESTADO EM MEMÓRIA: nada é gravado no banco. Regras de acesso: tests/sql/anotacoes.mjs.
const BASE = 'http://localhost:3000';
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'ALFA LTDA', nome_comercial: 'Alfa', cnpj: '12345678000190', tipo_empresa: 'comum' };
const nota = (id: string, titulo: string, conteudo: string, categoria: string, atualizado: string, extra: Record<string, unknown> = {}) =>
  ({ id, titulo, conteudo, categoria, tags: [], fixada: false, criado_por: '11111111-1111-4111-8111-111111111111', atualizado_em: atualizado, ...extra });
const INICIAIS = () => [
  nota('n1', 'Reunião com contador', 'Discutimos a organização dos documentos fiscais.', 'reunioes', '2026-10-14T13:15:00Z'),
  nota('n2', 'Ideias para a empresa', '1. Melhorar o plano\n   - Estudar roteadores Wi-Fi 7\n2. Implementar app do cliente', 'empresa', '2026-10-15T17:30:00Z', { fixada: true, tags: ['Plano', 'App'] }),
  nota('n3', 'Planejamento pessoal', '- Estudar para concurso\n- Treino 4x na semana', 'pessoal', '2026-10-12T21:20:00Z'),
  nota('n4', 'Novos serviços', '- Monitoramento residencial\n- TV/OTT', 'ideias', '2026-10-10T12:40:00Z'),
];

function montar(estado: { notas: ReturnType<typeof INICIAIS>; recusar: boolean; seq: number }): Rotas {
  const corpo = (req: { postData: () => string | null }) => JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
  const ordenar = () => [...estado.notas].sort((a, b) => Number(b.fixada) - Number(a.fixada) || b.atualizado_em.localeCompare(a.atualizado_em));
  return (c, _u, req) => {
    if (c === 'perfis') return { corpo: [{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (c === 'anotacoes') return { corpo: ordenar() };
    if (c === 'rpc/salvar_anotacao') {
      if (estado.recusar) return { status: 400, corpo: { code: '23514', message: 'Informe o título (2 a 120 caracteres).', details: null, hint: null } };
      const b = corpo(req);
      const id = (b.p_id as string | null) ?? `novo-${++estado.seq}`;
      const existente = estado.notas.find((n) => n.id === id);
      const dados = { titulo: b.p_titulo as string, conteudo: b.p_conteudo as string, categoria: b.p_categoria as string, tags: b.p_tags as string[], atualizado_em: '2026-10-16T12:00:00Z' };
      if (existente) Object.assign(existente, dados); else estado.notas.push(nota(id, dados.titulo, dados.conteudo, dados.categoria, dados.atualizado_em, { tags: dados.tags }));
      return { corpo: id };
    }
    if (c === 'rpc/alternar_fixacao_anotacao') { const b = corpo(req); const n = estado.notas.find((x) => x.id === b.p_id); if (n) n.fixada = !!b.p_fixada; return { status: 204 }; }
    if (c === 'rpc/alterar_situacao_anotacao') { const b = corpo(req); const n = estado.notas.find((x) => x.id === b.p_id) as Record<string, unknown> | undefined; if (n) n.situacao = b.p_situacao; return { status: 204 }; }
    if (c === 'rpc/arquivar_anotacao') { const b = corpo(req); const n = estado.notas.find((x) => x.id === b.p_id) as Record<string, unknown> | undefined; if (n) { n.arquivada_em = b.p_arquivar ? '2026-10-17T12:00:00Z' : null; n.fixada = false; } return { status: 204 }; }
    if (c === 'rpc/excluir_anotacao') { const b = corpo(req); estado.notas = estado.notas.filter((x) => x.id !== b.p_id); return { status: 204 }; }
    if (c === 'notificacoes' || c === 'empresas') return { corpo: [] };
    return undefined;
  };
}
async function abrir(ctx: BrowserContext, largura = 1536): Promise<Page> {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: largura, height: 1000 });
  await page.goto(`${BASE}/app/anotacoes`);
  await expect(page.getByRole('heading', { level: 1, name: 'Anotações', exact: true })).toBeVisible({ timeout: 90000 });
  return page;
}
const chamadas = (r: { chamadas: { caminho: string; corpo: unknown }[] }, c: string) => r.chamadas.filter((x) => x.caminho === c);
const lista = (p: Page) => p.getByRole('list', { name: 'Lista de anotações' });

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('menu do Administrativo (Anotações antes de Agenda), cabeçalho, fixadas primeiro, busca e categorias', async ({ browser }) => {
  const ctx = await browser.newContext();
  const estado = { notas: INICIAIS(), recusar: false, seq: 0 };
  await sessaoSimulada(ctx, montar(estado));
  const page = await abrir(ctx);
  const barra = page.getByRole('navigation', { name: 'Módulos do departamento' });
  expect(await barra.getByRole('link').allTextContents()).toEqual(['Tarefas', 'Anotações', 'Agenda', 'Minha conta']);
  await expect(barra.getByRole('link', { name: 'Anotações' })).toHaveAttribute('aria-current', 'page');
  await expect(barra.getByRole('link', { name: 'Anotações' })).toHaveAttribute('href', '/app/anotacoes');
  await expect(page.getByText('Organize suas ideias, lembretes e informações importantes em um só lugar.')).toBeVisible();
  // Fixada primeiro, depois a mais recente
  await expect(lista(page).getByRole('listitem')).toHaveCount(4, { timeout: 30000 });
  expect(await lista(page).getByRole('listitem').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).toEqual(
    ['anotacao-Ideias para a empresa', 'anotacao-Reunião com contador', 'anotacao-Planejamento pessoal', 'anotacao-Novos serviços']);
  await expect(lista(page).getByTestId('anotacao-Ideias para a empresa').getByRole('button', { name: /^Desafixar/ })).toHaveAttribute('aria-pressed', 'true');
  // Busca (título e conteúdo, sem acento) e categorias
  await page.getByLabel('Pesquisar anotações').fill('roteadores');
  await expect(lista(page).getByRole('listitem')).toHaveCount(1);
  await page.getByLabel('Pesquisar anotações').fill('reuniao');
  await expect(lista(page).getByTestId('anotacao-Reunião com contador')).toBeVisible();
  await page.getByLabel('Pesquisar anotações').fill('');
  await page.getByRole('tab', { name: 'Reuniões' }).click();
  await expect(page.getByRole('tab', { name: 'Reuniões' })).toHaveClass(/bg-orange-600/);
  await expect(lista(page).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Outras' }).click();
  await expect(page.getByText('Nenhuma anotação com esses filtros.')).toBeVisible();
  await page.getByRole('tab', { name: 'Todas' }).click();
  // Alternador grade/lista
  await expect(page.getByRole('button', { name: 'Visualizar em grade' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Visualizar em lista' }).click();
  await expect(page.getByRole('button', { name: 'Visualizar em lista' })).toHaveAttribute('aria-pressed', 'true');
  await expect(lista(page).getByRole('listitem')).toHaveCount(4);
  await ctx.close();
});

test('painel lateral: conteúdo íntegro, trocar categoria, tags, fixar, fechar mantém busca e filtros', async ({ browser }) => {
  const ctx = await browser.newContext();
  const estado = { notas: INICIAIS(), recusar: false, seq: 0 };
  const registro = await sessaoSimulada(ctx, montar(estado));
  const page = await abrir(ctx);
  await page.getByLabel('Pesquisar anotações').fill('a');
  await page.getByRole('tab', { name: 'Empresa' }).click();
  await lista(page).getByRole('button', { name: 'Abrir Ideias para a empresa' }).click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da anotação' });
  await expect(painel.getByRole('heading', { name: 'Ideias para a empresa' })).toBeVisible();
  const texto = await painel.getByTestId('conteudo-anotacao').evaluate((e) => (e as HTMLElement).innerText);
  expect(texto).toBe('1. Melhorar o plano\n   - Estudar roteadores Wi-Fi 7\n2. Implementar app do cliente'); // quebras e recuo preservados
  await expect(painel.getByLabel('Categoria')).toHaveValue('empresa');
  await expect(painel.getByRole('list', { name: 'Tags da anotação' })).toContainText('Plano');
  await expect(lista(page).getByTestId('anotacao-Ideias para a empresa').locator('> div')).toHaveClass(/border-orange-400/);
  // trocar a categoria grava pelo banco com os demais campos intactos
  await painel.getByLabel('Categoria').selectOption('ideias');
  await expect.poll(() => chamadas(registro, 'rpc/salvar_anotacao').length).toBe(1);
  expect(chamadas(registro, 'rpc/salvar_anotacao')[0].corpo).toMatchObject({ p_id: 'n2', p_id_empresa: EMPRESA.id, p_titulo: 'Ideias para a empresa', p_categoria: 'ideias', p_tags: ['Plano', 'App'] });
  // tag nova
  await page.getByRole('tab', { name: 'Todas' }).click();
  await lista(page).getByRole('button', { name: 'Abrir Ideias para a empresa' }).click();
  await painel.getByRole('button', { name: 'Adicionar tag' }).click();
  await painel.getByLabel('Nova tag').fill('Wi-Fi 7');
  await page.keyboard.press('Enter');
  await expect.poll(() => (chamadas(registro, 'rpc/salvar_anotacao').at(-1)!.corpo as { p_tags: string[] }).p_tags).toEqual(['Plano', 'App', 'Wi-Fi 7']);
  await painel.getByRole('button', { name: 'Remover a tag App' }).click();
  await expect.poll(() => (chamadas(registro, 'rpc/salvar_anotacao').at(-1)!.corpo as { p_tags: string[] }).p_tags).toEqual(['Plano', 'Wi-Fi 7']);
  // fixar/desafixar pelo painel
  await painel.getByRole('button', { name: 'Desafixar anotação' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/alternar_fixacao_anotacao').at(-1)?.corpo).toEqual({ p_id: 'n2', p_fixada: false });
  // outra anotação atualiza o painel; fechar volta à lista sem perder busca/filtros
  await lista(page).getByRole('button', { name: 'Abrir Novos serviços' }).click();
  await expect(painel.getByRole('heading', { name: 'Novos serviços' })).toBeVisible();
  await page.getByLabel('Pesquisar anotações').fill('serviços');
  await painel.getByRole('button', { name: 'Fechar detalhes' }).click();
  await expect(painel).toHaveCount(0);
  await expect(page.getByLabel('Pesquisar anotações')).toHaveValue('serviços');
  await expect(lista(page).getByRole('listitem')).toHaveCount(1);
  await ctx.close();
});

test('criar com validação e listas, editar, fixar pelo menu, excluir com confirmação e erro do banco', async ({ browser }) => {
  const ctx = await browser.newContext();
  const estado = { notas: INICIAIS(), recusar: false, seq: 0 };
  const registro = await sessaoSimulada(ctx, montar(estado));
  const page = await abrir(ctx);
  await page.getByRole('tab', { name: 'Reuniões' }).click(); // a categoria do filtro vira o padrão do formulário
  await page.getByRole('button', { name: 'Nova anotação' }).click();
  const d = page.getByRole('dialog', { name: 'Nova anotação' });
  await expect(d.getByLabel('Categoria')).toHaveValue('reunioes');
  await d.getByRole('button', { name: 'Salvar anotação' }).click();
  await expect(d.getByRole('alert')).toHaveText('Informe o título (mínimo 2 caracteres).');
  await d.getByLabel('Título').fill('Pauta da semana');
  await d.getByRole('button', { name: 'Salvar anotação' }).click();
  await expect(d.getByRole('alert')).toHaveText('Escreva o conteúdo da anotação.');
  expect(chamadas(registro, 'rpc/salvar_anotacao')).toHaveLength(0); // validação local: nada é enviado
  await d.getByLabel('Conteúdo').fill('Revisar metas\nAlinhar processos');
  await d.getByLabel('Conteúdo').press('Control+a');
  await d.getByRole('button', { name: 'Lista numerada', exact: true }).click();
  await expect(d.getByLabel('Conteúdo')).toHaveValue('1. Revisar metas\n2. Alinhar processos');
  await d.getByRole('button', { name: 'Lista numerada', exact: true }).click(); // de novo: remove
  await d.getByLabel('Conteúdo').press('Control+a');
  await d.getByRole('button', { name: 'Lista', exact: true }).click();
  await expect(d.getByLabel('Conteúdo')).toHaveValue('- Revisar metas\n- Alinhar processos');
  await d.getByRole('textbox', { name: /^Tags/ }).fill('Equipe, mensal,equipe');
  await d.getByRole('button', { name: 'Salvar anotação' }).click();
  await expect(page.getByText('Anotação criada.')).toBeVisible({ timeout: 15000 });
  expect(chamadas(registro, 'rpc/salvar_anotacao')[0].corpo).toEqual({ p_id: null, p_id_empresa: EMPRESA.id, p_titulo: 'Pauta da semana', p_conteudo: '- Revisar metas\n- Alinhar processos', p_categoria: 'reunioes', p_tags: ['Equipe', 'mensal'] });
  await expect(page.getByRole('complementary', { name: 'Detalhes da anotação' }).getByRole('heading', { name: 'Pauta da semana' })).toBeVisible(); // abre a nova no painel
  // editar
  await page.getByRole('complementary', { name: 'Detalhes da anotação' }).getByRole('button', { name: 'Editar anotação' }).click();
  const e = page.getByRole('dialog', { name: 'Editar anotação' });
  await expect(e.getByLabel('Título')).toHaveValue('Pauta da semana');
  await e.getByLabel('Título').fill('Pauta revisada');
  await e.getByRole('button', { name: 'Salvar anotação' }).click();
  await expect(page.getByText('Anotação atualizada.')).toBeVisible({ timeout: 15000 });
  expect(chamadas(registro, 'rpc/salvar_anotacao').at(-1)!.corpo).toMatchObject({ p_id: 'novo-1', p_titulo: 'Pauta revisada' });
  // fixar pelo menu de três pontos
  await lista(page).getByTestId('anotacao-Pauta revisada').getByRole('button', { name: 'Ações de Pauta revisada' }).click();
  await page.getByRole('menuitem', { name: 'Fixar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/alternar_fixacao_anotacao').at(-1)?.corpo).toEqual({ p_id: 'novo-1', p_fixada: true });
  // excluir: cancelar não chama o banco; erro do banco aparece e a anotação continua; depois exclui
  await lista(page).getByTestId('anotacao-Pauta revisada').getByRole('button', { name: 'Ações de Pauta revisada' }).click();
  await page.getByRole('menuitem', { name: 'Excluir' }).click();
  const x = page.getByRole('dialog', { name: 'Excluir anotação' });
  await x.getByRole('button', { name: 'Cancelar' }).click();
  expect(chamadas(registro, 'rpc/excluir_anotacao')).toHaveLength(0);
  await lista(page).getByTestId('anotacao-Pauta revisada').getByRole('button', { name: 'Ações de Pauta revisada' }).click();
  await page.getByRole('menuitem', { name: 'Excluir' }).click();
  await x.getByRole('button', { name: 'Excluir anotação' }).click();
  await expect(page.getByText('Anotação excluída.')).toBeVisible({ timeout: 15000 });
  expect(chamadas(registro, 'rpc/excluir_anotacao').at(-1)!.corpo).toEqual({ p_id: 'novo-1' });
  await expect(lista(page).getByTestId('anotacao-Pauta revisada')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Detalhes da anotação' })).toHaveCount(0); // a excluída não fica aberta
  // erro do banco ao salvar aparece no formulário e nada muda
  estado.recusar = true;
  await page.getByRole('button', { name: 'Nova anotação' }).click();
  await d.getByLabel('Título').fill('Com erro');
  await d.getByLabel('Conteúdo').fill('texto');
  await d.getByRole('button', { name: 'Salvar anotação' }).click();
  await expect(d.getByRole('alert')).toContainText('Informe o título');
  await ctx.close();
});

test('telas menores usam gaveta; layout de 320 a 1920px sem rolagem lateral; texto é exibido como texto (sem HTML)', async ({ browser }) => {
  const ctx = await browser.newContext();
  const estado = { notas: [...INICIAIS(), nota('n9', '<img src=x onerror=alert(1)>', '<script>window.__xss = 1</script>', 'outras', '2026-10-01T10:00:00Z')], recusar: false, seq: 0 };
  await sessaoSimulada(ctx, montar(estado));
  const page = await abrir(ctx, 1024);
  await lista(page).getByRole('button', { name: 'Abrir Reunião com contador' }).click();
  const gaveta = page.getByRole('dialog', { name: 'Anotação' });
  await expect(gaveta.getByRole('heading', { name: 'Reunião com contador' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(gaveta).toHaveCount(0);
  await lista(page).getByRole('button', { name: /^Abrir <img/ }).click();
  await expect(gaveta.getByTestId('conteudo-anotacao')).toHaveText('<script>window.__xss = 1</script>');
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await expect(page.locator('main img[src="x"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `lista @${largura}`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole('button', { name: 'Nova anotação' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await ctx.close();
});

test('situação e arquivo: iniciar, concluir, reabrir, cancelar, arquivar e ver arquivadas', async ({ browser }) => {
  const ctx = await browser.newContext();
  const estado = { notas: INICIAIS(), recusar: false, seq: 0 };
  const reg = await sessaoSimulada(ctx, montar(estado));
  const page = await abrir(ctx);
  const primeira = estado.notas[0];
  await page.getByRole('button', { name: `Abrir ${primeira.titulo}` }).first().click();
  const acoes = page.getByTestId('acoes-anotacao');
  await acoes.getByRole('button', { name: 'Iniciar' }).click();
  await expect(page.getByText('Anotação em andamento.')).toBeVisible();
  expect(chamadas(reg, 'rpc/alterar_situacao_anotacao').at(-1)!.corpo).toEqual({ p_id: primeira.id, p_situacao: 'em_andamento' });
  await expect(acoes.getByRole('button', { name: 'Iniciar' })).toHaveCount(0);
  await acoes.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByText('Anotação concluída.')).toBeVisible();
  await expect(acoes.getByRole('button', { name: 'Reabrir' })).toBeVisible();
  await acoes.getByRole('button', { name: 'Reabrir' }).click();
  await acoes.getByRole('button', { name: 'Cancelar anotação' }).click();
  await expect(page.getByText('Anotação cancelada.')).toBeVisible();
  expect(chamadas(reg, 'rpc/alterar_situacao_anotacao').map((x) => (x.corpo as { p_situacao: string }).p_situacao)).toEqual(['em_andamento', 'concluida', 'pendente', 'cancelada']);
  await acoes.getByRole('button', { name: 'Arquivar' }).click();
  await expect(page.getByText('Anotação arquivada.')).toBeVisible();
  await expect(lista(page).getByText(primeira.titulo)).toHaveCount(0); // some da lista normal
  await page.getByRole('button', { name: 'Arquivadas' }).click();
  await expect(lista(page).getByText(primeira.titulo)).toBeVisible();
  await page.getByRole('button', { name: `Abrir ${primeira.titulo}` }).first().click();
  await expect(acoes.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await acoes.getByRole('button', { name: 'Desarquivar' }).click();
  await expect(page.getByText('Anotação desarquivada.')).toBeVisible();
  expect(chamadas(reg, 'rpc/arquivar_anotacao').map((x) => (x.corpo as { p_arquivar: boolean }).p_arquivar)).toEqual([true, false]);
  await ctx.close();
});
