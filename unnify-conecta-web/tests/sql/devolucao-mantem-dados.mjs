// Devolução do contador preservada quando a folha volta a ele (migration 059) — PostgreSQL LOCAL; tudo desfeito no final (ROLLBACK).
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
const N = (v) => Number(v);

await c.query('begin');
await admin();
const hoje = (await um('select public.hoje_brasil()::text d')).d;
const comp = `${hoje.slice(0, 7)}-01`;
const venc = (await um("select ($1::date + interval '1 month' + interval '6 days')::date::text d", [comp])).d;
const [dono] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 1")).rows.map((x) => x.id_usuario);
const [cont] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 1")).rows.map((x) => x.id_usuario);
const A = (await um("insert into empresas (cnpj, razao_social, email_comercial, cidade, estado, tipo_empresa, status_registro, criado_por) values ('59.595.000/0001-59','Devolução 59','d@local.test','Palmas','TO','comum','ATIVA',$1) returning id", [dono])).id;
await c.query("insert into usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo) values ($1,$2,'dono',true)", [dono, A]);
await c.query("insert into vinculos_contabeis (id_empresa, id_contador, funcao, status, permissoes, origem, aprovado_em) values ($1,$2,'principal','ativo','{ver_folha,processar_folha}','empresa',now())", [A, cont]);
const objeto = async () => { const cam = `${A}/${randomUUID()}.pdf`; await c.query("insert into storage.objects (bucket_id, name, owner_id, metadata) values ('folha', $1, $2, $3)", [cam, cont, JSON.stringify({ mimetype: 'application/pdf', size: 2048 })]); return cam; };

await como(dono);
await c.query('select inicializar_categorias_financeiras($1)', [A]);
const f1 = (await um("select salvar_funcionario(null,$1,'Antonio Marques','Técnico',($2::date - 200),'clt',1621,5,true,null,null) id", [A, hoje])).id;
const f2 = (await um("select salvar_funcionario(null,$1,'Fernando Alves','Auxiliar',($2::date - 200),'clt',1621,5,true,null,null) id", [A, hoje])).id;
const CONF = 'select confirmar_conferencia_folha($1,$2::date,$3,true)';
await c.query(CONF, [A, comp, f1]); await c.query(CONF, [A, comp, f2]);
await c.query("select enviar_folha_contador($1,$2::date,'RH Teste',null,true)", [A, comp]);
const idComp = (await um('select id from competencias_folha where id_empresa=$1 and competencia=$2::date', [A, comp])).id;
const devolucoes = async () => (await c.query('select numero, situacao, numero_origem, enviada_em is not null enviada, id from devolucoes_folha where id_competencia=$1 order by numero', [idComp])).rows;
const conteudo = async (id) => ({
  liquidos: N((await um("select count(*) n from valores_folha where id_devolucao=$1 and tipo='liquido'", [id])).n),
  encargos: N((await um("select count(*) n from valores_folha where id_devolucao=$1 and tipo='encargo'", [id])).n),
  holerites: N((await um("select count(*) n from documentos_folha where id_devolucao=$1 and categoria='holerite' and excluido_em is null", [id])).n),
  outros: N((await um("select count(*) n from documentos_folha where id_devolucao=$1 and categoria<>'holerite' and excluido_em is null", [id])).n),
});
const preencher = async () => {
  for (const f of [f1, f2]) await c.query("select registrar_documento_devolucao_folha($1,'holerite',$2,$3,'holerite.pdf')", [idComp, f, await objeto()]);
  await c.query("select registrar_documento_devolucao_folha($1,'guia',null,$2,'fgts.pdf')", [idComp, await objeto()]);
  await c.query('select informar_valores_folha($1,$2,$3)', [idComp, JSON.stringify([{ id_funcionario: f1, valor: 2000 }, { id_funcionario: f2, valor: 1500 }]),
    JSON.stringify([{ descricao: 'FGTS', valor: 300, vencimento: venc }])]);
};

// ===== Cenário 1: contador pede correção no meio do processamento; empresa reenvia (versão 2) =====
await como(cont);
await c.query('select iniciar_processamento_folha($1)', [idComp]);
let d = await devolucoes();
ok('Iniciar o processamento já abre o rascunho da devolução', d.length === 1 && d[0].situacao === 'rascunho');
await preencher();
const rasc = d[0].id;
const camRasc = (await um("select caminho from documentos_folha where id_devolucao=$1 and categoria='guia'", [rasc])).caminho;
await c.query('select solicitar_correcao_folha($1,$2,$3)', [idComp, 'Faltou o adicional', JSON.stringify([{ id_funcionario: f1, descricao: 'Lançar adicional' }])]);
await como(dono);
ok('Empresa não vê o rascunho do contador (nem os arquivos dele)', N((await um('select count(*) n from devolucoes_folha where id_competencia=$1', [idComp])).n) === 0
  && N((await um('select count(*) n from valores_folha v join devolucoes_folha d on d.id=v.id_devolucao where d.id_competencia=$1', [idComp])).n) === 0
  && !(await um('select pode_ler_arquivo_folha($1, $2) v', [camRasc, cont])).v);
const pend = (await um("select id from pendencias_folha where id_competencia=$1 and resolvida_em is null limit 1", [idComp])).id;
await c.query("select resolver_pendencia_folha($1,'Adicional lançado')", [pend]);
await c.query(CONF, [A, comp, f1]);
await c.query("select enviar_folha_contador($1,$2::date,'RH Teste','Correção feita',true)", [A, comp]);
await como(dono);
ok('Reenvio da empresa não expõe o rascunho do contador', N((await um('select count(*) n from devolucoes_folha where id_competencia=$1', [idComp])).n) === 0);
await como(cont);
await c.query('select iniciar_processamento_folha($1)', [idComp]);
d = await devolucoes();
const c1 = await conteudo(d[0].id);
ok('Versão 2: o contador continua com o que já tinha preenchido (mesmo rascunho, ligado à nova versão)', d.length === 1 && d[0].id === rasc && d[0].situacao === 'rascunho'
  && c1.liquidos === 2 && c1.encargos === 1 && c1.holerites === 2 && c1.outros === 1
  && (await um("select id_pacote = (select id from pacotes_folha where id_competencia=$1 and situacao='vigente') v from devolucoes_folha where id=$2", [idComp, rasc])).v);

// ===== Cenário 2: devolve; empresa pede revisão; contador recomeça com tudo preenchido =====
const dev1 = (await um("select concluir_devolucao_folha($1,'Processada') id", [idComp])).id;
await como(dono);
ok('Empresa vê a devolução enviada', N((await um('select count(*) n from devolucoes_folha where id_competencia=$1', [idComp])).n) === 1);
await c.query("select solicitar_revisao_folha($1,$2,'Líquido do Fernando diverge')", [idComp, dev1]);
await como(cont);
await c.query('select iniciar_processamento_folha($1)', [idComp]);
d = await devolucoes();
const nova = d.find((x) => x.situacao === 'rascunho');
const c2 = await conteudo(nova.id);
ok('Revisão: nova devolução já abre com líquidos, encargos, holerites e guia da anterior', c2.liquidos === 2 && c2.encargos === 1 && c2.holerites === 2 && c2.outros === 1);
ok('Indica a origem (devolução nº anterior) e a anterior fica "substituida"', nova.numero_origem === d.find((x) => x.id === dev1).numero && d.find((x) => x.id === dev1).situacao === 'substituida');
const painelCont = (await um('select painel_folha_pagamento($1,$2::date) p', [A, comp])).p;
ok('Painel do contador mostra o rascunho com a origem', painelCont.devolucao.id === nova.id && painelCont.devolucao.numero_origem === nova.numero_origem);
await c.query('select informar_valores_folha($1,$2,$3)', [idComp, JSON.stringify([{ id_funcionario: f1, valor: 2000 }, { id_funcionario: f2, valor: 1600 }]), JSON.stringify([{ descricao: 'FGTS', valor: 300, vencimento: venc }])]);
const dev2 = (await um("select concluir_devolucao_folha($1,null) id", [idComp])).id;
ok('Devolução revisada concluída sem reenviar arquivos (concluir exige holerite e líquido de todos)', !!dev2);
const arquivos = N((await um("select count(*) n from storage.objects where bucket_id='folha' and name like $1", [`${A}/%`])).n);
ok('Arquivos não duplicados no Storage (3 enviados, mesmos arquivos reaproveitados)', arquivos === 3);
await como(dono);
ok('Empresa vê só as devoluções enviadas (a 1ª, substituída, e a revisada)', N((await um('select count(*) n from devolucoes_folha where id_competencia=$1', [idComp])).n) === 2);
await c.query('select aprovar_folha($1,$2)', [idComp, dev2]);
ok('Aprovação segue funcionando com a devolução revisada', (await um('select status from competencias_folha where id=$1', [idComp])).status === 'aprovada');

// ===== Abrir rascunho em competência já em processamento (iniciada antes da 059) =====
await como(cont);
await c.query('savepoint s');
const nOk = await c.query('select abrir_devolucao_folha($1)', [idComp]).then(() => false, (e) => e.message.includes('etapa'));
await c.query('rollback to savepoint s');
ok('abrir_devolucao_folha só vale em processamento', nOk);

await c.query('rollback');
await c.end();
const falhas = r.filter((x) => !x.ok);
for (const x of r) console.log(`${x.ok ? '✅' : '❌'} ${x.n}${x.ok ? '' : ` — ${x.x}`}`);
console.log(`\n${r.length - falhas.length}/${r.length} verificações OK`);
process.exit(falhas.length ? 1 : 0);
