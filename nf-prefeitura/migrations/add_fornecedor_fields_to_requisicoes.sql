-- Adicionar campos de fornecedor na tabela requisicoes
ALTER TABLE requisicoes ADD COLUMN IF NOT EXISTS fornecedor_cnpj VARCHAR(20);
ALTER TABLE requisicoes ADD COLUMN IF NOT EXISTS modalidade VARCHAR(100);
ALTER TABLE requisicoes ADD COLUMN IF NOT EXISTS numero_processo VARCHAR(50);
ALTER TABLE requisicoes ADD COLUMN IF NOT EXISTS origem VARCHAR(100);
ALTER TABLE requisicoes ADD COLUMN IF NOT EXISTS objeto_contratacao TEXT;
