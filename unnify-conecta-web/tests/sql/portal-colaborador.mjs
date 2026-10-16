// Portal do Colaborador + Ponto (migration 056) no PostgreSQL LOCAL; tudo desfeito no final (ROLLBACK).
import { createRequire } from 'node:module';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
const anon = () => c.query("select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false), set_config('role', 'anon', false)");
const admin = () => c.query("reset role; select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false)");
async function falha(n, s, p, t) { await c.query('savepoint t'); try { await c.query(s, p); await c.query('release savepoint t'); ok(n, false, 'não falhou'); } catch (e) { await c.query('rollback to savepoint t'); ok(n, !t || e.message.includes(t) || e.code === t, e.message.slice(0, 110)); } }
const N = (v) => Number(v);
const token = () => randomBytes(32).toString('base64url');
const hash = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

await c.query('begin');
await admin();
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const comp = (await um("select (date_trunc('month', $1::date) - interval '1 month')::date::text d", [hoje])).d; // mês anterior
const dataMais = async (d, n) => (await um('select ($1::date + $2::integer)::text d', [d, n])).d;
const seg = (await um("select ($1::date + ((8 - extract(isodow from $1::date)::integer) % 7))::text d", [comp])).d; // 1ª segunda do mês anterior
const dia = async (n) => dataMais(seg, n); // 0=seg … 5=sáb, 7=seg seguinte
const [donoA, donoB] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 2")).rows.map((x) => x.id_usuario);
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' limit 1")).id_usuario;
async function empresa(dono, n) {
  const e = await um(`insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ($1,$2,'pc@local.test','Palmas','TO','comum','ATIVA',$3) returning id`, [`66.${n}${n}${n}.000/0001-0${n}`, `Portal ${n}`, dono]);
  await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, e.id]);
  return e.id;
}
async function usuario(email, confirmado = true) {
  const id = randomUUID();
  await c.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, aud, role, created_at, updated_at)
    values ($1, $2, $3, '{"nome_completo":"Colab Teste"}', 'authenticated', 'authenticated', now(), now())`, [id, email, confirmado ? new Date() : null]);
  return id;
}
const A = await empresa(donoA, 1);
const B = await empresa(donoB, 2);
await como(donoA);
const den = (await um("select salvar_funcionario(null,$1,'Denilson Amorim','Técnico',($2::date - 200),'clt',2200,5,true,null,null) id", [A, hoje])).id;
const ana = (await um("select salvar_funcionario(null,$1,'Ana Souza','Auxiliar',($2::date - 200),'clt',1800,5,true,null,null) id", [A, hoje])).id;
await como(donoB);
const denB = (await um("select salvar_funcionario(null,$1,'Denilson Amorim','Vendedor',($2::date - 200),'clt',1700,5,true,null,null) id", [B, hoje])).id;
await admin();
// Convite exige jornada configurada (057): jornada inicial dos funcionários convidados
const ESC0 = Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, [['08:00', '12:00'], ['13:00', '17:00']]]));
const jornadaInicial = (f, e) => c.query('insert into jornadas_funcionario (id_empresa, id_funcionario, vigente_desde, escala) values ($2,$1,$3::date,$4::jsonb)', [f, e, comp, JSON.stringify(ESC0)]);
await jornadaInicial(den, A); await jornadaInicial(ana, A); await jornadaInicial(denB, B);
const uDen = await usuario('denilson.portal@local.test');
const uAna = await usuario('ana.portal@local.test');
const uOutro = await usuario('outro.portal@local.test');
const uSemConfirmar = await usuario('naoconfirmado.portal@local.test', false);

// ===== FASE 1 — Convites, ativação e isolamento =====
const CONV = 'select * from criar_convite_colaborador($1,$2,$3)';
const t1 = token();
await anon();
await falha('Anônimo não cria convite', CONV, [den, 'denilson.portal@local.test', hash(t1)], 'permission denied');
await como(donoB);
await falha('Outra empresa não convida funcionário alheio (IDOR)', CONV, [den, 'denilson.portal@local.test', hash(t1)], 'não encontrado');
await como(uDen);
await falha('Colaborador não cria convite', CONV, [den, 'denilson.portal@local.test', hash(t1)], 'não encontrado');
await como(donoA);
await falha('E-mail inválido recusado', CONV, [den, 'sem-arroba', hash(t1)], 'e-mail válido');
const conv1 = await um(CONV, [den, 'Denilson.Portal@local.test', hash(t1)]);
ok('RH cria convite: 7 dias, e-mail normalizado e gravado no cadastro', conv1.email === 'denilson.portal@local.test' && conv1.empresa === 'Portal 1'
  && (new Date(conv1.expira_em) - Date.now()) / 864e5 > 6.9 && (await um('select email from funcionarios where id=$1', [den])).email === 'denilson.portal@local.test');
await falha('Convites não são legíveis diretamente (nem pelo RH)', 'select count(*) from convites_colaborador', [], 'permission denied');
await admin();
ok('Banco guarda só o hash do token', N((await um('select count(*) n from convites_colaborador where hash_token=$1', [hash(t1)])).n) === 1
  && N((await um("select count(*) n from convites_colaborador where hash_token=$1", [t1])).n) === 0);
await como(donoA);
const t2 = token();
await um(CONV, [den, 'denilson.portal@local.test', hash(t2)]);
await admin();
ok('Reenvio revoga o convite pendente anterior (um pendente por funcionário)', N((await um('select count(*) n from convites_colaborador where id_funcionario=$1 and usado_em is null and revogado_em is null', [den])).n) === 1);
await anon();
ok('Link antigo (revogado) não vale', (await um('select * from dados_convite_colaborador($1)', [t1])).situacao === 'revogado');
const dados = await um('select * from dados_convite_colaborador($1)', [t2]);
ok('Anônimo com o token vê só primeiro nome, empresa e e-mail', dados.situacao === 'valido' && dados.nome === 'Denilson' && dados.empresa === 'Portal 1');
ok('Token inexistente = inválido (não revela nada)', (await um('select * from dados_convite_colaborador($1)', [token()])).situacao === 'invalido' && (await um('select * from dados_convite_colaborador($1)', [token()])).nome === null);
await falha('Anônimo não aceita convite', 'select aceitar_convite_colaborador($1)', [t2], 'permission denied');
await como(uOutro);
await falha('Conta de outro e-mail não usa o convite (e-mail não basta, nem o token sozinho)', 'select aceitar_convite_colaborador($1)', [t2], 'e-mail que recebeu o convite');
await admin();
await como(uDen);
await falha('Token inválido recusado', 'select aceitar_convite_colaborador($1)', [token()], 'Convite inválido');
const aceito = (await um('select aceitar_convite_colaborador($1) id', [t2])).id;
ok('Colaborador não lê a tabela de acessos', N((await um('select count(*) n from acessos_colaborador')).n) === 0);
await admin();
ok('Aceite vincula o usuário ao funcionário certo (id interno)', aceito === den && N((await um('select count(*) n from acessos_colaborador where id_funcionario=$1 and id_usuario=$2 and revogado_em is null', [den, uDen])).n) === 1);
await como(uDen);
ok('Aceite repetido pelo mesmo usuário é idempotente', (await um('select aceitar_convite_colaborador($1) id', [t2])).id === den);
await como(uOutro);
await falha('Convite usado não serve para outra conta', 'select aceitar_convite_colaborador($1)', [t2], 'já foi utilizado');
await como(donoA);
await falha('Com acesso ativo não há novo convite', CONV, [den, 'denilson.portal@local.test', hash(token())], 'já tem acesso ativo');
// Ana: expirado, e-mail não confirmado e revogado
const t3 = token();
await um(CONV, [ana, 'naoconfirmado.portal@local.test', hash(t3)]);
await como(uSemConfirmar);
await falha('E-mail não confirmado não ativa', 'select aceitar_convite_colaborador($1)', [t3], 'e-mail que recebeu o convite');
await como(donoA);
await c.query('select revogar_convite_colaborador($1)', [ana]);
await como(uSemConfirmar);
await falha('Convite revogado não ativa', 'select aceitar_convite_colaborador($1)', [t3], 'cancelado');
await como(donoA);
const t4 = token();
await um(CONV, [ana, 'ana.portal@local.test', hash(t4)]);
await admin();
await c.query("update convites_colaborador set expira_em = now() - interval '1 minute' where hash_token=$1", [hash(t4)]);
await como(uAna);
await falha('Convite expirado não ativa', 'select aceitar_convite_colaborador($1)', [t4], 'expirou');
await como(donoA);
ok('RH vê a situação "convite_expirado"', (await um('select * from situacao_portal_funcionario($1)', [ana])).situacao === 'convite_expirado');
const t5 = token();
await um(CONV, [ana, 'ana.portal@local.test', hash(t5)]);
await como(uAna);
await c.query('select aceitar_convite_colaborador($1)', [t5]);
// Multi-vínculo: o mesmo Denilson também na empresa B
await como(donoB);
const t6 = token();
await um(CONV, [denB, 'denilson.portal@local.test', hash(t6)]);
await como(uDen);
await c.query('select aceitar_convite_colaborador($1)', [t6]);
const portal = (await c.query('select * from portal_colaborador()')).rows;
ok('Portal lista os dois vínculos do usuário (empresas separadas)', portal.length === 2 && portal.some((x) => x.id_empresa === A) && portal.some((x) => x.id_empresa === B));
ok('Portal não expõe salário', !('salario_base' in portal[0]));
ok('Colaborador não lê tabelas da empresa diretamente (funcionários, folhas, ajustes, financeiro)',
  N((await um('select count(*) n from funcionarios')).n) === 0 && N((await um('select count(*) n from folhas_competencia')).n) === 0
  && N((await um('select count(*) n from ajustes_folha')).n) === 0 && N((await um('select count(*) n from lancamentos_financeiros')).n) === 0
  && N((await um('select count(*) n from contas_financeiras')).n) === 0);
await falha('Colaborador não acessa resumo da folha geral', 'select * from resumo_folha($1, $2::date)', [A, comp]);
await falha('Colaborador não acessa o painel de ponto do RH', 'select painel_ponto($1,$2::date)', [A, comp], 'Sem permissão');
await falha('Colaborador não vê situação do portal de colega', 'select * from situacao_portal_funcionario($1)', [ana], 'não encontrado');
await falha('IDOR: ponto de colega da mesma empresa', 'select * from meu_ponto($1, $2::date, $2::date)', [ana, hoje], 'Acesso não autorizado');
await como(uAna);
await falha('IDOR: ponto de funcionário de outra empresa', 'select * from meu_ponto($1, $2::date, $2::date)', [denB, hoje], 'Acesso não autorizado');
await como(master);
await falha('Admin Master sem acesso automático ao ponto', 'select painel_ponto($1,$2::date)', [A, comp], 'Sem permissão');
ok('Admin Master não lê marcações nem apurações', N((await um('select count(*) n from marcacoes_ponto')).n) === 0 && N((await um('select count(*) n from apuracoes_ponto')).n) === 0);

// ===== FASE 3 — Marcações =====
await como(uDen);
const MARC = 'select * from registrar_marcacao_ponto($1,$2,$3,$4,$5,$6,$7,$8)';
const m1 = randomUUID();
const r1 = await um(MARC, [m1, den, 'entrada', 'capturada', -5.4653, -47.8819, 8, 'pendente']);
ok('Marcação com hora do SERVIDOR e data local', Math.abs(new Date(r1.registrado_em) - Date.now()) < 120000 && r1.data_local.toISOString !== undefined && !r1.duplicada);
const r1b = await um(MARC, [m1, den, 'entrada', 'capturada', -5.4653, -47.8819, 8, 'pendente']);
ok('Reenvio do mesmo id (rede instável) não duplica', r1b.duplicada && N((await um('select count(*) n from meu_ponto($1, $2::date, $2::date)', [den, hoje])).n) === 1);
await falha('Toque duplo (mesmo tipo em 2 min) recusado', MARC, [randomUUID(), den, 'entrada', 'negada', null, null, null, 'negada'], 'há instantes');
const m2 = randomUUID();
await um(MARC, [m2, den, 'saida_intervalo', 'negada', null, null, null, 'indisponivel']);
const m3 = randomUUID();
await um(MARC, [m3, den, 'retorno_intervalo', 'capturada', -5.4, -47.8, 500, 'negada']);
const meus = (await c.query('select * from meu_ponto($1, $2::date, $2::date)', [den, hoje])).rows;
ok('GPS negado e foto indisponível: marcação aceita e sinalizada (sem inventar dado)', meus.find((x) => x.id === m2)?.situacao_localizacao === 'negada' && meus.find((x) => x.id === m2)?.situacao_foto === 'indisponivel');
ok('Precisão ruim (500 m) vira "imprecisa"', meus.find((x) => x.id === m3)?.situacao_localizacao === 'imprecisa');
await falha('Coordenada inválida recusada', MARC, [randomUUID(), den, 'outra', 'capturada', 120, 10, 5, 'negada'], 'Localização inválida');
await falha('Localização "negada" com coordenadas recusada', MARC, [randomUUID(), den, 'outra', 'negada', 1, 1, 5, 'negada'], 'Localização inválida');
await falha('Marcação para colega (IDOR) recusada', MARC, [randomUUID(), ana, 'entrada', 'negada', null, null, null, 'negada'], 'Acesso não autorizado');
await falha('Colaborador não altera marcação direto', 'update marcacoes_ponto set tipo = $2 where id = $1', [m1, 'saida'], 'permission denied');
await admin();
await falha('Nem o banco altera a marcação original', 'update marcacoes_ponto set registrado_em = now() - interval \'1 hour\' where id = $1', [m1], 'não podem ser alterados');
await falha('Nem o banco exclui a marcação original', 'delete from marcacoes_ponto where id = $1', [m1], 'não podem ser alterados');
await como(uDen);
const caminho = `${A}/${den}/${m1}.jpg`;
ok('Foto: envio permitido só no caminho da própria marcação', (await um('select pode_enviar_foto_ponto($1) v', [caminho])).v
  && !(await um('select pode_enviar_foto_ponto($1) v', [`${A}/${ana}/${m1}.jpg`])).v && !(await um('select pode_enviar_foto_ponto($1) v', [`${A}/${den}/${m2}.jpg`])).v);
await como(uAna);
ok('Foto: colega não envia no caminho alheio', !(await um('select pode_enviar_foto_ponto($1) v', [caminho])).v);
await como(uDen);
await falha('Foto: anexar sem arquivo enviado é recusado', 'select anexar_foto_marcacao($1, true)', [m1], 'Foto não recebida');
await admin();
await c.query("insert into storage.objects (bucket_id, name, owner_id, metadata) values ('ponto', $1, $2, '{\"mimetype\":\"image/jpeg\",\"size\":1000}')", [caminho, uDen]);
await como(uDen);
await c.query('select anexar_foto_marcacao($1, true)', [m1]);
ok('Foto anexada uma vez (marcação continua imutável)', (await um('select situacao_foto, foto_caminho from meu_ponto($1, $2::date, $2::date) where id=$3', [den, hoje, m1])).foto_caminho === caminho);
ok('Foto: leitura pelo próprio colaborador', (await um('select pode_ler_foto_ponto($1) v', [caminho])).v);
await como(uAna);
ok('Foto: colega não lê', !(await um('select pode_ler_foto_ponto($1) v', [caminho])).v);
await como(donoB);
ok('Foto: outra empresa não lê', !(await um('select pode_ler_foto_ponto($1) v', [caminho])).v);
await como(donoA);
ok('Foto: RH da empresa lê', (await um('select pode_ler_foto_ponto($1) v', [caminho])).v);
await anon();
await falha('Anônimo não registra ponto', MARC, [randomUUID(), den, 'entrada', 'negada', null, null, null, 'negada'], 'permission denied');

// ===== FASE 4 — Jornada, apuração e conferência =====
await como(donoA);
const ESC = { 0: [], 1: [['08:00', '12:00'], ['13:00', '17:00']], 2: [['08:00', '12:00'], ['13:00', '17:00']], 3: [['08:00', '12:00'], ['13:00', '17:00']], 4: [['08:00', '12:00'], ['13:00', '17:00']], 5: [['08:00', '12:00'], ['13:00', '17:00']], 6: [] };
const JOR = 'select salvar_jornada_funcionario($1,$2::date,$3::jsonb,$4,$5,$6,$7)';
await falha('Escala com períodos fora de ordem recusada', JOR, [den, comp, JSON.stringify({ 1: [['13:00', '17:00'], ['08:00', '12:00']] }), 10, 60, 360, 'conferir'], 'crescentes');
await falha('Escala com horário inválido recusada', JOR, [den, comp, JSON.stringify({ 1: [['8h', '12:00']] }), 10, 60, 360, 'conferir'], 'HH:MM');
await como(uDen);
await falha('Colaborador não configura a própria jornada', JOR, [den, comp, JSON.stringify(ESC), 10, 60, 360, 'conferir'], 'não encontrado');
await como(donoA);
await um(JOR, [den, comp, JSON.stringify(ESC), 10, 60, 360, 'conferir']);
const feriado = await dia(7); // segunda seguinte vira feriado
await c.query("select salvar_feriado_empresa($1,$2::date,'Feriado municipal')", [A, feriado]);
await admin();
const marcar = async (d, hs) => { for (const [h, t] of hs) await c.query("insert into marcacoes_ponto (id, id_empresa, id_funcionario, id_usuario, tipo, registrado_em, data_local, situacao_localizacao, situacao_foto) values ($1,$2,$3,$4,$5,($6::date + $7::time) at time zone 'America/Sao_Paulo',$6::date,'negada','negada')", [randomUUID(), A, den, uDen, t, d, h]); };
const D = { seg: await dia(0), ter: await dia(1), qua: await dia(2), qui: await dia(3), sex: await dia(4), sab: await dia(5), fer: feriado, ter2: await dia(8) };
await marcar(D.seg, [['08:00', 'entrada'], ['12:00', 'saida_intervalo'], ['13:00', 'retorno_intervalo'], ['19:00', 'saida']]); // 10h → +2h
// ter: ausência
await marcar(D.qua, [['08:00', 'entrada'], ['12:00', 'saida_intervalo'], ['13:00', 'retorno_intervalo']]); // incompleta
await marcar(D.qui, [['08:00', 'entrada'], ['17:00', 'saida']]); // 9h sem intervalo → +1h e intervalo inconsistente
await marcar(D.sex, [['08:00', 'entrada'], ['12:00', 'saida_intervalo'], ['13:00', 'retorno_intervalo'], ['17:05', 'saida']]); // +5 min dentro da tolerância
await marcar(D.sab, [['08:00', 'entrada'], ['12:00', 'saida']]); // sábado não previsto: 4h
await marcar(D.fer, [['08:00', 'entrada'], ['10:00', 'saida']]); // feriado: 2h
await marcar(D.ter2, [['08:00', 'entrada'], ['12:00', 'saida_intervalo'], ['13:00', 'retorno_intervalo'], ['16:00', 'saida']]); // 7h → atraso 1h
await como(donoA);
await c.query('select apurar_ponto_competencia($1,$2::date)', [A, comp]);
const ap = async (d) => um('select * from apuracoes_ponto where id_funcionario=$1 and data=$2::date', [den, d]);
ok('Excedente identificado: 10h × 8h previstas = 120 min', N((await ap(D.seg)).excedente_minutos) === 120 && (await ap(D.seg)).situacao === 'apurada');
ok('Jornada prevista e registrada guardadas para o RH', (await ap(D.seg)).jornada_prevista === '08:00–12:00 · 13:00–17:00' && (await ap(D.seg)).jornada_registrada === '08:00 · 12:00 · 13:00 · 19:00');
ok('Ausência identificada', (await ap(D.ter)).ausencia === true);
ok('Marcação incompleta identificada (sem calcular excedente)', (await ap(D.qua)).incompleta === true && N((await ap(D.qua)).excedente_minutos) === 0);
ok('Intervalo inconsistente identificado (9h corridas)', (await ap(D.qui)).intervalo_inconsistente === true && N((await ap(D.qui)).excedente_minutos) === 60);
ok('Dentro da tolerância: nenhuma ocorrência', (await ap(D.sex)) === undefined);
ok('Sábado trabalhado: "dia não previsto" a conferir, NÃO vira hora extra automaticamente', (await ap(D.sab)).dia_nao_previsto && N((await ap(D.sab)).excedente_minutos) === 240 && (await ap(D.sab)).classificacao === null);
ok('Feriado configurado: trabalho em feriado sinalizado', (await ap(D.fer)).feriado && (await ap(D.fer)).dia_nao_previsto);
ok('Horas a menos (7h de 8h) = 60 min', N((await ap(D.ter2)).atraso_minutos) === 60);
const total1 = N((await um('select count(*) n from apuracoes_ponto where id_funcionario=$1', [den])).n);
await c.query('select apurar_ponto_competencia($1,$2::date)', [A, comp]);
ok('Reapurar não duplica', N((await um('select count(*) n from apuracoes_ponto where id_funcionario=$1', [den])).n) === total1);
const caio = (await um("select salvar_funcionario(null,$1,'Caio Sem Jornada','Auxiliar',($2::date - 200),'clt',1800,5,true,null,null) id", [A, hoje])).id;
ok('Funcionário sem jornada aparece como pendência no painel', (await um('select painel_ponto($1,$2::date) p', [A, comp])).p.sem_jornada.some((x) => x.id === caio));
await falha('Convite para o portal exige jornada configurada', CONV, [caio, 'caio.portal@local.test', hash(token())], 'Configure a jornada');
const CONF = 'select conferir_apuracao_ponto($1,$2,$3)';
await falha('Excedente não pode ser apagado/virar falta', CONF, [(await ap(D.seg)).id, 'falta', null], 'Classificação inválida');
await falha('Incompleta não é conferida', CONF, [(await ap(D.qua)).id, 'ciente', null], 'incompletas');
await falha('Compensação exige justificativa', CONF, [(await ap(D.sab)).id, 'compensacao', ''], 'justificativa');
const idSeg = (await ap(D.seg)).id;
await como(donoB);
await falha('Outra empresa não confere', CONF, [idSeg, 'hora_extra', null], 'não encontrada');
await como(donoA);
await c.query(CONF, [(await ap(D.seg)).id, 'hora_extra', null]);
await c.query(CONF, [(await ap(D.qui)).id, 'hora_extra', 'Ciente do intervalo; orientado']);
await c.query(CONF, [(await ap(D.sab)).id, 'banco_horas', null]);
await c.query(CONF, [(await ap(D.ter)).id, 'falta', null]);
await c.query(CONF, [(await ap(D.ter2)).id, 'atraso_justificado', 'Consulta médica']);
ok('Conferência registra quem e quando', (await ap(D.seg)).situacao === 'conferida' && (await ap(D.seg)).conferido_por === donoA);
// Esclarecimento
const idFer = (await ap(D.fer)).id;
await c.query("select solicitar_esclarecimento_ponto($1,'Por que trabalhou no feriado?')", [idFer]);
await como(uDen);
const esp = await um('select minha_jornada($1,$2::date) j', [den, comp]);
ok('Colaborador vê o pedido de esclarecimento e o espelho do mês', esp.j.dias.some((x) => x.data === D.fer && x.pedido_esclarecimento === 'Por que trabalhou no feriado?') && esp.j.dias.some((x) => x.data === D.seg && x.excedente_minutos === 120));
ok('Notificação ao colaborador', N((await um("select count(*) n from notificacoes where id_usuario=$1 and tipo='ponto'", [uDen])).n) >= 1);
ok('Espelho traz o id da apuração para responder', esp.j.dias.find((x) => x.data === D.fer)?.id_apuracao === idFer);
await c.query("select responder_esclarecimento_ponto($1,'Inventário pedido pelo gerente')", [idFer]);
await como(uAna);
await falha('Colega não responde esclarecimento alheio', "select responder_esclarecimento_ponto($1,'x x x')", [idFer], 'não encontrada');
await como(donoA);
ok('Resposta volta para conferência do RH', (await ap(D.fer)).situacao === 'apurada' && (await ap(D.fer)).resposta_colaborador === 'Inventário pedido pelo gerente');
await c.query(CONF, [(await ap(D.fer)).id, 'hora_extra', null]);
// Correção solicitada pelo colaborador (incompleta de quarta) e desconsideração
await como(uDen);
const SOL = 'select solicitar_correcao_ponto($1,$2,$3::date,$4::time,$5,$6,$7) id';
await falha('Correção exige motivo', SOL, [den, 'incluir', D.qua, '17:00', 'saida', null, ''], 'motivo');
await falha('Correção para data futura recusada', SOL, [den, 'incluir', await dataMais(hoje, 1), '08:00', 'entrada', null, 'Esqueci'], 'fora do período');
const sol1 = (await um(SOL, [den, 'incluir', D.qua, '17:00', 'saida', null, 'Esqueci de marcar a saída'])).id;
await como(donoA);
const origQua = (await c.query('select id from marcacoes_ponto where id_funcionario=$1 and data_local=$2::date', [den, D.qua])).rows.length;
await falha('Recusa exige motivo', 'select responder_solicitacao_ponto($1,false,$2)', [sol1, ''], 'motivo da recusa');
await c.query("select responder_solicitacao_ponto($1,true,'ok')", [sol1]);
const quaDepois = (await c.query('select origem from marcacoes_ponto where id_funcionario=$1 and data_local=$2::date', [den, D.qua])).rows;
ok('Correção aprovada adiciona marcação de correção; originais preservadas', quaDepois.length === origQua + 1 && quaDepois.filter((x) => x.origem === 'portal').length === origQua);
ok('Dia reapurado após a correção (8h: sem ocorrência)', (await ap(D.qua)) === undefined);
const marcSab = (await um("select id from marcacoes_ponto where id_funcionario=$1 and data_local=$2::date and tipo='saida'", [den, D.sab])).id;
await c.query("select corrigir_ponto_rh($1,'desconsiderar',$2::date,null,null,$3,'Marcação feita por engano')", [den, D.sab, marcSab]);
ok('Desconsideração pelo RH: original mantido, dia recalculado (incompleto) e conferência desfeita', N((await um('select count(*) n from marcacoes_ponto where id=$1', [marcSab])).n) === 1
  && (await ap(D.sab)).incompleta === true && (await ap(D.sab)).situacao === 'apurada' && (await ap(D.sab)).classificacao === null);
await c.query("select corrigir_ponto_rh($1,'incluir',$2::date,'12:00','saida',null,'Saída real conforme câmera')", [den, D.sab]);
await c.query(CONF, [(await ap(D.sab)).id, 'banco_horas', null]);
ok('Histórico de auditoria das correções', N((await um("select count(*) n from historico_ponto where id_funcionario=$1 and acao in ('correcao_rh','correcao_aprovada','correcao_solicitada')", [den])).n) === 4);

// ===== FASE 5 — Integração com a Folha =====
const lanc0 = N((await um('select count(*) n from lancamentos_financeiros where id_empresa=$1', [A])).n);
const oc0 = N((await um('select count(*) n from ocorrencias_folha where id_empresa=$1', [A])).n);
const n1 = N((await um('select integrar_ponto_folha($1,$2::date) n', [A, comp])).n);
const ocs = (await c.query('select tipo, quantidade, situacao_justificativa, data_inicio::text di, data_fim::text df from ocorrencias_folha where id_empresa=$1 and excluido_em is null order by tipo', [A])).rows;
const he = ocs.find((x) => x.tipo === 'horas_extras');
ok('Integração cria UMA ocorrência de horas extras somando os dias conferidos (2h + 1h + 2h = 5h)', n1 === 3 && N(he?.quantidade) === 5 && he.di === D.seg && he.df === D.fer);
ok('Falta (1 dia, não justificada) e atraso justificado (1h) levados à folha', ocs.some((x) => x.tipo === 'faltas' && N(x.quantidade) === 1 && x.situacao_justificativa === 'nao_justificada')
  && ocs.some((x) => x.tipo === 'atrasos' && N(x.quantidade) === 1 && x.situacao_justificativa === 'justificada'));
ok('Banco de horas não vira ocorrência da folha (fica conferido)', (await ap(D.sab)).situacao === 'conferida');
ok('Apurações integradas apontam a ocorrência', (await ap(D.seg)).situacao === 'integrada' && (await ap(D.seg)).id_ocorrencia !== null);
const n2 = N((await um('select integrar_ponto_folha($1,$2::date) n', [A, comp])).n);
ok('Integrar de novo não duplica (idempotente)', n2 === 0 && N((await um('select count(*) n from ocorrencias_folha where id_empresa=$1', [A])).n) === oc0 + 3);
ok('Nenhum lançamento financeiro criado pela integração', N((await um('select count(*) n from lancamentos_financeiros where id_empresa=$1', [A])).n) === lanc0);
await falha('Dia integrado não recebe correção sem revisão formal', "select corrigir_ponto_rh($1,'incluir',$2::date,'20:00','outra',null,'Teste')", [den, D.seg], 'integrado à folha');
await falha('Dia integrado não é reconferido', CONF, [(await ap(D.seg)).id, 'banco_horas', null], 'integrado');
await falha('Conferência integrada não é desfeita', 'select desfazer_conferencia_ponto($1)', [(await ap(D.seg)).id], 'ainda não integrada');
await admin();
await c.query("update competencias_folha set status='enviada' where id_empresa=$1 and competencia=$2::date", [A, comp]);
await como(donoA);
await c.query("select desfazer_conferencia_ponto($1)", [(await ap(D.sab)).id]);
await c.query(CONF, [(await ap(D.sab)).id, 'hora_extra', null]);
await falha('Folha enviada ao contador: integração bloqueada', 'select integrar_ponto_folha($1,$2::date)', [A, comp], 'já foi enviada');


// ===== Sequência completa no portal (entrada → intervalo → retorno → saída) =====
await como(donoA);
const bia = (await um("select salvar_funcionario(null,$1,'Bia Lima','Operadora',($2::date - 300),'clt',1900,5,true,null,null) id", [A, hoje])).id;
await admin(); await jornadaInicial(bia, A); await como(donoA);
const tB = token();
await um(CONV, [bia, 'bia.portal@local.test', hash(tB)]);
await admin();
const uBia = await usuario('bia.portal@local.test');
await como(uBia);
await c.query('select aceitar_convite_colaborador($1)', [tB]);
for (const t of ['entrada', 'saida_intervalo', 'retorno_intervalo', 'saida']) await um(MARC, [randomUUID(), bia, t, 'negada', null, null, null, 'negada']);
const seqBia = (await c.query('select tipo, data_local::text d from meu_ponto($1, $2::date, $2::date) order by registrado_em', [bia, hoje])).rows;
ok('Sequência entrada → intervalo → retorno → saída registrada no dia', seqBia.map((x) => x.tipo).join(',') === 'entrada,saida_intervalo,retorno_intervalo,saida' && seqBia.every((x) => x.d === hoje));
await falha('Clique repetido na saída recusado', MARC, [randomUUID(), bia, 'saida', 'negada', null, null, null, 'negada'], 'há instantes');

// ===== Escala e turno que vira a meia-noite =====
await como(donoA);
const NOITE = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, [['22:00', '06:00']]]));
await falha('Turno noturno > 16 h recusado', JOR, [bia, comp, JSON.stringify({ 1: [['12:00', '08:00']] }), 10, 60, 360, 'conferir'], 'muito longo');
await falha('Período que vira a meia-noite precisa ser o último do dia', JOR, [bia, comp, JSON.stringify({ 1: [['22:00', '02:00'], ['03:00', '05:00']] }), 10, 60, 360, 'conferir'], 'último período');
await falha('Turno noturno não pode invadir a jornada do dia seguinte', JOR, [bia, comp, JSON.stringify({ 1: [['22:00', '06:00']], 2: [['05:00', '09:00']] }), 10, 60, 600, 'conferir'], 'invade');
await um(JOR, [bia, comp, JSON.stringify(NOITE), 10, 60, 600, 'conferir']);
await admin();
ok('Escala 22:00–06:00 aceita e o colaborador é avisado', N((await um("select count(*) n from notificacoes where id_usuario=$1 and titulo='Sua jornada foi atualizada'", [uBia])).n) === 1);
await admin();
const marcarB = async (dRef, quando, t) => c.query("insert into marcacoes_ponto (id, id_empresa, id_funcionario, id_usuario, tipo, registrado_em, data_local, situacao_localizacao, situacao_foto) values ($1,$2,$3,$4,$5,($6::timestamp at time zone 'America/Sao_Paulo'),$7::date,'negada','negada')", [randomUUID(), A, bia, uBia, t, quando, dRef]);
const fimMes = (await um("select ($1::date + interval '1 month' - interval '1 day')::date::text d", [comp])).d; // último dia do mês anterior
const iniMesAtual = await dataMais(fimMes, 1);
await marcarB(fimMes, `${fimMes} 22:00`, 'entrada');
await marcarB(fimMes, `${iniMesAtual} 06:30`, 'saida');
await como(donoA);
await c.query('select apurar_ponto_competencia($1,$2::date)', [A, comp]);
const apN = await um('select * from apuracoes_ponto where id_funcionario=$1 and data=$2::date', [bia, fimMes]);
ok('Turno 22:00 → 06:30 do último dia do mês: 8h30 trabalhadas, 30 min excedentes, na competência em que começou',
  apN && N(apN.trabalhado_minutos) === 510 && N(apN.excedente_minutos) === 30 && N(apN.previsto_minutos) === 480);
ok('Texto do espelho mostra o horário do dia seguinte', apN?.jornada_registrada === '22:00 · 06:30 (+1)' && apN?.jornada_prevista === '22:00–06:00 (+1)');
ok('Saída após a meia-noite não conta trabalho no dia seguinte (sem duplicidade)', N((await um('select count(*) n from apuracoes_ponto where id_funcionario=$1 and data=$2::date and trabalhado_minutos > 0', [bia, iniMesAtual])).n) === 0);
// Virada do ano (cálculo puro; jornada antiga inserida direto no banco local)
await admin();
await c.query("insert into jornadas_funcionario (id_empresa, id_funcionario, vigente_desde, escala) values ($1,$2,'2025-01-01',$3::jsonb)", [A, bia, JSON.stringify(NOITE)]);
await marcarB('2025-12-31', '2025-12-31 22:00', 'entrada');
await marcarB('2025-12-31', '2026-01-01 06:00', 'saida');
const ano = await um("select * from calcular_dia_ponto($1, '2025-12-31')", [bia]);
ok('Virada do ano: 31/12 22:00 → 01/01 06:00 = 8h no dia 31/12, sem excedente', N(ano.trabalhado) === 480 && N(ano.excedente) === 0 && !ano.incompleta);
// Registro real atravessando a meia-noite: turno aberto ontem (há 7 h) → saída fica no dia da jornada
const ontemB = await dataMais(hoje, -1);
await como(donoA);
const noc = (await um("select salvar_funcionario(null,$1,'Nilo Noturno','Vigia',($2::date - 300),'clt',1900,5,true,null,null) id", [A, hoje])).id;
await um(JOR, [noc, comp, JSON.stringify(NOITE), 10, 60, 600, 'conferir']);
const tN = token();
await um(CONV, [noc, 'nilo.portal@local.test', hash(tN)]);
await admin();
const uNilo = await usuario('nilo.portal@local.test');
await c.query("insert into marcacoes_ponto (id, id_empresa, id_funcionario, id_usuario, tipo, registrado_em, data_local, situacao_localizacao, situacao_foto) values ($1,$2,$3,$4,'entrada', now() - interval '7 hours', $5::date,'negada','negada')", [randomUUID(), A, noc, uNilo, ontemB]);
await como(uNilo);
await c.query('select aceitar_convite_colaborador($1)', [tN]);
const saidaNoite = await um(MARC, [randomUUID(), noc, 'saida', 'negada', null, null, null, 'negada']);
ok('Saída após a meia-noite pertence ao turno iniciado ontem (escala noturna)', !saidaNoite.duplicada && (await um('select data_local::text d from meu_ponto($1,$2::date,$3::date) where tipo=$4', [noc, ontemB, hoje, 'saida'])).d === ontemB);
// Diurno com marcação ímpar ontem (antes das 18h) → nova marcação é de hoje
await como(donoA);
const diu = (await um("select salvar_funcionario(null,$1,'Dora Diurna','Caixa',($2::date - 300),'clt',1900,5,true,null,null) id", [A, hoje])).id;
await um(JOR, [diu, comp, JSON.stringify(ESC), 10, 60, 360, 'conferir']);
const tD = token();
await um(CONV, [diu, 'dora.portal@local.test', hash(tD)]);
await admin();
const uDora = await usuario('dora.portal@local.test');
await c.query("insert into marcacoes_ponto (id, id_empresa, id_funcionario, id_usuario, tipo, registrado_em, data_local, situacao_localizacao, situacao_foto) values ($1,$2,$3,$4,'entrada', ($5::date + time '17:30') at time zone 'America/Sao_Paulo', $5::date,'negada','negada')", [randomUUID(), A, diu, uDora, ontemB]);
await como(uDora);
await c.query('select aceitar_convite_colaborador($1)', [tD]);
const entradaDora = await um(MARC, [randomUUID(), diu, 'entrada', 'negada', null, null, null, 'negada']);
ok('Turno diurno esquecido ontem não "puxa" a marcação de hoje', (await um('select data_local::text d from meu_ponto($1,$2::date,$2::date) where id=$3', [diu, hoje, entradaDora.id]))?.d === hoje);
// Correção com horário do dia seguinte
await como(uBia);
const solN = (await um('select solicitar_correcao_ponto($1,$2,$3::date,$4::time,$5,$6,$7,$8) id', [bia, 'incluir', D.ter, '05:50', 'saida', null, 'Saída do plantão', true])).id;
await como(donoA);
await c.query("select responder_solicitacao_ponto($1,true,null)", [solN]);
const corrN = await um("select (registrado_em at time zone 'America/Sao_Paulo')::text t, data_local::text d from marcacoes_ponto where id_solicitacao=$1", [solN]);
ok('Correção "dia seguinte": horário no dia seguinte, jornada no dia original', corrN.t.startsWith(`${await dataMais(D.ter, 1)} 05:50`) && corrN.d === D.ter);
await admin();
ok('Notificação de correção aprovada vai só para a colaboradora', N((await um("select count(*) n from notificacoes where id_usuario=$1 and titulo='Correção de ponto aprovada'", [uBia])).n) === 1
  && N((await um("select count(*) n from notificacoes where titulo='Correção de ponto aprovada' and id_usuario not in ($1,$2)", [uBia, uDen])).n) === 0);
ok('Dia incompleto apurado gera aviso de pendência (uma vez)', N((await um("select count(*) n from notificacoes where id_usuario=$1 and titulo='Marcação de ponto incompleta'", [uDen])).n) === 1);
await como(uBia);
ok('Colaborador só lê as próprias notificações', N((await um('select count(*) n from notificacoes where id_usuario <> $1', [uBia])).n) === 0);

// ===== Holerite disponível e acesso direto a documentos privados =====
await admin();
const cAtual = (await um("insert into competencias_folha (id_empresa, competencia, status) values ($1, date_trunc('month', $2::date)::date, 'devolvida') returning id", [A, hoje])).id;
const pac = (await um("insert into pacotes_folha (id_empresa, id_competencia, versao, snapshot, responsavel, enviado_por) values ($1,$2,1,'{}','RH Teste',$3) returning id", [A, cAtual, donoA])).id;
const dev = (await um("insert into devolucoes_folha (id_empresa, id_competencia, id_pacote, numero, situacao) values ($1,$2,$3,1,'enviada') returning id", [A, cAtual, pac])).id;
const cam = `${A}/${randomUUID()}.pdf`;
const camB = `${A}/${randomUUID()}.pdf`;
await c.query("insert into documentos_folha (id_empresa, id_competencia, categoria, id_funcionario, id_devolucao, caminho, nome_arquivo, tipo_mime) values ($1,$2,'holerite',$3,$4,$5,'h.pdf','application/pdf'), ($1,$2,'holerite',$6,$4,$7,'h2.pdf','application/pdf')", [A, cAtual, den, dev, cam, bia, camB]);
await como(uDen);
ok('Holerite invisível antes da aprovação', (await c.query('select * from meus_holerites($1)', [den])).rows.length === 0 && !(await um('select colaborador_pode_ler_holerite($1) v', [cam])).v);
await admin();
await c.query("update competencias_folha set status='aprovada' where id=$1", [cAtual]);
await como(uDen);
ok('Aprovada: colaborador vê e baixa só o próprio holerite', (await c.query('select * from meus_holerites($1)', [den])).rows.length === 1
  && (await um('select colaborador_pode_ler_holerite($1) v', [cam])).v && !(await um('select colaborador_pode_ler_holerite($1) v', [camB])).v);
await admin();
ok('Aviso "Holerite disponível" para cada dono do holerite', N((await um("select count(*) n from notificacoes where id_usuario=$1 and titulo='Holerite disponível'", [uDen])).n) === 1
  && N((await um("select count(*) n from notificacoes where id_usuario=$1 and titulo='Holerite disponível'", [uBia])).n) === 1);
await como(uDen);
ok('Colaborador não lê documentos da folha diretamente', N((await um('select count(*) n from documentos_folha')).n) === 0);
await como(uAna);
ok('Colega não lê holerite alheio', !(await um('select colaborador_pode_ler_holerite($1) v', [cam])).v);

// ===== Retenção e expurgo de fotos =====
await admin();
const fotoVelha = randomUUID();
const camFoto = `${A}/${den}/${fotoVelha}.jpg`;
await c.query("insert into marcacoes_ponto (id, id_empresa, id_funcionario, id_usuario, tipo, registrado_em, data_local, situacao_localizacao, situacao_foto, foto_caminho) values ($1,$2,$3,$4,'entrada', now() - interval '75 days', (now() - interval '75 days')::date,'negada','capturada',$5)", [fotoVelha, A, den, uDen, camFoto]);
const elegiveis = async () => (await c.query('select * from fotos_elegiveis_expurgo() where id_marcacao=$1', [fotoVelha])).rows.length;
ok('Sem política definida: nada é elegível (exclusão desligada por padrão)', (await elegiveis()) === 0);
await como(donoA);
const POL = 'select salvar_politica_retencao_ponto($1,$2,$3,$4)';
await falha('Ativar exclusão exige prazo e fundamento', POL, [A, 30, true, ''], 'fundamento');
await falha('Prazo fora de 30–3650 dias recusado', POL, [A, 10, false, null], 'entre 30 e 3650');
await como(uDen);
await falha('Colaborador não define retenção', POL, [A, 30, false, null], 'Sem permissão');
await como(donoA);
await c.query(POL, [A, 30, false, null]);
await admin();
ok('Prazo definido mas exclusão desativada: nada é elegível', (await elegiveis()) === 0);
await como(donoA);
await c.query(POL, [A, 30, true, 'Parecer jurídico nº 12/2026 (teste local)']);
const ret = (await um("select criar_retencao_legal_ponto($1,$2,'Processo trabalhista 0001 (teste)') id", [A, den])).id;
await admin();
ok('Retenção legal do funcionário preserva a foto', (await elegiveis()) === 0);
await como(donoA);
await c.query('select encerrar_retencao_legal_ponto($1)', [ret]);
await como(uDen);
await falha('Usuário não executa o expurgo', 'select iniciar_expurgo_fotos_ponto(10)', [], 'permission denied');
await admin();
ok('Encerrada a retenção: foto vencida fica elegível', (await elegiveis()) === 1);
const ex1 = (await um('select iniciar_expurgo_fotos_ponto(10) j')).j;
ok('Executor reserva só fotos elegíveis', ex1.itens.some((x) => x.id_marcacao === fotoVelha) && ex1.itens.every((x) => x.caminho.startsWith(`${A}/`)));
await c.query('select concluir_expurgo_foto_ponto($1,$2,false,$3)', [ex1.id_execucao, fotoVelha, 'Storage indisponível']);
ok('Falha registrada para nova tentativa (foto mantida)', N((await um('select tentativas from expurgos_fotos_ponto where id_marcacao=$1', [fotoVelha])).tentativas) === 1
  && (await um('select foto_caminho from marcacoes_ponto where id=$1', [fotoVelha])).foto_caminho === camFoto);
const ex2 = (await um('select iniciar_expurgo_fotos_ponto(10) j')).j;
await c.query('select concluir_expurgo_foto_ponto($1,$2,true,null)', [ex2.id_execucao, fotoVelha]);
await c.query('select concluir_expurgo_foto_ponto($1,$2,true,null)', [ex2.id_execucao, fotoVelha]);
await c.query('select finalizar_expurgo_fotos_ponto($1)', [ex2.id_execucao]);
const mf = await um('select foto_caminho, situacao_foto, foto_expurgada_em, tipo, registrado_em from marcacoes_ponto where id=$1', [fotoVelha]);
ok('Expurgo: referência da foto removida, marcação preservada', mf.foto_caminho === null && mf.situacao_foto === 'expurgada' && mf.foto_expurgada_em !== null && mf.tipo === 'entrada');
ok('Expurgo idempotente e auditado (execução concluída, 1 excluída)', N((await um('select excluidas from execucoes_expurgo_ponto where id=$1', [ex2.id_execucao])).excluidas) === 1
  && (await um('select concluido_em from execucoes_expurgo_ponto where id=$1', [ex2.id_execucao])).concluido_em !== null);
ok('Histórico da política de retenção registrado', N((await um("select count(*) n from historico_ponto where id_empresa=$1 and acao in ('retencao_fotos','retencao_legal_criada','retencao_legal_encerrada')", [A])).n) === 4);
await falha('Ninguém apaga a foto de uma marcação fora do expurgo', "update marcacoes_ponto set foto_caminho=null, situacao_foto='expurgada', foto_expurgada_em=now() where id=$1", [m1], 'não podem ser alterados');
await como(donoB);
ok('Outra empresa não vê a política nem os expurgos', N((await um('select count(*) n from politicas_retencao_ponto')).n) === 0 && N((await um('select count(*) n from expurgos_fotos_ponto')).n) === 0);
await como(donoA);

// ===== Revogação e desligamento =====
await falha('Revogar acesso exige motivo', 'select revogar_acesso_colaborador($1,$2)', [ana, ''], 'motivo');
await c.query("select revogar_acesso_colaborador($1,'Pedido da colaboradora')", [ana]);
await como(uAna);
ok('Acesso revogado: portal vazio', (await c.query('select * from portal_colaborador()')).rows.length === 0);
await falha('Acesso revogado: não marca ponto', MARC, [randomUUID(), ana, 'entrada', 'negada', null, null, null, 'negada'], 'Acesso não autorizado');
await como(donoA);
await c.query('select desligar_funcionario($1,$2::date)', [den, hoje]);
await como(uDen);
const pos = (await c.query('select * from portal_colaborador()')).rows;
ok('Desligamento na empresa A revoga só o vínculo A (B continua)', pos.length === 1 && pos[0].id_empresa === B);
await falha('Desligado não registra ponto na empresa A', MARC, [randomUUID(), den, 'entrada', 'negada', null, null, null, 'negada'], 'Acesso não autorizado');
await falha('Desligado não lê o próprio espelho da empresa A', 'select minha_jornada($1,$2::date)', [den, comp], 'Acesso não autorizado');
ok('Foto da empresa A deixa de ser legível pelo desligado', !(await um('select pode_ler_foto_ponto($1) v', [caminho])).v);
await admin();
ok('Desligamento registrado com motivo', (await um('select motivo_revogacao from acessos_colaborador where id_funcionario=$1 order by ativado_em desc limit 1', [den])).motivo_revogacao === 'Desligamento');

await c.query('rollback');
await c.end();
const falhas = r.filter((x) => !x.ok);
for (const x of r) console.log(`${x.ok ? '✅' : '❌'} ${x.n}${x.ok ? '' : ` — ${x.x}`}`);
console.log(`\n${r.length - falhas.length}/${r.length} verificações OK`);
process.exit(falhas.length ? 1 : 0);
