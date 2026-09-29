-- Migration: Create notificacoes table for general notifications
-- Separate from chamados (tasks/tickets)

CREATE TABLE IF NOT EXISTS notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo VARCHAR(100) NOT NULL,
  usuario_id UUID NOT NULL,
  prefeitura_id UUID NOT NULL,
  referencia_id UUID,
  mensagem TEXT NOT NULL,
  lida BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario ON notificacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_prefeitura ON notificacoes(prefeitura_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_tipo ON notificacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes(lida);
CREATE INDEX IF NOT EXISTS idx_notificacoes_created_at ON notificacoes(created_at DESC);

-- Enable RLS
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can read their own notifications" ON notificacoes
  FOR SELECT USING (usuario_id = auth.uid());

CREATE POLICY "Anyone can create notifications" ON notificacoes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own notifications" ON notificacoes
  FOR UPDATE USING (usuario_id = auth.uid());
