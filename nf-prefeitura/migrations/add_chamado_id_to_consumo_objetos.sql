ALTER TABLE consumo_objetos
ADD COLUMN chamado_id UUID REFERENCES chamados(id) ON DELETE CASCADE;

CREATE INDEX idx_consumo_objetos_chamado_id ON consumo_objetos(chamado_id);
