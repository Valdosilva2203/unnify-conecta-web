-- Criar tabela de justificativas dos chamados
CREATE TABLE IF NOT EXISTS justificativas_chamados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado_id UUID NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar índice
CREATE INDEX IF NOT EXISTS idx_justificativas_chamado_id ON justificativas_chamados(chamado_id);

-- Ativar RLS
ALTER TABLE justificativas_chamados ENABLE ROW LEVEL SECURITY;

-- Política de acesso
CREATE POLICY "Justificativas access" ON justificativas_chamados
  FOR ALL
  USING (true)
  WITH CHECK (true);
