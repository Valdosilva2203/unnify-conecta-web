-- Funcionários (Etapa 1): cadastro, salários, adicionais/descontos por competência, pagamentos integrais/parciais e histórico,
-- integrados ao Financeiro SEM duplicidade. Controle gerencial (não é folha trabalhista oficial: sem INSS/FGTS/IRRF/13º/férias).
-- Modelo:
--   folhas_competencia = UMA por funcionário e competência (UNIQUE). Total = salário (snapshot) + adicionais − descontos.
--   No Financeiro, cada folha tem: lançamentos PAGOS (pagamentos efetivos) + no máximo UM lançamento PENDENTE (a previsão do saldo).
--   Invariante: total = Σ pagos + pendente. Pagamento parcial vira um lançamento pago separado e reduz o pendente.
--   Recorrência própria (gastos_fixos não comporta ajustes por pessoa nem pagamento parcial); geração idempotente.
--   Salário novo vale a partir de uma competência e só altera folhas sem pagamento. Desligamento cancela previsões futuras.
--   Lançamentos da folha só mudam valor/vencimento/categoria/cancelamento por aqui (gatilho); baixa/estorno seguem no Financeiro.
-- Acesso: dono/sócio gerencia; contador com vínculo ATIVO e "Ver folha de pagamento" só lê. Admin Master sem acesso automático.
-- Reversão: rollback/20261014000038_funcionarios_reverter.sql

CREATE OR REPLACE FUNCTION public.pode_ver_folha(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.e_gestor_empresa(p_id_empresa) OR public.contador_pode(p_id_empresa, 'ver_folha');
$$;
CREATE OR REPLACE FUNCTION public.pode_gerenciar_folha(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.e_gestor_empresa(p_id_empresa);
$$;

CREATE TABLE public.funcionarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  nome text NOT NULL,
  cargo text,
  data_admissao date NOT NULL,
  vinculo text NOT NULL DEFAULT 'clt',
  salario_base numeric(14, 2) NOT NULL,
  dia_pagamento integer NOT NULL DEFAULT 5,
  pagamento_mes_seguinte boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ativo',
  data_desligamento date,
  observacoes text,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT funcionarios_nome CHECK (char_length(btrim(nome)) BETWEEN 2 AND 120),
  CONSTRAINT funcionarios_cargo CHECK (cargo IS NULL OR char_length(cargo) <= 80),
  CONSTRAINT funcionarios_vinculo CHECK (vinculo IN ('clt', 'pj', 'estagio', 'temporario', 'autonomo', 'outro')),
  CONSTRAINT funcionarios_salario CHECK (salario_base > 0 AND salario_base <= 9999999.99),
  CONSTRAINT funcionarios_dia CHECK (dia_pagamento BETWEEN 1 AND 31),
  CONSTRAINT funcionarios_status CHECK (status IN ('ativo', 'inativo') AND (status = 'inativo') = (data_desligamento IS NOT NULL)),
  CONSTRAINT funcionarios_datas CHECK (data_admissao BETWEEN DATE '1950-01-01' AND DATE '2100-12-31' AND (data_desligamento IS NULL OR data_desligamento >= data_admissao)),
  CONSTRAINT funcionarios_observacoes CHECK (observacoes IS NULL OR char_length(observacoes) <= 1000)
);
CREATE INDEX idx_funcionarios_empresa ON public.funcionarios (id_empresa, status);

CREATE TABLE public.historico_salarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_funcionario uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  salario numeric(14, 2) NOT NULL CHECK (salario > 0),
  vigente_desde date NOT NULL CHECK (extract(day FROM vigente_desde) = 1),
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_historico_salarios_func ON public.historico_salarios (id_funcionario, vigente_desde);

CREATE TABLE public.folhas_competencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_funcionario uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  competencia date NOT NULL CHECK (extract(day FROM competencia) = 1),
  salario_base numeric(14, 2) NOT NULL CHECK (salario_base > 0),
  vencimento date NOT NULL,
  cancelada_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT folhas_uma_por_competencia UNIQUE (id_funcionario, competencia)
);
CREATE INDEX idx_folhas_empresa_competencia ON public.folhas_competencia (id_empresa, competencia);

CREATE TABLE public.ajustes_folha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_folha uuid NOT NULL REFERENCES public.folhas_competencia(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('adicional', 'desconto')),
  descricao text NOT NULL CHECK (char_length(btrim(descricao)) BETWEEN 2 AND 120),
  valor numeric(14, 2) NOT NULL CHECK (valor > 0 AND valor <= 9999999.99),
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  excluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  excluido_em timestamptz
);
CREATE INDEX idx_ajustes_folha ON public.ajustes_folha (id_folha) WHERE excluido_em IS NULL;

ALTER TABLE public.lancamentos_financeiros ADD COLUMN id_folha uuid REFERENCES public.folhas_competencia(id) ON DELETE RESTRICT;
CREATE INDEX idx_lancamentos_folha ON public.lancamentos_financeiros (id_folha) WHERE id_folha IS NOT NULL;

-- Lançamentos da folha: valor, vencimento, categoria, classificação, cancelamento e exclusão só pelas funções da folha
CREATE OR REPLACE FUNCTION public.proteger_lancamento_folha()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.id_folha IS NULL OR current_setting('unnify.operacao_folha', true) = 'sim' THEN RETURN NEW; END IF;
  IF NEW.id_folha IS DISTINCT FROM OLD.id_folha OR NEW.valor IS DISTINCT FROM OLD.valor OR NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento
     OR NEW.id_categoria IS DISTINCT FROM OLD.id_categoria OR NEW.natureza_financeira IS DISTINCT FROM OLD.natureza_financeira
     OR (NEW.status = 'cancelado' AND OLD.status <> 'cancelado') OR (NEW.excluido_em IS NOT NULL AND OLD.excluido_em IS NULL) THEN
    RAISE EXCEPTION 'Este lançamento pertence à folha de pagamento: altere valores e pagamentos em Funcionários.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proteger_lancamento_folha BEFORE UPDATE ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.proteger_lancamento_folha();

-- RLS: leitura por quem pode ver a folha; escrita só pelas funções
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_salarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folhas_competencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajustes_folha ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.funcionarios, public.historico_salarios, public.folhas_competencia, public.ajustes_folha FROM anon, authenticated;
GRANT SELECT ON public.funcionarios, public.historico_salarios, public.folhas_competencia, public.ajustes_folha TO authenticated;
CREATE POLICY "Funcionários: empresa autorizada" ON public.funcionarios FOR SELECT TO authenticated USING (public.pode_ver_folha(id_empresa));
CREATE POLICY "Salários: empresa autorizada" ON public.historico_salarios FOR SELECT TO authenticated USING (public.pode_ver_folha(id_empresa));
CREATE POLICY "Folhas: empresa autorizada" ON public.folhas_competencia FOR SELECT TO authenticated USING (public.pode_ver_folha(id_empresa));
CREATE POLICY "Ajustes: empresa autorizada" ON public.ajustes_folha FOR SELECT TO authenticated USING (excluido_em IS NULL AND public.pode_ver_folha(id_empresa));

-- ===== Funções internas =====
CREATE OR REPLACE FUNCTION public.categoria_folha(p_id_empresa uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.categorias_financeiras
   WHERE id_empresa = p_id_empresa AND tipo = 'despesa' AND ativa AND lower(nome) IN ('salários', 'salarios', 'folha de pagamento')
   ORDER BY (lower(nome) IN ('salários', 'salarios')) DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT id INTO v_id FROM public.categorias_financeiras WHERE id_empresa = p_id_empresa AND tipo = 'despesa' AND lower(nome) = 'folha de pagamento';
  IF v_id IS NOT NULL THEN
    UPDATE public.categorias_financeiras SET ativa = true WHERE id = v_id;
    RETURN v_id;
  END IF;
  INSERT INTO public.categorias_financeiras (id_empresa, tipo, nome, cor, icone, ativa, criado_por)
  VALUES (p_id_empresa, 'despesa', 'Folha de pagamento', '#8b5cf6', 'users', true, auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.vencimento_folha(p_dia integer, p_mes_seguinte boolean, p_competencia date)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT (date_trunc('month', p_competencia) + CASE WHEN p_mes_seguinte THEN interval '1 month' ELSE interval '0' END)::date
         + (least(p_dia, extract(day FROM (date_trunc('month', p_competencia) + CASE WHEN p_mes_seguinte THEN interval '2 month' ELSE interval '1 month' END - interval '1 day'))::integer) - 1);
$$;

CREATE OR REPLACE FUNCTION public.salario_vigente(p_id_funcionario uuid, p_competencia date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT h.salario FROM public.historico_salarios h WHERE h.id_funcionario = p_id_funcionario AND h.vigente_desde <= p_competencia
                    ORDER BY h.vigente_desde DESC, h.criado_em DESC LIMIT 1),
                  (SELECT f.salario_base FROM public.funcionarios f WHERE f.id = p_id_funcionario));
$$;

-- Totais de uma folha (fonte única dos números de Funcionários)
CREATE OR REPLACE FUNCTION public.totais_folha(p_id_folha uuid)
RETURNS TABLE (adicionais numeric, descontos numeric, total numeric, pago numeric, pendente numeric, ultimo_pagamento date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (SELECT coalesce(sum(valor) FILTER (WHERE tipo = 'adicional'), 0) ad, coalesce(sum(valor) FILTER (WHERE tipo = 'desconto'), 0) de
               FROM public.ajustes_folha WHERE id_folha = p_id_folha AND excluido_em IS NULL),
       l AS (SELECT coalesce(sum(valor) FILTER (WHERE status = 'pago'), 0) pg, coalesce(sum(valor) FILTER (WHERE status = 'pendente'), 0) pe,
                    max(data_pagamento) FILTER (WHERE status = 'pago') ult
               FROM public.lancamentos_financeiros WHERE id_folha = p_id_folha AND excluido_em IS NULL)
  SELECT a.ad, a.de, CASE WHEN f.cancelada_em IS NULL THEN f.salario_base + a.ad - a.de ELSE l.pg END, l.pg, l.pe, l.ult
    FROM public.folhas_competencia f, a, l WHERE f.id = p_id_folha;
$$;

-- Ajusta a previsão no Financeiro: total = Σ pagos + UM pendente. Nunca altera pagamentos confirmados.
CREATE OR REPLACE FUNCTION public.recalcular_folha(p_id_folha uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f public.folhas_competencia;
  v_func public.funcionarios;
  v_ad numeric; v_de numeric; v_total numeric; v_pago numeric; v_restante numeric;
  v_pendente uuid;
  v_desc text;
BEGIN
  SELECT * INTO f FROM public.folhas_competencia WHERE id = p_id_folha FOR UPDATE;
  SELECT * INTO v_func FROM public.funcionarios WHERE id = f.id_funcionario;
  SELECT coalesce(sum(valor) FILTER (WHERE tipo = 'adicional'), 0), coalesce(sum(valor) FILTER (WHERE tipo = 'desconto'), 0)
    INTO v_ad, v_de FROM public.ajustes_folha WHERE id_folha = f.id AND excluido_em IS NULL;
  SELECT coalesce(sum(valor), 0) INTO v_pago FROM public.lancamentos_financeiros WHERE id_folha = f.id AND status = 'pago' AND excluido_em IS NULL;
  v_total := CASE WHEN f.cancelada_em IS NULL THEN f.salario_base + v_ad - v_de ELSE v_pago END;
  IF v_total < 0 THEN RAISE EXCEPTION 'Os descontos não podem ser maiores que o salário mais os adicionais.' USING ERRCODE = 'check_violation'; END IF;
  v_restante := v_total - v_pago;
  IF v_restante < 0 THEN
    RAISE EXCEPTION 'O total da competência (%) ficaria menor que o já pago (%). Estorne um pagamento antes.', v_total, v_pago USING ERRCODE = 'check_violation';
  END IF;
  v_desc := left('Salário — ' || v_func.nome || ' — ' || to_char(f.competencia, 'MM/YYYY'), 200);

  PERFORM set_config('unnify.operacao_folha', 'sim', true);
  SELECT id INTO v_pendente FROM public.lancamentos_financeiros
   WHERE id_folha = f.id AND status = 'pendente' AND excluido_em IS NULL ORDER BY criado_em LIMIT 1;
  -- Pendentes extras (ex.: estorno feito no Financeiro) são consolidados num só
  UPDATE public.lancamentos_financeiros SET excluido_em = now(), excluido_por = auth.uid()
   WHERE id_folha = f.id AND status = 'pendente' AND excluido_em IS NULL AND id IS DISTINCT FROM v_pendente;
  IF v_restante = 0 THEN
    IF v_pendente IS NOT NULL THEN
      UPDATE public.lancamentos_financeiros SET excluido_em = now(), excluido_por = auth.uid() WHERE id = v_pendente;
    END IF;
  ELSIF v_pendente IS NOT NULL THEN
    UPDATE public.lancamentos_financeiros
       SET valor = v_restante, data_vencimento = f.vencimento, descricao = v_desc, contraparte = left(v_func.nome, 120), atualizado_por = auth.uid()
     WHERE id = v_pendente;
  ELSE
    INSERT INTO public.lancamentos_financeiros (id_empresa, tipo, descricao, valor, id_categoria, data_competencia, data_vencimento, status,
                                                contraparte, criado_por, atualizado_por, natureza_financeira, id_folha)
    VALUES (f.id_empresa, 'despesa', v_desc, v_restante, public.categoria_folha(f.id_empresa), f.competencia, f.vencimento, 'pendente',
            left(v_func.nome, 120), auth.uid(), auth.uid(), 'operacional', f.id);
  END IF;
  PERFORM set_config('unnify.operacao_folha', '', true);
END;
$$;

-- Cria (se ainda não existe) a folha de um funcionário numa competência. Idempotente.
CREATE OR REPLACE FUNCTION public.gerar_folha_funcionario(p_id_funcionario uuid, p_competencia date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_func public.funcionarios;
  v_comp date := date_trunc('month', p_competencia)::date;
  v_id uuid;
BEGIN
  SELECT * INTO v_func FROM public.funcionarios WHERE id = p_id_funcionario;
  IF v_func.id IS NULL OR v_func.data_admissao > (v_comp + interval '1 month - 1 day')::date
     OR (v_func.data_desligamento IS NOT NULL AND v_func.data_desligamento < v_comp) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.folhas_competencia (id_empresa, id_funcionario, competencia, salario_base, vencimento)
  VALUES (v_func.id_empresa, v_func.id, v_comp, public.salario_vigente(v_func.id, v_comp),
          public.vencimento_folha(v_func.dia_pagamento, v_func.pagamento_mes_seguinte, v_comp))
  ON CONFLICT (id_funcionario, competencia) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN PERFORM public.recalcular_folha(v_id); END IF;
  RETURN v_id;
END;
$$;

-- ===== Funções públicas =====
-- Gera as previsões da competência para todos os funcionários elegíveis (idempotente; até o mês seguinte ao atual)
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
  RETURN v_qtd;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_funcionario(
  p_id uuid, p_id_empresa uuid, p_nome text, p_cargo text, p_data_admissao date, p_vinculo text, p_salario numeric,
  p_dia_pagamento integer, p_mes_seguinte boolean, p_observacoes text, p_vigente_desde date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.funcionarios;
  v_id uuid;
  v_vig date;
  v_hoje date := public.hoje_brasil();
  r record;
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT * INTO v FROM public.funcionarios WHERE id = p_id FOR UPDATE;
    IF v.id IS NULL OR NOT public.pode_gerenciar_folha(v.id_empresa) THEN RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE = '42501'; END IF;
  ELSIF p_id_empresa IS NULL OR NOT public.pode_gerenciar_folha(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar a folha desta empresa.' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(coalesce(p_nome, ''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Informe o nome (2 a 120 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  IF p_salario IS NULL OR p_salario <= 0 OR p_salario > 9999999.99 OR p_salario <> round(p_salario, 2) THEN RAISE EXCEPTION 'Informe um salário-base válido.' USING ERRCODE = 'check_violation'; END IF;
  IF p_dia_pagamento IS NULL OR p_dia_pagamento NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'Dia de pagamento entre 1 e 31.' USING ERRCODE = 'check_violation'; END IF;
  IF p_data_admissao IS NULL OR p_data_admissao > v_hoje + 365 THEN RAISE EXCEPTION 'Informe uma data de admissão válida.' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_vinculo, '') NOT IN ('clt', 'pj', 'estagio', 'temporario', 'autonomo', 'outro') THEN RAISE EXCEPTION 'Vínculo inválido.' USING ERRCODE = 'check_violation'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.funcionarios (id_empresa, nome, cargo, data_admissao, vinculo, salario_base, dia_pagamento, pagamento_mes_seguinte, observacoes, criado_por, atualizado_por)
    VALUES (p_id_empresa, btrim(p_nome), nullif(btrim(coalesce(p_cargo, '')), ''), p_data_admissao, p_vinculo, p_salario, p_dia_pagamento,
            coalesce(p_mes_seguinte, true), nullif(btrim(coalesce(p_observacoes, '')), ''), auth.uid(), auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.historico_salarios (id_empresa, id_funcionario, salario, vigente_desde, criado_por)
    VALUES (p_id_empresa, v_id, p_salario, date_trunc('month', p_data_admissao)::date, auth.uid());
    PERFORM public.gerar_folha_funcionario(v_id, v_hoje); -- previsão da competência atual (se já admitido)
    RETURN v_id;
  END IF;

  UPDATE public.funcionarios
     SET nome = btrim(p_nome), cargo = nullif(btrim(coalesce(p_cargo, '')), ''), data_admissao = p_data_admissao, vinculo = p_vinculo,
         salario_base = p_salario, dia_pagamento = p_dia_pagamento, pagamento_mes_seguinte = coalesce(p_mes_seguinte, true),
         observacoes = nullif(btrim(coalesce(p_observacoes, '')), ''), atualizado_por = auth.uid(), atualizado_em = now()
   WHERE id = p_id;
  IF p_salario <> v.salario_base THEN
    v_vig := date_trunc('month', coalesce(p_vigente_desde, v_hoje))::date;
    INSERT INTO public.historico_salarios (id_empresa, id_funcionario, salario, vigente_desde, criado_por) VALUES (v.id_empresa, p_id, p_salario, v_vig, auth.uid());
  END IF;
  -- Competências ainda SEM pagamento e não encerradas acompanham salário/vencimento/nome; as com pagamento ficam como estão
  FOR r IN SELECT f.id, f.competencia FROM public.folhas_competencia f
            WHERE f.id_funcionario = p_id AND f.cancelada_em IS NULL AND f.competencia >= coalesce(v_vig, date_trunc('month', v_hoje)::date)
              AND NOT EXISTS (SELECT 1 FROM public.lancamentos_financeiros l WHERE l.id_folha = f.id AND l.status = 'pago' AND l.excluido_em IS NULL) LOOP
    UPDATE public.folhas_competencia SET salario_base = public.salario_vigente(p_id, r.competencia),
           vencimento = public.vencimento_folha(p_dia_pagamento, coalesce(p_mes_seguinte, true), r.competencia) WHERE id = r.id;
    PERFORM public.recalcular_folha(r.id);
  END LOOP;
  RETURN p_id;
END;
$$;

-- Desliga: interrompe previsões de competências posteriores ao desligamento (sem pagamento); histórico e pagamentos ficam
CREATE OR REPLACE FUNCTION public.desligar_funcionario(p_id uuid, p_data date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.funcionarios; r record;
BEGIN
  SELECT * INTO v FROM public.funcionarios WHERE id = p_id FOR UPDATE;
  IF v.id IS NULL OR NOT public.pode_gerenciar_folha(v.id_empresa) THEN RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE = '42501'; END IF;
  IF v.status = 'inativo' THEN RAISE EXCEPTION 'Este funcionário já está desligado.' USING ERRCODE = 'check_violation'; END IF;
  IF p_data IS NULL OR p_data < v.data_admissao THEN RAISE EXCEPTION 'Informe uma data de desligamento a partir da admissão.' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.funcionarios SET status = 'inativo', data_desligamento = p_data, atualizado_por = auth.uid(), atualizado_em = now() WHERE id = p_id;
  FOR r IN SELECT f.id FROM public.folhas_competencia f WHERE f.id_funcionario = p_id AND f.competencia > p_data AND f.cancelada_em IS NULL LOOP
    UPDATE public.folhas_competencia SET cancelada_em = now() WHERE id = r.id;
    PERFORM public.recalcular_folha(r.id); -- total passa a ser o já pago: o pendente sai
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reativar_funcionario(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.funcionarios; r record;
BEGIN
  SELECT * INTO v FROM public.funcionarios WHERE id = p_id FOR UPDATE;
  IF v.id IS NULL OR NOT public.pode_gerenciar_folha(v.id_empresa) THEN RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE = '42501'; END IF;
  IF v.status = 'ativo' THEN RETURN; END IF;
  UPDATE public.funcionarios SET status = 'ativo', data_desligamento = NULL, atualizado_por = auth.uid(), atualizado_em = now() WHERE id = p_id;
  FOR r IN SELECT f.id FROM public.folhas_competencia f WHERE f.id_funcionario = p_id AND f.cancelada_em IS NOT NULL
            AND f.competencia >= date_trunc('month', public.hoje_brasil())::date LOOP
    UPDATE public.folhas_competencia SET cancelada_em = NULL WHERE id = r.id;
    PERFORM public.recalcular_folha(r.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.adicionar_ajuste_folha(p_id_folha uuid, p_tipo text, p_descricao text, p_valor numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.folhas_competencia; v_id uuid;
BEGIN
  SELECT * INTO f FROM public.folhas_competencia WHERE id = p_id_folha FOR UPDATE;
  IF f.id IS NULL OR NOT public.pode_gerenciar_folha(f.id_empresa) THEN RAISE EXCEPTION 'Competência não encontrada.' USING ERRCODE = '42501'; END IF;
  IF f.cancelada_em IS NOT NULL THEN RAISE EXCEPTION 'Competência cancelada (funcionário desligado).' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_tipo, '') NOT IN ('adicional', 'desconto') THEN RAISE EXCEPTION 'Tipo inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_descricao, ''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Descreva o ajuste (2 a 120 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) OR p_valor > 9999999.99 THEN RAISE EXCEPTION 'Informe um valor válido.' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.ajustes_folha (id_empresa, id_folha, tipo, descricao, valor, criado_por)
  VALUES (f.id_empresa, f.id, p_tipo, btrim(p_descricao), p_valor, auth.uid()) RETURNING id INTO v_id;
  PERFORM public.recalcular_folha(f.id); -- se o desconto passar do saldo, tudo é desfeito
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_ajuste_folha(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.ajustes_folha;
BEGIN
  SELECT * INTO a FROM public.ajustes_folha WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF a.id IS NULL OR NOT public.pode_gerenciar_folha(a.id_empresa) THEN RAISE EXCEPTION 'Ajuste não encontrado.' USING ERRCODE = '42501'; END IF;
  UPDATE public.ajustes_folha SET excluido_em = now(), excluido_por = auth.uid() WHERE id = p_id;
  PERFORM public.recalcular_folha(a.id_folha);
END;
$$;

-- Pagamento integral ou parcial: vira saída efetiva no Financeiro (mesma baixa do Financeiro: conta, saldo, movimentação)
CREATE OR REPLACE FUNCTION public.registrar_pagamento_folha(p_id_folha uuid, p_valor numeric, p_data date, p_id_conta uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f public.folhas_competencia;
  v_pend public.lancamentos_financeiros;
  v_id uuid;
BEGIN
  SELECT * INTO f FROM public.folhas_competencia WHERE id = p_id_folha FOR UPDATE;
  IF f.id IS NULL OR NOT public.pode_gerenciar_folha(f.id_empresa) THEN RAISE EXCEPTION 'Competência não encontrada.' USING ERRCODE = '42501'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) THEN RAISE EXCEPTION 'Informe um valor válido.' USING ERRCODE = 'check_violation'; END IF;
  IF p_data IS NULL OR p_data > public.hoje_brasil() THEN RAISE EXCEPTION 'A data do pagamento não pode ser futura.' USING ERRCODE = 'check_violation'; END IF;
  PERFORM public.recalcular_folha(f.id);
  SELECT * INTO v_pend FROM public.lancamentos_financeiros WHERE id_folha = f.id AND status = 'pendente' AND excluido_em IS NULL LIMIT 1 FOR UPDATE;
  IF v_pend.id IS NULL THEN RAISE EXCEPTION 'Não há saldo pendente nesta competência.' USING ERRCODE = 'check_violation'; END IF;
  IF p_valor > v_pend.valor THEN RAISE EXCEPTION 'O valor é maior que o saldo pendente (%).', v_pend.valor USING ERRCODE = 'check_violation'; END IF;

  IF p_valor = v_pend.valor THEN
    PERFORM public.registrar_baixa_lancamento(v_pend.id, p_data, p_id_conta, p_valor);
    RETURN v_pend.id;
  END IF;
  -- Parcial: a previsão diminui e o valor pago vira um lançamento próprio, já baixado na conta
  PERFORM set_config('unnify.operacao_folha', 'sim', true);
  UPDATE public.lancamentos_financeiros SET valor = v_pend.valor - p_valor, atualizado_por = auth.uid() WHERE id = v_pend.id;
  INSERT INTO public.lancamentos_financeiros (id_empresa, tipo, descricao, valor, id_categoria, data_competencia, data_vencimento, status,
                                              contraparte, criado_por, atualizado_por, natureza_financeira, id_folha)
  VALUES (f.id_empresa, 'despesa', left(v_pend.descricao || ' (parcial)', 200), p_valor, v_pend.id_categoria, f.competencia, p_data, 'pendente',
          v_pend.contraparte, auth.uid(), auth.uid(), 'operacional', f.id)
  RETURNING id INTO v_id;
  PERFORM set_config('unnify.operacao_folha', '', true);
  PERFORM public.registrar_baixa_lancamento(v_id, p_data, p_id_conta, p_valor);
  RETURN v_id;
END;
$$;

-- Painel da competência: uma linha por funcionário (com folha na competência)
CREATE OR REPLACE FUNCTION public.resumo_folha(p_id_empresa uuid, p_competencia date)
RETURNS TABLE (id_funcionario uuid, nome text, cargo text, vinculo text, data_admissao date, status_funcionario text, id_folha uuid,
               salario_base numeric, adicionais numeric, descontos numeric, total numeric, pago numeric, pendente numeric,
               vencimento date, situacao text, ultimo_pagamento date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_ver_folha(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso à folha desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT fu.id, fu.nome, fu.cargo, fu.vinculo, fu.data_admissao, fu.status, fo.id, fo.salario_base,
           t.adicionais, t.descontos, t.total, t.pago, t.total - t.pago, fo.vencimento,
           CASE WHEN fo.cancelada_em IS NOT NULL THEN 'cancelada'
                WHEN t.total - t.pago <= 0 THEN 'pago'
                WHEN t.pago > 0 THEN 'parcial'
                WHEN fo.vencimento < public.hoje_brasil() THEN 'atrasado'
                ELSE 'pendente' END,
           t.ultimo_pagamento
      FROM public.folhas_competencia fo
      JOIN public.funcionarios fu ON fu.id = fo.id_funcionario
      CROSS JOIN LATERAL public.totais_folha(fo.id) t
     WHERE fo.id_empresa = p_id_empresa AND fo.competencia = date_trunc('month', p_competencia)::date
     ORDER BY fu.nome;
END;
$$;

-- Evolução anual: previsto x pago por competência
CREATE OR REPLACE FUNCTION public.evolucao_folha(p_id_empresa uuid, p_ano integer)
RETURNS TABLE (competencia date, previsto numeric, pago numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_ver_folha(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso à folha desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT m.mes, coalesce(sum(t.total), 0), coalesce(sum(t.pago), 0)
      FROM (SELECT make_date(p_ano, g, 1) mes FROM generate_series(1, 12) g) m
      LEFT JOIN public.folhas_competencia fo ON fo.id_empresa = p_id_empresa AND fo.competencia = m.mes
      LEFT JOIN LATERAL public.totais_folha(fo.id) t ON true
     GROUP BY m.mes ORDER BY m.mes;
END;
$$;

-- Histórico individual: competências (com totais) e pagamentos efetivos (sem expor o Financeiro inteiro)
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
    SELECT a.tipo, a.criado_em::date, fo.competencia, a.descricao, a.valor, NULL::text
      FROM public.ajustes_folha a JOIN public.folhas_competencia fo ON fo.id = a.id_folha
     WHERE fo.id_funcionario = v.id AND a.excluido_em IS NULL
    UNION ALL
    SELECT 'salario'::text, h.criado_em::date, h.vigente_desde, 'Salário-base a partir desta competência', h.salario, NULL::text
      FROM public.historico_salarios h WHERE h.id_funcionario = v.id
    ORDER BY 2 DESC, 3 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_lancamento_folha(), public.categoria_folha(uuid), public.recalcular_folha(uuid),
  public.gerar_folha_funcionario(uuid, date), public.salario_vigente(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pode_ver_folha(uuid), public.pode_gerenciar_folha(uuid), public.totais_folha(uuid), public.vencimento_folha(integer, boolean, date),
  public.gerar_folha(uuid, date), public.salvar_funcionario(uuid, uuid, text, text, date, text, numeric, integer, boolean, text, date),
  public.desligar_funcionario(uuid, date), public.reativar_funcionario(uuid), public.adicionar_ajuste_folha(uuid, text, text, numeric),
  public.remover_ajuste_folha(uuid), public.registrar_pagamento_folha(uuid, numeric, date, uuid), public.resumo_folha(uuid, date),
  public.evolucao_folha(uuid, integer), public.historico_funcionario(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_ver_folha(uuid), public.pode_gerenciar_folha(uuid), public.vencimento_folha(integer, boolean, date),
  public.gerar_folha(uuid, date), public.salvar_funcionario(uuid, uuid, text, text, date, text, numeric, integer, boolean, text, date),
  public.desligar_funcionario(uuid, date), public.reativar_funcionario(uuid), public.adicionar_ajuste_folha(uuid, text, text, numeric),
  public.remover_ajuste_folha(uuid), public.registrar_pagamento_folha(uuid, numeric, date, uuid), public.resumo_folha(uuid, date),
  public.evolucao_folha(uuid, integer), public.historico_funcionario(uuid) TO authenticated;
-- totais_folha é usado só dentro das funções acima (que já checam permissão)
