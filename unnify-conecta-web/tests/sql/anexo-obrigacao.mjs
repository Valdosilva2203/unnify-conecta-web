// Anexo de obrigação + XLSX (migration 047) direto no PostgreSQL LOCAL restaurado do backup, como usuários
// autenticados (auth.uid() simulado), incluindo as políticas do Storage. Recusa rodar fora de localhost.
// Uso: node tests/sql/anexo-obrigacao.mjs [postgres://...]
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

const url = process.argv[2] ?? 'postgres://postgres@localhost:55432/unnify_local';
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Recusado: estes testes só rodam em banco local.');
const c = new Client({ connectionString: url });
await c.connect();
const resultados = [];
const ok = (nome, cond, extra = '') => resultados.push({ nome, ok: !!cond, extra });
const um = async (sql, p = []) => (await c.query(sql, p)).rows[0];
// storage.allow_delete_query: é o que a API do Storage liga antes de remover (as políticas de RLS continuam valendo)
const como = (id) => c.query("select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false), set_config('storage.allow_delete_query', 'true', false), set_config('role', 'authenticated', false)",
  [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
const comoAdmin = () => c.query("reset role; select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)");
async function falha(nome, sql, p = [], trecho) {
  await c.query('savepoint t');
  try { await c.query(sql, p); await c.query('release savepoint t'); ok(nome, false, 'não falhou'); }
  catch (e) { await c.query('rollback to savepoint t'); ok(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 90)); }
}
const conta = async (sql, p = []) => Number((await um(sql, p)).n);

await c.query('begin'); // tudo numa transação desfeita ao final: o banco local volta ao estado restaurado
await comoAdmin();
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global = 'user' and tipo_usuario = 'empresa' limit 2")).rows.map((r) => r.id_usuario);
const [contC, contD] = (await c.query("select id_usuario from perfis where funcao_global = 'user' and tipo_usuario = 'contador' limit 2")).rows.map((r) => r.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global = 'admin_master' limit 1")).id_usuario;
async function empresa(dono, rotulo) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por)
                      values ($1, $2, 'e3@local.test', 'Palmas', 'TO', 'comum', 'ATIVA', $3) returning id`, [`88.${rotulo === 'A' ? '111' : '222'}.000/0001-0${rotulo === 'A' ? 1 : 2}`, `E3 ${rotulo}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1, $2, 'dono', true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 'A');
const B = await empresa(donoB, 'B');
const vinculo = async (emp, cont, perms) => (await um(
  "insert into vinculos_contabeis (id_empresa, id_contador, funcao, status, permissoes, origem, aprovado_em) values ($1, $2, 'principal', 'ativo', $3, 'empresa', now()) returning id",
  [emp, cont, perms])).id;
let vC = await vinculo(A, contC, []);
await vinculo(B, contD, ['ver_documentos', 'enviar_documentos', 'gerenciar_obrigacoes']);
const permissoes = (perms) => comoAdmin().then(() => c.query('update vinculos_contabeis set permissoes = $2 where id = $1', [vC, perms]));

// "Upload" no Storage como o usuário (as políticas de INSERT valem) e registro pela função
async function enviar(usuario, emp, ext = 'pdf', mime = 'application/pdf', compartilhar = false, nome = 'Contrato social') {
  const caminho = `${emp}/${randomUUID()}.${ext}`;
  await como(usuario);
  await c.query("insert into storage.objects (bucket_id, name, owner_id, metadata) values ('documentos-empresas', $1, $2, $3)",
    [caminho, usuario, JSON.stringify({ mimetype: mime, size: 2048 })]);
  const id = (await um('select registrar_documento($1, $2, $3, $4, $5, $6) id', [emp, caminho, nome, 'societarios', compartilhar, `${nome}.${ext}`])).id;
  return { id, caminho };
}


const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
await permissoes(['gerenciar_obrigacoes']); // contador de A: gerencia obrigações, mas não envia documentos

// ---------- Bucket e tipos ----------
const bucket = await um("select allowed_mime_types m, public from storage.buckets where id = 'documentos-empresas'");
ok('Bucket segue privado e aceita XLSX', bucket.public === false && bucket.m.includes(XLSX) && bucket.m.length === 4);
ok('Caminho .xlsx válido; .xlsm/.docx não', (await um("select caminho_documento_valido($1) a, caminho_documento_valido($2) b, caminho_documento_valido($3) c",
  [`${A}/${randomUUID()}.xlsx`, `${A}/${randomUUID()}.xlsm`, `${A}/${randomUUID()}.docx`])).a === true);

// ---------- Dono anexa na obrigação ----------
const xl = await enviar(donoA, A, 'xlsx', XLSX, true, 'Planilha DAS');
ok('Dono registra XLSX (tipo/extensão coerentes)', (await um('select tipo_mime from documentos_empresa where id = $1', [xl.id])).tipo_mime === XLSX);
const pdf = await enviar(donoA, A, 'pdf', 'application/pdf', true, 'Guia PDF');
await falha('XLSX com extensão pdf é recusado', 'select registrar_documento($1, $2, $3, $4, false, $5)', [A, (await (async () => {
  const cam = `${A}/${randomUUID()}.pdf`;
  await c.query("insert into storage.objects (bucket_id, name, owner_id, metadata) values ('documentos-empresas', $1, $2, $3)", [cam, donoA, JSON.stringify({ mimetype: XLSX, size: 10 })]);
  return cam;
})()), 'X', 'outros', 'x.pdf'], 'Tipo de arquivo');
const obr = (await um('select salvar_obrigacao(null, $1, $2, null, $3, null, $4::date, null, $5) id', [A, 'DAS de setembro', 'fiscal', hoje, xl.id])).id;
ok('Obrigação criada com anexo', (await um('select id_documento from obrigacoes_empresa where id = $1', [obr])).id_documento === xl.id);
ok('Dono lê o anexo na obrigação (view)', (await um('select id_documento from obrigacoes_empresa_situacao where id = $1', [obr])).id_documento === xl.id);
ok('Dono lê o arquivo no Storage', await conta("select count(*) n from storage.objects where bucket_id = 'documentos-empresas' and name = $1", [xl.caminho]) === 1);
const trocar = await um('select salvar_obrigacao($1, $2, $3, null, $4, null, $5::date, null, $6) id', [obr, A, 'DAS de setembro', 'fiscal', hoje, pdf.id]);
ok('Edição substitui o anexo (XLSX → PDF)', (await um('select id_documento from obrigacoes_empresa where id = $1', [obr])).id_documento === pdf.id);
const docB = await enviar(donoB, B, 'xlsx', XLSX, true, 'Da B');
await como(donoA);
await falha('Anexo de outra empresa não vincula', 'select salvar_obrigacao(null, $1, $2, null, $3, null, $4::date, null, $5)', [A, 'Outra', 'fiscal', hoje, docB.id], 'inválido');
await como(donoA);
await falha('Documento vinculado não pode ser excluído enquanto a obrigação está ativa', 'select excluir_documento($1)', [pdf.id], 'vinculado');

// ---------- Contador ----------
await como(contC);
ok('Contador com gerenciar_obrigacoes (sem ver_documentos) vê a obrigação, mas não o arquivo', await conta('select count(*) n from obrigacoes_empresa where id = $1', [obr]) === 1
  && await conta('select count(*) n from documentos_empresa where id = $1', [pdf.id]) === 0
  && await conta("select count(*) n from storage.objects where bucket_id = 'documentos-empresas' and name = $1", [pdf.caminho]) === 0);
await falha('Contador sem enviar_documentos não envia anexo', "insert into storage.objects (bucket_id, name, owner_id, metadata) values ('documentos-empresas', $1, $2, '{}')", [`${A}/${randomUUID()}.xlsx`, contC]);
await permissoes(['gerenciar_obrigacoes', 'ver_documentos', 'enviar_documentos']);
await como(contC);
ok('Com ver_documentos o contador lê o anexo compartilhado e o arquivo', await conta('select count(*) n from documentos_empresa where id = $1', [pdf.id]) === 1
  && await conta("select count(*) n from storage.objects where bucket_id = 'documentos-empresas' and name = $1", [pdf.caminho]) === 1);
const xc = await enviar(contC, A, 'xlsx', XLSX, false, 'Do contador');
ok('Contador com enviar_documentos anexa XLSX: nasce compartilhado e origem contador', (await um('select origem, compartilhado_contador c from documentos_empresa where id = $1', [xc.id])).origem === 'contador');
const ob2 = (await um('select salvar_obrigacao(null, $1, $2, null, $3, null, $4::date, null, $5) id', [A, 'ISS', 'fiscal', hoje, xc.id])).id;
ok('Contador cria obrigação com anexo próprio', !!ob2);
await como(donoA);
ok('Dono vê o anexo enviado pelo contador (obrigação e arquivo)', await conta('select count(*) n from documentos_empresa where id = $1', [xc.id]) === 1
  && await conta("select count(*) n from storage.objects where bucket_id = 'documentos-empresas' and name = $1", [xc.caminho]) === 1);

// ---------- Isolamento ----------
await como(contD);
ok('Contador de outra empresa não vê obrigação, documento nem arquivo da A', await conta('select count(*) n from obrigacoes_empresa where id_empresa = $1', [A]) === 0
  && await conta('select count(*) n from documentos_empresa where id_empresa = $1', [A]) === 0
  && await conta("select count(*) n from storage.objects where bucket_id = 'documentos-empresas' and name = $1", [xl.caminho]) === 0);
await como(donoB);
ok('Dono de outra empresa não lê o arquivo da A', await conta("select count(*) n from storage.objects where bucket_id = 'documentos-empresas' and name = $1", [pdf.caminho]) === 0);
await como(master);
ok('Admin Master não acessa anexos nem documentos de empresas', await conta('select count(*) n from documentos_empresa where id_empresa = $1', [A]) === 0
  && await conta("select count(*) n from storage.objects where bucket_id = 'documentos-empresas' and name = $1", [pdf.caminho]) === 0);
await comoAdmin();

await comoAdmin();
await c.query('rollback');
await c.end();
for (const x of resultados) console.log(`${x.ok ? 'OK   ' : 'FALHA'} ${x.nome}${x.extra ? `  [${x.extra}]` : ''}`);
const falhas = resultados.filter((x) => !x.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações OK`);
process.exit(falhas ? 1 : 0);
