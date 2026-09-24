-- Criar tabela de notificações/solicitações de serviço
CREATE TABLE IF NOT EXISTS notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prefeitura_id UUID NOT NULL REFERENCES prefeituras(id) ON DELETE CASCADE,
  fornecedor_id UUID REFERENCES fornecedores(id) ON DELETE SET NULL,
  tecnico_id UUID REFERENCES tecnicos_fornecedores(id) ON DELETE SET NULL,

  titulo VARCHAR NOT NULL,
  descricao TEXT,
  prioridade VARCHAR DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'urgente')),

  status VARCHAR DEFAULT 'pendente' CHECK (status IN ('pendente', 'atribuida', 'em_andamento', 'finalizada', 'cancelada')),

  data_criacao TIMESTAMP DEFAULT NOW(),
  data_atribuicao TIMESTAMP,
  data_inicio TIMESTAMP,
  data_finalizacao TIMESTAMP,

  criado_por UUID NOT NULL,
  atribuido_por UUID,

  observacoes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela de técnicos dos fornecedores
CREATE TABLE IF NOT EXISTS tecnicos_fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id UUID NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,

  nome VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  telefone VARCHAR,

  senha_hash VARCHAR NOT NULL,

  status VARCHAR DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),

  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(fornecedor_id, email)
);

-- Criar índices para melhor performance
CREATE INDEX idx_notificacoes_prefeitura ON notificacoes(prefeitura_id);
CREATE INDEX idx_notificacoes_fornecedor ON notificacoes(fornecedor_id);
CREATE INDEX idx_notificacoes_tecnico ON notificacoes(tecnico_id);
CREATE INDEX idx_notificacoes_status ON notificacoes(status);
CREATE INDEX idx_notificacoes_prioridade ON notificacoes(prioridade);
CREATE INDEX idx_notificacoes_data_criacao ON notificacoes(data_criacao DESC);

CREATE INDEX idx_tecnicos_fornecedor ON tecnicos_fornecedores(fornecedor_id);
CREATE INDEX idx_tecnicos_email ON tecnicos_fornecedores(email);
CREATE INDEX idx_tecnicos_status ON tecnicos_fornecedores(status);

-- Habilitar RLS
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnicos_fornecedores ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para notificacoes
CREATE POLICY "Prefeituras podem ver suas notificações" ON notificacoes
  FOR SELECT USING (prefeitura_id IN (
    SELECT id FROM prefeituras WHERE id = current_setting('app.prefeitura_id')::uuid
  ));

CREATE POLICY "Fornecedores podem ver notificações atribuídas" ON notificacoes
  FOR SELECT USING (fornecedor_id IN (
    SELECT id FROM fornecedores WHERE id = current_setting('app.fornecedor_id')::uuid
  ));

CREATE POLICY "Técnicos podem ver suas notificações" ON notificacoes
  FOR SELECT USING (tecnico_id = current_setting('app.tecnico_id')::uuid);

CREATE POLICY "Prefeituras podem criar notificações" ON notificacoes
  FOR INSERT WITH CHECK (
    prefeitura_id = current_setting('app.prefeitura_id')::uuid
  );

CREATE POLICY "Prefeituras podem atualizar notificações" ON notificacoes
  FOR UPDATE USING (
    prefeitura_id = current_setting('app.prefeitura_id')::uuid
  );

CREATE POLICY "Fornecedores podem atualizar notificações (atribuição)" ON notificacoes
  FOR UPDATE USING (
    fornecedor_id = current_setting('app.fornecedor_id')::uuid
  );

CREATE POLICY "Técnicos podem atualizar status de notificações" ON notificacoes
  FOR UPDATE USING (
    tecnico_id = current_setting('app.tecnico_id')::uuid
  );

-- Políticas RLS para tecnicos_fornecedores
CREATE POLICY "Fornecedores podem ver seus técnicos" ON tecnicos_fornecedores
  FOR SELECT USING (
    fornecedor_id = current_setting('app.fornecedor_id')::uuid
  );

CREATE POLICY "Fornecedores podem criar técnicos" ON tecnicos_fornecedores
  FOR INSERT WITH CHECK (
    fornecedor_id = current_setting('app.fornecedor_id')::uuid
  );

CREATE POLICY "Fornecedores podem atualizar seus técnicos" ON tecnicos_fornecedores
  FOR UPDATE USING (
    fornecedor_id = current_setting('app.fornecedor_id')::uuid
  );

CREATE POLICY "Técnicos podem ver suas informações" ON tecnicos_fornecedores
  FOR SELECT USING (
    id = current_setting('app.tecnico_id')::uuid
  );
