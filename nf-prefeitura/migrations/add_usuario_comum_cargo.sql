-- Adicionar cargo "Usuário comum" em todas as prefeituras se não existir
INSERT INTO cargos (nome, prefeitura_id, created_at)
SELECT 'Usuário comum', prefeitura_id, NOW()
FROM (
  SELECT DISTINCT prefeitura_id FROM prefeituras
) p
WHERE NOT EXISTS (
  SELECT 1 FROM cargos c
  WHERE c.nome = 'Usuário comum'
  AND c.prefeitura_id = p.prefeitura_id
)
ON CONFLICT DO NOTHING;
