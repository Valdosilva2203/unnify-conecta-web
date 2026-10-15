// Documentos administrativos (migration 044) no PostgreSQL LOCAL; tudo desfeito no final.
// Acesso exclusivo do Admin Master, pastas, registro com conferência do arquivo, versões imutáveis, concorrência de versão,
// documentos assinados/protegidos, lixeira, auditoria e políticas do storage.
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
async function falha(n, s, p, t) { await c.query('savepoint t'); try { await c.query(s, p); await c.query('release savepoint t'); ok(n, false, 'não falhou'); } catch (e) { await c.query('rollback to savepoint t'); ok(n, !t || e.message.includes(t), e.message.slice(0, 120)); } }
const sha = 'a'.repeat(64);
const arquivo = async (ext = 'pdf', tamanho = 1000) => {
  const nome = `envios/${randomUUID()}.${ext}`;
  await c.query("insert into storage.objects (bucket_id, name, metadata) values ('documentos-admin', $1, jsonb_build_object('size', $2::bigint, 'mimetype', 'application/pdf'))", [nome, tamanho]);
  return nome;
};

await c.query('begin');
await admin();
const master = (await um("select id_usuario from perfis where funcao_global='admin_master' and status='active' limit 1")).id_usuario;
const [dono] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='empresa' limit 1")).rows.map((x) => x.id_usuario);
const [contador] = (await c.query("select id_usuario from perfis where funcao_global='user' and tipo_usuario='contador' limit 1")).rows.map((x) => x.id_usuario);
const outroAdmin = (await um("select id_usuario from perfis where funcao_global <> 'user' and funcao_global <> 'admin_master' limit 1"))?.id_usuario;

// ===== Pastas =====
await como(master);
const pasta = (await um("select salvar_pasta_documentos_admin(null,'Contratos') id")).id;
const pasta2 = (await um("select salvar_pasta_documentos_admin(null,'Recibos') id")).id;
await falha('Pasta com nome repetido recusada (sem diferenciar maiúsculas)', "select salvar_pasta_documentos_admin(null,' contratos ')", [], 'Já existe');
await c.query("select salvar_pasta_documentos_admin($1,'Contratos e aditivos')", [pasta]);
ok('Renomear pasta registra auditoria', (await um("select count(*)::int n from historico_documentos_admin where id_pasta=$1 and acao='pasta_renomeada'", [pasta])).n === 1);

// ===== Registro com conferência do arquivo =====
await admin();
const a1 = await arquivo('pdf', 245000);
const aFalso = await arquivo('pdf', 999);
await como(master);
await falha('Registro recusa arquivo inexistente no storage', "select registrar_documento_admin(null,'X','pdf','application/pdf','envios/' || gen_random_uuid() || '.pdf',10,$1,false)", [sha], 'não encontrado');
await falha('Registro recusa tamanho diferente do arquivo', "select registrar_documento_admin(null,'X','pdf','application/pdf',$1,1000,$2,false)", [aFalso, sha], 'tamanho');
await falha('Nome com caracteres proibidos recusado', "select registrar_documento_admin(null,'a/b','pdf','application/pdf',$1,245000,$2,false)", [a1, sha], '');
const doc = (await um("select registrar_documento_admin($1,'Recibo fornecedor','pdf','application/pdf',$2,245000,$3,false) id", [pasta, a1, sha])).id;
const d0 = await um('select versao_atual, tamanho_atual, protegido from documentos_admin where id=$1', [doc]);
ok('Documento registrado com v1 (original)', d0.versao_atual === 1 && Number(d0.tamanho_atual) === 245000 && !d0.protegido
  && (await um("select origem from versoes_documentos_admin where id_documento=$1 and numero=1", [doc])).origem === 'upload');
await falha('Mesmo arquivo não é registrado duas vezes', "select registrar_documento_admin(null,'Y','pdf','application/pdf',$1,245000,$2,false)", [a1, sha], 'já registrado');

// ===== Versões e concorrência =====
await admin();
const a2 = await arquivo('pdf', 250000);
const a3 = await arquivo('pdf', 251000);
await como(master);
const v2 = (await um("select registrar_versao_documento_admin($1,1,$2,250000,$3,'application/pdf','edicao','Ajuste do valor',false,false) v", [doc, a2, sha])).v;
ok('Edição salva como v2; original preservado', v2 === 2 && (await um('select count(*)::int n from versoes_documentos_admin where id_documento=$1', [doc])).n === 2
  && (await um('select caminho from versoes_documentos_admin where id_documento=$1 and numero=1', [doc])).caminho === a1);
await falha('Salvar a partir de versão desatualizada é recusado (sem sobrescrita concorrente)', "select registrar_versao_documento_admin($1,1,$2,251000,$3,'application/pdf','edicao',null,false,false)", [doc, a3, sha], 'alterado por outra pessoa');
await admin();
await falha('Versão não pode ser alterada', "update versoes_documentos_admin set caminho = caminho where id_documento=$1", [doc], 'não podem ser alteradas');
await falha('Versão não pode ser excluída', 'delete from versoes_documentos_admin where id_documento=$1', [doc], 'não podem ser alteradas');
await como(master);

// ===== Assinado / protegido =====
await admin();
const aAss = await arquivo('pdf', 5000);
const aAss2 = await arquivo('pdf', 5100);
await como(master);
const ass = (await um("select registrar_documento_admin($1,'Contrato assinado','pdf','application/pdf',$2,5000,$3,true) id", [pasta, aAss, sha])).id;
ok('PDF assinado entra protegido', (await um('select protegido, assinado from documentos_admin where id=$1', [ass])).protegido);
await falha('Nova versão de assinado exige confirmação', "select registrar_versao_documento_admin($1,1,$2,5100,$3,'application/pdf','edicao',null,false,false)", [ass, aAss2, sha], 'invalidar a assinatura');
await falha('Não remove a proteção de PDF assinado', "select atualizar_documento_admin($1,'Contrato assinado',$2,false)", [ass, pasta], 'continua protegido');
ok('Com confirmação, cria nova versão e registra que a base era assinada', (await um("select registrar_versao_documento_admin($1,1,$2,5100,$3,'application/pdf','edicao',null,false,true) v", [ass, aAss2, sha])).v === 2
  && (await um("select dados from historico_documentos_admin where id_documento=$1 and acao='nova_versao'", [ass])).dados.base_assinada === true);

// ===== Renomear, mover, buscar, lixeira =====
await c.query("select atualizar_documento_admin($1,'Recibo fornecedor 2026',$2,false)", [doc, pasta2]);
ok('Renomear e mover registram auditoria', (await um("select count(*)::int n from historico_documentos_admin where id_documento=$1 and acao in ('renomeado','movido')", [doc])).n === 2);
ok('Busca por nome e filtro por pasta', (await c.query("select * from buscar_documentos_admin($1,'fornecedor',null,'nome',false,10,0)", [pasta2])).rows.length === 1
  && (await c.query("select * from buscar_documentos_admin($1,null,null,'recentes',false,10,0)", [pasta])).rows.length === 1);
ok('Busca pela observação da versão', (await c.query("select * from buscar_documentos_admin(null,'Ajuste do valor',null,'recentes',false,10,0)")).rows.length === 1);
await falha('Não exclui pasta com documentos', 'select excluir_pasta_documentos_admin($1)', [pasta2], 'não está vazia');
await c.query('select excluir_documento_admin($1,false)', [doc]);
ok('Excluir vai para a lixeira (versões preservadas)', (await c.query("select * from buscar_documentos_admin(null,null,null,'recentes',true,10,0)")).rows.some((x) => x.id === doc)
  && (await um('select count(*)::int n from versoes_documentos_admin where id_documento=$1', [doc])).n === 2);
await falha('Sem nova versão na lixeira', "select registrar_versao_documento_admin($1,2,$2,251000,$3,'application/pdf','edicao',null,false,false)", [doc, a3, sha], 'Restaure');
await c.query('select excluir_documento_admin($1,true)', [doc]);
ok('Restaurar volta à lista', (await c.query("select * from buscar_documentos_admin(null,null,null,'recentes',false,10,0)")).rows.some((x) => x.id === doc));
await c.query('select registrar_download_documento_admin($1,1)', [doc]);
ok('Download auditado', (await um("select count(*)::int n from historico_documentos_admin where id_documento=$1 and acao='download'", [doc])).n === 1);
const res = (await um('select resumo_documentos_admin() r')).r;
ok('Resumo: 2 documentos, 2 pastas, bytes de todas as versões', res.documentos === 2 && res.pastas === 2 && Number(res.bytes) === 245000 + 250000 + 5000 + 5100 && res.versoes === 4, JSON.stringify(res));

// ===== Storage =====
await c.query("savepoint s1");
let enviou = true;
try { await c.query("insert into storage.objects (bucket_id, name, metadata) values ('documentos-admin', $1, '{}')", [`envios/${randomUUID()}.pdf`]); } catch { enviou = false; }
await c.query('rollback to savepoint s1');
ok('Storage: Admin Master envia em envios/', enviou);
await falha('Storage: caminho fora do padrão recusado', "insert into storage.objects (bucket_id, name, metadata) values ('documentos-admin', 'outra/coisa.pdf', '{}')", [], 'row-level security');
// A API do Storage libera a remoção (storage.allow_delete_query); a política RLS continua decidindo
await c.query("select set_config('storage.allow_delete_query','true',false)");
const apagou = (await c.query("delete from storage.objects where bucket_id='documentos-admin' and name=$1 returning name", [a1])).rows.length;
ok('Storage: arquivo registrado não pode ser apagado', apagou === 0 && (await um("select count(*)::int n from storage.objects where name=$1", [a1])).n === 1);
await admin();
const solto = await arquivo('pdf', 10);
await como(master);
ok('Storage: envio recusado (não registrado) pode ser descartado', (await c.query("delete from storage.objects where bucket_id='documentos-admin' and name=$1 returning name", [solto])).rows.length === 1);
ok('Storage: Admin Master lê os arquivos', (await c.query("select 1 from storage.objects where bucket_id='documentos-admin'")).rows.length > 0);

// ===== Acesso negado a quem não é Admin Master =====
for (const [rot, id] of [['Empresário', dono], ['Contador', contador], ...(outroAdmin ? [['Outro perfil administrativo', outroAdmin]] : [])]) {
  await como(id);
  await falha(`${rot}: não lista documentos`, "select * from buscar_documentos_admin()", [], 'Admin Master');
  await falha(`${rot}: não cria pasta`, "select salvar_pasta_documentos_admin(null,'Invasão')", [], 'Admin Master');
  await falha(`${rot}: não cria versão`, "select registrar_versao_documento_admin($1,2,'envios/x.pdf',1,$2,'application/pdf','edicao',null,false,true)", [doc, sha], 'Admin Master');
  ok(`${rot}: RLS não mostra tabelas nem arquivos`, (await c.query("select 1 from documentos_admin union all select 1 from versoes_documentos_admin union all select 1 from storage.objects where bucket_id='documentos-admin'")).rows.length === 0);
  await falha(`${rot}: não envia arquivo`, "insert into storage.objects (bucket_id, name, metadata) values ('documentos-admin', $1, '{}')", [`envios/${randomUUID()}.pdf`], 'row-level security');
}
await admin();
await c.query("update perfis set status='inactive' where id_usuario=$1", [master]);
await como(master);
await falha('Admin Master inativo perde o acesso', 'select resumo_documentos_admin()', [], 'Admin Master');
await admin();
ok('Anônimo sem execução', !(await um("select has_function_privilege('anon','public.buscar_documentos_admin(uuid,text,text,text,boolean,integer,integer)','EXECUTE') p")).p);
ok('Sem escrita direta nas tabelas', !(await um("select has_table_privilege('authenticated','public.documentos_admin','INSERT') p")).p && !(await um("select has_table_privilege('authenticated','public.versoes_documentos_admin','INSERT') p")).p);

await c.query('rollback');
await c.end();
let f = 0;
for (const x of r) { if (!x.ok) f++; console.log(`${x.ok ? '✅' : '❌'} ${x.n}${x.ok ? '' : ` — ${x.x}`}`); }
console.log(`\n${r.length - f}/${r.length} aprovados`);
process.exit(f ? 1 : 0);
