// Testes da E5 (Saúde Empresarial) direto no PostgreSQL LOCAL restaurado do backup. Os dados entram pelas funções reais
// do Financeiro (salvar_lancamento_financeiro, baixa, contas, transferência) e tudo é desfeito no final (ROLLBACK).
// Os valores esperados foram calculados à mão a partir da metodologia saude-v1. Recusa rodar fora de localhost.
// Uso: node tests/sql/saude-empresarial.mjs [postgres://...]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

const url = process.argv[2] ?? 'postgres://postgres@localhost:55432/unnify_local';
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Recusado: estes testes só rodam em banco local.');
const c = new Client({ connectionString: url });
await c.connect();
const resultados = [];
const ok = (nome, cond, extra = '') => resultados.push({ nome, ok: !!cond, extra });
const um = async (sql, p = []) => (await c.query(sql, p)).rows[0];
const como = (id) => c.query("select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false), set_config('role', 'authenticated', false)",
  [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
const comoAdmin = () => c.query("reset role; select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)");
async function falha(nome, sql, p = [], trecho) {
  await c.query('savepoint t');
  try { await c.query(sql, p); await c.query('release savepoint t'); ok(nome, false, 'não falhou'); }
  catch (e) { await c.query('rollback to savepoint t'); ok(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 90)); }
}
const saude = async (emp, meses = 3) => (await um('select saude_empresarial($1, $2) s', [emp, meses])).s;
const num = (v) => (v === null || v === undefined ? null : Number(v));

await c.query('begin'); // desfeito no final
await comoAdmin();
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const dia = async (n) => (await um('select ($1::date - $2::int)::text d', [hoje, n])).d; // n dias atrás (negativo = futuro)
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global = 'user' and tipo_usuario = 'empresa' limit 2")).rows.map((r) => r.id_usuario);
const [contC] = (await c.query("select id_usuario from perfis where funcao_global = 'user' and tipo_usuario = 'contador' limit 1")).rows.map((r) => r.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global = 'admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por)
                      values ($1, $2, 'e5@local.test', 'Palmas', 'TO', 'comum', 'ATIVA', $3) returning id`, [`66.${n}${n}${n}.000/0001-0${n}`, `E5 ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1, $2, 'dono', true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);

async function conta(emp, nome, saldo) {
  return (await um("select salvar_conta_financeira(null, $1, $2, null, 'conta_corrente', $3, ($4::date - 400), false, null) id", [emp, nome, saldo, hoje])).id;
}
// Lançamento pelo caminho real. pago = data de pagamento (ou null = pendente); venc = vencimento.
async function lanc(emp, contaId, tipo, valor, { pago = null, venc = null, natureza = 'operacional', cat = null, contraparte = null, descricao = 'Teste E5' } = {}) {
  const comp = pago ?? venc;
  if (!cat) {
    await c.query('select inicializar_categorias_financeiras($1)', [emp]);
    cat = (await um('select id from categorias_financeiras where id_empresa = $1 and tipo = $2 order by nome limit 1', [emp, tipo])).id;
  }
  return (await um('select salvar_lancamento_financeiro(null, $1, $2, $3, $4, $5, $6, $7, $8, $9, null, $10, $11) id',
    [emp, tipo, descricao, valor, cat, comp, venc ?? pago, pago, contraparte, pago ? contaId : null, natureza])).id;
}

// ===== Empresa A: cenário completo (janela de 3 meses) =====
await como(donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const [catX, catY] = (await c.query("select id from categorias_financeiras where id_empresa = $1 and tipo = 'despesa' order by nome limit 2", [A])).rows.map((r) => r.id);
const contaA = await conta(A, 'Banco A', 10000);
// Período atual — operacionais
await lanc(A, contaA, 'receita', 1000, { pago: await dia(10) });
await lanc(A, contaA, 'receita', 1000, { pago: await dia(20) });
await lanc(A, contaA, 'receita', 1000, { pago: await dia(30) });
await lanc(A, contaA, 'despesa', 600, { pago: await dia(12), cat: catX });
await lanc(A, contaA, 'despesa', 600, { pago: await dia(25), cat: catX });
await lanc(A, contaA, 'despesa', 300, { pago: await dia(40), venc: await dia(45), cat: catY }); // paga com atraso
// Período atual — NÃO operacionais (não podem entrar em receita/despesa operacional)
await lanc(A, contaA, 'receita', 5000, { pago: await dia(15), natureza: 'aporte_socio', contraparte: 'Sócio Um' });
await lanc(A, contaA, 'receita', 4000, { pago: await dia(16), natureza: 'financiamento' });
await lanc(A, contaA, 'despesa', 700, { pago: await dia(11), natureza: 'pro_labore', contraparte: 'Sócio Um' });
await lanc(A, contaA, 'despesa', 800, { pago: await dia(13), natureza: 'distribuicao_lucros', contraparte: 'Sócio Um' });
await lanc(A, contaA, 'despesa', 900, { pago: await dia(14), natureza: 'financiamento' });
// Período anterior
await lanc(A, contaA, 'receita', 2000, { pago: await dia(120) });
await lanc(A, contaA, 'despesa', 1000, { pago: await dia(130), cat: catX });
// Em aberto
await lanc(A, contaA, 'despesa', 2000, { venc: await dia(5), cat: catX, descricao: 'Fornecedor vencido' });
await lanc(A, contaA, 'despesa', 1000, { venc: await dia(-10), cat: catY, descricao: 'Aluguel a vencer' });
await lanc(A, contaA, 'receita', 1000, { venc: await dia(8), descricao: 'Cliente atrasado' });

let s = await saude(A);
ok('1. Receita operacional exclui aportes e empréstimos', num(s.receita_operacional) === 3000, s.receita_operacional);
ok('2. Despesa operacional exclui pró-labore, distribuição e financiamento', num(s.despesa_operacional) === 1500, s.despesa_operacional);
ok('3. Resultado operacional de caixa = receitas − despesas operacionais', num(s.resultado_operacional) === 1500 && num(s.indicadores.margem) === 50 && num(s.indicadores.comprometimento) === 50);
ok('5. Variações em relação ao período anterior', num(s.variacao_receita) === 50 && num(s.variacao_despesa) === 50 && num(s.variacao_resultado) === 50,
  `${s.variacao_receita} ${s.variacao_despesa} ${s.variacao_resultado}`);
ok('Saldo registrado = saldo inicial + movimentações efetivas', num(s.saldo_registrado) === 19100, s.saldo_registrado);
ok('Obrigações de curto prazo: vencidas + a vencer em 30 dias', num(s.obrigacoes.vencidas_valor) === 2000 && num(s.obrigacoes.a_vencer_valor) === 1000 && num(s.indicadores.cobertura) === 6.37);
ok('Inadimplência: aberto ÷ receitas vencidas no período (valor)', num(s.indicadores.inadimplencia) === 25 && num(s.indicadores.inadimplencia_base) === 4000);
ok('Regularidade: 5 de 7 despesas vencidas no período pagas em dia', num(s.indicadores.regularidade) === 71.4 && s.indicadores.regularidade_base === 7);
ok('6. Prazo médio de recebimento indisponível com menos de 5 recebimentos', s.indicadores.prazo_medio_recebimento === null && s.indicadores.prazo_medio_base === 3);

// 4. Fluxo de caixa: movimentações efetivas, saldo encadeado, sem dupla contagem
const fluxo = s.fluxo_caixa;
ok('4. Fluxo: 6 meses, último saldo = saldo registrado', fluxo.length === 6 && num(fluxo.at(-1).saldo_final) === 19100);
let encadeado = true;
for (let i = 1; i < fluxo.length; i++) {
  if (Math.abs(num(fluxo[i].saldo_final) - num(fluxo[i - 1].saldo_final) - (num(fluxo[i].entradas) - num(fluxo[i].saidas))) > 0.001) encadeado = false;
}
ok('4. Fluxo: saldo de cada mês = anterior + entradas − saídas (sem somar duas vezes)', encadeado);
const soma = (campo) => fluxo.reduce((t, m) => t + num(m[campo]), 0);
ok('4. Fluxo: aportes/empréstimos entram no caixa como não operacionais', soma('entradas_nao_operacionais') === 9000 && soma('saidas_nao_operacionais') === 2400);
const contaA2 = await conta(A, 'Caixa A', 0);
await c.query('select realizar_transferencia($1, $2, 500, $3::date, null)', [contaA, contaA2, await dia(2)]);
const s2 = await saude(A);
ok('4. Transferência entre contas não altera saldo total nem entradas/saídas', num(s2.saldo_registrado) === 19100
  && s2.fluxo_caixa.reduce((t, m) => t + num(m.entradas), 0) === soma('entradas'));

// Série operacional reaproveitada do resumo_financeiro (meses sem movimento = 0, nada inventado)
const serie = s.serie_operacional;
ok('Série operacional: 6 meses, só operacional', serie.length === 6 && serie.reduce((t, m) => t + num(m.receitas_operacionais), 0) === 5000
  && serie.reduce((t, m) => t + num(m.despesas_operacionais), 0) === 2500 && serie.some((m) => num(m.receitas_operacionais) === 0));

// 7. Índice reproduzível a partir dos componentes publicados
const comp = Object.fromEntries(s.indice.componentes.map((x) => [x.codigo, x]));
ok('7. Componentes com pontuação esperada', num(comp.margem.pontos) === 100 && num(comp.cobertura.pontos) === 100 && num(comp.regularidade.pontos) === 71.4
  && num(comp.evolucao.pontos) === 50 && num(comp.inadimplencia.pontos) === 0, JSON.stringify(s.indice.componentes.map((x) => [x.codigo, x.pontos])));
const aplic = s.indice.componentes.filter((x) => x.aplicavel);
const recalculado = Math.round(aplic.reduce((t, x) => t + num(x.pontos) * x.peso, 0) / aplic.reduce((t, x) => t + x.peso, 0));
ok('7. Índice = média ponderada dos aplicáveis (77) e faixa "estável"', s.indice.valor === 77 && recalculado === 77 && s.indice.faixa === 'estavel' && s.indice.cobertura_pesos === 100);
ok('7. Mesmo dado → mesmo índice (determinístico) e versão da metodologia', (await saude(A)).indice.valor === s.indice.valor && s.metodologia === 'saude-v1');

// 8. Recomendações só quando a condição é satisfeita
const codigos = (x) => x.recomendacoes.map((r) => r.codigo).sort().join(',');
ok('8. Regras disparadas em A: contas vencidas, inadimplência, concentração', codigos(s) === 'concentracao_despesas,contas_vencidas,inadimplencia_alta', codigos(s));
const conc = s.recomendacoes.find((r) => r.codigo === 'concentracao_despesas');
ok('8. Concentração calculada (80% em uma categoria)', num(conc.dados.percentual) === 80 && num(conc.dados.valor) === 1200);
await lanc(A, contaA, 'despesa', 500, { pago: await dia(3), cat: catY });
s = await saude(A);
ok('8. Despesas crescendo acima das receitas dispara com o percentual real', s.recomendacoes.some((r) => r.codigo === 'despesas_acima_receitas' && num(r.dados.variacao_despesas) === 100 && num(r.dados.variacao_receitas) === 50));
await falha('Período inválido é recusado', 'select saude_empresarial($1, 5)', [A], 'Período inválido');

// ===== Empresa B: sem dados e dados insuficientes =====
await como(donoB);
s = await saude(B);
ok('6. Sem movimento: índice indisponível, indicadores nulos (não zero)', s.indice.valor === null && s.indicadores.margem === null && s.indicadores.comprometimento === null
  && s.saldo_registrado === null && s.variacao_receita === null && s.tem_lancamentos === false);
ok('8. Sem dados: só "dados insuficientes" e "sem contas"', codigos(s) === 'dados_insuficientes,sem_contas', codigos(s));
const contaB = await conta(B, 'Banco B', 3000);
for (let i = 1; i <= 5; i++) await lanc(B, contaB, 'receita', 100, { pago: await dia(i * 3) });
s = await saude(B);
ok('Sem dados negativos NÃO gera nota alta: margem 100%, mas cobertura de pesos 40% → insuficiente',
  s.indice.valor === null && s.indice.cobertura_pesos === 40 && s.indice.insuficiencias.includes('cobertura_baixa'), JSON.stringify(s.indice.insuficiencias));
await lanc(B, contaB, 'despesa', 2000, { pago: await dia(1) });
await lanc(B, contaB, 'despesa', 100000, { venc: await dia(-5), descricao: 'Compra grande' });
s = await saude(B);
ok('8. Resultado negativo e saldo insuficiente disparam', s.recomendacoes.some((r) => r.codigo === 'resultado_negativo' && num(r.dados.resultado) === -1500)
  && s.recomendacoes.some((r) => r.codigo === 'saldo_insuficiente' && num(r.dados.obrigacoes) === 100000), codigos(s));
ok('Margem negativa pontua zero', num(s.indice.componentes.find((x) => x.codigo === 'margem').pontos) === 0);

// ===== 9–11. Isolamento, contador e revogação =====
await como(donoB);
await falha('9. Empresário de outra empresa não lê A', 'select saude_empresarial($1, 3)', [A], 'Sem permissão');
await como(master);
await falha('Admin Master não tem acesso automático', 'select saude_empresarial($1, 3)', [A], 'Sem permissão');
await como(donoA);
const vinc = (await um("select solicitar_vinculo_contabil($1, $2, null, 'principal', $3) id", [A, contC, ['ver_documentos']])).id;
await como(contC);
await falha('10. Contador com vínculo PENDENTE não acessa', 'select saude_empresarial($1, 3)', [A], 'Sem permissão');
await c.query('select responder_vinculo_contabil($1, true, null)', [vinc]);
await falha('10. Contador ativo SEM "Ver financeiro" não acessa', 'select saude_empresarial($1, 3)', [A], 'Sem permissão');
await como(donoA);
const doDono = await saude(A);
await c.query("select alterar_vinculo_contabil($1, 'principal', $2)", [vinc, ['ver_documentos', 'ver_financeiro']]);
await como(contC);
const doContador = await saude(A);
ok('11. Com "Ver financeiro": contador vê exatamente os mesmos números (somente leitura)', doContador.indice.valor === doDono.indice.valor
  && num(doContador.saldo_registrado) === num(doDono.saldo_registrado));
await falha('Contador com "Ver financeiro" não lança no financeiro', "select salvar_lancamento_financeiro(null, $1, 'despesa', 'x', 10, null, $2::date, $2::date, null, null, null, null, null)", [A, hoje], 'Sem permissão');
await falha('Contador não lê empresa sem vínculo', 'select saude_empresarial($1, 3)', [B], 'Sem permissão');
await como(donoA);
await c.query("select alterar_vinculo_contabil($1, 'principal', $2)", [vinc, ['ver_documentos']]);
await como(contC);
await falha('11. Permissão revogada: bloqueio imediato', 'select saude_empresarial($1, 3)', [A], 'Sem permissão');
await como(donoA);
await c.query("select alterar_vinculo_contabil($1, 'principal', $2)", [vinc, ['ver_financeiro']]);
await c.query('select encerrar_vinculo_contabil($1, null)', [vinc]);
await como(contC);
await falha('11. Vínculo encerrado: bloqueio imediato', 'select saude_empresarial($1, 3)', [A], 'Sem permissão');
await comoAdmin();
ok('Anônimo não pode executar a função', !(await um("select has_function_privilege('anon', 'public.saude_empresarial(uuid,integer)', 'EXECUTE') p")).p);

await c.query('rollback');
await c.end();
let falhas = 0;
for (const r of resultados) {
  if (!r.ok) falhas++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.nome}${r.ok ? '' : ` — ${r.extra}`}`);
}
console.log(`\n${resultados.length - falhas}/${resultados.length} aprovados`);
process.exit(falhas ? 1 : 0);
