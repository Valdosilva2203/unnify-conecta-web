-- Tabela de relacionamento many-to-many: fornecedor pode atender múltiplas prefeituras
CREATE TABLE IF NOT EXISTS fornecedor_prefeituras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id UUID NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
  prefeitura_id UUID NOT NULL REFERENCES prefeituras(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(fornecedor_id, prefeitura_id)
);

CREATE INDEX idx_fornecedor_prefeituras_fornecedor_id ON fornecedor_prefeituras(fornecedor_id);
CREATE INDEX idx_fornecedor_prefeituras_prefeitura_id ON fornecedor_prefeituras(prefeitura_id);
