// Excluir guia de imposto (migration 049) no PostgreSQL LOCAL; tudo desfeito no final. Recusa rodar fora de localhost.
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
const conta = async (s, p = []) => Number((await um(s, p)).n);
const como = (id) => c.query("select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false), set_config('storage.allow_delete_query', 'true', false), set_config('role', 'authenticated', false)", [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
const admin = () => c.query("reset role; select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)");
async function falha(n, s, p, t) { await c.query('savepoint t'); try { await c.query(s, p); await c.query('release savepoint t'); ok(n, false, 'não falhou'); } catch (e) { await c.query('rollback to savepoint t'); ok(n, !t || e.message.includes(t), e.message.slice(0, 100)); } }

await c.query('begin');
await admin();
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const mais = async (d) => (await um('select ($1::date + $2::int)::text d', [hoje, d])).d;
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
const [contC, contD] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 2")).rows.map((x) => x.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'eg@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`55.${n}${n}${n}.000/0001-0${n}`, `Guia ${n} LTDA`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
const vinc = async (emp, cont, perms) => (await um("insert into vinculos_contabeis (id_empresa, id_contador, funcao, status, permissoes, origem, aprovado_em) values ($1,$2,'principal','ativo',$3,'empresa',now()) returning id", [emp, cont, perms])).id;
const vC = await vinc(A, contC, ['gerenciar_impostos']);
await vinc(B, contD, ['gerenciar_impostos']);
await como(donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const conta1 = (await um("select salvar_conta_financeira(null,$1,'Banco',null,'conta_corrente',5000,($2::date - 30),false,null) id", [A, hoje])).id;
const comp = `${hoje.slice(0, 7)}-01`;
const novoImposto = async (quem, tipo, nome) => { await como(quem); return (await um('select salvar_imposto(null,$1,$2,$3,$4,$5::date,$6::date,$7,null) id', [A, tipo, nome, 'Receita', comp, await mais(10), 500])).id; };
// guia/comprovante: arquivo no bucket + registro (como o app faz)
async function enviar(quem, imposto, tipo, nome) {
  await admin();
  const caminho = `${A}/${imposto}/${tipo}-${randomUUID()}.pdf`;
  await c.query("insert into storage.objects (bucket_id, name, metadata) values ('guias-impostos', $1, '{\"size\": 4096}')", [caminho]);
  await como(quem);
  const id = (await um('select registrar_arquivo_imposto($1,$2,$3,$4,4096) id', [imposto, tipo, caminho, nome])).id;
  return { id, caminho };
}
const noBucket = async (caminho) => { await admin(); return conta("select count(*) n from storage.objects where bucket_id='guias-impostos' and name=$1", [caminho]); };

// ---------- Estrutura ----------
ok('Anônimo não executa; usuário logado sim', !(await um("select has_function_privilege('anon','public.excluir_guia_imposto(uuid)','EXECUTE') x")).x
  && (await um("select has_function_privilege('authenticated','public.excluir_guia_imposto(uuid)','EXECUTE') x")).x);
ok('Histórico aceita "guia_excluida" e continua recusando ações inventadas', (await um("select pg_get_constraintdef(oid) d from pg_constraint where conname='historico_impostos_acao_check'")).d.includes('guia_excluida'));

// ---------- Contador exclui a guia ----------
const imp1 = await novoImposto(contC, 'das', 'DAS – Simples Nacional');
const g1 = await enviar(contC, imp1, 'guia', 'DAS_09.pdf');
const comp1 = await enviar(contC, imp1, 'comprovante', 'comprovante.pdf');
await como(contC);
await falha('Comprovante não é excluído por esta função', 'select excluir_guia_imposto($1)', [comp1.id], 'Guia não encontrada');
await falha('Id inexistente', 'select excluir_guia_imposto($1)', [randomUUID()], 'Guia não encontrada');
ok('Antes de excluir o registro, o Storage NÃO deixa apagar o arquivo registrado', (await c.query("delete from storage.objects where bucket_id='guias-impostos' and name=$1", [g1.caminho])).rowCount === 0);
const caminho = (await um('select excluir_guia_imposto($1) c', [g1.id])).c;
ok('Exclui o registro e devolve o caminho do arquivo', caminho === g1.caminho && (await c.query('select 1 from arquivos_impostos where id=$1', [g1.id])).rows.length === 0);
ok('Depois disso o próprio usuário consegue apagar o arquivo do bucket', (await c.query("delete from storage.objects where bucket_id='guias-impostos' and name=$1", [caminho])).rowCount === 1);
ok('Comprovante e imposto intactos; resumo sem guias', await conta('select count(*) n from arquivos_impostos where id_imposto=$1', [imp1]) === 1 && (await noBucket(comp1.caminho)) === 1
  && (await um('select status from impostos where id=$1', [imp1])).status === 'pendente');
await como(contC);
ok('Resumo mostra 0 guias enviadas', (await um('select resumo_impostos($1) r', [A])).r.guias === 0);
ok('Histórico registra "guia_excluida" com o nome do arquivo e o autor', (await um("select count(*) n from historico_impostos where id_imposto=$1 and acao='guia_excluida' and dados->>'arquivo'='DAS_09.pdf' and id_usuario=$2", [imp1, contC])).n === '1');
await falha('Excluir de novo falha', 'select excluir_guia_imposto($1)', [g1.id], 'Guia não encontrada');

// ---------- Dono também exclui; permissão e isolamento ----------
const imp2 = await novoImposto(donoA, 'fgts', 'FGTS Digital');
const g2 = await enviar(donoA, imp2, 'guia', 'FGTS.pdf');
await como(contD);
await falha('Contador de outra empresa não exclui', 'select excluir_guia_imposto($1)', [g2.id], 'Guia não encontrada');
await como(master);
await falha('Admin Master não exclui', 'select excluir_guia_imposto($1)', [g2.id], 'Guia não encontrada');
await admin();
await c.query("update vinculos_contabeis set permissoes = '{ver_documentos}' where id = $1", [vC]);
await como(contC);
await falha('Contador sem "gerenciar_impostos" não exclui', 'select excluir_guia_imposto($1)', [g2.id], 'Guia não encontrada');
await admin();
await c.query("update vinculos_contabeis set permissoes = '{gerenciar_impostos}' where id = $1", [vC]);
await como(donoA);
ok('Dono/sócio da empresa exclui a guia', (await um('select excluir_guia_imposto($1) c', [g2.id])).c === g2.caminho);
const g5 = await enviar(donoA, await novoImposto(donoA, 'iss', 'ISSQN'), 'guia', 'iss.pdf');
await como(donoB);
await falha('Dono de outra empresa não exclui', 'select excluir_guia_imposto($1)', [g5.id], 'Guia não encontrada');

// ---------- Regras de situação ----------
const imp3 = await novoImposto(donoA, 'darf', 'DARF – IRPJ/CSLL');
const g3 = await enviar(donoA, imp3, 'guia', 'darf.pdf');
await como(donoA);
await c.query('select confirmar_pagamento_imposto($1,$2::date,$3)', [imp3, hoje, conta1]);
await falha('Imposto já pago: a guia fica como prova', 'select excluir_guia_imposto($1)', [g3.id], 'já pago');
const imp4 = await novoImposto(donoA, 'inss', 'INSS (GPS/DCTFWeb)');
const g4 = await enviar(donoA, imp4, 'guia', 'inss.pdf');
await como(donoA);
await c.query('select cancelar_imposto($1,$2)', [imp4, 'Lançado por engano']);
await falha('Imposto cancelado: não exclui a guia', 'select excluir_guia_imposto($1)', [g4.id], 'cancelado');
ok('Guias recusadas continuam registradas e no bucket', await conta('select count(*) n from arquivos_impostos where id = any($1)', [[g3.id, g4.id]]) === 2 && (await noBucket(g3.caminho)) === 1);

await admin();
await c.query('rollback');
await c.end();
for (const y of r) console.log(`${y.ok ? 'OK   ' : 'FALHA'} ${y.n}${y.x ? `  [${y.x}]` : ''}`);
const f = r.filter((y) => !y.ok).length;
console.log(`\n${r.length - f}/${r.length} verificações OK`);
process.exit(f ? 1 : 0);
