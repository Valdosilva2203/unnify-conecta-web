# CLAUDE.md — Unnify Conecta

Plataforma que conecta empresas e escritórios contábeis. Trabalha com dados empresariais, financeiros, contábeis e pessoais.

**Duas prioridades absolutas e permanentes, válidas para toda página, componente e funcionalidade:**

1. **Responsividade total (mobile first) com experiência próxima de app nativo.**
2. **Segurança em primeiro lugar. Segurança não é opção.**

Comunicação e nomes do banco em **português do Brasil**.

---

## 1. Responsividade — mobile first

O sistema precisa funcionar confortavelmente em smartphones pequenos (320px), Android/iPhone, tablets, notebooks, desktop e ultrawide, em retrato e paisagem e com zoom.

Regras de interface:

1. Layout se adapta ao espaço; **nunca** rolagem horizontal da página inteira.
2. Menu lateral vira navegação móvel (gaveta) abaixo de `md`.
3. Áreas de toque com no mínimo **44 × 44 px** no celular.
4. Formulários funcionais em telas pequenas; inputs com `type`/`inputMode`/`autoComplete` corretos (teclado certo no celular).
5. Modais viram tela cheia ou bottom sheet no celular.
6. Tabelas viram **cartões** no celular (ver `components/admin/tabela.tsx`), preservando todos os dados e ações; rolagem horizontal só localizada.
7. Gráficos ajustam tamanho e legenda.
8. Textos legíveis (mín. 16px em inputs no celular para evitar zoom automático do iOS).
9. Imagens com `next/image`, proporção preservada.
10. Estados de carregando, erro, vazio e sucesso em todos os tamanhos.
11. Respeitar safe areas (`env(safe-area-inset-*)`) — `viewport-fit=cover` está no layout raiz.
12. Teclado, foco visível, leitores de tela, `aria-*` corretos.
13. Transições discretas; respeitar `prefers-reduced-motion`.
14. Prevenir clique duplo/envio repetido (botão desabilitado durante envio).

Não basta encolher o desktop: o layout deve ser pensado para cada dispositivo.

## 2. Segurança — obrigatória

1. Toda operação sensível valida **autenticação e autorização no servidor** e no banco (RLS), nunca só escondendo botão.
2. Nunca confiar em IDs, papéis ou permissões vindos do navegador. Identidade = `auth.uid()` / token validado no servidor.
3. RLS ativo e **testado** em toda tabela com dados de usuários/empresas. Isolamento entre empresas, contadores e escritórios.
4. Menor privilégio. Não usar Admin Master nem `service_role` como atalho para contornar RLS.
5. **Nunca** desativar RLS, triggers ou controles de segurança para facilitar desenvolvimento.
6. `SUPABASE_SERVICE_ROLE_KEY` e demais segredos **só no servidor**; nada de segredo em código, git ou logs.
7. Validar dados recebidos no servidor; mensagens de erro sem vazar detalhes internos.
8. Rate limiting em endpoints sensíveis; CSRF onde o mecanismo de auth exigir.
9. Trilha de auditoria (tabela `auditoria`) para operações críticas.
10. MFA para contas administrativas (pendente — ver seção 7).
11. Testes automatizados nunca usam dados financeiros reais.
12. Migrações preservam integridade referencial e não são destrutivas sem autorização explícita.

## 3. Identidade visual

Clean, moderno, profissional. Laranja (`orange-500/600`) como destaque, fundos claros, tipografia e espaçamentos consistentes, ícones `lucide-react`.
Reutilizar componentes compartilhados em vez de criar soluções por página:

- `components/AdminLayout.tsx`, `AdminSidebar.tsx`, `AdminHeader.tsx` — casca do admin (menu em gaveta no celular).
- `components/admin/tabela.tsx` — tabela padrão (filtros, avatar, selos, ações, paginação, cartões no celular).

## 4. Checklist obrigatória para nova página/componente

- [ ] Responsividade validada (320, 375, 390, 430, 768, 1024, 1280, 1440, 1920 px + paisagem no celular)
- [ ] Acessibilidade validada (teclado, foco, rótulos, contraste)
- [ ] Segurança e autorização verificadas no servidor/RLS
- [ ] Estados de carregando, erro e vazio implementados
- [ ] Testes funcionais executados no navegador (Playwright), olhando console e requisições com falha
- [ ] Nenhuma regressão identificada

Um teste **não** está aprovado só porque a página carregou.

## 5. Testes

```bash
npx playwright test tests/e2e/responsividade.spec.ts   # todas as rotas x larguras
npx tsc --noEmit
```

Testes de rotas autenticadas criam usuários temporários `delivered+...@resend.dev` no Supabase DEV e os apagam ao final.

## 6. Banco de dados (Supabase `unnify-conecta-dev`, ref `bvwfoafkqjquxcbijffj`)

Use **somente** este projeto. Nomes de tabelas/colunas/índices/restrições em português.

- `perfis`: `id_usuario` (FK `auth.users`, cascade), `email`, `nome_completo`, `funcao_global` ('admin_master' | 'admin' | 'user'), `tipo_usuario` ('empresa' | 'contador'), `status`.
- `empresas`: `id`, `cnpj`, `razao_social`, `nome_comercial`, `telefone`, `email_comercial`, `cidade`, `estado`, `status_registro` ('ATIVA' | 'PENDENTE' | 'SUSPENSA', padrão 'ATIVA'), `tipo_empresa` ('comum' | 'escritorio_contabil'), `criado_por`, `criado_em`.
  Escritórios contábeis também ficam aqui (`tipo_empresa = 'escritorio_contabil'`).
- `usuarios_empresas`: vínculo `id_usuario` ↔ `id_empresa`, `tipo_vinculacao` ('dono' ...), `ativo`.
- `auditoria`, `membros_escritorio`, `escritorios_contabeis` (estas duas ainda vazias/legadas).
- Cadastro de empresa: RPC `criar_empresa(p_cnpj, p_razao_social, p_telefone, p_email_comercial, p_cidade, p_estado, p_tipo_empresa, p_nome_comercial)` → `(id, sucesso, mensagem)`.

**Migrações:** salvar em `supabase/migrations/` e aplicar via Management API dentro de `BEGIN; ... COMMIT;`.
**Nunca rodar `supabase db push`** — as migrações 000004+ não estão registradas em `schema_migrations`.

## 7. Forma de trabalho (economia de tokens sem perder qualidade)

- Trabalhar por módulos; ao fim de cada um, resumo curto: o que mudou, páginas afetadas, testes que passaram, pendências.
- Usar o contexto mínimo necessário: ler só os trechos relevantes (Grep/offset) em vez de arquivos inteiros; não repetir análises, auditorias ou leituras já feitas na sessão.
- Este CLAUDE.md é a fonte das regras permanentes e do schema — consultar aqui antes de reinvestigar o banco ou a arquitetura, e mantê-lo atualizado quando algo mudar.
- Não iniciar agentes paralelos sem necessidade real.
- Testes objetivos e relevantes ao que mudou; **nunca** pular as verificações de segurança (`tests/e2e/seguranca.spec.ts`) quando a mudança tocar autenticação, autorização, RLS, APIs ou dados.
- Economizar tokens nunca justifica reduzir qualidade de código, segurança ou cobertura de testes.

## 8. Restrições e pendências

- Não fazer deploy sem pedido explícito do usuário.
- Não executar operações destrutivas no banco sem autorização.
- Mudança de política de segurança (RLS) só via migração revisada e testada.
- Já existe: guarda de `/admin` (`components/admin/GuardaAdmin.tsx`, camada de UI — dados protegidos por RLS); limite de tentativas em `lib/limite-taxa.ts` (cadastro e consulta de CNPJ); usuário no servidor via `lib/supabase/usuario-servidor.ts`.
- Pendente: MFA para administradores; limite de tentativas em armazenamento compartilhado (hoje em memória, aproximado em serverless); gravar trilha na tabela `auditoria`; trocar dados fictícios das páginas Contadores, Parceiros, Usuários, Assinaturas, Comissões e Auditoria por dados reais; páginas "Minha conta/Dados da empresa/Configurações" do usuário empresa.
