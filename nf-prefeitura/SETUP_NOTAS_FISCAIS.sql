-- ========================================
-- CRIAÇÃO DE TABELAS PARA NOTAS FISCAIS
-- ========================================
-- Execute este SQL no Supabase SQL Editor
-- (https://supabase.com/dashboard/project/YOUR_PROJECT/sql)

-- Tabela de notas fiscais
CREATE TABLE IF NOT EXISTS notas_fiscais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisicao_id UUID NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL DEFAULT 'Minhas certidões',
  arquivo VARCHAR(500) NOT NULL,
  url_assinada TEXT,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  criado_por UUID NOT NULL,
  UNIQUE(requisicao_id)
);

-- Tabela intermediária de permissões (muitos-para-muitos)
CREATE TABLE IF NOT EXISTS notas_fiscais_secretarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_fiscal_id UUID NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
  secretaria_id UUID NOT NULL REFERENCES secretarias(id) ON DELETE CASCADE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(nota_fiscal_id, secretaria_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_requisicao ON notas_fiscais(requisicao_id);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_secretarias_nota ON notas_fiscais_secretarias(nota_fiscal_id);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_secretarias_secretaria ON notas_fiscais_secretarias(secretaria_id);

-- ========================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ========================================

ALTER TABLE notas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_fiscais_secretarias ENABLE ROW LEVEL SECURITY;

-- Criar policies para notas_fiscais
CREATE POLICY "Usuarios da secretaria podem ver notas" ON notas_fiscais
  FOR SELECT USING (
    criado_por = auth.uid() OR
    EXISTS (
      SELECT 1 FROM notas_fiscais_secretarias nfs
      JOIN usuarios_secretarias us ON nfs.secretaria_id = us.secretaria_id
      WHERE nfs.nota_fiscal_id = notas_fiscais.id
      AND us.usuario_id = auth.uid()
    )
  );

-- ========================================
-- ✅ PRONTO!
-- ========================================
-- Agora o sistema de notas fiscais com
-- permissões por secretaria está pronto!
