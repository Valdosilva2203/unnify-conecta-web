-- Reverte a edição de contratos. Os registros de histórico "editado" são removidos (a restrição antiga não os aceita);
-- os dados atuais dos contratos e parcelas permanecem como estão.
DROP FUNCTION IF EXISTS public.atualizar_contrato_parcelado(uuid, text, text, uuid, text, uuid);
DELETE FROM public.historico_contratos WHERE acao = 'editado';
ALTER TABLE public.historico_contratos DROP CONSTRAINT historico_contratos_acao;
ALTER TABLE public.historico_contratos ADD CONSTRAINT historico_contratos_acao
  CHECK (acao IN ('criado', 'cancelado', 'excluido', 'anexo_adicionado', 'anexo_removido'));
