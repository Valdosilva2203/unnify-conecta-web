// Adicionais/descontos de Funcionários na Folha de Pagamento (migration 058) no PostgreSQL LOCAL; tudo desfeito no final (ROLLBACK).
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
const [contC] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 1")).rows.map((x) => x.id_usuario);
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'af@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`58.${n}${n}${n}.000/0001-0${n}`, `Ajustes Folha ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
await c.query("insert into vinculos_contabeis (id_empresa, id_contador, funcao, status, permissoes, origem, aprovado_em) values ($1, $2, 'principal', 'ativo', '{ver_folha,processar_folha}', 'empresa', now())", [A, contC]);

await como(donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const novoF = async (nome, sal) => (await um("select salvar_funcionario(null,$1,$2,'Técnico',($3::date - 200),'clt',$4,5,true,null,null) id", [A, nome, hoje, sal])).id;
const antonio = await novoF('Antonio Marques', 1621);
const fernando = await novoF('Fernando Alves', 1621);
await c.query('select gerar_folha($1,$2::date)', [A, comp]);
const folha = async (f) => (await um('select id from folhas_competencia where id_funcionario=$1 and competencia=$2::date', [f, comp])).id;
await c.query("select salvar_recorrencia_folha(null,$1,'adicional','Periculosidade','percentual',null,30,$2::date,null,null,null)", [antonio, comp]);
const ajuda = (await um("select adicionar_ajuste_folha($1,'adicional','Ajuda de custo',100) id", [await folha(antonio)])).id;
const vale = (await um("select adicionar_ajuste_folha($1,'desconto','Vale',50) id", [await folha(fernando)])).id;
const removido = (await um("select adicionar_ajuste_folha($1,'adicional','Lançado por engano',999) id", [await folha(fernando)])).id;
await c.query('select remover_ajuste_folha($1)', [removido]);

const painel = async (emp = A) => (await um('select painel_folha_pagamento($1,$2::date) p', [emp, comp])).p;
const fun = (p, id) => p.funcionarios.find((f) => f.id === id);
let p = await painel();
const aj = fun(p, antonio).ajustes;
ok('Painel da folha traz os adicionais do funcionário (recorrente percentual + avulso)', aj.length === 2 && aj.some((x) => x.descricao === 'Periculosidade' && N(x.valor) === 486.3 && x.recorrente === true)
  && aj.some((x) => x.descricao === 'Ajuda de custo' && N(x.valor) === 100 && x.recorrente === false));
ok('Cálculo do percentual exibido (30% sobre o salário-base de R$ 1.621,00)', aj.find((x) => x.descricao === 'Periculosidade').calculo === '30% sobre o salário-base de R$ 1.621,00');
ok('Descontos aparecem e removidos não', fun(p, fernando).ajustes.length === 1 && fun(p, fernando).ajustes[0].tipo === 'desconto' && N(fun(p, fernando).ajustes[0].valor) === 50);

await como(contC);
ok('Contador com "ver folha" vê os adicionais no painel', fun(await painel(), antonio).ajustes.length === 2);
await como(donoB);
await falha('Outra empresa não vê o painel', 'select painel_folha_pagamento($1,$2::date)', [A, comp], 'Sem acesso');

// Conferência: lançar adicional depois de conferir desfaz a conferência daquele funcionário
await como(donoA);
const CONF = 'select confirmar_conferencia_folha($1,$2::date,$3,$4)';
await c.query(CONF, [A, comp, antonio, true]);
await c.query(CONF, [A, comp, fernando, true]);
ok('Conferidos ficam aptos', fun(await painel(), antonio).situacao === 'apto');
const extra = (await um("select adicionar_ajuste_folha($1,'adicional','Bônus',80) id", [await folha(antonio)])).id;
p = await painel();
ok('Novo adicional desfaz a conferência só do funcionário afetado', fun(p, antonio).situacao === 'a_conferir' && fun(p, fernando).situacao === 'apto');
await c.query('select remover_ajuste_folha($1)', [extra]);
await c.query(CONF, [A, comp, antonio, true]);

// Envio: o pacote leva os adicionais; depois do envio, alteração só por correção
const pac = (await um("select enviar_folha_contador($1,$2::date,'RH Teste',null,true) id", [A, comp])).id;
const snap = (await um('select snapshot from pacotes_folha where id=$1', [pac])).snapshot;
const sa = snap.funcionarios.find((f) => f.id === antonio).ajustes;
ok('Pacote enviado ao contador contém os adicionais (com cálculo e recorrência)', sa.length === 2 && sa.some((x) => x.descricao === 'Periculosidade' && x.calculo && x.recorrente)
  && snap.funcionarios.find((f) => f.id === fernando).ajustes[0].descricao === 'Vale');
await falha('Folha enviada: não lança adicional', "select adicionar_ajuste_folha($1,'adicional','Atrasado',10)", [await folha(antonio)], 'já foi enviada ao contador');
await falha('Folha enviada: não lança percentual', "select adicionar_ajuste_percentual_folha($1,'adicional','Insalubridade',20)", [await folha(antonio)], 'já foi enviada ao contador');
await falha('Folha enviada: não remove adicional', 'select remover_ajuste_folha($1)', [ajuda], 'já foi enviada ao contador');
ok('Pacote enviado não muda (imutável)', JSON.stringify((await um('select snapshot from pacotes_folha where id=$1', [pac])).snapshot) === JSON.stringify(snap));

// Correção solicitada pelo contador: o RH volta a poder ajustar
await como(contC);
const idComp = (await um('select id from competencias_folha where id_empresa=$1 and competencia=$2::date', [A, comp])).id;
await c.query('select iniciar_processamento_folha($1)', [idComp]);
await c.query('select solicitar_correcao_folha($1,$2,$3)', [idComp, 'Faltou o adicional noturno', JSON.stringify([{ id_funcionario: antonio, descricao: 'Lançar adicional' }])]);
await como(donoA);
const corr = (await um("select adicionar_ajuste_folha($1,'adicional','Adicional noturno',120) id", [await folha(antonio)])).id;
ok('Com correção solicitada, o RH lança o adicional e ele aparece no painel', !!corr && fun(await painel(), antonio).ajustes.some((x) => x.descricao === 'Adicional noturno'));
await c.query('select remover_ajuste_folha($1)', [vale]);
ok('Remoção também permitida na correção', fun(await painel(), fernando).ajustes.length === 0);

await c.query('rollback');
await c.end();
const falhas = r.filter((x) => !x.ok);
for (const x of r) console.log(`${x.ok ? '✅' : '❌'} ${x.n}${x.ok ? '' : ` — ${x.x}`}`);
console.log(`\n${r.length - falhas.length}/${r.length} verificações OK`);
process.exit(falhas.length ? 1 : 0);
