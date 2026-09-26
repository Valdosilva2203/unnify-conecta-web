-- Adicionar coluna secretaria_id na tabela prefeitura_users
ALTER TABLE prefeitura_users ADD COLUMN IF NOT EXISTS secretaria_id UUID REFERENCES secretarias(id) ON DELETE SET NULL;
