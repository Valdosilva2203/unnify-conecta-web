// Agenda (migration 037) no PostgreSQL LOCAL; tudo desfeito no final (ROLLBACK). Recusa rodar fora de localhost.
// Uso: node tests/sql/agenda.mjs [postgres://...]
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
const como = (id) => c.query("select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false), set_config('role', 'authenticated', false)", [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
const admin = () => c.query("reset role; select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)");
async function falha(n, s, p, t) { await c.query('savepoint t'); try { await c.query(s, p); await c.query('release savepoint t'); ok(n, false, 'não falhou'); } catch (e) { await c.query('rollback to savepoint t'); ok(n, !t || e.message.includes(t), e.message.slice(0, 90)); } }
const eventos = async (emp, ini, fim) => (await c.query('select * from agenda_eventos($1, $2::date, $3::date)', [emp, ini, fim])).rows;
const salvar = (id, emp, titulo, ini, fim, vis = 'empresa', resp = null, status = null) =>
  um("select salvar_compromisso($1,$2,$3,'desc','Escritório',$4::timestamptz,$5::timestamptz,false,'reuniao',$6,$7,$8) id", [id, emp, titulo, ini, fim, status, resp, vis]);

await c.query('begin');
await admin();
const [donoA, donoB, socioA] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 3")).rows.map((x) => x.id_usuario);
const [contC] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 1")).rows.map((x) => x.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'ag@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`44.${n}${n}${n}.000/0001-0${n}`, `Agenda ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'socio',true)", [socioA, A]);

// ===== CRUD =====
await como(donoA);
const c1 = (await salvar(null, A, 'Reunião com cliente', '2026-10-13T09:00:00-03:00', '2026-10-13T10:00:00-03:00')).id;
const cPriv = (await salvar(null, A, 'Consulta médica', '2026-10-13T14:00:00-03:00', '2026-10-13T15:00:00-03:00', 'privado')).id;
ok('Cria compromisso (responsável padrão = quem criou)', (await um('select id_responsavel, status from compromissos_agenda where id=$1', [c1])).id_responsavel === donoA);
await salvar(c1, A, 'Reunião com cliente (confirmada)', '2026-10-13T09:30:00-03:00', '2026-10-13T10:30:00-03:00', 'empresa', socioA, 'confirmado');
const ed = await um('select titulo, status, id_responsavel, inicio from compromissos_agenda where id=$1', [c1]);
ok('Edita título, horário, status e responsável', ed.titulo === 'Reunião com cliente (confirmada)' && ed.status === 'confirmado' && ed.id_responsavel === socioA);
await falha('Término antes do início é recusado', "select salvar_compromisso(null,$1,'Erro',null,null,'2026-10-13T10:00:00-03:00','2026-10-13T09:00:00-03:00',false,'reuniao',null,null,'empresa')", [A], 'término');
await falha('Título curto é recusado', "select salvar_compromisso(null,$1,'X',null,null,'2026-10-13T10:00:00-03:00','2026-10-13T11:00:00-03:00',false,'reuniao',null,null,'empresa')", [A], 'título');
await falha('Categoria inválida é recusada', "select salvar_compromisso(null,$1,'Teste',null,null,'2026-10-13T10:00:00-03:00','2026-10-13T11:00:00-03:00',false,'festa',null,null,'empresa')", [A], 'Categoria');
await falha('Responsável de fora da empresa é recusado', "select salvar_compromisso(null,$1,'Teste',null,null,'2026-10-13T10:00:00-03:00','2026-10-13T11:00:00-03:00',false,'reuniao',null,$2,'empresa')", [A, donoB], 'membro');
await falha('Duração acima de 31 dias é recusada', "select salvar_compromisso(null,$1,'Longo',null,null,'2026-10-01T10:00:00-03:00','2026-12-01T11:00:00-03:00',false,'reuniao',null,null,'empresa')", [A], '31 dias');
await falha('Sem escrita direta na tabela', "insert into compromissos_agenda (id_empresa, titulo, inicio, fim) values ($1,'Direto',now(),now()+interval '1 hour')", [A], 'permission denied');

// ===== Privacidade e isolamento =====
await como(socioA);
let ev = await eventos(A, '2026-10-01', '2026-10-31');
ok('Sócio vê compromisso da empresa, não o privado de outro', ev.some((e) => e.id === c1) && !ev.some((e) => e.id === cPriv));
ok('Sócio não lê o privado nem pela tabela (RLS)', (await c.query('select 1 from compromissos_agenda where id=$1', [cPriv])).rows.length === 0);
await falha('Sócio não edita o privado de outro', "select salvar_compromisso($1,null,'Invadir',null,null,'2026-10-13T14:00:00-03:00','2026-10-13T15:00:00-03:00',false,'reuniao',null,null,'empresa')", [cPriv], 'não encontrado');
await como(donoB);
await falha('Outra empresa não lê a agenda de A', "select * from agenda_eventos($1,'2026-10-01','2026-10-31')", [A], 'Sem acesso');
await falha('Outra empresa não edita compromisso de A', "select salvar_compromisso($1,$2,'Invadir',null,null,'2026-10-13T09:00:00-03:00','2026-10-13T10:00:00-03:00',false,'reuniao',null,null,'empresa')", [c1, B], 'não encontrado');
await falha('Outra empresa não exclui compromisso de A', 'select excluir_compromisso($1)', [c1], 'não encontrado');
ok('Outra empresa não vê compromissos de A pela tabela', (await c.query('select 1 from compromissos_agenda where id_empresa=$1', [A])).rows.length === 0);
await como(master);
await falha('Admin Master sem acesso automático', "select * from agenda_eventos($1,'2026-10-01','2026-10-31')", [A], 'Sem acesso');

// ===== Integrações (sem duplicar) e sincronização de status =====
await admin();
const tarefa = (await um("insert into tarefas (contexto, id_empresa, titulo, prioridade, status, prazo, criado_por) values ('empresa',$1,'Enviar notas fiscais','media','pendente','2026-10-13',$2) returning id", [A, donoA])).id;
await como(donoA);
const obrig = (await um("select salvar_obrigacao(null,$1,'DAS Simples Nacional',null,'fiscal',null,'2026-10-20'::date,null,null) id", [A])).id;
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const catD = (await um("select id from categorias_financeiras where id_empresa=$1 and tipo='despesa' limit 1", [A])).id;
const lanc = (await um("select salvar_lancamento_financeiro(null,$1,'despesa','Internet',150,$2,'2026-10-23'::date,'2026-10-23'::date,null,null,null,null,null) id", [A, catD])).id;
ev = await eventos(A, '2026-10-01', '2026-10-31');
const origemDe = (id) => ev.find((e) => e.id === id);
ok('Tarefa aparece na agenda (lida da origem)', origemDe(tarefa)?.origem === 'tarefa' && origemDe(tarefa)?.link === '/app/tarefas' && origemDe(tarefa)?.editavel === false);
ok('Obrigação aparece na agenda', origemDe(obrig)?.origem === 'obrigacao' && origemDe(obrig)?.link === '/app/obrigacoes');
ok('Vencimento financeiro aparece com valor e link', origemDe(lanc)?.origem === 'financeiro' && Number(origemDe(lanc)?.valor) === 150 && origemDe(lanc)?.link === '/app/financeiro#pagar');
ok('Nada é copiado para compromissos', (await um('select count(*)::int n from compromissos_agenda where id_empresa=$1', [A])).n === 2);
await c.query("select alterar_situacao_obrigacao($1, 'concluir')", [obrig]);
await c.query("select alterar_status_tarefa($1, 'concluida')", [tarefa]);
ev = await eventos(A, '2026-10-01', '2026-10-31');
ok('Status sincronizado com a origem (obrigação e tarefa concluídas)', origemDe(obrig)?.status === 'concluido' && origemDe(tarefa)?.status === 'concluido');

// ===== Contador: só o que o vínculo permite =====
const vinc = (await um("select solicitar_vinculo_contabil($1,$2,null,'principal',$3) id", [A, contC, ['gerenciar_obrigacoes']])).id;
await como(contC);
await falha('Contador com vínculo pendente não acessa', "select * from agenda_eventos($1,'2026-10-01','2026-10-31')", [A], 'Sem acesso');
await c.query('select responder_vinculo_contabil($1, true, null)', [vinc]);
ev = await eventos(A, '2026-10-01', '2026-10-31');
ok('Contador com "Gerenciar obrigações" vê só obrigações (sem compromissos, tarefas ou financeiro)', ev.length > 0 && ev.every((e) => e.origem === 'obrigacao'));
await como(donoA);
await c.query('select encerrar_vinculo_contabil($1, null)', [vinc]);
await como(contC);
await falha('Vínculo encerrado: acesso bloqueado na hora', "select * from agenda_eventos($1,'2026-10-01','2026-10-31')", [A], 'Sem acesso');

// ===== Fuso horário e período =====
await como(donoA);
const tarde = (await salvar(null, A, 'Fim do dia', '2026-10-13T23:30:00-03:00', '2026-10-13T23:59:00-03:00')).id;
ok('Fuso de São Paulo: 23:30 do dia 13 fica no dia 13 (não no 14, apesar de ser 02:30 UTC do dia 14)',
  (await eventos(A, '2026-10-13', '2026-10-13')).some((e) => e.id === tarde) && !(await eventos(A, '2026-10-14', '2026-10-14')).some((e) => e.id === tarde));
await falha('Período acima de 62 dias é recusado', "select * from agenda_eventos($1,'2026-01-01','2026-12-31')", [A], 'Período inválido');

// ===== Exclusão =====
await c.query('select excluir_compromisso($1)', [tarde]);
ok('Excluído sai da agenda (exclusão lógica)', !(await eventos(A, '2026-10-13', '2026-10-13')).some((e) => e.id === tarde));
await admin();
ok('Anônimo sem execução', !(await um("select has_function_privilege('anon','public.agenda_eventos(uuid,date,date)','EXECUTE') p")).p);

await c.query('rollback');
await c.end();
let f = 0;
for (const x of r) { if (!x.ok) f++; console.log(`${x.ok ? '✅' : '❌'} ${x.n}${x.ok ? '' : ` — ${x.x}`}`); }
console.log(`\n${r.length - f}/${r.length} aprovados`);
process.exit(f ? 1 : 0);
