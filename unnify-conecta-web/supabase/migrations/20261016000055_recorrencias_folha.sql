-- Lançamentos RECORRENTES de funcionários (adicionais/descontos aplicados todo mês). Reaproveita ajustes_folha (038/054):
-- cada mês gera UM ajuste por recorrência (índice único), sem segundo mecanismo de cálculo.
--   * Geração = sincronização idempotente por folha, chamada por gerar_folha (ao abrir a competência) e após cada ação na recorrência.
--   * Só mexe em competência ABERTA: folha não cancelada, sem pagamento e sem Folha de Pagamento (052) enviada/aprovada.
--     Competências fechadas mantêm o snapshot (valor, percentual, base, versão) — nada muda silenciosamente.
--   * Percentual usa o salário-base gravado na competência; se o salário de um mês aberto mudar, o valor é recalculado.
--   * Exceção "não aplicar nesta competência" (com motivo) impede a recriação naquele mês. Suspensão/encerramento por competência.
--   * Toda alteração gera versão + histórico (quem, quando, motivo, antes/depois). Lançamento manual: não calcula rubricas legais.
-- Reversão: rollback/20261016000055_recorrencias_folha_reverter.sql

CREATE TABLE public.recorrencias_folha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_funcionario uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('adicional', 'desconto')),
  descricao text NOT NULL CHECK (char_length(btrim(descricao)) BETWEEN 2 AND 120),
  modalidade text NOT NULL CHECK (modalidade IN ('fixo', 'percentual')),
  valor numeric(14, 2),
  percentual numeric(9, 4),
  base_calculo text,
  competencia_inicial date NOT NULL CHECK (extract(day FROM competencia_inicial) = 1),
  competencia_final date CHECK (competencia_final IS NULL OR extract(day FROM competencia_final) = 1),
  suspensa_de date CHECK (suspensa_de IS NULL OR extract(day FROM suspensa_de) = 1),
  suspensa_ate date CHECK (suspensa_ate IS NULL OR extract(day FROM suspensa_ate) = 1),
  situacao text NOT NULL DEFAULT 'ativa' CHECK (situacao IN ('ativa', 'suspensa', 'encerrada')),
  observacoes text CHECK (observacoes IS NULL OR char_length(observacoes) <= 500),
  versao integer NOT NULL DEFAULT 1,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recorrencias_forma CHECK (
    (modalidade = 'fixo' AND valor > 0 AND valor <= 9999999.99 AND percentual IS NULL AND base_calculo IS NULL)
    OR (modalidade = 'percentual' AND percentual > 0 AND base_calculo = 'salario_base' AND valor IS NULL)),
  CONSTRAINT recorrencias_vigencia CHECK (competencia_final IS NULL OR competencia_final >= competencia_inicial),
  CONSTRAINT recorrencias_suspensao CHECK ((suspensa_de IS NULL AND suspensa_ate IS NULL) OR (suspensa_de IS NOT NULL AND (suspensa_ate IS NULL OR suspensa_ate >= suspensa_de)))
);
CREATE INDEX idx_recorrencias_funcionario ON public.recorrencias_folha (id_funcionario);

CREATE TABLE public.excecoes_recorrencia_folha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_recorrencia uuid NOT NULL REFERENCES public.recorrencias_folha(id) ON DELETE RESTRICT,
  competencia date NOT NULL CHECK (extract(day FROM competencia) = 1),
  motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 3 AND 500),
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT excecoes_recorrencia_unica UNIQUE (id_recorrencia, competencia)
);

CREATE TABLE public.historico_recorrencias_folha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_recorrencia uuid NOT NULL REFERENCES public.recorrencias_folha(id) ON DELETE RESTRICT,
  acao text NOT NULL CHECK (acao IN ('criada', 'editada', 'suspensa', 'reativada', 'encerrada', 'nao_aplicada')),
  versao integer NOT NULL,
  motivo text,
  antes jsonb,
  depois jsonb,
  id_usuario uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_historico_recorrencias ON public.historico_recorrencias_folha (id_recorrencia, criado_em DESC);

ALTER TABLE public.ajustes_folha ADD COLUMN id_recorrencia uuid REFERENCES public.recorrencias_folha(id) ON DELETE RESTRICT,
  ADD COLUMN versao_recorrencia integer;
CREATE UNIQUE INDEX ajustes_folha_um_por_recorrencia ON public.ajustes_folha (id_recorrencia, id_folha) WHERE id_recorrencia IS NOT NULL AND excluido_em IS NULL;

ALTER TABLE public.recorrencias_folha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excecoes_recorrencia_folha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_recorrencias_folha ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recorrencias_folha, public.excecoes_recorrencia_folha, public.historico_recorrencias_folha FROM anon, authenticated;
GRANT SELECT ON public.recorrencias_folha, public.excecoes_recorrencia_folha, public.historico_recorrencias_folha TO authenticated;
CREATE POLICY "Recorrências: empresa autorizada" ON public.recorrencias_folha FOR SELECT TO authenticated USING (public.pode_ver_folha(id_empresa));
CREATE POLICY "Exceções de recorrência: empresa autorizada" ON public.excecoes_recorrencia_folha FOR SELECT TO authenticated USING (public.pode_ver_folha(id_empresa));
CREATE POLICY "Histórico de recorrências: empresa autorizada" ON public.historico_recorrencias_folha FOR SELECT TO authenticated USING (public.pode_ver_folha(id_empresa));

-- ===== Internas =====
-- Competência aberta para receber/alterar lançamentos automáticos
CREATE OR REPLACE FUNCTION public.folha_aberta_para_recorrencia(f public.folhas_competencia)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.cancelada_em IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.competencias_folha c WHERE c.id_empresa = f.id_empresa AND c.competencia = f.competencia
                      AND c.status NOT IN ('preparacao', 'correcao_solicitada'))
     AND NOT EXISTS (SELECT 1 FROM public.lancamentos_financeiros l WHERE l.id_folha = f.id AND l.status = 'pago' AND l.excluido_em IS NULL);
$$;

CREATE OR REPLACE FUNCTION public.recorrencia_vale_na_competencia(r public.recorrencias_folha, p_competencia date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.competencia_inicial <= p_competencia
     AND (r.competencia_final IS NULL OR p_competencia <= r.competencia_final)
     AND NOT (r.suspensa_de IS NOT NULL AND r.suspensa_de <= p_competencia AND (r.suspensa_ate IS NULL OR p_competencia <= r.suspensa_ate))
     AND NOT EXISTS (SELECT 1 FROM public.excecoes_recorrencia_folha e WHERE e.id_recorrencia = r.id AND e.competencia = p_competencia);
$$;

-- Sincroniza UMA folha com as recorrências do funcionário (idempotente). Competência fechada: não toca em nada.
-- Desconto que deixaria o total negativo não é aplicado (a folha fica como estava, sem erro na abertura da página).
CREATE OR REPLACE FUNCTION public.sincronizar_recorrencias_folha(p_id_folha uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.folhas_competencia; r public.recorrencias_folha; a public.ajustes_folha; v_valor numeric; v_mudou boolean := false;
BEGIN
  SELECT * INTO f FROM public.folhas_competencia WHERE id = p_id_folha FOR UPDATE;
  IF f.id IS NULL OR NOT public.folha_aberta_para_recorrencia(f) THEN RETURN; END IF;
  BEGIN
    FOR r IN SELECT * FROM public.recorrencias_folha WHERE id_funcionario = f.id_funcionario ORDER BY criado_em, id LOOP
      SELECT * INTO a FROM public.ajustes_folha WHERE id_recorrencia = r.id AND id_folha = f.id AND excluido_em IS NULL;
      IF public.recorrencia_vale_na_competencia(r, f.competencia) THEN
        v_valor := CASE WHEN r.modalidade = 'fixo' THEN r.valor ELSE round(f.salario_base * r.percentual / 100, 2) END;
        IF v_valor IS NULL OR v_valor <= 0 THEN CONTINUE; END IF;
        IF a.id IS NOT NULL AND a.valor = v_valor AND a.tipo = r.tipo AND a.descricao = r.descricao AND a.versao_recorrencia = r.versao
           AND a.valor_base IS NOT DISTINCT FROM (CASE WHEN r.modalidade = 'percentual' THEN f.salario_base END) THEN
          CONTINUE; -- já está certo
        END IF;
        IF a.id IS NOT NULL THEN UPDATE public.ajustes_folha SET excluido_em = now(), excluido_por = auth.uid() WHERE id = a.id; END IF;
        INSERT INTO public.ajustes_folha (id_empresa, id_folha, tipo, descricao, valor, criado_por, modalidade, percentual, base_calculo, valor_base, id_recorrencia, versao_recorrencia)
        VALUES (f.id_empresa, f.id, r.tipo, r.descricao, v_valor, auth.uid(), r.modalidade, r.percentual, r.base_calculo,
                CASE WHEN r.modalidade = 'percentual' THEN f.salario_base END, r.id, r.versao)
        ON CONFLICT (id_recorrencia, id_folha) WHERE id_recorrencia IS NOT NULL AND excluido_em IS NULL DO NOTHING;
        v_mudou := true;
      ELSIF a.id IS NOT NULL THEN
        UPDATE public.ajustes_folha SET excluido_em = now(), excluido_por = auth.uid() WHERE id = a.id;
        v_mudou := true;
      END IF;
    END LOOP;
    IF v_mudou THEN PERFORM public.recalcular_folha(f.id); END IF;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Recorrências não aplicadas na folha %: %', f.id, SQLERRM; -- tudo desta folha é desfeito
  END;
END;
$$;

-- Sincroniza as folhas já existentes do funcionário a partir de uma competência (as fechadas são ignoradas pela função acima)
CREATE OR REPLACE FUNCTION public.sincronizar_recorrencias_funcionario(p_id_funcionario uuid, p_desde date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  FOR v IN SELECT id FROM public.folhas_competencia WHERE id_funcionario = p_id_funcionario AND competencia >= coalesce(p_desde, DATE '2000-01-01') ORDER BY competencia LOOP
    PERFORM public.sincronizar_recorrencias_folha(v);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_historico_recorrencia(r public.recorrencias_folha, p_acao text, p_motivo text, p_antes jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.historico_recorrencias_folha (id_empresa, id_recorrencia, acao, versao, motivo, antes, depois, id_usuario)
  VALUES (r.id_empresa, r.id, p_acao, r.versao, nullif(btrim(coalesce(p_motivo, '')), ''), p_antes,
          (to_jsonb(r) - 'id_empresa' - 'criado_por' - 'atualizado_por'), auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.recorrencia_gerenciavel(p_id uuid)
RETURNS public.recorrencias_folha LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.recorrencias_folha;
BEGIN
  SELECT * INTO r FROM public.recorrencias_folha WHERE id = p_id FOR UPDATE;
  IF r.id IS NULL OR NOT public.pode_gerenciar_folha(r.id_empresa) THEN RAISE EXCEPTION 'Lançamento recorrente não encontrado.' USING ERRCODE = '42501'; END IF;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.exigir_motivo_recorrencia(p_motivo text)
RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF char_length(btrim(coalesce(p_motivo, ''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Informe o motivo (3 a 500 caracteres).' USING ERRCODE = 'check_violation'; END IF;
END;
$$;

-- ===== Públicas =====
-- Criar (p_id nulo) ou editar. Edição exige motivo, gera nova versão e vale para as competências ABERTAS (fechadas mantêm o valor antigo).
CREATE OR REPLACE FUNCTION public.salvar_recorrencia_folha(p_id uuid, p_id_funcionario uuid, p_tipo text, p_descricao text, p_modalidade text, p_valor numeric,
  p_percentual numeric, p_competencia_inicial date, p_competencia_final date, p_observacoes text, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.recorrencias_folha; v_func public.funcionarios; v_antes jsonb; v_ini date := date_trunc('month', p_competencia_inicial)::date;
        v_fim date := date_trunc('month', p_competencia_final)::date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = '42501'; END IF;
  IF p_id IS NOT NULL THEN
    r := public.recorrencia_gerenciavel(p_id);
    IF r.situacao = 'encerrada' THEN RAISE EXCEPTION 'Recorrência encerrada não pode ser editada.' USING ERRCODE = 'check_violation'; END IF;
    PERFORM public.exigir_motivo_recorrencia(p_motivo);
    p_id_funcionario := r.id_funcionario; -- o funcionário nunca muda
    v_antes := to_jsonb(r) - 'id_empresa' - 'criado_por' - 'atualizado_por';
  END IF;
  SELECT * INTO v_func FROM public.funcionarios WHERE id = p_id_funcionario;
  IF v_func.id IS NULL OR NOT public.pode_gerenciar_folha(v_func.id_empresa) THEN RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE = '42501'; END IF;
  IF coalesce(p_tipo, '') NOT IN ('adicional', 'desconto') THEN RAISE EXCEPTION 'Tipo inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_descricao, ''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Descreva o lançamento (2 a 120 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_modalidade, '') NOT IN ('fixo', 'percentual') THEN RAISE EXCEPTION 'Escolha valor fixo ou porcentagem.' USING ERRCODE = 'check_violation'; END IF;
  IF p_modalidade = 'fixo' AND (p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) OR p_valor > 9999999.99) THEN
    RAISE EXCEPTION 'Informe um valor válido.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_modalidade = 'percentual' THEN
    IF p_percentual IS NULL OR p_percentual <= 0 OR p_percentual <> round(p_percentual, 4) THEN
      RAISE EXCEPTION 'Informe uma porcentagem maior que zero (até 4 casas decimais).' USING ERRCODE = 'check_violation';
    END IF;
    IF p_tipo = 'desconto' AND p_percentual > 100 THEN RAISE EXCEPTION 'Um desconto percentual não pode passar de 100%% do salário-base.' USING ERRCODE = 'check_violation'; END IF;
    IF p_tipo = 'adicional' AND p_percentual > 1000 THEN RAISE EXCEPTION 'Porcentagem acima do limite (1000%%).' USING ERRCODE = 'check_violation'; END IF;
  END IF;
  IF v_ini IS NULL OR v_ini < DATE '2000-01-01' OR v_ini > (date_trunc('month', public.hoje_brasil()) + interval '24 months')::date THEN
    RAISE EXCEPTION 'Competência inicial inválida.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_fim IS NOT NULL AND v_fim < v_ini THEN RAISE EXCEPTION 'A competência final não pode ser anterior à inicial.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(coalesce(p_observacoes, '')) > 500 THEN RAISE EXCEPTION 'Observações muito longas (máximo de 500 caracteres).' USING ERRCODE = 'check_violation'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.recorrencias_folha (id_empresa, id_funcionario, tipo, descricao, modalidade, valor, percentual, base_calculo, competencia_inicial, competencia_final,
                                           observacoes, criado_por, atualizado_por)
    VALUES (v_func.id_empresa, v_func.id, p_tipo, btrim(p_descricao), p_modalidade, CASE WHEN p_modalidade = 'fixo' THEN p_valor END,
            CASE WHEN p_modalidade = 'percentual' THEN p_percentual END, CASE WHEN p_modalidade = 'percentual' THEN 'salario_base' END, v_ini, v_fim,
            nullif(btrim(coalesce(p_observacoes, '')), ''), auth.uid(), auth.uid())
    RETURNING * INTO r;
    PERFORM public.registrar_historico_recorrencia(r, 'criada', p_motivo, NULL);
  ELSE
    UPDATE public.recorrencias_folha
       SET tipo = p_tipo, descricao = btrim(p_descricao), modalidade = p_modalidade, valor = CASE WHEN p_modalidade = 'fixo' THEN p_valor END,
           percentual = CASE WHEN p_modalidade = 'percentual' THEN p_percentual END, base_calculo = CASE WHEN p_modalidade = 'percentual' THEN 'salario_base' END,
           competencia_inicial = v_ini, competencia_final = v_fim, observacoes = nullif(btrim(coalesce(p_observacoes, '')), ''),
           versao = versao + 1, atualizado_por = auth.uid(), atualizado_em = now()
     WHERE id = r.id RETURNING * INTO r;
    PERFORM public.registrar_historico_recorrencia(r, 'editada', p_motivo, v_antes);
  END IF;
  PERFORM public.sincronizar_recorrencias_funcionario(r.id_funcionario, NULL);
  RETURN r.id;
END;
$$;

-- Suspender a partir de uma competência (até outra, ou por tempo indeterminado)
CREATE OR REPLACE FUNCTION public.suspender_recorrencia_folha(p_id uuid, p_de date, p_ate date, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.recorrencias_folha; v_antes jsonb; v_de date := date_trunc('month', p_de)::date; v_ate date := date_trunc('month', p_ate)::date;
BEGIN
  r := public.recorrencia_gerenciavel(p_id);
  IF r.situacao = 'encerrada' THEN RAISE EXCEPTION 'Recorrência encerrada.' USING ERRCODE = 'check_violation'; END IF;
  PERFORM public.exigir_motivo_recorrencia(p_motivo);
  IF v_de IS NULL OR (v_ate IS NOT NULL AND v_ate < v_de) THEN RAISE EXCEPTION 'Informe o período da suspensão.' USING ERRCODE = 'check_violation'; END IF;
  v_antes := to_jsonb(r) - 'id_empresa' - 'criado_por' - 'atualizado_por';
  UPDATE public.recorrencias_folha SET suspensa_de = v_de, suspensa_ate = v_ate, situacao = 'suspensa', versao = versao + 1, atualizado_por = auth.uid(), atualizado_em = now()
   WHERE id = r.id RETURNING * INTO r;
  PERFORM public.registrar_historico_recorrencia(r, 'suspensa', p_motivo, v_antes);
  PERFORM public.sincronizar_recorrencias_funcionario(r.id_funcionario, v_de);
END;
$$;

CREATE OR REPLACE FUNCTION public.reativar_recorrencia_folha(p_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.recorrencias_folha; v_antes jsonb; v_de date;
BEGIN
  r := public.recorrencia_gerenciavel(p_id);
  IF r.situacao <> 'suspensa' THEN RAISE EXCEPTION 'A recorrência não está suspensa.' USING ERRCODE = 'check_violation'; END IF;
  PERFORM public.exigir_motivo_recorrencia(p_motivo);
  v_antes := to_jsonb(r) - 'id_empresa' - 'criado_por' - 'atualizado_por';
  v_de := r.suspensa_de;
  UPDATE public.recorrencias_folha SET suspensa_de = NULL, suspensa_ate = NULL, situacao = 'ativa', versao = versao + 1, atualizado_por = auth.uid(), atualizado_em = now()
   WHERE id = r.id RETURNING * INTO r;
  PERFORM public.registrar_historico_recorrencia(r, 'reativada', p_motivo, v_antes);
  PERFORM public.sincronizar_recorrencias_funcionario(r.id_funcionario, v_de);
END;
$$;

-- Encerrar: última competência em que vale. Competências anteriores (e as fechadas) ficam intactas.
CREATE OR REPLACE FUNCTION public.encerrar_recorrencia_folha(p_id uuid, p_ultima_competencia date, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.recorrencias_folha; v_antes jsonb; v_fim date := date_trunc('month', p_ultima_competencia)::date;
BEGIN
  r := public.recorrencia_gerenciavel(p_id);
  IF r.situacao = 'encerrada' THEN RAISE EXCEPTION 'Recorrência já encerrada.' USING ERRCODE = 'check_violation'; END IF;
  PERFORM public.exigir_motivo_recorrencia(p_motivo);
  IF v_fim IS NULL OR v_fim < (r.competencia_inicial - interval '1 month')::date THEN RAISE EXCEPTION 'Informe a última competência.' USING ERRCODE = 'check_violation'; END IF;
  v_antes := to_jsonb(r) - 'id_empresa' - 'criado_por' - 'atualizado_por';
  -- Encerrar antes do início = não vale em nenhum mês: o fim fica no próprio início e esse mês vira exceção
  UPDATE public.recorrencias_folha
     SET competencia_final = greatest(v_fim, competencia_inicial), situacao = 'encerrada', versao = versao + 1, atualizado_por = auth.uid(), atualizado_em = now()
   WHERE id = r.id RETURNING * INTO r;
  IF v_fim < r.competencia_inicial THEN
    INSERT INTO public.excecoes_recorrencia_folha (id_empresa, id_recorrencia, competencia, motivo, criado_por)
    VALUES (r.id_empresa, r.id, r.competencia_inicial, 'Encerrada antes do início: ' || btrim(p_motivo), auth.uid()) ON CONFLICT DO NOTHING;
  END IF;
  PERFORM public.registrar_historico_recorrencia(r, 'encerrada', p_motivo, v_antes);
  PERFORM public.sincronizar_recorrencias_funcionario(r.id_funcionario, (v_fim + interval '1 month')::date);
END;
$$;

-- Não aplicar em UMA competência (aberta). A recorrência continua valendo nos outros meses.
CREATE OR REPLACE FUNCTION public.nao_aplicar_recorrencia_folha(p_id uuid, p_competencia date, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.recorrencias_folha; f public.folhas_competencia; v_comp date := date_trunc('month', p_competencia)::date;
BEGIN
  r := public.recorrencia_gerenciavel(p_id);
  PERFORM public.exigir_motivo_recorrencia(p_motivo);
  IF v_comp IS NULL THEN RAISE EXCEPTION 'Informe a competência.' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO f FROM public.folhas_competencia WHERE id_funcionario = r.id_funcionario AND competencia = v_comp;
  IF f.id IS NOT NULL AND NOT public.folha_aberta_para_recorrencia(f) THEN
    RAISE EXCEPTION 'Competência fechada (paga, enviada ao contador ou aprovada): o lançamento não pode ser retirado.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.excecoes_recorrencia_folha (id_empresa, id_recorrencia, competencia, motivo, criado_por)
  VALUES (r.id_empresa, r.id, v_comp, btrim(p_motivo), auth.uid())
  ON CONFLICT (id_recorrencia, competencia) DO NOTHING;
  PERFORM public.registrar_historico_recorrencia(r, 'nao_aplicada', p_motivo || ' (competência ' || to_char(v_comp, 'MM/YYYY') || ')', NULL);
  IF f.id IS NOT NULL THEN PERFORM public.sincronizar_recorrencias_folha(f.id); END IF;
END;
$$;

-- Abrir a competência também aplica as recorrências (idempotente)
CREATE OR REPLACE FUNCTION public.gerar_folha(p_id_empresa uuid, p_competencia date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_comp date := date_trunc('month', p_competencia)::date;
  v_qtd integer := 0;
  r record;
BEGIN
  IF NOT public.pode_gerenciar_folha(p_id_empresa) THEN RAISE EXCEPTION 'Sem permissão para gerenciar a folha desta empresa.' USING ERRCODE = '42501'; END IF;
  IF v_comp IS NULL OR v_comp > (date_trunc('month', public.hoje_brasil()) + interval '1 month')::date OR v_comp < DATE '2000-01-01' THEN
    RAISE EXCEPTION 'Competência inválida (até o mês seguinte ao atual).' USING ERRCODE = 'check_violation';
  END IF;
  FOR r IN SELECT id FROM public.funcionarios WHERE id_empresa = p_id_empresa LOOP
    IF public.gerar_folha_funcionario(r.id, v_comp) IS NOT NULL THEN v_qtd := v_qtd + 1; END IF;
  END LOOP;
  FOR r IN SELECT fo.id FROM public.folhas_competencia fo WHERE fo.id_empresa = p_id_empresa AND fo.competencia = v_comp
             AND EXISTS (SELECT 1 FROM public.recorrencias_folha x WHERE x.id_funcionario = fo.id_funcionario) LOOP
    PERFORM public.sincronizar_recorrencias_folha(r.id);
  END LOOP;
  RETURN v_qtd;
END;
$$;

-- Lançamento gerado por recorrência sai pelo "Não aplicar nesta competência" (com motivo), não pela exclusão avulsa
CREATE OR REPLACE FUNCTION public.remover_ajuste_folha(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.ajustes_folha; f public.folhas_competencia;
BEGIN
  SELECT * INTO a FROM public.ajustes_folha WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF a.id IS NULL OR NOT public.pode_gerenciar_folha(a.id_empresa) THEN RAISE EXCEPTION 'Ajuste não encontrado.' USING ERRCODE = '42501'; END IF;
  IF a.id_recorrencia IS NOT NULL THEN
    RAISE EXCEPTION 'Este lançamento é recorrente: use "Não aplicar nesta competência" e informe o motivo.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO f FROM public.folhas_competencia WHERE id = a.id_folha;
  PERFORM public.exigir_folha_nao_aprovada(f);
  UPDATE public.ajustes_folha SET excluido_em = now(), excluido_por = auth.uid() WHERE id = p_id;
  PERFORM public.recalcular_folha(a.id_folha);
END;
$$;

-- Histórico individual: identifica a origem recorrente
CREATE OR REPLACE FUNCTION public.historico_funcionario(p_id_funcionario uuid)
RETURNS TABLE (tipo text, data date, competencia date, descricao text, valor numeric, situacao text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.funcionarios;
BEGIN
  SELECT * INTO v FROM public.funcionarios WHERE id = p_id_funcionario;
  IF v.id IS NULL OR NOT public.pode_ver_folha(v.id_empresa) THEN RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT 'pagamento'::text, l.data_pagamento, fo.competencia, l.descricao, l.valor, 'pago'::text
      FROM public.lancamentos_financeiros l JOIN public.folhas_competencia fo ON fo.id = l.id_folha
     WHERE fo.id_funcionario = v.id AND l.status = 'pago' AND l.excluido_em IS NULL
    UNION ALL
    SELECT a.tipo, a.criado_em::date, fo.competencia,
           a.descricao || CASE WHEN a.id_recorrencia IS NOT NULL THEN ' (recorrente)' ELSE '' END
             || CASE WHEN a.modalidade = 'percentual' THEN ' — ' || public.texto_calculo_ajuste(a.percentual, a.valor_base) ELSE '' END, a.valor, NULL::text
      FROM public.ajustes_folha a JOIN public.folhas_competencia fo ON fo.id = a.id_folha
     WHERE fo.id_funcionario = v.id AND a.excluido_em IS NULL
    UNION ALL
    SELECT 'salario'::text, h.criado_em::date, h.vigente_desde, 'Salário-base a partir desta competência', h.salario, NULL::text
      FROM public.historico_salarios h WHERE h.id_funcionario = v.id
    ORDER BY 2 DESC, 3 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.folha_aberta_para_recorrencia(public.folhas_competencia), public.recorrencia_vale_na_competencia(public.recorrencias_folha, date),
  public.sincronizar_recorrencias_folha(uuid), public.sincronizar_recorrencias_funcionario(uuid, date),
  public.registrar_historico_recorrencia(public.recorrencias_folha, text, text, jsonb), public.recorrencia_gerenciavel(uuid), public.exigir_motivo_recorrencia(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.salvar_recorrencia_folha(uuid, uuid, text, text, text, numeric, numeric, date, date, text, text), public.suspender_recorrencia_folha(uuid, date, date, text),
  public.reativar_recorrencia_folha(uuid, text), public.encerrar_recorrencia_folha(uuid, date, text), public.nao_aplicar_recorrencia_folha(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_recorrencia_folha(uuid, uuid, text, text, text, numeric, numeric, date, date, text, text), public.suspender_recorrencia_folha(uuid, date, date, text),
  public.reativar_recorrencia_folha(uuid, text), public.encerrar_recorrencia_folha(uuid, date, text), public.nao_aplicar_recorrencia_folha(uuid, date, text) TO authenticated;
