// Testes da E2 (classificação financeira) direto no PostgreSQL, como usuários autenticados (auth.uid() simulado).
// Rodam SOMENTE num banco LOCAL restaurado do backup (padrão: localhost:55432/unnify_local) — nunca na produção.
// Uso: node tests/sql/classificacao-financeira.mjs [postgres://...]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

const url = process.argv[2] ?? 'postgres://postgres@localhost:55432/unnify_local';
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Recusado: estes testes só rodam em banco local.');

const novaConexao = async () => { const c = new Client({ connectionString: url }); await c.connect(); return c; };
const c = await novaConexao();
const resultados = [];
const ok = (nome, cond, extra = '') => resultados.push({ nome, ok: !!cond, extra });
const comoUsuario = (cli, id) => cli.query("select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false), set_config('role', 'authenticated', false)",
  [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
const comoAdmin = (cli) => cli.query("reset role; select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)");
async function deveFalhar(nome, sql, params = [], trecho) {
  try { await c.query(sql, params); ok(nome, false, 'não falhou'); }
  catch (e) { ok(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 80)); }
}
const um = async (sql, params = []) => (await c.query(sql, params)).rows[0];

// Cenário isolado: duas empresas novas (A e B), cada uma com seu dono, criadas como admin do banco local
await comoAdmin(c);
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global = 'user' and tipo_usuario = 'empresa' limit 2")).rows.map((r) => r.id_usuario);
async function criarEmpresa(dono, rotulo) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por)
                      values ($1, $2, 'teste@local.test', 'Palmas', 'TO', 'comum', 'ATIVA', $3) returning id`,
    [`99.${String(Date.now()).slice(-3)}.000/0001-${rotulo === 'A' ? '01' : '02'}`, `EMPRESA E2 ${rotulo}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1, $2, 'dono', true)", [dono, e.id]);
  return e.id;
}
const A = await criarEmpresa(donoA, 'A');
const B = await criarEmpresa(donoB, 'B');

await comoUsuario(c, donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const conta = (await um(`select salvar_conta_financeira(null, $1, 'Banco E2', 'Banco', 'conta_corrente', 1000.00, $2::date, false) id`, [A, `${hoje.slice(0, 7)}-01`])).id;
const cat = async (tipo) => (await um('select id from categorias_financeiras where id_empresa = $1 and tipo = $2 limit 1', [A, tipo])).id;
const catR = await cat('receita');
const catD = await cat('despesa');
const saldo = async () => Number((await um('select saldo_conta_financeira($1, $2::date) s', [conta, hoje])).s);
const resumo = async () => (await um('select resumo_financeiro($1, null) r', [A])).r;
const lancar = async (tipo, natureza, valor, pagar, contraparte = 'Sócio Teste') => (await um(
  `select salvar_lancamento_financeiro(p_id => null, p_id_empresa => $1, p_tipo => $2, p_descricao => $3, p_valor => $4, p_id_categoria => $5,
     p_data_competencia => $6::date, p_data_vencimento => $6::date, p_data_pagamento => $7::date, p_contraparte => $8, p_observacoes => null,
     p_id_conta_financeira => $9, p_natureza => $10) id`,
  [A, tipo, `${natureza} ${valor}`, valor, tipo === 'receita' ? catR : catD, hoje, pagar ? hoje : null, contraparte, pagar ? conta : null, natureza])).id;

const r0 = await resumo();
ok('Base: resumo com os novos campos', ['pro_labore_mes', 'aportes_socios_mes', 'distribuicoes_lucros_mes', 'entradas_financiamentos_mes', 'amortizacao_financiamentos_mes', 'transferencias_mes', 'entradas_caixa_mes', 'saidas_caixa_mes'].every((k) => k in r0) && 'receitas_operacionais' in r0.serie[5]);
const s0 = await saldo();

// 1. Aporte: saldo só sobe ao ser recebido; não vira receita operacional
const aportePendente = await lancar('receita', 'aporte_socio', 5000, false);
ok('Aporte pendente não mexe no saldo', (await saldo()) === s0);
await c.query('select registrar_baixa_lancamento($1, $2::date, $3, 5000)', [aportePendente, hoje, conta]);
let r = await resumo();
ok('Aporte recebido: saldo +5000', (await saldo()) === s0 + 5000);
ok('Aporte NÃO entra em receitas_mes (operacional)', Number(r.receitas_mes) === Number(r0.receitas_mes) && Number(r.aportes_socios_mes) === 5000, `receitas_mes=${r.receitas_mes} aportes=${r.aportes_socios_mes}`);
ok('Aporte entra no fluxo de caixa', Number(r.entradas_caixa_mes) === Number(r0.entradas_caixa_mes) + 5000);

// 2. Distribuição de lucros: não é despesa operacional; saldo só cai quando paga
const dist = await lancar('despesa', 'distribuicao_lucros', 1200, false, 'Sócia Beneficiária');
ok('Distribuição pendente não mexe no saldo', (await saldo()) === s0 + 5000);
await c.query('select registrar_baixa_lancamento($1, $2::date, $3, 1200)', [dist, hoje, conta]);
r = await resumo();
ok('Distribuição paga: saldo −1200 e fora de despesas_mes', (await saldo()) === s0 + 3800 && Number(r.despesas_mes) === Number(r0.despesas_mes) && Number(r.distribuicoes_lucros_mes) === 1200);
ok('Beneficiário rastreável (contraparte + histórico)', (await um("select contraparte from lancamentos_financeiros where id = $1", [dist])).contraparte === 'Sócia Beneficiária'
  && Number((await um("select count(*) n from historico_lancamentos_financeiros where id_lancamento = $1", [dist])).n) >= 2);

// 3. Pró-labore: classificação própria, fora das despesas operacionais
await lancar('despesa', 'pro_labore', 800, true, 'Sócio Administrador');
r = await resumo();
ok('Pró-labore classificado à parte', Number(r.pro_labore_mes) === 800 && Number(r.despesas_mes) === Number(r0.despesas_mes));
await deveFalhar('Pró-labore exige o sócio', `select salvar_lancamento_financeiro(p_id => null, p_id_empresa => $1, p_tipo => 'despesa', p_descricao => 'PL', p_valor => 10,
  p_id_categoria => $2, p_data_competencia => $3::date, p_data_vencimento => $3::date, p_data_pagamento => null, p_contraparte => null, p_observacoes => null, p_natureza => 'pro_labore')`, [A, catD, hoje], 'sócio');
await deveFalhar('Classificação incompatível (receita como pró-labore)', `select salvar_lancamento_financeiro(p_id => null, p_id_empresa => $1, p_tipo => 'receita', p_descricao => 'X', p_valor => 10,
  p_id_categoria => $2, p_data_competencia => $3::date, p_data_vencimento => $3::date, p_data_pagamento => null, p_contraparte => 'Fulano', p_observacoes => null, p_natureza => 'pro_labore')`, [A, catR, hoje], 'incompatível');

// 4. Empréstimo: entrada não é faturamento; amortização e juros separados (via Parcelamentos)
await lancar('receita', 'financiamento', 10000, true, 'Banco Credor');
const { rows: [ct] } = await c.query(`select criar_contrato_parcelado($1, 'Empréstimo E2', 'emprestimo', 'Banco Credor', $2, null, $3::date, 10000, 11000, 1.5, 'personalizadas', null, null,
  jsonb_build_array(jsonb_build_object('numero', 1, 'vencimento', $3::date, 'valor', 5500, 'juros', 500), jsonb_build_object('numero', 2, 'vencimento', ($3::date + 30), 'valor', 5500, 'juros', 500))) id`, [A, catD, hoje]);
const parcela = (await um('select id from lancamentos_financeiros where id_contrato = $1 and numero_parcela = 1', [ct.id])).id;
await c.query('select registrar_baixa_lancamento($1, $2::date, $3, 5500)', [parcela, hoje, conta]);
r = await resumo();
ok('Entrada de empréstimo fora de receitas_mes', Number(r.receitas_mes) === Number(r0.receitas_mes) && Number(r.entradas_financiamentos_mes) === 10000);
ok('Parcela: amortização 5000 + juros 500, fora de despesas_mes', Number(r.amortizacao_financiamentos_mes) === 5000 && Number(r.juros_financiamentos_mes) === 500
  && Number(r.pagamentos_financiamentos_mes) === 5500 && Number(r.despesas_mes) === Number(r0.despesas_mes));

// 5. Receita/despesa operacional continuam contando; série separa operacional x caixa
await lancar('receita', 'operacional', 3000, true, 'Cliente');
await lancar('despesa', 'operacional', 700, true, 'Fornecedor');
r = await resumo();
ok('Operacional conta em receitas/despesas do mês', Number(r.receitas_mes) === Number(r0.receitas_mes) + 3000 && Number(r.despesas_mes) === Number(r0.despesas_mes) + 700);
const mes = r.serie[5];
ok('Série: operacional x caixa', Number(mes.receitas_operacionais) === Number(r0.serie[5].receitas_operacionais) + 3000
  && Number(mes.receitas) === Number(r0.serie[5].receitas) + 18000, `rec_op=${mes.receitas_operacionais} rec_caixa=${mes.receitas}`);
ok('Saldo = só dinheiro efetivamente movimentado', (await saldo()) === s0 + 5000 - 1200 - 800 + 10000 - 5500 + 3000 - 700);

// 6. Transferência entre contas: informativa, não é receita nem despesa
const conta2 = (await um(`select salvar_conta_financeira(null, $1, 'Caixa E2', null, 'caixa', 0, $2::date, false) id`, [A, `${hoje.slice(0, 7)}-01`])).id;
await c.query("select realizar_transferencia($1, $2, 400, $3::date, 'Reforço de caixa')", [conta, conta2, hoje]);
r = await resumo();
ok('Transferência só informativa', Number(r.transferencias_mes) === 400 && Number(r.receitas_mes) === Number(r0.receitas_mes) + 3000 && Number(r.despesas_mes) === Number(r0.despesas_mes) + 700);

// 7. Pagamentos simultâneos: uma única movimentação
const conc = await lancar('despesa', 'pro_labore', 300, false, 'Sócio Administrador');
const [c1, c2] = [await novaConexao(), await novaConexao()];
await comoUsuario(c1, donoA); await comoUsuario(c2, donoA);
const tentativas = await Promise.allSettled([c1, c2, c1, c2].map((cli) => cli.query('select registrar_baixa_lancamento($1, $2::date, $3, 300)', [conc, hoje, conta])));
ok('Pagamentos simultâneos: 1 sucesso', tentativas.filter((t) => t.status === 'fulfilled').length === 1);
ok('Pagamentos simultâneos: 1 movimentação', Number((await um('select count(*) n from movimentacoes_financeiras where id_lancamento = $1', [conc])).n) === 1);
await c1.end(); await c2.end();

// 8. Estorno restaura saldo e indicador
const sAntes = await saldo();
const plAntes = Number((await resumo()).pro_labore_mes);
await c.query('select estornar_baixa_lancamento($1)', [conc]);
ok('Estorno restaura saldo e pró-labore do mês', (await saldo()) === sAntes + 300 && Number((await resumo()).pro_labore_mes) === plAntes - 300);

// 9. Edição sem p_natureza mantém a classificação (nada reclassificado automaticamente); chamada antiga (12 parâmetros) funciona
await c.query(`select salvar_lancamento_financeiro(p_id => $1, p_id_empresa => $2, p_tipo => 'despesa', p_descricao => 'Distribuição revisada', p_valor => 1200,
  p_id_categoria => $3, p_data_competencia => $4::date, p_data_vencimento => $4::date, p_data_pagamento => $4::date, p_contraparte => 'Sócia Beneficiária', p_observacoes => null)`, [dist, A, catD, hoje]);
ok('Edição sem classificação mantém a atual', (await um('select natureza_financeira n from lancamentos_financeiros where id = $1', [dist])).n === 'distribuicao_lucros');
await deveFalhar('Parcela de contrato não muda de classificação', `select salvar_lancamento_financeiro(p_id => $1, p_id_empresa => $2, p_tipo => 'despesa', p_descricao => 'X', p_valor => 5500,
  p_id_categoria => $3, p_data_competencia => $4::date, p_data_vencimento => $4::date, p_data_pagamento => $4::date, p_contraparte => null, p_observacoes => null, p_natureza => 'operacional')`, [parcela, A, catD, hoje]);

// 10. Isolamento: B não lê nem lança na empresa A
await comoUsuario(c, donoB);
await deveFalhar('B não lê o resumo de A', 'select resumo_financeiro($1, null)', [A], 'Sem permissão');
await deveFalhar('B não lança em A', `select salvar_lancamento_financeiro(p_id => null, p_id_empresa => $1, p_tipo => 'receita', p_descricao => 'Invasão', p_valor => 10,
  p_id_categoria => $2, p_data_competencia => $3::date, p_data_vencimento => $3::date, p_data_pagamento => null, p_contraparte => 'X', p_observacoes => null, p_natureza => 'aporte_socio')`, [A, catR, hoje], 'Sem permissão');
ok('B não vê lançamentos de A', Number((await um('select count(*) n from lancamentos_financeiros where id_empresa = $1', [A])).n) === 0);

await comoAdmin(c);
await c.end();
for (const x of resultados) console.log(`${x.ok ? 'OK   ' : 'FALHA'} ${x.nome}${x.extra ? `  [${x.extra}]` : ''}`);
const falhas = resultados.filter((x) => !x.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações OK`);
process.exit(falhas ? 1 : 0);
