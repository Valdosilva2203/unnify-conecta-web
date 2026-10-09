# MIGRATION 001: VALIDAÇÃO PRÉ-EXECUÇÃO

**Status:** ⏸️ AGUARDANDO APROVAÇÃO PARA EXECUTAR  
**Ambiente:** Supabase DEV (bvwfoafkqjquxcbijffj)  
**Data Criação:** 2026-10-09

---

## 📋 O QUE SERÁ EXECUTADO

### LAYER 1: Colunas em `public.profiles`
- ✅ `global_role` (TEXT, DEFAULT 'user')
- ✅ `mfa_enabled` (BOOLEAN, DEFAULT FALSE)
- ✅ `status` (TEXT, DEFAULT 'active')
- ✅ `last_role_change` (TIMESTAMP)
- ✅ 4 índices para performance

### LAYER 2: Auditoria
- ✅ Tabela `public.audit_logs` (INSERT-only)
- ✅ 4 índices em audit_logs
- ✅ RLS policies em audit_logs
- ✅ Revogação de DELETE/UPDATE (segurança)

### LAYER 3: Administração Técnica
- ✅ Schema `admin_operations`
- ✅ Tabela `pending_changes`
- ✅ RLS policies em pending_changes
- ✅ Validação: approver ≠ requester

### FUNÇÕES
- ✅ `is_admin(uuid)` - CORRIGIDA (agora usa global_role)
- ✅ `is_admin_master(uuid)` - NOVA
- ✅ `audit_change()` - NOVA (para registrar manualmente)
- ✅ `trigger_audit_profiles()` - NOVA (trigger automático)

### RLS POLICIES
- ✅ 5 policies em `profiles` (antigas removidas, novas criadas)
- ✅ 3 policies em `audit_logs`
- ✅ 3 policies em `pending_changes`

---

## 🔍 VALIDAÇÕES PRÉ-EXECUÇÃO

### ✅ Checklist de Segurança

```
[ ] 1. Ambiente correto: DEV (bvwfoafkqjquxcbijffj) - NÃO é PROD
[ ] 2. Backup: Supabase DEV está com backup automático ativado
[ ] 3. RLS: Todas as policies têm check (auth.uid() ou global_role)
[ ] 4. Audit: INSERT-only, sem UPDATE/DELETE possível
[ ] 5. Global Role: Default é 'user', nunca 'admin_master'
[ ] 6. MFA: Default é FALSE, não força ainda
[ ] 7. Service Role: Tem acesso total via backend
[ ] 8. Constraint: Approver ≠ Requester em pending_changes
```

### ✅ Checklist de Funcionalidade

```
[ ] 1. global_role valores: 'user', 'admin', 'admin_master'
[ ] 2. status valores: 'active', 'suspended', 'inactive'
[ ] 3. Índices criados para: global_role, mfa_enabled, status, audit queries
[ ] 4. Triggers automáticos: Auditoria de UPDATE/DELETE em profiles
[ ] 5. Funções: is_admin() e is_admin_master() funcionam
[ ] 6. RLS: Admin Master vê tudo, usuários veem só deles
[ ] 7. Audit: Logs imutáveis, não podem ser alterados
```

---

## 🚨 RISCOS MITIGADOS

| Risco | Mitigação | Verificação |
|-------|-----------|------------|
| Admin Master criado automaticamente | DEFAULT 'user', nunca 'admin_master' | ✅ |
| Usuário promove a si mesmo | RLS policy bloqueia mudança de role | ✅ |
| Auditoria adulterada | INSERT-only table, sem UPDATE/DELETE | ✅ |
| Operações não autorizadas | Constraint: approver ≠ requester | ✅ |
| Dados expostos | RLS policies por role | ✅ |
| Sem rastreabilidade | Trigger automático em profiles | ✅ |

---

## 📊 ESTRUTURA DE DADOS APÓS MIGRATION

### Tabela `profiles` (alterada)

```sql
id                    | UUID PRIMARY KEY
user_id               | UUID FK auth.users(id)
email                 | TEXT
full_name             | TEXT
avatar_url            | TEXT
created_at            | TIMESTAMPTZ
updated_at            | TIMESTAMPTZ
global_role           | TEXT ('user'|'admin'|'admin_master') -- NOVO
mfa_enabled           | BOOLEAN (default FALSE) -- NOVO
status                | TEXT ('active'|'suspended'|'inactive') -- NOVO
last_role_change      | TIMESTAMPTZ -- NOVO
```

### Tabela `audit_logs` (nova)

```sql
id              | UUID PRIMARY KEY
user_id         | UUID FK auth.users(id)
action          | TEXT (UPDATE|DELETE|CREATE_USER etc)
table_name      | TEXT
record_id       | UUID (qual record foi alterado)
old_values      | JSONB (snapshot anterior)
new_values      | JSONB (snapshot novo)
ip_address      | INET
user_agent      | TEXT
mfa_verified    | BOOLEAN
timestamp       | TIMESTAMPTZ (NOT NULL, DEFAULT NOW)
change_hash     | BYTEA (para futura verificação de integridade)
```

### Tabela `admin_operations.pending_changes` (nova)

```sql
id                  | UUID PRIMARY KEY
requested_by        | UUID FK auth.users(id)
operation_type      | TEXT (create_user|update_role|alter_schema etc)
description         | TEXT
sql_statement       | TEXT (opcional)
status              | TEXT (pending|approved|rejected|executed|failed)
approved_by         | UUID FK auth.users(id)
executed_by         | UUID FK auth.users(id)
approval_reason     | TEXT
rejection_reason    | TEXT
created_at          | TIMESTAMPTZ
approved_at         | TIMESTAMPTZ
executed_at         | TIMESTAMPTZ
execution_result    | JSONB

CONSTRAINT: requested_by != approved_by (nunca mesma pessoa)
```

---

## 🔐 RLS POLICIES (RESUMO)

### Em `profiles`

| Policy | Usuário | Ação | Condição |
|--------|---------|------|----------|
| Users view own profile | User qualquer | SELECT | `auth.uid() = user_id` |
| Users update own profile | User qualquer | UPDATE | `auth.uid() = user_id` + sem mudar role/status |
| Admin Master views all | Admin Master | SELECT | `global_role = 'admin_master'` |
| Admin Master manages all | Admin Master | UPDATE | `global_role = 'admin_master'` |
| Service role unrestricted | Backend | TUDO | `true` |

### Em `audit_logs`

| Policy | Usuário | Ação | Condição |
|--------|---------|------|----------|
| Users view own | User | SELECT | `user_id = auth.uid()` |
| Admin Master all | Admin Master | SELECT | `global_role = 'admin_master'` |
| Service role | Backend | TUDO | `true` |

### Em `pending_changes`

| Policy | Usuário | Ação | Condição |
|--------|---------|------|----------|
| Users own | User | SELECT | `requested_by = auth.uid() OR approved_by = auth.uid()` |
| Admin Master | Admin Master | SELECT/UPDATE | `global_role = 'admin_master'` |

---

## 🔧 COMO EXECUTAR

### **OPÇÃO 1: Via Supabase Dashboard (Recomendado)**

1. Acesse: https://supabase.com/dashboard/project/bvwfoafkqjquxcbijffj/sql/new
2. Copie TODO o conteúdo de `migrations/001_admin_master_schema.sql`
3. Cole no SQL Editor
4. Revise o SQL (está comentado)
5. Clique **RUN**
6. Espere completar

### **OPÇÃO 2: Via Script Node.js (Este repo)**

```bash
node execute-migration.js --file migrations/001_admin_master_schema.sql --env dev
```

---

## ✅ VALIDAÇÃO PÓS-EXECUÇÃO

Depois que a migration rodar, executar estas queries para confirmar:

```sql
-- 1. Verificar colunas adicionadas
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' 
ORDER BY ordinal_position;

-- 2. Verificar tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' OR table_schema = 'admin_operations'
ORDER BY table_name;

-- 3. Verificar RLS policies em profiles
SELECT policyname, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'profiles';

-- 4. Verificar funções criadas
SELECT proname, pronargs
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND proname IN ('is_admin', 'is_admin_master', 'audit_change', 'trigger_audit_profiles');

-- 5. Verificar índices
SELECT indexname 
FROM pg_indexes 
WHERE tablename IN ('profiles', 'audit_logs');
```

---

## 📝 PRÓXIMAS FASES (após aprovação desta)

### FASE 2: Backend (Node.js)
- [ ] Implementar MFA (TOTP)
- [ ] Criar `/api/admin/bootstrap` (one-time)
- [ ] Criar endpoints `/api/admin/users/*`
- [ ] Implementar `supabase/admin-client.ts` (backend only)

### FASE 3: Frontend (React)
- [ ] Dashboard `/admin/*`
- [ ] Componente de MFA setup
- [ ] Proteção de rotas

### FASE 4: Bootstrap & Testes
- [ ] Executar bootstrap script
- [ ] Testar login + MFA
- [ ] Validar auditoria

---

## ❓ DÚVIDAS ANTES DE EXECUTAR?

Se tiver alguma dúvida sobre o SQL ou a segurança, avise agora antes de rodar.

---

## ✋ PRÓXIMO PASSO

**Deseja que eu execute esta migration no Supabase DEV agora?**

Respostas possíveis:
- ✅ "Sim, executa" - Vou rodar o SQL
- ❓ "Espera, tenho dúvida sobre..." - Esclareço
- 🔄 "Precisa alterar X..." - Faço a mudança no SQL
- ❌ "Cancela" - Paramos aqui

**Aguardando sua autorização.** 🔒
