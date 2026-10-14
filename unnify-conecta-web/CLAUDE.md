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
13. **Rotas de API nunca escrevem com `service_role` em nome do usuário**: sob `service_role`, `auth.uid()` é nulo e gatilhos/regras por usuário não atuam. Escrita do usuário = função no banco chamada com o token dele.
14. **O banco "DEV" (`bvwfoafkqjquxcbijffj`) é o mesmo da produção.** Migration aplicada = vale para usuários reais na hora; testes e2e escrevem nele. Só aplicar/rodar com autorização específica. Não há backup listado no projeto (sem PITR): exigir backup antes de mudanças de dados.
15. Editar arquivos de texto só com as ferramentas de edição (UTF-8). **Nunca** `Get-Content`/`Set-Content` do PowerShell 5.1 sem `-Encoding utf8` (corrompe acentos).

### E4.1 — Convites e vinculação recíproca (migration 000035, APLICADA no Supabase em 13/10/2026; depois da 000034)
- Reaproveita `vinculos_contabeis` (sem segundo modelo). A: `consultar_empresa_por_cnpj` (só contador ativo, DV validado, 30/h registradas em `consultas_cnpj`, devolve só nome/cidade/UF) + `solicitar_vinculo_por_cnpj`; empresário aceita com `aceitar_vinculo_contabil` (define função e permissões na mesma transação). C: catálogo existente. B/D: `convites_vinculos` (sem acesso direto; token de 256 bits gerado no SERVIDOR em `/api/convites`, banco guarda só SHA-256, 7 dias, uso único, um pendente por destinatário, reenvio gera token novo) e `aceitar_convite_vinculo` (e-mail CONFIRMADO e igual ao convite, cadastro concluído, CNPJ conferido, aceite explícito, FOR UPDATE + idempotente; contador não amplia permissões do convite). Link do e-mail: `/convite#<token>` (fragmento não chega a servidores/logs); token guardado só no `localStorage` até o onboarding.
- Notificações: `notificacoes` (RLS: só as próprias) criadas pelo gatilho `notificar_mudanca_vinculo` (vale para todos os fluxos). E-mails de aviso vão para `fila_emails` (sem acesso de usuários), processada por `/api/notificacoes/processar` (POST de usuário logado com limite, ou GET com `CRON_SECRET`; chave de serviço só para reservar/concluir itens da fila). Sino em `components/notificacoes/SinoNotificacoes.tsx`.
- Telas: `/contador/empresas` (+ Vincular empresa, convites enviados), `/app/meu-contador/buscar` (Convidar meu contador), Meu Contador (aceitar com permissões, convites enviados), `/convite`, onboarding empresa/contador (aceite explícito). Testes: `tests/sql/convites-vinculos.mjs` (57, PostgreSQL local, inclui concorrência real) e `convites-vinculos-ui.spec.ts` (API simulada).

### E5 — Saúde Empresarial (migration 000034, APLICADA no Supabase em 13/10/2026; depende da 000031)
- Sem tabela nova. Uma função de leitura `saude_empresarial(p_id_empresa, p_meses ∈ 1|3|6|12)` (SECURITY DEFINER) confere `pode_ver_financeiro` ANTES de ler: dono/sócio, ou contador com vínculo ATIVO + `ver_financeiro`/`gerenciar_financeiro` (sem permissão nova; rótulo passou a "Ver financeiro e saúde empresarial"). Admin Master sem acesso. Revogar/encerrar bloqueia na hora.
- Tudo é calculado no banco: cards (receita/despesa operacional PAGAS no período — classificação da E2; resultado operacional de CAIXA; saldo REGISTRADO via `saldo_conta_financeira`, `null` = sem contas), indicadores, índice, regras de recomendação, composição por categoria, contas a pagar vencidas/30 dias, fluxo de caixa (movimentações efetivas, transferências fora, saldo ao fim de cada mês) e série operacional (reaproveitada de `resumo_financeiro`). Período = janela móvel de N meses até hoje; anterior = mesma duração antes.
- Índice **saude-v1** (documentado em `lib/saude-empresarial.ts` e exibido na tela): margem operacional de caixa 30 · cobertura de obrigações de curto prazo 25 · regularidade de pagamentos 20 · evolução receitas × despesas 15 · inadimplência de recebíveis 10; média ponderada SÓ dos aplicáveis; só calcula com margem aplicável + ≥ 5 lançamentos operacionais liquidados + ≥ 50% dos pesos — senão "Dados insuficientes". Faixas 80/60/40. Mudar regra ou peso = nova versão (SQL e lib juntos).
- Recomendações: o banco devolve `codigo` + `dados` numéricos; o texto é montado em `textoRecomendacao` só com esses números (sem IA).
- Telas: `/app/saude-empresarial` (item no menu) e aba "Saúde Empresarial" em `/contador/empresas/[id]` (somente leitura, sem links para o Financeiro). Componentes em `components/saude/`. Financeiro aceita `?categoria=<uuid>#lancamentos` (lista filtrada). Erro nunca vira R$ 0,00; 42501 = "sem acesso"; atualiza ao voltar à aba (foco/visibilidade).
- Testes: `tests/sql/saude-empresarial.mjs` (36 verificações no PostgreSQL local, valores calculados à mão) e `saude-empresarial-ui.spec.ts` (API simulada). Reversões 034 → 029 e reaplicação testadas em banco local recriado do backup.

### E4 — Meu Contador (migration 000033, APLICADA no Supabase em 13/10/2026; depende da 000032)
- Sem tabelas novas nem segundo modelo de relacionamento: vínculo = `vinculos_contabeis` + funções existentes (`solicitar_vinculo_contabil`, `responder_vinculo_contabil`, `alterar_vinculo_contabil`, `encerrar_vinculo_contabil`, `vinculos_da_empresa`, `empresas_do_contador`) e histórico `historico_vinculos_contabeis`.
- 000033 = só leitura: `resumo_relacionamento_contabil` e `historico_relacionamento_contabil` (empresário/dono-sócio; histórico só com descrição, data e NOME — sem IDs/e-mails), `painel_contador()` (empresas com vínculo ATIVO do próprio contador; contagem de cada área só se a permissão existir — `null` = sem permissão, nunca zero) e `proximas_obrigacoes_contador()` (só empresas com `gerenciar_obrigacoes`).
- `/app/meu-contador`: card do escritório (vínculo principal ativo), 4 indicadores (falha = "Indisponível"), abas Solicitações (E3) · Obrigações (E3, compacto) · Documentos (só compartilhados) · Permissões (`components/meu-contador/GestaoVinculos.tsx` = a antiga página de vínculos, lógica intacta) · Histórico. Sem vínculo ativo: a gestão de vínculos com o convite "Buscar contador".
- `/contador` = Painel do Contador (indicadores, empresas com busca/filtro, próximas obrigações). `/contador/empresas/[id]` = espaço de trabalho: abas conforme permissões (Solicitações/Documentos com `ver_documentos`, Obrigações com `gerenciar_obrigacoes`, Financeiro somente leitura com `ver_financeiro` — `VisaoGeral` sem `aoIrPara/aoNovo`); empresa sem vínculo ativo = "sem acesso".
- Next 16 + cacheComponents: `useParams`/`usePathname` em rota dinâmica SEMPRE dentro de `<Suspense>` (página e `AccountantSidebar` já ajustados) — o dev server não acusa, só o build.
- Testes: `tests/sql/meu-contador.mjs` (26 verificações no PostgreSQL local), `meu-contador-e4-ui.spec.ts` (API simulada). `meu-contador.spec.ts` (antigo, escreve no banco) ajustado para a aba Permissões — ainda não executado.

### E3 — Documentos e Obrigações (migration 000032, APLICADA no Supabase em 13/10/2026; independente de 029–031)
- Reaproveita o vínculo contábil: contador acessa SÓ com vínculo ativo + permissão (`contador_pode`): `ver_documentos` (ver o que foi COMPARTILHADO, solicitar e analisar), `enviar_documentos` (enviar; já nasce compartilhado), `gerenciar_obrigacoes`. Dono/sócio (`e_gestor_empresa`) controla tudo da empresa. Admin/Admin Master: **sem acesso**. Revogar o vínculo corta na hora (vínculo encerrado não reabre — regra existente).
- Tabelas: `documentos_empresa` (+ `historico_documentos`), `solicitacoes_documentos` (+ histórico; pendente → enviado → aceito | correcao_solicitada → enviado …; cancelado), `obrigacoes_empresa` (+ `historico_obrigacoes`; "atrasada" CALCULADA em `obrigacoes_empresa_situacao`). Leitura por RLS; escrita só por funções (`registrar_documento`, `atualizar_documento`, `excluir_documento` lógica, `criar/responder/analisar/cancelar_solicitacao_documento`, `salvar_obrigacao`, `alterar_situacao_obrigacao`, `criar_tarefa_da_obrigacao` — UMA tarefa no módulo Tarefas existente, sem sincronizar status; `responsaveis_obrigacoes`, `resumo_documentos_obrigacoes`). Nada de obrigação/imposto/prazo gerado automaticamente.
- Storage privado `documentos-empresas` (`<id_empresa>/<uuid>.<pdf|jpg|png>`, 10 MB). Envio **só pela rota `app/api/documentos/route.ts`**: tipo real pelos bytes iniciais (`lib/documentos.ts`), extensão coerente, PDF com conteúdo ativo recusado, tamanho (`NEXT_PUBLIC_DOCUMENTOS_TAMANHO_MAXIMO_MB`, padrão **4 MB** porque a Vercel limita o corpo da rota a 4,5 MB; bucket aceita até 10 — para arquivos maiores, trocar por upload direto com URL assinada + validação no servidor), limite 20 envios/10 min (+ 60/h no banco), grava com a SESSÃO DO USUÁRIO (nunca service_role) e remove o arquivo se o registro falhar. Leitura/remoção no Storage por `pode_ler_arquivo_documento` / `pode_remover_arquivo_documento` (definer: DELETE com filtro só alcança linhas visíveis pela política de leitura). Download/visualização por URL temporária de 60 s.
- Telas: `/app/documentos` (Documentos | Solicitações do contador), `/app/obrigacoes`, `/contador/documentos`, `/contador/obrigacoes` (seletor de empresas vinculadas com a permissão). Componentes em `components/documentos/` e `components/obrigacoes/`.
- Testes: `tests/sql/documentos-obrigacoes.mjs` (49 verificações no PostgreSQL local, inclusive políticas do Storage; o Storage exige `storage.allow_delete_query` para DELETE, como a API faz), `documentos-arquivo.spec.ts` (validação de arquivos) e `documentos-obrigacoes-ui.spec.ts` (API simulada). Todas as reversões 032 → 029 testadas no banco local.

### E2 — Classificação financeira (migration 000031, APLICADA no Supabase em 13/10/2026; depende da 000030)
- Reaproveita `lancamentos_financeiros.natureza_financeira` (sem tabela nova). Receita: `operacional` | `aporte_socio` | `financiamento` (entrada de empréstimo). Despesa: `operacional` | `pro_labore` | `distribuicao_lucros` | `financiamento` (pagamento/parcela). Combinação validada por constraint + `validar_natureza_lancamento`.
- `salvar_lancamento_financeiro` ganhou `p_natureza` (DEFAULT NULL): sem ele, insere `operacional` e, na edição, **mantém** a classificação atual (nada é reclassificado automaticamente). Pró-labore, distribuição e aporte exigem o sócio em `contraparte` (checado DEPOIS da permissão). Parcela de contrato não muda de classificação.
- Saldo: inalterado — só a baixa (`registrar_baixa_lancamento`) movimenta conta; trava, movimentação única e estorno valem para todas as classificações.
- `resumo_financeiro`: `receitas_mes`/`despesas_mes` (e anteriores) = **só operacionais**; novos `pro_labore_mes`, `distribuicoes_lucros_mes`, `aportes_socios_mes`, `entradas_financiamentos_mes`, `amortizacao_financiamentos_mes` (= parcela − juros), `transferencias_mes`, `entradas_caixa_mes`, `saidas_caixa_mes`; série com `receitas`/`despesas` (caixa, como antes) + `receitas_operacionais`/`despesas_operacionais`.
- Interface: campo "Classificação" no lançamento (só envia `p_natureza` quando não é operacional ⇒ funciona antes da 031; sem ela, aviso claro); selo na lista; "Outras movimentações do mês" na Visão geral; painel `/app` usa a série operacional.
- Testes: `tests/sql/classificacao-financeira.mjs` (25 verificações direto no PostgreSQL **local** restaurado do backup — aporte, distribuição, pró-labore, empréstimo, saldo, concorrência, estorno, isolamento; recusa rodar fora de localhost) e `classificacao-financeira-ui.spec.ts` (API simulada). Banco local: `tests/sql/recriar-banco-local.sh` (PostgreSQL 17 portátil, porta 55432).

### E1 — Minha Empresa (painel `/app`)
- `app/app/page.tsx`: indicadores e gráficos SÓ de `resumo_financeiro` (receitas/despesas pagas do mês e variação, a pagar/receber em 30 dias, série de 6 meses); listas de `lancamentos_financeiros_situacao` (pendente/vencido, por vencimento); cadastro de `empresas` (RLS). Erro de carregamento mostra "Indisponível" — **nunca R$ 0,00**; ausência de movimentação mostra estado vazio.
- "A receber" depende da migration **000030** (`a_receber_30_valor/qtd` no `resumo_financeiro`; APLICADA no Supabase em 13/10/2026); sem ela o card mostra "Indisponível".
- Edição cadastral: `components/app/FormDadosEmpresa.tsx` → somente `atualizar_dados_empresa` (E0); sem a função publicada, mensagem clara (PGRST202).
- `LayoutEmpresa`: empresas = vínculos ativos dono/sócio (`usuarios_empresas` + `empresas` sob RLS); seletor quando houver mais de uma; escolha lembrada por usuário em `localStorage` (só conveniência; o banco valida cada consulta). Contexto: `empresa, empresas, trocarEmpresa, recarregarEmpresas`. Sócio ainda não vê a empresa (a política de `empresas` só cobre o dono) — ajustar quando existir o convite de sócio.
- Componentes: `components/app/GraficoLinhas.tsx` (SVG, largura acompanha o contêiner); `GraficoRosca` ganhou `empilhado`; `Indicador` aceita `children`; `formatarCnpj` em `lib/contabil.ts`.
- Testes: `painel-empresa-ui.spec.ts` (API simulada no navegador, **não toca no banco** — pode rodar sempre) e `painel-empresa.spec.ts` (dados reais; escreve no banco — só com autorização e com 000029/000030 aplicadas).

### E0 — correções de segurança (migration 000029, APLICADA no Supabase em 13/10/2026)
- **S1** `perfis.tipo_usuario`: definido só por `criar_empresa` (escritorio_contabil → contador; comum → empresa), uma vez, via flag `unnify.definindo_tipo_usuario`; o gatilho `impedir_escalada_privilegio` impede o próprio usuário de escolher/trocar o tipo. Rota `/api/auth/update-tipo-usuario` removida.
- **S2** `empresas`: sem INSERT/UPDATE/DELETE direto (`authenticated`/`anon`); gatilhos `proteger_campos_empresa` (cnpj, razão social, tipo, status_registro, criado_por, criado_em imutáveis para usuários) e `impedir_exclusao_empresa`; edição só por `atualizar_dados_empresa` (dono/sócio; nome comercial, telefone, e-mail, cidade, UF, CNAE; registra em `auditoria`). Exclusão lógica de empresa: **não existe** (etapa própria).
- **S4** papel `admin` sem acesso amplo: políticas e funções passaram a `is_admin_master`; `pode_acessar_contexto_tarefas` mantém `is_admin` (tarefas da plataforma). Nenhum admin lê financeiro de empresas.
- **Ordem obrigatória**: aplicar a migration **antes** do deploy do código (o código novo não grava mais o tipo; a migration é compatível com o código antigo). Reversão: `supabase/migrations/rollback/20261013000029_seguranca_e0_reverter.sql`. Teste: `tests/e2e/seguranca-e0.spec.ts` (só roda com a migration aplicada).
- Pendentes da E0 (fora de S1/S2/S4): conta `admin_master` de teste ativa (`delivered+…@resend.dev`) a excluir; MFA dos admins (nenhum ativo) e exigência `aal2` no banco; testes antigos `auth.test.ts`/`signup.test.ts`/`database.test.ts`/`tests/admin-login.spec.ts` (criam contas lixo/usam conta real); `is_admin*` executável por `anon`; senha mínima 6; arquivos indevidos no repositório público.

## 3. Identidade visual

Clean, moderno, profissional. Laranja (`orange-500/600`) como destaque, fundos claros, tipografia e espaçamentos consistentes, ícones `lucide-react`.
Reutilizar componentes compartilhados em vez de criar soluções por página:

- `components/AdminLayout.tsx`, `AdminSidebar.tsx`, `AdminHeader.tsx` — casca do admin (menu em gaveta no celular).
- `components/admin/tabela.tsx` — tabela padrão (filtros, avatar, selos, ações, paginação, cartões no celular).
- `lib/email.ts` — envio de e-mail pelo Resend (`noreply@unnifyconecta.com.br`, domínio verificado). Cadastro e recuperação de senha geram o link com `auth.admin.generateLink` no servidor e enviam por aqui.
- **SMTP do Supabase Auth** (desde 13/10/2026): remetente `noreply@unnifyconecta.com.br` via Resend, `site_url` = produção, URLs de retorno liberadas: `https://unnifyconecta.com.br/**` e `http://localhost:3000/**`. Usado **só** na alteração de e-mail (`updateUser`, Secure Email Change: confirmação no e-mail atual e no novo; aviso ao e-mail antigo quando concluída). Modelos em PT-BR com link `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email_change` → `/auth/confirmar-email`. Limites do Supabase: 30 e-mails/hora no projeto e 60s entre envios por usuário — não desperdiçar em testes.
- **Minha conta** (identidade PESSOAL, igual para todos os perfis): `components/conta/MinhaConta.tsx` em `/app/minha-conta`, `/contador/minha-conta`, `/admin/perfil` (+ `/admin/seguranca` e `/admin/preferencias` abrindo na seção). Seções via `#dados|#seguranca|#notificacoes|#preferencias|#privacidade`. Não misturar com dados da empresa, escritório, perfil profissional ou config da plataforma.
  - Escrita só por funções: `atualizar_dados_pessoais` (nome/telefone), `definir_avatar` (bucket privado `avatares`, pasta `<id_usuario>/`), `solicitar_exclusao_conta` / `cancelar_solicitacao_privacidade` (tabela `solicitacoes_privacidade`; **exclusão de conta DESABILITADA** por decisão do produto — botões "Em breve" e EXECUTE revogado na migration 000021; reativar só após definir o processo), `exportar_meus_dados`. `preferencias_usuario` com RLS do dono.
  - `impedir_escalada_privilegio`: o próprio usuário não muda `funcao_global`, `status`, ids, nem `tipo_usuario` depois de definido no onboarding.
  - Senha: Supabase exige a senha atual (`security_update_password_require_current_password = true`); recuperação de senha não é afetada.
  - MFA TOTP: `lib/supabase/mfa.ts` + `/login/verificacao`; login, onboarding e as 3 guardas de área exigem AAL2 quando há fator ativo. Ainda NÃO exigido no RLS (pendência).
  - Notificações: só preferências salvas (envio ainda não existe, a tela diz isso). Tema escuro não suportado (só tema claro). "Reduzir animações" é real (`data-reduzir-animacoes`).
  - Testes: `tests/e2e/minha-conta.spec.ts` (inclui TOTP real).
- **Alteração de e-mail de acesso**: componente `components/conta/SegurancaConta.tsx`, dentro da seção Segurança de Minha conta. Nunca alterar `auth.users` diretamente nem usar service role no front. Teste: `tests/e2e/alterar-email.spec.ts` (confirma com os links reais lidos na API do Resend).

### Escolha de cores (regra do usuário, vale para qualquer tela)

Toda escolha de cor usa `components/ui/SeletorCor.tsx`: cores prontas + **"Cor personalizada"** (círculo cromático → seletor de cor do sistema) + campo **"Código da cor"** (#RRGGBB). Salvar sempre `#rrggbb` minúsculo e validar no banco (`^#[0-9a-fA-F]{6}$`). Texto/ícone sobre fundo colorido usa `corSobre()` de `lib/cores.ts` (contraste automático). Não criar paletas soltas.

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

- `perfis`: `id_usuario` (FK `auth.users`, cascade), `email` (espelho do e-mail confirmado no Auth: só muda pelo gatilho `on_auth_user_email_confirmed`; gravar outro valor é bloqueado), `nome_completo`, `funcao_global` ('admin_master' | 'admin' | 'user'), `tipo_usuario` ('empresa' | 'contador'), `status`.
- `empresas`: `id`, `cnpj`, `razao_social`, `nome_comercial`, `telefone`, `email_comercial`, `cidade`, `estado`, `status_registro` ('ATIVA' | 'PENDENTE' | 'SUSPENSA', padrão 'ATIVA'), `tipo_empresa` ('comum' | 'escritorio_contabil'), `criado_por`, `criado_em`.
  Escritórios contábeis também ficam aqui (`tipo_empresa = 'escritorio_contabil'`).
- `usuarios_empresas`: vínculo `id_usuario` ↔ `id_empresa`, `tipo_vinculacao` ('dono' ...), `ativo`.
- `auditoria`, `membros_escritorio`, `escritorios_contabeis` (estas duas ainda vazias/legadas).
- Cadastro de empresa: RPC `criar_empresa(p_cnpj, p_razao_social, p_telefone, p_email_comercial, p_cidade, p_estado, p_tipo_empresa, p_nome_comercial)` → `(id, sucesso, mensagem)`.

### Relacionamento empresas ↔ contadores (N:N) — regras permanentes

- **Contador individual** = usuário com `perfis.tipo_usuario = 'contador'`. **Escritório** = `empresas.tipo_empresa = 'escritorio_contabil'`. **Membros do escritório** = `usuarios_empresas` (dono/socio/contador) ligados ao escritório. `escritorios_contabeis` e `membros_escritorio` são legado vazio — não usar.
- **`vinculos_contabeis`** (tabela associativa): `id_empresa` (empresa comum), `id_contador` (usuário contador que recebe o acesso), `id_escritorio` (opcional, escritório pelo qual atende), `funcao` (principal | fiscal | folha_pagamento | consultoria | auxiliar), `status` (pendente | ativo | recusado | encerrado), `permissoes text[]`, `origem` (empresa | contador | escritorio), `solicitado_por`, `criado_em`, `aprovado_em/por`, `encerrado_em/por`, `motivo_encerramento`.
- Uma empresa tem vários contadores; um contador atende várias empresas; escritório atende várias empresas e tem vários membros.
- **Só um `principal` ativo por empresa** (índice único parcial — vale em concorrência). **Sem duplicidade** de vínculo pendente/ativo para a mesma relação (índice único parcial).
- Vínculo via escritório **não** dá acesso aos demais membros: só o `id_contador` designado acessa. Vínculo ativo exige `id_contador`.
- Histórico em `historico_vinculos_contabeis` (gatilho automático). **Sem exclusão física**: encerrar/recusar muda o status.
- Escrita **somente** pelas funções `solicitar_vinculo_contabil`, `responder_vinculo_contabil`, `alterar_vinculo_contabil`, `encerrar_vinculo_contabil` (validam quem pode o quê). Leitura: RLS para as partes e admins + funções paginadas `vinculos_da_empresa`, `empresas_do_contador`, `empresas_do_escritorio`, `admin_vinculos_contabeis`.
- Acesso do contador a dados da empresa: **sempre** via `contador_pode(id_empresa, permissao)` / vínculo ativo — nunca por nome, e-mail ou texto.
- Testes obrigatórios: `tests/e2e/vinculos.spec.ts` (integridade, duplicidade, concorrência, autorização, isolamento).
- Telas: empresa em `/app/meu-contador` (principal em destaque, demais vínculos, pendentes, histórico); contador em `/contador/empresas` (atendidas por mim / do escritório, busca, filtros, paginação). `membros_do_escritorio(id)` lista membros para designar quem atende.

### Catálogo de contadores — regras permanentes

1. Acesso **só** para empresas autenticadas e autorizadas (dono/sócio de empresa comum ativa) ou admin — `pode_ver_catalogo()`.
2. "Exibir meu perfil no catálogo" (`publicado`) é **desativado por padrão**; publicar exige CRC, cidade e UF.
3. Busca mostra apenas perfis publicados, ativos e elegíveis (`perfil_no_catalogo`).
4. Públicos (com autorização): nome profissional, foto, CRC, cidade/UF, especialidades, descrição, serviços, modalidade de atendimento.
5. E-mail/telefone comerciais **nunca** aparecem antes do vínculo **ativo**; depois, só se `compartilhar_contatos = true`.
6. Dados pessoais, financeiros e documentos nunca entram no catálogo.
7. Contador edita e despublica o próprio perfil (sem exclusão física). Escritório tem **perfil próprio** (`id_escritorio`), separado dos perfis dos membros.
8. Sem avaliações por enquanto. **Nunca** criar dados fictícios para preencher o catálogo.

- Tabela `perfis_profissionais` (`id_usuario` XOR `id_escritorio`, `nome_profissional`, `crc`, `cidade`, `estado`, `especialidades` (lista fixa em `lib/contabil.ts`), `servicos` ≤15, `descricao` ≤1500, `modalidades_atendimento text[]` (1–4 de: online | presencial | visita_cliente | telefone_whatsapp — o contador marca quantas quiser), `foto_caminho`, `email_comercial`, `telefone_comercial`, `compartilhar_contatos`, `publicado`). RLS: dono lê/insere/atualiza.
- Leitura pelo catálogo **só** via `buscar_catalogo_contadores(...)` e `perfil_do_catalogo(id)` (sem contatos). Solicitação via `solicitar_vinculo_pelo_catalogo(p_id_empresa, p_id_perfil, p_funcao)`.
- Fotos: bucket **privado** `fotos-perfis` (2MB, jpeg/png/webp), caminho `<id_perfil>/foto-<ts>`, exibidas por URL assinada (`components/contabil/FotoPerfil.tsx`).
- Telas: `/app/meu-contador/buscar`, `/app/meu-contador/[id]`, `/contador/perfil-profissional`. Testes: `tests/e2e/catalogo.spec.ts` (segurança) e `tests/e2e/meu-contador.spec.ts` (fluxo de UI).

### Financeiro (Fase 1) — regras permanentes

- Rota `/app/financeiro` (abas `#visao|#lancamentos|#pagar|#receber|#gastos-fixos|#parcelamentos|#contas|#categorias`), empresa = `useEmpresaAtual()`. Componentes em `components/financeiro/`, utilitários em `lib/financeiro.ts`.
- Tabelas: `categorias_financeiras` (por empresa, nome único por tipo, só desativa — nunca apaga; `cor` + `icone` = identificador de lista fixa validada por `icones_categoria_permitidos()` (migration 000025) e espelhada em `components/financeiro/IconeCategoria.tsx`; padrão `tag`; nunca SVG/HTML do usuário), `lancamentos_financeiros` (receita|despesa, `valor numeric(14,2)`, status pendente|pago|cancelado, **vencido é calculado** na visão `lancamentos_financeiros_situacao`, exclusão lógica `excluido_em`), `anexos_financeiros`, `historico_lancamentos_financeiros` (gatilho). Bucket **privado** `comprovantes-financeiros` (`<id_empresa>/<id_lancamento>/<arquivo>`, PDF/JPG/PNG/WebP até 10 MB).
- **Escrita só por funções** (`salvar_lancamento_financeiro`, `registrar_baixa_lancamento` — atômica, impede baixa dupla —, `estornar_baixa_lancamento`, `cancelar_lancamento_financeiro`, `excluir_lancamento_financeiro`, `salvar_categoria_financeira`, `definir_categoria_financeira_ativa`, `inicializar_categorias_financeiras` (idempotente), `registrar_anexo_financeiro`, `remover_anexo_financeiro`). Leitura por RLS.
- **Indicadores só em `resumo_financeiro(p_id_empresa, p_mes)`** (regra única): receitas/despesas = PAGOS pela data de pagamento; saldo = acumulado pago até o fim do período (não é saldo bancário); contas a vencer = despesas pendentes de hoje a +30 dias. Datas civis de Brasília (`hoje_brasil()`). Navegador nunca soma valores nem usa float como verdade.
- **Autorização**: `pode_ver_financeiro`, `pode_gerenciar_financeiro`, `pode_ver_comprovantes_financeiros`, `pode_exportar_financeiro` = dono/sócio (`e_gestor_empresa`) OU contador com vínculo ativo e permissão explícita (`ver_financeiro`, `gerenciar_financeiro`, `ver_comprovantes_financeiros`, `exportar_financeiro`). **Nenhuma permissão financeira é concedida automaticamente** (padrão do vínculo principal corrigido na migration 000022). Admin da plataforma não lê dados financeiros.
- **Contas e bancos** (migration 000023, aba `#contas`): `contas_financeiras` (banco/caixa/carteira, saldo inicial, uma principal por empresa, arquivar sem apagar, `permite_saldo_negativo` explícito, `cor` do card escolhida pelo usuário — migration 000024, paleta `CORES_CONTA`; **sem credenciais bancárias**), `transferencias_financeiras`, `historico_contas_financeiras` (auditoria) e **`movimentacoes_financeiras` = fonte única dos saldos** (saldo = saldo inicial + entradas − saídas não estornadas; função `saldo_conta_financeira`, visão `contas_financeiras_saldo`). Toda baixa exige conta e gera **uma** movimentação (índice único por lançamento); estorno marca a movimentação como estornada (não apaga). Pagamento parcial **bloqueado** (valor = total). Pago não pode ser excluído nem ter valor/data alterados sem estorno. Transferências atômicas (`realizar_transferencia` / `estornar_transferencia`), travam as duas contas em ordem fixa, não contam como receita/despesa. Concorrência: `travar_conta_para_movimento` (FOR UPDATE) antes de checar saldo. "Saldo financeiro" do resumo = soma das contas até o fim do período. Ver contas = `ver_financeiro`; movimentar/cadastrar = `gerenciar_financeiro`. Teste: `tests/e2e/financeiro-contas.spec.ts`.
- **Parcelamentos** (migration 000027, aba `#parcelamentos`, `components/financeiro/Parcelamentos.tsx` + `FormContrato.tsx`, `lib/parcelamentos.ts`): seção DO Financeiro, não outro sistema. `contratos_parcelados` (tipos compra_parcelada | boleto_parcelado | financiamento | emprestimo; modalidade fixas | personalizadas) + `anexos_contratos` (bucket `comprovantes-financeiros`, pasta `<empresa>/contratos/<id_contrato>/`) + `historico_contratos`. **Cada parcela é um `lancamentos_financeiros` de despesa** (`id_contrato`, `numero_parcela` — 0 = entrada —, `natureza_financeira`, `valor_juros`; índice único contrato+parcela) → aparece em Contas a pagar e é paga pela mesma `registrar_baixa_lancamento` (janela compartilhada `ModalBaixa.tsx`, só pagamento integral); o contrato em si nunca conta como despesa. Criação atômica por `criar_contrato_parcelado` (fixas devem bater com `simular_parcelas_fixas`: divisão determinística, centavos restantes na última, vencimentos mensais; soma entrada+parcelas = total previsto). Gatilho `proteger_parcela_contrato` impede editar valor/vencimento/categoria/vínculo, cancelar ou excluir parcela pelas funções genéricas (só as funções do contrato, via `unnify.operacao_contrato`). Cancelar exige motivo e mantém pagas; excluir só sem pagamentos (lógica). Saldo devedor/situação/indicadores calculados (`contratos_parcelados_resumo`, `resumo_parcelamentos`). **Empréstimo/financiamento** = natureza `financiamento`: fora de `despesas_mes` e de despesas por categoria; aparecem em `pagamentos_financiamentos_mes` e `juros_financiamentos_mes` (juros informados por parcela, sem Price/SAC); o fluxo de caixa mantém todas as saídas. Entrada do dinheiro do empréstimo ainda não é registrada. Testes: `parcelamentos-seguranca.spec.ts` e `parcelamentos.spec.ts`.
- **Gastos fixos** (migration 000028; `components/financeiro/GastosFixos.tsx` + `FormGastoFixo.tsx`, `lib/gastos-fixos.ts`): módulo ÚNICO para empresas (`/app/financeiro#gastos-fixos`) e Admin Master (`/admin/financeiro`, contexto `plataforma`). `gastos_fixos` (contexto empresa|plataforma, id_empresa nulo na plataforma; recorrência mensal|semanal|trimestral|anual; valor fixo|variável; situação ativo|pausado|encerrado; banco vinculado só na empresa = conta sugerida no pagamento), `anexos_gastos_fixos`, `historico_gastos_fixos` (auditoria de criar/editar/pausar/reativar/encerrar/pagamento/estorno/documentos). **Regra única de datas** `datas_gasto_fixo` (dia ajustado ao fim do mês). Ocorrências geradas sob demanda (sem cron) até o fim do mês seguinte por `gerar_ocorrencias_gastos_fixos` (idempotente; quem só vê não gera): **empresa** = lançamento de despesa (`id_gasto_fixo` + `competencia_gasto`, índice único inclusive cancelados → nunca recria; pago pela `registrar_baixa_lancamento`/`ModalBaixa`); **plataforma** = `ocorrencias_gastos_plataforma` (pagar integral/estornar/ajustar/cancelar, FOR UPDATE, **sem conta nem saldo** — não existe financeiro bancário administrativo). Editar só muda ocorrências pendentes futuras (pagas/vencidas intactas; fora da nova agenda → canceladas); pausar cancela as futuras pendentes e reativar reabre as mesmas; encerrar é definitivo. Indicadores `resumo_gastos_fixos` (ocorrências + previsão). Autorização: `pode_ver/gerenciar_gastos_fixos(contexto, empresa)` = financeiro da empresa (dono/contador com permissão) ou `admin_master_ativo()` na plataforma — **Admin Master não lê dados financeiros de empresas**; admin comum não acessa a plataforma. Categorias da plataforma = `categorias_financeiras` com `id_empresa` nulo (`salvar_categoria_plataforma`, `inicializar_categorias_plataforma`); por isso comparações de empresa usam **IS DISTINCT FROM** (corrigido em `validar_lancamento_financeiro` e `criar_contrato_parcelado`). Documentos: `<empresa|plataforma>/gastos-fixos/<id>/`. Componentes compartilhados: `Indicador.tsx`, `GraficoRosca.tsx`, `ModalCategoria` (em `Categorias.tsx`). Testes: `gastos-fixos-seguranca.spec.ts` e `gastos-fixos.spec.ts`.
- Interface financeira do **contador ainda não existe** (autorização pronta e testada). Futuro planejado, não implementado: recorrência, conciliação, DRE, Price/SAC, pagamento parcial e antecipação/renegociação de parcelas.
- Testes: `tests/e2e/financeiro-seguranca.spec.ts` (isolamento, contador, concorrência, cálculos) e `tests/e2e/financeiro.spec.ts` (interface + layout 320–1920).

### Tarefas — regras permanentes

- **Base ÚNICA** (migration 000026) com 3 contextos isolados: `empresa` (empresa comum), `escritorio` (escritório contábil) e `plataforma` (administração do Unnify, `id_empresa` nulo). Mesmo componente `components/tarefas/ModuloTarefas.tsx` em `/app/tarefas`, `/contador/tarefas` e `/admin/tarefas`. Não criar outro sistema de tarefas.
- Acesso: `pode_acessar_contexto_tarefas` — empresa/escritório = membro ativo (`usuarios_empresas`) daquela empresa (tipo coerente com o contexto); plataforma = `is_admin`. **Admin Master NÃO acessa tarefas de empresas/escritórios** (acesso de suporte futuro exige autorização, finalidade e auditoria próprias). Contador vinculado também não vê tarefas da empresa.
- Responsável: `responsavel_tarefa_valido` — membro ativo do mesmo contexto; na plataforma, só admin/admin_master ativos.
- Tabelas: `tarefas`, `categorias_tarefas` (cor + ícone da mesma lista do Financeiro), `checklist_tarefas`, `comentarios_tarefas`, `anexos_tarefas` (bucket privado `anexos-tarefas`, pasta `<id_empresa|plataforma>/<id_tarefa>/`), `historico_tarefas` (gatilho + funções). Escrita só por funções; leitura com nomes via `listar_tarefas`, `resumo_tarefas`, `detalhe_tarefa`, `membros_contexto_tarefas`. "Atrasada" é calculada.
- Admin: páginas que buscam dados devem esperar `useAcessoAdminConfirmado()` (de `GuardaAdmin`), pois o conteúdo fica montado oculto durante a verificação.
- Testes: `tests/e2e/tarefas-seguranca.spec.ts` e `tests/e2e/tarefas.spec.ts`.

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
- Pendente: MFA para administradores; limite de tentativas em armazenamento compartilhado (hoje em memória, aproximado em serverless); gravar trilha na tabela `auditoria`; trocar dados fictícios das páginas Parceiros, Usuários, Assinaturas, Comissões e Auditoria por dados reais; tela "Dados da empresa" (a função `atualizar_dados_empresa` fica pronta com a E0); tela admin para consultar vínculos empresa↔contador (função `admin_vinculos_contabeis` já existe).
