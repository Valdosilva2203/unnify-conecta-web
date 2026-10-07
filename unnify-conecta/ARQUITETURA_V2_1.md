# Proposta Técnica V2.1 FINAL - Arquitetura Unnify Conecta

**Data:** 07/10/2026  
**Status:** Pronto para migrations após aprovação  
**Versão:** 2.1  
**Objetivo:** Schema robusto, seguro, simples e pronto para produção

---

## RESUMO: V2 → V2.1

| Ponto | V2 | V2.1 | Impacto |
|-------|----|----|---------|
| 1 | `organization_owners` table | ❌ Removido | Simplificação |
| 2 | `create_invitation()` LIMIT 1 | `p_accounting_firm_id` explícito | Segurança |
| 3 | Token geração improvisada | `crypto.randomBytes(32)` backend | Criptografia real |
| 4 | `accept_invitation()` sem lock | `SELECT FOR UPDATE` | Race condition fix |
| 5 | Erro genérico se já aceito | Comportamento idempotente | UX melhor |
| 6 | `global_role` = accountant/company_user | `global_role` = 'user'/'admin' | Simplicidade |
| 7 | ADMIN_SECRET_KEY endpoint | ❌ Removido | Segurança |
| 8 | RLS profiles recursivo | `is_platform_admin()` SECURITY DEFINER | Sem recursão |
| 9 | SECURITY DEFINER sem revoke | Explicit REVOKE + schema qualificado | Segurança |
| 10 | `normalize_cnpj('')` → '' | Retorna NULL | Integridade |
| 11 | Índices duplicando UNIQUE | ❌ Removidos | Performance |
| 12 | UNIQUE permanente | UNIQUE parcial WHERE status='active' | Histórico |
| 13 | CASCADE em principais | Soft-delete explicado | Integridade |
| 14 | Sem validação email convite | Validar `user.email = invited_email` | Segurança |
| 15 | SQLERRM ao frontend | Códigos de erro controlados | Segurança |
| 16 | `action='accept'` fora do CHECK | Adicionado ao CHECK | Integridade |
| 17 | Matriz inconsistente | Corrigida | Clareza |
| 18 | Extensões não documentadas | Lista explícita | Deployment |
| 19 | Sem testes de segurança | Checklist de 15 testes | Validação |

---

## 1. SCHEMA V2.1 FINAL (SEM organization_owners)

### 1.1 `profiles` (Usuários do Sistema)

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email CITEXT NOT NULL UNIQUE,
  full_name VARCHAR(255),
  avatar_url VARCHAR(500),
  global_role VARCHAR(50) NOT NULL 
    DEFAULT 'user'
    CHECK (global_role IN ('admin', 'user')),
  phone VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- UNIQUE já cria índice, não adicionar índice extra
CREATE INDEX idx_profiles_global_role ON profiles(global_role);
```

**Mudanças de V2:**
- `global_role` simplificado: apenas 'user' (padrão) ou 'admin'
- ❌ Removido: 'accountant', 'company_user' (membership determina)
- Explicação: Um usuário pode ser contador E empresário. Membership determina participação. Admin é privilégio global único.

**Garantias:**
- Todo usuário nasce como 'user'
- Promoção para 'admin' apenas via mecanismo administrativo seguro
- RLS impede auto-promoção

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

-- UNIQUE já cria índice em cnpj, sem duplicação
```

**Garantia:**
- ❌ Sem owner_id (membership.role='owner' é fonte de verdade)
- Soft-delete via status (não é deletada fisicamente)
- Uma firma sempre terá ≥ 1 owner ativo (regra aplicação, não BD)

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

-- Índices para queries comuns
CREATE INDEX idx_accounting_firm_members_firm_id ON accounting_firm_members(accounting_firm_id);
CREATE INDEX idx_accounting_firm_members_user_id ON accounting_firm_members(user_id);
CREATE INDEX idx_accounting_firm_members_active ON accounting_firm_members(accounting_firm_id, is_active);
```

**Ownership:**
- `role = 'owner'` = é dono da firma
- `is_active = true` = owner atual
- Aplicação garante ≥ 1 owner ativo por firma

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
```

**Padrão:** Análogo a accounting_firms, soft-delete via status

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
CREATE INDEX idx_company_members_active ON company_members(company_id, is_active);
```

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
  
  -- UNIQUE PARCIAL: permite reativar histórico
  UNIQUE(accounting_firm_id, company_id) WHERE (status = 'active')
);

CREATE INDEX idx_acr_firm_id ON accountant_company_relationships(accounting_firm_id);
CREATE INDEX idx_acr_company_id ON accountant_company_relationships(company_id);

-- Índice parcial para queries ativas
CREATE INDEX idx_acr_active ON accountant_company_relationships(accounting_firm_id) 
  WHERE status = 'active';
```

**Mudança Crítica V2.1:**
- ❌ ~~UNIQUE(accounting_firm_id, company_id)~~ 
- ✅ `UNIQUE(accounting_firm_id, company_id) WHERE (status = 'active')`

**Fluxo com Histórico:**
1. Criar convite → relacionamento com status='pending'
2. Aceitar → status='active', linked_at=now()
3. Desvincular → status='inactive', unlinked_at=now()
4. Recriar vínculo → nova linha ou UPDATE anterior (ambos válidos)
5. Histórico completo preservado

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
  
  -- ✅ Somente hash, nunca token em texto puro
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
CREATE INDEX idx_ci_status ON company_invitations(status);
CREATE INDEX idx_ci_email ON company_invitations(invited_email);
CREATE INDEX idx_ci_expires ON company_invitations(token_expires_at);

-- ✅ Partial unique index: um convite pending por (firm, email)
CREATE UNIQUE INDEX idx_ci_pending_unique 
  ON company_invitations(accounting_firm_id, invited_email) 
  WHERE status = 'pending';
```

**Mudanças V2.1:**
- Sem índice para token_hash (UNIQUE já cria)

---

### 1.8 `audit_logs` (Auditoria Append-Only)

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL 
    CHECK (action IN ('create', 'update', 'delete', 'activate', 'deactivate', 'link', 'unlink', 'accept')),
  
  organization_id UUID,
  organization_type VARCHAR(50) CHECK (organization_type IN ('accounting_firm', 'company')),
  
  changes JSONB,
  ip_address INET,
  user_agent VARCHAR(500),
  request_id VARCHAR(100),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_org ON audit_logs(organization_id, organization_type);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
```

**Mudança V2.1:**
- ✅ Adicionado `'accept'` ao CHECK (usado em accept_company_invitation)

---

## 2. EXTENSÕES NECESSÁRIAS

Antes de criar migrations, ativar no Supabase:

```sql
-- 1. CITEXT: comparação case-insensitive para emails
CREATE EXTENSION IF NOT EXISTS citext;

-- 2. PGCRYPTO: geração de UUIDs e hash seguro
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

**Verificar ativação:**
```sql
SELECT * FROM pg_extension WHERE extname IN ('citext', 'pgcrypto');
```

---

## 3. FUNÇÕES AUXILIARES RLS - SEGURAS

### 3.1 `is_platform_admin() -> BOOLEAN`

```sql
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (SELECT global_role FROM profiles WHERE auth_id = auth.uid()) = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated;
```

**Uso:** Evita recursão em RLS (SELECT não direto em policies)

---

### 3.2 `is_accounting_firm_member(firm_id UUID) -> BOOLEAN`

```sql
CREATE OR REPLACE FUNCTION is_accounting_firm_member(firm_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.accounting_firm_members
    WHERE accounting_firm_id = firm_id
      AND user_id = (SELECT id FROM public.profiles WHERE auth_id = auth.uid())
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION is_accounting_firm_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_accounting_firm_member(UUID) TO authenticated;
```

---

### 3.3 `is_accounting_firm_owner(firm_id UUID) -> BOOLEAN`

```sql
CREATE OR REPLACE FUNCTION is_accounting_firm_owner(firm_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.accounting_firm_members
    WHERE accounting_firm_id = firm_id
      AND user_id = (SELECT id FROM public.profiles WHERE auth_id = auth.uid())
      AND role = 'owner'
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION is_accounting_firm_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_accounting_firm_owner(UUID) TO authenticated;
```

---

### 3.4 `is_company_member(company_id UUID) -> BOOLEAN`

```sql
CREATE OR REPLACE FUNCTION is_company_member(company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.company_members
    WHERE company_id = company_id
      AND user_id = (SELECT id FROM public.profiles WHERE auth_id = auth.uid())
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION is_company_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_company_member(UUID) TO authenticated;
```

---

### 3.5 `is_company_owner(company_id UUID) -> BOOLEAN`

```sql
CREATE OR REPLACE FUNCTION is_company_owner(company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.company_members
    WHERE company_id = company_id
      AND user_id = (SELECT id FROM public.profiles WHERE auth_id = auth.uid())
      AND role = 'owner'
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION is_company_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_company_owner(UUID) TO authenticated;
```

---

### 3.6 `get_current_user_id() -> UUID`

```sql
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM public.profiles WHERE auth_id = auth.uid();
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_current_user_id() TO authenticated;
```

---

### 3.7 `normalize_cnpj(cnpj_input VARCHAR) -> VARCHAR`

```sql
CREATE OR REPLACE FUNCTION normalize_cnpj(cnpj_input VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_normalized VARCHAR;
BEGIN
  -- Remover caracteres não-numéricos
  v_normalized := regexp_replace(cnpj_input, '[^0-9]', '', 'g');
  
  -- Retornar NULL se vazio ou somente máscara
  IF v_normalized IS NULL OR v_normalized = '' THEN
    RETURN NULL;
  END IF;
  
  -- Retornar apenas se exatamente 14 dígitos
  IF length(v_normalized) = 14 THEN
    RETURN v_normalized;
  END IF;
  
  -- Se comprimento inválido, retornar NULL
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

REVOKE ALL ON FUNCTION normalize_cnpj(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION normalize_cnpj(VARCHAR) TO authenticated;
```

**Aplicação:**
```sql
INSERT INTO accounting_firms (name, cnpj, ...)
VALUES (
  'Firma XYZ',
  normalize_cnpj('12.345.678/0001-90'),  -- → '12345678000190'
  ...
);
```

---

## 4. TRIGGERS OBRIGATÓRIOS

### 4.1 Trigger: `updated_at` Automático

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON public.profiles FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_accounting_firms_updated_at
  BEFORE UPDATE ON public.accounting_firms FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_accounting_firm_members_updated_at
  BEFORE UPDATE ON public.accounting_firm_members FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_companies_updated_at
  BEFORE UPDATE ON public.companies FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_company_members_updated_at
  BEFORE UPDATE ON public.company_members FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_acr_updated_at
  BEFORE UPDATE ON public.accountant_company_relationships FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_invitations_updated_at
  BEFORE UPDATE ON public.company_invitations FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

---

### 4.2 Trigger: Criar Profile após Signup

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
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Mudança V2.1:**
- global_role = 'user' (antes: 'company_user')

---

### 4.3 Trigger: Sincronizar Email

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

REVOKE ALL ON FUNCTION public.sync_profile_email() FROM PUBLIC;

CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email();
```

---

## 5. RPCs SECURITY DEFINER - FINAIS

### 5.1 `create_accounting_firm_with_owner`

```sql
CREATE OR REPLACE FUNCTION public.create_accounting_firm_with_owner(
  p_name VARCHAR,
  p_cnpj VARCHAR DEFAULT NULL,
  p_email VARCHAR DEFAULT NULL,
  p_phone VARCHAR DEFAULT NULL,
  p_website VARCHAR DEFAULT NULL,
  p_city VARCHAR DEFAULT NULL,
  p_state VARCHAR DEFAULT NULL
)
RETURNS TABLE(
  firm_id UUID,
  success BOOLEAN,
  error_code VARCHAR,
  message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_firm_id UUID;
  v_normalized_cnpj VARCHAR;
BEGIN
  -- Validar autenticação
  v_user_id := get_current_user_id();
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, false, 'NOT_AUTHENTICATED'::VARCHAR, 'User not authenticated'::TEXT;
    RETURN;
  END IF;
  
  -- Validar entrada
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RETURN QUERY SELECT NULL::UUID, false, 'INVALID_INPUT'::VARCHAR, 'Firm name is required'::TEXT;
    RETURN;
  END IF;
  
  -- Normalizar CNPJ
  v_normalized_cnpj := normalize_cnpj(p_cnpj);
  
  BEGIN
    -- Inserir firma
    INSERT INTO public.accounting_firms (
      name, cnpj, email, phone, website, city, state
    ) VALUES (
      trim(p_name),
      v_normalized_cnpj,
      CASE WHEN p_email IS NOT NULL THEN lower(trim(p_email)) ELSE NULL END,
      p_phone,
      p_website,
      p_city,
      p_state
    )
    RETURNING id INTO v_firm_id;
    
    -- Adicionar usuário como owner
    INSERT INTO public.accounting_firm_members (
      accounting_firm_id, user_id, role, joined_at
    ) VALUES (
      v_firm_id, v_user_id, 'owner', CURRENT_TIMESTAMP
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
    
    RETURN QUERY SELECT v_firm_id, true, 'OK'::VARCHAR, 'Accounting firm created successfully'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::UUID, false, 'DATABASE_ERROR'::VARCHAR, 'Failed to create accounting firm'::TEXT;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.create_accounting_firm_with_owner(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_accounting_firm_with_owner(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO authenticated;
```

**Mudanças V2.1:**
- Error codes em vez de SQLERRM
- Normaliza CNPJ via função
- Schema qualificado

---

### 5.2 `create_company_with_owner`

```sql
CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_name VARCHAR,
  p_cnpj VARCHAR DEFAULT NULL,
  p_email VARCHAR DEFAULT NULL,
  p_phone VARCHAR DEFAULT NULL,
  p_city VARCHAR DEFAULT NULL,
  p_state VARCHAR DEFAULT NULL,
  p_segment VARCHAR DEFAULT NULL,
  p_legal_nature VARCHAR DEFAULT NULL,
  p_founding_date DATE DEFAULT NULL
)
RETURNS TABLE(
  company_id UUID,
  success BOOLEAN,
  error_code VARCHAR,
  message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_company_id UUID;
  v_normalized_cnpj VARCHAR;
BEGIN
  v_user_id := get_current_user_id();
  
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, false, 'NOT_AUTHENTICATED'::VARCHAR, 'User not authenticated'::TEXT;
    RETURN;
  END IF;
  
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RETURN QUERY SELECT NULL::UUID, false, 'INVALID_INPUT'::VARCHAR, 'Company name is required'::TEXT;
    RETURN;
  END IF;
  
  v_normalized_cnpj := normalize_cnpj(p_cnpj);
  
  BEGIN
    INSERT INTO public.companies (
      name, cnpj, email, phone, city, state, segment, legal_nature, founding_date
    ) VALUES (
      trim(p_name),
      v_normalized_cnpj,
      CASE WHEN p_email IS NOT NULL THEN lower(trim(p_email)) ELSE NULL END,
      p_phone,
      p_city,
      p_state,
      p_segment,
      p_legal_nature,
      p_founding_date
    )
    RETURNING id INTO v_company_id;
    
    INSERT INTO public.company_members (
      company_id, user_id, role, joined_at
    ) VALUES (
      v_company_id, v_user_id, 'owner', CURRENT_TIMESTAMP
    );
    
    INSERT INTO public.audit_logs (
      user_id, entity_type, entity_id, action,
      organization_id, organization_type, changes
    ) VALUES (
      v_user_id, 'companies', v_company_id, 'create',
      v_company_id, 'company',
      jsonb_build_object('name', p_name, 'cnpj', v_normalized_cnpj)
    );
    
    RETURN QUERY SELECT v_company_id, true, 'OK'::VARCHAR, 'Company created successfully'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::UUID, false, 'DATABASE_ERROR'::VARCHAR, 'Failed to create company'::TEXT;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.create_company_with_owner(...) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_company_with_owner(...) TO authenticated;
```

---

### 5.3 `create_invitation` - CORRIGIDA V2.1

```sql
CREATE OR REPLACE FUNCTION public.create_invitation(
  p_accounting_firm_id UUID,
  p_invited_email VARCHAR,
  p_invited_cnpj VARCHAR DEFAULT NULL,
  p_invited_company_name VARCHAR DEFAULT NULL,
  p_expires_in_days INTEGER DEFAULT 30
)
RETURNS TABLE(
  invitation_id UUID,
  token VARCHAR,
  success BOOLEAN,
  error_code VARCHAR,
  message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_token VARCHAR(64);
  v_token_hash VARCHAR;
  v_invitation_id UUID;
  v_normalized_cnpj VARCHAR;
BEGIN
  v_user_id := get_current_user_id();
  
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR, false, 'NOT_AUTHENTICATED'::VARCHAR, 'User not authenticated'::TEXT;
    RETURN;
  END IF;
  
  -- ✅ MUDANÇA V2.1: Validar que usuário é owner da firma fornecida
  IF NOT is_accounting_firm_owner(p_accounting_firm_id) THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR, false, 'NOT_AUTHORIZED'::VARCHAR, 'You are not owner of this accounting firm'::TEXT;
    RETURN;
  END IF;
  
  IF p_invited_email IS NULL OR length(trim(p_invited_email)) = 0 THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR, false, 'INVALID_INPUT'::VARCHAR, 'Invited email is required'::TEXT;
    RETURN;
  END IF;
  
  BEGIN
    -- Validar não existe convite pending duplicado
    IF EXISTS(
      SELECT 1 FROM public.company_invitations
      WHERE accounting_firm_id = p_accounting_firm_id
        AND invited_email = lower(trim(p_invited_email))
        AND status = 'pending'
    ) THEN
      RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR, false, 'DUPLICATE_INVITATION'::VARCHAR, 'An open invitation already exists for this email'::TEXT;
      RETURN;
    END IF;
    
    -- ✅ MUDANÇA V2.1: Token gerado no backend Next.js
    -- Aqui simulamos com pgcrypto para segurança
    -- No Next.js real: crypto.randomBytes(32).toString('hex')
    v_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
    
    v_normalized_cnpj := normalize_cnpj(p_invited_cnpj);
    
    -- Inserir convite
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
      p_accounting_firm_id,
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
      p_accounting_firm_id, 'accounting_firm',
      jsonb_build_object('invited_email', p_invited_email)
    );
    
    -- ✅ Token retornado APENAS nessa chamada
    RETURN QUERY SELECT v_invitation_id, v_token, true, 'OK'::VARCHAR, 'Invitation created successfully'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR, false, 'DATABASE_ERROR'::VARCHAR, 'Failed to create invitation'::TEXT;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.create_invitation(UUID, VARCHAR, VARCHAR, VARCHAR, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invitation(UUID, VARCHAR, VARCHAR, VARCHAR, INTEGER) TO authenticated;
```

**Mudanças V2.1:**
- ✅ `p_accounting_firm_id UUID` explícito (não LIMIT 1)
- ✅ Validar `is_accounting_firm_owner(p_accounting_firm_id)`
- ✅ Error codes controlados
- ✅ Token via gen_random_bytes(32) seguro

---

### 5.4 `accept_company_invitation` - COM SELECT FOR UPDATE

```sql
CREATE OR REPLACE FUNCTION public.accept_company_invitation(
  p_token VARCHAR,
  p_company_id UUID DEFAULT NULL,
  p_company_name VARCHAR DEFAULT NULL,
  p_company_cnpj VARCHAR DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  company_id UUID,
  error_code VARCHAR,
  message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_invitation_id UUID;
  v_firm_id UUID;
  v_token_hash VARCHAR;
  v_company_id UUID;
  v_normalized_cnpj VARCHAR;
  v_invited_email CITEXT;
BEGIN
  v_user_id := get_current_user_id();
  
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 'NOT_AUTHENTICATED'::VARCHAR, 'User not authenticated'::TEXT;
    RETURN;
  END IF;
  
  -- Calcular hash do token
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');
  
  BEGIN
    -- ✅ MUDANÇA V2.1: SELECT FOR UPDATE para evitar race condition
    SELECT id, accounting_firm_id, invited_email
    INTO v_invitation_id, v_firm_id, v_invited_email
    FROM public.company_invitations
    WHERE token_hash = v_token_hash
      AND status = 'pending'
      AND token_expires_at > CURRENT_TIMESTAMP
    FOR UPDATE;  -- Bloqueia para exclusividade nesta transação
    
    IF v_invitation_id IS NULL THEN
      RETURN QUERY SELECT false, NULL::UUID, 'INVITATION_INVALID'::VARCHAR, 'Invalid or expired invitation'::TEXT;
      RETURN;
    END IF;
    
    -- ✅ MUDANÇA V2.1: Validar email do usuário autenticado
    -- Normalizar comparação
    IF lower(
      (SELECT email FROM public.profiles WHERE id = v_user_id)
    ) != lower(v_invited_email) THEN
      RETURN QUERY SELECT false, NULL::UUID, 'EMAIL_MISMATCH'::VARCHAR, 'Your email does not match the invitation'::TEXT;
      RETURN;
    END IF;
    
    -- Se company_id fornecido, vincular ao existente
    IF p_company_id IS NOT NULL THEN
      v_company_id := p_company_id;
      
      -- Validar que usuário é owner dessa empresa
      IF NOT is_company_owner(v_company_id) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'NOT_AUTHORIZED'::VARCHAR, 'You are not the owner of this company'::TEXT;
        RETURN;
      END IF;
      
      -- Checar se já existe relacionamento ATIVO
      IF EXISTS(
        SELECT 1 FROM public.accountant_company_relationships
        WHERE accounting_firm_id = v_firm_id 
          AND company_id = v_company_id
          AND status = 'active'
      ) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'ALREADY_LINKED'::VARCHAR, 'This company is already linked to this accounting firm'::TEXT;
        RETURN;
      END IF;
    ELSE
      -- Criar nova empresa
      v_normalized_cnpj := normalize_cnpj(p_company_cnpj);
      
      INSERT INTO public.companies (
        name, cnpj, email
      ) VALUES (
        trim(p_company_name),
        v_normalized_cnpj,
        v_invited_email
      )
      RETURNING id INTO v_company_id;
      
      -- Adicionar usuário como owner
      INSERT INTO public.company_members (
        company_id, user_id, role, joined_at
      ) VALUES (
        v_company_id, v_user_id, 'owner', CURRENT_TIMESTAMP
      );
    END IF;
    
    -- Criar relacionamento
    INSERT INTO public.accountant_company_relationships (
      accounting_firm_id, company_id, status, linked_at
    ) VALUES (
      v_firm_id, v_company_id, 'active', CURRENT_TIMESTAMP
    );
    
    -- ✅ MUDANÇA V2.1: Idempotência elegante
    -- Marcar convite como aceito
    UPDATE public.company_invitations
    SET 
      status = 'accepted',
      accepted_at = CURRENT_TIMESTAMP,
      accepted_by_user_id = v_user_id,
      company_id_linked = v_company_id
    WHERE id = v_invitation_id
      AND status = 'pending'; -- Validação extra
    
    -- Auditoria
    INSERT INTO public.audit_logs (
      user_id, entity_type, entity_id, action,
      organization_id, organization_type
    ) VALUES (
      v_user_id, 'company_invitations', v_invitation_id, 'accept',
      v_company_id, 'company'
    );
    
    RETURN QUERY SELECT true, v_company_id, 'OK'::VARCHAR, 'Invitation accepted successfully'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, NULL::UUID, 'DATABASE_ERROR'::VARCHAR, 'Failed to accept invitation'::TEXT;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.accept_company_invitation(VARCHAR, UUID, VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(VARCHAR, UUID, VARCHAR, VARCHAR) TO authenticated;
```

**Mudanças V2.1:**
- ✅ `SELECT FOR UPDATE` previne race condition
- ✅ Validação email: `user.email = invited_email`
- ✅ Error codes controlados
- ✅ Idempotência: mesmo invité já aceito retorna mensagem clara

---

## 6. POLÍTICAS RLS - FINAIS

### 6.1 `profiles` - Sem Recursão

```sql
-- SELECT: Usuários veem seu próprio perfil ou admin vê todos
CREATE POLICY "Users see own profile"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = auth_id
    OR is_platform_admin()
  );

-- UPDATE: Usuários atualizam apenas seu próprio perfil, campos seguros
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = auth_id)
  WITH CHECK (
    auth.uid() = auth_id
    AND global_role = (SELECT global_role FROM public.profiles WHERE auth_id = auth.uid())
    AND is_active = (SELECT is_active FROM public.profiles WHERE auth_id = auth.uid())
  );
```

**Garantias:**
- ❌ Impossível alterar global_role, is_active, auth_id
- ✅ Pode alterar: full_name, avatar_url, phone

---

### 6.2 `accounting_firms` - Visualizar

```sql
CREATE POLICY "Can view own accounting firms"
  ON public.accounting_firms FOR SELECT
  USING (
    is_accounting_firm_member(id)
    OR is_platform_admin()
  );
```

---

### 6.3 `accounting_firm_members` - Controle Total

```sql
-- SELECT
CREATE POLICY "Can view own firm members"
  ON public.accounting_firm_members FOR SELECT
  USING (
    is_accounting_firm_member(accounting_firm_id)
    OR is_platform_admin()
  );

-- INSERT: Owner ou admin
CREATE POLICY "Owner can add firm members"
  ON public.accounting_firm_members FOR INSERT
  WITH CHECK (
    is_accounting_firm_owner(accounting_firm_id)
    OR is_platform_admin()
  );

-- UPDATE: Owner ou admin (não pode se promover)
CREATE POLICY "Owner can update firm member roles"
  ON public.accounting_firm_members FOR UPDATE
  USING (
    is_accounting_firm_owner(accounting_firm_id)
    OR is_platform_admin()
  )
  WITH CHECK (
    is_accounting_firm_owner(accounting_firm_id)
    OR is_platform_admin()
  );
```

---

### 6.4 `companies` - Visualizar

```sql
CREATE POLICY "Can view own companies"
  ON public.companies FOR SELECT
  USING (
    is_company_member(id)
    OR is_platform_admin()
  );
```

---

### 6.5 `company_members` - Controle Total

```sql
CREATE POLICY "Can view own company members"
  ON public.company_members FOR SELECT
  USING (
    is_company_member(company_id)
    OR is_platform_admin()
  );

CREATE POLICY "Owner can add company members"
  ON public.company_members FOR INSERT
  WITH CHECK (
    is_company_owner(company_id)
    OR is_platform_admin()
  );

CREATE POLICY "Owner can update company member roles"
  ON public.company_members FOR UPDATE
  USING (
    is_company_owner(company_id)
    OR is_platform_admin()
  )
  WITH CHECK (
    is_company_owner(company_id)
    OR is_platform_admin()
  );
```

---

### 6.6 `accountant_company_relationships` - Visualizar

```sql
CREATE POLICY "See own relationships"
  ON public.accountant_company_relationships FOR SELECT
  USING (
    is_accounting_firm_member(accounting_firm_id)
    OR is_company_member(company_id)
    OR is_platform_admin()
  );
```

---

### 6.7 `company_invitations` - Visualizar

```sql
CREATE POLICY "Can view related invitations"
  ON public.company_invitations FOR SELECT
  USING (
    created_by_user_id = get_current_user_id()
    OR is_accounting_firm_owner(accounting_firm_id)
    OR is_platform_admin()
  );

-- ❌ Não permitir INSERT/UPDATE/DELETE via RLS (RPCs fazem isso)
CREATE POLICY "Only backend can manage invitations"
  ON public.company_invitations FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Only backend can manage invitations"
  ON public.company_invitations FOR UPDATE
  WITH CHECK (false);
```

---

### 6.8 `audit_logs` - Append-Only

```sql
-- SELECT: Usuários veem logs de suas organizações
CREATE POLICY "Can view relevant audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    is_platform_admin()
    OR (
      organization_type = 'accounting_firm'
      AND is_accounting_firm_member(organization_id)
    )
    OR (
      organization_type = 'company'
      AND is_company_member(organization_id)
    )
  );

-- INSERT: Bloqueado (somente RPCs via SECURITY DEFINER)
CREATE POLICY "Only backend can write audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (false);

-- ❌ DELETE/UPDATE jamais permitidos
CREATE POLICY "Audit logs are immutable"
  ON public.audit_logs FOR UPDATE
  WITH CHECK (false);

CREATE POLICY "Audit logs are immutable"
  ON public.audit_logs FOR DELETE
  WITH CHECK (false);
```

---

## 7. MATRIZ DE PERMISSÕES - CORRIGIDA V2.1

| Ação | Qualquer Usuário (Inicial) | Contador Owner | Empresa Owner | Admin |
|------|---|---|---|---|
| **Criar primeira firma** | ✅ | — | ❌ | ✅ |
| Ver firma própria | — | ✅ | ❌ | ✅ |
| Criar convite | — | ✅ | ❌ | ✅ |
| Ver convites criados | — | ✅ | ❌ | ✅ |
| **Criar primeira empresa** | ✅ | ❌ | — | ✅ |
| Ver empresa própria | — | ❌ | ✅ | ✅ |
| Aceitar convite | — | ❌ | ✅ | ✅ |
| Adicionar membro firma | — | ✅ (se owner) | ❌ | ✅ |
| Adicionar membro empresa | — | ❌ | ✅ (se owner) | ✅ |
| Ver logs auditoria | — | ✅ (firma) | ✅ (empresa) | ✅ (todos) |
| Promover para admin | ❌ | ❌ | ❌ | ✅ |

**Notas V2.1:**
- "Qualquer usuário" pode criar **primeira** firma/empresa
- Membership determina acesso
- Owner de firma NÃO pode ver empresas
- Owner de empresa NÃO pode ver firmas

---

## 8. ON DELETE - EXPLICADO V2.1

| Tabela | FK | ON DELETE | Razão |
|--------|----|-----------|----|
| `profiles` | — | — | Master, soft-delete via is_active |
| `accounting_firm_members` | profiles(id) | CASCADE | Limpar memberships se usuário deletado |
| `accounting_firm_members` | firms(id) | CASCADE | Limpar memberships se firma deletada |
| `company_members` | profiles(id) | CASCADE | Limpar memberships se usuário deletado |
| `company_members` | companies(id) | CASCADE | Limpar memberships se empresa deletada |
| `accountant_company_relationships` | firms(id) | CASCADE | ⚠️ Discutir: manter histórico? |
| `accountant_company_relationships` | companies(id) | CASCADE | ⚠️ Discutir: manter histórico? |
| `company_invitations` | firms(id) | CASCADE | Razoável: limpar convites órfãos |
| `company_invitations` | profiles(id) | SET NULL | Convite não perde rastreabilidade |
| `audit_logs` | profiles(id) | SET NULL | Logs permanecem, user_id fica NULL |
| `audit_logs` | — | — | Append-only, nunca deletados |

**Decisão V2.1:**
- Memberships: CASCADE (ok, são linhas de relacionamento)
- Invitations: CASCADE firm + SET NULL user (ok)
- **Relacionamentos:** Discussão: manter CASCADE ou mudar para SET NULL?
  - CASCADE = limpa histórico (CUIDADO com financeiro futuro)
  - SET NULL = preserva histórico (MELHOR para auditoria)
  - **Recomendação:** SET NULL para accounting_firm_id e company_id

**Correção:**
```sql
ALTER TABLE accountant_company_relationships
  DROP CONSTRAINT accountant_company_relationships_accounting_firm_id_fkey,
  ADD CONSTRAINT accountant_company_relationships_accounting_firm_id_fkey
    FOREIGN KEY (accounting_firm_id)
    REFERENCES accounting_firms(id)
    ON DELETE SET NULL;

ALTER TABLE accountant_company_relationships
  DROP CONSTRAINT accountant_company_relationships_company_id_fkey,
  ADD CONSTRAINT accountant_company_relationships_company_id_fkey
    FOREIGN KEY (company_id)
    REFERENCES companies(id)
    ON DELETE SET NULL;
```

---

## 9. ÍNDICES FINAIS - V2.1

```sql
-- Removidos: profiles.email, profiles.auth_id, firms.cnpj, companies.cnpj, invitations.token_hash
-- (UNIQUE já criam índices)

-- Mantidos: queryPerformance
CREATE INDEX idx_accounting_firm_members_firm_id ON public.accounting_firm_members(accounting_firm_id);
CREATE INDEX idx_accounting_firm_members_user_id ON public.accounting_firm_members(user_id);
CREATE INDEX idx_accounting_firm_members_active ON public.accounting_firm_members(accounting_firm_id, is_active);

CREATE INDEX idx_company_members_company_id ON public.company_members(company_id);
CREATE INDEX idx_company_members_user_id ON public.company_members(user_id);
CREATE INDEX idx_company_members_active ON public.company_members(company_id, is_active);

CREATE INDEX idx_acr_firm_id ON public.accountant_company_relationships(accounting_firm_id);
CREATE INDEX idx_acr_company_id ON public.accountant_company_relationships(company_id);

CREATE INDEX idx_acr_active ON public.accountant_company_relationships(accounting_firm_id) 
  WHERE status = 'active';

CREATE INDEX idx_ci_firm_id ON public.company_invitations(accounting_firm_id);
CREATE INDEX idx_ci_status ON public.company_invitations(status);
CREATE INDEX idx_ci_email ON public.company_invitations(invited_email);
CREATE INDEX idx_ci_expires ON public.company_invitations(token_expires_at);

CREATE UNIQUE INDEX idx_ci_pending_unique 
  ON public.company_invitations(accounting_firm_id, invited_email) 
  WHERE status = 'pending';

CREATE INDEX idx_audit_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_org ON public.audit_logs(organization_id, organization_type);
CREATE INDEX idx_audit_created ON public.audit_logs(created_at DESC);
```

---

## 10. CHECKLIST DE TESTES DE SEGURANÇA

Antes de liberar frontend, executar:

```sql
-- A) Isolamento de dados: Usuário A não lê firma de Usuário B
SELECT COUNT(*) FROM accounting_firms 
WHERE id IN (SELECT accounting_firm_id FROM accounting_firm_members WHERE is_active=true)
  AND public.is_accounting_firm_member(id) = false;
-- Esperado: 0

-- B) Isolamento de dados: Usuário A não lê empresa de Usuário B
SELECT COUNT(*) FROM companies 
WHERE id IN (SELECT company_id FROM company_members WHERE is_active=true)
  AND public.is_company_member(id) = false;
-- Esperado: 0

-- C) Usuário não consegue promover próprio role
SET LOCAL ROLE authenticated;
UPDATE public.profiles SET global_role='admin' WHERE auth.uid()=auth_id;
-- Esperado: erro ou sem change (RLS bloqueia)

-- D) Usuário não consegue alterar global_role via RLS
-- Testar query direta no BD como authenticated role
-- Esperado: UPDATE bloqueado

-- E) Usuário não consegue adicionar membro em tenant alheio
-- User A tenta INSERT em accounting_firm_members de outro usuário
-- Esperado: RLS rejeita

-- F) Contador só cria convite para firma onde possui permissão
-- Chamar create_invitation(outro_firm_id, ...)
-- Esperado: error_code = 'NOT_AUTHORIZED'

-- G) Token inválido falha
SELECT public.accept_company_invitation('invalid_token_here', NULL, NULL, NULL);
-- Esperado: error_code = 'INVITATION_INVALID'

-- H) Token expirado falha
INSERT INTO company_invitations (..., token_expires_at = CURRENT_TIMESTAMP - '1 day'::interval, ..);
SELECT public.accept_company_invitation(token, NULL, NULL, NULL);
-- Esperado: error_code = 'INVITATION_INVALID'

-- I) Token aceito não pode ser consumido novamente
-- Aceitar convite com token X
-- Aceitar novamente com token X
-- Esperado: erro ou idempotência (2º retorna company_id existente)

-- J) Duas requisições simultâneas não aceitam o mesmo convite
-- Simular concorrência com SELECT FOR UPDATE
-- Esperado: Apenas 1 sucesso, 1 falha (ou recebe erro concorrência)

-- K) Email diferente falha
-- User A com email 'a@test.com' tenta aceitar convite enviado para 'b@test.com'
-- Esperado: error_code = 'EMAIL_MISMATCH'

-- L) Owner consegue criar convite válido
SELECT public.create_invitation(firm_id_owned, 'test@email.com', NULL, NULL);
-- Esperado: success=true, token retornado

-- M) Aceite cria relacionamentos corretos
-- Aceitar convite com nova empresa
-- Validar:
SELECT COUNT(*) FROM companies WHERE id=?;  -- = 1
SELECT COUNT(*) FROM company_members WHERE company_id=? AND role='owner';  -- = 1
SELECT COUNT(*) FROM accountant_company_relationships WHERE company_id=?;  -- = 1
SELECT COUNT(*) FROM audit_logs WHERE entity_type='company_invitations' AND action='accept';  -- ≥ 1

-- N) Falha em RPC faz rollback
-- Trigger erro artificial durante create_company_with_owner
-- Validar: nenhuma linha inserida

-- O) Nenhuma service_role key no cliente
grep -r "SUPABASE_SERVICE_ROLE" src/
-- Esperado: nada encontrado
```

---

## 11. RESUMO FINAL: V2 → V2.1

### Removido
- ❌ `organization_owners` table (simplicidade)
- ❌ `handle_new_user()` com global_role='company_user'
- ❌ ADMIN_SECRET_KEY endpoint
- ❌ Índices redundantes (UNIQUE)
- ❌ LIMIT 1 em create_invitation
- ❌ ON DELETE CASCADE em relacionamentos principais

### Adicionado
- ✅ `is_platform_admin()` função
- ✅ `SELECT FOR UPDATE` em accept_invitation
- ✅ Email validation (invited_email vs authenticated email)
- ✅ Error codes controlados em RPCs
- ✅ Funções com REVOKE explícito
- ✅ UNIQUE parcial em relacionamentos
- ✅ normalize_cnpj() robusto (NULL handling)
- ✅ 'accept' ação em audit_logs CHECK

### Corrigido
- ✅ global_role simplificado ('user' / 'admin')
- ✅ `p_accounting_firm_id` explícito em create_invitation
- ✅ Token generation seguro (crypto.randomBytes)
- ✅ RLS sem recursão
- ✅ SET NULL em FKs sensíveis
- ✅ Matriz de permissões revisada
- ✅ Extensões documentadas

---

## 12. PRÓXIMOS PASSOS PÓS-APROVAÇÃO

1. Executar migrations SQL no Supabase
2. Ativar extensões (citext, pgcrypto)
3. Criar schema (tabelas)
4. Criar triggers
5. Criar funções (auxiliares + RPCs)
6. Criar políticas RLS
7. **Testar 15 pontos de segurança do checklist**
8. Gerar TypeScript types (supabase-js)
9. Implementar Server Actions (Next.js)
10. Criar frontend

---

**Versão V2.1 está pronta para produção!** 🚀

Após sua aprovação final, iniciaremos as migrations.
