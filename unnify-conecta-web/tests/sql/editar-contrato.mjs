// Edição de contrato parcelado (migration 036) no PostgreSQL LOCAL; tudo desfeito no final. Recusa rodar fora de localhost.
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

await c.query('begin');
await admin();
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'k@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`55.${n}${n}${n}.000/0001-0${n}`, `Edit ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
await como(donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const [cat1, cat2] = (await c.query("select id from categorias_financeiras where id_empresa=$1 and tipo='despesa' order by nome limit 2", [A])).rows.map((x) => x.id);
const conta = (await um("select salvar_conta_financeira(null,$1,'Banco Edit',null,'conta_corrente',5000,($2::date - 30),false,null) id", [A, hoje])).id;
const parcelas = [1, 2, 3].map((i) => ({ numero: i, valor: 100, vencimento: (new Date(Date.parse(hoje) + i * 30 * 86400000)).toISOString().slice(0, 10) }));
const ct = (await um("select criar_contrato_parcelado($1,'Notebook Dell','compra_parcelada','Loja X',$2,'obs',$3::date,300,300,null,'personalizadas',null,null,$4::jsonb) id", [A, cat1, hoje, JSON.stringify(parcelas)])).id;
const p1 = (await um('select id from lancamentos_financeiros where id_contrato=$1 and numero_parcela=1', [ct])).id;
await c.query('select registrar_baixa_lancamento($1, $2::date, $3, 100)', [p1, hoje, conta]);

await c.query("select atualizar_contrato_parcelado($1,'Notebook Dell XPS','Loja Y',$2,'nova obs',$3)", [ct, cat2, conta]);
const k = await um('select nome, contraparte, id_categoria, descricao, id_conta_financeira, valor_total from contratos_parcelados where id=$1', [ct]);
ok('Dados cadastrais atualizados', k.nome === 'Notebook Dell XPS' && k.contraparte === 'Loja Y' && k.id_categoria === cat2 && k.descricao === 'nova obs' && k.id_conta_financeira === conta);
ok('Valores do contrato não mudam', Number(k.valor_total) === 300);
const ps = (await c.query('select numero_parcela, status, descricao, contraparte, id_categoria, valor from lancamentos_financeiros where id_contrato=$1 order by numero_parcela', [ct])).rows;
ok('Parcelas pendentes acompanham (descrição, credor, categoria)', ps.filter((p) => p.status === 'pendente').every((p) => p.descricao === `Notebook Dell XPS — parcela ${p.numero_parcela}/3` && p.contraparte === 'Loja Y' && p.id_categoria === cat2));
ok('Parcela paga fica como registrada', ps[0].status === 'pago' && ps[0].descricao === 'Notebook Dell — parcela 1/3' && ps[0].contraparte === 'Loja X' && ps[0].id_categoria === cat1);
ok('Valores das parcelas inalterados', ps.every((p) => Number(p.valor) === 100));
const h = await um("select dados from historico_contratos where id_contrato=$1 and acao='editado'", [ct]);
ok('Histórico com antes/depois', h && h.dados.antes.nome === 'Notebook Dell' && h.dados.depois.nome === 'Notebook Dell XPS' && h.dados.parcelas_pendentes_atualizadas === 2);
await falha('Nome curto recusado', "select atualizar_contrato_parcelado($1,'X',null,$2,null,null)", [ct, cat2], 'nome');
await falha('Categoria de outra empresa recusada', "select atualizar_contrato_parcelado($1,'Nome ok',null,(select id from categorias_financeiras where id_empresa<>$2 and tipo='despesa' limit 1),null,null)", [ct, A], 'categoria');
await falha('Parcela do contrato continua protegida fora da função (sem escrita direta)', "update lancamentos_financeiros set id_categoria=$2 where id_contrato=$1 and status='pendente'", [ct, cat1], 'permission denied');
await como(donoB);
await falha('Outra empresa não edita', "select atualizar_contrato_parcelado($1,'Invasão',null,$2,null,null)", [ct, cat2], 'não encontrado');
await como(donoA);
await c.query("select cancelar_contrato_parcelado($1, 'teste de cancelamento')", [ct]);
await falha('Contrato cancelado não é editado', "select atualizar_contrato_parcelado($1,'Depois',null,$2,null,null)", [ct, cat2], 'cancelados');
await admin();
ok('Anônimo sem execução', !(await um("select has_function_privilege('anon','public.atualizar_contrato_parcelado(uuid,text,text,uuid,text,uuid)','EXECUTE') p")).p);
await c.query('rollback');
await c.end();
let f = 0;
for (const x of r) { if (!x.ok) f++; console.log(`${x.ok ? '✅' : '❌'} ${x.n}${x.ok ? '' : ` — ${x.x}`}`); }
console.log(`\n${r.length - f}/${r.length} aprovados`);
process.exit(f ? 1 : 0);
