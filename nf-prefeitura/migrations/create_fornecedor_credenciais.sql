-- Tabela de credenciais do fornecedor (CNPJ + Senha)
CREATE TABLE IF NOT EXISTS fornecedor_credenciais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id UUID NOT NULL UNIQUE REFERENCES fornecedores(id) ON DELETE CASCADE,
  cnpj TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fornecedor_credenciais_cnpj ON fornecedor_credenciais(cnpj);
CREATE INDEX idx_fornecedor_credenciais_fornecedor_id ON fornecedor_credenciais(fornecedor_id);
