// Estoque + Vendas (migration 041) no PostgreSQL LOCAL. Parte 1: tudo em BEGIN…ROLLBACK. Parte 2 (concorrência real com
// duas conexões): cópia temporária do banco local (unnify_conc), apagada no final.
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
const SQL_PRODUTO = 'select salvar_produto($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) id';
const SQL_VENDA = 'select salvar_venda($1,$2,$3,$4::jsonb,$5,$6,$7,$8::date,$9,$10,$11,$12,$13) id';
const itens = (...xs) => JSON.stringify(xs.map(([id, q, preco, desc]) => ({ id_produto: id, quantidade: q, preco_unitario: preco, desconto: desc ?? 0 })));

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
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'ev@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`33.${n}${n}${n}.000/0001-0${n}`, `Loja ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);

// ===== 1. CRUD de produtos e serviços =====
await como(donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const prod = (await um(SQL_PRODUTO, [null, A, 'produto', 'Camiseta Básica', 'Algodão', 'CAM-001', '7891234567890', 'Vestuário', 'un', 25.5, 59.9, 5, 'ativo', 20])).id;
const p0 = await um('select estoque_atual, estoque_minimo, custo, preco_venda from produtos where id=$1', [prod]);
ok('Cria produto com estoque inicial como movimentação registrada', N(p0.estoque_atual) === 20 && N(p0.preco_venda) === 59.9
  && (await um("select count(*)::int n from movimentacoes_estoque where id_produto=$1 and tipo='entrada' and motivo='Estoque inicial'", [prod])).n === 1);
const serv = (await um(SQL_PRODUTO, [null, A, 'servico', 'Instalação', null, 'SRV-01', null, 'Serviços', null, 0, 150, 10, 'ativo', 50])).id;
const s0 = await um('select estoque_atual, estoque_minimo, unidade from produtos where id=$1', [serv]);
ok('Serviço sem controle de quantidade (saldo e mínimo zerados)', N(s0.estoque_atual) === 0 && N(s0.estoque_minimo) === 0 && s0.unidade === 'serv');
await falha('SKU duplicado na mesma empresa (sem diferenciar maiúsculas)', SQL_PRODUTO, [null, A, 'produto', 'Outra', null, 'cam-001', null, null, 'un', 1, 2, 0, 'ativo', 0], 'SKU');
await falha('Preço com mais de 2 casas recusado', SQL_PRODUTO, [null, A, 'produto', 'Errado', null, null, null, null, 'un', 1, 2.345, 0, 'ativo', 0], 'preço válidos');
await falha('Código de barras inválido recusado', SQL_PRODUTO, [null, A, 'produto', 'Errado', null, null, '12AB', null, 'un', 1, 2, 0, 'ativo', 0], 'Código de barras');
await falha('Sem escrita direta em produtos', "insert into produtos (id_empresa, nome) values ($1,'Direto')", [A], 'permission denied');
await falha('Sem alteração direta do saldo', 'update produtos set estoque_atual = 999 where id=$1', [prod], 'permission denied');
await falha('Trocar produto ↔ serviço recusado', SQL_PRODUTO, [prod, A, 'servico', 'Camiseta Básica', null, 'CAM-001', null, null, 'un', 25.5, 59.9, 0, 'ativo', 0], 'trocar');
await um(SQL_PRODUTO, [prod, A, 'produto', 'Camiseta Básica', 'Algodão', 'CAM-001', '7891234567890', 'Vestuário', 'un', 26, 64.9, 5, 'ativo', 999]);
const p1 = await um('select estoque_atual, preco_venda from produtos where id=$1', [prod]);
ok('Editar não altera saldo (estoque inicial ignorado na edição)', N(p1.estoque_atual) === 20 && N(p1.preco_venda) === 64.9);
ok('Histórico de preço registrado', (await um("select dados from historico_produtos where id_produto=$1 and acao='preco'", [prod])).dados.preco_para == 64.9);
await admin();
await falha('Trigger impede saldo "por fora" mesmo para quem tem escrita', 'update produtos set estoque_atual = 1 where id=$1', [prod], 'movimentação registrada');
await como(donoA);
for (let i = 1; i <= 12; i++) await um(SQL_PRODUTO, [null, A, 'produto', `Lote ${String(i).padStart(2, '0')}`, null, `L-${i}`, null, 'Lote', 'un', 1, 2, 3, 'ativo', i % 4 === 0 ? 0 : i]);
const bp1 = (await c.query("select * from buscar_produtos($1,'Lote',null,null,'ativo',5,0)", [A])).rows;
const bp3 = (await c.query("select * from buscar_produtos($1,'Lote',null,null,'ativo',5,10)", [A])).rows;
ok('Busca + paginação no servidor (12 itens, 5/página)', bp1.length === 5 && N(bp1[0].total) === 12 && bp3.length === 2);
ok('Filtro "sem estoque" (3 do lote)', (await c.query("select * from buscar_produtos($1,'Lote','sem_estoque',null,'ativo',50,0)", [A])).rows.length === 3);
ok('Filtro "estoque baixo" (saldo ≤ mínimo: 1,2,3 → 3)', (await c.query("select * from buscar_produtos($1,'Lote','estoque_baixo',null,'ativo',50,0)", [A])).rows.length === 3);
ok('Busca por código de barras exato', (await c.query("select * from buscar_produtos($1,'7891234567890',null,null,'ativo',5,0)", [A])).rows[0]?.id === prod);
const res = (await um('select resumo_estoque($1) r', [A])).r;
ok('Resumo do estoque (cadastrados, sem estoque, baixo)', res.cadastrados === 14 && res.servicos === 1 && res.sem_estoque === 3 && res.estoque_baixo === 3);

// ===== 2. Entradas, saídas e ajustes =====
await c.query("select movimentar_estoque($1,'entrada',10,'Compra NF 123',null)", [prod]);
await c.query("select movimentar_estoque($1,'saida',2.5,'Avaria',null)", [prod]);
await falha('Saída sem justificativa recusada', "select movimentar_estoque($1,'saida',1,'',null)", [prod], 'justificativa');
await c.query("select movimentar_estoque($1,'ajuste',27,'Inventário mensal',null)", [prod]);
const movs = (await c.query('select tipo, quantidade, saldo_apos from movimentacoes_estoque where id_produto=$1 order by criado_em, saldo_apos', [prod])).rows;
ok('Entrada +10, saída −2,5 (decimal), ajuste para o saldo contado (27 → −0,5)', N((await um('select estoque_atual e from produtos where id=$1', [prod])).e) === 27
  && movs.some((m) => m.tipo === 'ajuste' && N(m.quantidade) === -0.5 && N(m.saldo_apos) === 27));
await falha('Movimentar serviço recusado', "select movimentar_estoque($1,'entrada',1,'x',null)", [serv], 'Serviços');
await falha('Ajuste igual ao saldo recusado', "select movimentar_estoque($1,'ajuste',27,'Contagem',null)", [prod], 'nada a ajustar');

// ===== 3. Estoque insuficiente =====
await falha('Saída maior que o saldo recusada (sem estoque negativo)', "select movimentar_estoque($1,'saida',28,'Perda',null)", [prod], 'Estoque insuficiente');
await falha('Venda maior que o saldo recusada', SQL_VENDA, [null, A, null, itens([prod, 30, 64.9]), 0, 'a_vista', 'pix', null, null, true, false, null, null], 'Estoque insuficiente');
ok('Venda recusada não deixa rastros (atomicidade)', (await um('select count(*)::int n from vendas where id_empresa=$1', [A])).n === 0 && N((await um('select estoque_atual e from produtos where id=$1', [prod])).e) === 27);

// ===== 9. Requisições repetidas (movimentação) =====
const chMov = randomUUID();
const m1 = (await um("select movimentar_estoque($1,'entrada',3,'Compra',$2) id", [prod, chMov])).id;
const m2 = (await um("select movimentar_estoque($1,'entrada',3,'Compra',$2) id", [prod, chMov])).id;
ok('Mesma movimentação repetida (mesma chave) não duplica', m1 === m2 && N((await um('select estoque_atual e from produtos where id=$1', [prod])).e) === 30);

// ===== Clientes + contas =====
const cliente = (await um("select salvar_cliente(null,$1,'pf','João Silva',null,'529.982.247-25',null,null,null,null,null,null,null,null,null,'ativo',null) id", [A])).id;
const conta = (await um("select salvar_conta_financeira(null,$1,'Caixa loja',null,'conta_corrente',0,($2::date - 30),false,null) id", [A, hoje])).id;
const resumoAntes = (await um('select resumo_financeiro($1,$2::date) r', [A, `${hoje.slice(0, 7)}-01`])).r;

// ===== 5/6. Produtos + serviços, descontos e totais (rascunho → confirmação) =====
const rasc = (await um(SQL_VENDA, [null, A, cliente, itens([prod, 2, 64.9, 9.8], [serv, 1, 150]), 10, 'a_vista', 'pix', null, 'Entrega amanhã', false, false, null, null])).id;
const vr = await um('select status, subtotal, desconto, total, numero from vendas where id=$1', [rasc]);
ok('Rascunho: totais (2×64,90 − 9,80 + 150 = 270; −10 = 260) e sem efeitos', vr.status === 'rascunho' && N(vr.subtotal) === 270 && N(vr.total) === 260
  && N((await um('select estoque_atual e from produtos where id=$1', [prod])).e) === 30 && (await um('select count(*)::int n from lancamentos_financeiros where id_venda=$1', [rasc])).n === 0);
await falha('Desconto maior que o subtotal recusado', SQL_VENDA, [rasc, A, cliente, itens([prod, 1, 10]), 11, 'a_vista', 'pix', null, null, false, false, null, null], 'Desconto');
await falha('Desconto de item maior que o item recusado', SQL_VENDA, [rasc, A, cliente, itens([prod, 1, 10, 10.01]), 0, 'a_vista', 'pix', null, null, false, false, null, null], 'maior que o valor');
const chave1 = randomUUID();
await um(SQL_VENDA, [rasc, A, cliente, itens([prod, 2, 64.9, 9.8], [serv, 1, 150]), 10, 'a_vista', 'pix', null, 'Entrega amanhã', true, false, null, chave1]);
const v1 = await um('select status from vendas where id=$1', [rasc]);
const l1 = (await c.query('select * from lancamentos_financeiros where id_venda=$1', [rasc])).rows;
ok('Confirmar: baixa só do produto (30 → 28) e serviço sem movimentação', v1.status === 'confirmada' && N((await um('select estoque_atual e from produtos where id=$1', [prod])).e) === 28
  && (await um("select count(*)::int n from movimentacoes_estoque where id_venda=$1 and id_produto=$2", [rasc, serv])).n === 0);
ok('8. Uma receita pendente no Financeiro, com cliente e categoria de vendas', l1.length === 1 && l1[0].status === 'pendente' && N(l1[0].valor) === 260 && l1[0].id_cliente === cliente && l1[0].tipo === 'receita');
ok('8. Histórico do cliente registra a venda', (await um("select count(*)::int n from historico_clientes where id_cliente=$1 and acao='venda_registrada'", [cliente])).n === 1);
let sit = (await c.query("select * from buscar_vendas($1,null,null,null,null,null,10,0)", [A])).rows.find((x) => x.id === rasc);
ok('7. À vista sem comprovação = aguardando pagamento', sit.situacao === 'aguardando_pagamento' && N(sit.a_receber) === 260 && sit.tipos === 'produto,servico');
const resumoMeio = (await um('select resumo_financeiro($1,$2::date) r', [A, `${hoje.slice(0, 7)}-01`])).r;
ok('Venda confirmada não mexe no saldo/caixa (confirmação ≠ recebimento)', N(resumoAntes.saldo_acumulado) === N(resumoMeio.saldo_acumulado));

await falha('8. Financeiro não altera valor de receita de venda', "select salvar_lancamento_financeiro($1,$2,'receita','Venda',1,$3,$4::date,$4::date,null,null,null,null,null)", [l1[0].id, A, l1[0].id_categoria, hoje], 'venda');

// ===== 9. Repetição da confirmação =====
const rep = (await um(SQL_VENDA, [null, A, cliente, itens([prod, 2, 64.9, 9.8], [serv, 1, 150]), 10, 'a_vista', 'pix', null, null, true, false, null, chave1])).id;
ok('Confirmação repetida (mesma chave) devolve a mesma venda sem duplicar estoque/receita', rep === rasc && N((await um('select estoque_atual e from produtos where id=$1', [prod])).e) === 28
  && (await um('select count(*)::int n from lancamentos_financeiros where id_venda=$1', [rasc])).n === 1 && (await um('select count(*)::int n from vendas where id_empresa=$1', [A])).n === 1);
await falha('Venda confirmada não pode ser alterada', SQL_VENDA, [rasc, A, cliente, itens([prod, 1, 1]), 0, 'a_vista', 'pix', null, null, false, false, null, null], 'Só rascunhos');

// ===== 7. À vista com recebimento comprovado, a prazo e parcial =====
const vista = (await um(SQL_VENDA, [null, A, null, itens([prod, 1, 64.9]), 0, 'a_vista', 'dinheiro', null, null, true, true, conta, randomUUID()])).id;
const lv = (await c.query('select status, valor, id_conta_financeira from lancamentos_financeiros where id_venda=$1', [vista])).rows;
ok('À vista recebida: receita paga na conta escolhida', lv.length === 1 && lv[0].status === 'pago' && lv[0].id_conta_financeira === conta);
ok('Recebimento gera movimentação de saldo (caixa)', (await um('select count(*)::int n from movimentacoes_financeiras m join lancamentos_financeiros l on l.id = m.id_lancamento where l.id_venda=$1', [vista])).n === 1);
await falha('A prazo sem vencimento recusada', SQL_VENDA, [null, A, cliente, itens([serv, 1, 100]), 0, 'a_prazo', 'boleto', null, null, true, false, null, null], 'vencimento');
await falha('A prazo não aceita recebimento imediato', SQL_VENDA, [null, A, cliente, itens([serv, 1, 100]), 0, 'a_prazo', 'boleto', await mais(30), null, true, true, conta, null], 'Recebimento imediato');
const prazo = (await um(SQL_VENDA, [null, A, cliente, itens([serv, 2, 150], [prod, 1, 64.9]), 0, 'a_prazo', 'boleto', await mais(30), null, true, false, null, randomUUID()])).id;
const lp = await um('select data_vencimento::text d, valor from lancamentos_financeiros where id_venda=$1', [prazo]);
ok('A prazo gera conta a receber com o vencimento informado', lp.d === await mais(30) && N(lp.valor) === 364.9);
await c.query('select registrar_recebimento_venda($1,100,$2::date,$3)', [prazo, hoje, conta]);
await c.query('select registrar_recebimento_venda($1,64.9,$2::date,$3)', [prazo, hoje, conta]);
const lpp = (await c.query('select status, valor from lancamentos_financeiros where id_venda=$1 order by valor', [prazo])).rows;
sit = (await c.query("select * from buscar_vendas($1,null,null,null,null,null,10,0)", [A])).rows.find((x) => x.id === prazo);
ok('Parcial: 2 recebimentos pagos + 1 pendente com o saldo correto (200)', lpp.filter((x) => x.status === 'pago').length === 2 && lpp.find((x) => x.status === 'pendente').valor == 200
  && lpp.reduce((s, x) => s + N(x.valor), 0) === 364.9 && N(sit.recebido) === 164.9 && N(sit.a_receber) === 200 && sit.situacao === 'aguardando_pagamento');
await falha('Recebimento maior que o saldo recusado', 'select registrar_recebimento_venda($1,200.01,$2::date,$3)', [prazo, hoje, conta], 'maior que o saldo');
await c.query('select registrar_recebimento_venda($1,200,$2::date,$3)', [prazo, hoje, conta]);
sit = (await c.query("select * from buscar_vendas($1,null,'concluida',null,null,null,10,0)", [A])).rows.find((x) => x.id === prazo);
ok('Quitada: situação concluída (sem pendente)', sit?.situacao === 'concluida' && N(sit.recebido) === 364.9);
await falha('Sem saldo a receber', 'select registrar_recebimento_venda($1,1,$2::date,$3)', [prazo, hoje, conta], 'não tem saldo');
// Baixa feita direto no Financeiro também conclui a venda
const lrasc = (await um('select id from lancamentos_financeiros where id_venda=$1', [rasc])).id;
await c.query('select registrar_baixa_lancamento($1,$2::date,$3,260)', [lrasc, hoje, conta]);
ok('8. Baixa pelo Financeiro sincroniza a situação da venda', (await c.query("select * from buscar_vendas($1,null,null,null,null,null,10,0)", [A])).rows.find((x) => x.id === rasc).situacao === 'concluida');
const resV = (await um('select resumo_vendas($1,$2::date,$3::date) r', [A, `${hoje.slice(0, 7)}-01`, hoje])).r;
ok('6/8. Indicadores: vendido 689,80 (3 vendas), recebido 689,80, a receber 0', N(resV.vendido) === 689.8 && resV.quantidade === 3 && N(resV.recebido) === 689.8 && N(resV.a_receber) === 0, JSON.stringify(resV));

// ===== 10. Cancelamentos, estornos e histórico =====
const canc = (await um(SQL_VENDA, [null, A, cliente, itens([prod, 3, 64.9]), 0, 'a_prazo', 'boleto', await mais(10), null, true, false, null, randomUUID()])).id;
const antesC = N((await um('select estoque_atual e from produtos where id=$1', [prod])).e);
await falha('Cancelar sem motivo recusado', "select cancelar_venda($1,'')", [canc], 'motivo');
await c.query("select cancelar_venda($1,'Cliente desistiu')", [canc]);
ok('Cancelar devolve o estoque com estorno (histórico preservado)', N((await um('select estoque_atual e from produtos where id=$1', [prod])).e) === antesC + 3
  && (await c.query('select tipo from movimentacoes_estoque where id_venda=$1 order by criado_em', [canc])).rows.map((x) => x.tipo).join() === 'venda,estorno_venda');
ok('Cancelar cancela a conta a receber (sem apagar)', (await um('select status from lancamentos_financeiros where id_venda=$1', [canc])).status === 'cancelado');
ok('Histórico da venda e do cliente registram o cancelamento', (await um("select dados from historico_vendas where id_venda=$1 and acao='cancelada'", [canc])).dados.motivo === 'Cliente desistiu'
  && (await um("select count(*)::int n from historico_clientes where id_cliente=$1 and acao='venda_cancelada'", [cliente])).n === 1);
await falha('Cancelar duas vezes recusado (não devolve estoque em dobro)', "select cancelar_venda($1,'De novo')", [canc], 'já está cancelada');
await falha('Venda com recebimento: cancelamento recusado até estornar no Financeiro', "select cancelar_venda($1,'Devolução')", [vista], 'Estorne o recebimento');
const lvista = (await um('select id from lancamentos_financeiros where id_venda=$1', [vista])).id;
await c.query('select estornar_baixa_lancamento($1)', [lvista]);
await c.query("select cancelar_venda($1,'Devolução do produto')", [vista]);
ok('Após estorno no Financeiro: cancela, devolve estoque e não sobra receita ativa', (await um('select status from lancamentos_financeiros where id=$1', [lvista])).status === 'cancelado'
  && (await um("select count(*)::int n from movimentacoes_estoque where id_venda=$1 and tipo='estorno_venda'", [vista])).n === 1);
await falha('Financeiro não cancela/exclui receita de venda por fora', 'select excluir_lancamento_financeiro($1)', [lrasc], '');
const rasc2 = (await um(SQL_VENDA, [null, A, null, itens([prod, 1, 64.9]), 0, 'a_vista', 'pix', null, null, false, false, null, null])).id;
await c.query("select cancelar_venda($1,'Rascunho descartado')", [rasc2]);
ok('Cancelar rascunho: sem movimentação nem lançamento', (await um('select count(*)::int n from movimentacoes_estoque where id_venda=$1', [rasc2])).n === 0);
const resV2 = (await um('select resumo_vendas($1,$2::date,$3::date) r', [A, `${hoje.slice(0, 7)}-01`, hoje])).r;
ok('Canceladas fora do total vendido (260 + 364,90)', N(resV2.vendido) === 624.9 && resV2.quantidade === 2, JSON.stringify(resV2));

// ===== 11. Isolamento e permissões =====
await um(SQL_PRODUTO, [(await um("select id from produtos where sku='L-1'")).id, A, 'produto', 'Lote 01', null, 'L-1', null, 'Lote', 'un', 1, 2, 3, 'inativo', 0]);
await falha('Item inativo recusado na venda', SQL_VENDA, [null, A, null, itens([(await um("select id from produtos where sku='L-1'")).id, 1, 2]), 0, 'a_vista', 'pix', null, null, false, false, null, null], 'inativo');
ok('Inativar preserva as movimentações', (await um("select count(*)::int n from movimentacoes_estoque m join produtos p on p.id=m.id_produto where p.sku='L-1'")).n === 1);
const chaveA = (await um('select chave_idempotencia c from vendas where id=$1', [rasc])).c;
await como(donoB);
const prodB = (await um(SQL_PRODUTO, [null, B, 'produto', 'Produto B', null, 'CAM-001', null, null, 'un', 1, 2, 0, 'ativo', 5])).id;
ok('Mesmo SKU em outra empresa é permitido', !!prodB);
await falha('B não lista produtos de A', 'select * from buscar_produtos($1)', [A], 'Sem acesso');
await falha('B não movimenta produto de A (ID manipulado)', "select movimentar_estoque($1,'saida',1,'Invasão',null)", [prod], 'não encontrado');
await falha('B não vende produto de A dentro da própria empresa', SQL_VENDA, [null, B, null, itens([prod, 1, 1]), 0, 'a_vista', 'pix', null, null, true, false, null, null], 'não encontrado');
await falha('B não usa cliente de A', SQL_VENDA, [null, B, cliente, itens([prodB, 1, 1]), 0, 'a_vista', 'pix', null, null, false, false, null, null], 'Cliente não encontrado');
await falha('B não cancela venda de A', "select cancelar_venda($1,'Invasão')", [prazo], 'não encontrada');
await falha('B não registra recebimento em venda de A', 'select registrar_recebimento_venda($1,1,$2::date,null)', [canc, hoje], 'não encontrada');
ok('RLS: B não vê vendas, itens nem movimentações de A', (await c.query('select 1 from vendas where id_empresa=$1 union all select 1 from itens_venda where id_empresa=$1 union all select 1 from movimentacoes_estoque where id_empresa=$1', [A])).rows.length === 0);
await falha('Chave de idempotência de A não devolve venda de A para B', SQL_VENDA, [null, A, null, itens([prodB, 1, 1]), 0, 'a_vista', 'pix', null, null, true, false, null, chaveA], 'não encontrada');
await como(donoA);
await falha('A não vende usando conta de recebimento inexistente/alheia', SQL_VENDA, [null, A, null, itens([serv, 1, 10]), 0, 'a_vista', 'pix', null, null, true, true, randomUUID(), null], '');
await como(master);
await falha('Admin Master sem acesso automático', 'select resumo_vendas($1,$2::date,$3::date)', [A, hoje, hoje], 'Sem acesso');
ok('Admin Master não lê produtos pela tabela', (await c.query('select 1 from produtos where id_empresa=$1', [A])).rows.length === 0);
await como(donoA);
const vinc = (await um("select solicitar_vinculo_contabil($1,$2,null,'principal',$3) id", [A, contC, ['ver_documentos']])).id;
await como(contC);
await c.query('select responder_vinculo_contabil($1, true, null)', [vinc]);
await falha('Contador sem permissão financeira não vê vendas', 'select * from buscar_vendas($1)', [A], 'Sem acesso');
await como(donoA);
await c.query("select alterar_vinculo_contabil($1,'principal',$2)", [vinc, ['ver_financeiro']]);
await como(contC);
ok('Contador com "Ver financeiro" lê vendas e estoque', (await c.query('select * from buscar_vendas($1)', [A])).rows.length > 0 && (await c.query('select * from buscar_produtos($1)', [A])).rows.length > 0);
await falha('Contador não vende', SQL_VENDA, [null, A, null, itens([serv, 1, 10]), 0, 'a_vista', 'pix', null, null, false, false, null, null], 'permissão');
await falha('Contador não movimenta estoque', "select movimentar_estoque($1,'entrada',1,'x',null)", [prod], 'não encontrado');
await falha('Contador não cancela venda', "select cancelar_venda($1,'x x x')", [prazo], 'não encontrada');
await admin();
ok('Anônimo sem execução', !(await um("select has_function_privilege('anon','public.salvar_venda(uuid,uuid,uuid,jsonb,numeric,text,text,date,text,boolean,boolean,uuid,uuid)','EXECUTE') p")).p
  && !(await um("select has_function_privilege('anon','public.buscar_produtos(uuid,text,text,text,text,integer,integer)','EXECUTE') p")).p);
ok('Sem escrita direta em vendas para authenticated', !(await um("select has_table_privilege('authenticated','public.vendas','INSERT') p")).p && !(await um("select has_table_privilege('authenticated','public.movimentacoes_estoque','INSERT') p")).p);
await c.query('rollback');
await c.end();

// ===== 4. Vendas simultâneas (duas conexões reais) numa cópia temporária do banco local =====
const adm = new Client({ connectionString: url.replace(/\/[^/]+$/, '/postgres') });
await adm.connect();
await adm.query('drop database if exists unnify_conc');
await adm.query('create database unnify_conc template unnify_local');
const urlConc = url.replace(/\/[^/]+$/, '/unnify_conc');
try {
  const s = new Client({ connectionString: urlConc }); await s.connect();
  const h = ajudantes(s);
  await h.admin();
  const dono = (await h.um("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 1")).id_usuario;
  const e = await h.um("insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ('44.444.000/0001-04','Conc','c@local.test','Palmas','TO','comum','ATIVA',$1) returning id", [dono]);
  await s.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  await h.como(dono);
  await s.query('select inicializar_categorias_financeiras($1)', [e.id]);
  const pc = (await h.um(SQL_PRODUTO, [null, e.id, 'produto', 'Disputado', null, null, null, null, 'un', 1, 10, 0, 'ativo', 5])).id;
  const pd = (await h.um(SQL_PRODUTO, [null, e.id, 'produto', 'Outro', null, null, null, null, 'un', 1, 10, 0, 'ativo', 5])).id;
  const cons = [new Client({ connectionString: urlConc }), new Client({ connectionString: urlConc })];
  for (const x of cons) { await x.connect(); await ajudantes(x).como(dono); }
  // As duas transações abrem juntas; a 1ª segura o travamento até a 2ª estar esperando
  await cons[0].query('begin'); await cons[1].query('begin');
  const t1 = cons[0].query(SQL_VENDA, [null, e.id, null, itens([pc, 3, 10], [pd, 1, 10]), 0, 'a_vista', 'pix', null, null, true, false, null, randomUUID()]);
  await t1;
  const t2 = cons[1].query(SQL_VENDA, [null, e.id, null, itens([pd, 1, 10], [pc, 3, 10]), 0, 'a_vista', 'pix', null, null, true, false, null, randomUUID()]).then(() => 'ok', (er) => er.message);
  await new Promise((res) => setTimeout(res, 400));
  await h.admin();
  const esperando = (await s.query("select count(*)::int n from pg_stat_activity where datname='unnify_conc' and wait_event_type='Lock'")).rows[0].n;
  await cons[0].query('commit');
  const r2 = await t2;
  await cons[1].query(r2 === 'ok' ? 'commit' : 'rollback');
  await h.admin();
  const fim = await h.um('select (select estoque_atual from produtos where id=$1) a, (select estoque_atual from produtos where id=$2) b, (select count(*)::int from vendas where id_empresa=$3 and status=\'confirmada\') n', [pc, pd, e.id]);
  ok('4. Vendas simultâneas: a 2ª espera o travamento e é recusada (5 − 3 = 2 < 3)', esperando >= 1 && /Estoque insuficiente/.test(r2) && N(fim.a) === 2 && N(fim.b) === 4 && fim.n === 1, `esperando=${esperando} r2=${r2}`);
  // Duas confirmações simultâneas com a MESMA chave: só uma venda
  const ch = randomUUID();
  for (const x of cons) await ajudantes(x).como(dono);
  await cons[0].query('begin'); await cons[1].query('begin');
  await cons[0].query(SQL_VENDA, [null, e.id, null, itens([pd, 1, 10]), 0, 'a_vista', 'pix', null, null, true, false, null, ch]);
  const d2 = cons[1].query(SQL_VENDA, [null, e.id, null, itens([pd, 1, 10]), 0, 'a_vista', 'pix', null, null, true, false, null, ch]).then(() => 'ok', (er) => er.message);
  await new Promise((res) => setTimeout(res, 300));
  await cons[0].query('commit');
  const rd = await d2;
  await cons[1].query(rd === 'ok' ? 'commit' : 'rollback');
  const fim2 = await h.um('select (select estoque_atual from produtos where id=$1) b, (select count(*)::int from vendas where chave_idempotencia=$2) n', [pd, ch]);
  ok('9. Duplo clique simultâneo (mesma chave): uma venda, uma baixa', fim2.n === 1 && N(fim2.b) === 3, `r=${rd}`);
  for (const x of cons) await x.end();
  await s.end();
} finally {
  await adm.query('drop database if exists unnify_conc with (force)');
  await adm.end();
}

let f = 0;
for (const x of r) { if (!x.ok) f++; console.log(`${x.ok ? '✅' : '❌'} ${x.n}${x.ok ? '' : ` — ${x.x}`}`); }
console.log(`\n${r.length - f}/${r.length} aprovados`);
process.exit(f ? 1 : 0);
