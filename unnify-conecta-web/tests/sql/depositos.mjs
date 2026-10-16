// Depositar (migration 053) no PostgreSQL LOCAL; tudo desfeito no final (ROLLBACK). Nada toca o banco compartilhado.
// Cenários: espécie (caixa → banco), conta → conta (atômico, total inalterado), origem externa classificada; idempotência; acesso.
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
const como = (id) => c.query("select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false), set_config('role', 'authenticated', false)", [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
const admin = () => c.query("reset role; select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)");
async function falha(n, s, p, t) { await c.query('savepoint t'); try { await c.query(s, p); await c.query('release savepoint t'); ok(n, false, 'não falhou'); } catch (e) { await c.query('rollback to savepoint t'); ok(n, !t || e.message.includes(t), e.message.slice(0, 110)); } }
const N = (v) => Number(v);

await c.query('begin');
await admin();
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
const [contC] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 1")).rows.map((x) => x.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'dp@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`55.${n}${n}${n}.000/0001-0${n}`, `Deposito ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
const vC = (await um("insert into vinculos_contabeis (id_empresa, id_contador, funcao, status, permissoes, origem, aprovado_em) values ($1, $2, 'principal', 'ativo', '{ver_financeiro}', 'empresa', now()) returning id", [A, contC])).id;
const conta = async (emp, nome, tipo, saldo) => (await um("select salvar_conta_financeira(null,$1,$2,null,$3,$4,($5::date - 30),false,null) id", [emp, nome, tipo, saldo, hoje])).id;
await como(donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const bancoA = await conta(A, 'Banco A', 'conta_corrente', 5000);
const bancoB = await conta(A, 'Banco B', 'conta_corrente', 2000);
const caixa = await conta(A, 'Caixa da loja', 'caixa', 500);
await como(donoB);
const bancoOutra = await conta(B, 'Banco da outra', 'conta_corrente', 100);
await como(donoA);
const saldo = async (id) => N((await um('select saldo_conta_financeira($1) s', [id])).s);
const DEP = 'select registrar_deposito($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10) id';
const dep = (id, destino, origem, contaOrigem, valor, { cls = null, quem = null, data = hoje, desc = null, emp = A } = {}) => [id, emp, destino, origem, contaOrigem, cls, quem, valor, data, desc];

// ===== Cenário B: entre bancos (exemplo do enunciado) =====
const k1 = randomUUID();
await um(DEP, dep(k1, bancoB, 'conta', bancoA, 1000));
ok('Banco A 5000 → 4000 e Banco B 2000 → 3000', (await saldo(bancoA)) === 4000 && (await saldo(bancoB)) === 3000);
ok('Total das duas contas inalterado (7000)', (await saldo(bancoA)) + (await saldo(bancoB)) === 7000);
await um(DEP, dep(k1, bancoB, 'conta', bancoA, 1000));
ok('Mesma chave de novo: nenhuma movimentação nova (idempotente)', (await saldo(bancoA)) === 4000 && (await saldo(bancoB)) === 3000
  && N((await um('select count(*) n from transferencias_financeiras where id_empresa=$1', [A])).n) === 1);
ok('Débito e crédito registrados (2 movimentações da transferência)', N((await um("select count(*) n from movimentacoes_financeiras m join depositos_financeiros d on d.id_transferencia = m.id_transferencia where d.id=$1", [k1])).n) === 2);
ok('Histórico com o depósito', N((await um("select count(*) n from historico_contas_financeiras where id_empresa=$1 and acao='deposito' and dados->>'id_deposito'=$2", [A, k1])).n) === 1);
await falha('Origem igual ao destino é recusada', DEP, dep(randomUUID(), bancoB, 'conta', bancoB, 10), 'própria conta');
await falha('Saldo insuficiente na origem é recusado', DEP, dep(randomUUID(), bancoB, 'conta', bancoA, 999999), 'Saldo insuficiente');
ok('Recusa não deixa nada pela metade', (await saldo(bancoA)) === 4000 && (await saldo(bancoB)) === 3000);

// ===== Cenário A: espécie (caixa → banco) =====
await um(DEP, dep(randomUUID(), bancoA, 'especie', caixa, 300));
ok('Espécie: caixa 500 → 200 e banco A 4000 → 4300', (await saldo(caixa)) === 200 && (await saldo(bancoA)) === 4300);
await falha('Espécie acima do caixa é recusada (sem saldo negativo)', DEP, dep(randomUUID(), bancoA, 'especie', caixa, 250), 'Saldo insuficiente');
await falha('Espécie exige origem do tipo Caixa', DEP, dep(randomUUID(), bancoA, 'especie', bancoB, 10), 'Caixa físico');
await falha('Saída do caixa como "outra conta" é recusada', DEP, dep(randomUUID(), bancoA, 'conta', caixa, 10), 'espécie');
await falha('Destino não pode ser o caixa', DEP, dep(randomUUID(), caixa, 'conta', bancoA, 10), 'conta bancária');

// ===== Cenário C: origem externa classificada (nunca receita de vendas) =====
const resumoAntes = (await um('select resumo_financeiro($1,$2::date) r', [A, hoje])).r;
await falha('Externa sem classificação é recusada', DEP, dep(randomUUID(), bancoA, 'externa', null, 1000), 'Classifique');
await falha('Aporte sem o sócio é recusado', DEP, dep(randomUUID(), bancoA, 'externa', null, 1000, { cls: 'aporte_socio' }), 'sócio');
await falha('Classificação "operacional" não é aceita', DEP, dep(randomUUID(), bancoA, 'externa', null, 1000, { cls: 'operacional', quem: 'X' }), 'Classifique');
const k3 = randomUUID();
await um(DEP, dep(k3, bancoA, 'externa', null, 1000, { cls: 'aporte_socio', quem: 'Ana Souza' }));
const l = await um("select l.tipo, l.status, l.natureza_financeira, l.contraparte, k.nome from depositos_financeiros d join lancamentos_financeiros l on l.id = d.id_lancamento join categorias_financeiras k on k.id = l.id_categoria where d.id=$1", [k3]);
ok('Aporte vira receita NÃO operacional já recebida (categoria Aportes de sócios)', l.tipo === 'receita' && l.status === 'pago' && l.natureza_financeira === 'aporte_socio' && l.nome === 'Aportes de sócios' && l.contraparte === 'Ana Souza');
ok('Saldo do banco A sobe 1000 (4300 → 5300)', (await saldo(bancoA)) === 5300);
const resumoDepois = (await um('select resumo_financeiro($1,$2::date) r', [A, hoje])).r;
ok('Receita operacional do mês não muda', N(resumoDepois.receitas_mes) === N(resumoAntes.receitas_mes), `${resumoAntes.receitas_mes} → ${resumoDepois.receitas_mes}`);
await um(DEP, dep(randomUUID(), bancoB, 'externa', null, 2000, { cls: 'financiamento', quem: 'Banco do Povo' }));
ok('Empréstimo classificado como financiamento', (await um("select natureza_financeira n from lancamentos_financeiros where id_empresa=$1 and contraparte='Banco do Povo'", [A])).n === 'financiamento');

// ===== Validações =====
await falha('Valor zero recusado', DEP, dep(randomUUID(), bancoB, 'conta', bancoA, 0), 'maior que zero');
await falha('Valor negativo recusado', DEP, dep(randomUUID(), bancoB, 'conta', bancoA, -5), 'maior que zero');
await falha('Mais de 2 casas decimais recusado', DEP, dep(randomUUID(), bancoB, 'conta', bancoA, 1.005), 'maior que zero');
await falha('Data futura recusada', DEP, dep(randomUUID(), bancoB, 'conta', bancoA, 10, { data: '2099-01-01' }), 'futura');
await falha('Origem inválida recusada', DEP, dep(randomUUID(), bancoB, 'pix', bancoA, 10), 'origem');
await c.query('select arquivar_conta_financeira($1, true)', [bancoB]);
await falha('Destino arquivado recusado', DEP, dep(randomUUID(), bancoB, 'conta', bancoA, 10), 'arquivada');
await c.query('select arquivar_conta_financeira($1, false)', [bancoB]);

// ===== Acesso / IDOR =====
await falha('Destino de outra empresa recusado (IDOR)', DEP, dep(randomUUID(), bancoOutra, 'conta', bancoA, 10), 'destino inválida');
await falha('Origem de outra empresa recusada (IDOR)', DEP, dep(randomUUID(), bancoA, 'conta', bancoOutra, 10), 'origem inválida');
await como(donoB);
await falha('Outra empresa não deposita nas contas de A', DEP, dep(randomUUID(), bancoA, 'conta', bancoB, 10), 'Sem permissão');
await falha('Reusar a chave de outro usuário é recusado', DEP, dep(k1, bancoOutra, 'externa', null, 10, { cls: 'aporte_socio', quem: 'Fulano', emp: B }), 'inválido');
ok('Outra empresa não vê os depósitos de A (RLS)', N((await um('select count(*) n from depositos_financeiros where id_empresa=$1', [A])).n) === 0);
await como(contC);
ok('Contador com "ver financeiro" vê os depósitos', N((await um('select count(*) n from depositos_financeiros where id_empresa=$1', [A])).n) === 4);
await falha('Contador só com "ver financeiro" não deposita', DEP, dep(randomUUID(), bancoA, 'conta', bancoB, 10), 'Sem permissão');
await admin();
await c.query("update vinculos_contabeis set permissoes = '{ver_financeiro,gerenciar_financeiro}' where id=$1", [vC]);
await como(contC);
await um(DEP, dep(randomUUID(), bancoA, 'conta', bancoB, 10));
ok('Contador com "gerenciar financeiro" deposita', (await saldo(bancoA)) === 5310);
await como(master);
await falha('Admin Master não deposita', DEP, dep(randomUUID(), bancoA, 'conta', bancoB, 10), 'Sem permissão');
ok('Admin Master não vê depósitos', N((await um('select count(*) n from depositos_financeiros')).n) === 0);
await como(donoA);
await falha('Escrita direta na tabela é bloqueada', "insert into depositos_financeiros (id, id_empresa, id_conta_destino, origem, valor, data, criado_por) values ($1,$2,$3,'externa',1,current_date,$4)", [randomUUID(), A, bancoA, donoA], 'permission denied');
await admin();
await c.query('set role anon');
await falha('Anônimo não executa', DEP, dep(randomUUID(), bancoA, 'conta', bancoB, 10), 'permission denied');
await admin();
ok('Função interna sem EXECUTE para authenticated', (await um("select has_function_privilege('authenticated', 'public.categoria_deposito_externo(uuid,text)', 'execute') x")).x === false);

// ===== Comprovante privado =====
await como(donoA);
const cam = `${A}/depositos/${k1}/${randomUUID()}.pdf`;
await c.query("insert into storage.objects (bucket_id, name, owner_id, metadata) values ('comprovantes-financeiros', $1, $2, $3)", [cam, donoA, JSON.stringify({ mimetype: 'application/pdf', size: 2048 })]);
await falha('Storage: pasta de depósito inexistente recusada', "insert into storage.objects (bucket_id, name, owner_id, metadata) values ('comprovantes-financeiros', $1, $2, '{}')", [`${A}/depositos/${randomUUID()}/x.pdf`, donoA]);
await falha('Comprovante de outro depósito/caminho recusado', 'select registrar_comprovante_deposito($1,$2,$3)', [k3, cam, 'c.pdf'], 'inválido');
await c.query('select registrar_comprovante_deposito($1,$2,$3)', [k1, cam, 'comprovante.pdf']);
ok('Comprovante vinculado ao depósito', (await um('select comprovante_nome n from depositos_financeiros where id=$1', [k1])).n === 'comprovante.pdf');
await falha('Segundo comprovante recusado', 'select registrar_comprovante_deposito($1,$2,$3)', [k1, cam, 'c.pdf'], 'já tem');
await como(donoB);
ok('Outra empresa não lê o comprovante', N((await um("select count(*) n from storage.objects where bucket_id='comprovantes-financeiros' and name=$1", [cam])).n) === 0);

await admin();
await c.query('rollback');
await c.end();
for (const y of r) console.log(`${y.ok ? 'OK   ' : 'FALHA'} ${y.n}${y.x ? `  [${y.x}]` : ''}`);
const f = r.filter((y) => !y.ok).length;
console.log(`\n${r.length - f}/${r.length} verificações OK`);
process.exit(f ? 1 : 0);
