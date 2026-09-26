-- Migration: Rename notificacoes tables to chamados
-- Description: Renames the notificacoes and justificativas_notificacoes tables to chamados and justificativas_chamados

-- Step 1: Rename notificacoes table to chamados
ALTER TABLE notificacoes RENAME TO chamados;

-- Step 2: Rename all indexes
ALTER INDEX idx_notificacoes_prefeitura RENAME TO idx_chamados_prefeitura;
ALTER INDEX idx_notificacoes_fornecedor RENAME TO idx_chamados_fornecedor;
ALTER INDEX idx_notificacoes_tecnico RENAME TO idx_chamados_tecnico;
ALTER INDEX idx_notificacoes_status RENAME TO idx_chamados_status;
ALTER INDEX idx_notificacoes_prioridade RENAME TO idx_chamados_prioridade;
ALTER INDEX idx_notificacoes_data_criacao RENAME TO idx_chamados_data_criacao;
ALTER INDEX idx_notificacoes_criado_por RENAME TO idx_chamados_criado_por;

-- Step 3: Update RLS policies for chamados table
-- Drop old policies
DROP POLICY IF EXISTS "Prefeituras podem ver suas notificações" ON chamados;
DROP POLICY IF EXISTS "Fornecedores podem ver notificações atribuídas" ON chamados;
DROP POLICY IF EXISTS "Técnicos podem ver suas notificações" ON chamados;
DROP POLICY IF EXISTS "Prefeituras podem criar notificações" ON chamados;
DROP POLICY IF EXISTS "Prefeituras podem atualizar notificações" ON chamados;
DROP POLICY IF EXISTS "Fornecedores podem atualizar notificações (atribuição)" ON chamados;
DROP POLICY IF EXISTS "Técnicos podem atualizar status de notificações" ON chamados;

-- Create new policies with updated names
CREATE POLICY "Prefeituras podem ver seus chamados" ON chamados
  FOR SELECT USING (prefeitura_id IN (
    SELECT id FROM prefeituras WHERE id = current_setting('app.prefeitura_id')::uuid
  ));

CREATE POLICY "Fornecedores podem ver chamados atribuídos" ON chamados
  FOR SELECT USING (fornecedor_id IN (
    SELECT id FROM fornecedores WHERE id = current_setting('app.fornecedor_id')::uuid
  ));

CREATE POLICY "Técnicos podem ver seus chamados" ON chamados
  FOR SELECT USING (tecnico_id = current_setting('app.tecnico_id')::uuid);

CREATE POLICY "Prefeituras podem criar chamados" ON chamados
  FOR INSERT WITH CHECK (
    prefeitura_id = current_setting('app.prefeitura_id')::uuid
  );

CREATE POLICY "Prefeituras podem atualizar chamados" ON chamados
  FOR UPDATE USING (
    prefeitura_id = current_setting('app.prefeitura_id')::uuid
  );

CREATE POLICY "Fornecedores podem atualizar chamados (atribuição)" ON chamados
  FOR UPDATE USING (
    fornecedor_id = current_setting('app.fornecedor_id')::uuid
  );

CREATE POLICY "Técnicos podem atualizar status de chamados" ON chamados
  FOR UPDATE USING (
    tecnico_id = current_setting('app.tecnico_id')::uuid
  );

-- Step 4: Create justificativas_chamados table if it doesn't exist
CREATE TABLE IF NOT EXISTS justificativas_chamados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado_id UUID NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  criado_por UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Step 5: Create indexes for justificativas_chamados
CREATE INDEX IF NOT EXISTS idx_justificativas_chamados_chamado ON justificativas_chamados(chamado_id);
CREATE INDEX IF NOT EXISTS idx_justificativas_chamados_created_at ON justificativas_chamados(created_at DESC);

-- Step 6: Enable RLS on justificativas_chamados
ALTER TABLE justificativas_chamados ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS policies for justificativas_chamados
CREATE POLICY "Prefeituras podem ver justificativas de seus chamados" ON justificativas_chamados
  FOR SELECT USING (
    chamado_id IN (
      SELECT id FROM chamados WHERE prefeitura_id = current_setting('app.prefeitura_id')::uuid
    )
  );

CREATE POLICY "Fornecedores podem ver justificativas de seus chamados" ON justificativas_chamados
  FOR SELECT USING (
    chamado_id IN (
      SELECT id FROM chamados WHERE fornecedor_id = current_setting('app.fornecedor_id')::uuid
    )
  );

CREATE POLICY "Qualquer um pode criar justificativas" ON justificativas_chamados
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Qualquer um pode deletar justificativas" ON justificativas_chamados
  FOR DELETE USING (true);

-- Step 8: Drop old justificativas_notificacoes table if it exists
DROP TABLE IF EXISTS justificativas_notificacoes CASCADE;

-- Confirmation comment
-- Migration completed successfully!
-- All references to notificacoes have been renamed to chamados
-- All references to justificativas_notificacoes have been renamed to justificativas_chamados
