// Excluir imposto e parcelamento tributário (migration 050) no PostgreSQL LOCAL; tudo desfeito no final. Recusa rodar fora de localhost.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
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
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const mais = async (d) => (await um('select ($1::date + $2::int)::text d', [hoje, d])).d;
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
const [contC, contD] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 2")).rows.map((x) => x.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'ex@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`44.${n}${n}${n}.000/0001-0${n}`, `Excluir ${n} LTDA`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
const vinc = async (emp, cont, perms) => (await um("insert into vinculos_contabeis (id_empresa, id_contador, funcao, status, permissoes, origem, aprovado_em) values ($1,$2,'principal','ativo',$3,'empresa',now()) returning id", [emp, cont, perms])).id;
const vC = await vinc(A, contC, ['gerenciar_impostos']);
await vinc(B, contD, ['gerenciar_impostos']);
await como(donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const banco = (await um("select salvar_conta_financeira(null,$1,'Banco',null,'conta_corrente',5000,($2::date - 30),false,null) id", [A, hoje])).id;
const comp = `${hoje.slice(0, 7)}-01`;
const novo = async (quem, tipo, nome, valor = 500) => { await como(quem); return (await um('select salvar_imposto(null,$1,$2,$3,$4,$5::date,$6::date,$7,null) id', [A, tipo, nome, 'Receita', comp, await mais(10), valor])).id; };
const lanc = async (imp) => { await admin(); return um('select * from lancamentos_financeiros where id_imposto = $1', [imp]); };
const lista = async (quem, origem = 'todos') => { await como(quem); return (await c.query('select * from buscar_impostos($1,null,null,null,null,$2,200,0)', [A, origem])).rows; };

// ---------- Estrutura ----------
ok('Anônimo não executa; usuário logado executa as duas funções; gatilho interno fora do alcance', !(await um("select has_function_privilege('anon','public.excluir_imposto(uuid)','EXECUTE') or has_function_privilege('anon','public.excluir_parcelamento_tributario(uuid)','EXECUTE') x")).x
  && (await um("select has_function_privilege('authenticated','public.excluir_imposto(uuid)','EXECUTE') and has_function_privilege('authenticated','public.excluir_parcelamento_tributario(uuid)','EXECUTE') x")).x
  && !(await um("select has_function_privilege('authenticated','public.bloquear_imposto_excluido()','EXECUTE') x")).x);

// ---------- Contador exclui imposto corrente ----------
const das = await novo(contC, 'das', 'DAS – Simples Nacional', 1250);
const fgts = await novo(contC, 'fgts', 'FGTS Digital', 850);
ok('Antes: 2 impostos listados e a pagar = 2.100', (await lista(contC)).length === 2 && Number((await um('select resumo_impostos($1) r', [A])).r.a_pagar) === 2100);
await como(contC);
await c.query('select excluir_imposto($1)', [das]);
await como(contC);
ok('Some da lista e do resumo (a pagar = 850)', (await lista(contC)).map((x) => x.id).join() === fgts && Number((await um('select resumo_impostos($1) r', [A])).r.a_pagar) === 850);
const l1 = await lanc(das);
ok('Lançamento em Contas a pagar também é excluído (exclusão lógica, autor registrado)', l1.excluido_em !== null && l1.excluido_por === contC);
ok('Nada é apagado: registro e histórico continuam', (await um('select excluido_em, excluido_por from impostos where id=$1', [das])).excluido_por === contC
  && (await um("select count(*) n from historico_impostos where id_imposto=$1 and acao='excluido' and id_usuario=$2", [das, contC])).n === '1');
await como(contC);
await falha('Excluir de novo falha', 'select excluir_imposto($1)', [das], 'Imposto não encontrado');
await admin();
await falha('Imposto excluído não pode mais ser alterado (nem por funções antigas)', "update impostos set nome = 'Outro nome' where id = $1", [das], 'excluído');
await como(donoA);
await falha('…nem editado pelo dono', "select salvar_imposto($1,$2,'das','Novo nome','Receita',$3::date,$4::date,100,null)", [das, A, comp, await mais(5)], 'excluído');
await falha('…nem receber guia', "select registrar_arquivo_imposto($1,'guia',$2,'x.pdf',10)", [das, `${A}/${das}/guia-${randomUUID()}.pdf`], '');
// recadastrar o mesmo tributo/competência depois de excluir é permitido
const das2 = await novo(donoA, 'das', 'DAS – Simples Nacional', 1300);
ok('O mesmo tributo/competência pode ser cadastrado de novo após excluir', !!das2 && (await lista(donoA)).length === 2);
await como(donoA);
await falha('…mas continua sem duplicar entre itens ativos', "select salvar_imposto(null,$1,'das','DAS – Simples Nacional','Receita',$2::date,$3::date,1,null)", [A, comp, await mais(9)], 'Já existe');

// ---------- Permissão e isolamento ----------
await como(contD);
await falha('Contador de outra empresa não exclui', 'select excluir_imposto($1)', [fgts], 'Imposto não encontrado');
await como(master);
await falha('Admin Master não exclui', 'select excluir_imposto($1)', [fgts], 'Imposto não encontrado');
await admin();
await c.query("update vinculos_contabeis set permissoes = '{ver_documentos}' where id = $1", [vC]);
await como(contC);
await falha('Contador sem "gerenciar_impostos" não exclui', 'select excluir_imposto($1)', [fgts], 'Imposto não encontrado');
await admin();
await c.query("update vinculos_contabeis set permissoes = '{gerenciar_impostos}' where id = $1", [vC]);
await como(donoA);
await c.query('select excluir_imposto($1)', [fgts]);
ok('Dono/sócio exclui', (await um('select excluido_por from impostos where id=$1', [fgts])).excluido_por === donoA);

// ---------- Imposto pago não exclui; estornar libera ----------
const iss = await novo(donoA, 'iss', 'ISSQN', 180);
await como(donoA);
await c.query('select confirmar_pagamento_imposto($1,$2::date,$3)', [iss, hoje, banco]);
await falha('Imposto pago: estorne antes de excluir', 'select excluir_imposto($1)', [iss], 'estorne');
const lIss = (await lanc(iss)).id;
await como(donoA);
await c.query('select estornar_baixa_lancamento($1)', [lIss]);
await como(donoA);
await c.query('select excluir_imposto($1)', [iss]);
ok('Depois do estorno o imposto pode ser excluído', (await um('select excluido_em from impostos where id=$1', [iss])).excluido_em !== null);

// ---------- Parcelamentos ----------
await como(contC);
const parcelas = JSON.stringify([{ vencimento: await mais(10), valor: 100 }, { vencimento: await mais(40), valor: 100 }, { vencimento: await mais(70), valor: 100 }]);
const parc = (await um("select salvar_parcelamento_tributario($1,'PGFN – Dívida Ativa','PGFN','ACORDO-1',300,null,$2::jsonb) id", [A, parcelas])).id;
const parcela = async () => (await c.query('select id, numero_parcela from impostos where id_parcelamento=$1 and excluido_em is null order by numero_parcela', [parc])).rows;
await admin();
const ps = await parcela();
ok('Parcelamento criado com 3 parcelas', ps.length === 3 && (await lista(contC, 'parcelas')).length === 3);
await como(contC);
await c.query('select excluir_imposto($1)', [ps[1].id]); // exclui só a parcela 2
await como(contC);
const aposParcela = (await c.query('select * from listar_parcelamentos_tributarios($1)', [A])).rows[0];
ok('Parcela excluída some; o parcelamento passa a ter 2 parcelas e saldo de R$ 200', (await lista(contC, 'parcelas')).length === 2 && Number(aposParcela.parcelas) === 2 && Number(aposParcela.saldo) === 200);
// parcela paga bloqueia a exclusão do parcelamento
await como(donoA);
await c.query('select confirmar_pagamento_imposto($1,$2::date,$3)', [ps[0].id, hoje, banco]);
await como(contC);
await falha('Parcelamento com parcela paga não é excluído', 'select excluir_parcelamento_tributario($1)', [parc], 'parcelas pagas');
await como(donoA);
const lP0 = (await lanc(ps[0].id)).id;
await como(donoA);
await c.query('select estornar_baixa_lancamento($1)', [lP0]);
await como(contC);
await c.query('select excluir_parcelamento_tributario($1)', [parc]);
await como(contC);
ok('Parcelamento excluído: some das listas, parcelas e lançamentos também', (await c.query('select * from listar_parcelamentos_tributarios($1)', [A])).rows.length === 0 && (await lista(contC)).length === 1 /* só o DAS recadastrado */
  && (await conta('select count(*) n from lancamentos_financeiros l join impostos i on i.id = l.id_imposto where i.id_parcelamento = $1 and l.excluido_em is null', [parc])) === 0);
ok('Histórico "parcelamento_excluido" registrado', (await um("select count(*) n from historico_impostos where id_parcelamento=$1 and acao='parcelamento_excluido' and id_usuario=$2", [parc, contC])).n === '1');
await falha('Excluir parcelamento de novo falha', 'select excluir_parcelamento_tributario($1)', [parc], 'Parcelamento não encontrado');
await como(donoA);
const parc2 = (await um("select salvar_parcelamento_tributario($1,'PGFN – Dívida Ativa','PGFN','ACORDO-1',200,null,$2::jsonb) id", [A, JSON.stringify([{ vencimento: await mais(10), valor: 200 }])])).id;
ok('O mesmo número de acordo pode ser usado de novo após excluir', !!parc2);
await como(contD);
await falha('Contador de outra empresa não exclui parcelamento', 'select excluir_parcelamento_tributario($1)', [parc2], 'Parcelamento não encontrado');
await como(master);
await falha('Admin Master não exclui parcelamento', 'select excluir_parcelamento_tributario($1)', [parc2], 'Parcelamento não encontrado');

// ---------- Financeiro continua coerente ----------
await como(donoA);
ok('Contas a pagar do Financeiro não mostram o que foi excluído', await conta("select count(*) n from lancamentos_financeiros_situacao s join lancamentos_financeiros l on l.id = s.id where s.id_empresa=$1 and l.id_imposto = any($2)", [A, [das, fgts, iss]]) === 0);

await admin();
await c.query('rollback');
await c.end();
for (const y of r) console.log(`${y.ok ? 'OK   ' : 'FALHA'} ${y.n}${y.x ? `  [${y.x}]` : ''}`);
const f = r.filter((y) => !y.ok).length;
console.log(`\n${r.length - f}/${r.length} verificações OK`);
process.exit(f ? 1 : 0);
