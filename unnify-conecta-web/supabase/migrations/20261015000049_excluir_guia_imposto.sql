-- Excluir guia de imposto (migration 045): remove o REGISTRO da guia e devolve o caminho para o cliente apagar o arquivo do bucket
-- privado (a política de Storage da 045 só permite apagar arquivo NÃO registrado, então a ordem é: registro → arquivo).
-- Só guias (comprovantes não); só por quem gerencia os impostos da empresa (dono/sócio ou contador com "gerenciar_impostos");
-- não em imposto cancelado nem já pago (a guia fica como prova do pagamento). Tudo registrado no histórico ("guia_excluida").
-- Nada é apagado de outras tabelas. Reversão: rollback/20261015000049_excluir_guia_imposto_reverter.sql

DO $$
DECLARE v_nome text;
BEGIN
  SELECT conname INTO v_nome FROM pg_constraint
   WHERE conrelid = 'public.historico_impostos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%guia_enviada%';
  IF v_nome IS NULL THEN RAISE EXCEPTION 'Constraint de ações do histórico de impostos não encontrada.'; END IF;
  EXECUTE format('ALTER TABLE public.historico_impostos DROP CONSTRAINT %I', v_nome);
END $$;
ALTER TABLE public.historico_impostos ADD CONSTRAINT historico_impostos_acao_check CHECK (acao IN ('criado', 'editado', 'guia_enviada', 'guia_excluida', 'comprovante_enviado',
  'pagamento_informado', 'pagamento_confirmado', 'cancelado', 'parcelamento_criado', 'parcelamento_cancelado'));

CREATE OR REPLACE FUNCTION public.excluir_guia_imposto(p_id_arquivo uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.arquivos_impostos;
  i public.impostos;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.arquivos_impostos WHERE id = p_id_arquivo AND tipo = 'guia' FOR UPDATE;
  IF a.id IS NULL OR NOT public.pode_gerenciar_impostos(a.id_empresa) THEN RAISE EXCEPTION 'Guia não encontrada.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO i FROM public.impostos WHERE id = a.id_imposto FOR UPDATE;
  IF i.status = 'cancelado' THEN RAISE EXCEPTION 'Imposto cancelado: a guia não pode ser excluída.' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.lancamentos_financeiros l WHERE l.id_imposto = i.id AND l.status = 'pago') THEN
    RAISE EXCEPTION 'Imposto já pago: a guia fica guardada como prova do pagamento.' USING ERRCODE = 'check_violation';
  END IF;
  DELETE FROM public.arquivos_impostos WHERE id = a.id;
  INSERT INTO public.historico_impostos (id_empresa, id_imposto, acao, dados, id_usuario)
  VALUES (a.id_empresa, a.id_imposto, 'guia_excluida', jsonb_build_object('arquivo', a.nome_arquivo), auth.uid());
  RETURN a.caminho;
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_guia_imposto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_guia_imposto(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
