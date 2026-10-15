// Agenda do contador (migration 046) no PostgreSQL LOCAL; tudo desfeito no final. Recusa rodar fora de localhost.
// Compromissos pessoais, compartilhamento com a empresa, privacidade, permissão "gerenciar_agenda", vínculo ativo, isolamento.
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
async function falha(n, s, p, t) { await c.query('savepoint t'); try { await c.query(s, p); await c.query('release savepoint t'); ok(n, false, 'não falhou'); } catch (e) { await c.query('rollback to savepoint t'); ok(n, !t || e.message.includes(t), e.message.slice(0, 110)); } }
const salvar = (id, emp, titulo, vis = 'privado', resp = null, status = null, dia = '2026-10-20') =>
  um("select salvar_compromisso($1,$2,$3,'desc','Escritório',$4::timestamptz,$5::timestamptz,false,'reuniao',$6,$7,$8) id", [id, emp, titulo, `${dia}T09:00:00-03:00`, `${dia}T10:00:00-03:00`, status, resp, vis]);
const daEmpresa = async (emp) => (await c.query("select * from agenda_eventos($1,'2026-10-01','2026-10-31')", [emp])).rows;
const doContador = async (emp = null) => (await c.query("select * from agenda_contador('2026-10-01','2026-10-31',$1)", [emp])).rows;
const titulos = (rows) => rows.filter((x) => x.origem === 'compromisso').map((x) => x.titulo).sort().join('|');
const qtdNotif = async (u, tipo = 'agenda') => (await um("select count(*)::int n from notificacoes where id_usuario=$1 and tipo=$2", [u, tipo])).n;

await c.query('begin');
await admin();
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
const [contC, contD] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 2")).rows.map((x) => x.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'ac@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`66.${n}${n}${n}.000/0001-0${n}`, `Agenda Contador ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
const vincular = async (dono, emp, cont, perms, funcao = 'principal') => {
  await como(dono);
  const id = (await um("select solicitar_vinculo_contabil($1,$2,null,$4,$3) id", [emp, cont, perms, funcao])).id;
  await como(cont);
  await c.query('select responder_vinculo_contabil($1, true, null)', [id]);
  return id;
};

// ===== Sem vínculo / sem permissão =====
await como(contC);
await falha('Contador sem vínculo não cria compromisso na empresa', "select salvar_compromisso(null,$1,'Invasão','d','l','2026-10-20T09:00:00-03:00','2026-10-20T10:00:00-03:00',false,'reuniao',null,null,'privado')", [A], 'Sem acesso');
await falha('Contador sem vínculo não lê a agenda da empresa', "select * from agenda_eventos($1,'2026-10-01','2026-10-31')", [A], 'Sem acesso');
const vC = await vincular(donoA, A, contC, ['ver_documentos', 'gerenciar_agenda']);
const vD = await vincular(donoA, A, contD, ['ver_documentos'], 'auxiliar');
await admin();
ok('Permissão "gerenciar_agenda" aceita no vínculo', (await um('select permissoes from vinculos_contabeis where id=$1', [vC])).permissoes.includes('gerenciar_agenda'));
await como(contD);
await falha('Contador com vínculo mas SEM "gerenciar_agenda" não cria compromisso', "select salvar_compromisso(null,$1,'Sem permissão','d','l','2026-10-20T09:00:00-03:00','2026-10-20T10:00:00-03:00',false,'reuniao',null,null,'compartilhado')", [A], 'Sem acesso');
await falha('Sem "gerenciar_agenda" não lê agenda da empresa', "select * from agenda_eventos($1,'2026-10-01','2026-10-31')", [A], 'Sem acesso');
await falha('Sem "gerenciar_agenda" não lista participantes', 'select * from membros_agenda($1)', [A], 'Sem acesso');

// ===== Compromisso pessoal =====
await como(contC);
const pessoal = (await salvar(null, null, 'Estudo CRC', 'privado')).id;
ok('Contador cria compromisso pessoal (sem empresa), responsável = ele', (await um('select id_empresa, id_responsavel, visibilidade from compromissos_agenda where id=$1', [pessoal])).id_empresa === null);
await falha('Pessoal não pode ser compartilhado', "select salvar_compromisso(null,null,'Teste','d','l','2026-10-20T09:00:00-03:00','2026-10-20T10:00:00-03:00',false,'reuniao',null,null,'compartilhado')", [], 'sempre privado');
await falha('Pessoal só pode ter ele como responsável', "select salvar_compromisso(null,null,'Teste','d','l','2026-10-20T09:00:00-03:00','2026-10-20T10:00:00-03:00',false,'reuniao',null,$1,'privado')", [donoA], 'só pode ter você');
await como(donoA);
await falha('Empresário não cria compromisso pessoal (sem empresa)', "select salvar_compromisso(null,null,'Teste','d','l','2026-10-20T09:00:00-03:00','2026-10-20T10:00:00-03:00',false,'reuniao',null,null,'privado')", [], 'Informe a empresa');
await como(contD);
await falha('Outro contador não edita o pessoal', "select salvar_compromisso($1,null,'Hack','d','l','2026-10-20T09:00:00-03:00','2026-10-20T10:00:00-03:00',false,'reuniao',null,null,'privado')", [pessoal], 'não encontrado');
ok('Outro contador não vê o compromisso pessoal (agenda e tabela)', !titulos(await doContador()).includes('Estudo CRC') && (await c.query('select 1 from compromissos_agenda where id=$1', [pessoal])).rows.length === 0);
await como(donoA);
ok('Empresário não vê compromisso pessoal do contador', (await c.query('select 1 from compromissos_agenda where id=$1', [pessoal])).rows.length === 0);

// ===== Privado da empresa × compartilhado =====
await como(contC);
const privEmp = (await salvar(null, A, 'Anotação só minha sobre Agenda 1', 'privado')).id;
await como(donoA);
ok('Compromisso "privado" do contador na empresa NÃO aparece para o empresário', !titulos(await daEmpresa(A)).includes('Anotação só minha') && (await c.query('select 1 from compromissos_agenda where id=$1', [privEmp])).rows.length === 0);
await como(contC);
await falha('Contador não usa visibilidade "empresa" (interna)', "select salvar_compromisso(null,$1,'Interno','d','l','2026-10-20T09:00:00-03:00','2026-10-20T10:00:00-03:00',false,'reuniao',null,null,'empresa')", [A], 'interna dos membros');
const n0 = await qtdNotif(donoA);
const compart = (await salvar(null, A, 'Reunião de fechamento', 'compartilhado', donoA)).id;
await como(donoA);
const evA = (await daEmpresa(A)).find((x) => x.titulo === 'Reunião de fechamento');
ok('Compartilhado pelo contador aparece na Agenda do empresário (editável por ele)', evA && evA.editavel && evA.visibilidade === 'compartilhado' && evA.id_responsavel === donoA);
ok('Empresário recebe aviso do compromisso compartilhado', await qtdNotif(donoA) === n0 + 1);
await como(contC);
ok('Contador vê o compartilhado na própria agenda, com o nome da empresa', (await doContador()).some((x) => x.titulo === 'Reunião de fechamento' && x.empresa_nome === 'Agenda Contador 1'));
ok('Agenda do contador filtra por empresa e inclui pessoal', titulos(await doContador(A)) === 'Anotação só minha sobre Agenda 1|Reunião de fechamento' && titulos(await doContador()).includes('Estudo CRC'));

// ===== Sincronização =====
await como(donoA);
await salvar(compart, A, 'Reunião de fechamento', 'compartilhado', donoA, 'concluido');
await como(contC);
ok('Conclusão pelo empresário reflete para o contador (mesma linha)', (await doContador(A)).find((x) => x.titulo === 'Reunião de fechamento').status === 'concluido');
await salvar(compart, A, 'Reunião de fechamento (remarcada)', 'compartilhado', donoA, 'agendado', '2026-10-22');
await como(donoA);
ok('Alteração pelo contador reflete para o empresário', (await daEmpresa(A)).some((x) => x.titulo === 'Reunião de fechamento (remarcada)' && x.status === 'agendado'));

// ===== Empresário compartilha / privados do empresário =====
const nC = await qtdNotif(contC);
const doEmp = (await salvar(null, A, 'Alinhamento com o contador', 'compartilhado', null)).id;
const empInterno = (await salvar(null, A, 'Reunião interna de sócios', 'empresa', null)).id;
const empPriv = (await salvar(null, A, 'Consulta médica do dono', 'privado', null)).id;
await como(contC);
ok('Contador recebe aviso do compartilhado pela empresa', await qtdNotif(contC) === nC + 1);
const ve = titulos(await doContador(A));
ok('Contador vê o compartilhado do empresário', ve.includes('Alinhamento com o contador'));
ok('Contador NÃO vê compromissos internos ("empresa") nem privados do empresário', !ve.includes('Reunião interna') && !ve.includes('Consulta médica') && (await c.query('select 1 from compromissos_agenda where id in ($1,$2)', [empInterno, empPriv])).rows.length === 0);
await falha('Contador não edita compromisso do empresário (não é criador/responsável)', "select salvar_compromisso($1,null,'Hack','d','l','2026-10-20T09:00:00-03:00','2026-10-20T10:00:00-03:00',false,'reuniao',null,null,'compartilhado')", [doEmp], 'não encontrado');
await falha('Contador não exclui compromisso do empresário', 'select excluir_compromisso($1)', [doEmp], 'não encontrado');

// ===== Responsável =====
await como(contC);
const parts = (await c.query('select nome from membros_agenda($1)', [A])).rows.map((x) => x.nome);
ok('Participantes para o contador: ele mesmo + donos/sócios (sem listar todos os membros)', parts.length === 2);
await falha('Responsável contador não vale em compromisso interno do empresário', "select salvar_compromisso(null,$1,'Teste','d','l','2026-10-20T09:00:00-03:00','2026-10-20T10:00:00-03:00',false,'reuniao',null,$2,'empresa')", [A, contC], 'interna dos membros').catch(() => {});
await falha('Responsável estranho à empresa recusado', "select salvar_compromisso(null,$1,'Teste','d','l','2026-10-20T09:00:00-03:00','2026-10-20T10:00:00-03:00',false,'reuniao',null,$2,'compartilhado')", [A, donoB], 'responsável precisa');
const privResp = (await salvar(null, A, 'Pauta reservada para o dono', 'privado', donoA)).id;
await como(donoA);
ok('Privado do contador com responsável membro: só o criador e o responsável veem', (await c.query('select 1 from compromissos_agenda where id=$1', [privResp])).rows.length === 1);
await como(contC);
await c.query('select excluir_compromisso($1)', [privResp]);
await como(donoA);
await falha('Empresário não põe o contador como responsável em compromisso privado', "select salvar_compromisso(null,$1,'Teste','d','l','2026-10-20T09:00:00-03:00','2026-10-20T10:00:00-03:00',false,'reuniao',null,$2,'privado')", [A, contC], 'responsável precisa');
const comContResp = (await salvar(null, A, 'Revisão de balanço', 'compartilhado', contC)).id;
await como(contC);
ok('Contador como responsável de compartilhado do empresário: vê e pode editar', (await doContador(A)).find((x) => x.titulo === 'Revisão de balanço')?.editavel === true);

// ===== Exclusão =====
await c.query('select excluir_compromisso($1)', [privEmp]);
await como(donoA);
await c.query('select excluir_compromisso($1)', [compart]);
await como(contC);
ok('Empresário (gestor) exclui compromisso compartilhado: sai da agenda dos dois', !titulos(await doContador(A)).includes('Reunião de fechamento'));

// ===== Outras empresas e isolamento =====
await como(donoB);
ok('Outra empresa não enxerga nada da A (agenda, tabela)', (await c.query('select 1 from compromissos_agenda where id_empresa=$1', [A])).rows.length === 0);
await falha('Outra empresa não lê a agenda de A', "select * from agenda_eventos($1,'2026-10-01','2026-10-31')", [A], 'Sem acesso');
await como(contC);
await falha('Contador não lê agenda de empresa sem vínculo (B)', "select * from agenda_eventos($1,'2026-10-01','2026-10-31')", [B], 'Sem acesso');
ok('agenda_contador com empresa sem vínculo não devolve nada dela', (await doContador(B)).length === 0);
await falha('Período acima de 62 dias recusado', "select * from agenda_contador('2026-01-01','2026-12-31',null)", [], 'Período inválido');
await como(master);
ok('Admin Master não lê compromissos pela tabela', (await c.query('select 1 from compromissos_agenda')).rows.length === 0);
await falha('Admin Master não usa a agenda do contador', "select * from agenda_contador('2026-10-01','2026-10-31',null)", [], 'contadores');
await como(donoA);
await falha('Empresário não usa a agenda do contador', "select * from agenda_contador('2026-10-01','2026-10-31',null)", [], 'contadores');

// ===== Obrigações na agenda do contador (leitura, só empresas com permissão) =====
await admin();
await c.query("insert into obrigacoes_empresa (id_empresa, titulo, data_vencimento) values ($1,'DAS de outubro','2026-10-20')", [A]);
await como(contC);
ok('Obrigações aparecem só se tiver "gerenciar_obrigacoes" (aqui não tem: nenhuma)', !(await doContador(A)).some((x) => x.origem === 'obrigacao'));
await como(donoA);
await c.query("select alterar_vinculo_contabil($1,'principal',$2)", [vC, ['gerenciar_agenda', 'gerenciar_obrigacoes']]);
await como(contC);
ok('Com "gerenciar_obrigacoes" as obrigações entram (somente leitura)', (await doContador(A)).some((x) => x.origem === 'obrigacao' && x.titulo === 'DAS de outubro' && x.editavel === false));

// ===== Perder permissão / vínculo =====
await como(donoA);
await c.query("select alterar_vinculo_contabil($1,'principal',$2)", [vC, ['ver_documentos']]);
await como(contC);
const aposPerm = await doContador();
ok('Sem a permissão: some tudo da empresa (inclusive o que o contador criou); o pessoal fica', !titulos(aposPerm).includes('Alinhamento') && !titulos(aposPerm).includes('Anotação') && titulos(aposPerm).includes('Estudo CRC'));
await falha('Sem a permissão não edita o que criou na empresa', "select salvar_compromisso($1,null,'Teste','d','l','2026-10-20T09:00:00-03:00','2026-10-20T10:00:00-03:00',false,'reuniao',null,null,'compartilhado')", [comContResp], 'não encontrado');
await como(donoA);
await c.query("select alterar_vinculo_contabil($1,'principal',$2)", [vC, ['gerenciar_agenda']]);
await c.query('savepoint enc');
try { await c.query("select encerrar_vinculo_contabil($1,'fim do contrato')", [vC]); await c.query('release savepoint enc'); } catch { await c.query('rollback to savepoint enc'); }
await admin();
if ((await um('select status from vinculos_contabeis where id=$1', [vC])).status !== 'ativo') {
  await como(contC);
  ok('Vínculo encerrado: contador perde os compromissos compartilhados da empresa', (await doContador()).every((x) => x.id_empresa !== A) && titulos(await doContador()).includes('Estudo CRC'));
  await falha('Vínculo encerrado: não cria compromisso na empresa', "select salvar_compromisso(null,$1,'Depois do fim','d','l','2026-10-20T09:00:00-03:00','2026-10-20T10:00:00-03:00',false,'reuniao',null,null,'compartilhado')", [A], 'Sem acesso');
} else ok('Vínculo encerrado (encerramento indisponível neste banco)', true);
await admin();
ok('Anônimo sem execução', !(await um("select has_function_privilege('anon','public.agenda_contador(date,date,uuid)','EXECUTE') p")).p);
ok('Sem escrita direta em compromissos', !(await um("select has_table_privilege('authenticated','public.compromissos_agenda','INSERT') p")).p);
ok('Compromissos antigos preservados (constraint nova aceita empresa/privado/compartilhado)', (await um("select count(*)::int n from compromissos_agenda where visibilidade in ('privado','empresa','compartilhado')")).n === (await um('select count(*)::int n from compromissos_agenda')).n);

await c.query('rollback');
await c.end();
let f = 0;
for (const x of r) { if (!x.ok) f++; console.log(`${x.ok ? '✅' : '❌'} ${x.n}${x.ok ? '' : ` — ${x.x}`}`); }
console.log(`\n${r.length - f}/${r.length} aprovados`);
process.exit(f ? 1 : 0);
