// Testes da E3 (documentos, solicitações, obrigações) direto no PostgreSQL LOCAL restaurado do backup, como usuários
// autenticados (auth.uid() simulado), incluindo as políticas do Storage. Recusa rodar fora de localhost.
// Uso: node tests/sql/documentos-obrigacoes.mjs [postgres://...]
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

// ---------- Documentos ----------
const doc1 = await enviar(donoA, A);
let d = await um('select origem, compartilhado_contador, tamanho, enviado_por from documentos_empresa where id = $1', [doc1.id]);
ok('Dono envia: origem empresa, não compartilhado, autor e tamanho registrados', d.origem === 'empresa' && !d.compartilhado_contador && d.enviado_por === donoA && d.tamanho === 2048);
await como(donoA);
await falha('Storage: dono não envia na pasta de outra empresa', "insert into storage.objects (bucket_id, name, owner_id, metadata) values ('documentos-empresas', $1, $2, '{}')", [`${B}/${randomUUID()}.pdf`, donoA]);
await falha('Storage: caminho fora do padrão recusado', "insert into storage.objects (bucket_id, name, owner_id, metadata) values ('documentos-empresas', $1, $2, '{}')", [`${A}/../segredo.pdf`, donoA]);
const orfao = `${A}/${randomUUID()}.png`;
await c.query("insert into storage.objects (bucket_id, name, owner_id, metadata) values ('documentos-empresas', $1, $2, $3)", [orfao, donoA, JSON.stringify({ mimetype: 'application/pdf', size: 10 })]);
await falha('Extensão diferente do tipo real é recusada', 'select registrar_documento($1, $2, $3, $4, false, $5)', [A, orfao, 'X', 'outros', 'x.png'], 'Tipo de arquivo');
ok('Arquivo órfão pode ser apagado pelo próprio autor', (await c.query("delete from storage.objects where bucket_id = 'documentos-empresas' and name = $1", [orfao])).rowCount === 1);
await falha('Registrar arquivo de outra empresa na sua é recusado', 'select registrar_documento($1, $2, $3, $4, false, $5)', [B, doc1.caminho, 'X', 'outros', 'x.pdf'], 'Sem permissão');

// Contador: sem permissão nada; ver_documentos só os compartilhados
await como(contC);
ok('Contador sem permissão não vê documentos', await conta('select count(*) n from documentos_empresa where id_empresa = $1', [A]) === 0);
await falha('Contador sem enviar_documentos não envia arquivo', "insert into storage.objects (bucket_id, name, owner_id, metadata) values ('documentos-empresas', $1, $2, '{}')", [`${A}/${randomUUID()}.pdf`, contC]);
await permissoes(['ver_documentos']);
await como(contC);
ok('Com ver_documentos: não vê documento NÃO compartilhado', await conta('select count(*) n from documentos_empresa where id = $1', [doc1.id]) === 0);
await como(donoA);
await c.query('select atualizar_documento($1, $2, $3, true)', [doc1.id, 'Contrato social 2026', 'societarios']);
await como(contC);
ok('Após o dono compartilhar: contador vê o documento e o arquivo', await conta('select count(*) n from documentos_empresa where id = $1', [doc1.id]) === 1
  && await conta("select count(*) n from storage.objects where bucket_id = 'documentos-empresas' and name = $1", [doc1.caminho]) === 1);
await falha('Contador não renomeia/descompartilha (só o dono controla)', 'select atualizar_documento($1, $2, $3, false)', [doc1.id, 'X', 'outros'], 'não encontrado');
await falha('Contador não exclui documento', 'select excluir_documento($1)', [doc1.id], 'não encontrado');
await permissoes(['ver_documentos', 'enviar_documentos']);
const docC = await enviar(contC, A, 'jpg', 'image/jpeg', false, 'Balancete');
d = await um('select origem, compartilhado_contador from documentos_empresa where id = $1', [docC.id]);
ok('Contador com enviar_documentos envia: origem contador, já compartilhado', d.origem === 'contador' && d.compartilhado_contador);

// Isolamento: outra empresa, Admin Master, contador de outra empresa
await como(contD);
ok('Contador de outra empresa não vê documentos de A (nem por id)', await conta('select count(*) n from documentos_empresa where id in ($1, $2)', [doc1.id, docC.id]) === 0
  && await conta("select count(*) n from storage.objects where bucket_id = 'documentos-empresas' and name = $1", [doc1.caminho]) === 0);
await como(master);
ok('Admin Master não vê documentos nem arquivos de empresas', await conta('select count(*) n from documentos_empresa') === 0
  && await conta("select count(*) n from storage.objects where bucket_id = 'documentos-empresas'") === 0);
await como(donoB);
ok('Dono de B não vê documentos de A', await conta('select count(*) n from documentos_empresa where id_empresa = $1', [A]) === 0);

// Revogar o vínculo corta o acesso na hora
await comoAdmin();
await c.query("update vinculos_contabeis set status = 'encerrado', encerrado_em = now() where id = $1", [vC]);
await como(contC);
ok('Vínculo encerrado: contador perde acesso imediatamente', await conta('select count(*) n from documentos_empresa where id_empresa = $1', [A]) === 0);
// Vínculo encerrado não reabre (regra existente): o contador volta só com um novo vínculo
await falha('Vínculo encerrado não pode ser reaberto', "update vinculos_contabeis set status = 'ativo' where id = $1", [vC]);
await comoAdmin();
vC = await vinculo(A, contC, []);

// ---------- Solicitações ----------
await permissoes(['enviar_documentos']);
await como(contC);
await falha('Sem ver_documentos o contador não solicita', 'select criar_solicitacao_documento($1, $2, null, null)', [A, 'Extrato'], 'Sem permissão');
await permissoes(['ver_documentos']);
await como(contC);
const sol = (await um('select criar_solicitacao_documento($1, $2, $3, $4::date) id', [A, 'Extrato bancário de setembro/2026', 'Conta principal', hoje])).id;
await falha('Contador não responde a própria solicitação', 'select responder_solicitacao_documento($1, $2)', [sol, docC.id], 'não encontrada');
await como(donoB);
await falha('Dono de outra empresa não vê nem responde', 'select responder_solicitacao_documento($1, $2)', [sol, doc1.id], 'não encontrada');
const docB = await enviar(donoB, B);
await como(donoA);
await falha('Resposta com documento de outra empresa é recusada', 'select responder_solicitacao_documento($1, $2)', [sol, docB.id]);
const extrato = await enviar(donoA, A, 'pdf', 'application/pdf', false, 'Extrato setembro');
await c.query('select responder_solicitacao_documento($1, $2)', [sol, extrato.id]);
ok('Empresário envia: status enviado e documento compartilhado', (await um('select status from solicitacoes_documentos where id = $1', [sol])).status === 'enviado'
  && (await um('select compartilhado_contador c from documentos_empresa where id = $1', [extrato.id])).c);
await falha('Empresário não aceita a própria entrega', 'select analisar_solicitacao_documento($1, true, null)', [sol], 'não encontrada');
await como(contC);
await falha('Pedir correção exige motivo', 'select analisar_solicitacao_documento($1, false, $2)', [sol, ''], 'corrigido');
await c.query('select analisar_solicitacao_documento($1, false, $2)', [sol, 'Faltou a última página']);
await como(donoA);
const extrato2 = await enviar(donoA, A, 'pdf', 'application/pdf', false, 'Extrato setembro completo');
await c.query('select responder_solicitacao_documento($1, $2)', [sol, extrato2.id]);
await como(contC);
await c.query('select analisar_solicitacao_documento($1, true, null)', [sol]);
ok('Fluxo pendente → enviado → correção → enviado → aceito', (await um('select status from solicitacoes_documentos where id = $1', [sol])).status === 'aceito');
ok('Histórico da solicitação com responsáveis', await conta('select count(*) n from historico_solicitacoes_documentos where id_solicitacao = $1 and id_usuario is not null', [sol]) === 5);
await falha('Solicitação aceita não é cancelada', 'select cancelar_solicitacao_documento($1, null)', [sol], 'encerrada');
await como(donoA);
await falha('Documento que responde solicitação aceita não pode ser excluído', 'select excluir_documento($1)', [extrato2.id], 'solicitação');
await falha('Documento entregue não pode deixar de ser compartilhado', 'select atualizar_documento($1, $2, null, false)', [extrato2.id, 'X'], 'permanece compartilhado');
await falha('Sem UPDATE direto: solicitação não muda de empresa', 'update solicitacoes_documentos set id_empresa = $2 where id = $1', [sol, B]);

// Exclusão com auditoria; arquivo do excluído pode ser removido pelo dono, por mais ninguém
const lixo = await enviar(donoA, A, 'png', 'image/png', false, 'Rascunho');
await como(contC);
// RLS em DELETE não gera erro: simplesmente não alcança a linha (0 removidas)
ok('Contador não apaga arquivo do Storage', (await c.query("delete from storage.objects where bucket_id = 'documentos-empresas' and name = $1", [doc1.caminho])).rowCount === 0);
await como(donoA);
ok('Dono não apaga arquivo de documento ATIVO (só após excluir)', (await c.query("delete from storage.objects where bucket_id = 'documentos-empresas' and name = $1", [doc1.caminho])).rowCount === 0);
await como(donoA);
const caminho = (await um('select excluir_documento($1) c', [lixo.id])).c;
ok('Exclusão lógica registrada no histórico', caminho === lixo.caminho && await conta("select count(*) n from historico_documentos where id_documento = $1 and acao = 'excluido'", [lixo.id]) === 1
  && await conta('select count(*) n from documentos_empresa where id = $1', [lixo.id]) === 0);
ok('Dono remove o arquivo do documento excluído', (await c.query("delete from storage.objects where bucket_id = 'documentos-empresas' and name = $1", [caminho])).rowCount === 1);

// ---------- Obrigações ----------
await como(contC);
await falha('Contador sem gerenciar_obrigacoes não cria obrigação', 'select salvar_obrigacao(null, $1, $2, null, $3, null, $4::date, null, null)', [A, 'DCTFWeb', 'fiscal', hoje], 'Sem permissão');
await como(donoA);
await falha('Responsável precisa ser da empresa ou contador autorizado', 'select salvar_obrigacao(null, $1, $2, null, $3, $4, $5::date, null, null)', [A, 'DCTFWeb', 'fiscal', contC, hoje], 'Responsável');
await permissoes(['ver_documentos', 'gerenciar_obrigacoes']);
await como(donoA);
const ontem = (await um('select (public.hoje_brasil() - 1)::text d')).d;
const ob = (await um('select salvar_obrigacao(null, $1, $2, $3, $4, $5, $6::date, $7, $8) id', [A, 'Entrega da DCTFWeb', 'Competência setembro', 'fiscal', contC, ontem, null, extrato2.id])).id;
ok('Obrigação vencida aparece como atrasada (calculada)', (await um('select situacao from obrigacoes_empresa_situacao where id = $1', [ob])).situacao === 'atrasada');
await como(contC);
ok('Contador com gerenciar_obrigacoes vê e edita', await conta('select count(*) n from obrigacoes_empresa where id = $1', [ob]) === 1);
await c.query('select alterar_situacao_obrigacao($1, $2)', [ob, 'iniciar']);
await falha('Cancelar exige motivo', 'select alterar_situacao_obrigacao($1, $2, null)', [ob, 'cancelar'], 'motivo');
await c.query('select alterar_situacao_obrigacao($1, $2)', [ob, 'concluir']);
await falha('Obrigação concluída não é editada', 'select salvar_obrigacao($1, $2, $3, null, $4, null, $5::date, null, null)', [ob, A, 'X título', 'fiscal', hoje], 'encerrada');
await c.query('select alterar_situacao_obrigacao($1, $2)', [ob, 'reabrir']);
ok('Histórico da obrigação: criada, iniciar, concluir, reabrir', await conta('select count(*) n from historico_obrigacoes where id_obrigacao = $1', [ob]) === 4);
await falha('Contador não cria tarefa da empresa (tarefas são da equipe)', 'select criar_tarefa_da_obrigacao($1)', [ob], 'não encontrada');
await como(contD);
ok('Contador de outra empresa não vê a obrigação', await conta('select count(*) n from obrigacoes_empresa where id = $1', [ob]) === 0);
await falha('Contador de outra empresa não altera', 'select alterar_situacao_obrigacao($1, $2)', [ob, 'iniciar'], 'não encontrada');
await como(master);
ok('Admin Master não vê obrigações', await conta('select count(*) n from obrigacoes_empresa') === 0);
await como(donoA);
const tarefa = (await um('select criar_tarefa_da_obrigacao($1) id', [ob])).id;
ok('Obrigação gera UMA tarefa no módulo existente', (await um('select id_tarefa from obrigacoes_empresa where id = $1', [ob])).id_tarefa === tarefa
  && (await um('select contexto, id_empresa, prazo::text p from tarefas where id = $1', [tarefa])).id_empresa === A);
await falha('Segunda tarefa para a mesma obrigação é recusada', 'select criar_tarefa_da_obrigacao($1)', [ob], 'já tem');
const r = (await um('select resumo_documentos_obrigacoes($1) r', [A])).r;
ok('Resumo: atrasadas e abertas', Number(r.obrigacoes_atrasadas) === 1 && Number(r.obrigacoes_abertas) === 1);

await comoAdmin();
await c.query('rollback');
await c.end();
for (const x of resultados) console.log(`${x.ok ? 'OK   ' : 'FALHA'} ${x.nome}${x.extra ? `  [${x.extra}]` : ''}`);
const falhas = resultados.filter((x) => !x.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações OK`);
process.exit(falhas ? 1 : 0);
