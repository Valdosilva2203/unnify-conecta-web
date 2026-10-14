// Funcionários (migration 038) no PostgreSQL LOCAL; tudo desfeito no final. Foco: integridade com o Financeiro
// (previsão única, ajustes, pagamentos parciais, sem duplicidade), recorrência idempotente, salários e acesso.
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
const N = (v) => Number(v);

await c.query('begin');
await admin();
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const comp = `${hoje.slice(0, 7)}-01`;
const proxComp = (await um("select (date_trunc('month', $1::date) + interval '1 month')::date::text d", [hoje])).d;
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
const [contC] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 1")).rows.map((x) => x.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'fu@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`33.${n}${n}${n}.000/0001-0${n}`, `Folha ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
await como(donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const conta = (await um("select salvar_conta_financeira(null,$1,'Banco Folha',null,'conta_corrente',20000,($2::date - 60),false,null) id", [A, hoje])).id;
const salvarF = (id, nome, sal, dia = 5, vig = null) => um("select salvar_funcionario($1,$2,$3,'Atendente',($4::date - 200),'clt',$5,$6,true,null,$7::date) id", [id, A, nome, hoje, sal, dia, vig]);
const resumo = async (cmp = comp) => (await c.query('select * from resumo_folha($1,$2::date)', [A, cmp])).rows;
const lancs = async (idFolha) => (await c.query('select status, valor, excluido_em is not null excl, data_vencimento::text venc, id_categoria from lancamentos_financeiros where id_folha=$1 order by criado_em', [idFolha])).rows;
const vivos = (ls) => ls.filter((l) => !l.excl);

// ===== Cadastro e previsão automática =====
const fAna = (await salvarF(null, 'Andressa Santos', 1621)).id;
let rs = await resumo();
let ana = rs.find((x) => x.id_funcionario === fAna);
ok('Cadastro gera a previsão da competência atual', ana && N(ana.total) === 1621 && N(ana.pendente) === 1621 && ana.situacao !== 'pago');
let ls = vivos(await lancs(ana.id_folha));
ok('Previsão = UM lançamento pendente no Financeiro (categoria Salários)', ls.length === 1 && ls[0].status === 'pendente' && N(ls[0].valor) === 1621
  && (await um('select nome from categorias_financeiras where id=$1', [ls[0].id_categoria])).nome === 'Salários');
ok('Vencimento no dia 5 do mês seguinte', ls[0].venc === `${proxComp.slice(0, 8)}05`);
await c.query('select gerar_folha($1,$2::date)', [A, comp]);
await c.query('select gerar_folha($1,$2::date)', [A, comp]);
ok('Geração idempotente: uma folha e uma previsão por funcionário/competência', (await um('select count(*)::int n from folhas_competencia where id_funcionario=$1 and competencia=$2::date', [fAna, comp])).n === 1
  && vivos(await lancs(ana.id_folha)).length === 1);
await falha('Competência muito futura recusada', "select gerar_folha($1, (current_date + interval '6 months')::date)", [A], 'Competência inválida');
await falha('Salário inválido recusado', "select salvar_funcionario(null,$1,'Teste',null,current_date,'clt',0,5,true,null,null)", [A], 'salário');

// ===== Adicionais e descontos ajustam a previsão =====
const ad = (await um("select adicionar_ajuste_folha($1,'adicional','Hora extra',150) id", [ana.id_folha])).id;
await c.query("select adicionar_ajuste_folha($1,'desconto','Vale',50)", [ana.id_folha]);
ana = (await resumo()).find((x) => x.id_funcionario === fAna);
ok('Total = salário + adicionais − descontos', N(ana.total) === 1721 && N(ana.adicionais) === 150 && N(ana.descontos) === 50);
ok('Previsão no Financeiro acompanha o ajuste (sem criar outro lançamento)', vivos(await lancs(ana.id_folha)).length === 1 && N(vivos(await lancs(ana.id_folha))[0].valor) === 1721);
await falha('Desconto maior que o total é recusado (nada muda)', "select adicionar_ajuste_folha($1,'desconto','Erro',99999)", [ana.id_folha], 'descontos');
await c.query('select remover_ajuste_folha($1)', [ad]);
ana = (await resumo()).find((x) => x.id_funcionario === fAna);
ok('Remover ajuste recalcula', N(ana.total) === 1571 && N(vivos(await lancs(ana.id_folha))[0].valor) === 1571);

// ===== Pagamentos parciais e integrais =====
const despesasAntes = N((await um('select resumo_financeiro($1,$2::date) r', [A, comp])).r.despesas_mes);
await c.query('select registrar_pagamento_folha($1, 1000, $2::date, $3)', [ana.id_folha, hoje, conta]);
ana = (await resumo()).find((x) => x.id_funcionario === fAna);
ls = vivos(await lancs(ana.id_folha));
ok('Parcial: pago 1000, pendente 571, situação "parcial"', N(ana.pago) === 1000 && N(ana.pendente) === 571 && ana.situacao === 'parcial');
ok('Parcial: 1 lançamento pago + 1 pendente; soma = total (sem duplicidade)', ls.filter((l) => l.status === 'pago').length === 1 && ls.filter((l) => l.status === 'pendente').length === 1
  && ls.reduce((t, l) => t + N(l.valor), 0) === 1571);
ok('Financeiro conta o pagamento uma única vez nas despesas do mês', N((await um('select resumo_financeiro($1,$2::date) r', [A, comp])).r.despesas_mes) === despesasAntes + 1000);
ok('Saldo da conta caiu exatamente o valor pago', N((await um('select saldo_conta_financeira($1) s', [conta])).s) === 19000);
await falha('Pagar mais que o pendente é recusado', 'select registrar_pagamento_folha($1, 600, $2::date, $3)', [ana.id_folha, hoje, conta], 'maior que o saldo');
await falha('Pagamento com data futura é recusado', "select registrar_pagamento_folha($1, 10, ($2::date + 3), $3)", [ana.id_folha, hoje, conta], 'futura');
await falha('Desconto que deixaria o total abaixo do pago é recusado', "select adicionar_ajuste_folha($1,'desconto','Grande',700)", [ana.id_folha], 'menor que o já pago');
await c.query('select registrar_pagamento_folha($1, 571, $2::date, $3)', [ana.id_folha, hoje, conta]);
ana = (await resumo()).find((x) => x.id_funcionario === fAna);
ok('Quitação: pago = total, pendente 0, situação "pago", sem pendente no Financeiro', N(ana.pago) === 1571 && N(ana.pendente) === 0 && ana.situacao === 'pago'
  && vivos(await lancs(ana.id_folha)).every((l) => l.status === 'pago'));
await c.query("select adicionar_ajuste_folha($1,'adicional','Bônus',100)", [ana.id_folha]);
ana = (await resumo()).find((x) => x.id_funcionario === fAna);
ls = vivos(await lancs(ana.id_folha));
ok('Adicional após quitação: nova previsão só da diferença; pagamentos confirmados intactos', N(ana.pendente) === 100 && ls.filter((l) => l.status === 'pendente').length === 1
  && N(ls.find((l) => l.status === 'pendente').valor) === 100 && ls.filter((l) => l.status === 'pago').reduce((t, l) => t + N(l.valor), 0) === 1571);

// ===== Proteção no Financeiro =====
const pend = (await um("select id from lancamentos_financeiros where id_folha=$1 and status='pendente' and excluido_em is null", [ana.id_folha])).id;
await falha('Financeiro não altera valor da previsão da folha', "select salvar_lancamento_financeiro($1,null,'despesa','Salário',999,(select id_categoria from lancamentos_financeiros where id=$1),current_date,current_date,null,null,null,null,null)", [pend], 'folha');
await falha('Financeiro não cancela lançamento da folha', 'select cancelar_lancamento_financeiro($1)', [pend], 'folha');
// Estorno pelo Financeiro volta a ser pendente e a folha consolida num único pendente
const pago1 = (await um("select id from lancamentos_financeiros where id_folha=$1 and status='pago' and excluido_em is null order by valor desc limit 1", [ana.id_folha])).id;
await c.query('select estornar_baixa_lancamento($1)', [pago1]);
await admin();
await c.query("select set_config('request.jwt.claim.sub', $1, false)", [donoA]);
await c.query('select recalcular_folha($1)', [ana.id_folha]);
await como(donoA);
ana = (await resumo()).find((x) => x.id_funcionario === fAna);
ok('Estorno no Financeiro: pendente volta a refletir o saldo, com um único pendente', vivos(await lancs(ana.id_folha)).filter((l) => l.status === 'pendente').length === 1
  && N(ana.pago) + N(ana.pendente) === N(ana.total));

// ===== Salário futuro não reescreve competências com pagamento =====
await c.query('select gerar_folha($1,$2::date)', [A, proxComp]);
await salvarF(fAna, 'Andressa Santos', 2000, 5, proxComp);
const atual = (await resumo()).find((x) => x.id_funcionario === fAna);
const prox = (await resumo(proxComp)).find((x) => x.id_funcionario === fAna);
ok('Novo salário vale da competência indicada; competência atual (com pagamento) mantém o anterior', N(atual.salario_base) === 1621 && N(prox.salario_base) === 2000 && N(prox.pendente) === 2000);
ok('Histórico de salários registrado', (await um('select count(*)::int n from historico_salarios where id_funcionario=$1', [fAna])).n === 2);

// ===== Desligamento interrompe previsões futuras sem apagar histórico =====
const fLu = (await salvarF(null, 'Lucas Martins', 980)).id;
await c.query('select gerar_folha($1,$2::date)', [A, proxComp]);
await c.query('select desligar_funcionario($1,$2::date)', [fLu, hoje]);
const luProx = (await resumo(proxComp)).find((x) => x.id_funcionario === fLu);
ok('Desligado: competência futura cancelada e previsão removida do Financeiro', luProx.situacao === 'cancelada' && vivos(await lancs(luProx.id_folha)).length === 0);
ok('Desligado: competência atual preservada', (await resumo()).some((x) => x.id_funcionario === fLu && x.situacao !== 'cancelada'));
await c.query('select gerar_folha($1,$2::date)', [A, proxComp]);
ok('Gerar de novo não recria previsão de desligado', vivos(await lancs(luProx.id_folha)).length === 0);

// ===== Acesso e isolamento =====
await como(donoB);
await falha('Outra empresa não lê a folha', 'select * from resumo_folha($1,$2::date)', [A, comp], 'Sem acesso');
await falha('Outra empresa não paga', 'select registrar_pagamento_folha($1, 1, $2::date, $3)', [ana.id_folha, hoje, conta], 'não encontrada');
ok('Outra empresa não vê funcionários pela tabela (RLS)', (await c.query('select 1 from funcionarios where id_empresa=$1', [A])).rows.length === 0);
await falha('Sem escrita direta', "insert into funcionarios (id_empresa,nome,data_admissao,salario_base) values ($1,'X',current_date,1)", [A], 'permission denied');
await como(master);
await falha('Admin Master sem acesso automático', 'select * from resumo_folha($1,$2::date)', [A, comp], 'Sem acesso');
await como(donoA);
const vinc = (await um("select solicitar_vinculo_contabil($1,$2,null,'principal',$3) id", [A, contC, ['ver_documentos']])).id;
await como(contC);
await c.query('select responder_vinculo_contabil($1, true, null)', [vinc]);
await falha('Contador sem "Ver folha" não lê', 'select * from resumo_folha($1,$2::date)', [A, comp], 'Sem acesso');
await como(donoA);
await c.query("select alterar_vinculo_contabil($1,'principal',$2)", [vinc, ['ver_folha']]);
await como(contC);
ok('Contador com "Ver folha" lê (somente leitura)', (await resumo()).length >= 2);
await falha('Contador não registra pagamento', 'select registrar_pagamento_folha($1, 1, $2::date, $3)', [ana.id_folha, hoje, conta], 'não encontrada');
await falha('Contador não cadastra funcionário', "select salvar_funcionario(null,$1,'X Y',null,current_date,'clt',100,5,true,null,null)", [A], 'permissão');
await admin();
ok('Anônimo sem execução', !(await um("select has_function_privilege('anon','public.resumo_folha(uuid,date)','EXECUTE') p")).p);

await c.query('rollback');
await c.end();
let f = 0;
for (const x of r) { if (!x.ok) f++; console.log(`${x.ok ? '✅' : '❌'} ${x.n}${x.ok ? '' : ` — ${x.x}`}`); }
console.log(`\n${r.length - f}/${r.length} aprovados`);
process.exit(f ? 1 : 0);
