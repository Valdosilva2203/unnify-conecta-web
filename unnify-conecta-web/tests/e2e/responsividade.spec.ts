import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Lê o .env.local só no processo de teste (nada de segredo no código).
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
const LARGURAS = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
const PAISAGEM = { width: 844, height: 390 };

type Achado = { rota: string; largura: string; tipo: string; detalhe: string };
const achados: Achado[] = [];

function admin(): SupabaseClient {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function cnpjAleatorio(): string {
  const n = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).concat([0, 0, 0, 1]);
  const dv = (base: number[], pesos: number[]) => {
    const r = base.reduce((s, d, i) => s + d * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...n, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const s = [...n, d1, d2].join('');
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}

async function criarUsuario(tipo: 'nenhum' | 'empresa' | 'contador') {
  const sb = admin();
  const email = `delivered+resp${tipo}${Date.now()}@resend.dev`;
  const senha = `Teste@${Date.now()}`;
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome_completo: `Teste ${tipo}` },
  });
  if (error) throw error;
  if (tipo !== 'nenhum') {
    const cliente = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    await cliente.auth.signInWithPassword({ email, password: senha });
    const { data: r, error: e } = await cliente.rpc('criar_empresa', {
      p_cnpj: cnpjAleatorio(),
      p_razao_social: `EMPRESA TESTE ${tipo.toUpperCase()} LTDA`,
      p_telefone: '63999990000',
      p_email_comercial: email,
      p_cidade: 'Palmas',
      p_estado: 'TO',
      p_tipo_empresa: tipo === 'contador' ? 'escritorio_contabil' : 'comum',
      p_nome_comercial: `Teste ${tipo}`,
    });
    if (e || !r?.[0]?.sucesso) throw new Error(`criar_empresa falhou: ${e?.message ?? r?.[0]?.mensagem}`);
    await sb.from('perfis').update({ tipo_usuario: tipo }).eq('id_usuario', data.user.id);
  }
  return { id: data.user.id, email };
}

async function entrarComo(page: Page, email: string) {
  const { data, error } = await admin().auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  await page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=email`);
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/callback'), { timeout: 30000 });
}

async function inspecionar(page: Page, rota: string, rotulo: string, larguraJanela: number) {
  const r = await page.evaluate((vw) => {
    const doc = document.documentElement;
    const rolagem = doc.scrollWidth - vw;
    const visivel = (el: Element) => {
      const s = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0 && b.height > 0 && !el.closest('[inert],[aria-hidden="true"]');
    };
    const dentroDeRolagem = (el: Element) => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth) return true;
        p = p.parentElement;
      }
      return false;
    };
    const interativos = Array.from(
      document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button]')
    ).filter(visivel);
    const descrever = (el: Element) =>
      `${el.tagName.toLowerCase()}"${((el as HTMLElement).innerText || el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || '').trim().slice(0, 30)}"`;
    const cortados = interativos
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return (b.left < -1 || b.right > vw + 1) && !dentroDeRolagem(el);
      })
      .map(descrever);
    const pequenos =
      vw < 768
        ? interativos
            .filter((el) => {
              if (el.tagName === 'A' && el.closest('p, li, span')) return false; // link dentro de texto
              const b = el.getBoundingClientRect();
              if (b.width <= 1 && b.height <= 1) return false; // sr-only: o alvo real é o rótulo/botão visível
              const rotulo = el.tagName === 'INPUT' ? el.closest('label') : null; // rótulo envolvente também é clicável
              const alvo = rotulo ? rotulo.getBoundingClientRect() : b;
              return alvo.height < 40 || alvo.width < 40;
            })
            .map((el) => {
              const b = el.getBoundingClientRect();
              return `${descrever(el)} ${Math.round(b.width)}x${Math.round(b.height)}`;
            })
        : [];
    const cabecalho = document.querySelector('table thead');
    const tabelaComoCartao = vw >= 1440 && !!cabecalho && getComputedStyle(cabecalho).display === 'none';
    return { rolagem, cortados, pequenos, tabelaComoCartao };
  }, larguraJanela);

  if (r.tabelaComoCartao) achados.push({ rota, largura: rotulo, tipo: 'TABELA_COMO_CARTAO', detalhe: 'tabela deveria aparecer em telas largas' });

  if (r.rolagem > 1) achados.push({ rota, largura: rotulo, tipo: 'ROLAGEM_HORIZONTAL', detalhe: `+${r.rolagem}px` });
  for (const c of r.cortados) achados.push({ rota, largura: rotulo, tipo: 'CORTADO', detalhe: c });
  for (const p of r.pequenos) achados.push({ rota, largura: rotulo, tipo: 'ALVO_PEQUENO', detalhe: p });
}

async function varrerRota(page: Page, rota: string, esperar?: string) {
  const erros: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('response', (resp) => {
    if (resp.status() >= 400 && !resp.url().includes('favicon')) erros.push(`HTTP ${resp.status()} ${resp.url().slice(0, 120)}`);
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}${rota}`);
  await page.waitForLoadState('networkidle');
  if (esperar) await page.locator(esperar).first().waitFor({ timeout: 30000 });

  for (const w of LARGURAS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(250);
    await inspecionar(page, rota, `${w}`, w);
  }
  await page.setViewportSize(PAISAGEM);
  await page.waitForTimeout(250);
  await inspecionar(page, rota, 'paisagem', PAISAGEM.width);

  const finalPath = new URL(page.url()).pathname;
  if (finalPath !== rota.split('?')[0]) {
    achados.push({ rota, largura: '-', tipo: 'REDIRECIONOU', detalhe: finalPath });
  }
  for (const e of Array.from(new Set(erros))) achados.push({ rota, largura: '-', tipo: 'ERRO_CONSOLE_REDE', detalhe: e });
  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  page.removeAllListeners('response');
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(15 * 60 * 1000);

test('responsividade de todas as rotas', async ({ browser }) => {
  const criados: string[] = [];
  try {
    // Públicas
    const publico = await browser.newPage();
    for (const rota of ['/', '/login', '/signup', '/forgot-password']) await varrerRota(publico, rota);
    await publico.close();

    // Onboarding (usuário sem empresa)
    const novo = await criarUsuario('nenhum');
    criados.push(novo.id);
    const pNovo = await browser.newPage();
    await entrarComo(pNovo, novo.email);
    await varrerRota(pNovo, '/onboarding', 'h1');
    await varrerRota(pNovo, '/onboarding/empresa?tipo=comum', 'form');
    await varrerRota(pNovo, '/onboarding/contador?tipo=escritorio_contabil', 'form');
    await pNovo.close();

    // Empresa
    const emp = await criarUsuario('empresa');
    criados.push(emp.id);
    const pEmp = await browser.newPage();
    await entrarComo(pEmp, emp.email);
    await varrerRota(pEmp, '/app');
    await varrerRota(pEmp, '/app/meu-contador', 'h1');
    await varrerRota(pEmp, '/app/meu-contador/buscar', 'h1');
    await varrerRota(pEmp, '/onboarding/conclusao', 'h1');
    await pEmp.close();

    // Contador
    const cont = await criarUsuario('contador');
    criados.push(cont.id);
    const pCont = await browser.newPage();
    await entrarComo(pCont, cont.email);
    await varrerRota(pCont, '/contador');
    await varrerRota(pCont, '/contador/empresas', 'h1');
    await varrerRota(pCont, '/contador/perfil-profissional', 'h1');
    await pCont.close();

    // Admin (conta real, somente leitura)
    const pAdm = await browser.newPage();
    await entrarComo(pAdm, 'unnifybr@gmail.com');
    for (const rota of [
      '/admin',
      '/admin/empresas',
      '/admin/escritorios',
      '/admin/contadores',
      '/admin/parceiros',
      '/admin/usuarios',
      '/admin/assinaturas',
      '/admin/comissoes',
      '/admin/auditoria',
      '/admin/configuracoes',
    ]) {
      await varrerRota(pAdm, rota, 'main');
    }
    await pAdm.close();
  } finally {
    const sb = admin();
    for (const id of criados) await sb.auth.admin.deleteUser(id);
  }

  const resumo: Record<string, Record<string, number>> = {};
  for (const a of achados) {
    resumo[a.rota] ??= {};
    resumo[a.rota][a.tipo] = (resumo[a.rota][a.tipo] ?? 0) + 1;
  }
  console.log('\n=== RESUMO POR ROTA ===');
  console.log(JSON.stringify(resumo, null, 1));
  console.log('\n=== DETALHES (sem repetir larguras) ===');
  const vistos = new Set<string>();
  for (const a of achados) {
    const chave = `${a.rota}|${a.tipo}|${a.detalhe.replace(/\d+x\d+$/, '')}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const larguras = achados
      .filter((b) => b.rota === a.rota && b.tipo === a.tipo && b.detalhe.replace(/\d+x\d+$/, '') === a.detalhe.replace(/\d+x\d+$/, ''))
      .map((b) => b.largura);
    console.log(`${a.rota} | ${a.tipo} | ${a.detalhe} | larguras: ${Array.from(new Set(larguras)).join(',')}`);
  }

  const graves = achados.filter((a) => ['ROLAGEM_HORIZONTAL', 'CORTADO', 'ERRO_CONSOLE_REDE', 'REDIRECIONOU', 'TABELA_COMO_CARTAO'].includes(a.tipo));
  expect.soft(graves, 'problemas graves de layout/console').toEqual([]);
  expect.soft(achados.filter((a) => a.tipo === 'ALVO_PEQUENO'), 'alvos de toque < 40px no celular').toEqual([]);
});
