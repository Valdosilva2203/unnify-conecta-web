-- Add usuario_nome and usuario_id columns to justificativas_chamados table
ALTER TABLE justificativas_chamados
ADD COLUMN IF NOT EXISTS usuario_nome VARCHAR(255);

ALTER TABLE justificativas_chamados
ADD COLUMN IF NOT EXISTS usuario_id UUID;

-- Create index for usuario_nome
CREATE INDEX IF NOT EXISTS idx_justificativas_usuario_nome ON justificativas_chamados(usuario_nome);
