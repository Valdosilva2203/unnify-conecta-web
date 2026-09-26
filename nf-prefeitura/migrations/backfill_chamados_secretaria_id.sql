-- Preencher chamados com secretaria_id baseado no criador (funcionário)
UPDATE chamados
SET secretaria_id = (
  SELECT secretaria_id FROM funcionarios
  WHERE funcionarios.id = chamados.criado_por
  LIMIT 1
)
WHERE secretaria_id IS NULL
AND criado_por IN (SELECT id FROM funcionarios);
