-- Criar tabela de relacionamento entre funcionários e secretarias (muitos-para-muitos)
CREATE TABLE IF NOT EXISTS funcionario_secretarias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  secretaria_id UUID NOT NULL REFERENCES secretarias(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(funcionario_id, secretaria_id)
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_funcionario_secretarias_funcionario_id ON funcionario_secretarias(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_funcionario_secretarias_secretaria_id ON funcionario_secretarias(secretaria_id);

-- Migrar dados da coluna secretaria_id existente (se houver)
INSERT INTO funcionario_secretarias (funcionario_id, secretaria_id)
SELECT id, secretaria_id FROM funcionarios
WHERE secretaria_id IS NOT NULL
ON CONFLICT (funcionario_id, secretaria_id) DO NOTHING;
