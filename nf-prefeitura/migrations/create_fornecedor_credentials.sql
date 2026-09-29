-- Tabela de credenciais de fornecedores (autenticação)
CREATE TABLE IF NOT EXISTS fornecedor_credenciais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id UUID NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  senha_hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ativo', -- ativo, inativo
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de acesso do fornecedor às prefeituras
CREATE TABLE IF NOT EXISTS fornecedor_prefeituras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id UUID NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
  prefeitura_id UUID NOT NULL REFERENCES prefeituras(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'ativo', -- ativo, inativo
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fornecedor_id, prefeitura_id)
);

-- Índices
CREATE INDEX idx_fornecedor_credenciais_email ON fornecedor_credenciais(email);
CREATE INDEX idx_fornecedor_credenciais_fornecedor ON fornecedor_credenciais(fornecedor_id);
CREATE INDEX idx_fornecedor_credenciais_prefeitura ON fornecedor_credenciais(prefeitura_id);

-- RLS
ALTER TABLE fornecedor_credenciais ENABLE ROW LEVEL SECURITY;

-- Política: Fornecedor pode ver apenas suas próprias credenciais
CREATE POLICY "Fornecedores podem acessar suas credenciais"
  ON fornecedor_credenciais
  FOR SELECT
  USING (
    auth.uid()::text = fornecedor_id::text
  );

-- Política: Admin/Prefeito podem ver todas as credenciais da sua prefeitura
CREATE POLICY "Admins podem acessar credenciais da prefeitura"
  ON fornecedor_credenciais
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM prefeitura_users
      WHERE prefeitura_users.id = auth.uid()::uuid
      AND prefeitura_users.prefeitura_id = fornecedor_credenciais.prefeitura_id
      AND prefeitura_users.role IN ('prefeito', 'admin')
    )
  );
