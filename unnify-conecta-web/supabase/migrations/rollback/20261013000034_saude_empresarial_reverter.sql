-- Reverte a E5 (Saúde Empresarial). Só remove a função de leitura; nenhum dado é tocado.
DROP FUNCTION IF EXISTS public.saude_empresarial(uuid, integer);
