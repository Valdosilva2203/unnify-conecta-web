// Testes da E4.1 (convites e vinculação recíproca) direto no PostgreSQL LOCAL restaurado do backup.
// Usuários novos são criados como no cadastro real (auth.users → perfil pelo gatilho → criar_empresa define o tipo).
// Quase tudo roda numa transação desfeita no final; o teste de concorrência usa dados confirmados e os apaga em seguida.
// Recusa rodar fora de localhost. Uso: node tests/sql/convites-vinculos.mjs [postgres://...]
import { createRequire } from 'node:module';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

const url = process.argv[2] ?? 'postgres://postgres@localhost:55432/unnify_local';
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Recusado: estes testes só rodam em banco local.');
const c = new Client({ connectionString: url });
await c.connect();
const resultados = [];
const ok = (nome, cond, extra = '') => resultados.push({ nome, ok: !!cond, extra });
const um = async (sql, p = [], cli = c) => (await cli.query(sql, p)).rows[0];
const como = (id, cli = c) => cli.query("select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false), set_config('role', 'authenticated', false)",
  [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
const comoAnon = () => c.query("select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false), set_config('role', 'anon', false)");
const comoAdmin = (cli = c) => cli.query("reset role; select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)");
async function falha(nome, sql, p = [], trecho) {
  await c.query('savepoint t');
  try { await c.query(sql, p); await c.query('release savepoint t'); ok(nome, false, 'não falhou'); }
  catch (e) { await c.query('rollback to savepoint t'); ok(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 100)); }
}
// CNPJ válido aleatório
function cnpj() {
  const b = Array.from({ length: 12 }, (_, i) => (i < 8 ? Math.floor(Math.random() * 10) : [0, 0, 0, 1][i - 8]));
  const dv = (arr, pesos) => { const r = arr.reduce((s, n, i) => s + n * pesos[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  b.push(dv(b, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  b.push(dv(b, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  const s = b.join('');
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}
const token = () => randomBytes(32).toString('base64url');
const hash = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const sufixo = randomUUID().slice(0, 8);

async function usuario(nome, confirmado = true, cli = c) {
  await comoAdmin(cli);
  const id = randomUUID();
  const email = `${nome}.${sufixo}@e41.local.test`;
  await cli.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, aud, role, created_at, updated_at)
                   values ($1, $2, ${confirmado ? 'now()' : 'null'}, $3, 'authenticated', 'authenticated', now(), now())`, [id, email, JSON.stringify({ nome_completo: `Pessoa ${nome}` })]);
  await cli.query(`insert into perfis (id_usuario, email, nome_completo) values ($1, $2, $3) on conflict (id_usuario) do nothing`, [id, email, `Pessoa ${nome}`]);
  return { id, email };
}
async function cadastrarEmpresa(u, tipo, cli = c) {
  await como(u.id, cli);
  const doc = cnpj();
  const r = await um("select * from criar_empresa($1, $2, '11999999999', $3, 'Palmas', 'TO', $4, null)", [doc, `E41 ${tipo} ${u.email.split('@')[0]}`, u.email, tipo], cli);
  if (!r.sucesso) throw new Error(r.mensagem);
  return { id: r.id, cnpj: doc };
}
const vinculosDe = async (emp, cont) => (await c.query('select * from vinculos_contabeis where id_empresa = $1 and id_contador = $2', [emp, cont])).rows;

await c.query('begin'); // desfeito no final
const contC = await usuario('contador-c');
const escC = await cadastrarEmpresa(contC, 'escritorio_contabil');
const contD = await usuario('contador-d');
await cadastrarEmpresa(contD, 'escritorio_contabil');
const donoA = await usuario('dono-a');
const A = await cadastrarEmpresa(donoA, 'comum');
const donoB = await usuario('dono-b');
const B = await cadastrarEmpresa(donoB, 'comum');
await comoAdmin();
const master = (await um("select id_usuario from perfis where funcao_global = 'admin_master' limit 1")).id_usuario;

// ===== Cenário A: contador consulta por CNPJ e solicita =====
await como(contC.id);
const consulta = (await c.query('select * from consultar_empresa_por_cnpj($1)', [A.cnpj])).rows[0];
ok('21. Consulta: encontra a empresa e devolve só nome, cidade, UF e situação', consulta.encontrada && consulta.nome.startsWith('E41 comum') && consulta.cidade === 'Palmas'
  && Object.keys(consulta).sort().join(',') === 'cidade,encontrada,estado,nome,situacao_vinculo', JSON.stringify(consulta));
ok('21. CNPJ inexistente: apenas "não encontrada"', (await um('select * from consultar_empresa_por_cnpj($1)', [cnpj()])).encontrada === false);
await falha('21. CNPJ com dígito verificador errado é recusado no banco', 'select * from consultar_empresa_por_cnpj($1)', ['11.222.333/0001-80'], 'CNPJ inválido');
await como(donoA.id);
await falha('21. Empresário não consulta CNPJs', 'select * from consultar_empresa_por_cnpj($1)', [B.cnpj], 'Apenas contadores');
await como(master);
await falha('21. Admin Master não consulta CNPJs', 'select * from consultar_empresa_por_cnpj($1)', [A.cnpj], 'Apenas contadores');
await comoAnon();
await falha('21. Anônimo não consulta CNPJs', 'select * from consultar_empresa_por_cnpj($1)', [A.cnpj], 'permission denied');

await como(contC.id);
const vA = await um('select solicitar_vinculo_por_cnpj($1) id', [A.cnpj]);
ok('1. Solicitação criada como PENDENTE', (await um('select status from vinculos_contabeis where id = $1', [vA.id])).status === 'pendente');
ok('1. Sem acesso antes da aprovação', !(await um("select contador_pode($1, 'ver_documentos') p", [A.id])).p);
await comoAdmin();
ok('1. Empresário notificado no sistema e por e-mail (fila)', (await um("select count(*)::int n from notificacoes where id_usuario = $1 and tipo = 'vinculo_solicitado'", [donoA.id])).n === 1
  && (await um('select count(*)::int n from fila_emails where id_usuario = $1', [donoA.id])).n === 1);
const filaA = await um('select assunto, texto, link from fila_emails where id_usuario = $1', [donoA.id]);
ok('E-mail de aviso sem dados financeiros e com link interno', filaA.link === '/app/meu-contador' && !/R\$|saldo|receita/i.test(filaA.texto));
await como(donoB.id);
await falha('19. Outra empresa não aceita a solicitação de A', "select aceitar_vinculo_contabil($1, 'principal', array['ver_documentos'])", [vA.id], 'permissão');
await como(donoA.id);
await c.query("select aceitar_vinculo_contabil($1, 'principal', array['ver_documentos'])", [vA.id]);
const vAat = await um('select status, permissoes, aprovado_por from vinculos_contabeis where id = $1', [vA.id]);
ok('2. Empresário aceita definindo permissões: vínculo ativo só com o autorizado', vAat.status === 'ativo' && vAat.permissoes.join() === 'ver_documentos' && vAat.aprovado_por === donoA.id);
await como(contC.id);
ok('2. Contador acessa o permitido e nada além', (await um("select contador_pode($1, 'ver_documentos') a, contador_pode($1, 'ver_financeiro') b", [A.id])).a === true
  && (await um("select contador_pode($1, 'ver_financeiro') b", [A.id])).b === false);
ok('2. Contador notificado do aceite', (await um("select count(*)::int n from notificacoes where tipo = 'vinculo_aceito'")).n === 1);
ok('19. Contador só vê as próprias notificações', (await um('select count(*)::int n from notificacoes where id_usuario <> $1', [contC.id])).n === 0);
await falha('Usuário não lê a fila de e-mails', 'select * from fila_emails');
await falha('Usuário não processa a fila de e-mails', 'select * from reservar_emails_pendentes(10)', [], 'permission denied');

// Recusa
await como(contD.id);
const vB = await um('select solicitar_vinculo_por_cnpj($1) id', [B.cnpj]);
await como(donoB.id);
await c.query('select responder_vinculo_contabil($1, false, null)', [vB.id]);
await como(contD.id);
ok('3. Recusa: nenhum vínculo ativo e nenhum acesso', (await vinculosDe(B.id, contD.id)).every((v) => v.status === 'recusado')
  && !(await um("select contador_pode($1, 'ver_documentos') p", [B.id])).p);
ok('3. Contador notificado da recusa', (await um("select count(*)::int n from notificacoes where tipo = 'vinculo_recusado'")).n === 1);

// ===== Cenário B: contador convida empresa não cadastrada =====
const cnpjNovo = cnpj();
const empEmail = `empresario-novo.${sufixo}@e41.local.test`;
const tB = token();
await como(contC.id);
await falha('Contador não convida CNPJ já cadastrado (deve solicitar vínculo)', "select criar_convite_vinculo('contador_para_empresa', $1, $2, null, null, $3)", [hash(token()), empEmail, A.cnpj], 'já está no Unnify');
const convB = (await um("select criar_convite_vinculo('contador_para_empresa', $1, $2, 'Maria', 'Olá!', $3) id", [hash(tB), empEmail, cnpjNovo])).id;
await falha('Convite duplicado pendente é recusado', "select criar_convite_vinculo('contador_para_empresa', $1, $2, null, null, $3)", [hash(token()), empEmail, cnpjNovo], 'Reenviar');
await comoAdmin();
ok('Token NÃO é guardado, só o hash', (await um('select hash_token from convites_vinculos where id = $1', [convB])).hash_token === hash(tB)
  && (await um("select count(*)::int n from convites_vinculos where hash_token = $1", [tB])).n === 0);
await comoAnon();
const dB = await um('select * from dados_convite($1)', [tB]);
ok('Página do convite (sem login) mostra remetente, escritório e e-mail mascarado', dB.remetente === 'Pessoa contador-c' && dB.escritorio?.startsWith('E41 escritorio')
  && dB.email_mascarado.startsWith('e•••@') && dB.situacao === 'pendente');
ok('Token errado não revela nada', (await c.query('select * from dados_convite($1)', [token()])).rows.length === 0);
await falha('Anônimo não aceita convite', 'select aceitar_convite_vinculo($1, true, null, null)', [tB], 'permission denied');

const empNovo = await usuario('empresario-novo', false);
await c.query('update auth.users set email = $2 where id = $1', [empNovo.id, empEmail]); // cadastrou com o e-mail convidado
await c.query('update perfis set email = $2 where id_usuario = $1', [empNovo.id, empEmail]);
const C = { id: (await (async () => { await como(empNovo.id); const r = await um("select * from criar_empresa($1, 'Empresa Nova Ltda', '11999999999', $2, 'Palmas', 'TO', 'comum', null)", [cnpjNovo, empEmail]); return r.id; })()) };
ok('6. Concluir o cadastro SEM aceitar não cria vínculo', (await vinculosDe(C.id, contC.id)).length === 0);
await falha('5. E-mail não confirmado não aceita', 'select aceitar_convite_vinculo($1, true, $2, null)', [tB, C.id], 'Confirme seu e-mail');
await comoAdmin();
await c.query('update auth.users set email_confirmed_at = now() where id = $1', [empNovo.id]);
await como(empNovo.id);
const outraEmp = await cadastrarEmpresaSemTipo(empNovo);
async function cadastrarEmpresaSemTipo(u) { // segunda empresa do mesmo dono, CNPJ diferente do convite
  const r = await um("select * from criar_empresa($1, 'Outra Ltda', '11999999999', $2, 'Palmas', 'TO', 'comum', null)", [cnpj(), u.email]);
  return r.id;
}
await falha('Empresa com CNPJ diferente do convite não é vinculada', 'select aceitar_convite_vinculo($1, true, $2, null)', [tB, outraEmp], 'não corresponde');
await falha('Trocar o ID para empresa alheia não vincula', 'select aceitar_convite_vinculo($1, true, $2, null)', [tB, A.id], 'Cadastre a sua empresa');
const vC = (await um("select aceitar_convite_vinculo($1, true, $2, array['ver_documentos','ver_financeiro']) id", [tB, C.id])).id;
const vCrow = await um('select status, permissoes, origem, solicitado_por, aprovado_por from vinculos_contabeis where id = $1', [vC]);
ok('5/6. Aceite no onboarding cria o vínculo ATIVO sem segunda aprovação, com as permissões escolhidas pelo empresário',
  vCrow.status === 'ativo' && vCrow.permissoes.join() === 'ver_documentos,ver_financeiro' && vCrow.origem === 'contador' && vCrow.solicitado_por === contC.id && vCrow.aprovado_por === empNovo.id);
ok('14. Repetir o mesmo aceite é idempotente (mesmo vínculo, sem duplicar)', (await um('select aceitar_convite_vinculo($1, true, $2, null) id', [tB, C.id])).id === vC
  && (await vinculosDe(C.id, contC.id)).length === 1);
await comoAdmin();
ok('Contador notificado: vínculo ativado', (await um("select count(*)::int n from notificacoes where id_usuario = $1 and tipo = 'vinculo_ativado'", [contC.id])).n === 1);
const outro = await usuario('intruso');
await como(outro.id);
await falha('15. Outro e-mail não usa convite alheio (mesmo com o token)', 'select aceitar_convite_vinculo($1, true, null, null)', [tB], 'outro e-mail');

// ===== Correção E4.1: convite do empresário (validações), painel sem empresas e isolamento =====
await como(donoA.id);
await falha('Convite com e-mail inválido é recusado e nada é registrado', "select criar_convite_vinculo('empresa_para_contador', $1, 'sem-arroba', null, null, null, $2, 'fiscal', array['ver_documentos'])", [hash(token()), A.id], 'e-mail válido');
const antes = (await um("select count(*)::int n from (select 1 from convites_enviados($1)) x", [A.id])).n;
const tV = token();
const convV = (await um("select criar_convite_vinculo('empresa_para_contador', $1, $2, 'Contador Válido', 'Oi', null, $3, 'fiscal', array['ver_documentos','ver_financeiro']) id", [hash(tV), `valido.${sufixo}@e41.local.test`, A.id])).id;
const lv = (await c.query('select * from convites_enviados($1)', [A.id])).rows.find((x) => x.id === convV);
ok('Convite válido é registrado: pendente, permissões preservadas, sem vínculo ativo antes do aceite',
  lv && lv.situacao === 'pendente' && lv.envio_status === 'pendente' && lv.permissoes.join() === 'ver_documentos,ver_financeiro'
  && (await um('select count(*)::int n from convites_enviados($1)', [A.id])).n === antes + 1
  && (await c.query("select 1 from vinculos_contabeis where id_empresa = $1 and status = 'ativo' and criado_em > now() - interval '1 minute' and origem = 'empresa' and id_contador is null", [A.id])).rows.length === 0);
await falha('Convite duplicado para o mesmo e-mail é recusado', "select criar_convite_vinculo('empresa_para_contador', $1, $2, null, null, null, $3, 'fiscal', array['ver_documentos'])", [hash(token()), `valido.${sufixo}@e41.local.test`, A.id], 'Reenviar');
await c.query('select registrar_envio_convite($1, true)', [convV]);
ok('Status do envio é atualizado só pelo resultado real', (await c.query('select * from convites_enviados($1)', [A.id])).rows.find((x) => x.id === convV).envio_status === 'enviado');
const semEmpresas = await usuario('contador-sem-empresas');
await cadastrarEmpresa(semEmpresas, 'escritorio_contabil');
await como(semEmpresas.id);
ok('Conta sem empresas vinculadas: painel vazio (não é erro) e sem convites', (await c.query('select * from painel_contador()')).rows.length === 0
  && (await c.query('select * from convites_enviados()')).rows.length === 0 && (await c.query('select * from empresas_do_contador()')).rows.length === 0);
await como(contC.id);
ok('Isolamento: painel do contador só traz empresas com vínculo ATIVO dele', (await c.query('select id_empresa from painel_contador()')).rows.every((r) => [A.id, C.id].includes(r.id_empresa)) && !(await c.query('select id_empresa from painel_contador()')).rows.some((r) => r.id_empresa === B.id));
await como(donoB.id);
ok('Isolamento: empresário B não vê convites da empresa A', (await c.query('select * from convites_enviados()')).rows.length === 0);

// ===== Cenário D: empresário convida contador não cadastrado =====
const contEmail = `contador-novo.${sufixo}@e41.local.test`;
const tD = token();
await como(donoA.id);
await falha('Empresário precisa autorizar ao menos uma permissão', "select criar_convite_vinculo('empresa_para_contador', $1, $2, null, null, null, $3, 'fiscal', array[]::text[])", [hash(tD), contEmail, A.id], 'permissão');
await como(donoB.id);
await falha('19. Empresário não convida em nome de outra empresa', "select criar_convite_vinculo('empresa_para_contador', $1, $2, null, null, null, $3, 'fiscal', array['ver_documentos'])", [hash(tD), contEmail, A.id], 'permissão');
await como(donoA.id);
const convD = (await um("select criar_convite_vinculo('empresa_para_contador', $1, $2, 'Escritório Novo', null, null, $3, 'fiscal', array['ver_documentos']) id", [hash(tD), contEmail, A.id])).id;
const contE = await usuario('contador-novo');
await comoAdmin();
await c.query('update auth.users set email = $2 where id = $1', [contE.id, contEmail]);
await como(contE.id);
await falha('8. Sem concluir o cadastro profissional não aceita', 'select aceitar_convite_vinculo($1, true, null, null)', [tD], 'Conclua o seu cadastro');
await cadastrarEmpresa({ ...contE, email: contEmail }, 'escritorio_contabil');
await como(contE.id);
const vD = (await um("select aceitar_convite_vinculo($1, true, null, array['gerenciar_financeiro','ver_financeiro']) id", [tD])).id;
const vDrow = await um('select status, permissoes, funcao, origem from vinculos_contabeis where id = $1', [vD]);
ok('8/9. Contador aceita e o vínculo é ativado automaticamente com as permissões do empresário (sem ampliar)',
  vDrow.status === 'ativo' && vDrow.permissoes.join() === 'ver_documentos' && vDrow.funcao === 'fiscal' && vDrow.origem === 'empresa');
await como(donoA.id);
ok('17. Empresa A com dois contadores autorizados ao mesmo tempo', (await um("select count(*)::int n from vinculos_contabeis where id_empresa = $1 and status = 'ativo'", [A.id])).n === 2);
await comoAdmin();
ok('Empresário notificado: vínculo ativado', (await um("select count(*)::int n from notificacoes where id_usuario = $1 and tipo = 'vinculo_ativado'", [donoA.id])).n === 1);

// 18. Revogação
await como(donoA.id);
await c.query('select encerrar_vinculo_contabil($1, null)', [vD]);
await como(contE.id);
ok('18. Revogação bloqueia o acesso imediatamente', !(await um("select contador_pode($1, 'ver_documentos') p", [A.id])).p);
ok('18. Contador notificado do encerramento', (await um("select count(*)::int n from notificacoes where tipo = 'vinculo_encerrado'")).n === 1);

// ===== Cenário C: empresário solicita contador cadastrado (função usada pelo catálogo) =====
await como(donoB.id);
const vCat = (await um("select solicitar_vinculo_contabil($1, $2, null, 'principal', array['ver_documentos','gerenciar_obrigacoes']) id", [B.id, contC.id])).id;
await como(contC.id);
ok('10. Contador notificado da solicitação do empresário', (await um("select count(*)::int n from notificacoes where tipo = 'vinculo_solicitado'")).n === 1);
await c.query('select responder_vinculo_contabil($1, true, null)', [vCat]);
ok('11. Contador aceita e o vínculo fica ativo com as permissões do empresário', (await um('select status, permissoes from vinculos_contabeis where id = $1', [vCat])).permissoes.join() === 'ver_documentos,gerenciar_obrigacoes');

// ===== 12/13/14/20. Expirado, cancelado, token antigo, falha de e-mail =====
await como(contC.id);
const t12 = token();
const cnpj12 = cnpj();
const conv12 = (await um("select criar_convite_vinculo('contador_para_empresa', $1, $2, null, null, $3) id", [hash(t12), `exp.${sufixo}@e41.local.test`, cnpj12])).id;
await c.query('select registrar_envio_convite($1, false)', [conv12]);
const lista = (await c.query('select * from convites_enviados()')).rows;
ok('20. Falha no envio fica registrada e NÃO aparece como entregue', lista.find((x) => x.id === conv12)?.envio_status === 'falhou');
await comoAdmin();
await c.query("update convites_vinculos set expira_em = now() - interval '1 minute' where id = $1", [conv12]);
const exp = await usuario('exp');
await c.query('update auth.users set email = $2 where id = $1', [exp.id, `exp.${sufixo}@e41.local.test`]);
await como(exp.id);
const emp12 = (await um("select * from criar_empresa($1, 'Expirada Ltda', '11999999999', 'x@y.z', 'Palmas', 'TO', 'comum', null)", [cnpj12])).id;
await falha('12. Convite expirado não cria vínculo', 'select aceitar_convite_vinculo($1, true, $2, null)', [t12, emp12], 'expirou');
await como(contC.id);
ok('12. Situação calculada "expirado" na lista do remetente', (await c.query('select * from convites_enviados()')).rows.find((x) => x.id === conv12)?.situacao === 'expirado');
const t12b = token();
await falha('Reenvio imediato é limitado (1 por minuto)', 'select reenviar_convite($1, $2)', [conv12, hash(t12b)], 'Aguarde');
await comoAdmin();
await c.query("update convites_vinculos set ultimo_envio_em = now() - interval '2 minutes' where id = $1", [conv12]);
await como(contC.id);
await c.query('select reenviar_convite($1, $2)', [conv12, hash(t12b)]);
await como(exp.id);
await falha('14. Token antigo deixa de valer após reenvio', 'select aceitar_convite_vinculo($1, true, $2, null)', [t12, emp12], 'Convite inválido');
await como(contC.id);
await c.query('select cancelar_convite($1)', [conv12]);
await como(exp.id);
await falha('13. Convite cancelado não cria vínculo', 'select aceitar_convite_vinculo($1, true, $2, null)', [t12b, emp12], 'cancelado');
ok('12/13. Nenhum vínculo criado', (await vinculosDe(emp12, contC.id)).length === 0);

// Recusa do convite
await como(donoB.id);
const tR = token();
await c.query("select criar_convite_vinculo('empresa_para_contador', $1, $2, null, null, null, $3, 'consultoria', array['ver_documentos'])", [hash(tR), contEmail, B.id]);
await como(contE.id);
ok('Contador recusa o convite e conclui sem vínculo', (await um('select aceitar_convite_vinculo($1, false, null, null) id', [tR])).id === null
  && (await vinculosDe(B.id, contE.id)).length === 0);

// 19. Isolamento de convites
await como(donoB.id);
await falha('19. Empresa B não lista convites da empresa A', 'select * from convites_enviados($1)', [A.id], 'permissão');
await falha('19. Ninguém lê a tabela de convites diretamente', 'select * from convites_vinculos');
await como(master);
await falha('Admin Master não lista convites de empresas', 'select * from convites_enviados($1)', [A.id], 'permissão');

// 21. Limite de consultas
await comoAdmin();
await c.query("insert into consultas_cnpj (id_usuario, cnpj, encontrada) select $1, '00000000000000', false from generate_series(1, 30)", [contD.id]);
await como(contD.id);
await falha('21. Limite de consultas por hora', 'select * from consultar_empresa_por_cnpj($1)', [A.cnpj], 'Limite de consultas');

await c.query('rollback');

// ===== 16. Aceites simultâneos (dados confirmados, apagados no fim) =====
const c2 = new Client({ connectionString: url });
await c2.connect();
const criados = { usuarios: [], empresas: [] };
try {
  const g = await usuario('conc-dono');
  const f = await usuario('conc-contador');
  criados.usuarios.push(g.id, f.id);
  const empG = await cadastrarEmpresa(g, 'comum');
  const escF = await cadastrarEmpresa(f, 'escritorio_contabil');
  criados.empresas.push(empG.id, escF.id);
  const tc = token();
  await como(g.id);
  await c.query("select criar_convite_vinculo('empresa_para_contador', $1, $2, null, null, null, $3, 'principal', array['ver_documentos'])", [hash(tc), f.email, empG.id]);
  await como(f.id);
  await como(f.id, c2);
  await c.query('begin');
  const r1 = await um('select aceitar_convite_vinculo($1, true, null, null) id', [tc]);
  const segunda = c2.query('select aceitar_convite_vinculo($1, true, null, null) id', [tc]); // fica bloqueada pelo FOR UPDATE
  await new Promise((r) => setTimeout(r, 300));
  await c.query('commit');
  const r2 = (await segunda).rows[0];
  await comoAdmin();
  ok('16. Dois aceites simultâneos: um único vínculo, mesmo resultado', r1.id === r2.id && (await vinculosDe(empG.id, f.id)).length === 1);
} finally {
  await comoAdmin();
  await c.query('begin');
  await c.query("set local session_replication_role = 'replica'");
  for (const t of ['notificacoes', 'fila_emails']) await c.query(`delete from ${t} where id_usuario = any($1)`, [criados.usuarios]);
  await c.query('delete from convites_vinculos where enviado_por = any($1)', [criados.usuarios]);
  await c.query('delete from historico_vinculos_contabeis where id_vinculo in (select id from vinculos_contabeis where id_empresa = any($1))', [criados.empresas]);
  await c.query('delete from vinculos_contabeis where id_empresa = any($1)', [criados.empresas]);
  await c.query('delete from auditoria where id_usuario = any($1)', [criados.usuarios]);
  await c.query('delete from usuarios_empresas where id_usuario = any($1)', [criados.usuarios]);
  await c.query('delete from empresas where id = any($1)', [criados.empresas]);
  await c.query('delete from perfis where id_usuario = any($1)', [criados.usuarios]);
  await c.query('delete from auth.users where id = any($1)', [criados.usuarios]);
  await c.query('commit');
  await c2.end();
}
ok('Limpeza do teste de concorrência', (await um('select count(*)::int n from auth.users where email like $1', [`%.${sufixo}@e41.local.test`])).n === 0);

await c.end();
let falhas = 0;
for (const r of resultados) {
  if (!r.ok) falhas++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.nome}${r.ok ? '' : ` — ${r.extra}`}`);
}
console.log(`\n${resultados.length - falhas}/${resultados.length} aprovados`);
process.exit(falhas ? 1 : 0);
