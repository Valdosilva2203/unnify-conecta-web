// Anotações (migration 051) no PostgreSQL LOCAL; tudo desfeito no final. Recusa rodar fora de localhost.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const url = process.argv[2] ?? 'postgres://postgres@localhost:55432/unnify_local';
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Recusado: só banco local.');
const c = new Client({ connectionString: url });
await c.connect();
const r = [];
const ok = (n, cond, x = '') => r.push({ n, ok: !!cond, x });
const um = async (s, p = []) => (await c.query(s, p)).rows[0];
const conta = async (s, p = []) => Number((await um(s, p)).n);
const como = (id) => c.query("select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false), set_config('role', 'authenticated', false)", [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
const admin = () => c.query("reset role; select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)");
async function falha(n, s, p, t) { await c.query('savepoint t'); try { await c.query(s, p); await c.query('release savepoint t'); ok(n, false, 'não falhou'); } catch (e) { await c.query('rollback to savepoint t'); ok(n, !t || e.message.includes(t), e.message.slice(0, 100)); } }

await c.query('begin');
await admin();
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
const [contC] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 1")).rows.map((x) => x.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' limit 1")).id_usuario;
const [socio] = (await c.query("select id_usuario from perfis where funcao_global='user' and id_usuario not in ($1,$2,$3) limit 1", [donoA, donoB, contC])).rows.map((x) => x.id_usuario);
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'an@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`33.${n}${n}${n}.000/0001-0${n}`, `Anot ${n} LTDA`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
// Colaborador (membro, não dono/sócio) da empresa A
await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'representante',true)", [socio, A]);
// Vínculo antigo do tipo "contador" em usuarios_empresas: NÃO dá acesso às anotações
await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'contador',true)", [contC, A]);
const SALVAR = 'select salvar_anotacao($1,$2,$3,$4,$5,$6::text[]) id';
const nova = async (quem, emp, cat = 'empresa', titulo = 'Ideias para a empresa', tags = ['Plano', 'App']) => { await como(quem); return (await um(SALVAR, [null, emp, titulo, '- Melhorar o plano\n- Estudar MVNO', cat, tags])).id; };

// ---------- Estrutura ----------
ok('Anônimo sem acesso; usuário logado só executa as 3 funções de escrita (+ a de leitura da política)', !(await um("select has_table_privilege('anon','public.anotacoes','SELECT') or has_function_privilege('anon','public.salvar_anotacao(uuid,uuid,text,text,text,text[])','EXECUTE') x")).x
  && (await um("select has_function_privilege('authenticated','public.salvar_anotacao(uuid,uuid,text,text,text,text[])','EXECUTE') and has_function_privilege('authenticated','public.excluir_anotacao(uuid)','EXECUTE') x")).x
  && !(await um("select has_function_privilege('authenticated','public.e_equipe_anotacoes(uuid)','EXECUTE') or has_function_privilege('authenticated','public.pode_editar_anotacao(uuid,text,uuid)','EXECUTE') or has_function_privilege('authenticated','public.limpar_tags_anotacao(text[])','EXECUTE') x")).x
  && !(await um("select has_table_privilege('authenticated','public.anotacoes','INSERT') or has_table_privilege('authenticated','public.anotacoes','UPDATE') or has_table_privilege('authenticated','public.anotacoes','DELETE') x")).x);

// ---------- Criar e ler ----------
const emp1 = await nova(donoA, A, 'empresa');
let x = await um('select * from anotacoes where id = $1', [emp1]);
ok('Dono cria: texto preservado (quebras e lista), categoria, tags, autor, não fixada', x.conteudo === '- Melhorar o plano\n- Estudar MVNO' && x.categoria === 'empresa' && x.tags.join() === 'Plano,App' && x.criado_por === donoA && x.fixada === false);
await falha('Título curto é recusado', SALVAR, [null, A, 'a', 'x', 'empresa', []], 'título');
await falha('Conteúdo vazio é recusado', SALVAR, [null, A, 'Título ok', '   ', 'empresa', []], 'conteúdo');
await falha('Categoria inventada é recusada', SALVAR, [null, A, 'Título ok', 'texto', 'secreta', []], 'Categoria');
await falha('Mais de 10 tags é recusado', SALVAR, [null, A, 'Título ok', 'texto', 'empresa', Array.from({ length: 11 }, (_, i) => `t${i}`)], 'tags');
const comTags = await um(SALVAR, [null, A, 'Tags sujas', 'texto', 'ideias', ['  App ', 'app', '', 'Wi-Fi 7', 'x'.repeat(50)]]);
ok('Tags: aparadas, sem vazias/repetidas e com no máximo 30 caracteres', (await um('select tags from anotacoes where id = $1', [comTags.id])).tags.join('|') === `App|Wi-Fi 7|${'x'.repeat(30)}`);
await como(donoB);
await falha('Usuário de outra empresa não cria na empresa A', SALVAR, [null, A, 'Intruso', 'texto', 'empresa', []], 'Sem acesso');
// (donoB está logado após o falha anterior? garante o papel certo)

// ---------- Isolamento e privacidade ----------
await como(donoB);
ok('Dono de outra empresa não vê nada da empresa A', await conta('select count(*) n from anotacoes where id_empresa = $1', [A]) === 0);
await falha('…nem edita', SALVAR, [emp1, A, 'Alterada', 'texto', 'empresa', []], 'não encontrada');
await falha('…nem fixa', 'select alternar_fixacao_anotacao($1, true)', [emp1], 'não encontrada');
await falha('…nem exclui', 'select excluir_anotacao($1)', [emp1], 'não encontrada');
await como(contC);
ok('Contador não vê anotações da empresa (nem com vínculo antigo do tipo contador)', await conta('select count(*) n from anotacoes where id_empresa = $1', [A]) === 0);
await como(master);
ok('Admin Master não vê anotações', await conta('select count(*) n from anotacoes') === 0);
await falha('Admin Master não cria', SALVAR, [null, A, 'Master', 'texto', 'empresa', []], 'Sem acesso');
await como(socio);
ok('Colaborador da empresa vê as anotações da empresa', await conta('select count(*) n from anotacoes where id = $1', [emp1]) === 1);

const pessoalDono = await nova(donoA, A, 'pessoal', 'Lembretes', []);
await como(socio);
ok('Anotação PESSOAL do dono NÃO aparece para o colaborador da mesma empresa', await conta('select count(*) n from anotacoes where id = $1', [pessoalDono]) === 0);
await falha('…e o colaborador não consegue alterá-la', SALVAR, [pessoalDono, A, 'Tomada', 'texto', 'empresa', []], 'não encontrada');
await falha('…nem excluí-la', 'select excluir_anotacao($1)', [pessoalDono], 'não encontrada');
await como(donoA);
ok('O autor continua vendo a própria anotação pessoal', await conta('select count(*) n from anotacoes where id = $1', [pessoalDono]) === 1);

// ---------- Edição, permissão do dono, fixação, exclusão ----------
const doColab = await nova(socio, A, 'ideias', 'Ideia do colaborador', ['novo']);
await como(donoA);
await um(SALVAR, [doColab, A, 'Ideia do colaborador (revisada)', 'conteúdo novo', 'reunioes', ['revisão']]);
x = await um('select titulo, categoria, tags, atualizado_por, criado_por from anotacoes where id = $1', [doColab]);
ok('Dono edita a anotação da empresa criada por outro membro (autor preservado)', x.titulo.includes('revisada') && x.categoria === 'reunioes' && x.atualizado_por === donoA && x.criado_por === socio);
await falha('Dono não transforma a anotação do colaborador em "pessoal" (sequestro)', SALVAR, [doColab, A, 'x1', 'texto', 'pessoal', []], 'não encontrada');
await como(socio);
await um(SALVAR, [doColab, A, 'Voltei', 'texto', 'ideias', []]);
ok('O autor edita a própria anotação', (await um('select titulo from anotacoes where id = $1', [doColab])).titulo === 'Voltei');
await como(donoA);
const antes = (await um('select atualizado_em from anotacoes where id = $1', [emp1])).atualizado_em;
await c.query('select alternar_fixacao_anotacao($1, true)', [emp1]);
x = await um('select fixada, atualizado_em from anotacoes where id = $1', [emp1]);
ok('Fixar marca a anotação sem mudar a data de atualização', x.fixada === true && +x.atualizado_em === +antes);
await c.query('select alternar_fixacao_anotacao($1, false)', [emp1]);
ok('Desafixar volta ao normal', (await um('select fixada from anotacoes where id = $1', [emp1])).fixada === false);
await c.query('select excluir_anotacao($1)', [emp1]);
ok('Excluir some para o autor (exclusão lógica: a linha continua guardada com autor e data)', await conta('select count(*) n from anotacoes where id = $1', [emp1]) === 0
  && (await admin(), (await um('select excluido_em, excluido_por from anotacoes where id = $1', [emp1]))).excluido_por === donoA);
await como(donoA);
await falha('Excluída não pode ser editada nem excluída de novo', SALVAR, [emp1, A, 'Ressuscitada', 'texto', 'empresa', []], 'não encontrada');
await falha('…nem excluída de novo', 'select excluir_anotacao($1)', [emp1], 'não encontrada');
await como(socio);
await falha('Colaborador não exclui a anotação da empresa de outro autor', 'select excluir_anotacao($1)', [await (async () => { const id = await nova(donoA, A, 'empresa', 'Do dono', []); await como(socio); return id; })()], 'não encontrada');

await admin();
await c.query('rollback');
await c.end();
for (const y of r) console.log(`${y.ok ? 'OK   ' : 'FALHA'} ${y.n}${y.x ? `  [${y.x}]` : ''}`);
const f = r.filter((y) => !y.ok).length;
console.log(`\n${r.length - f}/${r.length} verificações OK`);
process.exit(f ? 1 : 0);
