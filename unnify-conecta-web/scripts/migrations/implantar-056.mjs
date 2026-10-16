// Implantação controlada da migration 056 (Portal do Colaborador + Ponto). Ver supabase/migrations/CHECKLIST-056.md.
// Uso: node scripts/migrations/implantar-056.mjs <simular|simular-falha|verificar|aplicar> [--local] [--autorizado]
//   simular        BEGIN → migration → verificações → ROLLBACK (nada gravado)
//   simular-falha  BEGIN → migration → erro proposital → ROLLBACK; confere que nada ficou
//   verificar      somente leitura: confere objetos, RLS e permissões já aplicados
//   aplicar        BEGIN → migration → verificações → COMMIT + NOTIFY pgrst. Exige --autorizado (e backup feito antes)
// --local usa o PostgreSQL local (porta 55432). Sem --local, conecta no Supabase COMPARTILHADO (DEV = PROD).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const raiz = join(import.meta.dirname, '..', '..');
const require = createRequire(join(raiz, 'package.json'));
const { Client } = require('pg');
const [modo, ...flags] = process.argv.slice(2);
const local = flags.includes('--local');
if (!['simular', 'simular-falha', 'verificar', 'aplicar'].includes(modo)) throw new Error('modo: simular | simular-falha | verificar | aplicar');
if (modo === 'aplicar' && !local && !flags.includes('--autorizado')) throw new Error('Recusado: aplicar no banco compartilhado exige autorização explícita (--autorizado) e backup prévio.');

let c;
if (local) c = new Client({ connectionString: 'postgres://postgres@localhost:55432/unnify_local' });
else {
  const env = Object.fromEntries(readFileSync(join(raiz, '.env.local'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
  c = new Client({ host: 'aws-1-ca-central-1.pooler.supabase.com', port: 5432, user: 'postgres.bvwfoafkqjquxcbijffj', password: env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
}
await c.connect();
const um = async (s) => (await c.query(s)).rows[0];
const arr = (l) => `$$${'{"' + l.join('","') + '"}'}$$::text[]`;
const TAB = ['convites_colaborador', 'acessos_colaborador', 'jornadas_funcionario', 'feriados_empresa', 'solicitacoes_ponto', 'marcacoes_ponto', 'marcacoes_desconsideradas',
  'apuracoes_ponto', 'historico_ponto', 'politicas_retencao_ponto', 'retencoes_legais_ponto', 'execucoes_expurgo_ponto', 'expurgos_fotos_ponto'];
const PUB = ['criar_convite_colaborador(uuid,text,text)', 'aceitar_convite_colaborador(text)', 'portal_colaborador()', 'registrar_marcacao_ponto(uuid,uuid,text,text,numeric,numeric,numeric,text)',
  'meu_ponto(uuid,date,date)', 'minha_jornada(uuid,date)', 'painel_ponto(uuid,date)', 'conferir_apuracao_ponto(uuid,text,text)', 'integrar_ponto_folha(uuid,date)',
  'corrigir_ponto_rh(uuid,text,date,time,text,uuid,text,boolean)', 'solicitar_correcao_ponto(uuid,text,date,time,text,uuid,text,boolean)', 'salvar_politica_retencao_ponto(uuid,integer,boolean,text)'];
const INT = ['apurar_dia_ponto(uuid,date)', 'calcular_dia_ponto(uuid,date)', 'funcionario_do_colaborador(uuid)', 'registrar_historico_ponto(uuid,uuid,text,text,jsonb)',
  'notificar_colaborador(uuid,text,text,text)', 'iniciar_expurgo_fotos_ponto(integer)', 'concluir_expurgo_foto_ponto(uuid,uuid,boolean,text)'];
const contar = async () => JSON.stringify(await um(`select (select count(*) from funcionarios) funcionarios, (select count(*) from ajustes_folha) ajustes,
  (select count(*) from ocorrencias_folha) ocorrencias, (select count(*) from folhas_competencia) folhas, (select count(*) from competencias_folha) competencias,
  (select count(*) from lancamentos_financeiros) lancamentos, (select coalesce(sum(valor),0) from lancamentos_financeiros) soma, (select count(*) from notificacoes) notificacoes`));

async function verificacoes(antes) {
  const t = await um(`select count(*) filter (where relrowsecurity) rls, count(*) n from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname = any(${arr(TAB)})`);
  const pol = await um(`select count(*) n from pg_policies where schemaname='public' and tablename = any(${arr(TAB)})`);
  const sto = await um(`select count(*) n from pg_policies where schemaname='storage' and policyname in ('Ponto: envio da foto','Ponto: leitura da foto','Folha: holerite do próprio colaborador')`);
  const bucket = await um(`select public is false and file_size_limit = 2097152 ok from storage.buckets where id='ponto'`);
  const anon = await um(`select bool_or(has_table_privilege('anon','public.'||x,'SELECT')) a from unnest(${arr(TAB)}) x`);
  const escr = await um(`select bool_or(has_table_privilege('authenticated','public.'||x,'INSERT') or has_table_privilege('authenticated','public.'||x,'UPDATE') or has_table_privilege('authenticated','public.'||x,'DELETE')) a from unnest(${arr(TAB)}) x`);
  const fa = await um(`select bool_or(has_function_privilege('anon','public.'||x,'EXECUTE')) a from unnest(${arr(PUB)}) x`);
  const fu = await um(`select bool_and(has_function_privilege('authenticated','public.'||x,'EXECUTE')) a from unnest(${arr(PUB)}) x`);
  const fi = await um(`select bool_or(has_function_privilege('authenticated','public.'||x,'EXECUTE') or has_function_privilege('anon','public.'||x,'EXECUTE')) a from unnest(${arr(INT)}) x`);
  const anonConv = await um(`select has_function_privilege('anon','public.dados_convite_colaborador(text)','EXECUTE') a`);
  const trig = await um(`select count(*) n from pg_trigger where not tgisinternal and tgname in ('proteger_marcacao_ponto','proteger_desconsideracao_ponto','proteger_historico_ponto','revogar_portal_no_desligamento','notificar_holerites_aprovados')`);
  const politica = await um(`select count(*) n from politicas_retencao_ponto where exclusao_ativa`);
  const checks = {
    '13 tabelas com RLS e 11 políticas de leitura': Number(t.n) === 13 && Number(t.rls) === 13 && Number(pol.n) === 11,
    '3 políticas de Storage e bucket "ponto" privado (2 MB)': Number(sto.n) === 3 && bucket?.ok === true,
    '5 gatilhos (imutabilidade, desligamento, holerite)': Number(trig.n) === 5,
    'anônimo sem leitura de tabelas': !anon.a, 'sem escrita direta em tabelas': !escr.a,
    'anônimo não executa as funções': !fa.a, 'anônimo só lê o convite pelo token': anonConv.a,
    'usuário logado executa as funções públicas': fu.a, 'funções internas e do expurgo fora do alcance de usuários': !fi.a,
    'nenhuma exclusão automática de fotos ativa': Number(politica.n) === 0,
  };
  if (antes !== undefined) checks['dados existentes intactos (funcionários, folha, financeiro, notificações)'] = antes === await contar();
  let ok = true;
  for (const [k, x] of Object.entries(checks)) { console.log(`${x ? '✅' : '❌'} ${k}`); if (!x) ok = false; }
  return ok;
}

let ok = true;
try {
  if (modo === 'verificar') {
    ok = await verificacoes();
  } else {
    const antes = await contar();
    await c.query('BEGIN');
    await c.query("SET LOCAL lock_timeout = '10s'");
    await c.query(readFileSync(join(raiz, 'supabase/migrations/20261016000056_portal_colaborador.sql'), 'utf8'));
    if (modo === 'simular-falha') {
      try { await c.query('SAVEPOINT x'); await c.query("SELECT 1/0"); } catch { /* falha proposital */ }
      await c.query('ROLLBACK');
      const resto = await um(`select count(*) n from pg_class where relnamespace='public'::regnamespace and relname = any(${arr(TAB)})`);
      ok = Number(resto.n) === 0 && antes === await contar();
      console.log(`${ok ? '✅' : '❌'} falha no meio da implantação: ROLLBACK não deixa tabela nem altera dados`);
    } else {
      ok = await verificacoes(antes);
      if (modo === 'aplicar' && ok) { await c.query('COMMIT'); await c.query("NOTIFY pgrst, 'reload schema'"); console.log('COMMIT feito.'); }
      else { await c.query('ROLLBACK'); console.log(modo === 'simular' ? 'ROLLBACK (simulação) — nada gravado.' : 'ROLLBACK — verificação falhou, nada gravado.'); }
    }
  }
} catch (e) {
  ok = false;
  await c.query('ROLLBACK').catch(() => {});
  console.log('❌ ERRO:', String(e.message).slice(0, 300), '— nada gravado.');
}
await c.end();
process.exit(ok ? 0 : 1);
