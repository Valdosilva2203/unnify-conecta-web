# 🔴 ANÁLISE DE RECURSÃO RLS E VULNERABILIDADES

**Data:** 2026-10-09  
**Status:** ⚠️ PROBLEMA CRÍTICO IDENTIFICADO  
**Ação:** BLOQUEADA - NÃO EXECUTAR ATÉ CORRIGIR

---

## 🚨 PROBLEMA IDENTIFICADO

### A Policy Problemática

```sql
CREATE POLICY "Users update own profile safe" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND global_role = (SELECT global_role FROM public.profiles WHERE user_id = auth.uid())
    AND status = (SELECT status FROM public.profiles WHERE user_id = auth.uid())
    AND mfa_enabled = (SELECT mfa_enabled FROM public.profiles WHERE user_id = auth.uid())
  );
```

### POR QUE ISSO É PERIGOSO

#### 1. **RECURSÃO RLS (Infinite Loop Potencial)**

Quando `WITH CHECK` executa:
```
User tenta UPDATE profiles SET global_role = 'admin'
  ↓
WITH CHECK avalia: (SELECT global_role FROM profiles WHERE user_id = auth.uid())
  ↓
Query tenta ler profiles
  ↓
RLS policy de READ é acionada
  ↓
Isso toma o valor do NEW record (que está sendo atualizado)
  ↓
LOOP: De novo para WITH CHECK
```

**Resultado:** Timeout de query, possível deadlock ou comportamento indefinido

#### 2. **FALSA SENSAÇÃO DE SEGURANÇA**

A lógica é: "UPDATE é aceito se global_role NÃO mudou"

```sql
UPDATE profiles 
SET global_role = 'admin_master'  -- ❌ DEVE SER REJEITADO
WHERE user_id = auth.uid();
```

**Análise:**
- Coluna NEW.global_role = 'admin_master'
- SELECT retorna 'user' (valor ATUAL no banco)
- Comparação: 'admin_master' = 'user' → FALSE
- Policy retorna FALSE → UPDATE rejeitado ✅ OK

**MAS:** Se o WITH CHECK for otimizado ou cached incorretamente, ele pode ler o NEW value:
- Comparação: 'admin_master' = 'admin_master' → TRUE
- UPDATE aceito ❌ VULNERABILIDADE

#### 3. **PROBLEMA REAL: UPDATE SEM MUDANÇA DE ROLE**

```sql
UPDATE profiles 
SET email = 'newemail@example.com'
WHERE user_id = auth.uid();
```

**Isso funciona?**
- USING: auth.uid() = user_id → TRUE ✓
- WITH CHECK: 
  - auth.uid() = user_id → TRUE
  - global_role = global_role → TRUE (nenhuma mudança)
  - status = status → TRUE (nenhuma mudança)
  - mfa_enabled = mfa_enabled → TRUE (nenhuma mudança)
- Resultado: UPDATE ACEITO ✅

**Agora, uma mudança suspeita:**

```sql
UPDATE profiles 
SET email = 'newemail@example.com',
    global_role = 'admin'
WHERE user_id = auth.uid();
```

**Análise:**
- USING: TRUE
- WITH CHECK:
  - NEW.global_role = 'admin'
  - SELECT atual = 'user'
  - 'admin' = 'user' → FALSE
  - UPDATE REJEITADO ✅

**PROBLEMA:** O SELECT na WITH CHECK lê do banco (valor atual), não do NEW record em transação.

#### 4. **VULNERABILIDADE POSSÍVEL: Race Condition**

Em transação concorrente:
```
Thread 1: BEGIN; UPDATE global_role = 'user' ...;
Thread 2: BEGIN; UPDATE global_role = 'user' ...;
  
WITH CHECK executa SELECT (lê valor atual)
Commit de Thread 1 muda o valor
WITH CHECK retorna resultado obsoleto
Commit de Thread 2 usa resultado obsoleto
```

---

## 🧪 TESTE DE VULNERABILIDADES

### Cenário 1: User comum tenta elevar a si mesmo a admin

```sql
-- User comum (UUID: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa)
-- Atualmente: global_role = 'user'

UPDATE public.profiles
SET global_role = 'admin'
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
```

**Esperado:** REJEITADO (com WITH CHECK atual)  
**Resultado Real Esperado:** ? (Precisa testar)

**Por quê?**
- USING: user_id = auth.uid() ✓
- WITH CHECK: global_role = (SELECT ...) 
  - NEW.global_role = 'admin'
  - SELECT retorna 'user'
  - 'admin' != 'user' → FALSE
  - UPDATE REJEITADO ✅

**Parece OK, mas...**

### Cenário 2: User tenta UPDATE sem mudar role (malévolo)

```sql
UPDATE public.profiles
SET email = 'attacker@evil.com',
    global_role = 'admin'
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
```

**Esperado:** REJEITADO  
**Problema:** SELECT em WITH CHECK pode ler NEW record em algumas situações

---

## ✅ SOLUÇÃO: NÃO USAR SELECT EM WITH CHECK

### Abordagem SEGURA #1: Usar IMMUTABLE Flag

```sql
-- Criar coluna imutável ou usar constraint
CREATE POLICY "Users update own profile safe" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    -- NÃO permite UPDATE se tentando mudar sensitive columns
    global_role IS NOT DISTINCT FROM (
      SELECT global_role FROM public.profiles WHERE id = (
        SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
      )
    )
  );
```

**Problema:** Ainda usa SELECT (mesma recursão)

### Abordagem SEGURA #2: Usar Coluna Helpers

```sql
-- Adicionar coluna para rastrear "versão" de privilégios
ALTER TABLE public.profiles
ADD COLUMN privilege_version INT DEFAULT 0;

CREATE POLICY "Users update safe" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    -- Se privilege_version não mudou, global_role também não mudou
    AND privilege_version = COALESCE((
      SELECT privilege_version FROM public.profiles p2 WHERE p2.id = profiles.id
    ), 0)
  );
```

**Problema:** Mais complexo, ainda usa SELECT

### Abordagem SEGURA #3: Usar Função Trigger

```sql
-- Trigger que bloqueia UPDATE de sensitive columns
CREATE FUNCTION prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.global_role IS DISTINCT FROM OLD.global_role THEN
    IF NOT public.is_admin_master(auth.uid()) THEN
      RAISE EXCEPTION 'Permission denied: Cannot modify role';
    END IF;
  END IF;
  
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.is_admin_master(auth.uid()) THEN
      RAISE EXCEPTION 'Permission denied: Cannot modify status';
    END IF;
  END IF;
  
  IF NEW.mfa_enabled IS DISTINCT FROM OLD.mfa_enabled THEN
    IF NOT public.is_admin_master(auth.uid()) THEN
      RAISE EXCEPTION 'Permission denied: Cannot modify MFA setting';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_role_immutability
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION prevent_role_escalation();
```

**Vantagens:**
- ✅ Sem recursão RLS
- ✅ Lógica clara e testável
- ✅ Erro explícito
- ✅ Não depende de SELECT em WHERE/WITH CHECK

### Abordagem SEGURA #4: Separar Policies (RECOMENDADA)

```sql
-- Policy 1: Usuários podem atualizar dados de perfil (nome, email, etc)
CREATE POLICY "Users update profile data" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    -- Sem condições adicionais - permite mudança de colunas normais
  );

-- Policy 2: Função trigger bloqueia mudança de colunas sensíveis
CREATE TRIGGER block_privilege_changes
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION prevent_role_escalation();

-- Policy 3: Admin Master precisa de autorização explícita
CREATE POLICY "Admin Master can modify anything" ON public.profiles
  FOR UPDATE
  USING (public.is_admin_master(auth.uid()));
  -- WITH CHECK é implícito TRUE quando não especificado em USING-only
```

**Vantagens:**
- ✅ Sem recursão
- ✅ Sem SELECT em policy
- ✅ Trigger é o gatekeeper
- ✅ Admin Master tem acesso claro
- ✅ Usuários comuns têm policy simples

---

## 📋 RESUMO DA VULNERABILIDADE

| Aspecto | Status | Severidade |
|---------|--------|-----------|
| Recursão RLS | ⚠️ Possível | 🔴 CRÍTICO |
| Escalação de privilégios | ⚠️ Risco potencial | 🔴 CRÍTICO |
| SELECT em WITH CHECK | ❌ Anti-pattern | 🟠 ALTO |
| Race condition | ⚠️ Possível | 🟠 ALTO |
| Falsa segurança | ✗ Sim | 🔴 CRÍTICO |

---

## 🔧 RECOMENDAÇÃO FINAL

**USAR ABORDAGEM #4 (Separar Policies + Trigger)**

Por quê:
1. Sem recursão RLS
2. Sem SELECT em WHERE/WITH CHECK
3. Lógica clara e testável
4. Fácil adicionar audit logging
5. Protege contra todas as abordagens de ataque

---

## ✅ PRÓXIMO PASSO

1. **Confirmar** esta análise
2. **Implementar** abordagem segura #4
3. **Testar** cenários de segurança
4. **Atualizar** migration SQL
5. **Executar** com confiança

**Você concorda com a recomendação?**

