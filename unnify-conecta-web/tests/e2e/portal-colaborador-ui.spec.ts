import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { SUPABASE, USUARIO_SIMULADO, sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// Portal do Colaborador + Controle de Ponto com a API do Supabase SIMULADA (nada é gravado no banco).
// Regras de banco (convite, vínculo, isolamento/IDOR, imutabilidade, apuração, conferência e integração) em tests/sql/portal-colaborador.mjs.
const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const comp = `${hoje.slice(0, 7)}-01`;
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'EMPRESA EXEMPLO LTDA', nome_comercial: 'Empresa Exemplo', cnpj: '12345678000190', tipo_empresa: 'comum' };
const VINCULO = { id_funcionario: 'f2', id_empresa: EMPRESA.id, empresa: 'Empresa Exemplo', nome: 'Denilson Amorim', cargo: 'Técnico', vinculo: 'clt', data_admissao: '2023-03-10', matricula: 2, email: 'simulado@exemplo.test' };
const ESCALA = { 0: [], 1: [['08:00', '12:00'], ['13:00', '17:00']], 2: [['08:00', '12:00'], ['13:00', '17:00']], 3: [['08:00', '12:00'], ['13:00', '17:00']], 4: [['08:00', '12:00'], ['13:00', '17:00']], 5: [['08:00', '12:00'], ['13:00', '17:00']], 6: [] };
const DIA = (data: string, extra: object = {}) => ({ data, previsto: '08:00–12:00 · 13:00–17:00', registrado: '08:00 · 12:00 · 13:00 · 19:00', previsto_minutos: 480, trabalhado_minutos: 600,
  excedente_minutos: 120, atraso_minutos: 0, ausencia: false, incompleta: false, intervalo_inconsistente: false, nao_previsto: false, feriado: false, em_andamento: false,
  id_apuracao: 'ap1', situacao: 'apurada', pedido_esclarecimento: null, resposta_colaborador: null, ...extra });
const ontem = new Date(Date.parse(`${hoje}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
const JORNADA = { jornada: { vigente_desde: comp, escala: ESCALA, tolerancia_minutos: 10, intervalo_minimo_minutos: 60 }, proximos_feriados: [{ data: '2026-11-15', descricao: 'Proclamação da República' }],
  dias: [DIA(ontem, { situacao: 'esclarecimento', pedido_esclarecimento: 'Por que ficou até 19h?' })] };

function rotasPortal(extra?: Rotas, vinculos: unknown[] = [VINCULO]): Rotas {
  return (c, u, req) => {
    const e = extra?.(c, u, req);
    if (e) return e;
    if (c === 'rpc/portal_colaborador') return { corpo: vinculos };
    if (c === 'rpc/meu_ponto') return { corpo: [] };
    if (c === 'rpc/minha_jornada') return { corpo: JORNADA };
    if (c === 'rpc/minhas_solicitacoes_ponto') return { corpo: [] };
    if (c === 'rpc/meus_holerites') return { corpo: [{ id: 'h1', competencia: '2026-09-01', nome_arquivo: 'holerite-set.pdf', caminho: `${EMPRESA.id}/x.pdf`, enviado_em: '2026-10-05T10:00:00Z' }] };
    if (c === 'auth/factors' || c.startsWith('auth/')) return { corpo: {} };
    return undefined;
  };
}
const chamadas = (r: { chamadas: { caminho: string; corpo: unknown }[] }, c: string) => r.chamadas.filter((x) => x.caminho === c);
const semRolagemLateral = async (p: Page) => expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

// ===== Fase 1 — Ativação =====
async function semSessao(ctx: BrowserContext, rotas: Rotas) {
  const registro = { chamadas: [] as { caminho: string; corpo: unknown }[] };
  const agora = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USUARIO_SIMULADO.id, role: 'authenticated', aal: 'aal1', exp: agora + 3600, iat: agora })}.${b64('x')}`;
  await ctx.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request();
    const caminho = new URL(req.url()).pathname.replace('/rest/v1/', '').replace('/auth/v1/', 'auth/');
    let corpo: unknown = null;
    try { corpo = JSON.parse(req.postData() ?? 'null'); } catch { corpo = null; }
    registro.chamadas.push({ caminho, corpo });
    if (caminho === 'auth/token') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: agora + 3600, refresh_token: 'r', user: USUARIO_SIMULADO }) });
    if (caminho === 'auth/user') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USUARIO_SIMULADO) });
    const r = rotas(caminho, new URL(req.url()), req);
    if (r) return route.fulfill({ status: r.status ?? 200, contentType: 'application/json', body: r.corpo === undefined ? '' : JSON.stringify(r.corpo) });
    if (req.method() !== 'GET') return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  return registro;
}
const CONVITE = { situacao: 'valido', nome: 'Denilson', empresa: 'Empresa Exemplo', email: 'simulado@exemplo.test', expira_em: '2026-10-23T10:00:00Z' };
const TOKEN = 'A'.repeat(43);

test('ativação: colaborador define a própria senha (requisitos), conta criada no servidor, vínculo pela sessão dele e entra no portal', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const reg = await semSessao(ctx, rotasPortal((c) => {
    if (c === 'rpc/dados_convite_colaborador') return { corpo: [CONVITE] };
    if (c === 'rpc/aceitar_convite_colaborador') return { corpo: 'f2' };
    return undefined;
  }));
  const page = await ctx.newPage();
  const ativacoes: unknown[] = [];
  await page.route('**/api/colaborador/ativar', async (r) => { ativacoes.push(JSON.parse(r.request().postData() ?? '{}')); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ email: CONVITE.email }) }); });
  await page.goto(`${BASE}/colaborador/ativar#${TOKEN}`);
  await expect(page.getByRole('heading', { name: 'Bem-vindo(a)!' })).toBeVisible({ timeout: 90000 });
  expect(page.url()).not.toContain(TOKEN); // token sai da barra de endereço
  await expect(page.getByLabel('E-mail')).toHaveValue(CONVITE.email);
  await expect(page.getByLabel('E-mail')).not.toBeEditable();
  await page.getByLabel('Nova senha', { exact: true }).fill('fraca');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.locator('p[role="alert"]')).toHaveText('A senha não atende a todos os requisitos.');
  await page.getByLabel('Nome completo').fill('Denilson Amorim');
  await page.getByLabel('Nova senha', { exact: true }).fill('Senha@Forte1');
  await page.getByLabel('Confirmar nova senha').fill('Senha@Forte2');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.locator('p[role="alert"]')).toHaveText('As senhas não conferem.');
  await expect(page.getByRole('list', { name: 'Requisitos da senha' })).toContainText('Um caractere especial (atendido)');
  await page.getByLabel('Confirmar nova senha').fill('Senha@Forte1');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Denilson!' })).toBeVisible({ timeout: 60000 });
  expect(ativacoes).toEqual([{ token: TOKEN, senha: 'Senha@Forte1', nome: 'Denilson Amorim' }]);
  expect(chamadas(reg, 'rpc/aceitar_convite_colaborador')[0].corpo).toEqual({ p_token: TOKEN });
  await semRolagemLateral(page);
  await ctx.close();
});

test('ativação: convite expirado, e-mail já cadastrado e conta logada de outro e-mail', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let situacao = 'expirado';
  await semSessao(ctx, rotasPortal((c) => (c === 'rpc/dados_convite_colaborador' ? { corpo: [situacao === 'valido' ? CONVITE : { situacao, nome: null, empresa: null, email: null, expira_em: null }] } : undefined)));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/colaborador/ativar#${TOKEN}`);
  await expect(page.getByRole('heading', { name: 'Convite indisponível' })).toBeVisible({ timeout: 90000 });
  await expect(page.getByText('Este convite expirou. Peça um novo ao RH da empresa.')).toBeVisible();
  situacao = 'valido';
  await page.route('**/api/colaborador/ativar', (r) => r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ conta_existente: true }) }));
  await page.goto('about:blank');
  await page.goto(`${BASE}/colaborador/ativar#${TOKEN}`);
  await page.getByLabel('Nova senha', { exact: true }).fill('Senha@Forte1');
  await page.getByLabel('Confirmar nova senha').fill('Senha@Forte1');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.getByRole('heading', { name: 'Você já tem uma conta' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Esqueci minha senha' })).toBeVisible();
  await ctx.close();
  // Sessão de outra conta: não ativa, pede para sair
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ctx2, rotasPortal((c) => (c === 'rpc/dados_convite_colaborador' ? { corpo: [{ ...CONVITE, email: 'outra.pessoa@exemplo.test' }] } : undefined)));
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/colaborador/ativar#${TOKEN}`);
  await expect(p2.getByText('Você está conectado com outra conta (simulado@exemplo.test).', { exact: false })).toBeVisible({ timeout: 90000 });
  await expect(p2.getByRole('button', { name: 'Ativar meu acesso' })).toHaveCount(0);
  await ctx2.close();
});

// ===== Fase 2 — Portal e isolamento =====
test('portal: início, cadastro somente leitura, holerites, sessão expirada e sem acesso', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const reg = await sessaoSimulada(ctx, rotasPortal((c) => (c === `storage/v1/object/sign/folha/${EMPRESA.id}/x.pdf` ? { corpo: { signedURL: '/object/sign/folha/x.pdf?token=t' } } : undefined)));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/colaborador`);
  await expect(page.getByRole('heading', { name: 'Olá, Denilson!' })).toBeVisible({ timeout: 90000 });
  await expect(page.getByText('Técnico · Empresa Exemplo')).toBeVisible();
  await expect(page.getByText('Vínculo ativo')).toBeVisible();
  await semRolagemLateral(page);
  await page.getByRole('navigation', { name: 'Navegação do portal' }).last().getByRole('link', { name: 'Cadastro' }).click();
  await expect(page.getByTestId('dados-cadastro')).toContainText('Matrícula2');
  await expect(page.getByTestId('dados-cadastro')).not.toContainText('Salário');
  await expect(page.locator('input')).toHaveCount(0); // nada editável
  await page.getByRole('navigation', { name: 'Navegação do portal' }).last().getByRole('link', { name: 'Documentos' }).click();
  await expect(page.getByTestId('holerites')).toContainText('Holerite – Setembro de 2026');
  await page.getByRole('button', { name: 'Baixar holerite de Setembro de 2026' }).click();
  await expect.poll(() => reg.chamadas.some((x) => x.caminho.includes('storage/v1/object/sign/folha/'))).toBe(true);
  expect(reg.escritasBloqueadas.filter((x) => !x.includes('storage/v1/object/sign'))).toEqual([]);
  await ctx.close();
  // Sem vínculo ativo (revogado/desligado): nada da empresa aparece
  const ctx2 = await browser.newContext();
  await sessaoSimulada(ctx2, rotasPortal(undefined, []));
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/colaborador/ponto`);
  await expect(p2.getByRole('heading', { name: 'Acesso não disponível' })).toBeVisible({ timeout: 90000 });
  await ctx2.close();
  // Sem sessão
  const ctx3 = await browser.newContext();
  await semSessao(ctx3, rotasPortal());
  const p3 = await ctx3.newPage();
  await p3.goto(`${BASE}/colaborador/jornada`);
  await expect(p3.getByRole('heading', { name: 'Sessão expirada' })).toBeVisible({ timeout: 90000 });
  await ctx3.close();
});

test('rotas administrativas: conta só de colaborador que abre /app vai para o portal', async ({ browser }) => {
  const ctx = await browser.newContext();
  await sessaoSimulada(ctx, rotasPortal((c) => {
    if (c === 'perfis') return { corpo: [{ nome_completo: 'Denilson', tipo_usuario: null, funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [], total: 0 };
    return undefined;
  }));
  const page = await ctx.newPage();
  await page.route('**/api/auth/check-role', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ role: 'user' }) }));
  await page.goto(`${BASE}/app/funcionarios`);
  await page.waitForURL('**/colaborador', { timeout: 90000 });
  await expect(page.getByRole('heading', { name: 'Olá, Denilson!' })).toBeVisible({ timeout: 60000 });
  await ctx.close();
});

// ===== Fase 3 — Registro de ponto =====
test('ponto: GPS capturado, câmera indisponível sem bloquear, mesmo id na nova tentativa e toque duplo protegido', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['geolocation'], geolocation: { latitude: -5.4653, longitude: -47.8819, accuracy: 8 } });
  let tentativas = 0;
  const reg = await sessaoSimulada(ctx, rotasPortal((c) => {
    if (c === 'rpc/registrar_marcacao_ponto') {
      tentativas += 1;
      return tentativas === 1 ? { status: 503, corpo: { message: 'falha de rede' } } : { corpo: [{ id: 'm1', registrado_em: new Date().toISOString(), data_local: hoje, duplicada: false }] };
    }
    return undefined;
  }));
  const page = await ctx.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => Promise.reject(new DOMException('sem câmera', 'NotFoundError')) } }); });
  await page.goto(`${BASE}/colaborador/ponto`);
  await expect(page.getByRole('heading', { name: 'Meu ponto' })).toBeVisible({ timeout: 90000 });
  await page.getByRole('button', { name: 'Registrar ponto' }).click();
  const d = page.getByRole('dialog', { name: 'Registrar ponto' });
  await expect(d.getByLabel('Tipo de marcação')).toHaveValue('entrada');
  await expect(d.getByTestId('foto-marcacao')).toContainText('Câmera indisponível. A marcação será registrada sem foto');
  await expect(d.getByTestId('local-marcacao')).toContainText('Localização obtida (precisão de 8 m)');
  await d.getByRole('button', { name: 'Registrar entrada' }).click();
  await expect(d.getByRole('alert')).toBeVisible();
  await d.getByRole('button', { name: 'Registrar entrada' }).click();
  await expect(page.getByText(/Entrada registrada às \d\d:\d\d\./)).toBeVisible();
  const envios = chamadas(reg, 'rpc/registrar_marcacao_ponto').map((x) => x.corpo as Record<string, unknown>);
  expect(envios).toHaveLength(2);
  expect(envios[0].p_id).toBe(envios[1].p_id); // nova tentativa não duplica
  expect(envios[1]).toMatchObject({ p_id_funcionario: 'f2', p_tipo: 'entrada', p_situacao_localizacao: 'capturada', p_latitude: -5.4653, p_longitude: -47.8819, p_precisao: 8, p_situacao_foto: 'indisponivel' });
  expect(Object.keys(envios[1])).not.toContain('p_registrado_em'); // hora vem do servidor
  expect(chamadas(reg, 'rpc/anexar_foto_marcacao')).toHaveLength(0);
  await semRolagemLateral(page);
  await ctx.close();
  // GPS negado: marcação segue sem localização
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const reg2 = await sessaoSimulada(ctx2, rotasPortal((c) => (c === 'rpc/registrar_marcacao_ponto' ? { corpo: [{ id: 'm2', registrado_em: new Date().toISOString(), data_local: hoje, duplicada: false }] } : undefined)));
  const p2 = await ctx2.newPage();
  await p2.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => Promise.reject(new DOMException('negado', 'NotAllowedError')) } });
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_ok: unknown, erro: (e: unknown) => void) => erro({ code: 1, PERMISSION_DENIED: 1 }) } });
  });
  await p2.goto(`${BASE}/colaborador/ponto`);
  await p2.getByRole('button', { name: 'Registrar ponto' }).click({ timeout: 90000 });
  const d2 = p2.getByRole('dialog', { name: 'Registrar ponto' });
  await expect(d2.getByTestId('foto-marcacao')).toContainText('Câmera não autorizada.');
  await expect(d2.getByTestId('local-marcacao')).toContainText('Localização não autorizada.');
  await d2.getByRole('button', { name: 'Registrar entrada' }).click();
  await expect(p2.getByText(/Entrada registrada/)).toBeVisible();
  expect(chamadas(reg2, 'rpc/registrar_marcacao_ponto')[0].corpo).toMatchObject({ p_situacao_localizacao: 'negada', p_latitude: null, p_situacao_foto: 'negada' });
  await ctx2.close();
});

// ===== Fase 4 — Jornada do colaborador =====
test('jornada: escala, espelho com esclarecimento respondido e solicitação de correção', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const reg = await sessaoSimulada(ctx, rotasPortal((c) => {
    if (['rpc/responder_esclarecimento_ponto', 'rpc/solicitar_correcao_ponto'].includes(c)) return { corpo: 'ok' };
    return undefined;
  }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/colaborador/jornada`);
  await expect(page.getByTestId('escala')).toContainText('Segunda08:00–12:00 · 13:00–17:00', { timeout: 90000 });
  await expect(page.getByTestId('escala')).toContainText('SábadoDescanso');
  await page.getByRole('tab', { name: 'Espelho' }).click();
  const dia = page.getByTestId('dia-espelho').first();
  await expect(dia).toContainText('Horas excedentes: 2h00');
  await expect(dia).toContainText('Esclarecimento');
  await expect(dia).toContainText('O RH pediu: “Por que ficou até 19h?”');
  await dia.getByRole('textbox').fill('Fechamento do inventário');
  await dia.getByRole('button', { name: 'Responder' }).click();
  await expect(page.getByText('Resposta enviada ao RH.')).toBeVisible();
  expect(chamadas(reg, 'rpc/responder_esclarecimento_ponto')[0].corpo).toEqual({ p_id: 'ap1', p_resposta: 'Fechamento do inventário' });
  await page.getByRole('tab', { name: 'Horas extras' }).click();
  await expect(page.getByTestId('total-horas-extras')).toContainText('2h00');
  await expect(page.getByTestId('horas-extras')).toContainText('+2h00');
  await expect(page.getByText('Só o que for enviado à folha entra no pagamento.', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Correções' }).click();
  await page.getByRole('button', { name: 'Solicitar' }).click();
  const m = page.getByRole('dialog', { name: 'Solicitar correção de ponto' });
  await m.getByRole('button', { name: 'Enviar solicitação' }).click();
  await expect(m.getByRole('alert')).toHaveText('Informe o motivo da correção.');
  await m.getByLabel('Data').fill(ontem);
  await m.getByLabel('Horário', { exact: true }).fill('17:02');
  await m.getByLabel('Tipo', { exact: true }).selectOption('saida');
  await m.getByLabel('Motivo').fill('Esqueci de marcar a saída');
  await m.getByRole('button', { name: 'Enviar solicitação' }).click();
  await expect(page.getByText('Solicitação enviada ao RH.', { exact: false })).toBeVisible();
  expect(chamadas(reg, 'rpc/solicitar_correcao_ponto')[0].corpo).toEqual({ p_id_funcionario: 'f2', p_tipo: 'incluir', p_data: ontem, p_horario: '17:02', p_tipo_marcacao: 'saida', p_id_marcacao: null, p_motivo: 'Esqueci de marcar a saída', p_dia_seguinte: false });
  // Turno que passou da meia-noite: horário do dia seguinte
  await page.getByRole('button', { name: 'Solicitar' }).click();
  const m2 = page.getByRole('dialog', { name: 'Solicitar correção de ponto' });
  await m2.getByLabel('Data').fill(ontem);
  await m2.getByLabel('Horário', { exact: true }).fill('06:00');
  await m2.getByLabel('Horário no dia seguinte (turno que passou da meia-noite)').check();
  await m2.getByLabel('Motivo').fill('Saída do plantão noturno');
  await m2.getByRole('button', { name: 'Enviar solicitação' }).click();
  await expect.poll(() => chamadas(reg, 'rpc/solicitar_correcao_ponto').length).toBe(2);
  expect(chamadas(reg, 'rpc/solicitar_correcao_ponto')[1].corpo).toMatchObject({ p_horario: '06:00', p_dia_seguinte: true });
  await semRolagemLateral(page);
  await ctx.close();
});

test('notificações: sino no portal com não lidas, marca como lidas e abre o link', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const reg = await sessaoSimulada(ctx, rotasPortal((c) => {
    if (c === 'notificacoes') return { corpo: [
      { id: 'n1', titulo: 'Correção de ponto aprovada', mensagem: 'Empresa Exemplo: Sua solicitação de 10/10/2026 foi aprovada.', link: '/colaborador/jornada?aba=correcoes', lida_em: null, criado_em: `${hoje}T10:00:00Z` },
      { id: 'n2', titulo: 'Holerite disponível', mensagem: 'Empresa Exemplo: Seu holerite de 09/2026 está em Meus documentos.', link: '/colaborador/documentos', lida_em: null, criado_em: `${hoje}T09:00:00Z` },
    ] };
    if (c === 'rpc/marcar_notificacoes_lidas') return { status: 204 };
    return undefined;
  }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/colaborador`);
  const sino = page.getByRole('button', { name: 'Notificações (2 não lidas)' });
  await expect(sino).toBeVisible({ timeout: 90000 });
  await sino.click();
  const painel = page.getByRole('dialog', { name: 'Notificações' });
  await expect(painel).toContainText('Holerite disponível');
  await expect.poll(() => chamadas(reg, 'rpc/marcar_notificacoes_lidas').length).toBe(1);
  await semRolagemLateral(page);
  await painel.getByRole('link', { name: /Correção de ponto aprovada/ }).click();
  await page.waitForURL('**/colaborador/jornada?aba=correcoes');
  await expect(page.getByRole('tab', { name: 'Correções' })).toHaveAttribute('aria-selected', 'true', { timeout: 30000 });
  await ctx.close();
});

test('rotas de contador e admin: conta só de colaborador termina no portal, sem dados dessas áreas', async ({ browser }) => {
  for (const rota of ['/contador', '/admin']) {
    const ctx = await browser.newContext();
    const reg = await sessaoSimulada(ctx, rotasPortal((c) => {
      if (c === 'perfis') return { corpo: [{ nome_completo: 'Denilson', tipo_usuario: null, funcao_global: 'user' }] };
      if (c === 'usuarios_empresas') return { corpo: [], total: 0 };
      return undefined;
    }));
    const page = await ctx.newPage();
    await page.route('**/api/auth/check-role', (x) => x.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ role: 'user' }) }));
    await page.goto(`${BASE}${rota}`);
    await page.waitForURL('**/colaborador', { timeout: 90000 });
    await expect(page.getByRole('heading', { name: 'Olá, Denilson!' })).toBeVisible({ timeout: 60000 });
    // Só consultas de identidade/perfil e do próprio portal: nenhuma consulta administrativa ou de contador sai do navegador
    const permitidas = new Set(['perfis', 'preferencias_usuario', 'notificacoes', 'usuarios_empresas', 'membros_escritorio', 'rpc/portal_colaborador', 'rpc/meu_ponto', 'rpc/minha_jornada']);
    expect(reg.chamadas.map((x) => x.caminho).filter((x) => !permitidas.has(x))).toEqual([]);
    expect(reg.escritasBloqueadas.filter((x) => !x.includes('marcar_notificacoes_lidas'))).toEqual([]);
    await expect(page.getByRole('heading', { name: /Painel do Contador|Admin/ })).toHaveCount(0);
    await ctx.close();
  }
});

// ===== RH: convite, jornada e Controle de Ponto =====
const LINHAS = [{ id_funcionario: 'f2', nome: 'Denilson Amorim', cargo: 'Técnico', vinculo: 'clt', data_admissao: '2023-03-10', status_funcionario: 'ativo', id_folha: 'fo2',
  salario_base: 2107.3, adicionais: 0, descontos: 0, total: 2107.3, pago: 0, pendente: 2107.3, vencimento: '2026-11-05', situacao: 'pendente', ultimo_pagamento: null }];
const FUNCS = [{ id: 'f2', nome: 'Denilson Amorim', cargo: 'Técnico', data_admissao: '2023-03-10', vinculo: 'clt', salario_base: 2107.3, dia_pagamento: 5, pagamento_mes_seguinte: true, status: 'ativo', data_desligamento: null, observacoes: null }];
function rotasRH(extra?: Rotas): Rotas {
  return (c, u, req) => {
    const e = extra?.(c, u, req);
    if (e) return e;
    if (c === 'perfis') return { corpo: [{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (c === 'rpc/gerar_folha') return { corpo: 0 };
    if (c === 'rpc/resumo_folha') return { corpo: LINHAS };
    if (c === 'funcionarios') return { corpo: FUNCS };
    if (c === 'rpc/evolucao_folha') return { corpo: [] };
    if (c === 'notificacoes') return { corpo: [] };
    return undefined;
  };
}

test('RH: convidar para o Portal pelo resumo do colaborador e configurar a jornada', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let situacao = 'sem_convite';
  const reg = await sessaoSimulada(ctx, rotasRH((c) => {
    if (c === 'rpc/situacao_portal_funcionario') return { corpo: [{ situacao, email: situacao === 'sem_convite' ? null : 'denilson@exemplo.test', convite_expira_em: '2026-10-23T10:00:00Z', convite_enviado: true, ativado_em: null, revogado_em: null, motivo_revogacao: null }] };
    if (c === 'rpc/salvar_jornada_funcionario') return { corpo: 'j1' };
    return undefined;
  }));
  const page = await ctx.newPage();
  const convites: unknown[] = [];
  await page.route('**/api/colaborador/convites', async (r) => { convites.push(JSON.parse(r.request().postData() ?? '{}')); situacao = 'convite_pendente'; await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enviado: true }) }); });
  await page.goto(`${BASE}/app/funcionarios`);
  await page.getByTestId('linha-Denilson Amorim').click({ timeout: 90000 });
  const painel = page.getByRole('complementary', { name: 'Resumo do colaborador' });
  await expect(painel.getByTestId('portal-jornada')).toContainText('Sem acesso');
  await painel.getByRole('button', { name: 'Convidar para o Portal' }).click();
  const m = page.getByRole('dialog', { name: 'Convidar para o Portal' });
  await m.getByLabel('E-mail do colaborador').fill('nao-e-email');
  await m.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(m.getByRole('alert')).toHaveText('Informe um e-mail válido.');
  await m.getByLabel('E-mail do colaborador').fill('Denilson@Exemplo.test');
  await m.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(page.getByText('Convite enviado para denilson@exemplo.test.')).toBeVisible();
  expect(convites).toEqual([{ id_funcionario: 'f2', email: 'Denilson@Exemplo.test' }]);
  await expect(painel.getByTestId('portal-jornada')).toContainText('Convite enviado');
  await painel.getByRole('button', { name: 'Configurar jornada' }).click();
  const j = page.getByRole('dialog', { name: 'Jornada de trabalho' });
  await j.getByTestId('editor-escala').getByRole('listitem').filter({ hasText: 'Sábado' }).getByRole('checkbox').check();
  await j.getByLabel('Sábado período 2 fim').fill('16:00');
  await j.getByLabel('Horas excedentes (sugestão na conferência)').selectOption('banco_horas');
  await j.getByRole('button', { name: 'Salvar jornada' }).click();
  await expect(page.getByText('Jornada salva.', { exact: false })).toBeVisible();
  const corpo = chamadas(reg, 'rpc/salvar_jornada_funcionario')[0].corpo as Record<string, unknown>;
  expect(corpo).toMatchObject({ p_id_funcionario: 'f2', p_vigente_desde: hoje, p_tolerancia: 10, p_intervalo_minimo: 60, p_limite_sem_intervalo: 360, p_tratamento: 'banco_horas' });
  expect((corpo.p_escala as Record<string, string[][]>)['6']).toEqual([['08:00', '12:00'], ['13:00', '16:00']]);
  await ctx.close();
});

const APURACOES = [
  { id: 'ap1', id_funcionario: 'f2', funcionario: 'Denilson Amorim', matricula: 2, data: ontem, previsto_minutos: 480, trabalhado_minutos: 600, excedente_minutos: 120, atraso_minutos: 0, ausencia: false,
    intervalo_inconsistente: false, incompleta: false, dia_nao_previsto: false, feriado: false, jornada_prevista: '08:00–12:00 · 13:00–17:00', jornada_registrada: '08:00 · 12:00 · 13:00 · 19:00',
    situacao: 'apurada', classificacao: null, justificativa: null, pedido_esclarecimento: null, resposta_colaborador: 'Inventário', tratamento_padrao: 'banco_horas', ocorrencia_processada: false },
  { id: 'ap2', id_funcionario: 'f2', funcionario: 'Denilson Amorim', matricula: 2, data: comp, previsto_minutos: 480, trabalhado_minutos: 240, excedente_minutos: 0, atraso_minutos: 0, ausencia: false,
    intervalo_inconsistente: false, incompleta: true, dia_nao_previsto: false, feriado: false, jornada_prevista: '08:00–12:00 · 13:00–17:00', jornada_registrada: '08:00 · 12:00 · 13:00',
    situacao: 'apurada', classificacao: null, justificativa: null, pedido_esclarecimento: null, resposta_colaborador: null, tratamento_padrao: 'conferir', ocorrencia_processada: false },
  { id: 'ap3', id_funcionario: 'f2', funcionario: 'Denilson Amorim', matricula: 2, data: comp, previsto_minutos: 480, trabalhado_minutos: 0, excedente_minutos: 0, atraso_minutos: 0, ausencia: true,
    intervalo_inconsistente: false, incompleta: false, dia_nao_previsto: false, feriado: false, jornada_prevista: '08:00–12:00 · 13:00–17:00', jornada_registrada: null,
    situacao: 'conferida', classificacao: 'falta', justificativa: null, pedido_esclarecimento: null, resposta_colaborador: null, tratamento_padrao: 'conferir', ocorrencia_processada: false },
];

test('RH Controle de Ponto: conferir (sem apagar horas), evidências com correção, solicitação, enviar à folha e celular', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const reg = await sessaoSimulada(ctx, rotasRH((c) => {
    if (c === 'rpc/painel_ponto') return { corpo: { status_folha: 'preparacao', apuracoes: APURACOES, sem_jornada: [{ id: 'f9', nome: 'Ana Souza' }], feriados: [],
      solicitacoes: [{ id: 's1', id_funcionario: 'f2', funcionario: 'Denilson Amorim', tipo: 'incluir', data: ontem, horario: '17:02:00', tipo_marcacao: 'saida', motivo: 'Esqueci', marcacao_original: null, criado_em: `${hoje}T10:00:00Z` }] } };
    if (c === 'rpc/marcacoes_do_dia') return { corpo: [{ id: 'm1', tipo: 'entrada', registrado_em: `${ontem}T11:00:00Z`, origem: 'portal', desconsiderada: false, situacao_foto: 'negada', foto_caminho: null, situacao_localizacao: 'capturada', latitude: -5.4653, longitude: -47.8819, precisao_metros: 8, motivo_correcao: null }] };
    if (c === 'rpc/integrar_ponto_folha') return { corpo: 1 };
    if (['rpc/conferir_apuracao_ponto', 'rpc/corrigir_ponto_rh', 'rpc/responder_solicitacao_ponto', 'rpc/apurar_ponto_competencia'].includes(c)) return { corpo: 1 };
    return undefined;
  }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/ponto`);
  await expect(page.getByRole('heading', { level: 1, name: 'Controle de Ponto' })).toBeVisible({ timeout: 90000 });
  await expect(page.getByText('Não é um REP-P homologado', { exact: false })).toBeVisible();
  await expect(page.getByTestId('sem-jornada')).toContainText('Ana Souza');
  const itens = page.getByTestId('apuracao');
  await expect(itens.nth(0)).toContainText('Horas excedentes: 2h00');
  await expect(itens.nth(0)).toContainText('Resposta do colaborador: Inventário');
  await expect(itens.nth(1).getByRole('button', { name: 'Conferir' })).toHaveCount(0); // incompleta não é conferida
  await itens.nth(0).getByRole('button', { name: 'Conferir' }).click();
  const m = page.getByRole('dialog', { name: 'Conferir ocorrência' });
  await expect(m.getByRole('radio')).toHaveCount(3); // hora extra, banco de horas, compensação — sem "apagar"
  await expect(m.getByLabel('Banco de horas')).toBeChecked(); // sugestão da jornada
  await m.getByLabel('Hora extra').check();
  await m.getByRole('button', { name: 'Confirmar conferência' }).click();
  await expect(page.getByText('Ocorrência conferida.')).toBeVisible();
  expect(chamadas(reg, 'rpc/conferir_apuracao_ponto')[0].corpo).toEqual({ p_id: 'ap1', p_classificacao: 'hora_extra', p_justificativa: null });
  // Evidências: original + correção
  await itens.nth(1).getByRole('button', { name: 'Evidências' }).click();
  const ev = page.getByRole('dialog', { name: 'Evidências do dia' });
  await expect(ev.getByTestId('evidencias')).toContainText('Câmera negada');
  await expect(ev.getByRole('link', { name: 'ver no mapa' })).toHaveAttribute('href', /openstreetmap\.org/);
  await ev.getByRole('button', { name: 'Incluir marcação' }).click();
  await ev.getByLabel('Horário', { exact: true }).fill('17:00');
  await ev.getByLabel('Motivo').fill('Saída confirmada pelo gestor');
  await ev.getByRole('button', { name: 'Registrar correção' }).click();
  await expect(page.getByText('Correção registrada.', { exact: false })).toBeVisible();
  expect(chamadas(reg, 'rpc/corrigir_ponto_rh')[0].corpo).toEqual({ p_id_funcionario: 'f2', p_tipo: 'incluir', p_data: comp, p_horario: '17:00', p_tipo_marcacao: 'saida', p_id_marcacao: null, p_motivo: 'Saída confirmada pelo gestor', p_dia_seguinte: false });
  // Solicitação: recusa exige motivo
  await page.getByRole('tab', { name: /Solicitações/ }).click();
  await page.getByTestId('solicitacoes-rh').getByRole('button', { name: 'Aprovar' }).click();
  await expect(page.getByText('Correção aprovada; o dia foi reapurado.')).toBeVisible();
  expect(chamadas(reg, 'rpc/responder_solicitacao_ponto')[0].corpo).toEqual({ p_id: 's1', p_aprovar: true, p_resposta: null });
  // Enviar à folha
  await page.getByRole('button', { name: /Enviar conferidas à folha/ }).click();
  await expect(page.getByText(`1 ocorrência(s) enviada(s) à Folha de Pagamento`, { exact: false })).toBeVisible();
  expect(chamadas(reg, 'rpc/integrar_ponto_folha')[0].corpo).toEqual({ p_id_empresa: EMPRESA.id, p_competencia: comp });
  expect(reg.escritasBloqueadas).toEqual([]);
  await page.setViewportSize({ width: 375, height: 800 });
  await semRolagemLateral(page);
  await ctx.close();
});

test('RH Controle de Ponto: retenção de fotos sem prazo padrão; ativar exige fundamento; retenção legal', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const reg = await sessaoSimulada(ctx, rotasRH((c) => {
    if (c === 'rpc/painel_ponto') return { corpo: { status_folha: 'preparacao', apuracoes: [], sem_jornada: [], feriados: [], solicitacoes: [] } };
    if (c === 'politicas_retencao_ponto') return { status: 406, corpo: { code: 'PGRST116', message: 'no rows' } };
    if (c === 'rpc/salvar_politica_retencao_ponto') {
      const corpo = chamadas(reg, 'rpc/salvar_politica_retencao_ponto').at(-1)?.corpo as { p_exclusao_ativa: boolean; p_fundamento: string } | undefined;
      return corpo?.p_exclusao_ativa && (corpo.p_fundamento ?? '').length < 10
        ? { status: 400, corpo: { code: '23514', message: 'Para ativar a exclusão automática, informe o prazo e o fundamento jurídico validado.' } } : { status: 204 };
    }
    if (c === 'rpc/criar_retencao_legal_ponto') return { corpo: 'r1' };
    return undefined;
  }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/ponto`);
  await page.getByRole('tab', { name: 'Retenção de fotos' }).click({ timeout: 90000 });
  const ret = page.getByTestId('retencao-fotos');
  await expect(ret).toContainText('o sistema não presume prazo legal');
  await expect(ret.getByLabel('Prazo de guarda (dias)')).toHaveValue('');
  await expect(ret.getByLabel('Excluir automaticamente após o prazo')).not.toBeChecked();
  await ret.getByLabel('Prazo de guarda (dias)').fill('365');
  await ret.getByLabel('Excluir automaticamente após o prazo').check();
  await ret.getByRole('button', { name: 'Salvar política' }).click();
  await expect(ret.getByRole('alert')).toHaveText('Para ativar a exclusão automática, informe o prazo e o fundamento jurídico validado.');
  await ret.getByLabel('Fundamento jurídico validado').fill('Parecer jurídico interno 12/2026');
  await ret.getByRole('button', { name: 'Salvar política' }).click();
  await expect(page.getByText('Política de retenção salva.')).toBeVisible();
  expect(chamadas(reg, 'rpc/salvar_politica_retencao_ponto').at(-1)!.corpo).toEqual({ p_id_empresa: EMPRESA.id, p_prazo_dias: 365, p_exclusao_ativa: true, p_fundamento: 'Parecer jurídico interno 12/2026' });
  await ret.getByLabel('Motivo da retenção legal').fill('Processo trabalhista 0001');
  await ret.getByRole('button', { name: 'Preservar todas as fotos' }).click();
  await expect(page.getByText('Retenção legal registrada', { exact: false })).toBeVisible();
  expect(chamadas(reg, 'rpc/criar_retencao_legal_ponto')[0].corpo).toEqual({ p_id_empresa: EMPRESA.id, p_id_funcionario: null, p_motivo: 'Processo trabalhista 0001' });
  await semRolagemLateral(page);
  await ctx.close();
});

test('RH Controle de Ponto: folha enviada ao contador bloqueia o envio', async ({ browser }) => {
  const ctx = await browser.newContext();
  await sessaoSimulada(ctx, rotasRH((c) => (c === 'rpc/painel_ponto' ? { corpo: { status_folha: 'enviada', apuracoes: [APURACOES[2]], sem_jornada: [], feriados: [], solicitacoes: [] } } : undefined)));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/ponto`);
  await expect(page.getByText('A folha deste mês já foi enviada ao contador', { exact: false })).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole('button', { name: /Enviar conferidas à folha/ })).toBeDisabled();
  await ctx.close();
});
