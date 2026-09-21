-- Política: Usuários da secretaria podem criar requisições
CREATE POLICY "Users can create requisicoes in their secretaria" ON requisicoes
  FOR INSERT
  WITH CHECK (
    secretaria_id IN (
      SELECT secretaria_id FROM funcionarios WHERE id = auth.uid() LIMIT 1
    )
  );

-- Política: Usuários podem atualizar suas próprias requisições
CREATE POLICY "Users can update their requisicoes" ON requisicoes
  FOR UPDATE
  USING (
    solicitante_id = auth.uid() OR
    secretaria_id IN (
      SELECT secretaria_id FROM funcionarios WHERE id = auth.uid() LIMIT 1
    )
  );
