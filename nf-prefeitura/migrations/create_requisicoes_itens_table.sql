-- Criar tabela de itens de requisição
CREATE TABLE IF NOT EXISTS requisicoes_itens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requisicao_id UUID NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
  objeto_contrato_id UUID NOT NULL,
  quantidade INT NOT NULL,
  valor_unitario DECIMAL(10, 2) NOT NULL,
  valor_total DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_requisicoes_itens_requisicao_id ON requisicoes_itens(requisicao_id);
CREATE INDEX IF NOT EXISTS idx_requisicoes_itens_objeto_id ON requisicoes_itens(objeto_contrato_id);

-- Ativar RLS
ALTER TABLE requisicoes_itens ENABLE ROW LEVEL SECURITY;

-- Política: Permitir INSERT e SELECT
CREATE POLICY "Requisicoes itens access" ON requisicoes_itens
  FOR ALL
  USING (true)
  WITH CHECK (true);
