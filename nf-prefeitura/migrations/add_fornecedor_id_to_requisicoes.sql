-- Adicionar campo fornecedor_id à tabela requisicoes
ALTER TABLE requisicoes ADD COLUMN IF NOT EXISTS fornecedor_id UUID REFERENCES fornecedores(id) ON DELETE SET NULL;

-- Criar índice para melhorar performance de queries
CREATE INDEX IF NOT EXISTS idx_requisicoes_fornecedor_id ON requisicoes(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_requisicoes_fornecedor_prefeitura ON requisicoes(fornecedor_id, prefeitura_id);
