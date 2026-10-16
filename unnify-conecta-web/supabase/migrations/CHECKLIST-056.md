# Checklist — migration 000056 (Portal do Colaborador + Controle de Ponto)

DEV e PROD usam o MESMO Supabase. Só executar com autorização explícita do responsável.

## Antes
- [ ] Autorização registrada (quem, quando).
- [ ] Código do portal ainda NÃO publicado (as telas dependem da 056; publicar depois da migration).
- [ ] Backup completo: `pg_dump -Fc --no-owner` → `Backups-Unnify/unnify-<UTC>-antes-056.dump` + `.sha256`; conferir com `pg_restore -l | grep -c "TABLE DATA"`.
- [ ] `node scripts/migrations/implantar-056.mjs simular` (BEGIN → migration → 10 verificações → ROLLBACK) com tudo ✅.

## Aplicação
- [ ] `node scripts/migrations/implantar-056.mjs aplicar --autorizado` (transação única; só faz COMMIT se as verificações passarem; envia `NOTIFY pgrst`).
- [ ] Nunca usar `supabase db push`.

## Depois (somente leitura)
- [ ] `node scripts/migrations/implantar-056.mjs verificar` → tudo ✅.
- [ ] API com chave anônima: `rpc/registrar_marcacao_ponto`, `rpc/painel_ponto`, `rpc/criar_convite_colaborador` e a tabela `marcacoes_ponto` devolvem 401; `rpc/dados_convite_colaborador` com token inexistente devolve `situacao = invalido`.
- [ ] Publicar o código e, com uma conta de teste autorizada, fazer um convite → ativação → marcação → apuração → conferência → envio à folha.

## Configuração externa (não vem na migration)
- Exclusão automática de fotos: DESLIGADA. Só ligar após validação jurídica: política na tela (prazo + fundamento) **e** `PONTO_EXPURGO_FOTOS=ativo` + agendamento de `GET /api/ponto/expurgo-fotos` com `CRON_SECRET`.
- E-mails reais (convite/recuperação) dependem do Resend em produção; validados só com provedor simulado.

## Recuperação
- Falha durante a aplicação: a transação é desfeita sozinha (testado: `simular-falha`).
- Logo após aplicar, SEM dados reais criados: `supabase/migrations/rollback/20261016000056_portal_colaborador_reverter.sql` (o bucket `ponto` fica; remover pela API de Storage se vazio).
- Depois que houver convites, acessos, marcações ou fotos reais: NÃO usar o rollback (apaga registros de jornada). Corrigir com nova migration ou restaurar a partir do backup, avaliando a perda dos dados posteriores.
- A 056 é idempotente: reaplicar sobre ela mesma não duplica nada.
