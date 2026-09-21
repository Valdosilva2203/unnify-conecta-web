-- Adicionar campo numero_requisicao à tabela requisicoes
ALTER TABLE requisicoes
ADD COLUMN IF NOT EXISTS numero_requisicao VARCHAR(50) UNIQUE;

-- Criar índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_requisicoes_numero ON requisicoes(numero_requisicao);
