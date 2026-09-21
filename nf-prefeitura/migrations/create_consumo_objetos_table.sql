CREATE TABLE IF NOT EXISTS consumo_objetos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objeto_id UUID NOT NULL REFERENCES objetos_contratos(id) ON DELETE CASCADE,
  quantidade_usada DECIMAL(10, 2) NOT NULL,
  requisicao_id UUID REFERENCES requisicoes(id) ON DELETE SET NULL,
  tipo VARCHAR(50) DEFAULT 'requisicao',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_consumo_objeto_id ON consumo_objetos(objeto_id);
CREATE INDEX idx_consumo_requisicao_id ON consumo_objetos(requisicao_id);
