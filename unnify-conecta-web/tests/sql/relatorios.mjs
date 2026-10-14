// Relatórios (migration 040) no PostgreSQL LOCAL; tudo desfeito no final. Cálculos, critérios, períodos equivalentes,
// filtro de categoria, previsto x realizado, pagamento parcial sem duplicar, fluxo de caixa e acesso.
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
async function falha(n, s, p, t) { await c.query('savepoint t'); try { await c.query(s, p); await c.query('release savepoint t'); ok(n, false, 'não falhou'); } catch (e) { await c.query('rollback to savepoint t'); ok(n, !t || e.message.includes(t), e.message.slice(0, 100)); } }
const N = Number;

await c.query('begin');
await admin();
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const d = async (n) => (await um('select ($1::date + $2::int)::text d', [hoje, n])).d;
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
const [contC] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 1")).rows.map((x) => x.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'rl@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`11.${n}${n}${n}.000/0001-0${n}`, `Relatórios ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
await como(donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const cats = Object.fromEntries((await c.query('select nome, id from categorias_financeiras where id_empresa=$1', [A])).rows.map((x) => [x.nome, x.id]));
const conta = (await um("select salvar_conta_financeira(null,$1,'Banco Rel',null,'conta_corrente',50000,($2::date - 120),false,null) id", [A, hoje])).id;
const lanc = async (tipo, valor, cat, { pago = null, venc = null, natureza = null, contraparte = null } = {}) =>
  (await um("select salvar_lancamento_financeiro(null,$1,$2,'Teste',$3,$4,coalesce($5::date,$6::date),$6::date,$5::date,$7,null,$8,$9) id",
    [A, tipo, valor, cats[cat], pago, venc ?? pago, contraparte, pago ? conta : null, natureza])).id;

// Período = últimos 30 dias (hoje-29 .. hoje); anterior = 30 dias antes
const ini = await d(-29);
await lanc('receita', 1000, 'Prestação de serviços', { pago: await d(-2) });
await lanc('receita', 500, 'Venda de produtos', { pago: await d(-10) });
await lanc('despesa', 300, 'Aluguel', { pago: await d(-5) });
await lanc('despesa', 200, 'Internet', { pago: await d(-6) });
await lanc('receita', 400, 'Prestação de serviços', { pago: await d(-40) });           // anterior
await lanc('despesa', 100, 'Aluguel', { pago: await d(-45) });                         // anterior
await lanc('receita', 5000, 'Outras receitas', { pago: await d(-3), natureza: 'aporte_socio', contraparte: 'Sócio' }); // não operacional
await lanc('receita', 700, 'Prestação de serviços', { venc: await d(-4) });            // pendente vencido (previsto)
await lanc('receita', 250, 'Prestação de serviços', { venc: await d(3) });             // vencendo 7 dias
await lanc('receita', 90, 'Prestação de serviços', { venc: await d(20) });             // em dia
await lanc('despesa', 150, 'Aluguel', { venc: await d(-1) });                          // a pagar vencido
// Pagamento "parcial" representado por dois lançamentos (como a folha faz): soma sem duplicar
await lanc('despesa', 60, 'Salários', { pago: await d(-1) });
await lanc('despesa', 40, 'Salários', { pago: await d(-1) });

const rel = async (cat = null, i = ini, f = hoje) => (await um('select relatorio_financeiro($1,$2::date,$3::date,$4) r', [A, i, f, cat])).r;
let x = await rel();
ok('Receitas realizadas = só operacionais pagas no período (1000+500)', N(x.receitas) === 1500 && x.receitas_qtd === 2);
ok('Despesas realizadas incluem pagamento parcial sem duplicar (300+200+60+40)', N(x.despesas) === 600);
ok('Resultado gerencial = receitas − despesas', N(x.resultado) === 900);
ok('Previsto (pendente) não entra como realizado', N(x.receitas) === 1500);
ok('Aporte aparece à parte (não operacional)', N(x.nao_operacionais_entradas) === 5000);
ok('Período anterior de mesma duração', x.anterior_inicio === (await d(-59)) && x.anterior_fim === (await d(-30)) && N(x.receitas_anterior) === 400 && N(x.despesas_anterior) === 100);
ok('A receber: vencido / vencendo 7 dias / em dia', N(x.a_receber.vencido) === 700 && N(x.a_receber.vencendo_7) === 250 && N(x.a_receber.em_dia) === 90 && N(x.a_receber.total) === 1040);
ok('A pagar vencido', N(x.a_pagar.vencido) === 150 && N(x.a_pagar.total) === 150);
const catAluguel = x.despesas_por_categoria.find((k) => k.categoria === 'Aluguel');
ok('Despesas por categoria (realizadas no período)', N(catAluguel.valor) === 300 && x.despesas_por_categoria.reduce((t, k) => t + N(k.valor), 0) === 600);
const mesAtual = x.serie.at(-1);
ok('Série de 12 meses até o fim do período', x.serie.length === 12);
const entradasTot = x.serie.reduce((t, m) => t + N(m.entradas), 0);
ok('Fluxo de caixa = movimentações efetivas (inclui aporte; não inclui previstos)', entradasTot === 1000 + 500 + 400 + 5000);
let y = await rel(cats['Aluguel']);
ok('Filtro de categoria aplicado a todos os números', N(y.receitas) === 0 && N(y.despesas) === 300 && N(y.a_pagar.total) === 150 && N(y.a_receber.total) === 0);
await falha('Período acima de 1 ano é recusado', "select relatorio_financeiro($1,'2025-01-01','2026-06-30',null)", [A], 'Período inválido');

// ===== Acesso =====
await como(donoB);
await c.query('select inicializar_categorias_financeiras($1)', [B]);
const catB = (await um("select id from categorias_financeiras where id_empresa=$1 and tipo='despesa' limit 1", [B])).id;
await falha('Outra empresa não lê o relatório', 'select relatorio_financeiro($1,$2::date,$3::date,null)', [A, ini, hoje], 'Sem permissão');
await como(donoA);
await falha('Categoria de outra empresa no filtro é recusada (ID manipulado)', 'select relatorio_financeiro($1,$2::date,$3::date,$4)', [A, ini, hoje, catB], 'Categoria inválida');
await como(master);
await falha('Admin Master sem acesso automático', 'select relatorio_financeiro($1,$2::date,$3::date,null)', [A, ini, hoje], 'Sem permissão');
await como(donoA);
const vinc = (await um("select solicitar_vinculo_contabil($1,$2,null,'principal',$3) id", [A, contC, ['ver_documentos']])).id;
await como(contC);
await c.query('select responder_vinculo_contabil($1, true, null)', [vinc]);
await falha('Contador sem "Ver financeiro" não lê', 'select relatorio_financeiro($1,$2::date,$3::date,null)', [A, ini, hoje], 'Sem permissão');
ok('Contador sem permissão não lê o detalhamento (RLS da visão)', (await c.query('select 1 from lancamentos_financeiros_situacao where id_empresa=$1', [A])).rows.length === 0);
await como(donoA);
await c.query("select alterar_vinculo_contabil($1,'principal',$2)", [vinc, ['ver_financeiro']]);
await como(contC);
ok('Contador com "Ver financeiro" vê os mesmos números', N((await rel()).resultado) === 900);
await admin();
ok('Anônimo sem execução', !(await um("select has_function_privilege('anon','public.relatorio_financeiro(uuid,date,date,uuid)','EXECUTE') p")).p);

await c.query('rollback');
await c.end();
let f = 0;
for (const z of r) { if (!z.ok) f++; console.log(`${z.ok ? '✅' : '❌'} ${z.n}${z.ok ? '' : ` — ${z.x}`}`); }
console.log(`\n${r.length - f}/${r.length} aprovados`);
process.exit(f ? 1 : 0);
