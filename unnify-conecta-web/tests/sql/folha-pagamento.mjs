// Folha de Pagamento (migration 052) no PostgreSQL LOCAL; tudo desfeito no final (ROLLBACK). Nada toca o banco compartilhado.
// Cenário do enunciado (João, Maria, Carlos, Ana, Pedro) + fluxo completo, versões, devolução, aprovação, Financeiro e acesso.
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
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
const [contC] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 1")).rows.map((x) => x.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'fp@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`44.${n}${n}${n}.000/0001-0${n}`, `Folha PG ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
const vC = (await um("insert into vinculos_contabeis (id_empresa, id_contador, funcao, status, permissoes, origem, aprovado_em) values ($1, $2, 'principal', 'ativo', '{ver_folha}', 'empresa', now()) returning id", [A, contC])).id;
const permissoes = async (p, status = 'ativo') => { await admin(); await c.query("update vinculos_contabeis set permissoes = $2, status = $3, encerrado_em = case when $3 = 'encerrado' then now() end where id = $1", [vC, p, status]); };

await como(donoA);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const conta = (await um("select salvar_conta_financeira(null,$1,'Banco Folha',null,'conta_corrente',50000,($2::date - 60),false,null) id", [A, hoje])).id;
const novoF = async (nome, cargo, sal) => (await um("select salvar_funcionario(null,$1,$2,$3,($4::date - 200),'clt',$5,5,true,null,null) id", [A, nome, cargo, hoje, sal])).id;
const joao = await novoF('João Silva', 'Técnico de Redes', 2200);
const maria = await novoF('Maria Oliveira', 'Atendente', 1800);
const carlos = await novoF('Carlos Santos', 'Instalador', 2000);
const ana = await novoF('Ana Costa', 'Vendedora', 1900);
const pedro = await novoF('Pedro Almeida', 'Suporte Técnico', 2100);
const mats = (await c.query('select matricula from funcionarios where id_empresa=$1 order by matricula', [A])).rows.map((x) => x.matricula);
ok('Matrícula sequencial por empresa (1..5)', mats.join(',') === '1,2,3,4,5');
await admin();
await c.query('update funcionarios set matricula = 99 where id = $1', [joao]);
ok('Matrícula não muda depois de atribuída', (await um('select matricula from funcionarios where id=$1', [joao])).matricula === 1);
await como(donoA);

const painel = async (emp = A) => (await um('select painel_folha_pagamento($1,$2::date) p', [emp, comp])).p;
const situ = (p, id) => p.funcionarios.find((f) => f.id === id)?.situacao;
const SALVAR = 'select salvar_ocorrencia_folha($1,$2,$3::date,$4,$5,$6,$7,$8::date,$9::date,$10,$11,$12) id';
const oc = (id, func, tipo, { q = null, v = null, ini = null, fim = null, sj = null, just = null, obs = null } = {}, emp = A) => [id, emp, comp, func, tipo, q, v, ini, fim, sj, just, obs];

let p = await painel();
ok('Competência ainda não iniciada: 5 funcionários, todos "a conferir", sem números fixos', p.competencia === null && p.funcionarios.length === 5 && p.funcionarios.every((f) => f.situacao === 'a_conferir'));
ok('Leitura não cria competência (sem efeito colateral)', N((await um('select count(*) n from competencias_folha where id_empresa=$1', [A])).n) === 0);

// ===== Ocorrências: validação por tipo =====
await falha('Horas extras sem quantidade é recusada', SALVAR, oc(null, joao, 'horas_extras'), 'quantidade');
await falha('Falta sem data/justificativa é recusada', SALVAR, oc(null, maria, 'faltas', { q: 1 }), 'justificativa');
await falha('Férias sem data final é recusada', SALVAR, oc(null, joao, 'ferias', { ini: comp }), 'Férias');
await falha('Comissão sem valor é recusada', SALVAR, oc(null, ana, 'comissoes'), 'valor');
await falha('Tipo inexistente é recusado', SALVAR, oc(null, ana, 'premio_secreto', { v: 1 }), 'Tipo');
await falha('Data final antes da inicial é recusada', SALVAR, oc(null, joao, 'ferias', { ini: comp, fim: '2000-01-01' }), 'anterior');
await falha('Valor com mais de 2 casas é recusado', SALVAR, oc(null, ana, 'comissoes', { v: 10.555 }), 'Valor');
await falha('Funcionário de outra empresa é recusado', SALVAR, oc(null, joao, 'horas_extras', { q: 1 }, B), 'permissão');

// ===== Cenário do enunciado =====
const ocJoao = (await um(SALVAR, oc(null, joao, 'horas_extras', { q: 5, ini: comp }))).id;
const ocMaria = (await um(SALVAR, oc(null, maria, 'faltas', { q: 1, ini: comp, sj: 'pendente' }))).id;
await um(SALVAR, oc(null, ana, 'comissoes', { v: 300 }));
ok('Primeira ação cria a competência "Em preparação" (uma só por empresa/mês)', (await um('select status from competencias_folha where id_empresa=$1 and competencia=$2::date', [A, comp])).status === 'preparacao');
await falha('Competência duplicada é impossível (UNIQUE)', "insert into competencias_folha (id_empresa, competencia) values ($1, $2::date)", [A, comp], '');
p = await painel();
ok('Ocorrência registrada NÃO deixa apto sozinha (João a conferir)', situ(p, joao) === 'a_conferir');
ok('Falta com justificativa pendente = Pendente (Maria)', situ(p, maria) === 'pendente' && p.pendencias.some((x) => x.id_funcionario === maria && x.descricao === 'Justificativa pendente'));
const CONF = 'select confirmar_conferencia_folha($1,$2::date,$3,$4)';
await falha('Sem ocorrências: confirmação "com ocorrências" é recusada (nunca presumir)', CONF, [A, comp, carlos, false], 'Confirmar sem ocorrências');
await falha('Quem tem ocorrência não pode ser confirmado "sem ocorrências"', CONF, [A, comp, joao, true], 'tem ocorrências');
await falha('Pendente não pode ser confirmado', CONF, [A, comp, maria, false], 'pendências');
await c.query(CONF, [A, comp, joao, false]);
await c.query(CONF, [A, comp, carlos, true]);
await c.query(CONF, [A, comp, ana, false]);
await falha('Confirmar duas vezes é recusado', CONF, [A, comp, joao, false], 'já está confirmada');
p = await painel();
const tot = (s) => p.funcionarios.filter((f) => f.situacao === s).length;
ok('Indicadores: 5 funcionários / 3 aptos / 1 a conferir / 1 pendente', p.funcionarios.length === 5 && tot('apto') === 3 && tot('a_conferir') === 1 && tot('pendente') === 1,
  JSON.stringify(p.funcionarios.map((f) => [f.nome, f.situacao])));
ok('Progresso 3 de 5 = 60%', Math.round((tot('apto') / p.funcionarios.length) * 100) === 60);
ok('Pedro (não confirmado) = A conferir; Carlos confirmado sem ocorrências = Apto', situ(p, pedro) === 'a_conferir' && situ(p, carlos) === 'apto');
const conf = await um('select sem_ocorrencias, confirmado_por, confirmado_em, id_competencia from conferencias_folha where id_funcionario=$1 and invalidada_em is null', [carlos]);
ok('Confirmação registra usuário, data/hora, competência e funcionário', conf.sem_ocorrencias === true && conf.confirmado_por === donoA && conf.confirmado_em && conf.id_competencia);
ok('Salário e cargo vêm do cadastro (João 2200, Técnico de Redes)', N(p.funcionarios.find((f) => f.id === joao).salario_base) === 2200 && p.funcionarios.find((f) => f.id === joao).cargo === 'Técnico de Redes');

// Nova ocorrência depois da confirmação invalida a conferência
const ocJoao2 = (await um(SALVAR, oc(null, joao, 'adiantamentos', { v: 500, ini: comp }))).id;
ok('Nova ocorrência após confirmar volta para "a conferir"', situ(await painel(), joao) === 'a_conferir');
await c.query('select excluir_ocorrencia_folha($1)', [ocJoao2]);
await c.query(CONF, [A, comp, joao, false]);
await um(SALVAR, oc(ocJoao, joao, 'horas_extras', { q: 6, ini: comp }));
ok('Alterar ocorrência também invalida', situ(await painel(), joao) === 'a_conferir');
await um(SALVAR, oc(ocJoao, joao, 'horas_extras', { q: 5, ini: comp }));
await c.query(CONF, [A, comp, joao, false]);

// Afastamento exige documento (pendência até anexar)
const ocPedro = (await um(SALVAR, oc(null, pedro, 'afastamentos', { ini: comp, just: 'Atestado médico' }))).id;
ok('Afastamento sem documento = Pendente', situ(await painel(), pedro) === 'pendente');
const objeto = async (dono, emp, ext = 'pdf', mime = 'application/pdf') => {
  const cam = `${emp}/${randomUUID()}.${ext}`;
  await c.query("insert into storage.objects (bucket_id, name, owner_id, metadata) values ('folha', $1, $2, $3)", [cam, dono, JSON.stringify({ mimetype: mime, size: 2048 })]);
  return cam;
};
await falha('Storage: envio na pasta de outra empresa é recusado', "insert into storage.objects (bucket_id, name, owner_id, metadata) values ('folha', $1, $2, '{}')", [`${B}/${randomUUID()}.pdf`, donoA]);
await falha('Storage: caminho fora do padrão é recusado', "insert into storage.objects (bucket_id, name, owner_id, metadata) values ('folha', $1, $2, '{}')", [`${A}/x.exe`, donoA]);
const camAtestado = await objeto(donoA, A);
await c.query('select anexar_documento_ocorrencia_folha($1,$2,$3)', [ocPedro, camAtestado, 'atestado.pdf']);
ok('Com documento anexado, a pendência some (a conferir)', situ(await painel(), pedro) === 'a_conferir');
await falha('Mesmo arquivo não é registrado duas vezes', 'select anexar_documento_ocorrencia_folha($1,$2,$3)', [ocPedro, camAtestado, 'x.pdf'], 'já registrado');
const camGif = await objeto(donoA, A, 'png', 'image/gif');
await falha('Tipo de arquivo não permitido é recusado', 'select anexar_documento_ocorrencia_folha($1,$2,$3)', [ocPedro, camGif, 'x.png'], 'não encontrado');

// ===== Acesso =====
await como(donoB);
await falha('Outra empresa não lê o painel (IDOR)', 'select painel_folha_pagamento($1,$2::date)', [A, comp], 'Sem acesso');
ok('Outra empresa não vê ocorrências (RLS)', N((await um('select count(*) n from ocorrencias_folha where id_empresa=$1', [A])).n) === 0);
await falha('Outra empresa não exclui ocorrência alheia', 'select excluir_ocorrencia_folha($1)', [ocJoao], 'não encontrada');
ok('Outra empresa não lê arquivo da folha (Storage)', N((await um("select count(*) n from storage.objects where bucket_id='folha' and name=$1", [camAtestado])).n) === 0);
await como(master);
await falha('Admin Master não lê a folha', 'select painel_folha_pagamento($1,$2::date)', [A, comp], 'Sem acesso');
ok('Admin Master não vê salários, ocorrências nem arquivos', N((await um('select count(*) n from ocorrencias_folha')).n) === 0 && N((await um('select count(*) n from conferencias_folha')).n) === 0
  && N((await um("select count(*) n from storage.objects where bucket_id='folha' and name=$1", [camAtestado])).n) === 0);
await como(contC);
p = await painel();
ok('Contador com "ver_folha" lê o painel', p.funcionarios.length === 5 && p.pode_processar === false && p.pode_preparar === false);
await falha('Contador não registra ocorrência', SALVAR, oc(null, joao, 'horas_extras', { q: 1 }), 'permissão');
await falha('Escrita direta na tabela é bloqueada', "insert into ocorrencias_folha (id_empresa, id_competencia, id_funcionario, tipo) select id_empresa, id_competencia, id_funcionario, 'outras' from ocorrencias_folha limit 1", [], 'permission denied');
await admin();
await c.query("set role anon");
await falha('Anônimo não executa as funções', 'select painel_folha_pagamento($1,$2::date)', [A, comp], 'permission denied');
await admin();
const priv = await um("select has_function_privilege('authenticated', 'public.integrar_folha_financeiro(uuid)', 'execute') a, has_function_privilege('authenticated', 'public.competencia_editavel_folha(uuid,date)', 'execute') b, has_function_privilege('authenticated', 'public.registrar_evento_folha(uuid,uuid,text,text,integer,jsonb)', 'execute') e");
ok('Funções internas sem EXECUTE para authenticated', priv.a === false && priv.b === false && priv.e === false);

// ===== Envio consolidado =====
await como(donoA);
const ENVIAR = 'select enviar_folha_contador($1,$2::date,$3,$4,$5) id';
await falha('Envio bloqueado com pendente/a conferir', ENVIAR, [A, comp, 'Ana Souza', null, true], 'a conferir ou com pendência');
await um(SALVAR, oc(ocMaria, maria, 'faltas', { q: 1, ini: comp, sj: 'justificada', just: 'Consulta médica' }));
await c.query(CONF, [A, comp, maria, false]);
await c.query(CONF, [A, comp, pedro, false]);
await falha('Envio exige confirmação final', ENVIAR, [A, comp, 'Ana Souza', null, false], 'Confirme');
await falha('Envio exige responsável', ENVIAR, [A, comp, '', null, true], 'responsável');
await falha('Envio exige contador com permissão de processar', ENVIAR, [A, comp, 'Ana Souza', null, true], 'processar a folha');
await permissoes(['ver_folha', 'processar_folha']);
await como(donoA);
const notifs = async () => { await admin(); const n = N((await um('select count(*) n from notificacoes where id_usuario=$1', [contC])).n); await como(donoA); return n; };
const notifAntes = await notifs();
const pac1 = (await um(ENVIAR, [A, comp, 'Ana Souza', 'Tudo conferido', true])).id;
const st = async () => (await um('select status, versao_atual, id from competencias_folha where id_empresa=$1 and competencia=$2::date', [A, comp]));
let cp = await st();
ok('Enviada: status "enviada", versão 1, um pacote vigente', cp.status === 'enviada' && cp.versao_atual === 1 && N((await um("select count(*) n from pacotes_folha where id_competencia=$1 and situacao='vigente'", [cp.id])).n) === 1);
const snap1 = (await um('select snapshot from pacotes_folha where id=$1', [pac1])).snapshot;
ok('Snapshot com os 5 funcionários e as ocorrências', snap1.funcionarios.length === 5 && snap1.funcionarios.find((f) => f.id === ana).ocorrencias[0].valor === 300);
ok('Contador notificado do envio', (await notifs()) === notifAntes + 1);
await falha('Depois do envio o RH não altera ocorrências', SALVAR, oc(null, joao, 'horas_extras', { q: 1 }), 'já foi enviada');
await falha('Depois do envio não há segundo envio', ENVIAR, [A, comp, 'Ana Souza', null, true], 'já foi enviada');
await falha('Escrita direta no status é bloqueada', "update competencias_folha set status='aprovada' where id=$1", [cp.id], 'permission denied');

// ===== Contador: correção = nova versão =====
await como(contC);
await falha('Contador não conclui sem iniciar', 'select concluir_devolucao_folha($1,null)', [cp.id], 'etapa atual');
await c.query('select iniciar_processamento_folha($1)', [cp.id]);
ok('Processamento iniciado', (await st()).status === 'em_processamento');
await falha('Correção para funcionário fora da folha é recusada', 'select solicitar_correcao_folha($1,$2,$3)', [cp.id, 'Conferir', JSON.stringify([{ id_funcionario: randomUUID(), descricao: 'x x x' }])], 'fora da folha');
await c.query('select solicitar_correcao_folha($1,$2,$3)', [cp.id, 'Falta o atestado da Maria', JSON.stringify([{ id_funcionario: maria, descricao: 'Anexar atestado da falta' }])]);
await como(donoA);
p = await painel();
ok('Correção solicitada: competência reabre e Maria fica Pendente', p.competencia.status === 'correcao_solicitada' && situ(p, maria) === 'pendente');
await falha('Reenvio bloqueado com a pendência aberta', ENVIAR, [A, comp, 'Ana Souza', null, true], 'pendência');
const pend = p.pendencias.find((x) => x.id_funcionario === maria && x.origem === 'contador');
await falha('Resolver exige descrição', 'select resolver_pendencia_folha($1,$2)', [pend.id, ''], 'Descreva');
await c.query('select resolver_pendencia_folha($1,$2)', [pend.id, 'Atestado anexado']);
await c.query(CONF, [A, comp, maria, false]);
const pac2 = (await um(ENVIAR, [A, comp, 'Ana Souza', 'Correção feita', true])).id;
cp = await st();
ok('Reenvio = versão 2; versão 1 "substituído" e snapshot preservado', cp.versao_atual === 2 && (await um('select situacao from pacotes_folha where id=$1', [pac1])).situacao === 'substituido'
  && JSON.stringify((await um('select snapshot from pacotes_folha where id=$1', [pac1])).snapshot) === JSON.stringify(snap1));

// ===== Devolução =====
await como(contC);
await c.query('select iniciar_processamento_folha($1)', [cp.id]);
const holerite = async (func) => { const cam = await objeto(contC, A); await c.query("select registrar_documento_devolucao_folha($1,'holerite',$2,$3,'holerite.pdf')", [cp.id, func, cam]); return cam; };
const camJoao = await holerite(joao);
await falha('Holerite de funcionário fora da folha é recusado', "select registrar_documento_devolucao_folha($1,'holerite',$2,$3,'h.pdf')", [cp.id, randomUUID(), await objeto(contC, A)], 'funcionário da folha');
await falha('Concluir incompleto é recusado', 'select concluir_devolucao_folha($1,null)', [cp.id], 'Falta holerite');
for (const f of [maria, carlos, ana, pedro]) await holerite(f);
await c.query("select registrar_documento_devolucao_folha($1,'guia',null,$2,'fgts.pdf')", [cp.id, await objeto(contC, A)]);
const liq = [[joao, 2100], [maria, 1650], [carlos, 1850], [ana, 2050], [pedro, 1950]].map(([id_funcionario, valor]) => ({ id_funcionario, valor }));
await falha('Encargo sem vencimento é recusado', 'select informar_valores_folha($1,$2,$3)', [cp.id, JSON.stringify(liq), JSON.stringify([{ descricao: 'FGTS', valor: 800 }])], 'Vencimento');
await falha('Líquido duplicado é recusado', 'select informar_valores_folha($1,$2,$3)', [cp.id, JSON.stringify([...liq, liq[0]]), '[]'], 'duas vezes');
const venc = `${hoje.slice(0, 7)}-20`;
await c.query('select informar_valores_folha($1,$2,$3)', [cp.id, JSON.stringify(liq), JSON.stringify([{ descricao: 'FGTS', valor: 800, vencimento: venc }, { descricao: 'INSS', valor: 1200, vencimento: venc }])]);
await como(donoA);
ok('Empresa não vê a devolução em rascunho', N((await um('select count(*) n from devolucoes_folha where id_competencia=$1', [cp.id])).n) === 0
  && N((await um("select count(*) n from storage.objects where bucket_id='folha' and name=$1", [camJoao])).n) === 0);
await como(contC);
const dev1 = (await um('select concluir_devolucao_folha($1,$2) id', [cp.id, 'Folha processada'])).id;
await como(donoA);
p = await painel();
ok('Devolvida: empresa vê devolução completa e o holerite', p.competencia.status === 'devolvida' && p.devolucao.id === dev1 && p.devolucao.faltas === 0
  && N((await um("select count(*) n from storage.objects where bucket_id='folha' and name=$1", [camJoao])).n) === 1);
await como(contC);
await falha('Contador não altera devolução já enviada', 'select informar_valores_folha($1,$2,$3)', [cp.id, JSON.stringify(liq), '[]'], 'etapa atual');
await como(donoA);
await falha('Revisão exige motivo', 'select solicitar_revisao_folha($1,$2,$3)', [cp.id, dev1, ''], 'Explique');
await c.query('select solicitar_revisao_folha($1,$2,$3)', [cp.id, dev1, 'Líquido da Ana diverge']);
ok('Revisão solicitada', (await st()).status === 'revisao_solicitada');
await falha('Aprovar devolução em revisão é recusado', 'select aprovar_folha($1,$2)', [cp.id, dev1], 'Não há devolução');
await como(contC);
await c.query('select iniciar_processamento_folha($1)', [cp.id]);
await c.query('select informar_valores_folha($1,$2,$3)', [cp.id, JSON.stringify(liq.map((x) => (x.id_funcionario === ana ? { ...x, valor: 2000 } : x))),
  JSON.stringify([{ descricao: 'FGTS', valor: 800, vencimento: venc }, { descricao: 'INSS', valor: 1200, vencimento: venc }])]);
const dev2 = (await um('select concluir_devolucao_folha($1,null) id', [cp.id])).id;
ok('Nova devolução (2) parte dos arquivos da anterior; anterior "substituida"', dev2 !== dev1 && (await um('select situacao from devolucoes_folha where id=$1', [dev1])).situacao === 'substituida'
  && N((await um("select count(*) n from documentos_folha where id_devolucao=$1 and categoria='holerite' and excluido_em is null", [dev2])).n) === 5);

// ===== Aprovação + Financeiro =====
await como(donoA);
await falha('Aprovar versão substituída é recusado', 'select aprovar_folha($1,$2)', [cp.id, dev1], 'substituída');
await como(contC);
await falha('Contador não aprova', 'select aprovar_folha($1,$2)', [cp.id, dev2], 'não encontrada');
await como(donoA);
await c.query('select aprovar_folha($1,$2)', [cp.id, dev2]);
const d2 = await um('select situacao, aprovada_por, aprovada_em from devolucoes_folha where id=$1', [dev2]);
ok('Aprovada: registra quem, quando e a versão', (await st()).status === 'aprovada' && d2.situacao === 'aprovada' && d2.aprovada_por === donoA && d2.aprovada_em
  && N((await um("select count(*) n from eventos_folha where id_competencia=$1 and tipo='folha_aprovada' and versao=2", [cp.id])).n) === 1);
await falha('Aprovar duas vezes é recusado', 'select aprovar_folha($1,$2)', [cp.id, dev2], 'Não há devolução');
const rf = (await c.query('select id_funcionario, total, pendente from resumo_folha($1,$2::date)', [A, comp])).rows;
ok('Salários no Financeiro = líquido aprovado (sem nova despesa)', N(rf.find((x) => x.id_funcionario === ana).total) === 2000 && N(rf.find((x) => x.id_funcionario === joao).total) === 2100
  && N((await um('select count(*) n from lancamentos_financeiros l join folhas_competencia f on f.id = l.id_folha where f.id_empresa=$1 and f.competencia=$2::date and l.excluido_em is null', [A, comp])).n) === 5);
const enc = (await c.query("select l.valor, l.status, k.nome from lancamentos_financeiros l join categorias_financeiras k on k.id = l.id_categoria where l.id_empresa=$1 and l.id_valor_folha is not null and l.excluido_em is null order by l.valor", [A])).rows;
ok('Encargos separados: 2 despesas pendentes em "Encargos da folha"', enc.length === 2 && enc.every((x) => x.status === 'pendente' && x.nome === 'Encargos da folha') && N(enc[0].valor) === 800);
await admin();
await c.query('select integrar_folha_financeiro($1)', [dev2]);
await como(donoA);
ok('Integração idempotente (rodar de novo não duplica nada)', N((await um('select count(*) n from lancamentos_financeiros where id_empresa=$1 and id_valor_folha is not null and excluido_em is null', [A])).n) === 2
  && N((await um("select count(*) n from ajustes_folha where id_devolucao_folha=$1 and excluido_em is null", [dev2])).n) === 5
  && N((await c.query('select total from resumo_folha($1,$2::date)', [A, comp])).rows.reduce((t, x) => t + N(x.total), 0)) === 2100 + 1650 + 1850 + 2000 + 1950, 'ver ajustes');
const lancEnc = (await um('select id from lancamentos_financeiros where id_empresa=$1 and id_valor_folha is not null order by valor limit 1', [A])).id;
await falha('Encargo não tem valor alterado pelo Financeiro', 'update lancamentos_financeiros set valor = 1 where id=$1', [lancEnc], '');

// Pagamento (independente da aprovação): salário via 038 e encargo via baixa do Financeiro
const folhaJoao = (await um('select id from folhas_competencia where id_funcionario=$1 and competencia=$2::date', [joao, comp])).id;
await c.query('select registrar_pagamento_folha($1, 2100, $2::date, $3)', [folhaJoao, hoje, conta]);
await c.query('select registrar_baixa_lancamento($1, $2::date, $3, 800)', [lancEnc, hoje, conta]);
p = await painel();
ok('Painel mostra pagamento: João pago, FGTS pago, demais pendentes', N(p.pagamento.salarios.find((x) => x.id_funcionario === joao).pendente) === 0
  && p.pagamento.encargos.find((x) => x.descricao === 'FGTS').status === 'pago' && p.pagamento.encargos.find((x) => x.descricao === 'INSS').status === 'pendente');
const camComp = await objeto(donoA, A);
await c.query('select anexar_comprovante_folha($1,$2,null,$3,$4)', [cp.id, joao, camComp, 'comprovante.pdf']);
await falha('Comprovante sem destino é recusado', 'select anexar_comprovante_folha($1,null,null,$2,$3)', [cp.id, await objeto(donoA, A), 'c.pdf'], 'Escolha');
ok('Comprovante registrado', N((await um("select count(*) n from documentos_folha where categoria='comprovante' and id_funcionario=$1", [joao])).n) === 1);

// ===== Histórico e vínculo revogado =====
const tipos = (await c.query('select distinct tipo from eventos_folha where id_competencia=$1', [cp.id])).rows.map((x) => x.tipo);
ok('Histórico com todos os marcos', ['ocorrencia_registrada', 'conferencia_confirmada', 'conferencia_invalidada', 'folha_enviada', 'processamento_iniciado', 'correcao_solicitada',
  'pendencia_resolvida', 'folha_devolvida', 'revisao_solicitada', 'folha_aprovada', 'comprovante_anexado'].every((t) => tipos.includes(t)), tipos.join(','));
await permissoes(['ver_folha', 'processar_folha'], 'encerrado');
await como(contC);
await falha('Vínculo encerrado bloqueia o contador', 'select painel_folha_pagamento($1,$2::date)', [A, comp], 'Sem acesso');
ok('Vínculo encerrado: sem leitura de holerites (Storage) e pacotes', N((await um("select count(*) n from storage.objects where bucket_id='folha' and name=$1", [camJoao])).n) === 0
  && N((await um('select count(*) n from pacotes_folha where id_empresa=$1', [A])).n) === 0);

await admin();
await c.query('rollback');
await c.end();
for (const y of r) console.log(`${y.ok ? 'OK   ' : 'FALHA'} ${y.n}${y.x ? `  [${y.x}]` : ''}`);
const f = r.filter((y) => !y.ok).length;
console.log(`\n${r.length - f}/${r.length} verificações OK`);
process.exit(f ? 1 : 0);
