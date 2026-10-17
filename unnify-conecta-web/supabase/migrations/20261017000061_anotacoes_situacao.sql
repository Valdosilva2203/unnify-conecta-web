-- 061: anotações ganham situação (pendente → em andamento → concluída | cancelada; reabrir) e arquivamento, como em Tarefas.
-- Mesmas permissões da 051 (pode_editar_anotacao: autor; nas da empresa também dono/sócio; "pessoal" só o autor).
-- Arquivada não é editada (desarquive antes). Anotações existentes ficam "pendente" e não arquivadas.
-- Reversão: rollback/20261017000061_anotacoes_situacao_reverter.sql
ALTER TABLE public.anotacoes ADD COLUMN IF NOT EXISTS situacao text NOT NULL DEFAULT 'pendente';
ALTER TABLE public.anotacoes ADD COLUMN IF NOT EXISTS arquivada_em timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'anotacoes_situacao') THEN
    ALTER TABLE public.anotacoes ADD CONSTRAINT anotacoes_situacao CHECK (situacao IN ('pendente', 'em_andamento', 'concluida', 'cancelada'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.alterar_situacao_anotacao(p_id uuid, p_situacao text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.anotacoes;
BEGIN
  SELECT * INTO a FROM public.anotacoes WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF a.id IS NULL OR NOT public.pode_editar_anotacao(a.id_empresa, a.categoria, a.criado_por) THEN RAISE EXCEPTION 'Anotação não encontrada.' USING ERRCODE = '42501'; END IF;
  IF p_situacao IS NULL OR p_situacao NOT IN ('pendente', 'em_andamento', 'concluida', 'cancelada') THEN RAISE EXCEPTION 'Situação inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF a.arquivada_em IS NOT NULL THEN RAISE EXCEPTION 'Anotação arquivada: desarquive antes de alterá-la.' USING ERRCODE = 'check_violation'; END IF;
  IF p_situacao = 'em_andamento' AND a.situacao <> 'pendente' THEN RAISE EXCEPTION 'Só é possível iniciar uma anotação pendente.' USING ERRCODE = 'check_violation'; END IF;
  IF p_situacao IN ('concluida', 'cancelada') AND a.situacao NOT IN ('pendente', 'em_andamento') THEN RAISE EXCEPTION 'Esta anotação já foi encerrada: reabra antes.' USING ERRCODE = 'check_violation'; END IF;
  IF p_situacao = a.situacao THEN RETURN; END IF;
  UPDATE public.anotacoes SET situacao = p_situacao, atualizado_por = auth.uid(), atualizado_em = now() WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.arquivar_anotacao(p_id uuid, p_arquivar boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.anotacoes;
BEGIN
  SELECT * INTO a FROM public.anotacoes WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF a.id IS NULL OR NOT public.pode_editar_anotacao(a.id_empresa, a.categoria, a.criado_por) THEN RAISE EXCEPTION 'Anotação não encontrada.' USING ERRCODE = '42501'; END IF;
  PERFORM set_config('unnify.arquivando_anotacao', 'sim', true);
  UPDATE public.anotacoes SET arquivada_em = CASE WHEN coalesce(p_arquivar, false) THEN coalesce(arquivada_em, now()) END,
         fixada = CASE WHEN coalesce(p_arquivar, false) THEN false ELSE fixada END
   WHERE id = p_id;
  PERFORM set_config('unnify.arquivando_anotacao', '', true);
END;
$$;

-- Arquivada fica como está: nenhuma função antiga (salvar, fixar) altera o conteúdo sem desarquivar
CREATE OR REPLACE FUNCTION public.proteger_anotacao_arquivada()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.arquivada_em IS NULL OR current_setting('unnify.arquivando_anotacao', true) = 'sim' THEN RETURN NEW; END IF;
  IF NEW.excluido_em IS NOT NULL AND OLD.excluido_em IS NULL THEN RETURN NEW; END IF; -- excluir continua permitido
  RAISE EXCEPTION 'Anotação arquivada: desarquive antes de alterá-la.' USING ERRCODE = 'P0001'; -- não é engolido pelo tratamento de check_violation do salvar
END;
$$;
DROP TRIGGER IF EXISTS proteger_anotacao_arquivada ON public.anotacoes;
CREATE TRIGGER proteger_anotacao_arquivada BEFORE UPDATE ON public.anotacoes FOR EACH ROW EXECUTE FUNCTION public.proteger_anotacao_arquivada();

REVOKE ALL ON FUNCTION public.alterar_situacao_anotacao(uuid, text), public.arquivar_anotacao(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alterar_situacao_anotacao(uuid, text), public.arquivar_anotacao(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.proteger_anotacao_arquivada() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
