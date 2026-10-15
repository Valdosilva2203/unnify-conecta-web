// Recibos (migration 043) no PostgreSQL LOCAL. Parte 1: BEGIN…ROLLBACK. Parte 2 (emissões simultâneas, duas conexões):
// cópia temporária do banco local (unnify_conc_recibos), apagada no final.
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
// emitir_recibo(empresa, lancamento, cliente, nome, doc, descricao, valor, data, forma, parcial, total, declaracao, obs, chave)
const SQL_EMITIR = 'select emitir_recibo($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12,null,$13) id';
const manual = (emp, extra = {}) => [emp, null, extra.cliente ?? null, extra.nome ?? 'Maria Pagadora', extra.doc ?? null, extra.desc ?? 'Corte de cabelo', extra.valor ?? 40, extra.data, extra.forma ?? 'pix',
  extra.parcial ?? false, extra.total ?? null, extra.declaracao ?? true, extra.chave ?? null];
const vinculado = (emp, lanc, chave = null) => [emp, lanc, null, null, null, null, null, null, null, false, null, false, chave];

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
  const e = await um(`insert into empresas (cnpj, razao_social, nome_comercial, email_comercial, telefone, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'Loja','rc@local.test','63999990000','Palmas','TO','comum','ATIVA',$3) returning id`, [`77.${n}${n}${n}.000/0001-0${n}`, `Emitente ${n} LTDA`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
await como(donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const catR = (await um("select id from categorias_financeiras where id_empresa=$1 and tipo='receita' limit 1", [A])).id;
const conta = (await um("select salvar_conta_financeira(null,$1,'Caixa',null,'conta_corrente',1000,($2::date - 30),false,null) id", [A, hoje])).id;
const cliente = (await um("select salvar_cliente(null,$1,'pf','João Silva',null,'529.982.247-25','(63) 99999-1234',null,null,null,null,null,null,null,null,'ativo',null) id", [A])).id;
const saldo = async () => N((await um('select saldo from contas_financeiras_saldo where id=$1', [conta])).saldo);
const contagem = async () => JSON.stringify(await um('select (select count(*) from lancamentos_financeiros where id_empresa=$1) l, (select count(*) from movimentacoes_financeiras where id_empresa=$1) m', [A]));

// ===== Emissão manual =====
const antes = await contagem();
const saldoAntes = await saldo();
const r1 = (await um(SQL_EMITIR, manual(A, { data: hoje, doc: '529.982.247-25' }))).id;
const d1 = await um('select * from recibos where id=$1', [r1]);
ok('Manual: número 1, emitente da empresa, extenso, não conciliado', d1.numero === 1 && d1.emitente_nome === 'Emitente 1 LTDA' && d1.emitente_documento && d1.valor_extenso === 'quarenta reais'
  && d1.origem === 'manual' && !d1.conciliado && d1.tipo === 'recebimento' && d1.pessoa_documento === '52998224725');
ok('Emitir recibo não cria lançamento nem movimenta caixa', antes === await contagem() && saldoAntes === await saldo());
await falha('Manual sem declaração de recebimento recusado', SQL_EMITIR, manual(A, { data: hoje, declaracao: false }), 'efetivamente recebido');
await falha('Manual com data futura recusado', SQL_EMITIR, manual(A, { data: await mais(1) }), 'futura');
await falha('Manual com CPF inválido recusado', SQL_EMITIR, manual(A, { data: hoje, doc: '529.982.247-24' }), 'inválido');
await falha('Valor com 3 casas recusado', SQL_EMITIR, manual(A, { data: hoje, valor: 10.555 }), 'valor válido');
await falha('Parcial com total menor que o recebido recusado', SQL_EMITIR, manual(A, { data: hoje, parcial: true, total: 30 }), 'total da operação');
const rp = (await um(SQL_EMITIR, manual(A, { data: hoje, valor: 1250, parcial: true, total: 3000, cliente }))).id;
const dp = await um('select parcial, valor_total_operacao, pessoa_nome, valor_extenso from recibos where id=$1', [rp]);
ok('Manual parcial com cliente: dados do cliente e marcação de parcial', dp.parcial && N(dp.valor_total_operacao) === 3000 && dp.pessoa_nome === 'João Silva' && dp.valor_extenso === 'mil duzentos e cinquenta reais');
ok('Histórico do cliente registra o recibo', (await um("select count(*)::int n from historico_clientes where id_cliente=$1 and acao='recibo_emitido'", [cliente])).n === 1);
await falha('Sem escrita direta em recibos', "insert into recibos (id_empresa, numero, tipo, origem, emitente_nome, pessoa_nome, descricao, valor, valor_extenso, data_pagamento, forma_pagamento) values ($1,99,'recebimento','manual','x','yy','zzz',1,'um real',current_date,'pix')", [A], 'permission denied');
const chM = randomUUID();
const m1 = (await um(SQL_EMITIR, manual(A, { data: hoje, chave: chM }))).id;
const m2 = (await um(SQL_EMITIR, manual(A, { data: hoje, chave: chM }))).id;
ok('Mesma chave (duplo clique) não gera outro número', m1 === m2 && (await um('select count(*)::int n from recibos where id_empresa=$1', [A])).n === 3);

// ===== Emissão a partir do Financeiro =====
const rec = async (desc, valor, pago, cli = null) => {
  const id = (await um("select salvar_lancamento_financeiro(null,$1,'receita',$2,$3,$4,$5::date,$5::date,$6::date,null,null,$7,null) id", [A, desc, valor, catR, hoje, pago ? hoje : null, pago ? conta : null])).id;
  if (cli) await c.query('select vincular_cliente_lancamento($1,$2)', [id, cli]);
  return id;
};
const pend = await rec('Mensalidade', 300, false);
await falha('Pagamento pendente não gera recibo', SQL_EMITIR, vinculado(A, pend), 'confirmados');
const pago = await rec('Consultoria', 1850.75, true, cliente);
const rv = (await um(SQL_EMITIR, vinculado(A, pago))).id;
const dv = await um('select * from recibos where id=$1', [rv]);
ok('Vinculado: valor/data/cliente vêm do Financeiro e fica conciliado', N(dv.valor) === 1850.75 && dv.data_pagamento.toISOString().slice(0, 10) === hoje && dv.pessoa_nome === 'João Silva' && dv.conciliado && dv.origem === 'financeiro' && !dv.parcial
  && dv.valor_extenso === 'mil oitocentos e cinquenta reais e setenta e cinco centavos');
await falha('Segundo recibo para o mesmo pagamento recusado', SQL_EMITIR, vinculado(A, pago), 'já tem o recibo nº 000004');
ok('Pagamento com recibo sai da lista de pendentes de recibo', !(await c.query('select * from pagamentos_sem_recibo($1,null,null)', [A])).rows.some((x) => x.id === pago));

// Venda com recebimento parcial → recibo parcial (não quitação)
const prod = (await um("select salvar_produto(null,$1,'servico','Instalação',null,null,null,null,null,0,500,0,'ativo',0) id", [A])).id;
const venda = (await um("select salvar_venda(null,$1,$2,$3::jsonb,0,'a_prazo','pix',$4::date,null,true,false,null,$5) id", [A, cliente, JSON.stringify([{ id_produto: prod, quantidade: 1, preco_unitario: 500 }]), await mais(10), randomUUID()])).id;
const lparc = (await um('select registrar_recebimento_venda($1,200,$2::date,$3) id', [venda, hoje, conta])).id;
const rpv = (await um(SQL_EMITIR, vinculado(A, lparc))).id;
const dpv = await um('select parcial, valor, valor_total_operacao, id_venda, forma_pagamento from recibos where id=$1', [rpv]);
ok('Venda com saldo pendente: recibo marcado como parcial (200 de 500), vínculo e forma da venda', dpv.parcial && N(dpv.valor) === 200 && N(dpv.valor_total_operacao) === 500 && dpv.id_venda === venda && dpv.forma_pagamento === 'pix');
const lfinal = (await um('select registrar_recebimento_venda($1,300,$2::date,$3) id', [venda, hoje, conta])).id;
ok('Última parte da venda: recibo sem marca de parcial', !(await um('select parcial from recibos where id=$1', [(await um(SQL_EMITIR, vinculado(A, lfinal))).id])).parcial);

// Compra paga → comprovante de pagamento (tipo pagamento), beneficiário = fornecedor
const forn = (await um("select salvar_fornecedor(null,$1,'pj','Atacado Central LTDA',null,'11.222.333/0001-81',null,null,null,null,null,null,'ativo') id", [A])).id;
const prodC = (await um("select salvar_produto(null,$1,'produto','Caixa',null,null,null,null,'un',10,20,0,'ativo',0) id", [A])).id;
const compra = (await um("select salvar_compra(null,$1,$2,$3::jsonb,0,0,'a_vista','boleto',1,null,null,null,true,true,$4,$5) id", [A, forn, JSON.stringify([{ id_produto: prodC, quantidade: 3, preco_unitario: 10 }]), conta, randomUUID()])).id;
const lcompra = (await um('select id from lancamentos_financeiros where id_compra=$1', [compra])).id;
const rc = (await um(SQL_EMITIR, vinculado(A, lcompra))).id;
const dc = await um('select tipo, pessoa_nome, pessoa_documento, id_compra, forma_pagamento from recibos where id=$1', [rc]);
ok('Despesa paga de compra: comprovante de pagamento ao fornecedor (não é recibo de quitação)', dc.tipo === 'pagamento' && dc.pessoa_nome === 'Atacado Central LTDA' && dc.pessoa_documento === '11222333000181' && dc.id_compra === compra && dc.forma_pagamento === 'boleto');

// ===== Conciliação de recibo manual =====
const pago40 = await rec('Corte', 40, true);
await falha('Conciliar com valor diferente recusado', 'select conciliar_recibo($1,$2)', [r1, pago], 'diferente');
await c.query('select conciliar_recibo($1,$2)', [r1, pago40]);
const dcz = await um('select conciliado, id_lancamento, valor, descricao from recibos where id=$1', [r1]);
ok('Conciliar: vincula e marca conciliado sem mudar o documento', dcz.conciliado && dcz.id_lancamento === pago40 && N(dcz.valor) === 40 && dcz.descricao === 'Corte de cabelo');
await falha('Conciliar duas vezes recusado', 'select conciliar_recibo($1,$2)', [r1, pago40], 'não conciliados');

// ===== Imutabilidade, segunda via, cancelamento =====
await admin();
await falha('Recibo emitido não é alterado nem por quem tem escrita', "update recibos set valor = 1 where id=$1", [rv], 'não pode ser alterado');
await falha('Recibo não é excluído', 'delete from recibos where id=$1', [rv], 'não são excluídos');
await como(donoA);
await c.query("select registrar_evento_recibo($1,'segunda_via')", [rv]);
await c.query("select registrar_evento_recibo($1,'download')", [rv]);
ok('Segunda via e download auditados, sem novo número', (await um("select count(*)::int n from historico_recibos where id_recibo=$1 and acao in ('segunda_via','download')", [rv])).n === 2
  && (await um('select max(numero) n from recibos where id_empresa=$1', [A])).n === 7);
await falha('Cancelar sem justificativa recusado', "select cancelar_recibo($1,'abc')", [rv], 'justificativa');
await c.query("select cancelar_recibo($1,'Emitido com descrição errada')", [rv]);
ok('Cancelado mantém dados e histórico; libera nova emissão para o pagamento', (await um('select situacao, valor from recibos where id=$1', [rv])).situacao === 'cancelado'
  && (await um(SQL_EMITIR, vinculado(A, pago))).id !== rv && (await um("select count(*)::int n from historico_clientes where id_cliente=$1 and acao='recibo_cancelado'", [cliente])).n === 1);
await falha('Cancelar duas vezes recusado', "select cancelar_recibo($1,'De novo aqui')", [rv], 'já está cancelado');
ok('Cancelar não mexe no Financeiro', (await um('select status from lancamentos_financeiros where id=$1', [pago])).status === 'pago');
const res = (await um('select resumo_recibos($1,$2::date,$3::date) r', [A, `${hoje.slice(0, 7)}-01`, hoje])).r;
// Emitidos válidos: r1(40) rp(1250) m1(40) rpv(200) final(300) rc(pagamento 30) novo(1850.75) = 7; cancelado rv
ok('Indicadores sem cancelados: 7 emitidos, recebido 3680,75, pago 30, 1 cancelado', res.emitidos === 7 && N(res.valor_recebido) === 3680.75 && N(res.valor_pago) === 30 && res.cancelados === 1 && res.nao_conciliados === 2, JSON.stringify(res));
const busca = (await c.query("select * from buscar_recibos($1,'João',null,'emitido',null,null,null,5,0)", [A])).rows;
ok('Busca/filtros/paginação no servidor', busca.length === 4 && busca.every((x) => x.situacao === 'emitido') && N(busca[0].total) === 4);
ok('Filtro por tipo pagamento', (await c.query("select * from buscar_recibos($1,null,'pagamento',null,null,null,null,50,0)", [A])).rows.length === 1);

// ===== Isolamento e permissões =====
await como(donoB);
await falha('B não lista recibos de A', 'select * from buscar_recibos($1)', [A], 'Sem acesso');
await falha('B não emite recibo de lançamento de A (ID manipulado)', SQL_EMITIR, vinculado(B, pago), 'não encontrado');
await falha('B não emite na empresa A', SQL_EMITIR, manual(A, { data: hoje }), 'Sem permissão');
await falha('B não usa cliente de A', SQL_EMITIR, manual(B, { data: hoje, cliente }), 'Cliente não encontrado');
await falha('B não cancela recibo de A', "select cancelar_recibo($1,'Invasão total')", [rp], 'não encontrado');
await falha('B não registra segunda via de A', "select registrar_evento_recibo($1,'segunda_via')", [rp], 'não encontrado');
ok('RLS: B não lê recibos de A', (await c.query('select 1 from recibos where id_empresa=$1', [A])).rows.length === 0);
await como(master);
await falha('Admin Master sem acesso automático', 'select resumo_recibos($1,$2::date,$3::date)', [A, hoje, hoje], 'Sem acesso');
ok('Admin Master não lê a tabela', (await c.query('select 1 from recibos where id_empresa=$1', [A])).rows.length === 0);
await como(donoA);
const vinc = (await um("select solicitar_vinculo_contabil($1,$2,null,'principal',$3) id", [A, contC, ['ver_documentos']])).id;
await como(contC);
await c.query('select responder_vinculo_contabil($1, true, null)', [vinc]);
await falha('Contador sem permissão financeira não vê recibos', 'select * from buscar_recibos($1)', [A], 'Sem acesso');
await como(donoA);
await c.query("select alterar_vinculo_contabil($1,'principal',$2)", [vinc, ['ver_financeiro']]);
await como(contC);
ok('Contador com "Ver financeiro" lê recibos', (await c.query('select * from buscar_recibos($1)', [A])).rows.length > 0);
await falha('Contador não emite recibo', SQL_EMITIR, manual(A, { data: hoje }), 'Sem permissão');
await falha('Contador não cancela recibo', "select cancelar_recibo($1,'Teste do contador')", [rp], 'não encontrado');
await admin();
ok('Anônimo sem execução', !(await um("select has_function_privilege('anon','public.emitir_recibo(uuid,uuid,uuid,text,text,text,numeric,date,text,boolean,numeric,boolean,text,uuid)','EXECUTE') p")).p
  && !(await um("select has_table_privilege('anon','public.recibos','SELECT') p")).p);
await c.query('rollback');
await c.end();

// ===== Emissões simultâneas: numeração sem buraco/duplicidade e um recibo por pagamento =====
const adm = new Client({ connectionString: url.replace(/\/[^/]+$/, '/postgres') });
await adm.connect();
await adm.query('drop database if exists unnify_conc_recibos');
await adm.query('create database unnify_conc_recibos template unnify_local');
const urlConc = url.replace(/\/[^/]+$/, '/unnify_conc_recibos');
try {
  const s0 = new Client({ connectionString: urlConc }); await s0.connect();
  const h = ajudantes(s0);
  await h.admin();
  const dono = (await h.um("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 1")).id_usuario;
  const e = await h.um("insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ('88.888.000/0001-08','Conc','c@local.test','Palmas','TO','comum','ATIVA',$1) returning id", [dono]);
  await s0.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  await h.como(dono);
  await s0.query('select inicializar_categorias_financeiras($1)', [e.id]);
  const cat = (await h.um("select id from categorias_financeiras where id_empresa=$1 and tipo='receita' limit 1", [e.id])).id;
  const k = (await h.um("select salvar_conta_financeira(null,$1,'Caixa',null,'conta_corrente',0,current_date - 1,false,null) id", [e.id])).id;
  const lanc = (await h.um("select salvar_lancamento_financeiro(null,$1,'receita','Venda',100,$2,current_date,current_date,current_date,'Cliente Balcão',null,$3,null) id", [e.id, cat, k])).id;
  const hj = (await h.um('select public.hoje_brasil()::text d')).d;
  const cons = [new Client({ connectionString: urlConc }), new Client({ connectionString: urlConc }), new Client({ connectionString: urlConc })];
  for (const x of cons) { await x.connect(); await ajudantes(x).como(dono); await x.query('begin'); }
  // Duas emissões manuais simultâneas e duas do MESMO pagamento
  const p1 = cons[0].query(SQL_EMITIR, manual(e.id, { data: hj })).then((x) => x.rows[0].id, (er) => er.message);
  await new Promise((res) => setTimeout(res, 200));
  const p2 = cons[1].query(SQL_EMITIR, manual(e.id, { data: hj })).then((x) => x.rows[0].id, (er) => er.message);
  await p1; await cons[0].query('commit');
  await p2; await cons[1].query('commit');
  for (const x of cons.slice(0, 2)) await x.query('begin');
  const q1 = cons[0].query(SQL_EMITIR, vinculado(e.id, lanc)).then(() => 'ok', (er) => er.message);
  await q1;
  const q2 = cons[1].query(SQL_EMITIR, vinculado(e.id, lanc)).then(() => 'ok', (er) => er.message);
  await new Promise((res) => setTimeout(res, 300));
  await cons[0].query('commit');
  const r2 = await q2;
  await cons[1].query(r2 === 'ok' ? 'commit' : 'rollback');
  await cons[2].query('rollback');
  await h.admin();
  const nums = (await s0.query('select numero from recibos where id_empresa=$1 order by numero', [e.id])).rows.map((x) => x.numero).join();
  const doLanc = (await h.um("select count(*)::int n from recibos where id_lancamento=$1 and situacao='emitido'", [lanc])).n;
  ok('Concorrência: números 1,2,3 sem duplicar; o mesmo pagamento recebe só um recibo', nums === '1,2,3' && doLanc === 1 && r2 !== 'ok', `nums=${nums} r2=${r2}`);
  for (const x of cons) await x.end();
  await s0.end();
} finally {
  await adm.query('drop database if exists unnify_conc_recibos with (force)');
  await adm.end();
}

let f = 0;
for (const x of r) { if (!x.ok) f++; console.log(`${x.ok ? '✅' : '❌'} ${x.n}${x.ok ? '' : ` — ${x.x}`}`); }
console.log(`\n${r.length - f}/${r.length} aprovados`);
process.exit(f ? 1 : 0);
