-- Reverte a 061: remove situação e arquivamento das anotações (as anotações em si continuam; perde-se só a situação/arquivamento).
DROP TRIGGER IF EXISTS proteger_anotacao_arquivada ON public.anotacoes;
DROP FUNCTION IF EXISTS public.proteger_anotacao_arquivada(), public.arquivar_anotacao(uuid, boolean), public.alterar_situacao_anotacao(uuid, text);
ALTER TABLE public.anotacoes DROP CONSTRAINT IF EXISTS anotacoes_situacao;
ALTER TABLE public.anotacoes DROP COLUMN IF EXISTS arquivada_em;
ALTER TABLE public.anotacoes DROP COLUMN IF EXISTS situacao;
NOTIFY pgrst, 'reload schema';
