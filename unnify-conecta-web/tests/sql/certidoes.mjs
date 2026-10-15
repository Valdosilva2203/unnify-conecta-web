// Certidões (migration 048) no PostgreSQL LOCAL, como usuários autenticados (auth.uid() simulado), incluindo o Storage.
// Tudo em BEGIN…ROLLBACK. Recusa rodar fora de localhost. Uso: node tests/sql/certidoes.mjs [postgres://...]
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

const url = process.argv[2] ?? 'postgres://postgres@localhost:55432/unnify_local';
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Recusado: estes testes só rodam em banco local.');
const c = new Client({ connectionString: url });
await c.connect();
const r = [];
const ok = (n, cond, x = '') => r.push({ n, ok: !!cond, x });
const um = async (s, p = []) => (await c.query(s, p)).rows[0];
const conta = async (s, p = []) => Number((await um(s, p)).n);
const como = (id) => c.query("select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false), set_config('storage.allow_delete_query', 'true', false), set_config('role', 'authenticated', false)",
  [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
const admin = () => c.query("reset role; select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)");
async function falha(n, s, p = [], t) {
  await c.query('savepoint t');
  try { await c.query(s, p); await c.query('release savepoint t'); ok(n, false, 'não falhou'); }
  catch (e) { await c.query('rollback to savepoint t'); ok(n, !t || e.message.includes(t), e.message.slice(0, 100)); }
}

await c.query('begin');
await admin();
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const dia = async (n) => (await um('select ($1::date + $2::int)::text d', [hoje, n])).d;
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
const [contC, contD] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 2")).rows.map((x) => x.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por)
    values ($1, $2, 'cert@local.test', 'Palmas', 'TO', 'comum', 'ATIVA', $3) returning id`, [`66.${n}${n}${n}.000/0001-0${n}`, `Certidões ${n} LTDA`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1, $2, 'dono', true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
const vC = (await um("insert into vinculos_contabeis (id_empresa, id_contador, funcao, status, permissoes, origem, aprovado_em) values ($1, $2, 'principal', 'ativo', '{}', 'empresa', now()) returning id", [A, contC])).id;
await c.query("insert into vinculos_contabeis (id_empresa, id_contador, funcao, status, permissoes, origem, aprovado_em) values ($1, $2, 'principal', 'ativo', '{gerenciar_certidoes}', 'empresa', now())", [B, contD]);
const permissoes = async (p) => { await admin(); await c.query('update vinculos_contabeis set permissoes = $2 where id = $1', [vC, p]); };

// "Upload" como o usuário (políticas de INSERT valem)
async function enviar(usuario, emp, mime = 'application/pdf') {
  const caminho = `${emp}/${randomUUID()}.pdf`;
  await como(usuario);
  await c.query("insert into storage.objects (bucket_id, name, owner_id, metadata) values ('certidoes', $1, $2, $3)", [caminho, usuario, JSON.stringify({ mimetype: mime, size: 4096 })]);
  return caminho;
}
const SALVAR = 'select salvar_certidao($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, $11, $12) id';
const args = (id, emp, cam, extra = {}) => [id, emp, extra.tipo ?? 'federal', extra.nome ?? 'Certidão Federal (RFB/PGFN)', extra.orgao ?? 'Receita Federal do Brasil / PGFN',
  extra.resultado ?? 'negativa', extra.emissao ?? hoje, extra.validade === undefined ? null : extra.validade, extra.codigo ?? '1a2b.3c4d.5e6f.7a8b', extra.obs ?? null, cam, 'cnd.pdf'];

// ---------- Estrutura e permissão ----------
const b = await um("select public, allowed_mime_types m, file_size_limit l from storage.buckets where id = 'certidoes'");
ok('Bucket "certidoes" privado, só PDF, 10 MB', b.public === false && b.m.join() === 'application/pdf' && Number(b.l) === 10485760);
ok('Permissão "gerenciar_certidoes" aceita em vínculos e convites', (await c.query("update vinculos_contabeis set permissoes = '{gerenciar_certidoes}' where id = $1", [vC])).rowCount === 1);
await permissoes([]);
await falha('Permissão inexistente continua recusada', "update vinculos_contabeis set permissoes = '{apagar_tudo}' where id = $1", [vC], 'vinculos_contabeis_permissoes');
ok('Nenhuma escrita direta nas tabelas (só funções)', !(await um("select has_table_privilege('authenticated', 'public.certidoes_empresa', 'INSERT') or has_table_privilege('authenticated', 'public.versoes_certidoes', 'UPDATE') or has_table_privilege('authenticated', 'public.historico_certidoes', 'DELETE') x")).x);
ok('Anônimo sem acesso; funções internas nem para usuário logado', !(await um("select has_table_privilege('anon', 'public.certidoes_empresa', 'SELECT') or has_function_privilege('anon', 'public.salvar_certidao(uuid,uuid,text,text,text,text,date,date,text,text,text,text)', 'EXECUTE') or has_function_privilege('authenticated', 'public.processar_alertas_certidoes()', 'EXECUTE') or has_function_privilege('authenticated', 'public.notificar_certidoes(uuid,text,text,uuid)', 'EXECUTE') or has_function_privilege('authenticated', 'public.alertas_certidoes_interno(uuid)', 'EXECUTE') x")).x);

// ---------- Dono cadastra ----------
const cam1 = await enviar(donoA, A);
const cert = (await um(SALVAR, args(null, A, cam1, { validade: await dia(180) }))).id;
let x = await um('select * from certidoes_situacao where id = $1', [cert]);
ok('Dono cadastra: versão 1, código em maiúsculas, situação válida, arquivo atual', x.versao_atual === 1 && x.codigo_controle === '1A2B.3C4D.5E6F.7A8B' && x.situacao === 'valida' && x.caminho === cam1 && Number(x.tamanho) === 4096);
ok('Histórico "cadastrada" e versão registrada', await conta("select count(*) n from historico_certidoes where id_certidao = $1 and acao = 'cadastrada'", [cert]) === 1
  && await conta('select count(*) n from versoes_certidoes where id_certidao = $1', [cert]) === 1);
await falha('Cadastro sem PDF é recusado', SALVAR, args(null, A, null), 'Envie o PDF');
await falha('Validade anterior à emissão é recusada', SALVAR, args(null, A, await enviar(donoA, A), { validade: await dia(-10) }), 'anterior');
await como(donoA);
await falha('Emissão no futuro é recusada', SALVAR, args(null, A, await enviar(donoA, A), { emissao: await dia(10) }), 'emissão');
await falha('Mesmo arquivo não vira duas versões', SALVAR, args(cert, A, cam1), 'já registrado');
const camImagem = await enviar(donoA, A, 'image/png');
await falha('Arquivo que não é PDF é recusado', SALVAR, args(null, A, camImagem), 'Arquivo não encontrado');
await falha('Storage: caminho fora do padrão recusado', "insert into storage.objects (bucket_id, name, owner_id, metadata) values ('certidoes', $1, $2, '{}')", [`${A}/../x.pdf`, donoA]);
await falha('Storage: dono não envia na pasta de outra empresa', "insert into storage.objects (bucket_id, name, owner_id, metadata) values ('certidoes', $1, $2, '{}')", [`${B}/${randomUUID()}.pdf`, donoA]);
await falha('PDF enviado na pasta de A não registra em B', SALVAR, args(null, B, cam1), 'Sem permissão');

// ---------- Nova versão e atualização ----------
const cam2 = await enviar(donoA, A);
await um(SALVAR, args(cert, A, cam2, { validade: await dia(200), emissao: hoje, codigo: 'AAAA.BBBB.CCCC.DDDD' }));
x = await um('select * from certidoes_situacao where id = $1', [cert]);
ok('Nova versão: versão 2 vira a atual; a 1 continua guardada', x.versao_atual === 2 && x.caminho === cam2 && await conta('select count(*) n from versoes_certidoes where id_certidao = $1', [cert]) === 2);
await um(SALVAR, args(cert, A, null, { validade: await dia(200), obs: 'Conferida no site' }));
ok('Atualizar sem PDF não cria versão', (await um('select versao_atual v, observacoes o from certidoes_empresa where id = $1', [cert])).v === 2
  && await conta("select count(*) n from historico_certidoes where id_certidao = $1 and acao = 'atualizada'", [cert]) === 1);
ok('Versão 1 continua legível no Storage (histórico)', await conta("select count(*) n from storage.objects where bucket_id = 'certidoes' and name = $1", [cam1]) === 1);
ok('Versão registrada não pode ser apagada do Storage (RLS: 0 linhas)', (await c.query("delete from storage.objects where bucket_id = 'certidoes' and name = $1", [cam1])).rowCount === 0);
ok('Versão registrada continua lá após tentativa de remoção', (await admin(), await conta("select count(*) n from storage.objects where bucket_id = 'certidoes' and name = $1", [cam1])) === 1);
const orfao = await enviar(donoA, A);
ok('Envio próprio não registrado pode ser descartado', (await c.query("delete from storage.objects where bucket_id = 'certidoes' and name = $1", [orfao])).rowCount === 1);

// ---------- Contador ----------
await como(contC);
ok('Contador sem permissão não vê certidões, versões nem arquivo', await conta('select count(*) n from certidoes_empresa where id_empresa = $1', [A]) === 0
  && await conta("select count(*) n from storage.objects where bucket_id = 'certidoes' and name = $1", [cam2]) === 0);
await falha('Contador sem permissão não envia', "insert into storage.objects (bucket_id, name, owner_id, metadata) values ('certidoes', $1, $2, '{}')", [`${A}/${randomUUID()}.pdf`, contC]);
await permissoes(['ver_documentos']);
await como(contC);
ok('Com "ver_documentos" o contador vê e baixa', await conta('select count(*) n from certidoes_situacao where id_empresa = $1', [A]) === 1
  && await conta("select count(*) n from storage.objects where bucket_id = 'certidoes' and name = $1", [cam2]) === 1);
await falha('…mas não cadastra (sem "gerenciar_certidoes")', "insert into storage.objects (bucket_id, name, owner_id, metadata) values ('certidoes', $1, $2, '{}')", [`${A}/${randomUUID()}.pdf`, contC]);
await falha('…nem altera', SALVAR, args(cert, A, null), 'não encontrada');
await permissoes(['gerenciar_certidoes']);
const camC = await enviar(contC, A);
const certC = (await um(SALVAR, args(null, A, camC, { tipo: 'fgts', nome: 'Certidão de Regularidade do FGTS', orgao: 'Caixa Econômica Federal', resultado: null, validade: await dia(5) }))).id;
ok('Contador com "gerenciar_certidoes" cadastra', !!certC);
await admin();
ok('Dono é avisado da certidão enviada pelo contador', await conta("select count(*) n from notificacoes where id_usuario = $1 and tipo = 'certidoes' and titulo = 'Nova certidão disponível'", [donoA]) === 1);
ok('Quem agiu não recebe o próprio aviso', await conta("select count(*) n from notificacoes where id_usuario = $1 and tipo = 'certidoes' and titulo = 'Nova certidão disponível'", [contC]) === 0);

// ---------- Alertas de vencimento ----------
await como(donoA);
const n1 = (await um('select verificar_alertas_certidoes($1) n', [A])).n;
const n2 = (await um('select verificar_alertas_certidoes($1) n', [A])).n;
await admin();
ok('Alerta de 7 dias gerado uma única vez (idempotente)', n1 === 1 && n2 === 0 && (await um('select alerta_enviado a from certidoes_empresa where id = $1', [certC])).a === '7');
ok('Alerta chega ao dono e ao contador com a permissão', await conta("select count(*) n from notificacoes where tipo = 'certidoes' and titulo = 'Certidão perto do vencimento' and id_usuario in ($1, $2)", [donoA, contC]) === 2);
await c.query("update certidoes_empresa set data_validade = $2::date - 1, data_emissao = $2::date - 60 where id = $1", [certC, hoje]);
ok('Vencida: novo nível de alerta', (await um('select processar_alertas_certidoes() n')).n >= 1 && (await um('select alerta_enviado a from certidoes_empresa where id = $1', [certC])).a === 'vencida');
ok('Situação calculada "vencida"', (await um('select situacao from certidoes_situacao where id = $1', [certC])).situacao === 'vencida');
await como(donoA);
const camR = await enviar(donoA, A);
await um(SALVAR, args(certC, A, camR, { tipo: 'fgts', nome: 'Certidão de Regularidade do FGTS', orgao: 'Caixa Econômica Federal', resultado: null, validade: await dia(30) }));
await admin();
ok('Renovar (nova validade) zera os alertas', (await um('select alerta_enviado a from certidoes_empresa where id = $1', [certC])).a === null);
await como(donoA);
const res = (await um('select resumo_certidoes($1) r', [A])).r;
ok('Resumo: total, válidas e vencendo', Number(res.total) === 2 && Number(res.validas) === 1 && Number(res.vencendo) === 1);
await como(contC);
await falha('Contador não verifica alertas de empresa sem vínculo', 'select verificar_alertas_certidoes($1)', [B], 'Sem permissão');

// ---------- Isolamento ----------
await como(contD);
ok('Contador de outra empresa não vê nada de A (dados e arquivos)', await conta('select count(*) n from certidoes_empresa where id_empresa = $1', [A]) === 0
  && await conta('select count(*) n from versoes_certidoes where id_empresa = $1', [A]) === 0 && await conta("select count(*) n from storage.objects where bucket_id = 'certidoes' and name = $1", [cam2]) === 0);
await falha('Contador de outra empresa não altera certidão de A', SALVAR, args(cert, A, null), 'não encontrada');
await como(donoB);
ok('Dono de outra empresa não vê nada de A', await conta('select count(*) n from certidoes_situacao where id_empresa = $1', [A]) === 0);
await como(master);
ok('Admin Master não acessa certidões nem arquivos', await conta('select count(*) n from certidoes_empresa') === 0 && await conta("select count(*) n from storage.objects where bucket_id = 'certidoes'") === 0);
await falha('Admin Master não cadastra', SALVAR, args(null, A, cam2), 'Sem permissão');
await admin();

// ---------- Arquivar ----------
await como(donoA);
await falha('Arquivar exige motivo', 'select arquivar_certidao($1, $2)', [cert, ''], 'motivo');
await c.query('select arquivar_certidao($1, $2)', [cert, 'Substituída por nova emissão']);
await falha('Certidão arquivada não é alterada', SALVAR, args(cert, A, null), 'arquivada');
ok('Arquivada some do resumo, mas o histórico fica', Number((await um('select resumo_certidoes($1) r', [A])).r.total) === 1
  && await conta("select count(*) n from historico_certidoes where id_certidao = $1 and acao = 'arquivada'", [cert]) === 1);

await admin();
await c.query('rollback');
await c.end();
for (const y of r) console.log(`${y.ok ? 'OK   ' : 'FALHA'} ${y.n}${y.x ? `  [${y.x}]` : ''}`);
const f = r.filter((y) => !y.ok).length;
console.log(`\n${r.length - f}/${r.length} verificações OK`);
process.exit(f ? 1 : 0);
