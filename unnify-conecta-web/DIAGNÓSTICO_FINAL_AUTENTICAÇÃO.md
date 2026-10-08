# 🔍 DIAGNÓSTICO FINAL: Fluxo de Autenticação e RLS

**Data:** 2026-10-08  
**Contexto:** Por que a página `/admin/empresas` não mostra empresas cadastradas?  
**Conclusão:** Autenticação funciona, RLS está restritivo para admins.

---

## 1. EVIDÊNCIA 1: Autenticação Está Funcionando

### Fluxo Confirmado:
```
Login (/login)
  ↓
supabase.auth.signInWithPassword(email, password)
  ↓
JWT retornado e salvo em localStorage
  ↓
Redirecionamento para /admin
  ↓
AdminLayout valida global_role = admin_master
  ↓
/admin/empresas renderizada
  ↓
createClient() lê JWT do localStorage
  ↓
createBrowserClient() inclui JWT nos headers
  ↓
Authorization: Bearer <JWT> enviado ao Supabase
  ↓
Supabase valida JWT e extrai auth.uid()
```

**Prova:**
- ✅ Login bem-sucedido leva à `/admin` (não `/login`)
- ✅ AdminLayout valida `global_role` (linha 41-48 de `layout.tsx`)
- ✅ Se JWT fosse inválido, receberíamos 401 Unauthorized
- ✅ Recebemos 200 OK com array vazio (não erro)

---

## 2. EVIDÊNCIA 2: RLS Está Funcionando

### Política Atual em `public.companies`:

```sql
CREATE POLICY "Users can view own companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());
```

### Teste Executado:
```
Consulta sem JWT (ANON_KEY)
  → Retorna: 0 registros

Consulta com JWT (admin autenticado)
  → Retorna: 0 registros (porque admin NÃO criou)
```

**Prova:**
- ✅ RLS está ativo (ANON_KEY retorna vazio, não erro)
- ✅ Política está sendo aplicada (status 200, não 403)
- ✅ Admin vê 0 porque a política só permite `created_by = auth.uid()`

---

## 3. EVIDÊNCIA 3: Problema é Política Muito Restritiva

### Análise:

**Cenário Atual:**
```
Empresa criada por: Usuário A (ID: xyz123)
Admin tentando acessar: Usuário B (ID: abc456)

RLS Aplicada:
  WHERE created_by = auth.uid()
  → created_by = 'xyz123' ≠ auth.uid() = 'abc456'
  → NÃO retorna (bloqueado por RLS)
```

**Resultado:** Admin vê 0 empresas mesmo que existam

---

## 4. EVIDÊNCIA 4: Solução Não Causa Recursão RLS

### Política Proposta:

```sql
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
  
  SELECT global_role INTO v_role
  FROM public.profiles
  WHERE id = v_user_id;
  
  RETURN v_role IN ('admin_master', 'admin');
END;
$$;

CREATE POLICY "Admins can view all companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  );
```

### Análise de Recursão:

```
companies policy chama is_admin(auth.uid())
  ↓
is_admin() executa com SECURITY DEFINER (como superusuário)
  ↓
is_admin() consulta: SELECT FROM profiles WHERE id = ?
  ↓
UUID é PARÂMETRO (não auth.uid() dinamicamente)
  ↓
RLS de profiles testa: auth.uid() = id
  ↓
Auth.uid() = admin (sempre constante)
  ↓
Consulta passa (profile do admin é seu próprio)
  ↓
is_admin() retorna boolean
  ↓
Não há retorno ao companies table
```

**Conclusão:** ✅ SEM RECURSÃO

---

## 5. EVIDÊNCIA 5: Código da Página Está Correto

### `/admin/empresas/page.tsx` (linha 64):

```typescript
const supabase = createClient();

const { data, error: fetchError } = await supabase
  .from('companies')
  .select('*')
  .order('created_at', { ascending: false });
```

**Análise:**
- ✅ `createClient()` usa `createBrowserClient()` (SSR version)
- ✅ Lê JWT do localStorage automaticamente
- ✅ Inclui Authorization header nas requisições
- ✅ Não há erro, apenas RLS bloqueando (200 OK, dados vazios)

---

## 6. DIAGNÓSTICO FINAL

### O que NÃO é o problema:
- ❌ Autenticação ausente
- ❌ JWT não sendo enviado
- ❌ Credenciais inválidas
- ❌ Erro de API
- ❌ Conexão quebrada

### O que É o problema:
- ✅ Política RLS muito restritiva
- ✅ Admin não tem acesso a empresas de outros usuários
- ✅ Precisa de política adicional para bypass admin

---

## 7. CORREÇÃO RECOMENDADA

**Impacto:** MÍNIMO
**Segurança:** PRESERVADA
**Reversibilidade:** 100% (DROP POLICY)

**Implementação:**
1. Aplicar migration `20261008000002_add_admin_view_all_companies_policy.sql`
2. Cria função `is_admin()` com SECURITY DEFINER
3. Cria política "Admins can view all companies"
4. Admin consegue ver todas as empresas
5. Usuário comum continua isolado

---

## 8. TESTES DE VALIDAÇÃO

Após aplicar a migration:

### Teste 1: Admin vê todas as empresas
```
Login como admin
  → Acesso /admin/empresas
  → Deve ver a empresa JM CONTADORES LTDA ✅
```

### Teste 2: Usuário comum vê apenas suas
```
Login como usuário comum
  → Acesso /app (ou /contador)
  → Vê apenas SUAS PRÓPRIAS empresas ✅
  → Não vê empresas de outros usuários ✅
```

### Teste 3: Não-autenticado vê nada
```
Sem login
  → Acesso direto à API
  → Retorna 0 registros (RLS bloqueando) ✅
```

---

## ✅ CONCLUSÃO EXECUTIVA

**Diagnóstico:** ✅ COMPLETO E VERIFICADO

**Autenticação:** ✅ FUNCIONANDO  
**RLS:** ✅ FUNCIONANDO  
**Problema:** ✅ IDENTIFICADO (política restritiva)  
**Solução:** ✅ PROPOSTA (sem recursão, segura)  
**Risco de recursão:** ✅ DESCARTADO  

**Recomendação:** ✅ APLICAR MIGRATION

---

**Autorizado para aplicar no Supabase DEV?**
