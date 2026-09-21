-- Criar tabela de requisições
CREATE TABLE IF NOT EXISTS requisicoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  secretaria_id UUID NOT NULL REFERENCES secretarias(id) ON DELETE CASCADE,
  prefeitura_id UUID NOT NULL REFERENCES prefeituras(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  status VARCHAR(50) DEFAULT 'pendente',
  solicitante_id UUID REFERENCES funcionarios(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_requisicoes_secretaria_id ON requisicoes(secretaria_id);
CREATE INDEX IF NOT EXISTS idx_requisicoes_prefeitura_id ON requisicoes(prefeitura_id);
CREATE INDEX IF NOT EXISTS idx_requisicoes_status ON requisicoes(status);
CREATE INDEX IF NOT EXISTS idx_requisicoes_solicitante_id ON requisicoes(solicitante_id);

-- Ativar RLS (Row Level Security)
ALTER TABLE requisicoes ENABLE ROW LEVEL SECURITY;

-- Política: Usuários podem ver requisições da sua secretaria
CREATE POLICY "Users can view requisicoes of their secretaria" ON requisicoes
  FOR SELECT USING (
    secretaria_id IN (
      SELECT secretaria_id FROM funcionarios WHERE email = auth.jwt() ->> 'email' LIMIT 1
    )
  );

-- Política: Admins podem fazer tudo
CREATE POLICY "Admins can manage requisicoes" ON requisicoes
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
