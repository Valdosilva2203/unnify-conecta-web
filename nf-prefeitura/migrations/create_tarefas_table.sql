-- Criar tabela de tarefas
CREATE TABLE IF NOT EXISTS tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada')),
  prioridade VARCHAR DEFAULT 'normal' CHECK (prioridade IN ('urgente', 'normal', 'baixa')),
  data_vencimento DATE,
  responsavel VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar índices
CREATE INDEX idx_tarefas_status ON tarefas(status);
CREATE INDEX idx_tarefas_prioridade ON tarefas(prioridade);
CREATE INDEX idx_tarefas_created_at ON tarefas(created_at DESC);

-- Habilitar RLS
ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Permitir ler tarefas" ON tarefas
  FOR SELECT USING (true);

CREATE POLICY "Permitir criar tarefas" ON tarefas
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualizar tarefas" ON tarefas
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Permitir deletar tarefas" ON tarefas
  FOR DELETE USING (true);
