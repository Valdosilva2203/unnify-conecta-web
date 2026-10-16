// Adicional/desconto por porcentagem (migration 054) no PostgreSQL LOCAL; tudo desfeito no final (ROLLBACK).
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
const N = (v) => Number(v);

await c.query('begin');
await admin();
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const comp = `${hoje.slice(0, 7)}-01`;
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'ap@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`66.${n}${n}${n}.000/0001-0${n}`, `Percentual ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
await empresa(donoB, 2);
await como(donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const joao = (await um("select salvar_funcionario(null,$1,'João Silva','Técnico',($2::date - 200),'clt',2200,5,true,null,null) id", [A, hoje])).id;
const folha = (await um('select id from folhas_competencia where id_funcionario=$1 and competencia=$2::date', [joao, comp])).id;
const tot = async () => (await um('select total, pendente from resumo_folha($1,$2::date) where id_funcionario=$3', [A, comp, joao]));
const prev = async () => (await c.query('select valor from lancamentos_financeiros where id_folha=$1 and status=$2 and excluido_em is null', [folha, 'pendente'])).rows;
const PCT = 'select adicionar_ajuste_percentual_folha($1,$2,$3,$4) id';

// Fixo continua igual
const fixo = (await um("select adicionar_ajuste_folha($1,'adicional','Hora extra',150) id", [folha])).id;
const af = await um('select modalidade, percentual, valor from ajustes_folha where id=$1', [fixo]);
ok('Fixo: continua funcionando (modalidade fixo, sem percentual)', af.modalidade === 'fixo' && af.percentual === null && N(af.valor) === 150);
await c.query('select remover_ajuste_folha($1)', [fixo]);

// 10% adicional e 5% desconto sobre 2200
const a1 = (await um(PCT, [folha, 'adicional', 'Bônus de produtividade', 10])).id;
const d1 = (await um(PCT, [folha, 'desconto', 'Vale', 5])).id;
const x1 = await um('select valor, percentual, base_calculo, valor_base, modalidade, criado_por, criado_em, id_empresa from ajustes_folha where id=$1', [a1]);
ok('Adicional 10% sobre R$ 2.200 = R$ 220,00', N(x1.valor) === 220);
ok('Desconto 5% sobre R$ 2.200 = R$ 110,00', N((await um('select valor from ajustes_folha where id=$1', [d1])).valor) === 110);
ok('Persistência: modalidade, percentual, base, valor da base, responsável, data, empresa', x1.modalidade === 'percentual' && N(x1.percentual) === 10 && x1.base_calculo === 'salario_base'
  && N(x1.valor_base) === 2200 && x1.criado_por === donoA && x1.criado_em && x1.id_empresa === A);
let t = await tot();
ok('Folha considera cada ajuste uma única vez (2200 + 220 − 110 = 2310)', N(t.total) === 2310);
ok('Financeiro: uma única previsão, no valor novo', (await prev()).length === 1 && N((await prev())[0].valor) === 2310);

// Decimal e arredondamento
const a2 = (await um(PCT, [folha, 'adicional', 'Comissão', 7.5])).id;
ok('Decimal: 7,5% de 2200 = 165,00', N((await um('select valor from ajustes_folha where id=$1', [a2])).valor) === 165);
await c.query('select remover_ajuste_folha($1)', [a2]);
await admin();
await c.query("update folhas_competencia set salario_base = 1999.99 where id=$1", [folha]);
await como(donoA);
const a3 = (await um(PCT, [folha, 'adicional', 'Teste arredondamento', 3.3333])).id;
ok('Arredondamento monetário: 3,3333% de 1999,99 = 66,6657 → 66,67', N((await um('select valor from ajustes_folha where id=$1', [a3])).valor) === 66.67);
await c.query('select remover_ajuste_folha($1)', [a3]);

// Valor histórico preservado: salário muda depois
await admin();
await c.query("update folhas_competencia set salario_base = 3000 where id=$1", [folha]);
await como(donoA);
const depois = await um('select valor, valor_base from ajustes_folha where id=$1', [a1]);
ok('Mudança no salário-base não altera ajuste já lançado', N(depois.valor) === 220 && N(depois.valor_base) === 2200);

// Histórico
const h = (await c.query('select descricao, valor, tipo from historico_funcionario($1)', [joao])).rows;
ok('Histórico mostra percentual e base', h.some((x) => x.tipo === 'adicional' && x.descricao === 'Bônus de produtividade — 10% sobre o salário-base de R$ 2.200,00' && N(x.valor) === 220));

// Inválidos
await falha('Porcentagem zero recusada', PCT, [folha, 'adicional', 'X teste', 0], 'maior que zero');
await falha('Porcentagem negativa recusada', PCT, [folha, 'adicional', 'X teste', -5], 'maior que zero');
await falha('Mais de 4 casas decimais recusado', PCT, [folha, 'adicional', 'X teste', 1.23456], 'maior que zero');
await falha('Desconto acima de 100% recusado', PCT, [folha, 'desconto', 'X teste', 150], '100%');
ok('Adicional acima de 100% aceito (sem limite arbitrário)', N((await um(PCT, [folha, 'adicional', 'Prêmio anual', 150])).id ? 1 : 0) === 1);
await falha('Descrição obrigatória', PCT, [folha, 'adicional', ' ', 10], 'Descreva');
await falha('Tipo inválido', PCT, [folha, 'bonus', 'X teste', 10], 'Tipo');
await falha('Valor calculado zero recusado', PCT, [folha, 'adicional', 'Ínfimo', 0.0001], 'R$ 0,00');
await falha('Escrita direta na tabela bloqueada', "insert into ajustes_folha (id_empresa, id_folha, tipo, descricao, valor, modalidade) values ($1,$2,'adicional','x x',1,'fixo')", [A, folha], 'permission denied');

// Isolamento
await como(donoB);
await falha('Outra empresa não lança na folha alheia (IDOR)', PCT, [folha, 'adicional', 'Invasão', 10], 'não encontrada');
ok('Outra empresa não vê os ajustes', N((await um('select count(*) n from ajustes_folha where id_folha=$1', [folha])).n) === 0);
await admin();
await c.query('set role anon');
await falha('Anônimo não executa', PCT, [folha, 'adicional', 'X teste', 10], 'permission denied');
await admin();

// Folha aprovada trava ajustes (sem mudança silenciosa)
await c.query("insert into competencias_folha (id_empresa, competencia, status) values ($1, $2::date, 'aprovada')", [A, comp]);
await como(donoA);
await falha('Folha aprovada: percentual recusado', PCT, [folha, 'adicional', 'Depois', 10], 'aprovada');
await falha('Folha aprovada: fixo recusado', "select adicionar_ajuste_folha($1,'adicional','Depois',10)", [folha], 'aprovada');
await falha('Folha aprovada: remoção recusada', 'select remover_ajuste_folha($1)', [a1], 'aprovada');

await admin();
await c.query('rollback');
await c.end();
for (const y of r) console.log(`${y.ok ? 'OK   ' : 'FALHA'} ${y.n}${y.x ? `  [${y.x}]` : ''}`);
const f = r.filter((y) => !y.ok).length;
console.log(`\n${r.length - f}/${r.length} verificações OK`);
process.exit(f ? 1 : 0);
