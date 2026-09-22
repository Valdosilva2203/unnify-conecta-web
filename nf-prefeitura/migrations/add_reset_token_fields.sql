-- Adicionar campos de reset de senha às tabelas de usuários

-- Adicionar campos à tabela prefeitura_users
ALTER TABLE prefeitura_users
ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;

-- Adicionar campos à tabela funcionarios
ALTER TABLE funcionarios
ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;

-- Criar índices para buscar por token
CREATE INDEX IF NOT EXISTS idx_prefeitura_users_reset_token ON prefeitura_users(reset_token);
CREATE INDEX IF NOT EXISTS idx_funcionarios_reset_token ON funcionarios(reset_token);
