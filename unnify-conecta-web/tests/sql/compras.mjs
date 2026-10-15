// Compras (migration 042) no PostgreSQL LOCAL. Parte 1: BEGIN…ROLLBACK. Parte 2 (recebimentos simultâneos com duas conexões):
// cópia temporária do banco local (unnify_conc_compras), apagada no final.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const url = process.argv[2] ?? 'postgres://postgres@localhost:55432/unnify_local';
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Recusado: só banco local.');
const r = [];
const ok = (n, cond, x = '') => r.push({ n, ok: !!cond, x });
const N = Number;
function ajudantes(c) {
  const um = async (s, p = []) => (await c.query(s, p)).rows[0];
  const como = (id) => c.query("select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false), set_config('role', 'authenticated', false)", [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
  const admin = () => c.query("reset role; select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)");
  async function falha(n, s, p, t) { await c.query('savepoint t'); try { await c.query(s, p); await c.query('release savepoint t'); ok(n, false, 'não falhou'); } catch (e) { await c.query('rollback to savepoint t'); ok(n, !t || e.message.includes(t), e.message.slice(0, 120)); } }
  return { um, como, admin, falha };
}
const SQL_PRODUTO = 'select salvar_produto($1,$2,$3,$4,null,null,null,null,$5,$6,$7,0,\'ativo\',$8) id';
const SQL_FORN = 'select salvar_fornecedor($1,$2,$3,$4,$5,$6,$7,$8,null,null,null,null,$9) id';
const SQL_COMPRA = 'select salvar_compra($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10::date,null,null,$11,$12,$13,$14) id';
const itens = (...xs) => JSON.stringify(xs.map(([id, q, preco, desc]) => ({ id_produto: id, quantidade: q, preco_unitario: preco, desconto: desc ?? 0 })));
const receber = (...xs) => JSON.stringify(xs.map(([id, q]) => ({ id_item: id, quantidade: q })));

const c = new Client({ connectionString: url });
await c.connect();
const { um, como, admin, falha } = ajudantes(c);
await c.query('begin');
await admin();
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const mais = async (d) => (await um('select ($1::date + $2::int)::text d', [hoje, d])).d;
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
const [contC] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 1")).rows.map((x) => x.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'cp@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`55.${n}${n}${n}.000/0001-0${n}`, `Compradora ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
await como(donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const estoque = async (id) => N((await um('select estoque_atual e from produtos where id=$1', [id])).e);

// ===== Fornecedores =====
const forn = (await um(SQL_FORN, [null, A, 'pj', 'Atacado Central LTDA', 'Atacado Central', '11.222.333/0001-81', '(63) 99999-1234', 'Contato@Atacado.com', 'ativo'])).id;
const f0 = await um('select documento, telefone, email from fornecedores where id=$1', [forn]);
ok('Cria fornecedor normalizando CNPJ, telefone e e-mail', f0.documento === '11222333000181' && f0.telefone === '63999991234' && f0.email === 'contato@atacado.com');
await falha('CNPJ inválido recusado', SQL_FORN, [null, A, 'pj', 'Errado', null, '11.222.333/0001-80', null, null, 'ativo'], 'CNPJ inválido');
await falha('CNPJ duplicado na empresa recusado', SQL_FORN, [null, A, 'pj', 'Outro', null, '11222333000181', null, null, 'ativo'], 'Já existe');
await falha('Sem escrita direta em fornecedores', "insert into fornecedores (id_empresa, nome) values ($1,'Direto')", [A], 'permission denied');
await um(SQL_FORN, [forn, A, 'pj', 'Atacado Central LTDA', 'Atacado Central', '11222333000181', '63988887777', 'contato@atacado.com', 'ativo']);
const hf = (await c.query('select acao, dados from historico_fornecedores where id_fornecedor=$1 order by id', [forn])).rows;
ok('Histórico do fornecedor sem dados de contato (só nomes de campos)', hf.map((h) => h.acao).join() === 'criado,editado' && hf[1].dados.campos.join() === 'contato' && !JSON.stringify(hf).includes('9888'));
ok('Busca de fornecedor por parte do CNPJ', (await c.query("select * from buscar_fornecedores($1,'222.333',null,10,0)", [A])).rows[0]?.id === forn);

// ===== Catálogo reaproveitado do Estoque =====
const cam = (await um(SQL_PRODUTO, [null, A, 'produto', 'Camiseta', 'un', 25, 60, 5])).id;
const cabo = (await um(SQL_PRODUTO, [null, A, 'produto', 'Cabo de rede', 'm', 3.5, 6, 0])).id;
const inst = (await um(SQL_PRODUTO, [null, A, 'servico', 'Instalação', null, 0, 150, 0])).id;
const conta = (await um("select salvar_conta_financeira(null,$1,'Banco',null,'conta_corrente',5000,($2::date - 30),false,null) id", [A, hoje])).id;
const despesasAntes = (await um("select count(*)::int n from lancamentos_financeiros where id_empresa=$1 and tipo='despesa'", [A])).n;

// ===== Rascunho, totais e confirmação (sem mexer no estoque) =====
const rasc = (await um(SQL_COMPRA, [null, A, forn, itens([cam, 50, 25], [cabo, 20, 3.5, 5], [inst, 1, 150]), 0, 50, 'a_prazo', 'boleto', 3, await mais(30), false, false, null, null])).id;
const cr = await um('select status, subtotal, frete, total from compras where id=$1', [rasc]);
ok('Rascunho: totais (1250 + 65 + 150 = 1465; + frete 50 = 1515) e sem efeitos', cr.status === 'rascunho' && N(cr.subtotal) === 1465 && N(cr.total) === 1515
  && (await um('select count(*)::int n from lancamentos_financeiros where id_compra=$1', [rasc])).n === 0 && await estoque(cam) === 5);
await falha('Desconto maior que subtotal recusado', SQL_COMPRA, [rasc, A, forn, itens([cam, 1, 10]), 11, 0, 'a_vista', 'pix', 1, null, false, false, null, null], 'Desconto');
await falha('A prazo sem vencimento recusado', SQL_COMPRA, [rasc, A, forn, itens([cam, 1, 10]), 0, 0, 'a_prazo', 'boleto', 2, null, true, false, null, null], 'vencimento');
const ch1 = randomUUID();
await um(SQL_COMPRA, [rasc, A, forn, itens([cam, 50, 25], [cabo, 20, 3.5, 5], [inst, 1, 150]), 0, 50, 'a_prazo', 'boleto', 3, await mais(30), true, false, null, ch1]);
const parcelas = (await c.query('select descricao, valor, data_vencimento::text v, status, contraparte from lancamentos_financeiros where id_compra=$1 order by data_vencimento', [rasc])).rows;
ok('Confirmar a prazo: 3 contas a pagar pendentes, somando o total (505,00 cada)', parcelas.length === 3 && parcelas.every((p) => p.status === 'pendente' && p.contraparte === 'Atacado Central')
  && parcelas.reduce((s, p) => s + N(p.valor), 0) === 1515 && parcelas[0].v === await mais(30) && parcelas[2].descricao.endsWith('(3/3)'));
ok('Pedido não movimenta estoque', await estoque(cam) === 5 && (await um('select count(*)::int n from movimentacoes_estoque where id_compra=$1', [rasc])).n === 0);
const rep = (await um(SQL_COMPRA, [null, A, forn, itens([cam, 50, 25]), 0, 0, 'a_vista', 'pix', 1, null, true, false, null, ch1])).id;
ok('Confirmação repetida (mesma chave) devolve a mesma compra sem duplicar despesas', rep === rasc && (await um('select count(*)::int n from lancamentos_financeiros where id_compra=$1', [rasc])).n === 3);
const p7 = (await um(SQL_COMPRA, [null, A, null, itens([cabo, 7, 1]), 0, 0, 'a_prazo', 'boleto', 3, await mais(1), true, false, null, randomUUID()])).id;
ok('Parcelamento com centavos: 2,33 + 2,33 + 2,34 (sem fornecedor cadastrado)', (await c.query('select valor from lancamentos_financeiros where id_compra=$1 order by data_vencimento', [p7])).rows.map((x) => N(x.valor)).join() === '2.33,2.33,2.34');
await falha('Compra confirmada não pode ser alterada', SQL_COMPRA, [rasc, A, forn, itens([cam, 1, 1]), 0, 0, 'a_vista', 'pix', 1, null, false, false, null, null], 'Só rascunhos');

// ===== Recebimentos parciais e totais =====
const it = Object.fromEntries((await c.query('select id_produto, id from itens_compra where id_compra=$1', [rasc])).rows.map((x) => [x.id_produto, x.id]));
await falha('Recebimento acima do comprado recusado', 'select registrar_recebimento_compra($1,$2::jsonb,$3::date,null,null)', [rasc, receber([it[cam], 51]), hoje], 'maior que o comprado');
await falha('Recebimento com data futura recusado', 'select registrar_recebimento_compra($1,$2::jsonb,$3::date,null,null)', [rasc, receber([it[cam], 1]), await mais(1)], 'Data');
const chR = randomUUID();
const rec1 = (await um('select registrar_recebimento_compra($1,$2::jsonb,$3::date,$4,$5) id', [rasc, receber([it[cam], 20], [it[cabo], 20.5 - 0.5], [it[inst], 1]), hoje, 'Parcial conforme NF', chR])).id;
ok('Recebimento parcial: estoque entra só o recebido (5 + 20 = 25; cabo 0 + 20)', await estoque(cam) === 25 && await estoque(cabo) === 20);
ok('Serviço recebido sem movimentar estoque', (await um('select count(*)::int n from movimentacoes_estoque where id_compra=$1 and id_produto=$2', [rasc, inst])).n === 0
  && N((await um('select quantidade_recebida q from itens_compra where id=$1', [it[inst]])).q) === 1);
const rec1b = (await um('select registrar_recebimento_compra($1,$2::jsonb,$3::date,null,$4) id', [rasc, receber([it[cam], 20]), hoje, chR])).id;
ok('Recebimento repetido (mesma chave) não duplica estoque', rec1b === rec1 && await estoque(cam) === 25);
let s = (await c.query('select * from buscar_compras($1,null,null,null,null,null,20,0)', [A])).rows.find((x) => x.id === rasc);
ok('Situação parcialmente recebida; valor recebido fisicamente ≠ pago', s.situacao === 'parcialmente_recebida' && N(s.valor_recebido) === 715 && N(s.pago) === 0 && N(s.a_pagar) === 1515, JSON.stringify(s));
ok('Recebimento não paga nada (contas continuam pendentes)', (await um("select count(*)::int n from lancamentos_financeiros where id_compra=$1 and status='pago'", [rasc])).n === 0);
await falha('Recebimento de item de outra compra recusado', 'select registrar_recebimento_compra($1,$2::jsonb,$3::date,null,null)', [p7, receber([it[cam], 1]), hoje], 'não pertence');
await c.query('select registrar_recebimento_compra($1,$2::jsonb,$3::date,null,null)', [rasc, receber([it[cam], 30]), hoje]);
s = (await c.query("select * from buscar_compras($1,null,'recebida',null,null,null,20,0)", [A])).rows.find((x) => x.id === rasc);
ok('Recebimento total: situação recebida e estoque 55', s?.situacao === 'recebida' && await estoque(cam) === 55);
await falha('Nada a receber depois de completo', 'select registrar_recebimento_compra($1,$2::jsonb,$3::date,null,null)', [rasc, receber([it[cam], 0.001]), hoje], 'maior que o comprado');

// ===== Estorno de recebimento (correção) =====
await c.query("select movimentar_estoque($1,'saida',50,'Venda balcão',null)", [cam]); // saldo 5: não dá para estornar 30
const rec2 = (await um('select id from recebimentos_compra where id_compra=$1 and id<>$2', [rasc, rec1])).id;
await falha('Estorno recusado se o estoque já foi consumido', "select estornar_recebimento_compra($1,'Erro de contagem')", [rec2], 'estoque atual');
await c.query("select movimentar_estoque($1,'entrada',30,'Ajuste',null)", [cam]);
await c.query("select estornar_recebimento_compra($1,'Erro de contagem')", [rec2]);
ok('Estorno do recebimento: tira do estoque, volta a pendente e mantém histórico', await estoque(cam) === 5 && N((await um('select quantidade_recebida q from itens_compra where id=$1', [it[cam]])).q) === 20
  && (await c.query('select tipo from movimentacoes_estoque where id_recebimento_compra=$1 order by criado_em', [rec2])).rows.map((x) => x.tipo).join() === 'compra,estorno_compra'
  && (await um('select estornado_em is not null e from recebimentos_compra where id=$1', [rec2])).e);
await falha('Estorno repetido recusado', "select estornar_recebimento_compra($1,'De novo')", [rec2], 'já foi estornado');

// ===== Pagamentos: integral e parcial; Financeiro protegido =====
const [l1] = (await c.query('select id from lancamentos_financeiros where id_compra=$1 order by data_vencimento', [rasc])).rows.map((x) => x.id);
await falha('Financeiro não altera valor de despesa da compra', 'select salvar_lancamento_financeiro($1,$2,\'despesa\',\'X\',1,(select id_categoria from lancamentos_financeiros where id=$1),$3::date,$3::date,null,null,null,null,null)', [l1, A, hoje], 'compra');
await falha('Financeiro não exclui despesa da compra por fora', 'select excluir_lancamento_financeiro($1)', [l1], '');
await c.query('select registrar_pagamento_compra($1,200,$2::date,$3)', [l1, hoje, conta]);
await falha('Pagamento acima do saldo da conta a pagar recusado', 'select registrar_pagamento_compra($1,305.01,$2::date,$3)', [l1, hoje, conta], 'maior que o saldo');
await c.query('select registrar_pagamento_compra($1,305,$2::date,$3)', [l1, hoje, conta]);
s = (await c.query('select * from buscar_compras($1,null,null,null,null,null,20,0)', [A])).rows.find((x) => x.id === rasc);
ok('Parcial + integral: pago 505, a pagar 1010, soma preservada', N(s.pago) === 505 && N(s.a_pagar) === 1010 && (await um('select sum(valor) s from lancamentos_financeiros where id_compra=$1', [rasc])).s == 1515);
ok('Pagamento gera saída no caixa da conta', N((await um('select saldo from contas_financeiras_saldo where id=$1', [conta])).saldo) === 4495);
await falha('Conta já paga não aceita novo pagamento', 'select registrar_pagamento_compra($1,1,$2::date,$3)', [l1, hoje, conta], 'já foi paga');
const vista = (await um(SQL_COMPRA, [null, A, forn, itens([cabo, 10, 3.5]), 0, 0, 'a_vista', 'pix', 1, null, true, true, conta, randomUUID()])).id;
ok('À vista paga na confirmação: 1 despesa paga na conta, sem entrada no estoque', (await um("select count(*)::int n from lancamentos_financeiros where id_compra=$1 and status='pago' and id_conta_financeira=$2", [vista, conta])).n === 1 && await estoque(cabo) === 20);
const res = (await um('select resumo_compras($1,$2::date,$3::date) r', [A, `${hoje.slice(0, 7)}-01`, hoje])).r;
ok('Indicadores: comprado ≠ pago ≠ a pagar', N(res.comprado) === 1557 && N(res.pago) === 540 && N(res.a_pagar) === 1017 && res.aguardando_entrega === 3 && res.quantidade === 3, JSON.stringify(res));

// ===== Cancelamentos =====
await falha('Cancelar com recebimento ativo recusado', "select cancelar_compra($1,'Desistência')", [rasc], 'Estorne os recebimentos');
await falha('Cancelar com pagamento recusado', "select cancelar_compra($1,'Desistência')", [vista], 'Estorne o pagamento');
await c.query("select cancelar_compra($1,'Pedido duplicado')", [p7]);
ok('Cancelar sem recebimento/pagamento: contas pendentes canceladas, histórico mantido', (await c.query('select status from lancamentos_financeiros where id_compra=$1', [p7])).rows.every((x) => x.status === 'cancelado')
  && (await um("select dados from historico_compras where id_compra=$1 and acao='cancelada'", [p7])).dados.motivo === 'Pedido duplicado');
await falha('Não recebe compra cancelada', 'select registrar_recebimento_compra($1,$2::jsonb,$3::date,null,null)', [p7, receber([(await um('select id from itens_compra where id_compra=$1', [p7])).id, 1]), hoje], 'confirmadas');
ok('Despesas criadas só pelas compras (sem duplicar)', (await um("select count(*)::int n from lancamentos_financeiros where id_empresa=$1 and tipo='despesa'", [A])).n - despesasAntes === 3 + 1 + 3 + 1);
const hist = (await c.query('select acao from historico_compras where id_compra=$1 order by id', [rasc])).rows.map((x) => x.acao);
ok('Auditoria da compra completa', ['rascunho', 'confirmada', 'recebimento', 'recebimento_estornado', 'pagamento'].every((a) => hist.includes(a)));

// ===== Isolamento e permissões =====
const lPend = (await um("select id from lancamentos_financeiros where id_compra=$1 and status='pendente' limit 1", [rasc])).id;
await como(donoB);
const prodB = (await um(SQL_PRODUTO, [null, B, 'produto', 'Produto B', 'un', 1, 2, 0])).id;
await falha('B não lista compras de A', 'select * from buscar_compras($1)', [A], 'Sem acesso');
await falha('B não usa fornecedor de A', SQL_COMPRA, [null, B, forn, itens([prodB, 1, 1]), 0, 0, 'a_vista', 'pix', 1, null, false, false, null, null], 'Fornecedor não encontrado');
await falha('B não compra produto de A', SQL_COMPRA, [null, B, null, itens([cam, 1, 1]), 0, 0, 'a_vista', 'pix', 1, null, false, false, null, null], 'Produto não encontrado');
await falha('B não recebe compra de A (ID manipulado)', 'select registrar_recebimento_compra($1,$2::jsonb,$3::date,null,null)', [rasc, receber([it[cabo], 1]), hoje], 'não encontrada');
await falha('B não paga conta da compra de A', 'select registrar_pagamento_compra($1,1,$2::date,null)', [lPend, hoje], 'não encontrada');
await falha('B não cancela compra de A', "select cancelar_compra($1,'Invasão')", [rasc], 'não encontrada');
await falha('B não edita fornecedor de A', SQL_FORN, [forn, B, 'pj', 'Invasor', null, null, null, null, 'ativo'], 'não encontrado');
await falha('B não estorna recebimento de A', "select estornar_recebimento_compra($1,'Invasão')", [rec1], 'não encontrado');
ok('RLS: B não vê compras, itens, recebimentos nem fornecedores de A', (await c.query('select 1 from compras where id_empresa=$1 union all select 1 from itens_compra where id_empresa=$1 union all select 1 from recebimentos_compra where id_empresa=$1 union all select 1 from fornecedores where id_empresa=$1', [A])).rows.length === 0);
await como(master);
await falha('Admin Master sem acesso automático', 'select resumo_compras($1,$2::date,$3::date)', [A, hoje, hoje], 'Sem acesso');
await como(donoA);
const vinc = (await um("select solicitar_vinculo_contabil($1,$2,null,'principal',$3) id", [A, contC, ['ver_documentos']])).id;
await como(contC);
await c.query('select responder_vinculo_contabil($1, true, null)', [vinc]);
await falha('Contador sem permissão financeira não vê compras', 'select * from buscar_compras($1)', [A], 'Sem acesso');
await como(donoA);
await c.query("select alterar_vinculo_contabil($1,'principal',$2)", [vinc, ['ver_financeiro']]);
await como(contC);
ok('Contador com "Ver financeiro" lê compras e fornecedores', (await c.query('select * from buscar_compras($1)', [A])).rows.length > 0 && (await c.query('select * from buscar_fornecedores($1)', [A])).rows.length > 0);
await falha('Contador não registra compra', SQL_COMPRA, [null, A, null, itens([cam, 1, 1]), 0, 0, 'a_vista', 'pix', 1, null, false, false, null, null], 'permissão');
await falha('Contador não recebe compra', 'select registrar_recebimento_compra($1,$2::jsonb,$3::date,null,null)', [rasc, receber([it[cabo], 1]), hoje], 'não encontrada');
await falha('Contador não cadastra fornecedor', SQL_FORN, [null, A, 'pj', 'Teste', null, null, null, null, 'ativo'], 'permissão');
await admin();
ok('Anônimo sem execução', !(await um("select has_function_privilege('anon','public.salvar_compra(uuid,uuid,uuid,jsonb,numeric,numeric,text,text,integer,date,date,text,boolean,boolean,uuid,uuid)','EXECUTE') p")).p
  && !(await um("select has_function_privilege('anon','public.buscar_fornecedores(uuid,text,text,integer,integer)','EXECUTE') p")).p);
ok('Sem escrita direta para authenticated', !(await um("select has_table_privilege('authenticated','public.compras','INSERT') p")).p && !(await um("select has_table_privilege('authenticated','public.itens_compra','UPDATE') p")).p);
await c.query('rollback');
await c.end();

// ===== Recebimentos simultâneos da mesma compra (duas conexões reais) =====
const adm = new Client({ connectionString: url.replace(/\/[^/]+$/, '/postgres') });
await adm.connect();
await adm.query('drop database if exists unnify_conc_compras');
await adm.query('create database unnify_conc_compras template unnify_local');
const urlConc = url.replace(/\/[^/]+$/, '/unnify_conc_compras');
try {
  const s0 = new Client({ connectionString: urlConc }); await s0.connect();
  const h = ajudantes(s0);
  await h.admin();
  const dono = (await h.um("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 1")).id_usuario;
  const e = await h.um("insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ('66.666.000/0001-06','Conc','c@local.test','Palmas','TO','comum','ATIVA',$1) returning id", [dono]);
  await s0.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  await h.como(dono);
  await s0.query('select inicializar_categorias_financeiras($1)', [e.id]);
  const pc = (await h.um(SQL_PRODUTO, [null, e.id, 'produto', 'Disputado', 'un', 1, 2, 0])).id;
  const comp = (await h.um(SQL_COMPRA, [null, e.id, null, itens([pc, 10, 1]), 0, 0, 'a_vista', 'pix', 1, null, true, false, null, randomUUID()])).id;
  const item = (await h.um('select id from itens_compra where id_compra=$1', [comp])).id;
  const cons = [new Client({ connectionString: urlConc }), new Client({ connectionString: urlConc })];
  for (const x of cons) { await x.connect(); await ajudantes(x).como(dono); }
  await cons[0].query('begin'); await cons[1].query('begin');
  await cons[0].query('select registrar_recebimento_compra($1,$2::jsonb,current_date,null,null)', [comp, receber([item, 7])]);
  const t2 = cons[1].query('select registrar_recebimento_compra($1,$2::jsonb,current_date,null,null)', [comp, receber([item, 7])]).then(() => 'ok', (er) => er.message);
  await new Promise((res) => setTimeout(res, 400));
  await h.admin();
  const esperando = (await s0.query("select count(*)::int n from pg_stat_activity where datname='unnify_conc_compras' and wait_event_type='Lock'")).rows[0].n;
  await cons[0].query('commit');
  const r2 = await t2;
  await cons[1].query(r2 === 'ok' ? 'commit' : 'rollback');
  const fim = await h.um('select (select estoque_atual from produtos where id=$1) e, (select quantidade_recebida from itens_compra where id=$2) q', [pc, item]);
  ok('Recebimentos simultâneos: o 2º espera e é recusado (7 + 7 > 10)', esperando >= 1 && /maior que o comprado/.test(r2) && N(fim.e) === 7 && N(fim.q) === 7, `esperando=${esperando} r2=${r2}`);
  for (const x of cons) await x.end();
  await s0.end();
} finally {
  await adm.query('drop database if exists unnify_conc_compras with (force)');
  await adm.end();
}

let f = 0;
for (const x of r) { if (!x.ok) f++; console.log(`${x.ok ? '✅' : '❌'} ${x.n}${x.ok ? '' : ` — ${x.x}`}`); }
console.log(`\n${r.length - f}/${r.length} aprovados`);
process.exit(f ? 1 : 0);
