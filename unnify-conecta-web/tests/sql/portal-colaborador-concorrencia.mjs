// Portal do Colaborador (migration 056): concorrência REAL com conexões simultâneas no PostgreSQL LOCAL.
// Usa dados confirmados (commit) com sufixo único e os apaga no final.
import { createRequire } from 'node:module';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const url = process.argv[2] ?? 'postgres://postgres@localhost:55432/unnify_local';
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Recusado: só banco local.');
const novo = async () => { const x = new Client({ connectionString: url }); await x.connect(); return x; };
const [c, c1, c2] = [await novo(), await novo(), await novo()];
const r = [];
const ok = (n, cond, x = '') => r.push({ n, ok: !!cond, x });
const um = async (cli, s, p = []) => (await cli.query(s, p)).rows[0];
const como = (cli, id) => cli.query("select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false), set_config('role', 'authenticated', false)", [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
const sufixo = randomBytes(4).toString('hex');
const token = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(token, 'utf8').digest('hex');
let E = null;
const usuarios = [];

try {
  const hoje = (await um(c, 'select public.hoje_brasil()::text d')).d;
  const comp = (await um(c, "select (date_trunc('month', $1::date) - interval '1 month')::date::text d", [hoje])).d;
  const seg = (await um(c, "select ($1::date + ((8 - extract(isodow from $1::date)::integer) % 7))::text d", [comp])).d;
  const usuario = async (email) => {
    const id = randomUUID();
    await c.query("insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, aud, role, created_at, updated_at) values ($1,$2,now(),'{\"nome_completo\":\"Concorrência\"}','authenticated','authenticated',now(),now())", [id, email]);
    usuarios.push(id);
    return id;
  };
  const dono = await usuario(`dono.${sufixo}@e56.local.test`);
  const colab = await usuario(`colab.${sufixo}@e56.local.test`);
  E = (await um(c, "insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,'Concorrência 56','c@local.test','Palmas','TO','comum','ATIVA',$2) returning id", [`56.${String(100 + Math.floor(Math.random() * 899))}.000/0001-56`, dono])).id;
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, E]);
  await como(c, dono);
  const func = (await um(c, "select salvar_funcionario(null,$1,'Teste Concorrência','Técnico',($2::date - 200),'clt',2000,5,true,null,null) id", [E, hoje])).id;
  const ESC = Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, [['08:00', '12:00'], ['13:00', '17:00']]]));
  await c.query('select salvar_jornada_funcionario($1,$2::date,$3::jsonb,10,60,360,$4)', [func, comp, JSON.stringify(ESC), 'conferir']);
  await c.query('select * from criar_convite_colaborador($1,$2,$3)', [func, `colab.${sufixo}@e56.local.test`, hash]);
  await como(c, colab);
  await c.query('select aceitar_convite_colaborador($1)', [token]);
  await c.query('reset role');

  // 1) Duas abas marcando "entrada" ao mesmo tempo: só uma vale
  const MARC = "select * from registrar_marcacao_ponto($1,$2,'entrada','negada',null,null,null,'negada')";
  await como(c1, colab); await como(c2, colab);
  await c1.query('begin'); await c2.query('begin');
  await c1.query(MARC, [randomUUID(), func]);
  const p2 = c2.query(MARC, [randomUUID(), func]).then(() => 'ok', (e) => e.message);
  await new Promise((res) => setTimeout(res, 300));
  await c1.query('commit');
  const res2 = await p2;
  await c2.query(res2 === 'ok' ? 'commit' : 'rollback');
  ok('Duas marcações simultâneas do mesmo tipo: a segunda espera e é recusada', res2.includes('há instantes'), res2);
  ok('Uma única entrada gravada', Number((await um(c, "select count(*) n from marcacoes_ponto where id_funcionario=$1 and tipo='entrada'", [func])).n) === 1);

  // 2) Mesma marcação (mesmo id) reenviada em paralelo: idempotente
  const idX = randomUUID();
  const MARC2 = "select * from registrar_marcacao_ponto($1,$2,'saida_intervalo','negada',null,null,null,'negada')";
  await c1.query('begin'); await c2.query('begin');
  await c1.query(MARC2, [idX, func]);
  const q2 = c2.query(MARC2, [idX, func]).then((x) => x.rows[0], (e) => ({ erro: e.message }));
  await new Promise((res) => setTimeout(res, 300));
  await c1.query('commit');
  const r2 = await q2;
  await c2.query(r2.erro ? 'rollback' : 'commit');
  ok('Reenvio simultâneo do mesmo id devolve "duplicada" sem erro', r2.duplicada === true, JSON.stringify(r2));
  ok('Um único registro com aquele id', Number((await um(c, 'select count(*) n from marcacoes_ponto where id=$1', [idX])).n) === 1);

  // 3) Integração à folha disparada duas vezes ao mesmo tempo: uma ocorrência só
  await c.query("insert into marcacoes_ponto (id, id_empresa, id_funcionario, id_usuario, tipo, registrado_em, data_local, situacao_localizacao, situacao_foto) select gen_random_uuid(), $1, $2, $3, t, ($4::date + h::time) at time zone 'America/Sao_Paulo', $4::date, 'negada', 'negada' from (values ('entrada','08:00'),('saida_intervalo','12:00'),('retorno_intervalo','13:00'),('saida','19:00')) v(t,h)", [E, func, colab, seg]);
  await como(c, dono);
  await c.query('select apurar_ponto_competencia($1,$2::date)', [E, comp]);
  const ap = await um(c, 'select id from apuracoes_ponto where id_funcionario=$1 and data=$2::date', [func, seg]);
  await c.query("select conferir_apuracao_ponto($1,'hora_extra',null)", [ap.id]);
  await c.query('reset role');
  const lanc0 = Number((await um(c, 'select count(*) n from lancamentos_financeiros where id_empresa=$1', [E])).n);
  await como(c1, dono); await como(c2, dono);
  await c1.query('begin'); await c2.query('begin');
  const n1 = Number((await um(c1, 'select integrar_ponto_folha($1,$2::date) n', [E, comp])).n);
  const i2 = c2.query('select integrar_ponto_folha($1,$2::date) n', [E, comp]).then((x) => Number(x.rows[0].n), (e) => e.message);
  await new Promise((res) => setTimeout(res, 300));
  await c1.query('commit');
  const n2 = await i2;
  await c2.query(typeof n2 === 'number' ? 'commit' : 'rollback');
  ok('Integração simultânea: a primeira envia, a segunda não duplica', n1 === 1 && n2 === 0, `${n1} / ${n2}`);
  ok('Uma única ocorrência de horas extras (2h) na folha', Number((await um(c, "select count(*) n from ocorrencias_folha where id_empresa=$1 and tipo='horas_extras' and excluido_em is null", [E])).n) === 1
    && Number((await um(c, "select quantidade q from ocorrencias_folha where id_empresa=$1 and tipo='horas_extras'", [E])).q) === 2);
  ok('Integração não cria lançamento financeiro', Number((await um(c, 'select count(*) n from lancamentos_financeiros where id_empresa=$1', [E])).n) === lanc0);
} finally {
  for (const x of [c1, c2]) { await x.query('rollback').catch(() => {}); await x.end(); }
  await c.query('reset role').catch(() => {});
  // Limpeza: dados de teste confirmados (gatilhos de imutabilidade e FKs desligados só nesta sessão local)
  await c.query("set session_replication_role = 'replica'");
  if (E) {
    for (const t of ['expurgos_fotos_ponto', 'historico_ponto', 'apuracoes_ponto', 'marcacoes_desconsideradas', 'marcacoes_ponto', 'solicitacoes_ponto', 'feriados_empresa',
      'jornadas_funcionario', 'acessos_colaborador', 'convites_colaborador', 'politicas_retencao_ponto', 'retencoes_legais_ponto', 'eventos_folha', 'conferencias_folha',
      'pendencias_folha', 'ocorrencias_folha', 'competencias_folha', 'lancamentos_financeiros', 'folhas_competencia', 'historico_salarios', 'funcionarios',
      'categorias_financeiras', 'usuarios_empresas']) {
      await c.query(`delete from public.${t} where id_empresa = $1`, [E]).catch(() => {});
    }
    await c.query('delete from public.empresas where id=$1', [E]);
  }
  for (const u of usuarios) { await c.query('delete from public.notificacoes where id_usuario=$1', [u]).catch(() => {}); await c.query('delete from public.perfis where id_usuario=$1', [u]); await c.query('delete from auth.users where id=$1', [u]); }
  await c.query("set session_replication_role = 'origin'");
  ok('Limpeza dos dados do teste de concorrência', Number((await um(c, 'select count(*) n from auth.users where email like $1', [`%.${sufixo}@e56.local.test`])).n) === 0
    && (!E || Number((await um(c, 'select count(*) n from empresas where id=$1', [E])).n) === 0));
  await c.end();
}
const falhas = r.filter((x) => !x.ok);
for (const x of r) console.log(`${x.ok ? '✅' : '❌'} ${x.n}${x.ok ? '' : ` — ${x.x}`}`);
console.log(`\n${r.length - falhas.length}/${r.length} verificações OK`);
process.exit(falhas.length ? 1 : 0);
