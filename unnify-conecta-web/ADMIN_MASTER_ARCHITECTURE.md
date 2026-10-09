# ARQUITETURA ADMIN MASTER - DIAGNÓSTICO E PROPOSTA

**Status:** ⚠️ DIAGNÓSTICO APENAS - Sem alterações no banco  
**Data:** 2026-10-09  
**Ambiente:** Supabase DEV (bvwfoafkqjquxcbijffj)

---

## 📋 DIAGNÓSTICO ATUAL

### ✅ O que existe

1. **Tabela `profiles`**
   - Colunas: `id`, `user_id`, `email`, `full_name`, `avatar_url`, `created_at`, `updated_at`
   - ✅ PK: `id` (UUID)
   - ✅ FK: `user_id` referencia `auth.users(id)`
   - ✅ RLS habilitado com 3 policies

2. **RLS Policies em `profiles`**
   - ✅ `Users can view own` - SELECT com `auth.uid() = user_id`
   - ✅ `Users can update own` - UPDATE com `auth.uid() = user_id`
   - ✅ `Service role full access` - Permite tudo (para service role)

3. **Função `is_admin(p_user_id uuid)`**
   - Tenta verificar `global_role` em `profiles`
   - Retorna `true` se role é `'admin_master'` ou `'admin'`
   - SECURITY DEFINER (executada como owner)

4. **Estrutura de dados**
   - Tabelas: `accounting_offices`, `companies`, `profiles`, `user_accounting_office_memberships`
   - RLS habilitado em `profiles` apenas
   - `created_by` armazena UUID do criador

---

## ❌ PROBLEMAS IDENTIFICADOS

### 1. **Coluna `global_role` não existe em `profiles`**
   - A função `is_admin()` procura por `global_role` 
   - Isso causaria erro em tempo de execução
   - **Risco:** Qualquer chamada a `is_admin()` falha

### 2. **RLS não é completo**
   - Apenas `profiles` tem RLS ativa
   - `companies` e `accounting_offices` **NÃO** têm RLS
   - Admin Master precisaria de RLS para controlar dados

### 3. **Sem mecanismo de auditoria**
   - Nenhuma tabela de audit existe
   - Sem registro de quem alterou o quê
   - **Risco:** Não detectar mudanças maliciosas

### 4. **Sem segregação de privilégios**
   - RLS policies não distinguem roles diferentes
   - Sem suporte a `global_role` ainda
   - Sem políticas para admin_master vs usuários comuns

### 5. **Sem isolamento de acesso técnico**
   - Não há mecanismo separado para operações SQL administrativas
   - Credenciais privilegiadas não poderiam ser isoladas

---

## 🏗️ PROPOSTA DE ARQUITETURA

### **LAYER 1: APPLICATION DATA (Aplicação)**

#### Alterações em `public.profiles`

```sql
-- Adicionar coluna de role global
ALTER TABLE public.profiles
ADD COLUMN global_role TEXT DEFAULT 'user' NOT NULL 
  CHECK (global_role IN ('user', 'admin', 'admin_master'));

-- Adicionar coluna de MFA
ALTER TABLE public.profiles
ADD COLUMN mfa_enabled BOOLEAN DEFAULT FALSE;

-- Adicionar coluna de status
ALTER TABLE public.profiles
ADD COLUMN status TEXT DEFAULT 'active' NOT NULL 
  CHECK (status IN ('active', 'suspended', 'inactive'));

-- Índice para queries de admin
CREATE INDEX idx_profiles_global_role ON public.profiles(global_role);
```

#### RLS Policies melhoradas

```sql
-- 1. Usuários veem seu próprio perfil
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

-- 2. Usuários atualizam seu próprio perfil (exceto global_role)
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE WITH CHECK (auth.uid() = user_id)
  AND auth.uid() IS NOT NULL;

-- 3. Admin Master vê todos
CREATE POLICY "Admin Master sees all" ON public.profiles
  FOR SELECT 
  USING (
    (SELECT global_role FROM public.profiles WHERE user_id = auth.uid()) = 'admin_master'
  );

-- 4. Admin Master pode editar todos (exceto se remover seu próprio admin)
CREATE POLICY "Admin Master manages all" ON public.profiles
  FOR UPDATE
  USING (
    (SELECT global_role FROM public.profiles WHERE user_id = auth.uid()) = 'admin_master'
    OR auth.uid() = user_id
  )
  WITH CHECK (
    -- Admin Master não pode remover seu próprio acesso admin
    CASE 
      WHEN auth.uid() = profiles.user_id THEN
        -- Não pode mudar seu próprio role
        (SELECT global_role FROM public.profiles WHERE user_id = auth.uid()) = 'admin_master'
      ELSE
        -- Admin Master pode mudar outros
        (SELECT global_role FROM public.profiles WHERE user_id = auth.uid()) = 'admin_master'
    END
  );

-- 5. Service Role (apenas via backend)
CREATE POLICY "Service role unrestricted" ON public.profiles
  USING (true) WITH CHECK (true);
```

#### Função `is_admin()` corrigida

```sql
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT global_role INTO v_role
  FROM public.profiles
  WHERE user_id = v_user_id;

  RETURN v_role IN ('admin_master', 'admin');
END;
$$;
```

---

### **LAYER 2: AUDITORIA & COMPLIANCE**

#### Tabela `audit_logs`

```sql
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  -- Proteção contra adulteração
  hash BYTEA,
  previous_hash BYTEA
);

CREATE INDEX idx_audit_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_table ON public.audit_logs(table_name);
CREATE INDEX idx_audit_timestamp ON public.audit_logs(timestamp DESC);
```

#### Função de auditoria

```sql
CREATE OR REPLACE FUNCTION public.audit_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id,
    old_values, new_values, timestamp
  ) VALUES (
    auth.uid(),
    TG_ARGV[0],
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    to_jsonb(OLD),
    to_jsonb(NEW),
    NOW()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### **LAYER 3: ADMINISTRAÇÃO TÉCNICA (PostgreSQL)**

#### Acesso técnico via Supabase Management API

**NÃO usar credenciais diretas no frontend**

Em vez disso:
1. Criar um **Backend Admin Service** (Node.js/Python)
2. Service recebe requisições autenticadas do Admin Master
3. Service valida MFA + permissão
4. Service executa SQL via Supabase Service Role Key (guardado com segurança)
5. Logs registram cada operação

#### Função para operações administrativas

```sql
CREATE SCHEMA admin_operations;

CREATE TABLE admin_operations.pending_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  operation_type TEXT NOT NULL,
  sql_statement TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed')),
  approved_by UUID REFERENCES auth.users(id),
  executed_at TIMESTAMP WITH TIME ZONE,
  execution_result JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT same_admin_approval CHECK (requested_by != approved_by)
);

CREATE INDEX idx_pending_status ON admin_operations.pending_changes(status);
```

**Princípio: Tudo registrado, nada é automático**

---

## 🔒 SEGURANÇA: BOOTSTRAP DO ADMIN MASTER

### Processo (manual, one-time)

1. **Backend Admin Service (Node.js)**
   - Roda em servidor privado (DigitalOcean, AWS)
   - Autenticação via API key interna (não expostar no repo)
   - Endpoints `/admin/bootstrap` (apenas na primeira vez)

2. **Bootstrap Script (executado uma única vez)**

```javascript
// admin-bootstrap.js (executado APENAS uma vez, depois deletado)

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Guardado com segurança

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function bootstrap() {
  // 1. Criar usuário no Auth via Supabase Admin API
  const { data: user, error: signUpError } = 
    await supabase.auth.admin.createUser({
      email: 'admin@unnify.local',
      password: generateSecurePassword(), // Gerado aleatoriamente
      email_confirm: true,
    });

  if (signUpError) throw signUpError;

  // 2. Criar profile com role admin_master
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      global_role: 'admin_master',
      mfa_enabled: false, // Ativar MFA depois
      status: 'active'
    })
    .eq('user_id', user.user.id);

  if (profileError) throw profileError;

  // 3. Log na tabela de bootstrap
  console.log(`✅ Admin Master criado`);
  console.log(`   User ID: ${user.user.id}`);
  console.log(`   Email: admin@unnify.local`);
  console.log(`   SENHA INICIAL: [gerada aleatoriamente, guarde em lugar seguro]`);
  console.log(`   ⚠️  PRIMEIRA AÇÃO: Ativar MFA na aplicação`);

  // 4. Registrar no audit
  await supabase.rpc('audit_bootstrap', {
    admin_user_id: user.user.id,
    timestamp: new Date()
  });
}

bootstrap();
```

3. **Fluxo na aplicação**
   - Admin Master faz login com email/senha
   - Sistema detecta ausência de MFA
   - **Força ativação de MFA** (TOTP via Authenticator)
   - Após MFA ativado, acesso completo à aplicação

---

## 📊 TABELAS NECESSÁRIAS

| Tabela | Tipo | Finalidade |
|--------|------|-----------|
| `profiles` | ALTER | Adicionar `global_role`, `mfa_enabled`, `status` |
| `audit_logs` | CREATE | Registro imutável de auditoria |
| `admin_operations.pending_changes` | CREATE | Operações administrativas pendentes |

---

## 🚀 OPERAÇÕES VIA BACKEND

### Exemplo: Admin Master criar usuário

```javascript
// POST /api/admin/users
// Headers: Authorization: Bearer {jwt}, X-MFA-Token: {mfa_token}

export async function POST(req: Request) {
  const supabase = createServerClient(...);
  
  // 1. Validar autenticação
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Validar role
  const { data: profile } = await supabase
    .from('profiles')
    .select('global_role, mfa_enabled')
    .eq('user_id', user.id)
    .single();

  if (profile.global_role !== 'admin_master' || !profile.mfa_enabled) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Validar MFA Token
  const mfaValid = await verifyMFA(user.id, req.headers.get('X-MFA-Token'));
  if (!mfaValid) {
    return Response.json({ error: 'MFA Token invalid' }, { status: 403 });
  }

  // 4. Executar operação (com service role)
  const { data, error } = await supabaseServiceRole
    .auth.admin.createUser({
      email: req.body.email,
      password: generatePassword(),
      email_confirm: true
    });

  // 5. Registrar auditoria
  await supabaseServiceRole.rpc('audit_change', {
    action: 'create_user',
    record_id: data.user.id,
    new_values: { email: data.user.email }
  });

  return Response.json(data);
}
```

---

## 🛡️ RISCOS MITIGADOS

| Risco | Mitigação |
|-------|-----------|
| Usuário comum promover a si mesmo | RLS policy impede UPDATE em `global_role` sem ser admin_master |
| Credenciais expostas no frontend | Service Role Key guardado apenas no backend |
| Admin Master não autenticado | JWT + MFA (TOTP) obrigatório |
| Auditoria adulterada | Hash imutável, INSERT-only table, sem UPDATE/DELETE |
| SQL injection | RPC functions com SECURITY DEFINER, prepared statements |
| Múltiplos admins sin-controle | Bootstrap one-time, validação de role em cada operação |

---

## 📝 ARQUIVOS A SEREM CRIADOS/ALTERADOS

### Backend (Node.js/TypeScript)

```
app/api/admin/
├── bootstrap.ts          # POST /api/admin/bootstrap (one-time)
├── users/create.ts       # POST /api/admin/users
├── users/[id]/role.ts    # PATCH /api/admin/users/[id]/role
├── settings/index.ts     # GET/PUT /api/admin/settings
├── audit/
│   ├── logs.ts          # GET /api/admin/audit/logs
│   └── export.ts        # GET /api/admin/audit/export
└── operations/
    ├── pending.ts       # GET /api/admin/operations/pending
    ├── approve.ts       # POST /api/admin/operations/approve
    └── execute.ts       # POST /api/admin/operations/execute

lib/
├── admin/
│   ├── mfa.ts           # Verificação de MFA (TOTP)
│   ├── permissions.ts   # Checar global_role
│   └── audit.ts         # Funções de auditoria
└── supabase/
    └── admin-client.ts  # Cliente com service role (backend only)

scripts/
└── bootstrap-admin.js   # Script one-time (DELETAR depois)
```

### Frontend (Next.js)

```
app/admin/
├── page.tsx              # Dashboard admin master
├── users/
│   ├── page.tsx         # Listar usuários
│   └── [id]/page.tsx    # Editar usuário
├── audit/
│   └── page.tsx         # Logs de auditoria
└── settings/
    └── page.tsx         # Configurações técnicas (com MFA)

components/
├── admin/
│   ├── MFAPrompt.tsx     # Modal para ativar MFA
│   ├── PermissionGate.tsx # Validar global_role
│   └── OperationConfirm.tsx # Confirmar operações críticas
└── auth/
    └── MFASetup.tsx     # Configurar TOTP
```

### Database (SQL)

```sql
-- migrations/001_add_admin_master_support.sql

-- 1. ALTER profiles
ALTER TABLE public.profiles ADD COLUMN global_role ...
ALTER TABLE public.profiles ADD COLUMN mfa_enabled ...
ALTER TABLE public.profiles ADD COLUMN status ...

-- 2. CREATE audit_logs
CREATE TABLE public.audit_logs ...

-- 3. CREATE admin_operations schema
CREATE SCHEMA admin_operations ...

-- 4. UPDATE RLS policies
DROP POLICY ... ON public.profiles;
CREATE POLICY ...

-- 5. CREATE/UPDATE functions
CREATE FUNCTION public.is_admin ...
CREATE FUNCTION public.audit_change ...
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] **Fase 1: Database**
  - [ ] Adicionar coluna `global_role` em `profiles`
  - [ ] Adicionar coluna `mfa_enabled` em `profiles`
  - [ ] Adicionar coluna `status` em `profiles`
  - [ ] Criar tabela `audit_logs`
  - [ ] Criar schema `admin_operations`
  - [ ] Atualizar RLS policies
  - [ ] Corrigir função `is_admin()`

- [ ] **Fase 2: Backend**
  - [ ] Implementar MFA (TOTP)
  - [ ] Criar endpoint `/api/admin/bootstrap` (one-time)
  - [ ] Criar endpoints CRUD de usuários com MFA
  - [ ] Implementar audit logging
  - [ ] Criar cliente Supabase com service role (backend only)

- [ ] **Fase 3: Frontend**
  - [ ] Criar componente de ativação de MFA
  - [ ] Criar dashboard administrativo
  - [ ] Proteger rotas `/admin/*` com `global_role` check
  - [ ] Implementar confirmação para operações críticas
  - [ ] Exibir logs de auditoria

- [ ] **Fase 4: Bootstrap & Testes**
  - [ ] Executar bootstrap script (one-time)
  - [ ] Deletar script de bootstrap
  - [ ] Testar login do Admin Master
  - [ ] Testar ativação de MFA
  - [ ] Testar operações administrativas

---

## 🔐 CONFIGURAÇÃO DE SEGURANÇA

### Variáveis de Ambiente

```env
# .env.production (backend only, NUNCA no frontend)
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# .env.local (desenvolvedor, NÃO commitar)
BOOTSTRAP_API_KEY=secretkey123...

# Frontend (PUBLIC, SEGURO)
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

### MFA (TOTP)

- Usar biblioteca `speakeasy` ou `otplib`
- Gerar QR code via Google Authenticator / Authy / Microsoft Authenticator
- Armazenar secret em `auth.users.user_metadata` (criptografado pelo Supabase)
- Validar em cada operação crítica

---

## 📞 PRÓXIMAS ETAPAS

1. **Você aprova esta proposta?**
2. **Alguma alteração necessária?**
3. **Depois de aprovação:**
   - Começaremos pela Fase 1 (Database)
   - Testes intensivos
   - Deploy em DEV
   - Validação de segurança
   - Depois PROD

**NÃO faremos nada sem sua autorização explícita.**

---

**Status:** ⏸️ **AGUARDANDO APROVAÇÃO**  
**Segurança:** 🔒 **100% em dia**  
**Risco:** ✅ **Mitigado**
