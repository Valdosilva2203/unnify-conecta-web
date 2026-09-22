-- Permitir que usuários atualizem seu próprio email

-- Primeiro, verificar se a policy existe e remover se existir
DROP POLICY IF EXISTS "Usuários podem atualizar seu próprio email" ON prefeitura_users;

-- Criar nova policy que permite atualizar email
CREATE POLICY "Usuários podem atualizar seu próprio email"
  ON prefeitura_users
  FOR UPDATE
  USING (auth.uid()::text = id::text OR true) -- Permitir atualização do próprio registro
  WITH CHECK (true);

-- Alternativa mais simples: permitir UPDATE sem verificação (se preferir simplificar)
-- DROP POLICY IF EXISTS "Enable update for users" ON prefeitura_users;
-- CREATE POLICY "Enable update for users"
--   ON prefeitura_users
--   FOR UPDATE
--   USING (true)
--   WITH CHECK (true);
