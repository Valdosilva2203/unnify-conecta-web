-- Reverte "excluir guia de imposto". Registros de histórico "guia_excluida" já gravados são removidos para restaurar a regra antiga.
-- (Guias já excluídas não voltam.) Fazer backup antes.
DROP FUNCTION IF EXISTS public.excluir_guia_imposto(uuid);
DELETE FROM public.historico_impostos WHERE acao = 'guia_excluida';
ALTER TABLE public.historico_impostos DROP CONSTRAINT historico_impostos_acao_check;
ALTER TABLE public.historico_impostos ADD CONSTRAINT historico_impostos_acao_check CHECK (acao IN ('criado', 'editado', 'guia_enviada', 'comprovante_enviado',
  'pagamento_informado', 'pagamento_confirmado', 'cancelado', 'parcelamento_criado', 'parcelamento_cancelado'));
NOTIFY pgrst, 'reload schema';
