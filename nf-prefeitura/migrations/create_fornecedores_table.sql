-- Criar tabela de fornecedores
CREATE TABLE IF NOT EXISTS fornecedores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prefeitura_id UUID NOT NULL REFERENCES prefeituras(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  cnpj_cpf VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  telefone VARCHAR(20),
  endereco TEXT,
  cidade VARCHAR(100),
  estado VARCHAR(2),
  tipo VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(prefeitura_id, cnpj_cpf)
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_fornecedores_prefeitura_id ON fornecedores(prefeitura_id);
CREATE INDEX IF NOT EXISTS idx_fornecedores_nome ON fornecedores(nome);
CREATE INDEX IF NOT EXISTS idx_fornecedores_cnpj_cpf ON fornecedores(cnpj_cpf);

-- Ativar RLS (Row Level Security)
ALTER TABLE fornecedores ENABLE ROW LEVEL SECURITY;

-- Política: Usuários podem ver fornecedores da sua prefeitura
CREATE POLICY "Users can view fornecedores of their prefeitura" ON fornecedores
  FOR SELECT USING (
    prefeitura_id = (
      SELECT id FROM prefeituras WHERE id = (
        SELECT prefeitura_id FROM funcionarios WHERE email = auth.jwt() ->> 'email' LIMIT 1
      )
    )
  );

-- Política: Admins podem fazer tudo
CREATE POLICY "Admins can manage fornecedores" ON fornecedores
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
