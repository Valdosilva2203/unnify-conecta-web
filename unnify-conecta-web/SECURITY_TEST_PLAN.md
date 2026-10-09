# 🧪 PLANO DE TESTES DE SEGURANÇA

**Objetivo:** Validar que nenhuma vulnerabilidade de escalação de privilégios existe  
**Ambiente:** Supabase DEV isolado (SEM impacto em PROD)  
**Status:** 📋 PRONTO PARA EXECUÇÃO (pendente autorização)

---

## 📊 MATRIZ DE TESTES

### Teste Negativo #1: User comum eleva a si mesmo a admin
**Condição:** User com role='user' tenta UPDATE global_role='admin'

```sql
-- Simular como user comum (auth.uid() = 'user-uuid')
SET SESSION ROLE authenticated;
SET app.current_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

UPDATE public.profiles
SET global_role = 'admin'
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
```

**Esperado:** ❌ REJEITADO com mensagem "permission denied" ou constraint violated  
**Teste Real:** ? (Precisa executar)  
**Análise Estática:** WITH CHECK deveria rejeitar TEORICAMENTE

---

### Teste Negativo #2: User comum muda status
**Condição:** User tenta UPDATE status='suspended'

```sql
UPDATE public.profiles
SET status = 'suspended'
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
```

**Esperado:** ❌ REJEITADO  
**Teste Real:** ?  
**Análise Estática:** WITH CHECK deveria rejeitar (status comparado com valor atual)

---

### Teste Negativo #3: User comum ativa MFA para si
**Condição:** User tenta UPDATE mfa_enabled=true (sem estar autorizado)

```sql
UPDATE public.profiles
SET mfa_enabled = TRUE
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
```

**Esperado:** ❌ REJEITADO  
**Teste Real:** ?  
**Análise Estática:** WITH CHECK deveria rejeitar

---

### Teste Negativo #4: User comum altera perfil de outro user
**Condição:** User A tenta UPDATE profile de User B

```sql
-- Como user A
UPDATE public.profiles
SET email = 'hacked@evil.com'
WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';  -- User B
```

**Esperado:** ❌ REJEITADO  
**Teste Real:** ?  
**Análise Estática:** USING (auth.uid() = user_id) deveria rejeitar

---

### Teste Negativo #5: User tenta SQL injection via UPDATE
**Condição:** Malicious UPDATE com subquery

```sql
UPDATE public.profiles
SET global_role = (
  SELECT 'admin_master'
)
WHERE user_id = auth.uid();
```

**Esperado:** ❌ REJEITADO  
**Teste Real:** ?  
**Análise Estática:** WITH CHECK não valida o NEW value contra subquery

---

### Teste Positivo #1: User comum atualiza seu email
**Condição:** User altera email (coluna não sensível)

```sql
UPDATE public.profiles
SET email = 'newemail@example.com'
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
```

**Esperado:** ✅ ACEITO  
**Teste Real:** ?  
**Análise Estática:** USING=TRUE, WITH CHECK=TRUE (nenhuma coluna sensível mudou)

---

### Teste Positivo #2: User comum atualiza seu nome
**Condição:** User altera full_name

```sql
UPDATE public.profiles
SET full_name = 'New Name'
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
```

**Esperado:** ✅ ACEITO  
**Teste Real:** ?

---

### Teste Positivo #3: Admin Master eleva user a admin
**Condição:** Admin Master (role=admin_master) UPDATE global_role='admin'

```sql
-- Como admin_master
UPDATE public.profiles
SET global_role = 'admin'
WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
```

**Esperado:** ✅ ACEITO  
**Teste Real:** ?  
**Análise Estática:** Policy "Admin Master manages all" deveria aceitar

---

### Teste Positivo #4: Admin Master ativa MFA de outro user
**Condição:** Admin Master força MFA em user

```sql
UPDATE public.profiles
SET mfa_enabled = TRUE
WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
```

**Esperado:** ✅ ACEITO  
**Teste Real:** ?

---

### Teste Positivo #5: Admin Master suspende user
**Condição:** Admin Master altera status='suspended'

```sql
UPDATE public.profiles
SET status = 'suspended'
WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
```

**Esperado:** ✅ ACEITO  
**Teste Real:** ?

---

### Teste Positivo #6: Admin Master não consegue remover seu próprio acesso
**Condição:** Admin Master tenta remover seu próprio admin status

```sql
-- Como admin_master (UUID: dddddddd-dddd-dddd-dddd-dddddddddddd)
UPDATE public.profiles
SET global_role = 'user'
WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
```

**Esperado:** ❌ REJEITADO (proteção contra lock-out)  
**Teste Real:** ?  
**Análise Estática:** Policy tem CHECK para impedir isso

---

### Teste Positivo #7: Segundo Admin Master consegue remover acesso do primeiro
**Condição:** Admin Master A remove acesso de Admin Master B

```sql
-- Como admin_master A
UPDATE public.profiles
SET global_role = 'admin'
WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';  -- Admin Master B
```

**Esperado:** ✅ ACEITO (necessário para remoção de admin rogue)  
**Teste Real:** ?

---

## 🔧 SCRIPT DE TESTES REAIS

Para executar estes testes no Supabase DEV, seria necessário:

```bash
# 1. Criar usuários de teste
supabase db push
# Rodar migration

# 2. Cria users via Supabase Auth API
curl -X POST https://bvwfoafkqjquxcbijffj.supabase.co/auth/v1/signup \
  -H "apikey: sb_publishable_..." \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser1@test.example",
    "password": "TestPass@123"
  }'

# 3. Obter JWT tokens para cada user

# 4. Executar queries como cada user:
curl -X POST https://bvwfoafkqjquxcbijffj.supabase.co/rest/v1/profiles \
  -H "apikey: sb_publishable_..." \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "global_role": "admin"
  }'

# 5. Verificar resposta (deve ser 403 Forbidden)
```

---

## 📋 CHECKLIST DE TESTES

**Testes Negativos (DEVEM FALHAR):**
- [ ] Test Neg #1: User eleva a si mesmo
- [ ] Test Neg #2: User muda status
- [ ] Test Neg #3: User ativa MFA
- [ ] Test Neg #4: User altera perfil de outro
- [ ] Test Neg #5: User tenta SQL injection

**Testes Positivos (DEVEM PASSAR):**
- [ ] Test Pos #1: User atualiza email
- [ ] Test Pos #2: User atualiza nome
- [ ] Test Pos #3: Admin Master eleva user
- [ ] Test Pos #4: Admin Master ativa MFA
- [ ] Test Pos #5: Admin Master suspende user
- [ ] Test Pos #6: Admin Master não remove seu acesso
- [ ] Test Pos #7: Admin Master B remove admin de A

---

## 🚨 PROBLEMA COM TESTES

A validação com testes REAIS é complexa porque:

1. **Requer ambiente isolado** - Supabase DEV pode ser compartilhado
2. **Requer transações isoladas** - Testes podem interferir um com o outro
3. **Requer limpeza** - Profiles de teste precisam ser removidos
4. **Requer análise de código** - Não apenas "passa/falha"

---

## ✅ ANÁLISE ESTÁTICA (O que PODEMOS fazer agora)

### Análise da Policy Atual (PROBLEMÁTICA)

```sql
WITH CHECK (
  auth.uid() = user_id
  AND global_role = (SELECT global_role FROM public.profiles WHERE user_id = auth.uid())
  AND status = (SELECT status FROM public.profiles WHERE user_id = auth.uid())
  AND mfa_enabled = (SELECT mfa_enabled FROM public.profiles WHERE user_id = auth.uid())
)
```

**Problemas Identificados:**
1. ✗ SELECT dentro de WITH CHECK (recursão potencial)
2. ✗ SELECT lê banco, não NEW record (lógica frágil)
3. ✗ Comparação: NEW value = OLD value (funciona POR ACASO)

**Resultado:** Falso positivo de segurança

---

## 🔧 SOLUÇÃO: USAR TRIGGER (RECOMENDADO)

Implementar função trigger que:
1. Compara OLD vs NEW
2. Bloqueia mudança de colunas sensíveis para users comuns
3. Permite tudo para admin_master

```sql
CREATE FUNCTION prevent_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- Se não é admin master
  IF NOT public.is_admin_master(auth.uid()) THEN
    -- Bloquear mudança de global_role
    IF NEW.global_role IS DISTINCT FROM OLD.global_role THEN
      RAISE EXCEPTION 'Permission denied: Cannot modify role';
    END IF;
    
    -- Bloquear mudança de status
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Permission denied: Cannot modify status';
    END IF;
    
    -- Bloquear mudança de mfa_enabled
    IF NEW.mfa_enabled IS DISTINCT FROM OLD.mfa_enabled THEN
      RAISE EXCEPTION 'Permission denied: Cannot modify MFA';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER check_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION prevent_privilege_escalation();
```

**Vantagens:**
- ✅ Sem recursão RLS
- ✅ Lógica clara: OLD vs NEW
- ✅ Fácil de testar
- ✅ Explícito e defensivo
- ✅ Erro claro para debug

---

## 📊 MATRIZ FINAL

| Teste | Tipo | Status Atual | Com Trigger | Recomendação |
|-------|------|--------------|-------------|--------------|
| User eleva a admin | NEG | ❓ Recursão | ✅ REJEITA | ✅ |
| User muda status | NEG | ❓ Recursão | ✅ REJEITA | ✅ |
| User ativa MFA | NEG | ❓ Recursão | ✅ REJEITA | ✅ |
| User altera outro | NEG | ✅ REJEITA | ✅ REJEITA | ✅ |
| User atualiza email | POS | ✅ ACEITA | ✅ ACEITA | ✅ |
| Admin Master eleva | POS | ✅ ACEITA | ✅ ACEITA | ✅ |
| Admin Master não remove seu acesso | POS | ⚠️ Policy | ✅ ACEITA | ⚠️ Testar |

---

## 🎯 CONCLUSÃO

**Recomendação:** Implementar TRIGGER para remover:
- SELECT em WITH CHECK
- Recursão RLS potencial
- Falsa sensação de segurança

**Próximo Passo:** Atualizar migration SQL com trigger approach

**Status:** ⏸️ BLOQUEADO ATÉ IMPLEMENTAR TRIGGER

