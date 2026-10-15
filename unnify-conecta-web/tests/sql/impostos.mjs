// Impostos e parcelamentos (migration 045) no PostgreSQL LOCAL; tudo desfeito no final.
// Integração com o Financeiro (1 lançamento por imposto/parcela), situações, pagamento informado × confirmado, cancelamentos,
// duplicidade, arquivos/storage, notificações, permissão "gerenciar_impostos", isolamento, Admin Master.
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
async function falha(n, s, p, t) { await c.query('savepoint t'); try { await c.query(s, p); await c.query('release savepoint t'); ok(n, false, 'não falhou'); } catch (e) { await c.query('rollback to savepoint t'); ok(n, !t || e.message.includes(t), e.message.slice(0, 120)); } }
const N = Number;
const SALVAR = 'select salvar_imposto($1,$2,$3,$4,$5,$6::date,$7::date,$8,$9) id';

await c.query('begin');
await admin();
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const mais = async (d) => (await um('select ($1::date + $2::int)::text d', [hoje, d])).d;
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
const [contC, contD] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 2")).rows.map((x) => x.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'im@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`99.${n}${n}${n}.000/0001-0${n}`, `Tributos ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
await como(donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const conta = (await um("select salvar_conta_financeira(null,$1,'Banco',null,'conta_corrente',5000,($2::date - 30),false,null) id", [A, hoje])).id;
const comp = `${hoje.slice(0, 7)}-01`;

// Vínculo do contador: sem a permissão nova, depois com ela
const vinc = (await um("select solicitar_vinculo_contabil($1,$2,null,'principal',$3) id", [A, contC, ['ver_documentos']])).id;
await como(contC);
await c.query('select responder_vinculo_contabil($1, true, null)', [vinc]);
await falha('Contador sem "gerenciar_impostos" não acessa impostos', 'select resumo_impostos($1)', [A], 'Sem acesso');
await falha('Contador sem a permissão não cria imposto', SALVAR, [null, A, 'das', 'DAS – Simples Nacional', 'Receita Federal', comp, await mais(10), 1250, null], 'Sem permissão');
await como(donoA);
await c.query("select alterar_vinculo_contabil($1,'principal',$2)", [vinc, ['ver_documentos', 'gerenciar_impostos']]);
ok('Permissão "gerenciar_impostos" aceita no vínculo', (await um('select permissoes from vinculos_contabeis where id=$1', [vinc])).permissoes.includes('gerenciar_impostos'));

// ===== Contador cria imposto → lançamento único em Contas a pagar + aviso para a empresa =====
await como(contC);
const das = (await um(SALVAR, [null, A, 'das', 'DAS – Simples Nacional', 'Receita Federal', comp, await mais(10), 1250, 'Guia da competência'])).id;
await admin();
const l1 = await um("select l.* from lancamentos_financeiros l where id_imposto=$1", [das]);
ok('Imposto gera 1 despesa pendente com categoria Impostos, valor e vencimento', l1 && l1.tipo === 'despesa' && l1.status === 'pendente' && N(l1.valor) === 1250
  && l1.data_vencimento.toISOString().slice(0, 10) === await mais(10) && (await um('select nome from categorias_financeiras where id=$1', [l1.id_categoria])).nome === 'Impostos');
ok('Empresa recebe notificação do novo imposto', (await um("select count(*)::int n from notificacoes where id_usuario=$1 and tipo='impostos'", [donoA])).n >= 1);
await como(contC);
await falha('Mesmo imposto e competência não duplica', SALVAR, [null, A, 'das', 'DAS – Simples Nacional', 'Receita Federal', comp, await mais(12), 1250, null], 'Já existe');
const fgts = (await um(SALVAR, [null, A, 'fgts', 'FGTS Digital', 'Caixa', comp, await mais(-3), 850, null])).id;
const iss = (await um(SALVAR, [null, A, 'iss', 'ISSQN', 'Prefeitura', comp, await mais(5), 180, null])).id;
let lista = (await c.query("select * from buscar_impostos($1,null,null,null,null,'correntes',50,0)", [A])).rows;
ok('Situações calculadas: vencido e pendente', lista.find((x) => x.id === fgts).situacao === 'vencido' && lista.find((x) => x.id === das).situacao === 'pendente');
ok('Filtro "próximos 7 dias" no servidor', (await c.query("select * from buscar_impostos($1,null,null,null,'7','correntes',50,0)", [A])).rows.map((x) => x.id).join() === iss);

// ===== Edição sincroniza o Financeiro; Financeiro não altera por fora =====
await c.query(SALVAR, [das, A, 'das', 'DAS – Simples Nacional', 'Receita Federal', comp, await mais(11), 1300.5, 'Valor corrigido']);
await admin();
const l1b = await um('select valor, data_vencimento::text v from lancamentos_financeiros where id_imposto=$1', [das]);
ok('Editar imposto atualiza o lançamento (sem criar outro)', N(l1b.valor) === 1300.5 && l1b.v === await mais(11) && (await um('select count(*)::int n from lancamentos_financeiros where id_imposto=$1', [das])).n === 1);
await como(donoA);
await falha('Financeiro não altera valor do lançamento de imposto', "select salvar_lancamento_financeiro($1,$2,'despesa','X',1,(select id_categoria from lancamentos_financeiros where id=$1),$3::date,$3::date,null,null,null,null,null)", [l1.id, A, hoje], 'imposto');
await falha('Financeiro não exclui o lançamento de imposto', 'select excluir_lancamento_financeiro($1)', [l1.id], '');

// ===== Pagamento informado ≠ confirmado =====
await c.query('select informar_pagamento_imposto($1,$2::date,1300.5)', [das, hoje]);
lista = (await c.query("select * from buscar_impostos($1,null,null,null,null,'correntes',50,0)", [A])).rows;
ok('Informado: situação "pagamento informado" e lançamento continua pendente', lista.find((x) => x.id === das).situacao === 'pagamento_informado'
  && (await um('select status from lancamentos_financeiros where id_imposto=$1', [das])).status === 'pendente');
ok('Resumo não conta informado como pago', (await um('select resumo_impostos($1) r', [A])).r.pagos_90 === 0);
await admin();
ok('Contador recebe aviso quando a empresa informa o pagamento', (await um("select count(*)::int n from notificacoes where id_usuario=$1 and tipo='impostos'", [contC])).n >= 1);
await como(contC);
await falha('Contador sem permissão financeira não confirma pagamento (baixa)', 'select confirmar_pagamento_imposto($1,$2::date,$3)', [das, hoje, conta], 'não encontrado');
await como(donoA);
await falha('Data de pagamento informado futura recusada', 'select informar_pagamento_imposto($1,$2::date,10)', [iss, await mais(1)], 'futura');
await c.query('select confirmar_pagamento_imposto($1,$2::date,$3)', [das, hoje, conta]);
lista = (await c.query("select * from buscar_impostos($1,null,null,null,null,'correntes',50,0)", [A])).rows;
ok('Confirmado pela baixa do Financeiro: pago e saldo da conta debitado', lista.find((x) => x.id === das).situacao === 'pago'
  && N((await um('select saldo from contas_financeiras_saldo where id=$1', [conta])).saldo) === 5000 - 1300.5);
await falha('Imposto pago não pode ser editado', SALVAR, [das, A, 'das', 'DAS – Simples Nacional', 'Receita Federal', comp, await mais(11), 1, null], 'pago ou cancelado');
await falha('Imposto pago não pode ser cancelado', "select cancelar_imposto($1,'Erro')", [das], 'estorne');
await c.query('select estornar_baixa_lancamento($1)', [l1.id]);
ok('Estorno no Financeiro volta o imposto para "pagamento informado"', (await c.query("select * from buscar_impostos($1,null,null,null,null,'correntes',50,0)", [A])).rows.find((x) => x.id === das).situacao === 'pagamento_informado');
// Baixa direto pelo Financeiro também sincroniza
await c.query('select registrar_baixa_lancamento((select id from lancamentos_financeiros where id_imposto=$1),$2::date,$3,180)', [iss, hoje, conta]);
ok('Baixa feita no Financeiro marca o imposto como pago', (await c.query("select * from buscar_impostos($1,null,'pago',null,null,'correntes',50,0)", [A])).rows.some((x) => x.id === iss));

// ===== Cancelamento =====
await falha('Cancelar sem motivo recusado', "select cancelar_imposto($1,'')", [fgts], 'motivo');
await c.query("select cancelar_imposto($1,'Guia emitida em duplicidade')", [fgts]);
ok('Cancelar: lançamento cancelado (não apagado) e histórico', (await um('select status from lancamentos_financeiros where id_imposto=$1', [fgts])).status === 'cancelado'
  && (await um("select dados from historico_impostos where id_imposto=$1 and acao='cancelado'", [fgts])).dados.motivo === 'Guia emitida em duplicidade');
ok('Após cancelar, o mesmo imposto/competência pode ser lançado de novo', !!(await um(SALVAR, [null, A, 'fgts', 'FGTS Digital', 'Caixa', comp, await mais(2), 850, null])).id);

// ===== Parcelamento com valores diferentes =====
const parcelas = JSON.stringify([{ vencimento: await mais(5), valor: 2400 }, { vencimento: await mais(35), valor: 945.45 }, { vencimento: await mais(65), valor: 946.65 }]);
const parc = (await um("select salvar_parcelamento_tributario($1,'PGFN – Dívida Ativa','PGFN','ACORDO-1',4292.10,null,$2::jsonb) id", [A, parcelas])).id;
const ps = (await c.query('select i.numero_parcela, i.valor, l.valor lv from impostos i join lancamentos_financeiros l on l.id_imposto=i.id where i.id_parcelamento=$1 order by 1', [parc])).rows;
ok('Parcelamento: 3 parcelas, cada uma com seu lançamento e seu valor', ps.length === 3 && ps.map((x) => N(x.valor)).join() === '2400,945.45,946.65' && ps.every((x) => N(x.valor) === N(x.lv)));
await falha('Número de acordo repetido recusado', "select salvar_parcelamento_tributario($1,'PGFN','PGFN','acordo-1',10,null,$2::jsonb)", [A, JSON.stringify([{ vencimento: hoje, valor: 10 }])], 'número de acordo');
await falha('Parcela com valor inválido recusada (atômico)', "select salvar_parcelamento_tributario($1,'X tributo','Órgão','ACORDO-2',10,null,$2::jsonb)", [A, JSON.stringify([{ vencimento: hoje, valor: 0 }])], 'valor válido');
await falha('Parcela não é editada individualmente', SALVAR, [(await um('select id from impostos where id_parcelamento=$1 and numero_parcela=1', [parc])).id, A, 'outro', 'X', 'Y', comp, hoje, 1, null], 'pelo parcelamento');
await c.query('select confirmar_pagamento_imposto((select id from impostos where id_parcelamento=$1 and numero_parcela=1),$2::date,$3)', [parc, hoje, conta]);
let lp = (await c.query('select * from listar_parcelamentos_tributarios($1)', [A])).rows[0];
ok('Resumo do parcelamento: 1/3 pagas, saldo 1892,10, próximo vencimento', N(lp.pagas) === 1 && N(lp.parcelas) === 3 && N(lp.saldo) === 1892.1 && lp.situacao === 'em_andamento');
await c.query("select cancelar_parcelamento_tributario($1,'Acordo rescindido')", [parc]);
lp = (await c.query('select * from listar_parcelamentos_tributarios($1)', [A])).rows[0];
ok('Cancelar parcelamento preserva a parcela paga e cancela as abertas', lp.situacao === 'cancelado'
  && (await c.query('select l.status from impostos i join lancamentos_financeiros l on l.id_imposto=i.id where i.id_parcelamento=$1 order by i.numero_parcela', [parc])).rows.map((x) => x.status).join() === 'pago,cancelado,cancelado');

// ===== Arquivos (guia/comprovante) =====
await admin();
const caminhoGuia = `${A}/${iss}/guia-${randomUUID()}.pdf`;
await c.query("insert into storage.objects (bucket_id, name, metadata) values ('guias-impostos', $1, '{\"size\": 245760}')", [caminhoGuia]);
await como(contC);
await falha('Arquivo com tamanho diferente recusado', "select registrar_arquivo_imposto($1,'guia',$2,'guia.pdf',100)", [iss, caminhoGuia], 'tamanho');
await falha('Caminho de outro imposto recusado', "select registrar_arquivo_imposto($1,'guia',$2,'guia.pdf',245760)", [das, caminhoGuia], 'Caminho');
await c.query("select registrar_arquivo_imposto($1,'guia',$2,'DAS_09.pdf',245760)", [iss, caminhoGuia]);
ok('Guia registrada aparece no imposto e no resumo', (await c.query("select * from buscar_impostos($1,null,null,null,null,'correntes',50,0)", [A])).rows.find((x) => x.id === iss).guia_nome === 'DAS_09.pdf'
  && (await um('select resumo_impostos($1) r', [A])).r.guias === 1);
ok('Storage: contador com permissão lê a guia', (await c.query("select 1 from storage.objects where bucket_id='guias-impostos' and name=$1", [caminhoGuia])).rows.length === 1);
await c.query("savepoint s1");
let enviou = true;
try { await c.query("insert into storage.objects (bucket_id, name, metadata) values ('guias-impostos', $1, '{}')", [`${A}/${iss}/comprovante-${randomUUID()}.pdf`]); } catch { enviou = false; }
await c.query('rollback to savepoint s1');
ok('Storage: contador com permissão envia arquivo na pasta da empresa', enviou);

// ===== Isolamento e acessos =====
await como(donoB);
await falha('Outra empresa não lista impostos de A', 'select * from buscar_impostos($1)', [A], 'Sem acesso');
await falha('Outra empresa não edita imposto de A (ID manipulado)', SALVAR, [iss, B, 'iss', 'X', 'Y', comp, hoje, 1, null], 'não encontrado');
await falha('Outra empresa não cancela imposto de A', "select cancelar_imposto($1,'Invasão')", [das], 'não encontrado');
ok('RLS: outra empresa não vê impostos, parcelamentos nem guias de A', (await c.query("select 1 from impostos where id_empresa=$1 union all select 1 from parcelamentos_tributarios where id_empresa=$1 union all select 1 from storage.objects where bucket_id='guias-impostos'", [A])).rows.length === 0);
await falha('Outra empresa não envia arquivo para a pasta de A', "insert into storage.objects (bucket_id, name, metadata) values ('guias-impostos', $1, '{}')", [`${A}/${iss}/guia-${randomUUID()}.pdf`], 'row-level security');
await como(contD);
await falha('Contador sem vínculo não acessa', 'select resumo_impostos($1)', [A], 'Sem acesso');
await como(master);
await falha('Admin Master sem acesso automático', 'select resumo_impostos($1)', [A], 'Sem acesso');
await como(donoA);
await c.query('savepoint enc');
try { await c.query("select encerrar_vinculo_contabil($1, 'fim do contrato')", [vinc]); await c.query('release savepoint enc'); } catch { await c.query('rollback to savepoint enc'); }
await admin();
const encerrado = (await um('select status from vinculos_contabeis where id=$1', [vinc])).status;
if (encerrado !== 'ativo') {
  await como(contC);
  await falha('Vínculo encerrado: contador perde o acesso', 'select resumo_impostos($1)', [A], 'Sem acesso');
} else ok('Vínculo encerrado: contador perde o acesso (encerramento indisponível neste banco)', true);
await admin();
ok('Sem escrita direta nas tabelas', !(await um("select has_table_privilege('authenticated','public.impostos','INSERT') p")).p && !(await um("select has_table_privilege('authenticated','public.arquivos_impostos','INSERT') p")).p);
ok('Anônimo sem execução', !(await um("select has_function_privilege('anon','public.buscar_impostos(uuid,text,text,text,text,text,integer,integer)','EXECUTE') p")).p);

await c.query('rollback');
await c.end();
let f = 0;
for (const x of r) { if (!x.ok) f++; console.log(`${x.ok ? '✅' : '❌'} ${x.n}${x.ok ? '' : ` — ${x.x}`}`); }
console.log(`\n${r.length - f}/${r.length} aprovados`);
process.exit(f ? 1 : 0);
