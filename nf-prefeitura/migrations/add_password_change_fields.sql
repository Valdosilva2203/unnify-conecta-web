-- Adicionar campos para confirmação de mudança de senha
ALTER TABLE prefeitura_users
  ADD COLUMN IF NOT EXISTS password_change_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS password_change_token_expires TIMESTAMP,
  ADD COLUMN IF NOT EXISTS password_change_hash VARCHAR(255);

ALTER TABLE funcionarios
  ADD COLUMN IF NOT EXISTS password_change_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS password_change_token_expires TIMESTAMP,
  ADD COLUMN IF NOT EXISTS password_change_hash VARCHAR(255);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_prefeitura_users_password_change_token
  ON prefeitura_users(password_change_token);

CREATE INDEX IF NOT EXISTS idx_funcionarios_password_change_token
  ON funcionarios(password_change_token);
