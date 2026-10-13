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
- Pendente: MFA para administradores; limite de tentativas em armazenamento compartilhado (hoje em memória, aproximado em serverless); gravar trilha na tabela `auditoria`; trocar dados fictícios das páginas Parceiros, Usuários, Assinaturas, Comissões e Auditoria por dados reais; páginas "Minha conta/Dados da empresa/Configurações" do usuário empresa; tela admin para consultar vínculos empresa↔contador (função `admin_vinculos_contabeis` já existe).
