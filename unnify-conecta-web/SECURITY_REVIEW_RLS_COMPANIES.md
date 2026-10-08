# 🔒 Revisão de Segurança - Política RLS para Administração de Empresas

## 1. INSPEÇÃO DAS POLÍTICAS EXISTENTES

### Tabela: `public.companies`

**Políticas Atuais:**
```sql
-- SELECT: Users can view only their own companies
CREATE POLICY "Users can view own companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- UPDATE: Users can update only their own companies
CREATE POLICY "Users can update own companies"
  ON public.companies
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

-- DELETE: Users can delete only their own companies
CREATE POLICY "Users can delete own companies"
  ON public.companies
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Service role bypass (para operações administrativas)
CREATE POLICY "Service role bypass on companies"
  ON public.companies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Análise:**
- ✅ Isolamento por `created_by = auth.uid()` funciona bem
- ✅ Service role tem bypass (necessário)
- ❌ **FALTA:** Política para que admins vejam TODAS as empresas

### Tabela: `public.profiles`

**Políticas:**
```sql
-- SELECT: Users can read only their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- UPDATE: Users cannot modify their global_role
CREATE POLICY "Users cannot modify global_role"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (global_role = (SELECT global_role FROM public.profiles WHERE id = auth.uid()));

-- Service role bypass
CREATE POLICY "Service role bypass"
  ON public.profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Análise:**
- ✅ Usuários protegidos contra modificar `global_role`
- ✅ Só conseguem ler seu próprio perfil
- ✅ Service role pode fazer tudo
- ⚠️ **QUESTÃO:** Pode uma subquery em `companies` policy acessar `profiles`?

---

## 2. ANÁLISE DE RISCOS

### Risco 1: Recursão RLS na Subquery

**Problema:** Se usarmos:
```sql
USING (
  (SELECT global_role FROM public.profiles WHERE id = auth.uid()) IN ('admin_master', 'admin')
  OR created_by = auth.uid()
);
```

**A subquery consultará `profiles` com RLS ativo.**

**Análise:**
- ✅ **SEGURO** porque:
  - A subquery usa `auth.uid()` (identidade atual)
  - Consulta `WHERE id = auth.uid()` (seu próprio perfil)
  - Policy de profiles permite `auth.uid() = id` → passa
  - Não há ciclo de políticas (companies ← profiles, profiles não depende de companies)
  - É uma consulta SEM lógica de negócio complexa

- ⚠️ **PORÉM:** A subquery é executada para CADA ROW quando há muitos registros
  - Potencial problema de performance em tabelas grandes
  - Cada acesso a `profiles` testa a RLS policy

### Risco 2: Usuários Modificarem global_role

**Proteção Existente:**
```sql
WITH CHECK (global_role = (SELECT global_role FROM public.profiles WHERE id = auth.uid()))
```

**Análise:**
- ✅ PROTEGIDO - Usuários NÃO podem mudar seu próprio `global_role`
- ✅ Apenas service_role pode fazer isso

### Risco 3: Duplicação de Políticas

**Se adicionar:**
```sql
OR created_by = auth.uid()
```

**Análise:**
- ⚠️ Está redundante com a política existente "Users can view own companies"
- ✅ MAS é seguro deixar (não causa duplicação, apenas OU lógico)

---

## 3. FUNÇÕES SEGURAS EXISTENTES

**Procura em migrations:**
```
- handle_new_user() - SECURITY DEFINER (cria profile)
- create_company() - SECURITY DEFINER (cria empresa)
```

**Encontrado:**
- ✅ Padrão estabelecido de usar SECURITY DEFINER
- ✅ Função create_company() já valida auth.uid()
- ❌ **NÃO EXISTE** função segura para verificar se é admin

**Recomendação:** Criar função `is_admin()` reutilizável

---

## 4. PROPOSTA DE SOLUÇÃO SEGURA

### Opção A: Função Verificadora (RECOMENDADO)

**Arquivo:** `supabase/migrations/20261008000002_create_admin_role_checker.sql`

```sql
-- Safe function to check if user is admin
CREATE FUNCTION public.is_admin(p_user_id UUID DEFAULT NULL)
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
  
  RETURN v_role IN ('admin_master', 'admin');
END;
$$;

-- Permissão para usuários autenticados executarem
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- Policy para companies usando a função
CREATE POLICY "Admins can view all companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  );
```

**Vantagens:**
- ✅ Reutilizável em outras tabelas/policies
- ✅ Lógica centralizada
- ✅ SECURITY DEFINER garante execução segura
- ✅ Melhor performance (função compilada vs subquery)
- ✅ Mais legível e mantível
- ✅ Sem ciclos de RLS

### Opção B: Subquery Direta (SIMPLES MAS MENOS EFICIENTE)

```sql
CREATE POLICY "Admins can view all companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    (SELECT global_role FROM public.profiles WHERE id = auth.uid()) IN ('admin_master', 'admin')
    OR created_by = auth.uid()
  );
```

**Vantagens:**
- ✅ Simples, sem função extra
- ✅ Uma migration só

**Desvantagens:**
- ⚠️ Subquery executada por linha
- ⚠️ Menos reutilizável
- ⚠️ Menos eficiente em tabelas grandes

---

## 5. RECOMENDAÇÃO FINAL

**Usar: Opção A (Função Verificadora)**

**Por quê:**
1. ✅ Mais segura (SECURITY DEFINER centralizado)
2. ✅ Melhor performance
3. ✅ Reutilizável para outras tabelas (future-proof)
4. ✅ Segue o padrão já usado em `create_company()`
5. ✅ Evita subqueries em policies

---

## 6. IDEMPOTÊNCIA

**Risco:** Executar a migration 2x criaria a policy duplicada

**Solução:** Adicionar `IF NOT EXISTS` (SQL)

```sql
CREATE POLICY IF NOT EXISTS "Admins can view all companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  );
```

**Nota:** PostgreSQL NÃO suporta `IF NOT EXISTS` para policies
**Solução alternativa:** Usar `DROP IF EXISTS` antes de criar

```sql
DROP POLICY IF EXISTS "Admins can view all companies" ON public.companies;

CREATE POLICY "Admins can view all companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  );
```

---

## 7. TESTES NECESSÁRIOS

### Teste 1: Usuário comum (não-admin)
```
- Pode ver suas próprias empresas ✅
- NÃO pode ver empresas de outros usuários ❌
```

### Teste 2: Admin (admin_master ou admin)
```
- Pode ver TODAS as empresas ✅
- Pode ver suas próprias empresas ✅
```

### Teste 3: Não autenticado
```
- NÃO pode ver nenhuma empresa ❌
```

### Teste 4: Modificação de global_role
```
- Usuário NÃO pode mudar seu role ❌
- Service role pode mudar role ✅
```

---

## 8. RESUMO EXECUTIVO

| Aspecto | Status | Nota |
|---------|--------|------|
| RLS Habilitado | ✅ Sim | Não desabilitar |
| Service Role | ✅ Bypass | Mantido |
| Recursão RLS | ✅ Seguro | Sem ciclos |
| Proteção de Role | ✅ Protegido | Users não podem mudar |
| Função Segura | ⚠️ Propor | Criar `is_admin()` |
| Performance | ⚠️ Subquery | Função melhor |
| Idempotência | ⚠️ Risco | Use DROP IF EXISTS |

---

## 9. SQL FINAL PROPOSTO

```sql
-- Migration: 20261008000002_create_admin_role_checker.sql

-- Safe function to check if user is admin
CREATE FUNCTION public.is_admin(p_user_id UUID DEFAULT NULL)
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
  
  RETURN v_role IN ('admin_master', 'admin');
END;
$$;

-- Grant permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- Remove old policy if exists (idempotency)
DROP POLICY IF EXISTS "Admins can view all companies" ON public.companies;

-- Create new policy using safe function
CREATE POLICY "Admins can view all companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  );

-- Comment for audit
COMMENT ON POLICY "Admins can view all companies" ON public.companies 
IS 'Allows admin_master and admin to view all companies. Regular users can only view their own.';
```

---

## ✅ CONCLUSÃO

**Segurança:** ✅ Proposta é SEGURA
- Sem desabilitar RLS
- Sem usar service_role no frontend
- Protege contra mudança não autorizada de role
- Sem ciclos de recursão
- Idempotente

**Recomendação:** Autorizar implementação com SQL final proposto acima

**Próximo passo:** Aguardar autorização para aplicar no Supabase DEV
