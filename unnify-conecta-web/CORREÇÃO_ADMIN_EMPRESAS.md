# Correção: Listagem de Empresas no Admin

## 📊 Diagnóstico Conclusivo

### Problema Identificado
A página `/admin/empresas` não exibia a empresa **JM CONTADORES LTDA** mesmo que estivesse cadastrada no Supabase DEV.

### Causa Raiz
**Política RLS bloqueando acesso do admin:**

A política `"Users can view own companies"` permite que cada usuário veja **apenas suas próprias empresas**:

```sql
CREATE POLICY "Users can view own companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());
```

Como a empresa foi criada por outro usuário, o admin não conseguia vê-la.

### Comprovação
Testes executados:
1. ✅ Banco DEV acessível
2. ✅ Tabela `companies` existe
3. ✅ Empresa JM CONTADORES LTDA está no banco
4. ❌ Query retorna 0 registros (RLS bloqueando)
5. ✅ Service role consegue ver (verificado)

---

## ✅ Solução Aplicada

### 1. Nova Política RLS (Migration)

Arquivo: `supabase/migrations/20261008000002_add_admin_view_all_companies_policy.sql`

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

**O que faz:**
- Admins (`admin_master`, `admin`) veem **TODAS** as empresas
- Usuários comuns veem **apenas suas próprias**
- RLS continua habilitado
- Sem desabilitar segurança

### 2. Correções na Página

Arquivo: `app/admin/empresas/page.tsx`

**Mudanças:**
- ✅ Removeu crescimento fictício `+12%`
- ✅ Corrigiu percentuais `NaN%` → exibe `—` quando total é 0
- ✅ Melhorou mensagens de erro com ações sugeridas
- ✅ Adicionou botão "Tentar novamente" em caso de erro
- ✅ Adicionou logs no console para debugging

---

## 📋 Como Aplicar

### Passo 1: Aplicar Migration no Supabase

1. Acesse: https://app.supabase.com
2. Selecione projeto: `unnify-conecta-dev`
3. Vá em: **SQL Editor** (menu esquerdo)
4. Cole este SQL:

```sql
CREATE POLICY "Admins can view all companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    (SELECT global_role FROM public.profiles WHERE id = auth.uid()) IN ('admin_master', 'admin')
    OR created_by = auth.uid()
  );

COMMENT ON POLICY "Admins can view all companies" ON public.companies 
IS 'Allows admin_master and admin roles to view all companies. Regular users can only view their own.';
```

5. Execute: **Ctrl+Enter** ou botão "Run"
6. Resultado esperado: ✅ "Query executed successfully"

### Passo 2: Testar

1. Acesse: http://localhost:3000/admin/empresas
2. Faça login com conta `admin_master` ou `admin`
3. Você deve ver a empresa **JM CONTADORES LTDA**

---

## 🧪 Testes Realizados

| Teste | Resultado |
|-------|-----------|
| Build TypeScript | ✅ Sucesso |
| Rota `/admin/empresas` | ✅ Criada |
| Consulta sem auth | ✅ Retorna 0 (RLS funcionando) |
| RLS bloqueando | ✅ Confirmado |
| Migration criada | ✅ Arquivo existe |
| Correções aplicadas | ✅ Removido fictício, corrigido NaN |
| Logs adicionados | ✅ Console mostra detalhes |

---

## 📈 Resultado Esperado Após Aplicar

### Antes
```
Total de empresas: 0
Empresas ativas: 0 (NaN%)
Empresas pendentes: 0 (NaN%)
Empresas inativas: 0 (NaN%)
Mensagem: "Nenhuma empresa cadastrada ainda"
```

### Depois
```
Total de empresas: 1
Empresas ativas: 1 (100%)
Empresas pendentes: 0 (—%)
Empresas inativas: 0 (—%)
Tabela: Exibe "JM CONTADORES LTDA" com CNPJ 43.885.538/0001-33
```

---

## 🔒 Segurança Preservada

✅ **RLS Habilitado** - Política adiciona verificação, não remove
✅ **Sem Service Role** - Frontend continua usando anon key
✅ **Isolamento de Dados** - Usuários comuns veem apenas suas empresas
✅ **Auditoria** - Comentário na policy explica o propósito
✅ **Sem Dados Fictícios** - Apenas dados reais do banco

---

## 📁 Arquivos Modificados

1. **`app/admin/empresas/page.tsx`**
   - Removeu `change="+12%"` (fictício)
   - Corrigiu cálculo de percentuais (evita NaN)
   - Melhorou erro com retry button
   - Adicionou console.log para diagnóstico

2. **`supabase/migrations/20261008000002_add_admin_view_all_companies_policy.sql`** (novo)
   - Policy que permite admin ver todas as empresas

---

## 🚀 Próximos Passos

1. ✅ Aplicar SQL no Supabase Dashboard
2. ✅ Testar acesso no navegador
3. ✅ Verificar que empresa aparece
4. ✅ Regressão: testar que usuário comum só vê suas empresas
5. ✅ Limpar logs de console após validação

---

## ⚠️ Se o Problema Persistir

Se após aplicar a policy a empresa **ainda não aparecer**:

1. **Verifique os logs do console (F12):**
   - Procure por `[AdminEmpresas]`
   - Anote o erro exato

2. **Possíveis causas:**
   - RLS policy não foi aplicada
   - Usuário não tem `global_role = admin_master`
   - Problema de cache no navegador (limpe com Ctrl+Shift+Del)

3. **Próximo passo:**
   - Compartilhe os logs do console para diagnóstico adicional

---

## 📞 Commit

- **Hash:** ccb43c1
- **Mensagem:** "fix: admin companies listing - fix RLS policy and remove fictitious data"
- **Data:** 2026-10-08
- **Mudanças:** 2 arquivos, 43 insertions

---

**Status:** ✅ Pronto para aplicação

**Próximo:** Aplicar migration no Supabase DEV
