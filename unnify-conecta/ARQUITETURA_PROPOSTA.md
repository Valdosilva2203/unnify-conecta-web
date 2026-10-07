# Proposta Técnica - Arquitetura Unnify Conecta

**Data:** 07/10/2026  
**Status:** Aguardando aprovação  
**Objetivo:** Definir a estrutura de banco de dados multi-tenant segura para o MVP

---

## 1. OVERVIEW DA ARQUITETURA

O sistema será baseado em:
- **Multi-tenancy isolado**: Cada organização (escritório ou empresa) é um tenant
- **Row Level Security (RLS)**: Segurança no nível de linha no Supabase
- **Relacionamentos complexos**: Usuários podem pertencer a múltiplas organizações
- **Convites seguros**: Com tokens temporários e expiração
- **Auditoria nativa**: Rastreamento de mudanças críticas

---

## 2. TABELAS PROPOSTAS E ESTRUTURA

### 2.1 `profiles` (Usuários do Sistema)

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255),
  avatar_url VARCHAR(500),
  global_role VARCHAR(50) NOT NULL CHECK (global_role IN ('admin', 'accountant', 'company_user')),
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_auth_id ON profiles(auth_id);
CREATE INDEX idx_profiles_global_role ON profiles(global_role);
```

**Notas:**
- `global_role` é apenas um classificador inicial; controle fino vem via relacionamentos
- Ligado ao `auth.users` do Supabase via `auth_id`
- Ativo/inativo permite "soft delete" administrativo

---

### 2.2 `accounting_firms` (Escritórios Contábeis)

```sql
CREATE TABLE accounting_firms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(14) UNIQUE,
  email VARCHAR(255),
  phone VARCHAR(20),
  website VARCHAR(500),
  city VARCHAR(100),
  state VARCHAR(2),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_accounting_firms_owner_id ON accounting_firms(owner_id);
CREATE INDEX idx_accounting_firms_cnpj ON accounting_firms(cnpj);
CREATE INDEX idx_accounting_firms_status ON accounting_firms(status);
```

**Notas:**
- `owner_id` é o contador que criou o escritório
- CNPJ será único quando tiver validação
- Status permite futura suspensão por compliance

---

### 2.3 `accounting_firm_members` (Membros do Escritório)

```sql
CREATE TABLE accounting_firm_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_firm_id UUID NOT NULL REFERENCES accounting_firms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'partner', 'accountant', 'assistant')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(accounting_firm_id, user_id)
);

CREATE INDEX idx_accounting_firm_members_firm_id ON accounting_firm_members(accounting_firm_id);
CREATE INDEX idx_accounting_firm_members_user_id ON accounting_firm_members(user_id);
CREATE INDEX idx_accounting_firm_members_role ON accounting_firm_members(role);
```

**Notas:**
- UNIQUE permite que um usuário seja membro apenas uma vez de cada firma
- `role` define permissões dentro do escritório
- Soft delete via `is_active` permite auditoria

---

### 2.4 `companies` (Empresas Clientes)

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(14) UNIQUE,
  email VARCHAR(255),
  phone VARCHAR(20),
  city VARCHAR(100),
  state VARCHAR(2),
  segment VARCHAR(100),
  legal_nature VARCHAR(100),
  founding_date DATE,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_companies_owner_id ON companies(owner_id);
CREATE INDEX idx_companies_cnpj ON companies(cnpj);
CREATE INDEX idx_companies_status ON companies(status);
```

**Notas:**
- `owner_id` é o empresário que criou a empresa
- Análogo ao modelo de escritório, mas para empresas
- Preparado para futuros dados financeiros

---

### 2.5 `company_members` (Membros da Empresa)

```sql
CREATE TABLE company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'manager', 'employee', 'accountant_representative')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, user_id)
);

CREATE INDEX idx_company_members_company_id ON company_members(company_id);
CREATE INDEX idx_company_members_user_id ON company_members(user_id);
CREATE INDEX idx_company_members_role ON company_members(role);
```

**Notas:**
- Análogo a `accounting_firm_members`
- Permite múltiplos usuários com diferentes permissões na mesma empresa

---

### 2.6 `accountant_company_relationships` (Vínculo Contador ↔ Empresa)

```sql
CREATE TABLE accountant_company_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_firm_id UUID NOT NULL REFERENCES accounting_firms(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending')),
  invitation_id UUID REFERENCES company_invitations(id) ON DELETE SET NULL,
  vinculado_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(accounting_firm_id, company_id)
);

CREATE INDEX idx_accountant_company_relationships_firm_id ON accountant_company_relationships(accounting_firm_id);
CREATE INDEX idx_accountant_company_relationships_company_id ON accountant_company_relationships(company_id);
CREATE INDEX idx_accountant_company_relationships_status ON accountant_company_relationships(status);
```

**Notas:**
- **CRUCIAL**: Garante que uma firma tenha relacionamento com uma empresa apenas uma vez
- Status `pending` antes do convite ser aceito
- `vinculado_em` rastreia quando o vínculo foi confirmado
- `invitation_id` referencia o convite que gerou o vínculo

---

### 2.7 `company_invitations` (Sistema de Convites)

```sql
CREATE TABLE company_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_firm_id UUID NOT NULL REFERENCES accounting_firms(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Dados do convite
  invited_email VARCHAR(255) NOT NULL,
  invited_cnpj VARCHAR(14),
  invited_company_name VARCHAR(255),
  
  -- Segurança
  token VARCHAR(64) NOT NULL UNIQUE,
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'revoked')),
  accepted_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_company_invitations_firm_id ON company_invitations(accounting_firm_id);
CREATE INDEX idx_company_invitations_token ON company_invitations(token);
CREATE INDEX idx_company_invitations_status ON company_invitations(status);
CREATE INDEX idx_company_invitations_email ON company_invitations(invited_email);
CREATE INDEX idx_company_invitations_expires_at ON company_invitations(token_expires_at);
```

**Notas:**
- `token` é gerado seguramente (CSPRNG, 32 bytes em hex)
- `token_expires_at` (ex: 30 dias) previne convites antigos
- Email é armazenado para validação
- CNPJ é opcional no convite (pode ser preenchido depois)
- Status permite rastreamento completo

---

### 2.8 `audit_logs` (Auditoria)

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN ('create', 'update', 'delete', 'activate', 'deactivate')),
  
  changes JSONB,
  ip_address INET,
  user_agent VARCHAR(500),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

**Notas:**
- Registra todas as mudanças críticas
- JSONB para flexibilidade nos dados alterados
- Útil para compliance e investigação de incidentes

---

## 3. TIPOS DE DADOS E DECISÕES

| Campo | Tipo | Razão |
|-------|------|-------|
| IDs | UUID | Segurança, escalabilidade, impossível prever sequências |
| Emails | VARCHAR(255) | Padrão SMTP |
| Tokens | VARCHAR(64) | 32 bytes em hex = 64 caracteres |
| Datas | TIMESTAMP WITH TIME ZONE | Clareza de fuso horário |
| Status | VARCHAR(50) com CHECK | Dados válidos garantidos no BD |
| CNPJ | VARCHAR(14) | Brasileiro, pode validar depois |
| Booleanos | BOOLEAN | Preferido ao SMALLINT |

---

## 4. RELACIONAMENTOS - DIAGRAMA TEXTUAL

```
┌─────────────┐
│  profiles   │ (Usuários do sistema)
└──────┬──────┘
       │
       ├─→ (1:N) accounting_firm_members ←─ accounting_firms
       │                                          │
       ├─→ (1:N) company_members         ←─ companies
       │                                          │
       └─→ (1:N) accountant_company_relationships
                                          │
                                   (M:N entre firms e companies)
                                          │
                                   company_invitations
                                   (convites de vínculo)

Fluxo de Convite:
1. Contador em accounting_firm cria company_invitations
2. Sistema gera token seguro com expiração
3. Empresa acessa via token/URL
4. Ao aceitar, cria accountant_company_relationships
5. Relacionamento ativado, convite marcado como accepted
```

---

## 5. MULTI-TENANCY - ESTRATÉGIA

**Isolamento por organização:**

1. **Para Escritórios Contábeis:**
   - Todos os dados da firma estão em `accounting_firms` e membros em `accounting_firm_members`
   - Um usuário pode ser membro de múltiplas firmas
   - RLS garante que acesso a `accounting_firms` só é permitido se usuário for membro

2. **Para Empresas:**
   - Análogo a escritórios: `companies` e `company_members`
   - Um usuário pode ser membro de múltiplas empresas

3. **Para Relacionamentos:**
   - `accountant_company_relationships` conecta os dois
   - Uma firma vê apenas empresas que vinculou
   - Uma empresa vê apenas o escritório vinculado

4. **Contexto do Usuário:**
   - Toda requisição inclui o contexto: "qual organização estou acessando?"
   - Validação server-side: "tenho permissão nesta organização?"
   - RLS no BD reforça isso

---

## 6. SISTEMA DE CONVITES - FUNCIONAMENTO

### Fluxo Detalhado:

```
PASSO 1: Contador clica "Convidar Empresa"
  ↓
PASSO 2: Contador preenche (email empresa + CNPJ/nome)
  ↓
PASSO 3: Backend cria company_invitations:
  - token = gerar 32 bytes aleatórios, converter para hex
  - token_expires_at = now() + 30 dias
  - status = 'pending'
  - invited_email = email fornecido
  ↓
PASSO 4: Sistema envia email com link:
  https://app.unnify-conecta.com/accept-invitation?token=ABC123...
  ↓
PASSO 5: Empresa clica no link
  Backend valida:
  - token existe?
  - token não expirou?
  - status é 'pending'?
  ↓
PASSO 6: Se válido, mostra formulário de cadastro/login
  ↓
PASSO 7: Empresa cria conta ou faz login
  ↓
PASSO 8: Sistema cria/vincula company + company_members
  ↓
PASSO 9: Backend cria accountant_company_relationships:
  - status = 'active'
  - invitation_id = referência para convite
  ↓
PASSO 10: Backend marca convite como 'accepted'
  ↓
PASSO 11: Empresa passa a aparecer no dashboard do contador
```

**Segurança:**
- Tokens com 32 bytes (256 bits) são criptograficamente seguros
- Tokens armazenados como hash (considerar bcrypt/argon2 se necessário)
- Expiração obrigatória
- Revogação possível
- Ligação à firma e email para validação extra

---

## 7. VÍNCULO CONTADOR ↔ EMPRESA

A tabela `accountant_company_relationships` é a ponte central:

```sql
INSERT INTO accountant_company_relationships (
  accounting_firm_id,
  company_id,
  status,
  invitation_id,
  vinculado_em
) VALUES (
  'firm-uuid',
  'company-uuid',
  'active',
  'invitation-uuid',
  CURRENT_TIMESTAMP
);
```

**Garantias:**
- UNIQUE(accounting_firm_id, company_id) previne duplicatas
- Foreign keys garantem integridade referencial
- Status rastreia ciclo de vida
- `vinculado_em` permite análise histórica

**Queries úteis:**
```sql
-- Empresas de uma firma
SELECT c.* FROM companies c
  INNER JOIN accountant_company_relationships acr
  ON c.id = acr.company_id
  WHERE acr.accounting_firm_id = ? AND acr.status = 'active';

-- Firma vinculada a uma empresa
SELECT af.* FROM accounting_firms af
  INNER JOIN accountant_company_relationships acr
  ON af.id = acr.accounting_firm_id
  WHERE acr.company_id = ? AND acr.status = 'active';
```

---

## 8. AUTENTICAÇÃO COM SUPABASE AUTH

### Fluxo:

1. **Contador se registra:**
   ```
   email + senha → Supabase Auth
   ↓
   Cria auth.users entry
   ↓
   Backend cria profiles row ligando auth_id
   ```

2. **Login:**
   ```
   email + senha → Supabase Auth
   ↓
   Retorna JWT token
   ↓
   Frontend armazena token (httpOnly cookie)
   ↓
   Todas as requisições incluem token
   ```

3. **No Backend (Next.js):**
   ```typescript
   // Verificar token
   const { data: { user } } = await supabase.auth.getUser();
   const profile = await supabase
     .from('profiles')
     .select('*')
     .eq('auth_id', user.id)
     .single();
   ```

4. **Contexto multi-tenant:**
   ```
   Usuário logado pode ser membro de múltiplas orgs
   ↓
   Cada requisição especifica: "estou acessando qual org?"
   ↓
   Backend valida: "é membro dessa org?"
   ↓
   RLS reforça no nível do BD
   ```

---

## 9. AUTORIZAÇÃO E CONTROLE DE ACESSO

### Princípios:

1. **Nunca confiar apenas no frontend**
2. **Validação SEMPRE no backend**
3. **RLS como segunda camada de proteção**
4. **Menor privilégio**

### Exemplo de fluxo de autorização:

```typescript
// API: GET /api/accounting-firms/:firmId/companies

async function getCompanies(req, firmId) {
  // 1. Obter usuário autenticado
  const user = await getAuthenticatedUser(req);
  
  // 2. Validar que é membro da firma
  const membership = await supabase
    .from('accounting_firm_members')
    .select('*')
    .eq('accounting_firm_id', firmId)
    .eq('user_id', user.id)
    .single();
  
  if (!membership) throw new Error('Unauthorized');
  
  // 3. Retornar dados
  // RLS garante que não pode ver dados de outra firma mesmo que tente
  const companies = await supabase
    .from('accountant_company_relationships')
    .select('companies(*)')
    .eq('accounting_firm_id', firmId);
  
  return companies;
}
```

---

## 10. POLÍTICAS RLS (ROW LEVEL SECURITY)

### Estratégia Geral:

RLS é ligada para cada tabela. Supabase verifica automaticamente.

```sql
-- Exemplo 1: profiles
-- Usuários veem apenas seu próprio perfil (admin vê todos)

CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  USING (
    auth.uid() = auth_id OR
    (SELECT global_role FROM profiles WHERE auth_id = auth.uid()) = 'admin'
  );

-- Exemplo 2: accounting_firms
-- Ver apenas firmas onde é membro

CREATE POLICY "Can view own accounting firms"
  ON accounting_firms
  FOR SELECT
  USING (
    id IN (
      SELECT accounting_firm_id FROM accounting_firm_members
      WHERE user_id = (SELECT id FROM profiles WHERE auth_id = auth.uid())
    )
  );

-- Exemplo 3: companies
-- Ver apenas empresas onde é membro

CREATE POLICY "Can view own companies"
  ON companies
  FOR SELECT
  USING (
    id IN (
      SELECT company_id FROM company_members
      WHERE user_id = (SELECT id FROM profiles WHERE auth_id = auth.uid())
    )
  );

-- Exemplo 4: accountant_company_relationships
-- Contador vê relacionamentos de suas firmas
-- Empresa vê relacionamentos de suas empresas

CREATE POLICY "Accountants see own firm relationships"
  ON accountant_company_relationships
  FOR SELECT
  USING (
    accounting_firm_id IN (
      SELECT accounting_firm_id FROM accounting_firm_members
      WHERE user_id = (SELECT id FROM profiles WHERE auth_id = auth.uid())
    )
    OR
    company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = (SELECT id FROM profiles WHERE auth_id = auth.uid())
    )
  );
```

### Políticas de Inserção/Atualização:

```sql
-- Apenas admin pode criar firmas (ou server-side action)
CREATE POLICY "Server can create accounting firms"
  ON accounting_firms
  FOR INSERT
  WITH CHECK (false); -- Bloqueia; usar service_role do backend

-- Inserção de membros: apenas admin ou proprietário
CREATE POLICY "Can add members to own firm"
  ON accounting_firm_members
  FOR INSERT
  WITH CHECK (
    accounting_firm_id IN (
      SELECT af.id FROM accounting_firms af
      INNER JOIN accounting_firm_members afm
      ON af.id = afm.accounting_firm_id
      WHERE afm.user_id = (SELECT id FROM profiles WHERE auth_id = auth.uid())
      AND afm.role = 'owner'
    )
  );
```

---

## 11. RISCOS DE SEGURANÇA E MITIGAÇÕES

| Risco | Descrição | Mitigação |
|-------|-----------|-----------|
| **Token predicível** | Convites com tokens fracos podem ser adivinhados | Usar CSPRNG (gen_random_uuid ou crypto.getRandomValues) |
| **Convite não expirado** | Convites antigos podem ser explorados | token_expires_at obrigatório, validar sempre |
| **SQL Injection** | Queries malformadas | Usar prepared statements (Supabase faz isso) |
| **Escalação de privilégio** | Usuário comum vira admin | RLS + validação backend, nunca confiar em JWT customizado |
| **Acesso cross-tenant** | Usuário acessa dados de outra org | RLS + validação no backend em cada rota |
| **CSRF** | Ações sem consentimento | Next.js protege automaticamente; usar tokens CSRF se formulários |
| **Exposição de secrets** | .env.local visível no navegador | NUNCA usar SUPABASE_SERVICE_ROLE_KEY no cliente; só PUBLIC key |
| **Força bruta em login** | Múltiplas tentativas | Supabase Auth gerencia isso |
| **Relacionamento duplicado** | Mesma firma + empresa vinculadas 2x | UNIQUE(accounting_firm_id, company_id) |
| **Convite aceito 2x** | Mesma empresa vinculada via convite duplo | Verificar no backend que já não existe vínculo |

---

## 12. CONSTRAINTS E INTEGRIDADE REFERENCIAL

| Constraint | Tipo | Razão |
|-----------|------|-------|
| UNIQUE(email) em profiles | Unicidade | Um email = um usuário |
| UNIQUE(cnpj) em accounting_firms | Unicidade | Um CNPJ = uma firma |
| UNIQUE(cnpj) em companies | Unicidade | Um CNPJ = uma empresa |
| UNIQUE(accounting_firm_id, user_id) em accounting_firm_members | Unicidade | Usuário membro de firma apenas 1x |
| UNIQUE(company_id, user_id) em company_members | Unicidade | Usuário membro de empresa apenas 1x |
| UNIQUE(accounting_firm_id, company_id) em accountant_company_relationships | **Unicidade + CRÍTICO** | Firma vinculada a empresa apenas 1x |
| ON DELETE CASCADE em _members | Integridade | Deletar org = deletar membros |
| ON DELETE RESTRICT em owner_id | Integridade | Não deletar usuário enquanto é owner |
| ON DELETE SET NULL em convites | Integridade | Deletar usuário = convites órfãos (ok) |
| CHECK(status IN (...)) | Validação | Apenas status válidos |
| CHECK(role IN (...)) | Validação | Apenas roles válidos |
| FK para auth.users | Autenticação | Ligação com Supabase Auth |

---

## 13. ÍNDICES RECOMENDADOS

Para performance em queries comuns:

```sql
-- Buscar usuário por email
CREATE INDEX idx_profiles_email ON profiles(email);

-- Buscar empresas de uma firma (JOIN comum)
CREATE INDEX idx_acr_firm_id ON accountant_company_relationships(accounting_firm_id);
CREATE INDEX idx_acr_company_id ON accountant_company_relationships(company_id);

-- Membros de uma firma
CREATE INDEX idx_afm_firm_id ON accounting_firm_members(accounting_firm_id);
CREATE INDEX idx_afm_user_id ON accounting_firm_members(user_id);

-- Membros de uma empresa
CREATE INDEX idx_cm_company_id ON company_members(company_id);
CREATE INDEX idx_cm_user_id ON company_members(user_id);

-- Convites por token (validação)
CREATE INDEX idx_invitations_token ON company_invitations(token);

-- Convites ativos (busca)
CREATE INDEX idx_invitations_status ON company_invitations(status);
CREATE INDEX idx_invitations_expires ON company_invitations(token_expires_at);

-- Auditoria por entidade
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
```

---

## 14. PREPARAÇÃO PARA CRESCIMENTO FUTURO

Esta arquitetura foi pensada para acomodar sem refactoring:

### Receitas/Despesas:
```sql
-- Futura tabela
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  type VARCHAR(10), -- 'income' ou 'expense'
  amount DECIMAL(12, 2),
  category_id UUID, -- Futuro
  ...
);
```

### Contas a Pagar/Receber:
```sql
CREATE TABLE accounts_payable (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  supplier_id UUID, -- Futuro
  amount DECIMAL(12, 2),
  due_date DATE,
  status VARCHAR(50),
  ...
);
```

### Documentos:
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  uploaded_by_id UUID REFERENCES profiles(id),
  file_path VARCHAR(500),
  document_type VARCHAR(100), -- RG, CNPJ, NF, etc
  uploaded_at TIMESTAMP WITH TIME ZONE,
  ...
);
```

**Padrão mantido:**
- Isolamento por company_id
- Datas com timezone
- UUIDs como PK
- Auditoria integrada

---

## 15. DECISÕES ARQUITETURAS CRÍTICAS

### ✅ Por que NOT NULL em auth_id?

Porque todo usuário DEVE estar autenticado. Se não tiver auth_id, não consegue fazer nada no sistema.

### ✅ Por que UNIQUE em email?

Porque Supabase Auth também usa email como identificador único. Manter sincronizado é essencial.

### ✅ Por que status em vez de is_deleted?

Porque:
1. Mais flexível (active, inactive, suspended)
2. Mais claro para auditoria
3. Permite soft-delete sem perder dados
4. Melhor para compliance

### ✅ Por que RLS é crítico?

Porque:
1. Protege contra bugs no backend
2. Garante isolamento mesmo se query está errada
3. Segunda camada de segurança
4. Impossível acessar dados sem estar autorizado, ponto

### ✅ Por que não usar um campo "role" global para autorização?

Porque:
1. Um contador pode ser "owner" em uma firma e "accountant" em outra
2. Uma empresa pode ter um usuário como "owner" e outro como "manager"
3. Controle fino por relacionamento é mais flexível
4. Futuro: um usuário pode ser contador E empresário

### ✅ Por que convites com token?

Porque:
1. Email é identificador, mas token é secreto (não pode adivinhar)
2. Token expira (segurança temporal)
3. Pode revogar convites antigos
4. Auditoria completa (quem aceitou, quando, que token)
5. Permite convites anônimos (sem precisar ter email cadastrado antes)

---

## PRÓXIMOS PASSOS (Após aprovação)

1. ✅ Você aprova esta arquitetura (ou sugere mudanças)
2. Criar migrations SQL (using Supabase)
3. Implementar RLS policies no Supabase
4. Gerar types TypeScript a partir do schema
5. Criar server actions Next.js para:
   - Autenticação
   - CRUD de firmas
   - CRUD de empresas
   - Sistema de convites
   - Validações e autorização
6. Criar páginas:
   - Login/signup
   - Dashboard contador
   - Dashboard empresa
   - Página de aceitação de convite

---

## QUESTÕES PARA VOCÊ VALIDAR

1. ✅ As tabelas cobrem o MVP que você quer?
2. ✅ A segurança multi-tenant está clara?
3. ✅ O sistema de convites faz sentido?
4. ✅ Precisa adicionar/remover alguma entidade?
5. ✅ Quer que RLS seja **muito rigoroso** ou confia mais em validação backend?
6. ✅ Está confortável com a abordagem de "soft-delete" via status?
7. ✅ Campos de auditoria (created_at, updated_at) são suficientes ou quer mais?

---

**Aguardando seu feedback e aprovação para prosseguir com as migrations! 🚀**
