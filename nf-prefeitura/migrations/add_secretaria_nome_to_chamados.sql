-- Add secretaria_nome column to chamados table
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS secretaria_nome VARCHAR(255);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_chamados_secretaria_nome ON chamados(secretaria_nome);
