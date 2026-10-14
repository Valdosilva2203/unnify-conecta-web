// Testes da E4 (Meu Contador) direto no PostgreSQL LOCAL restaurado do backup: convite/aceite/permissões/encerramento pelas
// funções de vínculo EXISTENTES, indicadores, histórico, painel do contador e isolamento. Recusa rodar fora de localhost.
// Uso: node tests/sql/meu-contador.mjs [postgres://...]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

const url = process.argv[2] ?? 'postgres://postgres@localhost:55432/unnify_local';
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Recusado: estes testes só rodam em banco local.');
const c = new Client({ connectionString: url });
await c.connect();
const resultados = [];
const ok = (nome, cond, extra = '') => resultados.push({ nome, ok: !!cond, extra });
const um = async (sql, p = []) => (await c.query(sql, p)).rows[0];
const como = (id) => c.query("select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false), set_config('role', 'authenticated', false)",
  [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
const comoAdmin = () => c.query("reset role; select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)");
async function falha(nome, sql, p = [], trecho) {
  await c.query('savepoint t');
  try { await c.query(sql, p); await c.query('release savepoint t'); ok(nome, false, 'não falhou'); }
  catch (e) { await c.query('rollback to savepoint t'); ok(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 90)); }
}

await c.query('begin'); // desfeito no final
await comoAdmin();
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global = 'user' and tipo_usuario = 'empresa' limit 2")).rows.map((r) => r.id_usuario);
const [contC, contD] = (await c.query("select id_usuario from perfis where funcao_global = 'user' and tipo_usuario = 'contador' limit 2")).rows.map((r) => r.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global = 'admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por)
                      values ($1, $2, 'e4@local.test', 'Palmas', 'TO', 'comum', 'ATIVA', $3) returning id`, [`77.${n}${n}${n}.000/0001-0${n}`, `E4 ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1, $2, 'dono', true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);

// 1. Convite e aceitação (funções existentes)
await como(donoA);
const vinc = (await um("select solicitar_vinculo_contabil($1, $2, null, 'principal', $3) id", [A, contC, ['ver_documentos', 'gerenciar_obrigacoes']])).id;
ok('Convite cria vínculo pendente', (await um('select status from vinculos_contabeis where id = $1', [vinc])).status === 'pendente');
await como(contC);
ok('Contador não vê a empresa antes de aceitar', (await c.query('select * from painel_contador()')).rows.filter((r) => r.id_empresa === A).length === 0);
await c.query('select responder_vinculo_contabil($1, true, null)', [vinc]);
await como(contD);
await falha('Outro contador não aceita convite alheio', 'select responder_vinculo_contabil($1, true, null)', [vinc]);
await como(donoA);
ok('Empresário vê apenas o seu contador', (await c.query("select id_contador from vinculos_da_empresa($1, 'ativo')", [A])).rows.every((r) => r.id_contador === contC));

// 2. Dados reais para indicadores
await como(contC);
const s1 = (await um('select criar_solicitacao_documento($1, $2, null, $3::date) id', [A, 'Extrato de setembro', hoje])).id;
await um('select criar_solicitacao_documento($1, $2, null, null) id', [A, 'Folha de agosto']);
await um('select salvar_obrigacao(null, $1, $2, null, $3, null, ($4::date - 1), null, null) id', [A, 'DCTFWeb', 'fiscal', hoje]);
const ob2 = (await um('select salvar_obrigacao(null, $1, $2, null, $3, null, ($4::date + 3), null, null) id', [A, 'eSocial', 'trabalhista', hoje])).id;
await c.query("select alterar_situacao_obrigacao($1, 'concluir')", [ob2]);
await um('select salvar_obrigacao(null, $1, $2, null, $3, null, ($4::date + 5), null, null) id', [A, 'FGTS', 'trabalhista', hoje]);
await c.query('select cancelar_solicitacao_documento($1, null)', [s1]);
await como(donoA);
let r = (await um('select resumo_relacionamento_contabil($1) r', [A])).r;
ok('Indicadores do empresário', r.documentos_solicitados === 1 && r.aguardando_resposta === 1 && r.obrigacoes_pendentes === 2 && r.obrigacoes_atrasadas === 1 && r.itens_concluidos === 1,
  JSON.stringify(r));
await como(contC);
let painel = (await c.query('select * from painel_contador()')).rows.find((x) => x.id_empresa === A);
ok('Painel do contador: números da empresa vinculada', Number(painel.solicitacoes_aguardando_empresa) === 1 && Number(painel.obrigacoes_abertas) === 2
  && Number(painel.obrigacoes_atrasadas) === 1 && Number(painel.obrigacoes_7_dias) === 1 && Number(painel.itens_concluidos) === 1, JSON.stringify(painel));
const prox = (await c.query('select * from proximas_obrigacoes_contador(10)')).rows.filter((x) => x.id_empresa === A);
ok('Próximas obrigações: só em aberto, por vencimento, com situação calculada', prox.length === 2 && prox[0].titulo === 'DCTFWeb' && prox[0].situacao === 'atrasada');
await falha('Contador não lê o resumo do empresário', 'select resumo_relacionamento_contabil($1)', [A], 'Sem permissão');

// 3. Permissões: revogar uma permissão zera aquela área no painel e bloqueia as funções
await como(donoA);
await c.query("select alterar_vinculo_contabil($1, 'principal', $2)", [vinc, ['ver_documentos']]);
await como(contC);
painel = (await c.query('select * from painel_contador()')).rows.find((x) => x.id_empresa === A);
ok('Sem gerenciar_obrigacoes: painel não informa obrigações', painel.obrigacoes_abertas === null && painel.obrigacoes_atrasadas === null);
ok('Sem gerenciar_obrigacoes: próximas obrigações somem', (await c.query('select * from proximas_obrigacoes_contador(10)')).rows.filter((x) => x.id_empresa === A).length === 0);
await falha('Sem gerenciar_obrigacoes: não cria obrigação', 'select salvar_obrigacao(null, $1, $2, null, $3, null, $4::date, null, null)', [A, 'Nova', 'fiscal', hoje], 'Sem permissão');
await como(donoB);
await falha('Empresário de outra empresa não altera permissões do vínculo de A', "select alterar_vinculo_contabil($1, 'principal', $2)", [vinc, ['ver_financeiro']]);

// 4. Histórico do relacionamento (sem dados sensíveis)
await como(donoA);
const hist = (await c.query('select * from historico_relacionamento_contabil($1, 50)', [A])).rows;
const tipos = new Set(hist.map((h) => h.tipo));
ok('Histórico reúne vínculo, solicitações e obrigações', tipos.has('vinculo') && tipos.has('solicitacao') && tipos.has('obrigacao'));
ok('Histórico registra alteração de permissões', hist.some((h) => h.descricao.startsWith('Permissões ou função')));
ok('Histórico sem IDs nem e-mails', hist.every((h) => !/[0-9a-f]{8}-[0-9a-f]{4}-|@/.test(`${h.descricao} ${h.autor}`)));
await como(contC);
await falha('Contador não lê o histórico do empresário', 'select * from historico_relacionamento_contabil($1, 10)', [A], 'Sem permissão');

// 5. Encerramento: corta acesso imediatamente
await como(donoA);
await c.query('select encerrar_vinculo_contabil($1, $2)', [vinc, 'Troca de escritório']);
await como(contC);
ok('Vínculo encerrado: empresa some do painel', (await c.query('select * from painel_contador()')).rows.filter((x) => x.id_empresa === A).length === 0);
ok('Vínculo encerrado: solicitações deixam de ser visíveis', Number((await um('select count(*) n from solicitacoes_documentos where id_empresa = $1', [A])).n) === 0);
await falha('Vínculo encerrado: não cria solicitação', 'select criar_solicitacao_documento($1, $2, null, null)', [A, 'Mais um'], 'Sem permissão');
await como(donoA);
ok('Encerramento registrado no histórico', (await c.query('select * from historico_relacionamento_contabil($1, 50)', [A])).rows.some((h) => h.descricao.startsWith('Vínculo encerrado')));

// 6. Isolamento e Admin Master
await como(donoB);
await falha('Dono de B não lê indicadores de A', 'select resumo_relacionamento_contabil($1)', [A], 'Sem permissão');
await como(contD);
ok('Contador sem vínculo com A não vê A', (await c.query('select * from painel_contador()')).rows.every((x) => x.id_empresa !== A));
await como(master);
await falha('Admin Master não lê indicadores privados', 'select resumo_relacionamento_contabil($1)', [A], 'Sem permissão');
await falha('Admin Master não lê histórico privado', 'select * from historico_relacionamento_contabil($1, 10)', [A], 'Sem permissão');
ok('Admin Master sem empresas no painel de contador', (await c.query('select * from painel_contador()')).rows.length === 0);
await comoAdmin();
await falha('Sem login: painel recusado', "select set_config('request.jwt.claim.sub', '', false); set role anon; select * from painel_contador()");
await c.query('reset role');

await comoAdmin();
await c.query('rollback');
await c.end();
for (const x of resultados) console.log(`${x.ok ? 'OK   ' : 'FALHA'} ${x.nome}${x.extra && !x.ok ? `  [${x.extra}]` : ''}`);
const falhas = resultados.filter((x) => !x.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações OK`);
process.exit(falhas ? 1 : 0);
