-- Contas e bancos: cor do card escolhida pelo usuário (só aparência; não afeta cálculos).

ALTER TABLE public.contas_financeiras ADD COLUMN cor text NOT NULL DEFAULT '#ea580c';
ALTER TABLE public.contas_financeiras ADD CONSTRAINT contas_financeiras_cor CHECK (cor ~ '^#[0-9a-fA-F]{6}$');

CREATE OR REPLACE VIEW public.contas_financeiras_saldo WITH (security_invoker = true) AS
SELECT c.id, c.id_empresa, c.nome, c.instituicao, c.tipo, c.saldo_inicial, c.data_saldo_inicial, c.principal,
       c.permite_saldo_negativo, c.arquivada_em, c.criado_em, public.saldo_conta_financeira(c.id) AS saldo, c.cor
  FROM public.contas_financeiras c;

-- Mesma função, com a cor como parâmetro opcional (chamadas antigas continuam válidas)
DROP FUNCTION public.salvar_conta_financeira(uuid, uuid, text, text, text, numeric, date, boolean);
CREATE FUNCTION public.salvar_conta_financeira(
  p_id uuid, p_id_empresa uuid, p_nome text, p_instituicao text, p_tipo text, p_saldo_inicial numeric,
  p_data_saldo_inicial date, p_permite_saldo_negativo boolean, p_cor text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa uuid;
  v_id uuid;
  v_primeira boolean;
BEGIN
  IF p_saldo_inicial IS NULL OR p_saldo_inicial <> round(p_saldo_inicial, 2) THEN
    RAISE EXCEPTION 'Saldo inicial inválido (até 2 casas decimais).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_cor IS NOT NULL AND p_cor !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'Cor inválida.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_id IS NULL THEN
    IF NOT public.pode_gerenciar_financeiro(p_id_empresa) THEN
      RAISE EXCEPTION 'Sem permissão para gerenciar contas desta empresa.' USING ERRCODE = '42501';
    END IF;
    v_primeira := NOT EXISTS (SELECT 1 FROM public.contas_financeiras WHERE id_empresa = p_id_empresa AND arquivada_em IS NULL);
    INSERT INTO public.contas_financeiras (id_empresa, nome, instituicao, tipo, saldo_inicial, data_saldo_inicial, principal,
                                           permite_saldo_negativo, cor, criado_por, atualizado_por)
    VALUES (p_id_empresa, btrim(p_nome), nullif(btrim(coalesce(p_instituicao, '')), ''), p_tipo, p_saldo_inicial,
            coalesce(p_data_saldo_inicial, public.hoje_brasil()), v_primeira, coalesce(p_permite_saldo_negativo, false),
            coalesce(p_cor, '#ea580c'), auth.uid(), auth.uid())
    RETURNING id, id_empresa INTO v_id, v_empresa;
    INSERT INTO public.historico_contas_financeiras (id_empresa, id_conta, acao, dados, id_usuario)
    VALUES (v_empresa, v_id, 'conta_criada', jsonb_build_object('nome', p_nome, 'saldo_inicial', p_saldo_inicial), auth.uid());
  ELSE
    SELECT id_empresa INTO v_empresa FROM public.contas_financeiras WHERE id = p_id FOR UPDATE;
    IF v_empresa IS NULL OR NOT public.pode_gerenciar_financeiro(v_empresa) THEN
      RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.contas_financeiras
       SET nome = btrim(p_nome), instituicao = nullif(btrim(coalesce(p_instituicao, '')), ''), tipo = p_tipo,
           saldo_inicial = p_saldo_inicial, data_saldo_inicial = coalesce(p_data_saldo_inicial, data_saldo_inicial),
           permite_saldo_negativo = coalesce(p_permite_saldo_negativo, false), cor = coalesce(p_cor, cor),
           atualizado_por = auth.uid(), atualizado_em = now()
     WHERE id = p_id RETURNING id INTO v_id;
    INSERT INTO public.historico_contas_financeiras (id_empresa, id_conta, acao, dados, id_usuario)
    VALUES (v_empresa, v_id, 'conta_editada', jsonb_build_object('nome', p_nome, 'saldo_inicial', p_saldo_inicial), auth.uid());
  END IF;
  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'Já existe uma conta com este nome.' USING ERRCODE = 'unique_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_conta_financeira(uuid, uuid, text, text, text, numeric, date, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_conta_financeira(uuid, uuid, text, text, text, numeric, date, boolean, text) TO authenticated;
