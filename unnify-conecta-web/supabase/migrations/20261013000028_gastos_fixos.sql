-- Gastos fixos (despesas recorrentes) para empresas e para a administração da plataforma (Admin Master).
-- Regra ÚNICA de recorrência (datas_gasto_fixo) e um só cadastro (gastos_fixos) com dois contextos isolados:
--   empresa    → cada ocorrência é um lançamento de despesa (aparece em Contas a pagar; pago pela baixa existente)
--   plataforma → ocorrências próprias (ocorrencias_gastos_plataforma), sem contas bancárias (não existe financeiro
--                administrativo): registro de pagamento/estorno sem saldo bancário.
-- Admin Master NÃO ganha acesso a dados financeiros de empresas; empresas não veem nada da plataforma.

-- 0. Quem opera o financeiro da plataforma: Admin Master ativo
CREATE OR REPLACE FUNCTION public.admin_master_ativo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfis
                  WHERE id_usuario = auth.uid() AND funcao_global = 'admin_master' AND status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.pode_ver_gastos_fixos(p_contexto text, p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_contexto
           WHEN 'empresa' THEN p_id_empresa IS NOT NULL AND public.pode_ver_financeiro(p_id_empresa)
           WHEN 'plataforma' THEN p_id_empresa IS NULL AND public.admin_master_ativo()
           ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.pode_gerenciar_gastos_fixos(p_contexto text, p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_contexto
           WHEN 'empresa' THEN p_id_empresa IS NOT NULL AND public.pode_gerenciar_financeiro(p_id_empresa)
           WHEN 'plataforma' THEN p_id_empresa IS NULL AND public.admin_master_ativo()
           ELSE false END;
$$;

-- 1. Categorias da plataforma: mesma tabela de categorias, id_empresa nulo (nunca visível a empresas)
ALTER TABLE public.categorias_financeiras ALTER COLUMN id_empresa DROP NOT NULL;
CREATE UNIQUE INDEX categorias_financeiras_nome_unico_plataforma ON public.categorias_financeiras (tipo, lower(nome)) WHERE id_empresa IS NULL;
CREATE POLICY "Financeiro: categorias da plataforma" ON public.categorias_financeiras FOR SELECT TO authenticated
  USING (id_empresa IS NULL AND public.admin_master_ativo());

-- Comparações com id_empresa nulo: "<>" resultaria em NULL e deixaria passar; usar IS DISTINCT FROM
CREATE OR REPLACE FUNCTION public.validar_lancamento_financeiro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cat public.categorias_financeiras;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id_empresa IS DISTINCT FROM OLD.id_empresa OR NEW.tipo IS DISTINCT FROM OLD.tipo THEN
      RAISE EXCEPTION 'Empresa e tipo do lançamento não podem ser alterados.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.atualizado_em := now();
  END IF;
  IF TG_OP = 'INSERT' OR NEW.id_categoria IS DISTINCT FROM OLD.id_categoria THEN
    SELECT * INTO v_cat FROM public.categorias_financeiras WHERE id = NEW.id_categoria;
    IF v_cat.id IS NULL OR v_cat.id_empresa IS NULL OR v_cat.id_empresa IS DISTINCT FROM NEW.id_empresa OR v_cat.tipo <> NEW.tipo THEN
      RAISE EXCEPTION 'Categoria inválida para este lançamento.' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT v_cat.ativa THEN
      RAISE EXCEPTION 'Esta categoria está desativada.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.descricao := btrim(NEW.descricao);
  NEW.contraparte := nullif(btrim(coalesce(NEW.contraparte, '')), '');
  NEW.observacoes := nullif(btrim(coalesce(NEW.observacoes, '')), '');
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef('public.criar_contrato_parcelado(uuid,text,text,text,uuid,text,date,numeric,numeric,numeric,text,uuid,jsonb,jsonb)'::regprocedure) INTO v_src;
  IF position('v_cat.id_empresa <> p_id_empresa' IN v_src) = 0 THEN
    RAISE EXCEPTION 'criar_contrato_parcelado: trecho esperado não encontrado; ajuste manual necessário.';
  END IF;
  EXECUTE replace(v_src, 'v_cat.id_empresa <> p_id_empresa', 'v_cat.id_empresa IS DISTINCT FROM p_id_empresa');
END;
$$;

CREATE OR REPLACE FUNCTION public.inicializar_categorias_plataforma()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inseridas integer;
BEGIN
  IF NOT public.admin_master_ativo() THEN
    RAISE EXCEPTION 'Sem permissão para o financeiro da plataforma.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.categorias_financeiras (id_empresa, tipo, nome, cor, icone, criado_por)
  SELECT NULL, 'despesa', m.nome, m.cor, m.icone, auth.uid()
    FROM (VALUES
      ('Hospedagem e servidores', '#3b82f6', 'laptop'), ('Serviços de nuvem', '#0ea5e9', 'shield-check'),
      ('Domínios', '#8b5cf6', 'tag'), ('Ferramentas de desenvolvimento', '#f97316', 'wrench'),
      ('Contabilidade', '#16a34a', 'calculator'), ('Aluguel', '#ef4444', 'house'), ('Outras despesas', '#9ca3af', 'tag')
    ) AS m(nome, cor, icone)
   WHERE NOT EXISTS (SELECT 1 FROM public.categorias_financeiras c
                      WHERE c.id_empresa IS NULL AND c.tipo = 'despesa' AND lower(c.nome) = lower(m.nome));
  GET DIAGNOSTICS v_inseridas = ROW_COUNT;
  RETURN v_inseridas;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_categoria_plataforma(p_id uuid, p_nome text, p_cor text, p_icone text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.admin_master_ativo() THEN
    RAISE EXCEPTION 'Sem permissão para o financeiro da plataforma.' USING ERRCODE = '42501';
  END IF;
  IF p_icone IS NOT NULL AND NOT (p_icone = ANY (public.icones_categoria_permitidos())) THEN
    RAISE EXCEPTION 'Ícone inválido.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_cor IS NOT NULL AND p_cor !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'Cor inválida.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.categorias_financeiras (id_empresa, tipo, nome, cor, icone, criado_por)
    VALUES (NULL, 'despesa', btrim(p_nome), coalesce(p_cor, '#9ca3af'), coalesce(p_icone, 'tag'), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.categorias_financeiras
       SET nome = btrim(p_nome), cor = coalesce(p_cor, cor), icone = coalesce(p_icone, icone), atualizado_em = now()
     WHERE id = p_id AND id_empresa IS NULL RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'Já existe uma categoria com este nome.' USING ERRCODE = 'unique_violation';
  WHEN check_violation THEN
    IF SQLERRM IN ('Ícone inválido.', 'Cor inválida.') THEN RAISE; END IF;
    RAISE EXCEPTION 'Nome da categoria inválido (2 a 60 caracteres).' USING ERRCODE = 'check_violation';
END;
$$;

-- Ativar/desativar: categoria da empresa (gestor/contador autorizado) ou da plataforma (Admin Master ativo)
CREATE OR REPLACE FUNCTION public.definir_categoria_financeira_ativa(p_id uuid, p_ativa boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cat public.categorias_financeiras;
BEGIN
  SELECT * INTO v_cat FROM public.categorias_financeiras WHERE id = p_id;
  IF v_cat.id IS NULL
     OR (v_cat.id_empresa IS NULL AND NOT public.admin_master_ativo())
     OR (v_cat.id_empresa IS NOT NULL AND NOT public.pode_gerenciar_financeiro(v_cat.id_empresa)) THEN
    RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.categorias_financeiras SET ativa = p_ativa, atualizado_em = now() WHERE id = p_id;
END;
$$;

-- 2. Cadastro único de gastos fixos
CREATE TABLE public.gastos_fixos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contexto text NOT NULL,
  id_empresa uuid REFERENCES public.empresas(id) ON DELETE RESTRICT,
  nome text NOT NULL,
  contraparte text,
  id_categoria uuid NOT NULL REFERENCES public.categorias_financeiras(id) ON DELETE RESTRICT,
  subcategoria text,
  tipo_valor text NOT NULL DEFAULT 'fixo',
  valor numeric(14, 2) NOT NULL,
  recorrencia text NOT NULL DEFAULT 'mensal',
  dia_vencimento smallint,
  data_inicio date NOT NULL,
  data_termino date,
  id_conta_financeira uuid REFERENCES public.contas_financeiras(id) ON DELETE RESTRICT,
  observacoes text,
  situacao text NOT NULL DEFAULT 'ativo',
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  encerrado_em timestamptz,
  encerrado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  CONSTRAINT gastos_fixos_contexto CHECK (contexto IN ('empresa', 'plataforma') AND ((contexto = 'empresa') = (id_empresa IS NOT NULL))),
  CONSTRAINT gastos_fixos_nome CHECK (char_length(btrim(nome)) BETWEEN 2 AND 120),
  CONSTRAINT gastos_fixos_contraparte CHECK (contraparte IS NULL OR char_length(contraparte) <= 120),
  CONSTRAINT gastos_fixos_subcategoria CHECK (subcategoria IS NULL OR char_length(subcategoria) BETWEEN 1 AND 60),
  CONSTRAINT gastos_fixos_tipo_valor CHECK (tipo_valor IN ('fixo', 'variavel')),
  CONSTRAINT gastos_fixos_valor CHECK (valor > 0 AND valor <= 999999999999.99),
  CONSTRAINT gastos_fixos_recorrencia CHECK (recorrencia IN ('mensal', 'semanal', 'trimestral', 'anual')),
  CONSTRAINT gastos_fixos_dia CHECK ((recorrencia = 'semanal' AND dia_vencimento IS NULL) OR (recorrencia <> 'semanal' AND dia_vencimento BETWEEN 1 AND 31)),
  CONSTRAINT gastos_fixos_periodo CHECK (data_termino IS NULL OR data_termino >= data_inicio),
  CONSTRAINT gastos_fixos_conta CHECK (id_conta_financeira IS NULL OR contexto = 'empresa'),
  CONSTRAINT gastos_fixos_observacoes CHECK (observacoes IS NULL OR char_length(observacoes) <= 1000),
  CONSTRAINT gastos_fixos_situacao CHECK (situacao IN ('ativo', 'pausado', 'encerrado'))
);
CREATE INDEX idx_gastos_fixos_empresa ON public.gastos_fixos (id_empresa) WHERE contexto = 'empresa';
CREATE INDEX idx_gastos_fixos_plataforma ON public.gastos_fixos (criado_em) WHERE contexto = 'plataforma';

-- Ocorrências da EMPRESA = lançamentos de despesa (uma por gasto e competência, inclusive canceladas/excluídas:
-- o que o usuário cancelou não é recriado)
ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN id_gasto_fixo uuid REFERENCES public.gastos_fixos(id) ON DELETE RESTRICT,
  ADD COLUMN competencia_gasto date;
ALTER TABLE public.lancamentos_financeiros
  ADD CONSTRAINT lancamentos_gasto_fixo CHECK ((id_gasto_fixo IS NULL) = (competencia_gasto IS NULL));
CREATE UNIQUE INDEX lancamentos_ocorrencia_gasto_unica ON public.lancamentos_financeiros (id_gasto_fixo, competencia_gasto) WHERE id_gasto_fixo IS NOT NULL;

-- Ocorrências da PLATAFORMA
CREATE TABLE public.ocorrencias_gastos_plataforma (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_gasto_fixo uuid NOT NULL REFERENCES public.gastos_fixos(id) ON DELETE RESTRICT,
  competencia date NOT NULL,
  data_vencimento date NOT NULL,
  valor numeric(14, 2) NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  data_pagamento date,
  pago_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  pago_em timestamptz,
  cancelado_em timestamptz,
  cancelado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ocorrencias_plataforma_unica UNIQUE (id_gasto_fixo, competencia),
  CONSTRAINT ocorrencias_plataforma_valor CHECK (valor > 0 AND valor <= 999999999999.99),
  CONSTRAINT ocorrencias_plataforma_status CHECK (status IN ('pendente', 'pago', 'cancelado')),
  CONSTRAINT ocorrencias_plataforma_pagamento CHECK ((status = 'pago') = (data_pagamento IS NOT NULL))
);

-- Documentos e auditoria (dos dois contextos)
CREATE TABLE public.anexos_gastos_fixos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_gasto_fixo uuid NOT NULL REFERENCES public.gastos_fixos(id) ON DELETE RESTRICT,
  caminho text NOT NULL UNIQUE,
  nome_arquivo text NOT NULL,
  tipo_mime text NOT NULL,
  tamanho integer NOT NULL,
  enviado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  excluido_em timestamptz,
  excluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  CONSTRAINT anexos_gastos_tipo CHECK (tipo_mime IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT anexos_gastos_tamanho CHECK (tamanho > 0 AND tamanho <= 10485760),
  CONSTRAINT anexos_gastos_nome CHECK (char_length(nome_arquivo) BETWEEN 1 AND 200)
);

CREATE TABLE public.historico_gastos_fixos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_gasto_fixo uuid NOT NULL REFERENCES public.gastos_fixos(id) ON DELETE RESTRICT,
  acao text NOT NULL,
  dados jsonb,
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historico_gastos_acao CHECK (acao IN ('criado', 'editado', 'pausado', 'reativado', 'encerrado', 'pagamento', 'estorno',
                                                   'ocorrencia_ajustada', 'ocorrencia_cancelada', 'anexo_adicionado', 'anexo_removido'))
);
CREATE INDEX idx_historico_gastos ON public.historico_gastos_fixos (id_gasto_fixo, criado_em DESC);

-- 3. RLS: leitura por contexto; escrita só por funções
ALTER TABLE public.gastos_fixos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias_gastos_plataforma ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anexos_gastos_fixos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_gastos_fixos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gastos_fixos, public.ocorrencias_gastos_plataforma, public.anexos_gastos_fixos, public.historico_gastos_fixos FROM anon, authenticated;
GRANT SELECT ON public.gastos_fixos, public.ocorrencias_gastos_plataforma, public.anexos_gastos_fixos, public.historico_gastos_fixos TO authenticated;

CREATE POLICY "Gastos fixos: do contexto autorizado" ON public.gastos_fixos FOR SELECT TO authenticated
  USING (public.pode_ver_gastos_fixos(contexto, id_empresa));
CREATE POLICY "Gastos fixos: ocorrências da plataforma" ON public.ocorrencias_gastos_plataforma FOR SELECT TO authenticated
  USING (public.admin_master_ativo());
CREATE POLICY "Gastos fixos: anexos do contexto autorizado" ON public.anexos_gastos_fixos FOR SELECT TO authenticated
  USING (excluido_em IS NULL AND EXISTS (
    SELECT 1 FROM public.gastos_fixos g WHERE g.id = id_gasto_fixo
       AND CASE g.contexto WHEN 'empresa' THEN public.pode_ver_comprovantes_financeiros(g.id_empresa) ELSE public.admin_master_ativo() END));
CREATE POLICY "Gastos fixos: histórico do contexto autorizado" ON public.historico_gastos_fixos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gastos_fixos g WHERE g.id = id_gasto_fixo AND public.pode_ver_gastos_fixos(g.contexto, g.id_empresa)));

-- Documentos no bucket privado de comprovantes:
--   empresa:    <id_empresa>/gastos-fixos/<id_gasto>/<arquivo>  (leitura/remoção já cobertas pelas políticas do bucket)
--   plataforma: plataforma/gastos-fixos/<id_gasto>/<arquivo>    (somente Admin Master ativo)
CREATE POLICY "Comprovantes financeiros: envio de documento de gasto fixo" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprovantes-financeiros'
              AND (storage.foldername(name))[2] = 'gastos-fixos'
              AND EXISTS (SELECT 1 FROM public.gastos_fixos g
                           WHERE g.id = public.uuid_ou_nulo((storage.foldername(name))[3])
                             AND CASE g.contexto
                                   WHEN 'empresa' THEN g.id_empresa = public.uuid_ou_nulo((storage.foldername(name))[1])
                                                       AND public.pode_gerenciar_financeiro(g.id_empresa)
                                   ELSE (storage.foldername(name))[1] = 'plataforma' AND public.admin_master_ativo() END));
CREATE POLICY "Comprovantes financeiros: documentos da plataforma (leitura)" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'comprovantes-financeiros' AND (storage.foldername(name))[1] = 'plataforma' AND public.admin_master_ativo());
CREATE POLICY "Comprovantes financeiros: documentos da plataforma (remoção)" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'comprovantes-financeiros' AND (storage.foldername(name))[1] = 'plataforma' AND public.admin_master_ativo());

-- 4. Regra única de recorrência: datas de vencimento entre p_de e p_ate
--    mensal/trimestral/anual: dia fixo (ajustado ao último dia do mês), a partir do 1º vencimento >= data de início
--    semanal: a cada 7 dias a partir da data de início
CREATE OR REPLACE FUNCTION public.datas_gasto_fixo(p_recorrencia text, p_dia integer, p_inicio date, p_termino date, p_de date, p_ate date)
RETURNS SETOF date LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_passo integer := CASE p_recorrencia WHEN 'mensal' THEN 1 WHEN 'trimestral' THEN 3 WHEN 'anual' THEN 12 END;
  v_ate date := CASE WHEN p_termino IS NULL THEN p_ate ELSE least(p_ate, p_termino) END;
  v_base integer;
  v_data date;
  v_mes integer;
  k integer := 0;
BEGIN
  IF p_inicio IS NULL OR p_de IS NULL OR v_ate IS NULL OR v_ate < p_inicio THEN
    RETURN;
  END IF;
  IF p_recorrencia = 'semanal' THEN
    v_data := p_inicio + 7 * greatest(0, ceil((p_de - p_inicio) / 7.0)::integer);
    WHILE v_data <= v_ate AND k < 400 LOOP
      RETURN NEXT v_data;
      v_data := v_data + 7;
      k := k + 1;
    END LOOP;
    RETURN;
  END IF;
  IF v_passo IS NULL OR p_dia IS NULL OR p_dia NOT BETWEEN 1 AND 31 THEN
    RETURN;
  END IF;
  v_base := extract(year FROM p_inicio)::integer * 12 + extract(month FROM p_inicio)::integer - 1;
  v_data := make_date(v_base / 12, v_base % 12 + 1, least(p_dia, extract(day FROM (make_date(v_base / 12, v_base % 12 + 1, 1) + interval '1 month - 1 day'))::integer));
  IF v_data < p_inicio THEN
    v_base := v_base + 1;
  END IF;
  LOOP
    v_mes := v_base + k * v_passo;
    v_data := make_date(v_mes / 12, v_mes % 12 + 1, least(p_dia, extract(day FROM (make_date(v_mes / 12, v_mes % 12 + 1, 1) + interval '1 month - 1 day'))::integer));
    EXIT WHEN v_data > v_ate OR k > 1200;
    IF v_data >= p_de THEN
      RETURN NEXT v_data;
    END IF;
    k := k + 1;
  END LOOP;
END;
$$;

-- Janela de geração: do 1º dia do mês atual até o fim do mês seguinte (datas de Brasília)
CREATE OR REPLACE FUNCTION public.fim_janela_gastos_fixos()
RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (date_trunc('month', public.hoje_brasil()) + interval '2 months - 1 day')::date;
$$;

-- Gera (idempotente) as ocorrências de um gasto ativo dentro da janela. Uso interno.
CREATE OR REPLACE FUNCTION public.gerar_ocorrencias_gasto_fixo(p_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.gastos_fixos;
  v_qtd integer := 0;
  v_n integer;
  v_data date;
BEGIN
  SELECT * INTO g FROM public.gastos_fixos WHERE id = p_id;
  IF g.id IS NULL OR g.situacao <> 'ativo' THEN
    RETURN 0;
  END IF;
  FOR v_data IN SELECT * FROM public.datas_gasto_fixo(g.recorrencia, g.dia_vencimento, g.data_inicio, g.data_termino,
                                                      greatest(g.data_inicio, date_trunc('month', public.hoje_brasil())::date),
                                                      public.fim_janela_gastos_fixos()) LOOP
    IF g.contexto = 'empresa' THEN
      -- Pendente não tem conta (regra de lancamentos_financeiros); o banco vinculado do gasto é sugerido no pagamento
      INSERT INTO public.lancamentos_financeiros (id_empresa, tipo, descricao, valor, id_categoria, data_competencia, data_vencimento,
                                                  status, contraparte, observacoes, criado_por, natureza_financeira,
                                                  id_gasto_fixo, competencia_gasto)
      VALUES (g.id_empresa, 'despesa', g.nome, g.valor, g.id_categoria, v_data, v_data, 'pendente', g.contraparte, NULL, auth.uid(),
              'operacional', g.id, v_data)
      ON CONFLICT (id_gasto_fixo, competencia_gasto) WHERE id_gasto_fixo IS NOT NULL DO NOTHING;
    ELSE
      INSERT INTO public.ocorrencias_gastos_plataforma (id_gasto_fixo, competencia, data_vencimento, valor)
      VALUES (g.id, v_data, v_data, g.valor)
      ON CONFLICT (id_gasto_fixo, competencia) DO NOTHING;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_qtd := v_qtd + v_n;
  END LOOP;
  RETURN v_qtd;
END;
$$;

-- Pública: gera as ocorrências pendentes de todos os gastos ativos do contexto (só quem pode gerenciar escreve)
CREATE OR REPLACE FUNCTION public.gerar_ocorrencias_gastos_fixos(p_contexto text, p_id_empresa uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_qtd integer := 0;
  v_id uuid;
BEGIN
  IF NOT public.pode_ver_gastos_fixos(p_contexto, p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para ver estes gastos fixos.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.pode_gerenciar_gastos_fixos(p_contexto, p_id_empresa) THEN
    RETURN 0;
  END IF;
  FOR v_id IN SELECT id FROM public.gastos_fixos
               WHERE contexto = p_contexto AND id_empresa IS NOT DISTINCT FROM p_id_empresa AND situacao = 'ativo' LOOP
    v_qtd := v_qtd + public.gerar_ocorrencias_gasto_fixo(v_id);
  END LOOP;
  RETURN v_qtd;
END;
$$;

-- Cancela ocorrências PENDENTES que não pertencem mais à agenda (a partir de hoje). Pagas e vencidas não são tocadas.
CREATE OR REPLACE FUNCTION public.cancelar_ocorrencias_fora_da_agenda(p_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.gastos_fixos;
  v_n integer;
BEGIN
  SELECT * INTO g FROM public.gastos_fixos WHERE id = p_id;
  IF g.contexto = 'empresa' THEN
    UPDATE public.lancamentos_financeiros l
       SET status = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(), atualizado_por = auth.uid()
     WHERE l.id_gasto_fixo = g.id AND l.status = 'pendente' AND l.excluido_em IS NULL AND l.data_vencimento >= public.hoje_brasil()
       AND (g.situacao <> 'ativo' OR l.competencia_gasto NOT IN (
             SELECT * FROM public.datas_gasto_fixo(g.recorrencia, g.dia_vencimento, g.data_inicio, g.data_termino, l.competencia_gasto, l.competencia_gasto)));
  ELSE
    UPDATE public.ocorrencias_gastos_plataforma o
       SET status = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(), atualizado_em = now()
     WHERE o.id_gasto_fixo = g.id AND o.status = 'pendente' AND o.data_vencimento >= public.hoje_brasil()
       AND (g.situacao <> 'ativo' OR o.competencia NOT IN (
             SELECT * FROM public.datas_gasto_fixo(g.recorrencia, g.dia_vencimento, g.data_inicio, g.data_termino, o.competencia, o.competencia)));
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- 5. Criar/editar
CREATE OR REPLACE FUNCTION public.salvar_gasto_fixo(
  p_id uuid, p_contexto text, p_id_empresa uuid, p_nome text, p_contraparte text, p_id_categoria uuid, p_subcategoria text,
  p_tipo_valor text, p_valor numeric, p_recorrencia text, p_dia_vencimento integer, p_data_inicio date, p_data_termino date,
  p_id_conta_financeira uuid, p_observacoes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_antigo public.gastos_fixos;
  v_contexto text := p_contexto;
  v_empresa uuid := p_id_empresa;
  v_cat public.categorias_financeiras;
  v_id uuid;
  v_dia integer := CASE WHEN p_recorrencia = 'semanal' THEN NULL ELSE p_dia_vencimento END;
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_antigo FROM public.gastos_fixos WHERE id = p_id FOR UPDATE;
    IF v_antigo.id IS NULL OR NOT public.pode_gerenciar_gastos_fixos(v_antigo.contexto, v_antigo.id_empresa) THEN
      RAISE EXCEPTION 'Gasto fixo não encontrado.' USING ERRCODE = '42501';
    END IF;
    IF v_antigo.situacao = 'encerrado' THEN
      RAISE EXCEPTION 'Gasto fixo encerrado não pode ser editado.' USING ERRCODE = 'check_violation';
    END IF;
    v_contexto := v_antigo.contexto;
    v_empresa := v_antigo.id_empresa;
  ELSIF NOT public.pode_gerenciar_gastos_fixos(v_contexto, v_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar estes gastos fixos.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cat FROM public.categorias_financeiras WHERE id = p_id_categoria;
  IF v_cat.id IS NULL OR v_cat.id_empresa IS DISTINCT FROM v_empresa OR v_cat.tipo <> 'despesa' OR NOT v_cat.ativa THEN
    RAISE EXCEPTION 'Escolha uma categoria de despesa ativa.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_id_conta_financeira IS NOT NULL AND (v_contexto <> 'empresa' OR NOT EXISTS (
       SELECT 1 FROM public.contas_financeiras c WHERE c.id = p_id_conta_financeira AND c.id_empresa = v_empresa AND c.arquivada_em IS NULL)) THEN
    RAISE EXCEPTION 'Conta financeira inválida.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) THEN
    RAISE EXCEPTION 'Informe um valor maior que zero (até 2 casas decimais).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_recorrencia IS NULL OR p_recorrencia NOT IN ('mensal', 'semanal', 'trimestral', 'anual') THEN
    RAISE EXCEPTION 'Recorrência inválida.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_recorrencia <> 'semanal' AND (v_dia IS NULL OR v_dia NOT BETWEEN 1 AND 31) THEN
    RAISE EXCEPTION 'Informe o dia de vencimento (1 a 31).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data_inicio IS NULL OR (p_data_termino IS NOT NULL AND p_data_termino < p_data_inicio) THEN
    RAISE EXCEPTION 'Datas inválidas: o término deve ser igual ou posterior ao início.' USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    IF p_id IS NULL THEN
      INSERT INTO public.gastos_fixos (contexto, id_empresa, nome, contraparte, id_categoria, subcategoria, tipo_valor, valor, recorrencia,
                                       dia_vencimento, data_inicio, data_termino, id_conta_financeira, observacoes, criado_por, atualizado_por)
      VALUES (v_contexto, v_empresa, btrim(p_nome), nullif(btrim(coalesce(p_contraparte, '')), ''), p_id_categoria,
              nullif(btrim(coalesce(p_subcategoria, '')), ''), p_tipo_valor, p_valor, p_recorrencia, v_dia, p_data_inicio, p_data_termino,
              p_id_conta_financeira, nullif(btrim(coalesce(p_observacoes, '')), ''), auth.uid(), auth.uid())
      RETURNING id INTO v_id;
      INSERT INTO public.historico_gastos_fixos (id_gasto_fixo, acao, dados, id_usuario)
      VALUES (v_id, 'criado', jsonb_build_object('valor', p_valor, 'recorrencia', p_recorrencia), auth.uid());
    ELSE
      UPDATE public.gastos_fixos
         SET nome = btrim(p_nome), contraparte = nullif(btrim(coalesce(p_contraparte, '')), ''), id_categoria = p_id_categoria,
             subcategoria = nullif(btrim(coalesce(p_subcategoria, '')), ''), tipo_valor = p_tipo_valor, valor = p_valor,
             recorrencia = p_recorrencia, dia_vencimento = v_dia, data_inicio = p_data_inicio, data_termino = p_data_termino,
             id_conta_financeira = p_id_conta_financeira, observacoes = nullif(btrim(coalesce(p_observacoes, '')), ''),
             atualizado_por = auth.uid(), atualizado_em = now()
       WHERE id = p_id RETURNING id INTO v_id;
      INSERT INTO public.historico_gastos_fixos (id_gasto_fixo, acao, dados, id_usuario)
      VALUES (v_id, 'editado', jsonb_build_object('antes', to_jsonb(v_antigo) - 'criado_em' - 'atualizado_em',
                                                 'valor', p_valor, 'recorrencia', p_recorrencia, 'dia_vencimento', v_dia), auth.uid());
    END IF;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'Dados do gasto fixo inválidos: confira nome (2 a 120 caracteres), valores e datas.' USING ERRCODE = 'check_violation';
  END;

  IF p_id IS NOT NULL THEN
    -- Ocorrências futuras ainda pendentes acompanham a edição; pagas, vencidas e canceladas ficam como estão (histórico)
    PERFORM public.cancelar_ocorrencias_fora_da_agenda(v_id);
    IF v_contexto = 'empresa' THEN
      UPDATE public.lancamentos_financeiros
         SET descricao = btrim(p_nome), contraparte = nullif(btrim(coalesce(p_contraparte, '')), ''), id_categoria = p_id_categoria,
             atualizado_por = auth.uid(),
             valor = CASE WHEN p_valor IS DISTINCT FROM v_antigo.valor THEN p_valor ELSE valor END
       WHERE id_gasto_fixo = v_id AND status = 'pendente' AND excluido_em IS NULL AND data_vencimento >= public.hoje_brasil();
    ELSE
      UPDATE public.ocorrencias_gastos_plataforma
         SET valor = CASE WHEN p_valor IS DISTINCT FROM v_antigo.valor THEN p_valor ELSE valor END, atualizado_em = now()
       WHERE id_gasto_fixo = v_id AND status = 'pendente' AND data_vencimento >= public.hoje_brasil();
    END IF;
  END IF;
  PERFORM public.gerar_ocorrencias_gasto_fixo(v_id);
  RETURN v_id;
END;
$$;

-- 6. Pausar / reativar / encerrar
--    pausar: cancela as ocorrências futuras pendentes (guardadas no histórico) e para de gerar novas
--    reativar: reabre as que a pausa cancelou (se ainda futuras) e volta a gerar
--    encerrar: define o término (padrão hoje) e cancela as pendentes posteriores; não pode ser desfeito
CREATE OR REPLACE FUNCTION public.alterar_situacao_gasto_fixo(p_id uuid, p_acao text, p_data_termino date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.gastos_fixos;
  v_ids uuid[];
  v_termino date;
BEGIN
  SELECT * INTO g FROM public.gastos_fixos WHERE id = p_id FOR UPDATE;
  IF g.id IS NULL OR NOT public.pode_gerenciar_gastos_fixos(g.contexto, g.id_empresa) THEN
    RAISE EXCEPTION 'Gasto fixo não encontrado.' USING ERRCODE = '42501';
  END IF;

  IF p_acao = 'pausar' THEN
    IF g.situacao <> 'ativo' THEN
      RAISE EXCEPTION 'Só gastos ativos podem ser pausados.' USING ERRCODE = 'check_violation';
    END IF;
    IF g.contexto = 'empresa' THEN
      WITH c AS (
        UPDATE public.lancamentos_financeiros
           SET status = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(), atualizado_por = auth.uid()
         WHERE id_gasto_fixo = g.id AND status = 'pendente' AND excluido_em IS NULL AND data_vencimento >= public.hoje_brasil()
        RETURNING id)
      SELECT coalesce(array_agg(id), '{}') INTO v_ids FROM c;
    ELSE
      WITH c AS (
        UPDATE public.ocorrencias_gastos_plataforma
           SET status = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(), atualizado_em = now()
         WHERE id_gasto_fixo = g.id AND status = 'pendente' AND data_vencimento >= public.hoje_brasil()
        RETURNING id)
      SELECT coalesce(array_agg(id), '{}') INTO v_ids FROM c;
    END IF;
    UPDATE public.gastos_fixos SET situacao = 'pausado', atualizado_por = auth.uid(), atualizado_em = now() WHERE id = g.id;
    INSERT INTO public.historico_gastos_fixos (id_gasto_fixo, acao, dados, id_usuario)
    VALUES (g.id, 'pausado', jsonb_build_object('ocorrencias_canceladas', to_jsonb(v_ids)), auth.uid());

  ELSIF p_acao = 'reativar' THEN
    IF g.situacao <> 'pausado' THEN
      RAISE EXCEPTION 'Só gastos pausados podem ser reativados.' USING ERRCODE = 'check_violation';
    END IF;
    SELECT coalesce(array_agg(x::uuid), '{}') INTO v_ids
      FROM (SELECT dados FROM public.historico_gastos_fixos WHERE id_gasto_fixo = g.id AND acao = 'pausado'
             ORDER BY criado_em DESC LIMIT 1) h,
           jsonb_array_elements_text(h.dados -> 'ocorrencias_canceladas') x;
    IF g.contexto = 'empresa' THEN
      UPDATE public.lancamentos_financeiros
         SET status = 'pendente', cancelado_por = NULL, cancelado_em = NULL, atualizado_por = auth.uid()
       WHERE id = ANY (v_ids) AND id_gasto_fixo = g.id AND status = 'cancelado' AND excluido_em IS NULL
         AND data_vencimento >= public.hoje_brasil();
    ELSE
      UPDATE public.ocorrencias_gastos_plataforma
         SET status = 'pendente', cancelado_por = NULL, cancelado_em = NULL, atualizado_em = now()
       WHERE id = ANY (v_ids) AND id_gasto_fixo = g.id AND status = 'cancelado' AND data_vencimento >= public.hoje_brasil();
    END IF;
    UPDATE public.gastos_fixos SET situacao = 'ativo', atualizado_por = auth.uid(), atualizado_em = now() WHERE id = g.id;
    INSERT INTO public.historico_gastos_fixos (id_gasto_fixo, acao, dados, id_usuario) VALUES (g.id, 'reativado', NULL, auth.uid());
    PERFORM public.gerar_ocorrencias_gasto_fixo(g.id);

  ELSIF p_acao = 'encerrar' THEN
    IF g.situacao = 'encerrado' THEN
      RAISE EXCEPTION 'Este gasto fixo já está encerrado.' USING ERRCODE = 'check_violation';
    END IF;
    v_termino := coalesce(p_data_termino, public.hoje_brasil());
    IF v_termino < g.data_inicio THEN
      RAISE EXCEPTION 'A data de término deve ser igual ou posterior ao início.' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.gastos_fixos
       SET situacao = 'encerrado', data_termino = v_termino, encerrado_em = now(), encerrado_por = auth.uid(),
           atualizado_por = auth.uid(), atualizado_em = now()
     WHERE id = g.id;
    IF g.contexto = 'empresa' THEN
      UPDATE public.lancamentos_financeiros
         SET status = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(), atualizado_por = auth.uid()
       WHERE id_gasto_fixo = g.id AND status = 'pendente' AND excluido_em IS NULL AND data_vencimento > v_termino;
    ELSE
      UPDATE public.ocorrencias_gastos_plataforma
         SET status = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(), atualizado_em = now()
       WHERE id_gasto_fixo = g.id AND status = 'pendente' AND data_vencimento > v_termino;
    END IF;
    INSERT INTO public.historico_gastos_fixos (id_gasto_fixo, acao, dados, id_usuario)
    VALUES (g.id, 'encerrado', jsonb_build_object('data_termino', v_termino), auth.uid());
  ELSE
    RAISE EXCEPTION 'Ação inválida.' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- 7. Ocorrências da plataforma: ajustar (valor variável/vencimento), pagar (integral), estornar, cancelar
CREATE OR REPLACE FUNCTION public.ajustar_ocorrencia_gasto_plataforma(p_id uuid, p_valor numeric, p_data_vencimento date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.ocorrencias_gastos_plataforma;
BEGIN
  IF NOT public.admin_master_ativo() THEN
    RAISE EXCEPTION 'Sem permissão para o financeiro da plataforma.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.ocorrencias_gastos_plataforma WHERE id = p_id FOR UPDATE;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'Ocorrência não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF o.status <> 'pendente' THEN
    RAISE EXCEPTION 'Só ocorrências pendentes podem ser ajustadas. Estorne o pagamento antes.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) OR p_data_vencimento IS NULL THEN
    RAISE EXCEPTION 'Informe valor maior que zero e vencimento.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.ocorrencias_gastos_plataforma SET valor = p_valor, data_vencimento = p_data_vencimento, atualizado_em = now() WHERE id = p_id;
  INSERT INTO public.historico_gastos_fixos (id_gasto_fixo, acao, dados, id_usuario)
  VALUES (o.id_gasto_fixo, 'ocorrencia_ajustada', jsonb_build_object('ocorrencia', o.id, 'valor_anterior', o.valor, 'valor', p_valor,
          'vencimento_anterior', o.data_vencimento, 'vencimento', p_data_vencimento), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_gasto_plataforma(p_id uuid, p_data_pagamento date, p_valor numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.ocorrencias_gastos_plataforma;
BEGIN
  IF NOT public.admin_master_ativo() THEN
    RAISE EXCEPTION 'Sem permissão para o financeiro da plataforma.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.ocorrencias_gastos_plataforma WHERE id = p_id FOR UPDATE;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'Ocorrência não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF o.status = 'pago' THEN
    RAISE EXCEPTION 'Esta ocorrência já está paga.' USING ERRCODE = 'unique_violation';
  END IF;
  IF o.status <> 'pendente' THEN
    RAISE EXCEPTION 'Ocorrência cancelada não pode ser paga.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data_pagamento IS NULL OR p_data_pagamento > public.hoje_brasil() THEN
    RAISE EXCEPTION 'Data de pagamento inválida (não pode ser futura).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_valor IS DISTINCT FROM o.valor THEN
    RAISE EXCEPTION 'Pagamento parcial não é permitido: o valor deve ser igual ao da ocorrência (ajuste o valor antes, se variável).' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.ocorrencias_gastos_plataforma
     SET status = 'pago', data_pagamento = p_data_pagamento, pago_por = auth.uid(), pago_em = now(), atualizado_em = now()
   WHERE id = p_id;
  INSERT INTO public.historico_gastos_fixos (id_gasto_fixo, acao, dados, id_usuario)
  VALUES (o.id_gasto_fixo, 'pagamento', jsonb_build_object('ocorrencia', o.id, 'valor', o.valor, 'data_pagamento', p_data_pagamento), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.estornar_pagamento_gasto_plataforma(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.ocorrencias_gastos_plataforma;
BEGIN
  IF NOT public.admin_master_ativo() THEN
    RAISE EXCEPTION 'Sem permissão para o financeiro da plataforma.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.ocorrencias_gastos_plataforma WHERE id = p_id FOR UPDATE;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'Ocorrência não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF o.status <> 'pago' THEN
    RAISE EXCEPTION 'Só ocorrências pagas podem ser estornadas.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.ocorrencias_gastos_plataforma
     SET status = 'pendente', data_pagamento = NULL, pago_por = NULL, pago_em = NULL, atualizado_em = now()
   WHERE id = p_id;
  INSERT INTO public.historico_gastos_fixos (id_gasto_fixo, acao, dados, id_usuario)
  VALUES (o.id_gasto_fixo, 'estorno', jsonb_build_object('ocorrencia', o.id, 'valor', o.valor, 'data_pagamento', o.data_pagamento,
          'pago_por', o.pago_por), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_ocorrencia_gasto_plataforma(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.ocorrencias_gastos_plataforma;
BEGIN
  IF NOT public.admin_master_ativo() THEN
    RAISE EXCEPTION 'Sem permissão para o financeiro da plataforma.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.ocorrencias_gastos_plataforma WHERE id = p_id FOR UPDATE;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'Ocorrência não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF o.status <> 'pendente' THEN
    RAISE EXCEPTION 'Só ocorrências pendentes podem ser canceladas. Estorne o pagamento antes.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.ocorrencias_gastos_plataforma
     SET status = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(), atualizado_em = now() WHERE id = p_id;
  INSERT INTO public.historico_gastos_fixos (id_gasto_fixo, acao, dados, id_usuario)
  VALUES (o.id_gasto_fixo, 'ocorrencia_cancelada', jsonb_build_object('ocorrencia', o.id, 'valor', o.valor, 'vencimento', o.data_vencimento), auth.uid());
END;
$$;

-- 8. Documentos
CREATE OR REPLACE FUNCTION public.registrar_anexo_gasto_fixo(p_id_gasto uuid, p_caminho text, p_nome_arquivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.gastos_fixos;
  v_obj record;
  v_id uuid;
  v_prefixo text;
BEGIN
  SELECT * INTO g FROM public.gastos_fixos WHERE id = p_id_gasto;
  IF g.id IS NULL OR NOT public.pode_gerenciar_gastos_fixos(g.contexto, g.id_empresa) THEN
    RAISE EXCEPTION 'Gasto fixo não encontrado.' USING ERRCODE = '42501';
  END IF;
  v_prefixo := CASE WHEN g.contexto = 'empresa' THEN g.id_empresa::text ELSE 'plataforma' END || '/gastos-fixos/' || g.id::text || '/';
  IF p_caminho IS NULL OR left(p_caminho, length(v_prefixo)) <> v_prefixo OR position('..' IN p_caminho) > 0 THEN
    RAISE EXCEPTION 'Anexo inválido.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT metadata ->> 'mimetype' AS tipo, (metadata ->> 'size')::integer AS tamanho INTO v_obj
    FROM storage.objects WHERE bucket_id = 'comprovantes-financeiros' AND name = p_caminho;
  IF v_obj.tipo IS NULL THEN
    RAISE EXCEPTION 'Arquivo não encontrado.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.anexos_gastos_fixos (id_gasto_fixo, caminho, nome_arquivo, tipo_mime, tamanho, enviado_por)
  VALUES (g.id, p_caminho, left(coalesce(nullif(btrim(p_nome_arquivo), ''), 'documento'), 200), v_obj.tipo, v_obj.tamanho, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.historico_gastos_fixos (id_gasto_fixo, acao, dados, id_usuario)
  VALUES (g.id, 'anexo_adicionado', jsonb_build_object('anexo', v_id, 'nome', p_nome_arquivo), auth.uid());
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_anexo_gasto_fixo(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.anexos_gastos_fixos;
  g public.gastos_fixos;
BEGIN
  SELECT * INTO a FROM public.anexos_gastos_fixos WHERE id = p_id AND excluido_em IS NULL;
  SELECT * INTO g FROM public.gastos_fixos WHERE id = a.id_gasto_fixo;
  IF a.id IS NULL OR g.id IS NULL OR NOT public.pode_gerenciar_gastos_fixos(g.contexto, g.id_empresa) THEN
    RAISE EXCEPTION 'Anexo não encontrado.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.anexos_gastos_fixos SET excluido_em = now(), excluido_por = auth.uid() WHERE id = p_id;
  INSERT INTO public.historico_gastos_fixos (id_gasto_fixo, acao, dados, id_usuario)
  VALUES (g.id, 'anexo_removido', jsonb_build_object('anexo', a.id, 'nome', a.nome_arquivo), auth.uid());
END;
$$;

-- 9. Leitura: lista com próximo vencimento, ocorrências unificadas e indicadores
CREATE VIEW public.gastos_fixos_resumo WITH (security_invoker = true) AS
SELECT g.id, g.contexto, g.id_empresa, g.nome, g.contraparte, g.id_categoria, c.nome AS categoria_nome, c.cor AS categoria_cor,
       c.icone AS categoria_icone, g.subcategoria, g.tipo_valor, g.valor, g.recorrencia, g.dia_vencimento, g.data_inicio, g.data_termino,
       g.id_conta_financeira, cf.nome AS conta_nome, g.observacoes, g.situacao, g.criado_em, g.atualizado_em, g.encerrado_em,
       CASE WHEN g.situacao = 'ativo' THEN
         (SELECT min(d) FROM public.datas_gasto_fixo(g.recorrencia, g.dia_vencimento, g.data_inicio, g.data_termino,
                                                      public.hoje_brasil(), public.hoje_brasil() + 400) d)
       END AS proximo_vencimento
  FROM public.gastos_fixos g
  JOIN public.categorias_financeiras c ON c.id = g.id_categoria
  LEFT JOIN public.contas_financeiras cf ON cf.id = g.id_conta_financeira;

CREATE VIEW public.ocorrencias_gastos_fixos WITH (security_invoker = true) AS
SELECT l.id, 'empresa'::text AS contexto, l.id_empresa, l.id_gasto_fixo, l.competencia_gasto AS competencia, l.data_vencimento,
       l.valor, l.status,
       CASE WHEN l.status = 'pendente' AND l.data_vencimento < public.hoje_brasil() THEN 'vencido' ELSE l.status END AS situacao,
       l.data_pagamento, l.descricao AS nome
  FROM public.lancamentos_financeiros l
 WHERE l.id_gasto_fixo IS NOT NULL AND l.excluido_em IS NULL
UNION ALL
SELECT o.id, 'plataforma'::text, NULL::uuid, o.id_gasto_fixo, o.competencia, o.data_vencimento, o.valor, o.status,
       CASE WHEN o.status = 'pendente' AND o.data_vencimento < public.hoje_brasil() THEN 'vencido' ELSE o.status END,
       o.data_pagamento, g.nome
  FROM public.ocorrencias_gastos_plataforma o
  JOIN public.gastos_fixos g ON g.id = o.id_gasto_fixo;

-- Indicadores do mês: ocorrências existentes (não canceladas) + previsão das datas ainda não geradas de gastos ativos
CREATE OR REPLACE FUNCTION public.resumo_gastos_fixos(p_contexto text, p_id_empresa uuid, p_mes date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ini date := date_trunc('month', coalesce(p_mes, public.hoje_brasil()))::date;
  v_fim date := (date_trunc('month', coalesce(p_mes, public.hoje_brasil())) + interval '1 month - 1 day')::date;
  v_res jsonb;
BEGIN
  IF NOT public.pode_ver_gastos_fixos(p_contexto, p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para ver estes gastos fixos.' USING ERRCODE = '42501';
  END IF;
  WITH g AS (
    SELECT * FROM public.gastos_fixos WHERE contexto = p_contexto AND id_empresa IS NOT DISTINCT FROM p_id_empresa
  ), occ AS (
    SELECT l.id_gasto_fixo, l.competencia_gasto AS competencia, l.valor, l.status
      FROM public.lancamentos_financeiros l JOIN g ON g.id = l.id_gasto_fixo
     WHERE p_contexto = 'empresa' AND l.excluido_em IS NULL AND l.data_vencimento BETWEEN v_ini AND v_fim
    UNION ALL
    SELECT o.id_gasto_fixo, o.competencia, o.valor, o.status
      FROM public.ocorrencias_gastos_plataforma o JOIN g ON g.id = o.id_gasto_fixo
     WHERE p_contexto = 'plataforma' AND o.data_vencimento BETWEEN v_ini AND v_fim
  ), previstas AS (
    SELECT g.id AS id_gasto_fixo, d AS competencia, g.valor, 'previsto'::text AS status
      FROM g, public.datas_gasto_fixo(g.recorrencia, g.dia_vencimento, g.data_inicio, g.data_termino, v_ini, v_fim) d
     WHERE g.situacao = 'ativo'
       AND NOT EXISTS (SELECT 1 FROM public.lancamentos_financeiros l WHERE l.id_gasto_fixo = g.id AND l.competencia_gasto = d)
       AND NOT EXISTS (SELECT 1 FROM public.ocorrencias_gastos_plataforma o WHERE o.id_gasto_fixo = g.id AND o.competencia = d)
  ), todas AS (
    SELECT * FROM occ WHERE status <> 'cancelado' UNION ALL SELECT * FROM previstas
  )
  SELECT jsonb_build_object(
    'total_mes', coalesce((SELECT sum(valor) FROM todas), 0),
    'gastos_ativos', (SELECT count(*) FROM g WHERE situacao = 'ativo'),
    'gastos_pausados', (SELECT count(*) FROM g WHERE situacao = 'pausado'),
    'pago_mes', coalesce((SELECT sum(valor) FROM todas WHERE status = 'pago'), 0),
    'qtd_pagas', (SELECT count(*) FROM todas WHERE status = 'pago'),
    'pendente_mes', coalesce((SELECT sum(valor) FROM todas WHERE status IN ('pendente', 'previsto')), 0),
    'qtd_pendentes', (SELECT count(*) FROM todas WHERE status IN ('pendente', 'previsto')),
    'por_categoria', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'categoria', c.nome, 'cor', c.cor, 'icone', c.icone, 'valor', x.total) ORDER BY x.total DESC)
        FROM (SELECT g.id_categoria, sum(t.valor) AS total FROM todas t JOIN g ON g.id = t.id_gasto_fixo GROUP BY g.id_categoria) x
        JOIN public.categorias_financeiras c ON c.id = x.id_categoria), '[]'::jsonb)
  ) INTO v_res;
  RETURN v_res;
END;
$$;

-- Prévia dos próximos vencimentos no formulário (mesma regra)
CREATE OR REPLACE FUNCTION public.previa_vencimentos_gasto_fixo(p_recorrencia text, p_dia integer, p_inicio date, p_termino date)
RETURNS SETOF date LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT d FROM public.datas_gasto_fixo(p_recorrencia, CASE WHEN p_recorrencia = 'semanal' THEN NULL ELSE p_dia END, p_inicio, p_termino,
                                        p_inicio, p_inicio + 800) d
   LIMIT 3;
$$;

-- 10. Permissões de execução
REVOKE ALL ON FUNCTION public.gerar_ocorrencias_gasto_fixo(uuid), public.cancelar_ocorrencias_fora_da_agenda(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_master_ativo(), public.pode_ver_gastos_fixos(text, uuid), public.pode_gerenciar_gastos_fixos(text, uuid),
  public.inicializar_categorias_plataforma(), public.salvar_categoria_plataforma(uuid, text, text, text),
  public.gerar_ocorrencias_gastos_fixos(text, uuid),
  public.salvar_gasto_fixo(uuid, text, uuid, text, text, uuid, text, text, numeric, text, integer, date, date, uuid, text),
  public.alterar_situacao_gasto_fixo(uuid, text, date), public.ajustar_ocorrencia_gasto_plataforma(uuid, numeric, date),
  public.registrar_pagamento_gasto_plataforma(uuid, date, numeric), public.estornar_pagamento_gasto_plataforma(uuid),
  public.cancelar_ocorrencia_gasto_plataforma(uuid), public.registrar_anexo_gasto_fixo(uuid, text, text), public.remover_anexo_gasto_fixo(uuid),
  public.resumo_gastos_fixos(text, uuid, date), public.previa_vencimentos_gasto_fixo(text, integer, date, date),
  public.datas_gasto_fixo(text, integer, date, date, date, date), public.fim_janela_gastos_fixos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_master_ativo(), public.pode_ver_gastos_fixos(text, uuid), public.pode_gerenciar_gastos_fixos(text, uuid),
  public.inicializar_categorias_plataforma(), public.salvar_categoria_plataforma(uuid, text, text, text),
  public.gerar_ocorrencias_gastos_fixos(text, uuid),
  public.salvar_gasto_fixo(uuid, text, uuid, text, text, uuid, text, text, numeric, text, integer, date, date, uuid, text),
  public.alterar_situacao_gasto_fixo(uuid, text, date), public.ajustar_ocorrencia_gasto_plataforma(uuid, numeric, date),
  public.registrar_pagamento_gasto_plataforma(uuid, date, numeric), public.estornar_pagamento_gasto_plataforma(uuid),
  public.cancelar_ocorrencia_gasto_plataforma(uuid), public.registrar_anexo_gasto_fixo(uuid, text, text), public.remover_anexo_gasto_fixo(uuid),
  public.resumo_gastos_fixos(text, uuid, date), public.previa_vencimentos_gasto_fixo(text, integer, date, date),
  public.datas_gasto_fixo(text, integer, date, date, date, date), public.fim_janela_gastos_fixos() TO authenticated;
GRANT SELECT ON public.gastos_fixos_resumo, public.ocorrencias_gastos_fixos TO authenticated;
REVOKE ALL ON public.gastos_fixos_resumo, public.ocorrencias_gastos_fixos FROM anon;
