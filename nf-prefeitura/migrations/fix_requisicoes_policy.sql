-- Remover políticas antigas
DROP POLICY IF EXISTS "Users can create requisicoes in their secretaria" ON requisicoes;
DROP POLICY IF EXISTS "Users can update their requisicoes" ON requisicoes;

-- Nova política: Permitir INSERT para qualquer usuário autenticado
CREATE POLICY "Anyone can create requisicoes" ON requisicoes
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Política: Permitir SELECT de requisições da sua secretaria
CREATE POLICY "Users can view requisicoes of their secretaria" ON requisicoes
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      secretaria_id IN (
        SELECT secretaria_id FROM funcionarios WHERE id = auth.uid() LIMIT 1
      ) OR
      prefeitura_id IN (
        SELECT prefeitura_id FROM admin_users WHERE id = auth.uid() LIMIT 1
      )
    )
  );

-- Política: Manter a política de admin
CREATE POLICY "Admins can manage requisicoes" ON requisicoes
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');
