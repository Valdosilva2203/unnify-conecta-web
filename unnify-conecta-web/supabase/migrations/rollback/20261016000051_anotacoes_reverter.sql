-- Reverte Anotações. ATENÇÃO: apaga a tabela e TODAS as anotações (inclusive as excluídas logicamente). Fazer backup antes.
DROP FUNCTION IF EXISTS public.excluir_anotacao(uuid);
DROP FUNCTION IF EXISTS public.alternar_fixacao_anotacao(uuid, boolean);
DROP FUNCTION IF EXISTS public.salvar_anotacao(uuid, uuid, text, text, text, text[]);
DROP TABLE IF EXISTS public.anotacoes;
DROP FUNCTION IF EXISTS public.limpar_tags_anotacao(text[]);
DROP FUNCTION IF EXISTS public.pode_editar_anotacao(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.pode_ver_anotacao(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.e_equipe_anotacoes(uuid);
NOTIFY pgrst, 'reload schema';
