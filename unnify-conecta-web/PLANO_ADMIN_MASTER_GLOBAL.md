# 📋 PLANO DE IMPLEMENTAÇÃO: Admin Master Global Access

**Status:** 📊 Levantamento e Planejamento (Sem Execução)  
**Data:** 2026-10-08  
**Objetivo:** Centralizar acesso `admin_master` em função segura + aplicar a todas as tabelas

---

## 1. LEVANTAMENTO DE TABELAS E POLÍTICAS EXISTENTES

### Tabelas Identificadas:

| Tabela | Propósito | Políticas RLS Atuais | Precisa Admin Access? |
|--------|----------|---------------------|----------------------|
| `public.profiles` | Dados de usuários | ✅ READ own, ✅ PROTECT role | ✅ SIM (consultar todos) |
| `public.companies` | Dados de empresas | ✅ READ/UPDATE/DELETE own | ✅ SIM (consultar todas) |
| `public.accounting_offices` | Dados de escritórios | ✅ READ/UPDATE/DELETE own | ✅ SIM (consultar todas) |
| `public.user_accounting_office_memberships` | Memberships | ✅ READ own | ✅ SIM (consultar todas) |

---

## 2. POLÍTICAS RLS ATUAIS

### `public.profiles` (4 políticas)
```sql
✅ "Users can read own profile"         → SELECT: auth.uid() = id
✅ "Users cannot modify global_role"    → UPDATE: protege global_role
✅ "Service role bypass"                → ALL: to service_role (true)
❌ (falta)                             → Admin global read
```

### `public.companies` (4 políticas)
```sql
✅ "Users can view own companies"       → SELECT: created_by = auth.uid()
✅ "Users can update own companies"     → UPDATE: created_by = auth.uid()
✅ "Users can delete own companies"     → DELETE: created_by = auth.uid()
✅ "Service role bypass"                → ALL: to service_role (true)
⚠️ "Admins can view all companies"      → (proposta, não aplicada)
```

### `public.accounting_offices` (4 políticas)
```sql
✅ "Users can view offices they belong to"  → SELECT: via membership
✅ "Only owners can update"                 → UPDATE: via ownership
✅ "Only owners can delete"                 → DELETE: via ownership
✅ "Service role bypass"                    → ALL: to service_role (true)
❌ (falta)                                 → Admin global read
```

### `public.user_accounting_office_memberships` (3 políticas)
```sql
✅ "Users can view own memberships"     → SELECT: user_id = auth.uid()
✅ "Service role bypass"                → ALL: to service_role (true)
❌ (falta)                              → Admin global read
```

---

## 3. FUNÇÃO CENTRALIZADA PROPOSTA

### `public.is_admin_master(p_user_id UUID DEFAULT NULL)`

**Responsabilidade:** Determinar se um usuário é `admin_master`

**Implementação:**
```sql
CREATE FUNCTION public.is_admin_master(p_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role global_role;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  SELECT global_role INTO v_role
  FROM public.profiles
  WHERE id = v_user_id;
  
  RETURN v_role = 'admin_master';
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_master(UUID) TO authenticated;
```

**Vantagens:**
- ✅ Centralizada (1 lugar para alterar regra)
- ✅ Reutilizável em todas as políticas
- ✅ SECURITY DEFINER (segura)
- ✅ Sem recursão RLS (uuid é parâmetro)
- ✅ Distinção clara: `admin_master` ≠ `admin`

---

## 4. PLANO DE IMPLEMENTAÇÃO POR TABELA

### Fase 1: `public.companies` (Priority: ALTA - Necessário agora)

**Novos Requerimentos:**
- Admin_master deve ver TODAS as empresas (SELECT)
- Admin_master pode atualizar qualquer empresa (UPDATE)
- Admin_master pode deletar qualquer empresa (DELETE)

**Políticas a Adicionar:**

```sql
-- SELECT: Admin master vê todas
DROP POLICY IF EXISTS "Admin master view all companies" ON public.companies;
CREATE POLICY "Admin master view all companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    is_admin_master(auth.uid())
    OR created_by = auth.uid()
  );

-- UPDATE: Admin master pode editar todas
DROP POLICY IF EXISTS "Admin master update any company" ON public.companies;
CREATE POLICY "Admin master update any company"
  ON public.companies
  FOR UPDATE
  TO authenticated
  USING (is_admin_master(auth.uid()))
  WITH CHECK (is_admin_master(auth.uid()));

-- DELETE: Admin master pode deletar todas
DROP POLICY IF EXISTS "Admin master delete any company" ON public.companies;
CREATE POLICY "Admin master delete any company"
  ON public.companies
  FOR DELETE
  TO authenticated
  USING (is_admin_master(auth.uid()));
```

---

### Fase 2: `public.profiles` (Priority: ALTA - Necessário para admin)

**Novo Requerimento:**
- Admin_master deve ver profiles de TODOS os usuários

**Política a Adicionar:**
```sql
-- SELECT: Admin master vê todos
DROP POLICY IF EXISTS "Admin master view all profiles" ON public.profiles;
CREATE POLICY "Admin master view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    is_admin_master(auth.uid())
    OR auth.uid() = id
  );

-- NOTA: UPDATE continua protegido (Users cannot modify global_role)
-- Admin master NÃO pode modificar global_role de ninguém via RLS
-- Apenas service_role pode (via migrations)
```

---

### Fase 3: `public.accounting_offices` (Priority: MÉDIA - Para visão geral admin)

**Novo Requerimento:**
- Admin_master deve ver TODOS os escritórios

**Política a Adicionar:**
```sql
-- SELECT: Admin master vê todos
DROP POLICY IF EXISTS "Admin master view all offices" ON public.accounting_offices;
CREATE POLICY "Admin master view all offices"
  ON public.accounting_offices
  FOR SELECT
  TO authenticated
  USING (
    is_admin_master(auth.uid())
    OR id IN (
      SELECT accounting_office_id
      FROM public.user_accounting_office_memberships
      WHERE user_id = auth.uid()
    )
  );
```

---

### Fase 4: `public.user_accounting_office_memberships` (Priority: MÉDIA)

**Novo Requerimento:**
- Admin_master deve ver TODAS as memberships

**Política a Adicionar:**
```sql
-- SELECT: Admin master vê todas
DROP POLICY IF EXISTS "Admin master view all memberships" ON public.user_accounting_office_memberships;
CREATE POLICY "Admin master view all memberships"
  ON public.user_accounting_office_memberships
  FOR SELECT
  TO authenticated
  USING (
    is_admin_master(auth.uid())
    OR user_id = auth.uid()
  );
```

---

## 5. REGRAS DE DIFERENCIAÇÃO: `admin_master` vs `admin`

| Operação | `admin_master` | `admin` | Empresário | Contador |
|----------|---|---|---|---|
| Ver todas empresas | ✅ SIM | ❓ A definir | ❌ Sua apenas | ❌ Cliente apenas |
| Editar empresa | ✅ SIM | ❓ A definir | ✅ Sua | ❌ Não |
| Ver todos perfis | ✅ SIM | ❓ A definir | ❌ Seu | ❌ Seu |
| Alterar global_role | ❌ NUNCA via RLS | ❌ NUNCA | ❌ Não | ❌ Não |

**Nota:** Pendente decisão sobre escopo do papel `admin` (se diferente de `admin_master`)

---

## 6. IMPLEMENTAÇÃO CENTRALIZADA

### Uma Única Source of Truth:

**Arquivo:** `20261008000003_create_admin_master_function_and_policies.sql`

Contém:
1. Função `is_admin_master()` (reutilizável)
2. Política para `public.companies` (READ/UPDATE/DELETE)
3. Política para `public.profiles` (READ)
4. Política para `public.accounting_offices` (READ)
5. Política para `public.user_accounting_office_memberships` (READ)

---

## 7. SEGURANÇA PRESERVADA

### ✅ O que continua protegido:

| Item | Proteção | Como |
|------|----------|------|
| `global_role` modificação | ✅ PROTEGIDO | `WITH CHECK` na policy |
| Senhas/tokens | ✅ PROTEGIDO | Campos separados, não retornados |
| Dados sensíveis | ✅ PROTEGIDO | Acesso via views mascaradas (futuro) |
| RLS habilitado | ✅ SIM | Não desabilitado |
| Service role bypass | ✅ MANTIDO | Para operações backend |

### ❌ O que NÃO se aplica:

- Sem service_role no frontend
- Sem desabilitar RLS
- Sem alterar PROD
- Sem esconder em interface apenas (autorização no DB)

---

## 8. VERIFICAÇÕES PÓS-IMPLEMENTAÇÃO

### Teste 1: Admin master vê todas empresas
```
Login como admin_master
  → /admin/empresas
  → Deve listar JM CONTADORES LTDA ✅
  → Deve listar empresa do usuário A ✅
  → Deve listar empresa do usuário B ✅
```

### Teste 2: Empresário vê apenas sua empresa
```
Login como empresário
  → /app/empresas (se existir)
  → Vê apenas SUA empresa ✅
  → Não vê empresa de outro empresário ❌
```

### Teste 3: Contador vê cliente
```
Login como contador
  → /contador/empresas (se existir)
  → Vê apenas empresas do cliente ✅
  → Não vê outras empresas ❌
```

### Teste 4: Global_role protegido
```
Nenhum usuário consegue alterar seu global_role via RLS ✅
Apenas service_role pode (via migration) ✅
```

---

## 9. PRÓXIMOS PASSOS

### Antes da Implementação:

1. ✅ Levantamento feito (este documento)
2. ⏳ Aprovação do plano (aguardando autorização)
3. ⏳ Implementação da migration
4. ⏳ Testes de segurança
5. ⏳ Deploy em DEV
6. ⏳ Validação em produção

---

## 10. ESTIMATIVA DE ESFORÇO

| Atividade | Tempo |
|-----------|-------|
| Função `is_admin_master()` | 10 min |
| 4 Políticas de SELECT | 20 min |
| 2 Políticas de UPDATE | 10 min |
| 1 Política de DELETE | 5 min |
| Testes | 15 min |
| **Total** | **60 min** |

---

## ✅ RESUMO DO PLANO

**Objetivo Final:**
> Quando um usuário com `admin_master` entra no sistema, ele consegue visualizar e administrar TODOS os dados relevantes, respeitando as regras de segurança.

**Estratégia:**
1. Criar função `is_admin_master()` centralizada
2. Aplicar em 4 tabelas principais
3. Manter isolamento para não-admins
4. Proteger campos sensíveis
5. Manter RLS ativo

**Risco:** ✅ BAIXO (função reutilizável, sem recursão, segura)

**Reversibilidade:** ✅ ALTA (DROP POLICY)

---

**Status:** 🔴 AGUARDANDO AUTORIZAÇÃO

Você autoriza proceder com a implementação?
