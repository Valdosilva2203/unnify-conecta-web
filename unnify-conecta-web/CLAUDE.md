# CLAUDE.md - Unnify Conecta

## Obrigações de Teste

**CRÍTICO:** Nunca declare uma funcionalidade concluída sem testar.

### Antes de Cada Sessão

```bash
bash scripts/test-setup.sh
```

Isso valida:
- ✅ Servidor Next.js rodando em localhost:3000
- ✅ Playwright instalado
- ✅ Build compila sem erros

### Testes Obrigatórios Antes de PR

```bash
npx playwright test tests/auth-flow.spec.ts
npm run build
```

## Schema do Banco (Supabase unnify-conecta-dev)

### Tabela: public.perfis
- `user_id` (UUID) - ID do usuário Supabase Auth
- `global_role` (TEXT) - 'admin_master' | 'admin' | 'user'
- `mfa_enabled` (BOOLEAN)
- `status` (TEXT) - 'active' | 'suspended' | 'inactive'

⚠️ **Erro comum:** Usar `id_usuario` ou `funcao_global` (nomes antigos)

### Tabela: public.empresas
- `id` (UUID)
- `user_id` (UUID) - Proprietário
- `criado_por` (UUID) - Quem criou
- `razao_social`, `nome_comercial`, `cnpj`

## Fluxo de Autenticação

```
Login (/login)
    ↓
Supabase Auth (.signInWithPassword)
    ↓
router.push('/app')
    ↓
/app/layout.tsx verifica:
  - user autenticado? SIM → continua
  - perfis.global_role = 'admin_master' ou 'admin'? SIM → /admin
  - perfis.global_role = 'user'? SIM → verifica empresa
    - empresa existe? SIM → renderiza /app
    - empresa NÃO existe? → /onboarding
```

## Teste de Login Real

Quando tiver contas de teste autorizadas:

```typescript
// Usar credenciais reais do Supabase DEV
const email = 'test@example.com';
const password = 'SecurePassword123!';

// Validar redirecionamentos:
// admin_master → /admin
// user com empresa → /app
// user sem empresa → /onboarding
```

## Erros Comuns

| Erro | Causa | Solução |
|------|-------|---------|
| HTTP 400 em perfis | Coluna inexistente (id_usuario) | Usar `user_id` |
| Usuário em /onboarding | Sem perfil ou empresa | Criar perfil no Supabase |
| /admin não carrega | app/admin/page.tsx vazio | Verificar se página existe |
| Loop /app → /login | Erro na query | Verificar syntax e colunas |

## Configuração Persistente

- Scripts em `/scripts` - reutilizáveis entre sessões
- Testes em `/tests` - prontos para Playwright
- `.env.local` - NÃO versionado, use quando necessário

## Restrições

- ❌ Não modificar banco sem autorização
- ❌ Não alterar RLS policies
- ❌ Não fazer deploy sem aprovação
- ❌ Não expor credenciais em código/git
- ❌ Não criar novo projeto Supabase

## Links Úteis

- Supabase DEV: https://app.supabase.com/projects
- Projeto: bvwfoafkqjquxcbijffj
- Localhost: http://localhost:3000
