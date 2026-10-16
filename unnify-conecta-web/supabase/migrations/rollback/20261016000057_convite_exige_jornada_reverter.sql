-- Reverte a 057: volta criar_convite_colaborador da 056 (sem exigir jornada).
CREATE OR REPLACE FUNCTION public.criar_convite_colaborador(p_id_funcionario uuid, p_email text, p_hash text,
  OUT id uuid, OUT nome text, OUT empresa text, OUT email text, OUT expira_em timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE f public.funcionarios; v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  f := public.exigir_rh_funcionario(p_id_funcionario);
  IF f.status <> 'ativo' THEN RAISE EXCEPTION 'Funcionário desligado não pode receber convite.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(v_email) > 254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Informe um e-mail válido.' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(p_hash, '') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Convite inválido.' USING ERRCODE = 'check_violation'; END IF;
  PERFORM 1 FROM public.funcionarios WHERE funcionarios.id = f.id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.acessos_colaborador a WHERE a.id_funcionario = f.id AND a.revogado_em IS NULL) THEN
    RAISE EXCEPTION 'Este colaborador já tem acesso ativo ao portal.' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM public.convites_colaborador c WHERE c.id_funcionario = f.id AND c.criado_em > now() - interval '1 day') >= 5 THEN
    RAISE EXCEPTION 'Limite de convites para este colaborador atingido hoje. Tente amanhã.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.convites_colaborador c SET revogado_em = now(), revogado_por = auth.uid()
   WHERE c.id_funcionario = f.id AND c.usado_em IS NULL AND c.revogado_em IS NULL;
  UPDATE public.funcionarios SET email = v_email, atualizado_por = auth.uid(), atualizado_em = now() WHERE funcionarios.id = f.id AND funcionarios.email IS DISTINCT FROM v_email;
  INSERT INTO public.convites_colaborador (id_empresa, id_funcionario, email, hash_token, expira_em, criado_por)
  VALUES (f.id_empresa, f.id, v_email, p_hash, now() + interval '7 days', auth.uid())
  RETURNING convites_colaborador.id, convites_colaborador.expira_em INTO id, expira_em;
  nome := f.nome; email := v_email;
  SELECT coalesce(e.nome_comercial, e.razao_social) INTO empresa FROM public.empresas e WHERE e.id = f.id_empresa;
  PERFORM public.registrar_historico_ponto(f.id_empresa, f.id, 'convite_criado', 'Convite para o portal criado', jsonb_build_object('email', v_email));
END;
$$;

NOTIFY pgrst, 'reload schema';
