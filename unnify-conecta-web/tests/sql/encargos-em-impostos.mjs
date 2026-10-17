// Encargos da folha aprovada em Impostos (migration 060) — PostgreSQL LOCAL; tudo desfeito no final (ROLLBACK).
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
const comp = `${hoje.slice(0, 7)}-01`;
const venc = (await um("select ($1::date + interval '1 month' + interval '6 days')::date::text d", [comp])).d;
const [dono] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 1")).rows.map((x) => x.id_usuario);
const [cont] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 1")).rows.map((x) => x.id_usuario);
const A = (await um("insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ('60.606.000/0001-60','Encargos 60','e@local.test','Palmas','TO','comum','ATIVA',$1) returning id", [dono])).id;
await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, A]);
await c.query("insert into vinculos_contabeis (id_empresa, id_contador, funcao, status, permissoes, origem, aprovado_em) values ($1,$2,'principal','ativo','{ver_folha,processar_folha,gerenciar_impostos}','empresa',now())", [A, cont]);
const objeto = async () => { const cam = `${A}/${randomUUID()}.pdf`; await c.query("insert into storage.objects (bucket_id, name, owner_id, metadata) values ('folha', $1, $2, $3)", [cam, cont, JSON.stringify({ mimetype: 'application/pdf', size: 2048 })]); return cam; };

await como(dono);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const conta = (await um("select salvar_conta_financeira(null,$1,'Banco',null,'conta_corrente',50000,($2::date - 60),false,null) id", [A, hoje])).id;
const f1 = (await um("select salvar_funcionario(null,$1,'Antonio Marques','Técnico',($2::date - 200),'clt',1621,5,true,null,null) id", [A, hoje])).id;
// Cadastro manual prévio do FGTS desta competência (o da folha não pode duplicar nem falhar a aprovação)
const manual = (await um("select salvar_imposto(null,$1,'fgts','FGTS','Caixa',$2::date,$3::date,450,null) id", [A, comp, venc])).id;
await c.query('select confirmar_conferencia_folha($1,$2::date,$3,true)', [A, comp, f1]);
await c.query("select enviar_folha_contador($1,$2::date,'RH Teste',null,true)", [A, comp]);
const idComp = (await um('select id from competencias_folha where id_empresa=$1 and competencia=$2::date', [A, comp])).id;
await como(cont);
await c.query('select iniciar_processamento_folha($1)', [idComp]);
await c.query("select registrar_documento_devolucao_folha($1,'holerite',$2,$3,'h.pdf')", [idComp, f1, await objeto()]);
await c.query('select informar_valores_folha($1,$2,$3)', [idComp, JSON.stringify([{ id_funcionario: f1, valor: 1500 }]),
  JSON.stringify([{ descricao: 'FGTS', valor: 129.68, vencimento: venc }, { descricao: 'INSS (GPS)', valor: 340.5, vencimento: venc }, { descricao: 'Contribuição sindical', valor: 30, vencimento: venc }])]);
const dev = (await um("select concluir_devolucao_folha($1,null) id", [idComp])).id;
await como(dono);
await c.query('select aprovar_folha($1,$2)', [idComp, dev]);

const doFolha = (await c.query("select i.id, i.tipo, i.nome, i.valor, i.vencimento::text v, i.competencia::text cmp from impostos i where i.id_empresa=$1 and i.id_valor_folha is not null order by i.nome", [A])).rows;
ok('Aprovação cria os impostos dos encargos (tipo pelo nome: INSS → inss, sindical → outro)', doFolha.length === 2 && doFolha.some((x) => x.tipo === 'inss' && N(x.valor) === 340.5) && doFolha.some((x) => x.tipo === 'outro' && x.nome === 'Contribuição sindical'));
ok('Mesma competência e vencimento do encargo', doFolha.every((x) => x.cmp === comp && x.v === venc));
const lancs = (await c.query("select id, id_imposto, valor from lancamentos_financeiros where id_empresa=$1 and id_valor_folha is not null and excluido_em is null", [A])).rows;
ok('Contas a pagar: um lançamento por encargo (3), sem duplicar', lancs.length === 3);
ok('Imposto e conta a pagar são o MESMO lançamento', doFolha.every((i) => lancs.filter((l) => l.id_imposto === i.id).length === 1));
ok('FGTS já cadastrado manualmente: não duplica, conta da folha existe e fica registrado no histórico da folha',
  N((await um("select count(*) n from impostos where id_empresa=$1 and tipo='fgts' and excluido_em is null", [A])).n) === 1
  && lancs.some((l) => N(l.valor) === 129.68 && l.id_imposto === null)
  && N((await um("select count(*) n from eventos_folha where id_competencia=$1 and tipo='imposto_nao_vinculado'", [idComp])).n) === 1);
const lista = (await c.query('select nome, situacao from buscar_impostos($1)', [A])).rows;
ok('Aparecem na lista de Impostos da empresa', lista.some((x) => x.nome === 'INSS (GPS)') && lista.some((x) => x.nome === 'Contribuição sindical'));
await como(cont);
ok('Contador com "gerenciar impostos" também vê', (await c.query('select nome from buscar_impostos($1)', [A])).rows.some((x) => x.nome === 'INSS (GPS)'));
await como(dono);
const inss = doFolha.find((x) => x.tipo === 'inss').id;
await falha('Valor do imposto da folha não muda em Impostos', 'select salvar_imposto($1,$2,$3,$4,$5,$6::date,$7::date,$8,null)', [inss, A, 'inss', 'INSS (GPS)', 'Folha de pagamento (contador)', comp, venc, 999], 'encargo da folha');
await falha('Imposto da folha não é cancelado em Impostos', "select cancelar_imposto($1,'teste de cancelamento')", [inss], 'encargo da folha');
await falha('Imposto da folha não é excluído em Impostos', 'select excluir_imposto($1)', [inss], 'encargo da folha');
await c.query('select confirmar_pagamento_imposto($1,$2::date,$3)', [inss, hoje, conta]);
ok('Pagamento pelo módulo Impostos baixa a mesma conta a pagar', (await um('select status from lancamentos_financeiros where id_imposto=$1', [inss])).status === 'pago'
  && (await c.query('select situacao from buscar_impostos($1)', [A])).rows.length >= 2);
await falha('Conta a pagar do encargo continua protegida no Financeiro', 'update lancamentos_financeiros set valor = 1 where id_imposto = $1', [inss], 'permission denied');
ok('Imposto manual de FGTS intacto', N((await um('select valor from impostos where id=$1', [manual])).valor) === 450);
await admin();
const antes = N((await um('select count(*) n from impostos where id_empresa=$1', [A])).n);
await c.query("do $$ declare r record; begin for r in select v.id from valores_folha v join devolucoes_folha d on d.id=v.id_devolucao where v.tipo='encargo' and d.situacao='aprovada' loop perform imposto_de_encargo_folha(r.id); end loop; end $$");
ok('Rodar de novo (backfill) não duplica', N((await um('select count(*) n from impostos where id_empresa=$1', [A])).n) === antes);
const priv = await um("select has_function_privilege('authenticated','public.imposto_de_encargo_folha(uuid)','EXECUTE') a");
ok('Função interna fora do alcance de usuários', priv.a === false);

await c.query('rollback');
await c.end();
const falhas = r.filter((x) => !x.ok);
for (const x of r) console.log(`${x.ok ? '✅' : '❌'} ${x.n}${x.ok ? '' : ` — ${x.x}`}`);
console.log(`\n${r.length - falhas.length}/${r.length} verificações OK`);
process.exit(falhas.length ? 1 : 0);
