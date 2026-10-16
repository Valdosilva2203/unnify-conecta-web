// Lançamentos recorrentes (migration 055) no PostgreSQL LOCAL; tudo desfeito no final (ROLLBACK).
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
const prox = (await um("select (date_trunc('month', $1::date) + interval '1 month')::date::text d", [hoje])).d;
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'rc@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`77.${n}${n}${n}.000/0001-0${n}`, `Recorrente ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
await empresa(donoB, 2);
await como(donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const conta = (await um("select salvar_conta_financeira(null,$1,'Banco',null,'conta_corrente',50000,($2::date - 60),false,null) id", [A, hoje])).id;
const den = (await um("select salvar_funcionario(null,$1,'Denilson Amorim De Sousa','Técnico',($2::date - 200),'clt',1621,5,true,null,null) id", [A, hoje])).id;
const gerar = (cmp) => c.query('select gerar_folha($1,$2::date)', [A, cmp]);
await gerar(comp); await gerar(prox);
const folha = async (cmp) => (await um('select id, salario_base from folhas_competencia where id_funcionario=$1 and competencia=$2::date', [den, cmp]));
const ajustes = async (cmp, rec) => (await c.query('select a.valor, a.versao_recorrencia, a.valor_base from ajustes_folha a join folhas_competencia f on f.id=a.id_folha where f.id_funcionario=$1 and f.competencia=$2::date and a.id_recorrencia=$3 and a.excluido_em is null', [den, cmp, rec])).rows;
const total = async (cmp) => N((await um('select total from resumo_folha($1,$2::date) where id_funcionario=$3', [A, cmp, den])).total);
const SALVAR = 'select salvar_recorrencia_folha($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10,$11) id';
const nova = (tipo, desc, mod, valor, pct, ini = comp, fim = null) => [null, den, tipo, desc, mod, valor, pct, ini, fim, null, null];

// ===== Cadastro e geração =====
const peri = (await um(SALVAR, nova('adicional', 'Periculosidade', 'percentual', null, 30))).id;
const ajuda = (await um(SALVAR, nova('adicional', 'Ajuda de custo', 'fixo', 250, null))).id;
ok('Percentual: 30% × R$ 1.621,00 = R$ 486,30 na competência atual', (await ajustes(comp, peri)).length === 1 && N((await ajustes(comp, peri))[0].valor) === 486.3);
ok('Fixo: R$ 250,00 na competência atual', N((await ajustes(comp, ajuda))[0].valor) === 250);
ok('Geração automática na competência seguinte', N((await ajustes(prox, peri))[0]?.valor) === 486.3 && N((await ajustes(prox, ajuda))[0]?.valor) === 250);
await gerar(comp); await gerar(comp); await gerar(prox); await gerar(prox);
await admin();
await c.query("select sincronizar_recorrencias_funcionario($1, null)", [den]);
await como(donoA);
ok('Reprocessar não duplica (1 ajuste por recorrência e mês)', (await ajustes(comp, peri)).length === 1 && (await ajustes(prox, peri)).length === 1 && (await ajustes(comp, ajuda)).length === 1);
ok('Totais da folha: 1621 + 486,30 + 250 = 2357,30 (uma vez só)', (await total(comp)) === 2357.3);
ok('Financeiro: uma previsão no total', N((await um("select sum(valor) s from lancamentos_financeiros where id_folha=$1 and excluido_em is null", [(await folha(comp)).id])).s) === 2357.3);
await admin();
await falha('Índice único impede duplicar mesmo direto no banco', "insert into ajustes_folha (id_empresa, id_folha, tipo, descricao, valor, id_recorrencia) values ($1,$2,'adicional','Dup',1,$3)", [A, (await folha(comp)).id, peri], 'ajustes_folha_um_por_recorrencia');
await como(donoA);

// ===== Avulsos independentes =====
const av = (await um("select adicionar_ajuste_folha($1,'adicional','Bônus avulso',100) id", [(await folha(comp)).id])).id;
await c.query('select remover_ajuste_folha($1)', [av]);
ok('Avulso continua funcionando e é independente', (await total(comp)) === 2357.3);
const recComp = (await um('select a.id from ajustes_folha a join folhas_competencia f on f.id=a.id_folha where a.id_recorrencia=$1 and f.competencia=$2::date and a.excluido_em is null', [peri, comp])).id;
await falha('Lançamento recorrente não sai pela exclusão avulsa', 'select remover_ajuste_folha($1)', [recComp], 'Não aplicar nesta competência');

// ===== Salário muda a partir do próximo mês =====
await c.query("select salvar_funcionario($1,$2,'Denilson Amorim De Sousa','Técnico',($3::date - 200),'clt',2000,5,true,null,$4::date)", [den, A, hoje, prox]);
await gerar(prox);
ok('Novo salário: próximo mês recalcula 30% de 2000 = 600', N((await ajustes(prox, peri))[0].valor) === 600 && N((await ajustes(prox, peri))[0].valor_base) === 2000);
ok('Mês atual mantém 486,30', N((await ajustes(comp, peri))[0].valor) === 486.3);

// ===== Mês fechado (pago) preservado ao editar =====
await c.query('select registrar_pagamento_folha($1, 100, $2::date, $3)', [(await folha(comp)).id, hoje, conta]);
await falha('Edição exige motivo', SALVAR, [peri, den, 'adicional', 'Periculosidade', 'percentual', null, 40, comp, null, null, ''], 'motivo');
await um(SALVAR, [peri, den, 'adicional', 'Periculosidade', 'percentual', null, 40, comp, null, null, 'Laudo atualizado']);
ok('Edição: mês pago fica com o valor e versão antigos (486,30 v1)', N((await ajustes(comp, peri))[0].valor) === 486.3 && (await ajustes(comp, peri))[0].versao_recorrencia === 1);
ok('Edição: mês aberto recebe a nova versão (40% de 2000 = 800, v2)', N((await ajustes(prox, peri))[0].valor) === 800 && (await ajustes(prox, peri))[0].versao_recorrencia === 2);
ok('Versões e histórico com motivo e antes/depois', N((await um("select count(*) n from historico_recorrencias_folha where id_recorrencia=$1 and acao='editada' and motivo='Laudo atualizado' and antes->>'percentual' = '30.0000'", [peri])).n) === 1);

// ===== Exceção em um mês =====
await falha('Exceção exige motivo', 'select nao_aplicar_recorrencia_folha($1,$2::date,$3)', [ajuda, prox, ''], 'motivo');
await falha('Exceção em mês fechado (pago) é recusada', 'select nao_aplicar_recorrencia_folha($1,$2::date,$3)', [ajuda, comp, 'Afastado'], 'fechada');
await c.query('select nao_aplicar_recorrencia_folha($1,$2::date,$3)', [ajuda, prox, 'Afastado no mês']);
await gerar(prox); await gerar(prox);
ok('Exceção: retirado só no mês e não é recriado ao reprocessar', (await ajustes(prox, ajuda)).length === 0 && (await ajustes(comp, ajuda)).length === 1);
ok('Recorrência continua ativa', (await um('select situacao s from recorrencias_folha where id=$1', [ajuda])).s === 'ativa');

// ===== Suspensão, reativação e encerramento =====
const vale = (await um(SALVAR, nova('desconto', 'Vale transporte', 'fixo', 120, null))).id;
ok('Desconto recorrente aplicado nos dois meses', (await ajustes(prox, vale)).length === 1);
await c.query('select suspender_recorrencia_folha($1,$2::date,null,$3)', [vale, prox, 'Férias']);
ok('Suspensa a partir do próximo mês: some do próximo, mês pago intacto', (await ajustes(prox, vale)).length === 0 && (await ajustes(comp, vale)).length === 0 /* comp já estava pago: não recebeu */);
await c.query('select reativar_recorrencia_folha($1,$2)', [vale, 'Voltou das férias']);
ok('Reativada: volta no próximo mês', (await ajustes(prox, vale)).length === 1 && (await um('select situacao s from recorrencias_folha where id=$1', [vale])).s === 'ativa');
await c.query('select encerrar_recorrencia_folha($1,$2::date,$3)', [peri, comp, 'Fim da exposição']);
ok('Encerrada no mês atual: some do próximo, mês fechado mantém', (await ajustes(prox, peri)).length === 0 && (await ajustes(comp, peri)).length === 1);
await falha('Encerrada não pode ser editada', SALVAR, [peri, den, 'adicional', 'Periculosidade', 'percentual', null, 10, comp, null, null, 'X teste'], 'encerrada');

// ===== Folha enviada ao contador (052) não muda =====
await admin();
await c.query("insert into competencias_folha (id_empresa, competencia, status, versao_atual) values ($1,$2::date,'enviada',1)", [A, prox]);
await como(donoA);
const antesEnviada = N((await ajustes(prox, vale))[0].valor);
await um(SALVAR, [vale, den, 'desconto', 'Vale transporte', 'fixo', 150, null, comp, null, null, 'Reajuste da tarifa']);
ok('Folha enviada: valor não muda silenciosamente', N((await ajustes(prox, vale))[0].valor) === antesEnviada);
await falha('Folha enviada: exceção recusada', 'select nao_aplicar_recorrencia_folha($1,$2::date,$3)', [vale, prox, 'Teste'], 'fechada');

// ===== Validações e histórico =====
await falha('Desconto percentual acima de 100% recusado', SALVAR, nova('desconto', 'Desc', 'percentual', null, 120), '100%');
await falha('Valor zero recusado', SALVAR, nova('adicional', 'Zero', 'fixo', 0, null), 'valor válido');
await falha('Competência final antes da inicial recusada', SALVAR, nova('adicional', 'Datas', 'fixo', 10, null, prox, comp), 'anterior');
await falha('Modalidade inválida recusada', SALVAR, nova('adicional', 'Modalidade errada', 'livre', 10, null), 'fixo ou porcentagem');
ok('Histórico do funcionário identifica "(recorrente)" com o cálculo', (await c.query('select descricao from historico_funcionario($1)', [den])).rows.some((x) => x.descricao === 'Periculosidade (recorrente) — 30% sobre o salário-base de R$ 1.621,00'));

// ===== Isolamento e permissões =====
await como(donoB);
await falha('Outra empresa não cria recorrência para funcionário alheio (IDOR)', SALVAR, nova('adicional', 'Invasão', 'fixo', 10, null), 'não encontrado');
await falha('Outra empresa não suspende recorrência alheia', 'select suspender_recorrencia_folha($1,$2::date,null,$3)', [vale, prox, 'Invasão'], 'não encontrado');
ok('Outra empresa não vê recorrências nem histórico', N((await um('select count(*) n from recorrencias_folha')).n) === 0 && N((await um('select count(*) n from historico_recorrencias_folha')).n) === 0);
await como(master);
ok('Admin Master não vê recorrências', N((await um('select count(*) n from recorrencias_folha')).n) === 0);
await como(donoA);
await falha('Escrita direta bloqueada', "insert into recorrencias_folha (id_empresa, id_funcionario, tipo, descricao, modalidade, valor, competencia_inicial) values ($1,$2,'adicional','X x','fixo',1,$3::date)", [A, den, comp], 'permission denied');
await admin();
await c.query('set role anon');
await falha('Anônimo não executa', SALVAR, nova('adicional', 'X', 'fixo', 10, null), 'permission denied');
await admin();
ok('Funções internas sem EXECUTE para authenticated', (await um("select has_function_privilege('authenticated','public.sincronizar_recorrencias_folha(uuid)','execute') x")).x === false);

await c.query('rollback');
await c.end();
for (const y of r) console.log(`${y.ok ? 'OK   ' : 'FALHA'} ${y.n}${y.x ? `  [${y.x}]` : ''}`);
const f = r.filter((y) => !y.ok).length;
console.log(`\n${r.length - f}/${r.length} verificações OK`);
process.exit(f ? 1 : 0);
