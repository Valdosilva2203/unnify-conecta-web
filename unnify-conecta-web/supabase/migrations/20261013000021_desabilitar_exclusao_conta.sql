-- Exclusão de conta desabilitada até a definição do processo (decisão do produto em 12/10/2026).
-- A tabela e as funções continuam; só ninguém consegue abrir novas solicitações.
-- Para reativar: GRANT EXECUTE ON FUNCTION public.solicitar_exclusao_conta(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.solicitar_exclusao_conta(text) FROM authenticated;
