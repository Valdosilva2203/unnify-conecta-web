CREATE TABLE IF NOT EXISTS objetos_contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  quantidade DECIMAL(10, 2),
  unidade_medida VARCHAR(50),
  valor_unitario DECIMAL(12, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_objetos_contratos_contrato_id ON objetos_contratos(contrato_id);
