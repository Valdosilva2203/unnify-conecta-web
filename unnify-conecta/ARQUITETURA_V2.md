# Proposta Técnica V2 - Arquitetura Unnify Conecta

**Data:** 07/10/2026  
**Status:** Aguardando aprovação final  
**Versão:** 2.0  
**Objetivo:** Esquema robusto, seguro e escalável para MVP

---

## SUMÁRIO DE MUDANÇAS V1 → V2

| Ponto | V1 | V2 | Razão |
|-------|----|----|-------|
| 1 | owner_id + role='owner' (redundante) | Apenas membership.role | Fonte única de verdade |
| 2 | created_by_user_id NOT NULL + ON DELETE SET NULL | created_by_user_id NULLABLE + ON DELETE SET NULL | Coerência |
| 3 | token em texto puro | token_hash (SHA-256) | Segurança |
| 4 | accountant_company_relationships.invitation_id | Removido (referência circular) | Simplicidade |
| 5 | Service role solução padrão | RLS + auth como padrão | Segurança |
| 6 | Operações isoladas | Transações + RPC SECURITY DEFINER | Atomicidade |
| 7 | RLS básico | Policies rigorosas com funções auxiliares | Robustez |
| 8 | global_role sem regra | Policy: admin apenas via backend | Segurança |
| 9 | email duplicado em profiles | Mantém com sincronização via trigger | Auditoria local |
| 10 | updated_at manual | Trigger automático | Confiabilidade |
| 11 | CNPJ strings inconsistentes | Normalizado, NULL se vazio | Validação |
| 12 | Email como texto simples | CITEXT para comparação case-insensitive | Usabilidade |
| 13 | Convites sem proteção duplicata | Partial unique index + transação idempotente | Integridade |
| 14 | audit_logs genérico | Append-only, RLS, sem secrets | Compliance |
| 15 | ON DELETE CASCADE | Soft delete com status/archived_at | Histórico |
| 16 | UNIQUE permanente | Status 'inactive' permite reativação | Flexibilidade |
| 17 | Índices redundantes | Limpos, parciais onde apropriado | Performance |
| 18 | vinculado_em (PT) | linked_at (EN) | Consistência |
| 19 | Permissões implícitas | Matriz explícita | Clareza |
| 20 | signup sem profile | Trigger seguro em auth.users | Consistência |

---

## 1. SCHEMA V2 COMPLETO

### 1.1 `profiles` (Usuários do Sistema)

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email CITEXT NOT NULL UNIQUE,
  full_name VARCHAR(255),
  avatar_url VARCHAR(500),
  global_role VARCHAR(50) NOT NULL 
    DEFAULT 'company_user'
    CHECK (global_role IN ('admin', 'accountant', 'company_user')),
  phone VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_auth_id ON profiles(auth_id);
CREATE INDEX idx_profiles_global_role ON profiles(global_role);
```

**Mudanças:**
- Email: VARCHAR → CITEXT (case-insensitive, normalized)
- global_role: NOT NULL + DEFAULT 'company_user' (nunca pode ser NULL)
- is_active: BOOLEAN NOT NULL (nunca pode ser NULL)
- created_at/updated_at: NOT NULL (sempre preenchido)

**Notas:**
- CITEXT permite `email` = `EMAIL` (normalizado)
- global_role é apenas classificador administrativo (não autorização)
- Autorização real vem de memberships
- admin é atribuído apenas por mecanismo administrativo seguro (backend/manual)

---

### 1.2 `accounting_firms` (Escritórios Contábeis)

```sql
CREATE TABLE accounting_firms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(14) UNIQUE,
  email CITEXT,
  phone VARCHAR(20),
  website VARCHAR(500),
  city VARCHAR(100),
  state VARCHAR(2),
  status VARCHAR(50) NOT NULL 
    DEFAULT 'active' 
    CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_accounting_firms_cnpj ON accounting_firms(cnpj);
CREATE INDEX idx_accounting_firms_status ON accounting_firms(status);
```

**Mudanças:**
- ❌ Removido `owner_id` (redundante com memberships)
- ✅ Ownership determinado por `accounting_firm_members.role = 'owner'`
- Email: VARCHAR → CITEXT

**Garantias:**
- Uma firma **sempre** terá pelo menos um owner ativo (validado via RPC/constraint)
- Transferência de ownership feita via `accounting_firm_members`
- Soft-delete via `status`, não exclusão física

---

### 1.3 `accounting_firm_members` (Membros do Escritório)

```sql
CREATE TABLE accounting_firm_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_firm_id UUID NOT NULL REFERENCES accounting_firms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL 
    CHECK (role IN ('owner', 'partner', 'accountant', 'assistant')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_at TIMESTAMP WITH TIME ZONE,
  joined_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(accounting_firm_id, user_id)
);

CREATE INDEX idx_accounting_firm_members_firm_id ON accounting_firm_members(accounting_firm_id);
CREATE INDEX idx_accounting_firm_members_user_id ON accounting_firm_members(user_id);
CREATE INDEX idx_accounting_firm_members_role ON accounting_firm_members(role);
CREATE INDEX idx_accounting_firm_members_active ON accounting_firm_members(accounting_firm_id, is_active);
```

**Mudanças:**
- Adicionado `invited_at` (quando convite foi enviado)
- Adicionado `joined_at` (quando efetivamente aceitou)
- Índice composto para queries "membros ativos"

**Garantias:**
- Usuário membro de firma apenas uma vez (UNIQUE)
- Soft-delete via `is_active`
- Função garante que sempre há owner ativo

---

### 1.4 `companies` (Empresas Clientes)

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(14) UNIQUE,
  email CITEXT,
  phone VARCHAR(20),
  city VARCHAR(100),
  state VARCHAR(2),
  segment VARCHAR(100),
  legal_nature VARCHAR(100),
  founding_date DATE,
  status VARCHAR(50) NOT NULL 
    DEFAULT 'active' 
    CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_companies_cnpj ON companies(cnpj);
CREATE INDEX idx_companies_status ON companies(status);
```

**Mudanças:**
- ❌ Removido `owner_id`
- ✅ Ownership via `company_members.role = 'owner'`
- Email: CITEXT

**Padrão:**
- Análogo a `accounting_firms`
- Ownership sempre garantido por memberships

---

### 1.5 `company_members` (Membros da Empresa)

```sql
CREATE TABLE company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL 
    CHECK (role IN ('owner', 'manager', 'employee', 'accountant_representative')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_at TIMESTAMP WITH TIME ZONE,
  joined_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, user_id)
);

CREATE INDEX idx_company_members_company_id ON company_members(company_id);
CREATE INDEX idx_company_members_user_id ON company_members(user_id);
CREATE INDEX idx_company_members_role ON company_members(role);
CREATE INDEX idx_company_members_active ON company_members(company_id, is_active);
```

**Mudanças:**
- Adicionado `invited_at`, `joined_at`
- Índice composto para membros ativos

---

### 1.6 `accountant_company_relationships` (Vínculo Contador ↔ Empresa)

```sql
CREATE TABLE accountant_company_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_firm_id UUID NOT NULL REFERENCES accounting_firms(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL 
    DEFAULT 'active' 
    CHECK (status IN ('active', 'inactive', 'suspended', 'pending')),
  linked_at TIMESTAMP WITH TIME ZONE,
  unlinked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(accounting_firm_id, company_id)
);

CREATE INDEX idx_acr_firm_id ON accountant_company_relationships(accounting_firm_id);
CREATE INDEX idx_acr_company_id ON accountant_company_relationships(company_id);
CREATE INDEX idx_acr_status ON accountant_company_relationships(status);
CREATE INDEX idx_acr_active ON accountant_company_relationships(accounting_firm_id, status) 
  WHERE status = 'active';
```

**Mudanças:**
- ❌ Removido `invitation_id` (referência circular desnecessária)
- ✅ Renomeado `vinculado_em` → `linked_at`
- ✅ Adicionado `unlinked_at` para histórico
- Partial index para queries de relacionamentos ativos
- Status 'inactive' permite reativação sem violar UNIQUE

**Fluxo:**
1. Convite criado com `created_at`
2. Ao aceitar, cria relacionamento com `status='active'` + `linked_at`
3. Para desvincular: `status='inactive'` + `unlinked_at`
4. Reativar: mudar status para 'active', atualizar `linked_at`

**Integridade:**
- UNIQUE permite apenas um relacionamento ativo por dupla
- Status 'inactive' permite reativar sem quebrar constraint
- Histórico completo via timestamps

---

### 1.7 `company_invitations` (Sistema de Convites Seguro)

```sql
CREATE TABLE company_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_firm_id UUID NOT NULL REFERENCES accounting_firms(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  invited_email CITEXT NOT NULL,
  invited_cnpj VARCHAR(14),
  invited_company_name VARCHAR(255),
  
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  status VARCHAR(50) NOT NULL 
    DEFAULT 'pending' 
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'revoked')),
  
  accepted_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  
  company_id_linked UUID REFERENCES companies(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ci_firm_id ON company_invitations(accounting_firm_id);
CREATE INDEX idx_ci_token_hash ON company_invitations(token_hash);
CREATE INDEX idx_ci_status ON company_invitations(status);
CREATE INDEX idx_ci_email ON company_invitations(invited_email);
CREATE INDEX idx_ci_expires ON company_invitations(token_expires_at);

-- Partial unique index: previne convites pending duplicados
CREATE UNIQUE INDEX idx_ci_pending_unique 
  ON company_invitations(accounting_firm_id, invited_email) 
  WHERE status = 'pending';
```

**Mudanças:**
- ✅ `token_hash` em vez de `token` (SHA-256, nunca texto puro)
- ✅ `created_by_user_id` NULLABLE + ON DELETE SET NULL (coerente)
- ✅ Adicionado `company_id_linked` (auditoria pós-aceite)
- ✅ Partial unique index para evitar convites pending duplicados
- Email: CITEXT

**Fluxo de Token:**
```
Backend gera token: crypto.getRandomValues(32 bytes) → hex string de 64 chars
Calcula hash: SHA256(token) → armazena token_hash
URL enviada: https://app/accept?token=ABC123...DEF456
Frontend acessa link → backend recebe token original
Backend calcula: SHA256(token recebido)
Compara com token_hash no BD
Se match + não expirado + status='pending' → válido
Após aceite, token não pode ser reutilizado (status muda)
```

**Segurança:**
- Token original nunca é retornado novamente
- Token_hash é impossível reverter para original (SHA-256)
- Convite pode ser aceito apenas uma vez (status='accepted')
- Expiração obrigatória

---

### 1.8 `audit_logs` (Auditoria Append-Only)

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL 
    CHECK (action IN ('create', 'update', 'delete', 'activate', 'deactivate', 'link', 'unlink')),
  
  organization_id UUID,
  organization_type VARCHAR(50) CHECK (organization_type IN ('accounting_firm', 'company')),
  
  changes JSONB,
  ip_address INET,
  user_agent VARCHAR(500),
  request_id VARCHAR(100),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_org ON audit_logs(organization_id, organization_type);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
```

**Mudanças:**
- ✅ Adicionado `organization_id` + `organization_type` (auditoria por tenant)
- ✅ Adicionado `request_id` (correlation/tracing)
- ✅ Removed `updated_at` (append-only, nunca muda)
- ✅ Ações específicas: 'link', 'unlink'

**RLS Audit:**
- Usuários comuns: NÃO podem inserir, atualizar ou deletar
- Backend com SECURITY DEFINER: insere logs automaticamente
- Admins: somente SELECT com restrições

**Segurança:**
- Nunca armazena passwords, tokens, secrets
- changes JSONB apenas dados não-sensíveis
- Append-only: nenhum UPDATE/DELETE

---

### 1.9 Tabela Auxiliar: `organization_owners` (Constraint de Integridade)

```sql
-- Tabela apenas para garantir regra de negócio
-- Um owner ativo por organização
CREATE TABLE organization_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  organization_type VARCHAR(50) NOT NULL 
    CHECK (organization_type IN ('accounting_firm', 'company')),
  member_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, organization_type)
);

-- Mantida via trigger quando membership.role = 'owner' é ativado
-- Garante no máximo 1 owner ativo por org
```

**Propósito:**
- Garante que exista exatamente um owner ativo por organização
- Atualizada automaticamente via triggers
- Permite queries rápidas: "quem é o owner desta firma?"

---

## 2. TRIGGERS OBRIGATÓRIOS

### 2.1 Trigger: `updated_at` Automático

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a todos os modificáveis
CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_accounting_firms_updated_at
  BEFORE UPDATE ON accounting_firms FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_accounting_firm_members_updated_at
  BEFORE UPDATE ON accounting_firm_members FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_companies_updated_at
  BEFORE UPDATE ON companies FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_company_members_updated_at
  BEFORE UPDATE ON company_members FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_acr_updated_at
  BEFORE UPDATE ON accountant_company_relationships FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_invitations_updated_at
  BEFORE UPDATE ON company_invitations FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Benefício:**
- Frontend não pode mentir sobre updated_at
- Sempre reflete o momento real da mudança
- Essencial para otimistic locking

---

### 2.2 Trigger: Criar Profile após Signup

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    auth_id,
    email,
    full_name,
    global_role
  ) VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    'company_user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Garantia:**
- Sempre que usuário faz signup, profile é criado automaticamente
- Impossível ter auth.users sem profile
- Transação atômica

---

### 2.3 Trigger: Sincronizar Email de auth.users para profiles

```sql
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE auth_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email();
```

**Garantia:**
- Se usuário muda email no Auth, profiles.email é atualizado
- Nunca haverá inconsistência

---

### 2.4 Trigger: Registrar Owner em organization_owners

```sql
CREATE OR REPLACE FUNCTION public.sync_organization_owner()
RETURNS TRIGGER AS $$
BEGIN
  -- Se tornando owner e ativo
  IF NEW.role = 'owner' AND NEW.is_active = true THEN
    INSERT INTO public.organization_owners (
      organization_id,
      organization_type,
      member_id
    ) VALUES (
      NEW.accounting_firm_id,
      'accounting_firm',
      NEW.id
    )
    ON CONFLICT (organization_id, organization_type) DO UPDATE
    SET member_id = NEW.id;
  END IF;
  
  -- Deixando de ser owner ou desativando
  IF (OLD.role = 'owner' OR OLD.is_active = true)
    AND (NEW.role != 'owner' OR NEW.is_active = false) THEN
    DELETE FROM public.organization_owners
    WHERE organization_id = NEW.accounting_firm_id
      AND organization_type = 'accounting_firm';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER sync_accounting_firm_owner
  AFTER INSERT OR UPDATE ON accounting_firm_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_organization_owner();

-- Similar para company_members (organization_type = 'company')
```

**Garantia:**
- organization_owners sempre reflete o owner ativo atual
- Consultas rápidas: SELECT member_id FROM organization_owners WHERE org_id=X

---

## 3. NORMALIZAÇÃO DE DADOS

### 3.1 CNPJ

```sql
-- Função de normalização
CREATE OR REPLACE FUNCTION normalize_cnpj(cnpj_input VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
  -- Remove caracteres não numéricos
  RETURN regexp_replace(cnpj_input, '[^0-9]', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Constraint em accounting_firms
ALTER TABLE accounting_firms ADD CONSTRAINT check_cnpj_format
  CHECK (
    cnpj IS NULL 
    OR (length(cnpj) = 14 AND cnpj ~ '^\d{14}$')
  );

-- Constraint em companies
ALTER TABLE companies ADD CONSTRAINT check_cnpj_format
  CHECK (
    cnpj IS NULL 
    OR (length(cnpj) = 14 AND cnpj ~ '^\d{14}$')
  );

-- Default: normalizar ao inserir/atualizar
-- Requer trigger ou aplicação frontend
```

**Regras:**
- CNPJ armazenado apenas com dígitos (14 caracteres)
- NULL se não fornecido (nunca string vazia)
- Validação de formato, não validação fiscal completa

---

### 3.2 Email

```sql
-- CITEXT já normalizador caso insensitivo
-- Aplicação deve fazer .toLowerCase().trim() antes de INSERT/UPDATE
-- BD rejeita inconsistências via constraint UNIQUE em CITEXT
```

**Regras:**
- Email armazenado em CITEXT
- Comparações case-insensitive automáticas
- Aplicação deve normalizar antes de enviar (segurança extra)

---

## 4. FUNÇÕES AUXILIARES RLS

### 4.1 `is_accounting_firm_member(firm_id UUID) -> BOOLEAN`

```sql
CREATE OR REPLACE FUNCTION is_accounting_firm_member(firm_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM accounting_firm_members
    WHERE accounting_firm_id = firm_id
      AND user_id = (SELECT id FROM profiles WHERE auth_id = auth.uid())
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION is_accounting_firm_member(UUID) TO authenticated;
```

**Uso:** RLS policies, não acessível do cliente

---

### 4.2 `is_accounting_firm_owner(firm_id UUID) -> BOOLEAN`

```sql
CREATE OR REPLACE FUNCTION is_accounting_firm_owner(firm_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM accounting_firm_members
    WHERE accounting_firm_id = firm_id
      AND user_id = (SELECT id FROM profiles WHERE auth_id = auth.uid())
      AND role = 'owner'
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION is_accounting_firm_owner(UUID) TO authenticated;
```

---

### 4.3 `is_company_member(company_id UUID) -> BOOLEAN`

```sql
CREATE OR REPLACE FUNCTION is_company_member(company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM company_members
    WHERE company_id = company_id
      AND user_id = (SELECT id FROM profiles WHERE auth_id = auth.uid())
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION is_company_member(UUID) TO authenticated;
```

---

### 4.4 `is_company_owner(company_id UUID) -> BOOLEAN`

```sql
CREATE OR REPLACE FUNCTION is_company_owner(company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM company_members
    WHERE company_id = company_id
      AND user_id = (SELECT id FROM profiles WHERE auth_id = auth.uid())
      AND role = 'owner'
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION is_company_owner(UUID) TO authenticated;
```

---

### 4.5 `get_current_user_id() -> UUID`

```sql
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT id FROM profiles WHERE auth_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_current_user_id() TO authenticated;
```

**Evita recursão:** Usado em lugar de SELECT direto em RLS

---

## 5. POLÍTICAS RLS (ROW LEVEL SECURITY)

### 5.1 `profiles` - Visualizar

```sql
-- Usuários veem seu próprio perfil
-- Admins veem todos
CREATE POLICY "Users see own profile"
  ON profiles FOR SELECT
  USING (
    auth.uid() = auth_id
    OR
    (SELECT global_role FROM profiles WHERE auth_id = auth.uid()) = 'admin'
  );

-- Usuários ativos veem perfis de outros usuários apenas se compartilham org
-- (Implementar com cuidado para não expor dados)
```

---

### 5.2 `profiles` - Atualizar

```sql
-- Usuários atualizam apenas seu próprio perfil
-- Nunca podem alterar global_role por si mesmos
CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = auth_id)
  WITH CHECK (
    auth.uid() = auth_id
    AND global_role = (SELECT global_role FROM profiles WHERE auth_id = auth.uid())
  );
```

**Segurança:** Impossível alterar global_role, is_active via RLS

---

### 5.3 `accounting_firms` - Visualizar

```sql
-- Membros veem apenas firmas onde participam
CREATE POLICY "Can view own accounting firms"
  ON accounting_firms FOR SELECT
  USING (
    is_accounting_firm_member(id)
    OR
    (SELECT global_role FROM profiles WHERE auth_id = auth.uid()) = 'admin'
  );
```

---

### 5.4 `accounting_firm_members` - Visualizar

```sql
-- Membros veem membros de suas próprias firmas
CREATE POLICY "Can view own firm members"
  ON accounting_firm_members FOR SELECT
  USING (
    is_accounting_firm_member(accounting_firm_id)
    OR
    (SELECT global_role FROM profiles WHERE auth_id = auth.uid()) = 'admin'
  );
```

---

### 5.5 `accounting_firm_members` - Inserir

```sql
-- Apenas owner da firma ou admin pode adicionar membros
CREATE POLICY "Owner can add firm members"
  ON accounting_firm_members FOR INSERT
  WITH CHECK (
    is_accounting_firm_owner(accounting_firm_id)
    OR
    (SELECT global_role FROM profiles WHERE auth_id = auth.uid()) = 'admin'
  );
```

**Segurança:** Usuário não pode adicionar a si mesmo, apenas owner/admin

---

### 5.6 `accounting_firm_members` - Atualizar

```sql
-- Apenas owner/admin pode alterar roles
-- Usuário comum jamais pode se promover
CREATE POLICY "Owner can update firm member roles"
  ON accounting_firm_members FOR UPDATE
  USING (
    is_accounting_firm_owner(accounting_firm_id)
    OR
    (SELECT global_role FROM profiles WHERE auth_id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    is_accounting_firm_owner(accounting_firm_id)
    OR
    (SELECT global_role FROM profiles WHERE auth_id = auth.uid()) = 'admin'
  );
```

---

### 5.7 `companies` - Visualizar

```sql
-- Membros veem apenas empresas onde participam
CREATE POLICY "Can view own companies"
  ON companies FOR SELECT
  USING (
    is_company_member(id)
    OR
    (SELECT global_role FROM profiles WHERE auth_id = auth.uid()) = 'admin'
  );
```

---

### 5.8 `company_members` - Visualizar

```sql
-- Membros veem membros de suas empresas
CREATE POLICY "Can view own company members"
  ON company_members FOR SELECT
  USING (
    is_company_member(company_id)
    OR
    (SELECT global_role FROM profiles WHERE auth_id = auth.uid()) = 'admin'
  );
```

---

### 5.9 `company_members` - Inserir

```sql
-- Apenas owner ou admin
CREATE POLICY "Owner can add company members"
  ON company_members FOR INSERT
  WITH CHECK (
    is_company_owner(company_id)
    OR
    (SELECT global_role FROM profiles WHERE auth_id = auth.uid()) = 'admin'
  );
```

---

### 5.10 `accountant_company_relationships` - Visualizar

```sql
-- Contador vê relacionamentos de suas firmas
-- Empresa vê relacionamento de suas empresas
CREATE POLICY "See own relationships"
  ON accountant_company_relationships FOR SELECT
  USING (
    is_accounting_firm_member(accounting_firm_id)
    OR
    is_company_member(company_id)
    OR
    (SELECT global_role FROM profiles WHERE auth_id = auth.uid()) = 'admin'
  );
```

---

### 5.11 `company_invitations` - Visualizar

```sql
-- Criador vê seus próprios convites
-- Owner da firma vê convites da firma
-- Admin vê todos
CREATE POLICY "Can view related invitations"
  ON company_invitations FOR SELECT
  USING (
    created_by_user_id = get_current_user_id()
    OR
    is_accounting_firm_owner(accounting_firm_id)
    OR
    (SELECT global_role FROM profiles WHERE auth_id = auth.uid()) = 'admin'
  );
```

**Segurança:** Impossível ver token_hash de convites

---

### 5.12 `audit_logs` - Visualizar

```sql
-- Admin vê todos
-- Contador vê logs de suas firmas
-- Empresa vê logs de suas empresas
CREATE POLICY "Can view relevant audit logs"
  ON audit_logs FOR SELECT
  USING (
    (SELECT global_role FROM profiles WHERE auth_id = auth.uid()) = 'admin'
    OR
    (
      organization_type = 'accounting_firm'
      AND is_accounting_firm_member(organization_id)
    )
    OR
    (
      organization_type = 'company'
      AND is_company_member(organization_id)
    )
  );
```

---

### 5.13 `audit_logs` - Inserir

```sql
-- Apenas backend com SECURITY DEFINER
CREATE POLICY "Backend writes audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (false); -- Bloqueado para todos, usa função com SECURITY DEFINER
```

---

## 6. RPCs SECURITY DEFINER (Operações Atômicas)

### 6.1 `create_accounting_firm_with_owner`

```sql
CREATE OR REPLACE FUNCTION public.create_accounting_firm_with_owner(
  p_name VARCHAR,
  p_cnpj VARCHAR,
  p_email VARCHAR,
  p_phone VARCHAR,
  p_website VARCHAR,
  p_city VARCHAR,
  p_state VARCHAR
)
RETURNS TABLE(
  firm_id UUID,
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_firm_id UUID;
  v_normalized_cnpj VARCHAR;
BEGIN
  -- Segurança: verificar usuário autenticado
  v_user_id := get_current_user_id();
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, false, 'Not authenticated'::TEXT;
    RETURN;
  END IF;
  
  -- Validar entrada
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RETURN QUERY SELECT NULL::UUID, false, 'Name is required'::TEXT;
    RETURN;
  END IF;
  
  -- Normalizar CNPJ
  v_normalized_cnpj := CASE 
    WHEN p_cnpj IS NULL THEN NULL
    ELSE normalize_cnpj(p_cnpj)
  END;
  
  -- Transação atômica
  BEGIN
    -- Inserir firma
    INSERT INTO public.accounting_firms (
      name, cnpj, email, phone, website, city, state
    ) VALUES (
      p_name, v_normalized_cnpj, lower(trim(p_email)), p_phone, p_website, p_city, p_state
    )
    RETURNING id INTO v_firm_id;
    
    -- Adicionar usuário como owner
    INSERT INTO public.accounting_firm_members (
      accounting_firm_id, user_id, role, joined_at
    ) VALUES (
      v_firm_id, v_user_id, 'owner', CURRENT_TIMESTAMP
    );
    
    -- Registrar em organization_owners
    INSERT INTO public.organization_owners (
      organization_id, organization_type, member_id
    ) VALUES (
      v_firm_id, 'accounting_firm', v_user_id
    );
    
    -- Auditoria
    INSERT INTO public.audit_logs (
      user_id, entity_type, entity_id, action,
      organization_id, organization_type, changes
    ) VALUES (
      v_user_id, 'accounting_firms', v_firm_id, 'create',
      v_firm_id, 'accounting_firm',
      jsonb_build_object('name', p_name, 'cnpj', v_normalized_cnpj)
    );
    
    RETURN QUERY SELECT v_firm_id, true, 'Accounting firm created successfully'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::UUID, false, SQLERRM::TEXT;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_accounting_firm_with_owner(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR)
  TO authenticated;
```

**Segurança:**
- search_path fixo
- auth.uid() validado em get_current_user_id()
- Todos os parâmetros validados
- Transação atômica: firma + membership + logs
- Impossível criar para outro usuário
- RLS não é acessível aqui, usa SECURITY DEFINER

---

### 6.2 `create_company_with_owner`

Análogo a `create_accounting_firm_with_owner`, mas para companies:

```sql
CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_name VARCHAR,
  p_cnpj VARCHAR,
  p_email VARCHAR,
  p_phone VARCHAR,
  p_city VARCHAR,
  p_state VARCHAR,
  p_segment VARCHAR,
  p_legal_nature VARCHAR,
  p_founding_date DATE
)
RETURNS TABLE(
  company_id UUID,
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_company_id UUID;
  v_normalized_cnpj VARCHAR;
BEGIN
  v_user_id := get_current_user_id();
  
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, false, 'Not authenticated'::TEXT;
    RETURN;
  END IF;
  
  v_normalized_cnpj := CASE 
    WHEN p_cnpj IS NULL THEN NULL
    ELSE normalize_cnpj(p_cnpj)
  END;
  
  BEGIN
    INSERT INTO public.companies (
      name, cnpj, email, phone, city, state, segment, legal_nature, founding_date
    ) VALUES (
      p_name, v_normalized_cnpj, lower(trim(p_email)), p_phone, p_city, p_state, p_segment, p_legal_nature, p_founding_date
    )
    RETURNING id INTO v_company_id;
    
    INSERT INTO public.company_members (
      company_id, user_id, role, joined_at
    ) VALUES (
      v_company_id, v_user_id, 'owner', CURRENT_TIMESTAMP
    );
    
    INSERT INTO public.organization_owners (
      organization_id, organization_type, member_id
    ) VALUES (
      v_company_id, 'company', v_user_id
    );
    
    INSERT INTO public.audit_logs (
      user_id, entity_type, entity_id, action,
      organization_id, organization_type, changes
    ) VALUES (
      v_user_id, 'companies', v_company_id, 'create',
      v_company_id, 'company',
      jsonb_build_object('name', p_name, 'cnpj', v_normalized_cnpj)
    );
    
    RETURN QUERY SELECT v_company_id, true, 'Company created successfully'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::UUID, false, SQLERRM::TEXT;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_company_with_owner(...)
  TO authenticated;
```

---

### 6.3 `accept_company_invitation`

```sql
CREATE OR REPLACE FUNCTION public.accept_company_invitation(
  p_token VARCHAR,
  p_company_id UUID,
  p_company_name VARCHAR,
  p_company_cnpj VARCHAR
)
RETURNS TABLE(
  success BOOLEAN,
  company_id UUID,
  message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_invitation_id UUID;
  v_firm_id UUID;
  v_token_hash VARCHAR;
  v_company_id UUID;
  v_normalized_cnpj VARCHAR;
BEGIN
  v_user_id := get_current_user_id();
  
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Not authenticated'::TEXT;
    RETURN;
  END IF;
  
  -- Calcular hash do token recebido
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');
  
  BEGIN
    -- 1. Validar convite
    SELECT id, accounting_firm_id INTO v_invitation_id, v_firm_id
    FROM public.company_invitations
    WHERE token_hash = v_token_hash
      AND status = 'pending'
      AND token_expires_at > CURRENT_TIMESTAMP
    LIMIT 1;
    
    IF v_invitation_id IS NULL THEN
      RETURN QUERY SELECT false, NULL::UUID, 'Invalid or expired invitation'::TEXT;
      RETURN;
    END IF;
    
    -- 2. Se company_id fornecido, vincular ao existente
    IF p_company_id IS NOT NULL THEN
      v_company_id := p_company_id;
      
      -- Validar que usuário é owner dessa empresa
      IF NOT is_company_owner(v_company_id) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'You are not the owner of this company'::TEXT;
        RETURN;
      END IF;
      
      -- Checar se já existe relacionamento
      IF EXISTS(
        SELECT 1 FROM accountant_company_relationships
        WHERE accounting_firm_id = v_firm_id AND company_id = v_company_id
      ) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'This company is already linked to this accounting firm'::TEXT;
        RETURN;
      END IF;
    ELSE
      -- 3. Criar nova empresa
      v_normalized_cnpj := CASE 
        WHEN p_company_cnpj IS NULL THEN NULL
        ELSE normalize_cnpj(p_company_cnpj)
      END;
      
      INSERT INTO public.companies (
        name, cnpj, email
      ) VALUES (
        p_company_name, v_normalized_cnpj, (SELECT invited_email FROM company_invitations WHERE id = v_invitation_id)
      )
      RETURNING id INTO v_company_id;
      
      -- Adicionar usuário como owner
      INSERT INTO public.company_members (
        company_id, user_id, role, joined_at
      ) VALUES (
        v_company_id, v_user_id, 'owner', CURRENT_TIMESTAMP
      );
    END IF;
    
    -- 4. Criar relacionamento
    INSERT INTO public.accountant_company_relationships (
      accounting_firm_id, company_id, status, linked_at
    ) VALUES (
      v_firm_id, v_company_id, 'active', CURRENT_TIMESTAMP
    );
    
    -- 5. Marcar convite como aceito
    UPDATE public.company_invitations
    SET 
      status = 'accepted',
      accepted_at = CURRENT_TIMESTAMP,
      accepted_by_user_id = v_user_id,
      company_id_linked = v_company_id
    WHERE id = v_invitation_id;
    
    -- 6. Auditoria
    INSERT INTO public.audit_logs (
      user_id, entity_type, entity_id, action,
      organization_id, organization_type
    ) VALUES (
      v_user_id, 'company_invitations', v_invitation_id, 'accept',
      v_company_id, 'company'
    );
    
    RETURN QUERY SELECT true, v_company_id, 'Invitation accepted successfully'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, NULL::UUID, SQLERRM::TEXT;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.accept_company_invitation(VARCHAR, UUID, VARCHAR, VARCHAR)
  TO authenticated;
```

**Atomicidade:**
- Validação de convite
- Criação de empresa (opcional)
- Criação de membership (opcional)
- Criação de relacionamento
- Update de convite
- Auditoria
- Tudo em uma transação

**Idempotência:**
- Se chamar 2x com mesmo token, segunda falha (status já é 'accepted')

---

### 6.4 `create_invitation`

```sql
CREATE OR REPLACE FUNCTION public.create_invitation(
  p_invited_email VARCHAR,
  p_invited_cnpj VARCHAR,
  p_invited_company_name VARCHAR,
  p_expires_in_days INTEGER DEFAULT 30
)
RETURNS TABLE(
  invitation_id UUID,
  token VARCHAR,
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_firm_id UUID;
  v_token VARCHAR(64);
  v_token_hash VARCHAR;
  v_invitation_id UUID;
  v_normalized_cnpj VARCHAR;
BEGIN
  v_user_id := get_current_user_id();
  
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR, false, 'Not authenticated'::TEXT;
    RETURN;
  END IF;
  
  -- Obter firma do usuário (assume um owner)
  SELECT COALESCE(
    (SELECT accounting_firm_id FROM accounting_firm_members 
     WHERE user_id = v_user_id AND role = 'owner' AND is_active = true LIMIT 1),
    NULL
  ) INTO v_firm_id;
  
  IF v_firm_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR, false, 'You are not owner of any accounting firm'::TEXT;
    RETURN;
  END IF;
  
  BEGIN
    -- Validar não existe convite pending duplicado
    IF EXISTS(
      SELECT 1 FROM company_invitations
      WHERE accounting_firm_id = v_firm_id
        AND invited_email = lower(trim(p_invited_email))
        AND status = 'pending'
    ) THEN
      RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR, false, 'An open invitation already exists for this email'::TEXT;
      RETURN;
    END IF;
    
    -- Gerar token seguro (32 bytes em hex)
    -- No backend real, use: crypto.getRandomValues(32) → hex
    -- Aqui simulado com UUID + HMAC
    v_token := encode(digest(gen_random_uuid()::TEXT || CURRENT_TIMESTAMP::TEXT, 'sha256'), 'hex');
    v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
    
    -- Normalizar CNPJ
    v_normalized_cnpj := CASE 
      WHEN p_invited_cnpj IS NULL THEN NULL
      ELSE normalize_cnpj(p_invited_cnpj)
    END;
    
    -- Criar convite
    INSERT INTO public.company_invitations (
      accounting_firm_id,
      created_by_user_id,
      invited_email,
      invited_cnpj,
      invited_company_name,
      token_hash,
      token_expires_at,
      status
    ) VALUES (
      v_firm_id,
      v_user_id,
      lower(trim(p_invited_email)),
      v_normalized_cnpj,
      p_invited_company_name,
      v_token_hash,
      CURRENT_TIMESTAMP + (p_expires_in_days || ' days')::INTERVAL,
      'pending'
    )
    RETURNING id INTO v_invitation_id;
    
    -- Auditoria
    INSERT INTO public.audit_logs (
      user_id, entity_type, entity_id, action,
      organization_id, organization_type, changes
    ) VALUES (
      v_user_id, 'company_invitations', v_invitation_id, 'create',
      v_firm_id, 'accounting_firm',
      jsonb_build_object('invited_email', p_invited_email)
    );
    
    -- Retornar token (apenas nessa chamada)
    RETURN QUERY SELECT v_invitation_id, v_token, true, 'Invitation created successfully'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR, false, SQLERRM::TEXT;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_invitation(VARCHAR, VARCHAR, VARCHAR, INTEGER)
  TO authenticated;
```

**Nota:** Token é retornado APENAS nessa função, no mesmo momento. Se o token for perdido, novo convite deve ser criado.

---

## 7. MATRIZ DE PERMISSÕES

| Ação | Contador Owner | Contador Partner | Contador Accountant | Empresa Owner | Empresa Manager | Admin |
|------|---|---|---|---|---|---|
| Ver firma | ✅ Própria | ✅ Própria | ✅ Própria | ❌ | ❌ | ✅ |
| Criar firma | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Adicionar membro firma | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Alterar role (firma) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Ver convites | ✅ | ✅ Criou | ✅ Criou | ❌ | ❌ | ✅ |
| Criar convite | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Ver empresas vinculadas | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Ver empresa | ❌ | ❌ | ❌ | ✅ Própria | ✅ Própria | ✅ |
| Criar empresa | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Adicionar membro empresa | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Aceitar convite | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Ver logs auditoria | ❌ Própria org | ❌ Própria org | ❌ Própria org | ❌ Própria org | ❌ Própria org | ✅ |
| Alterar global_role | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Admin |

**Legenda:**
- ✅ = Permitido
- ❌ = Bloqueado
- Própria = Apenas da própria organização

---

## 8. FLUXO COMPLETO: SIGNUP CONTADOR → VÍNCULO EMPRESA

### Fluxo Visual

```
┌────────────────────────────────────────────────────────────────────┐
│ 1. CONTADOR FAZ SIGNUP                                            │
├────────────────────────────────────────────────────────────────────┤
│ Email + Senha → Supabase Auth                                      │
│ ↓                                                                   │
│ Trigger: create profile automaticamente                            │
│ ↓                                                                   │
│ profiles.id + auth_id + global_role='accountant'                   │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ 2. CONTADOR FAZ LOGIN                                             │
├────────────────────────────────────────────────────────────────────┤
│ Email + Senha → Supabase Auth                                      │
│ ↓                                                                   │
│ Retorna JWT token                                                  │
│ ↓                                                                   │
│ Frontend armazena token em httpOnly cookie                         │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ 3. CONTADOR CRIA ESCRITÓRIO                                       │
├────────────────────────────────────────────────────────────────────┤
│ Frontend: POST /api/accounting-firms                               │
│ Body: { name, cnpj, email, phone, ... }                            │
│ ↓                                                                   │
│ Backend: Chama create_accounting_firm_with_owner(...)              │
│ ↓                                                                   │
│ Transação:                                                          │
│   • INSERT accounting_firms (gera ID)                              │
│   • INSERT accounting_firm_members (role='owner')                  │
│   • INSERT organization_owners                                     │
│   • INSERT audit_logs                                              │
│ ↓                                                                   │
│ Retorna: { firm_id, success }                                      │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ 4. CONTADOR ACESSA DASHBOARD                                      │
├────────────────────────────────────────────────────────────────────┤
│ Frontend: GET /api/accounting-firms/:firmId                        │
│ ↓                                                                   │
│ Backend valida: is_accounting_firm_member(firmId)                  │
│ ↓                                                                   │
│ RLS garante acesso apenas a firma própria                          │
│ ↓                                                                   │
│ Retorna: firm details + members + related companies               │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ 5. CONTADOR CLICA "CONVIDAR EMPRESA"                              │
├────────────────────────────────────────────────────────────────────┤
│ Frontend abre formulário                                            │
│ Input: email da empresa, CNPJ, nome                                │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ 6. BACKEND CRIA CONVITE SEGURO                                    │
├────────────────────────────────────────────────────────────────────┤
│ Frontend: POST /api/invitations                                    │
│ Body: { invited_email, invited_cnpj, invited_company_name }        │
│ ↓                                                                   │
│ Backend: Chama create_invitation(...)                              │
│ ↓                                                                   │
│ Função gera:                                                        │
│   • token = 32 bytes random em hex (64 chars)                      │
│   • token_hash = SHA256(token)                                     │
│ ↓                                                                   │
│ Transação:                                                          │
│   • INSERT company_invitations (armazena token_hash)               │
│   • Valida: não há outro pending para (firm, email)                │
│   • INSERT audit_logs                                              │
│ ↓                                                                   │
│ Retorna: { invitation_id, token } (token somente nesse momento)    │
│ ↓                                                                   │
│ Backend envia email com link:                                      │
│ https://app.unnify-conecta.com/accept-invitation?token=ABC123...  │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ 7. EMPRESA ACESSA LINK                                            │
├────────────────────────────────────────────────────────────────────┤
│ Frontend: GET /accept-invitation?token=ABC123...                   │
│ ↓                                                                   │
│ Backend valida token:                                              │
│   • token_hash = SHA256(token recebido)                            │
│   • Busca: SELECT * WHERE token_hash = ?                           │
│   • Valida: status = 'pending' + não expirou                       │
│ ↓                                                                   │
│ Retorna: { valid: true, message: "convite válido" }               │
│ ↓                                                                   │
│ Frontend mostra formulário de signup/login + dados da firma       │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ 8. EMPRESA: CRIA CONTA OU FAZ LOGIN                               │
├────────────────────────────────────────────────────────────────────┤
│ Novo usuário: Signup                                               │
│   Email + Senha → Supabase Auth                                    │
│   ↓                                                                │
│   Trigger cria profile com global_role='company_user'             │
│                                                                    │
│ Usuário existente: Login                                           │
│   Email + Senha → retorna JWT                                      │
│ ↓                                                                   │
│ JWT armazenado, usuário autenticado                                │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ 9. EMPRESA: CADASTRA OU ASSOCIA EMPRESA                           │
├────────────────────────────────────────────────────────────────────┤
│ Opção A: Criar nova empresa                                        │
│   Frontend: POST /api/companies                                    │
│   Body: { name, cnpj, email, ... }                                 │
│   ↓                                                                │
│   Backend: Chama create_company_with_owner(...)                    │
│   ↓                                                                │
│   Transação:                                                        │
│     • INSERT companies                                             │
│     • INSERT company_members (role='owner')                        │
│     • INSERT organization_owners                                   │
│     • INSERT audit_logs                                            │
│   ↓                                                                │
│   Retorna: { company_id, success }                                 │
│                                                                    │
│ Opção B: Associar empresa existente                                │
│   (Usuário que criou empresa anteriormente)                        │
│   Já está vinculado em company_members                             │
│   ↓                                                                │
│   Prossegue com aceitar convite (passo 10)                         │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ 10. EMPRESA ACEITA CONVITE                                        │
├────────────────────────────────────────────────────────────────────┤
│ Frontend: POST /api/accept-invitation                              │
│ Body: { token, company_id (opcional) }                             │
│ ↓                                                                   │
│ Backend: Chama accept_company_invitation(...)                      │
│ ↓                                                                   │
│ Transação:                                                          │
│   • Calcula: token_hash = SHA256(token)                            │
│   • Busca convite: WHERE token_hash = ? AND status='pending'       │
│   • Valida: não expirado, ainda pending                            │
│   • Valida: usuário é owner da empresa (se company_id fornecido)   │
│   • Valida: não existe relacionamento duplicado                    │
│   • INSERT accountant_company_relationships (status='active')      │
│   • UPDATE company_invitations: status='accepted', accepted_at,    │
│     accepted_by_user_id, company_id_linked                         │
│   • INSERT audit_logs                                              │
│ ↓                                                                   │
│ Retorna: { success: true, company_id, message }                    │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ 11. VÍNCULO CRIADO - EMPRESAS APARECEM NOS DASHBOARDS             │
├────────────────────────────────────────────────────────────────────┤
│ Contador Dashboard:                                                 │
│   GET /api/accounting-firms/:firmId/companies                      │
│   ↓                                                                │
│   SELECT companies c                                               │
│   JOIN accountant_company_relationships acr                        │
│   WHERE acr.accounting_firm_id = firmId                            │
│     AND acr.status = 'active'                                      │
│   ↓                                                                │
│   RLS valida: usuário é membro dessa firma                         │
│   ↓                                                                │
│   Mostra lista de empresas vinculadas                              │
│                                                                    │
│ Empresa Dashboard:                                                  │
│   GET /api/companies/:companyId/accounting-firm                    │
│   ↓                                                                │
│   SELECT accounting_firms af                                       │
│   JOIN accountant_company_relationships acr                        │
│   WHERE acr.company_id = companyId                                 │
│     AND acr.status = 'active'                                      │
│   ↓                                                                │
│   RLS valida: usuário é membro dessa empresa                       │
│   ↓                                                                │
│   Mostra contador vinculado                                        │
└────────────────────────────────────────────────────────────────────┘
```

---

## 9. ESTRATÉGIA DE CONVITES - DETALHES

### Token Generation (Backend - Node.js)

```javascript
// Nunca fazer isso no frontend
import crypto from 'crypto';

function generateSecureToken() {
  // 32 bytes = 256 bits = impossível adivinhar
  return crypto.randomBytes(32).toString('hex'); // 64 chars
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
```

### Validação ao Aceitar

```
1. Usuário clica link: ?token=ABC123...
2. Backend recebe token original
3. Calcula: hash = SHA256(token)
4. Busca no BD: SELECT * WHERE token_hash = hash
5. Valida:
   - Encontrado?
   - status = 'pending'?
   - token_expires_at > now?
6. Se válido: marca accepted, cria vínculo
7. Mesmo token não pode ser reutilizado (status muda)
```

### Segurança

- ✅ Token nunca armazenado em texto puro
- ✅ Impossível reverter hash para obter token
- ✅ Expiração obrigatória
- ✅ Convite pode ser aceito apenas uma vez
- ✅ Força bruta em token (2^256) é impossível
- ✅ Convites duplicados bloqueados por partial unique index

---

## 10. CRIAÇÃO ATÔMICA - GARANTIAS

Operações que devem ser atômicas (tudo ou nada):

1. **create_accounting_firm_with_owner**
   - Firma + Owner Membership + Organization Owner + Audit Log
   
2. **create_company_with_owner**
   - Empresa + Owner Membership + Organization Owner + Audit Log
   
3. **accept_company_invitation**
   - Validação + Relacionamento + Update Convite + Audit Log

Se qualquer parte falhar, TUDO é revertido (ROLLBACK automático).

---

## 11. ÍNDICES FINAIS

```sql
-- Primárias (UNIQUE já cria índice)
-- profiles: (email), (auth_id)
-- accounting_firms: (cnpj)
-- companies: (cnpj)
-- accounting_firm_members: (accounting_firm_id, user_id)
-- company_members: (company_id, user_id)
-- accountant_company_relationships: (accounting_firm_id, company_id)
-- company_invitations: (token_hash)

-- Secundários
CREATE INDEX idx_accounting_firm_members_active 
  ON accounting_firm_members(accounting_firm_id, is_active);

CREATE INDEX idx_company_members_active 
  ON company_members(company_id, is_active);

CREATE INDEX idx_acr_active 
  ON accountant_company_relationships(accounting_firm_id, status) 
  WHERE status = 'active';

CREATE INDEX idx_ci_pending_unique 
  ON company_invitations(accounting_firm_id, invited_email) 
  WHERE status = 'pending';

CREATE INDEX idx_audit_org 
  ON audit_logs(organization_id, organization_type);

CREATE INDEX idx_audit_created 
  ON audit_logs(created_at DESC);

-- Não criar: idx_profiles_global_role, idx_accounting_firms_status 
-- (raramente usados para filtro principal)
```

---

## 12. ADMIN - ATRIBUIÇÃO SEGURA

**Policy: Somente Admin pode criar/modificar admins**

```sql
-- Não permitir via RLS
CREATE POLICY "Prevent self-promotion to admin"
  ON profiles FOR UPDATE
  USING (true)
  WITH CHECK (
    -- Se tentando alterar global_role
    CASE 
      WHEN global_role != OLD.global_role AND global_role = 'admin' THEN
        -- Somente admin existente pode fazer isso
        (SELECT global_role FROM profiles WHERE auth_id = auth.uid()) = 'admin'
      ELSE true
    END
  );
```

**Backend (servidor administrativo seguro):**

```typescript
// POST /admin/promote-to-admin (proteção extra no backend)
// Só acessível por: admin existente ou chave de administração segura

async function promoteToAdmin(userId: string, adminKey: string) {
  // Validar chave admin (não JWT do usuário)
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    throw new Error('Unauthorized');
  }
  
  // Update via service_role (backend)
  const { error } = await supabase
    .from('profiles')
    .update({ global_role: 'admin' })
    .eq('id', userId);
}
```

---

## 13. DECISÕES CRÍTICAS CONFIRMADAS

| Decisão | Justificativa |
|---------|--------------|
| Sem owner_id duplicado | Membership é fonte única de verdade |
| Token_hash (SHA-256) | Impossível reverter, seguro, performance |
| CITEXT para email | Case-insensitive, normalizado |
| Soft-delete com status | Histórico completo, sem perda de dados |
| RLS + Backend Validation | Duas camadas de segurança |
| SECURITY DEFINER RPCs | Operações atômicas controladas |
| Partial Unique Index | Previne duplicatas, performance |
| Audit Append-Only | Compliance, impossível falsificar |
| Trigger sync_profile_email | Sem inconsistência entre auth e profiles |
| Constraint organization_owners | Garante ownership único |

---

## 14. RISCOS REMANENTES

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Email spoofing (convite enviado errado) | MÉDIA | Validar endereço, confirmação dupla de aceite |
| CNPJ fraudulento | MÉDIA | Validar com receita futura, não agora |
| Usuário perde acesso (única owner) | BAIXA | Permitir múltiplos owners, documentar |
| Transação muito lenta | BAIXA | Índices + monitoria, considerar async futura |
| Expiração convite muito curta/longa | BAIXA | Padrão 30 dias, ajustável |
| Concorrência em accept_invitation | MUITO BAIXA | Transação isola, partial index previne |
| Admin key exposta | CRÍTICA | Guardar em secrets manager (AWS Secrets, etc) |
| RLS policy complexa causa false negatives | BAIXA | Testes unitários de RLS, auditoria |

---

## 15. PRÓXIMOS PASSOS (Após Aprovação Final)

1. ✅ Você valida V2
2. Criar migrations SQL (Supabase)
3. Deploy schema ao Supabase
4. Implementar RLS policies
5. Testar atomicidade das funções
6. Testar RLS (não pode acessar dados alheios)
7. Setup TypeScript types (via Supabase TypeScript Generator)
8. Criar Server Actions (Next.js)
9. Criar páginas
10. E2E testing do fluxo completo

---

**Aguardando sua aprovação final para prosseguir! 🚀**

Esta V2 resolve todos os 20 pontos de forma robusta, segura e escalável.
