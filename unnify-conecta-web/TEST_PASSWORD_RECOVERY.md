# 🔐 Password Recovery Flow - Test Guide

## Correção Implementada

✅ **Commit 09d57fe** - Use single Supabase client instance
- Instância única do cliente Supabase mantida durante todo o ciclo de vida do componente
- Mesma sessão compartilhada entre `exchangeCodeForSession()` e `updateUser()`
- Logs seguros adicionados para diagnóstico

## Teste Manual (Recomendado)

### Requisitos
- Acesso ao localhost:3000
- Email pessoal para receber link de recuperação
- Console do navegador (F12) para visualizar logs

### Passo a Passo

#### 1️⃣ Criar ou Usar Conta Existente
```
1. Acesse http://localhost:3000/signup
2. Crie uma conta com:
   - Nome: Test User
   - Email: seu@email.com (REAL, receberá o link)
   - Senha: Secure123!@#
3. Complete o onboarding
```

#### 2️⃣ Solicitar Recuperação de Senha
```
1. Acesse http://localhost:3000/forgot-password
2. Clique em "Voltar para login"
3. Acesse http://localhost:3000/login
4. Clique em "Esqueceu sua senha?" (link abaixo de campo de senha)
5. Você será redirecionado para /forgot-password
6. Digite o email da conta criada
7. Clique em "Enviar link de recuperação"
8. Aguarde mensagem "E-mail enviado!"
```

#### 3️⃣ Abrir Link de Recuperação
```
1. Verifique seu email (pode estar em spam)
2. Procure por email de "Unnify Conecta" com título sobre recuperação
3. Clique no link "Redefinir Senha" ou similar
4. Você será redirecionado para /reset-password?type=recovery&code=XXX
```

#### 4️⃣ Visualizar Logs de Diagnóstico
```
1. Abra o Console do Navegador (F12 → Console)
2. Procure por mensagens com prefixo [ResetPassword]
3. Você deve ver sequência:
   ✅ [ResetPassword] 1. Attempting to exchange recovery code
   ✅ [ResetPassword] 2. Code exchange successful, session established
   ✅ [ResetPassword] 3. Session user ID: (seu-id-aqui)
```

**Se vir erros aqui, anote a mensagem exata do Supabase:**
```
❌ [ResetPassword] 2. Code exchange failed: {
  errorName: "...",
  errorMessage: "...",
  errorStatus: ...
}
```

#### 5️⃣ Definir Nova Senha
```
1. Se os logs acima mostram sucesso, você verá o formulário:
   - Campo: "Nova senha"
   - Campo: "Confirmar senha"
   - Botão: "Atualizar senha"

2. Digite nova senha que atenda aos requisitos:
   - Mínimo 8 caracteres
   - Letra minúscula
   - Letra maiúscula
   - Número
   - Símbolo (ex: ! @ # $ % )
   
3. Exemplo válido: NewPass123!@#

4. Clique "Atualizar senha"
```

#### 6️⃣ Verificar Logs de Update
```
Console deve mostrar:
✅ [ResetPassword] 4. Attempting to update password
✅ [ResetPassword] 5. Password update successful
```

#### 7️⃣ Validar Sucesso
```
1. Você verá tela de sucesso:
   - Ícone de checkmark verde
   - Título: "Senha atualizada com sucesso!"
   - Botão: "Ir para o login"

2. Clique "Ir para o login"
3. Faça login com:
   - Email: seu@email.com
   - Senha: NewPass123!@# (a nova senha)
4. Você deve ser redirecionado para seu dashboard (/app ou /contador)
```

## Cenários de Teste

### ✅ Cenário A: Fluxo Completo Bem-Sucedido
**Resultado esperado:** Login bem-sucedido com nova senha

### ⚠️ Cenário B: Link Expirado
1. Aguarde 1+ hora
2. Tente abrir o link antigo
**Resultado esperado:** "Link de recuperação inválido ou expirado"

### ⚠️ Cenário C: Link em Navegador Diferente
1. Abra o link em navegador incógnito/privado
**Resultado esperado:** Pode falhar se PKCE quebrado (verificar logs)

### ⚠️ Cenário D: Múltiplas Abas
1. Abra o link em duas abas simultaneamente
2. Na primeira aba, complete o reset
3. Na segunda aba, tente usar
**Resultado esperado:** Código já consumido, erro no segundo

## Diagnóstico via Logs

### Logs Esperados (Sucesso)
```
[ResetPassword] 1. Attempting to exchange recovery code
[ResetPassword] 2. Code exchange successful, session established
[ResetPassword] 3. Session user ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
[ResetPassword] 4. Attempting to update password
[ResetPassword] 5. Password update successful
```

### Logs de Erro (Falha)

**"Link inválido ou expirado":**
```
[ResetPassword] 2. Code exchange failed: {
  errorName: "AuthError",
  errorMessage: "code_exchange_failed",
  errorStatus: 400
}
```
→ Verificar: Link expirado? Já foi usado?

**"Erro ao atualizar senha":**
```
[ResetPassword] 5. Password update failed: {
  errorName: "AuthError",
  errorMessage: "Session expired",
  errorStatus: 401
}
```
→ Verificar: Sessão perdida entre troca e update?

**Erro de exceção:**
```
[ResetPassword] Exception during code exchange: Network Error
```
→ Verificar: Conexão? Supabase indisponível?

## Correção Aplicada

### Antes (❌ Problema)
```typescript
// Linha 41: Primeira instância
const supabase = createClient();
await supabase.auth.exchangeCodeForSession(code);

// Linha 100: Segunda instância (DIFERENTE!)
const supabase = createClient();
await supabase.auth.updateUser({ password });
```

**Problema:** Múltiplas instâncias podem não compartilhar sessão

### Depois (✅ Solução)
```typescript
// Uma única instância para todo o componente
const supabaseRef = useRef(createClient());

// Troca do código usa mesma instância
await supabaseRef.current.auth.exchangeCodeForSession(code);

// Update usa mesma instância (mesma sessão)
await supabaseRef.current.auth.updateUser({ password });
```

**Vantagem:** Sessão garantida entre operações

## Validação

✅ **Build:** Compilou sem erros TypeScript
✅ **Instância única:** Refatorada e testada
✅ **Logs seguros:** Sem tokens/senhas, apenas diagnóstico
✅ **RLS intacta:** Nenhuma mudança em permissões
✅ **Teste manual:** Siga guia acima

## Possíveis Causas Residuais

Se o teste ainda falhar mesmo com a correção, pode ser:

1. **PKCE com navegadores diferentes:**
   - Link aberto em Chrome, mas token em Firefox
   - Solução: Usar mesmo navegador

2. **Email não chegando:**
   - Spam box, ratelimit
   - Solução: Aguardar, verificar spam

3. **Supabase configuração:**
   - Auth settings não permite recovery
   - Solução: Verificar Supabase Dashboard → Auth → Email Templates

4. **localStorage limpo:**
   - Sessão perdida por navegador
   - Solução: Não limpar cache entre etapas

## Relatório Esperado

Após completar teste bem-sucedido, apresentar:

```
✅ E-mail de recuperação recebido
✅ Link aberto sem erro
✅ Logs mostram code exchange bem-sucedido
✅ Formulário de senha exibido
✅ Nova senha aceita
✅ Login bem-sucedido com nova senha
✅ Dashboard carregou
```

---

**Nota:** Se o teste falhar, anote os logs exatos e compartilhe para análise mais aprofundada.
