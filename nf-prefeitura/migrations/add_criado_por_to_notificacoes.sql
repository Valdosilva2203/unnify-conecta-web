-- Adicionar coluna criado_por se não existir
ALTER TABLE notificacoes
ADD COLUMN IF NOT EXISTS criado_por UUID NOT NULL DEFAULT gen_random_uuid();

-- Adicionar coluna atribuido_por se não existir
ALTER TABLE notificacoes
ADD COLUMN IF NOT EXISTS atribuido_por UUID;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_notificacoes_criado_por ON notificacoes(criado_por);
