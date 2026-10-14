// Clientes (migration 039) no PostgreSQL LOCAL; tudo desfeito no final. CRUD, documentos, filtros/paginação,
// vínculo com receitas do Financeiro (sem dupla contagem), histórico (LGPD), RLS, contador e IDs de outra empresa.
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
const salvar = (id, emp, tipo, nome, doc, status = 'ativo', extra = {}) =>
  um('select salvar_cliente($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) id',
    [id, emp, tipo, nome, extra.fantasia ?? null, doc, extra.tel ?? '(63) 99234-5678', extra.email ?? null, extra.cep ?? null, extra.rua ?? 'Rua das Flores', '123', null, 'Centro', 'Augustinópolis', 'to', status, extra.obs ?? null]);

await c.query('begin');
await admin();
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
const [contC] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 1")).rows.map((x) => x.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'cl@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`22.${n}${n}${n}.000/0001-0${n}`, `Clientes ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);

// ===== CRUD e validações =====
await como(donoA);
const joao = (await salvar(null, A, 'pf', 'João Silva', '529.982.247-25', 'ativo', { email: 'JOAO@Email.com', obs: 'Prefere sábado' })).id;
const k = await um('select documento, telefone, email, estado from clientes where id=$1', [joao]);
ok('Cria PF normalizando documento, telefone, e-mail e UF', k.documento === '52998224725' && k.telefone === '63992345678' && k.email === 'joao@email.com' && k.estado === 'TO');
const pj = (await salvar(null, A, 'pj', 'Comercial Silva LTDA', '11.222.333/0001-81', 'ativo', { fantasia: 'Comercial Silva' })).id;
const semDoc = (await salvar(null, A, 'pf', 'Maria Oliveira', null, 'prospect')).id;
ok('Cliente sem documento é permitido (prospect)', !!semDoc);
await falha('CPF inválido recusado', "select salvar_cliente(null,$1,'pf','Teste',null,'529.982.247-24',null,null,null,null,null,null,null,null,null,'ativo',null)", [A], 'CPF inválido');
await falha('CNPJ inválido recusado', "select salvar_cliente(null,$1,'pj','Teste',null,'11.222.333/0001-80',null,null,null,null,null,null,null,null,null,'ativo',null)", [A], 'CNPJ inválido');
await falha('Documento duplicado na mesma empresa recusado', "select salvar_cliente(null,$1,'pf','Outro João',null,'52998224725',null,null,null,null,null,null,null,null,null,'ativo',null)", [A], 'Já existe um cliente');
await falha('E-mail inválido recusado', "select salvar_cliente(null,$1,'pf','Teste',null,null,null,'sem-arroba',null,null,null,null,null,null,null,'ativo',null)", [A], 'E-mail inválido');
await falha('Sem escrita direta na tabela', "insert into clientes (id_empresa, nome) values ($1,'Direto')", [A], 'permission denied');
await como(donoB);
ok('Mesmo CPF em OUTRA empresa é permitido', !!(await salvar(null, B, 'pf', 'João na B', '52998224725')).id);
await como(donoA);
await salvar(joao, A, 'pf', 'João da Silva', '529.982.247-25', 'inativo', { email: 'novo@email.com', obs: 'Prefere sábado' });
const hist = (await c.query('select acao, dados from historico_clientes where id_cliente=$1 order by id', [joao])).rows;
ok('Histórico registra criação, status e campos alterados', hist.map((h) => h.acao).join() === 'criado,status,editado' && hist[2].dados.campos.join() === 'nome,contato');
ok('Histórico não guarda dados pessoais (LGPD)', !JSON.stringify(hist).includes('novo@email.com') && !JSON.stringify(hist).includes('52998224725'));

// ===== Filtros e paginação no servidor =====
for (let i = 1; i <= 12; i++) await salvar(null, A, 'pf', `Cliente Lote ${String(i).padStart(2, '0')}`, null, i % 3 === 0 ? 'inativo' : 'ativo');
let pg1 = (await c.query("select * from buscar_clientes($1,'Lote',null,null,null,5,0)", [A])).rows;
let pg3 = (await c.query("select * from buscar_clientes($1,'Lote',null,null,null,5,10)", [A])).rows;
ok('Paginação: 5 por página, total 12, última página com 2', pg1.length === 5 && N(pg1[0].total) === 12 && pg3.length === 2);
ok('Filtro por situação (inativos do lote = 4)', (await c.query("select * from buscar_clientes($1,'Lote','inativo',null,null,50,0)", [A])).rows.length === 4);
ok('Filtro por tipo PJ', (await c.query("select * from buscar_clientes($1,null,null,'pj',null,50,0)", [A])).rows.every((x) => x.tipo_pessoa === 'pj'));
ok('Busca por parte do CNPJ', (await c.query("select * from buscar_clientes($1,'222.333',null,null,null,50,0)", [A])).rows.some((x) => x.id === pj));

// ===== Integração com o Financeiro =====
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const catR = (await um("select id from categorias_financeiras where id_empresa=$1 and tipo='receita' limit 1", [A])).id;
const catD = (await um("select id from categorias_financeiras where id_empresa=$1 and tipo='despesa' limit 1", [A])).id;
const conta = (await um("select salvar_conta_financeira(null,$1,'Banco Cli',null,'conta_corrente',0,($2::date - 60),false,null) id", [A, hoje])).id;
const rec = async (desc, valor, venc, pago = null) => (await um('select salvar_lancamento_financeiro(null,$1,\'receita\',$2,$3,$4,$5::date,$5::date,$6::date,null,null,$7,null) id', [A, desc, valor, catR, venc, pago, pago ? conta : null])).id;
const r1 = await rec('Venda 1', 1000, hoje, hoje);
const r2 = await rec('Venda 2', 500, (await um("select ($1::date + 10)::text d", [hoje])).d);
const r3 = await rec('Venda 3', 300, (await um("select ($1::date - 5)::text d", [hoje])).d);
const desp = (await um("select salvar_lancamento_financeiro(null,$1,'despesa','Compra',100,$2,$3::date,$3::date,null,null,null,null,null) id", [A, catD, hoje])).id;
const resumoAntes = (await um('select resumo_financeiro($1,$2::date) r', [A, `${hoje.slice(0, 7)}-01`])).r;
for (const l of [r1, r2, r3]) await c.query('select vincular_cliente_lancamento($1,$2)', [l, pj]);
const fin = (await c.query('select * from financeiro_cliente($1)', [pj])).rows;
ok('Perfil financeiro mostra as receitas reais vinculadas', fin.length === 3 && fin.some((x) => x.situacao === 'pago') && fin.some((x) => x.situacao === 'vencido') && fin.some((x) => x.situacao === 'pendente'));
let linhaPj = (await c.query('select * from buscar_clientes($1,$2,null,null,null,5,0)', [A, 'Comercial'])).rows[0];
ok('A receber e recebido do cliente calculados dos lançamentos', N(linhaPj.a_receber) === 800 && N(linhaPj.total_recebido) === 1000 && linhaPj.situacao_financeira === 'atrasado');
ok('Resumo: a receber = pendentes vinculados (800), vencido = 300', N((await um('select resumo_clientes($1) r', [A])).r.a_receber) === 800 && N((await um('select resumo_clientes($1) r', [A])).r.a_receber_vencido) === 300);
const resumoDepois = (await um('select resumo_financeiro($1,$2::date) r', [A, `${hoje.slice(0, 7)}-01`])).r;
ok('Vincular não altera o Financeiro (sem dupla contagem)', JSON.stringify(resumoAntes.receitas_mes) === JSON.stringify(resumoDepois.receitas_mes) && N(resumoAntes.saldo_acumulado) === N(resumoDepois.saldo_acumulado));
ok('Vincular não muda valor nem status', N((await um('select valor from lancamentos_financeiros where id=$1', [r2])).valor) === 500 && (await um('select status from lancamentos_financeiros where id=$1', [r1])).status === 'pago');
await c.query('select registrar_baixa_lancamento($1,$2::date,$3,500)', [r2, hoje, conta]);
linhaPj = (await c.query('select * from buscar_clientes($1,$2,null,null,null,5,0)', [A, 'Comercial'])).rows[0];
ok('Indicadores acompanham a baixa no Financeiro', N(linhaPj.a_receber) === 300 && N(linhaPj.total_recebido) === 1500);
await falha('Despesa não pode ser vinculada a cliente', 'select vincular_cliente_lancamento($1,$2)', [desp, pj], 'Só receitas');
ok('Receitas sem cliente listadas para vincular (não traz as já vinculadas)', !(await c.query('select * from receitas_sem_cliente($1,null)', [A])).rows.some((x) => [r1, r2, r3].includes(x.id)));
await c.query('select vincular_cliente_lancamento($1,null)', [r3]);
ok('Desvincular registra no histórico', (await um("select count(*)::int n from historico_clientes where id_cliente=$1 and acao='receita_desvinculada'", [pj])).n === 1);
await salvar(pj, A, 'pj', 'Comercial Silva LTDA', '11.222.333/0001-81', 'inativo', { fantasia: 'Comercial Silva' });
ok('Inativar mantém o histórico financeiro', (await c.query('select * from financeiro_cliente($1)', [pj])).rows.length === 2);

// ===== Isolamento, IDs de outra empresa, contador e admin =====
await como(donoB);
const clienteB = (await um("select id from clientes where nome='João na B'")).id;
await falha('Outra empresa não lista clientes de A', 'select * from buscar_clientes($1)', [A], 'Sem acesso');
await falha('Outra empresa não edita cliente de A (ID manipulado)', "select salvar_cliente($1,$2,'pf','Invasor',null,null,null,null,null,null,null,null,null,null,null,'ativo',null)", [joao, B], 'não encontrado');
ok('Outra empresa não vê clientes de A pela tabela (RLS)', (await c.query('select 1 from clientes where id_empresa=$1', [A])).rows.length === 0);
await falha('Outra empresa não lê o financeiro do cliente de A', 'select * from financeiro_cliente($1)', [pj], 'Sem acesso');
await como(donoA);
await falha('Não vincula receita de A a cliente da empresa B', 'select vincular_cliente_lancamento($1,$2)', [r3, clienteB], 'não encontrado');
await como(master);
await falha('Admin Master sem acesso automático', 'select * from buscar_clientes($1)', [A], 'Sem acesso');
await como(donoA);
const vinc = (await um("select solicitar_vinculo_contabil($1,$2,null,'principal',$3) id", [A, contC, ['ver_documentos']])).id;
await como(contC);
await c.query('select responder_vinculo_contabil($1, true, null)', [vinc]);
await falha('Contador sem permissão financeira não vê clientes', 'select * from buscar_clientes($1)', [A], 'Sem acesso');
await como(donoA);
await c.query("select alterar_vinculo_contabil($1,'principal',$2)", [vinc, ['ver_financeiro']]);
await como(contC);
ok('Contador com "Ver financeiro" lê (somente leitura)', (await c.query('select * from buscar_clientes($1,null,null,null,null,50,0)', [A])).rows.length > 0);
await falha('Contador não cadastra cliente', "select salvar_cliente(null,$1,'pf','Teste',null,null,null,null,null,null,null,null,null,null,null,'ativo',null)", [A], 'permissão');
await falha('Contador só leitura não vincula receitas', 'select vincular_cliente_lancamento($1,$2)', [r3, joao], 'não encontrado');
await admin();
ok('Anônimo sem execução', !(await um("select has_function_privilege('anon','public.buscar_clientes(uuid,text,text,text,text,integer,integer)','EXECUTE') p")).p);

await c.query('rollback');
await c.end();
let f = 0;
for (const x of r) { if (!x.ok) f++; console.log(`${x.ok ? '✅' : '❌'} ${x.n}${x.ok ? '' : ` — ${x.x}`}`); }
console.log(`\n${r.length - f}/${r.length} aprovados`);
process.exit(f ? 1 : 0);
