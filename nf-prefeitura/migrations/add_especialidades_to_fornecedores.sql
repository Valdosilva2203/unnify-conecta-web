-- Adicionar coluna especialidades na tabela fornecedores
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS especialidades TEXT[] DEFAULT NULL;
