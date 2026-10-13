-- Financeiro — Fase 1 (essencial): categorias, lançamentos (receitas/despesas), baixas, comprovantes, histórico.
-- Regras: CLAUDE.md, seção "Financeiro". Escrita SOMENTE por funções; leitura por RLS.
-- Valores em numeric(14,2) (nunca float). "Vencido" é calculado (não é armazenado).
-- Futuro (não implementado agora): contas financeiras, parcelas, recorrência, conciliação.

-- 0. Permissões financeiras explícitas no vínculo contábil (nada é concedido automaticamente)
DO $$
DECLARE
  v_nome text;
  v_def text;
BEGIN
  SELECT conname INTO v_nome FROM pg_constraint
   WHERE conrelid = 'public.vinculos_contabeis'::regclass AND pg_get_constraintdef(oid) ILIKE '%permissoes <@%';
  IF v_nome IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.vinculos_contabeis DROP CONSTRAINT %I', v_nome);
  END IF;
  -- Vínculo de contador principal deixa de nascer com acesso financeiro.
  v_def := pg_get_functiondef('public.solicitar_vinculo_contabil(uuid,uuid,uuid,text,text[])'::regprocedure);
  IF position('''ver_financeiro'', ' IN v_def) > 0 THEN
    EXECUTE replace(v_def, '''ver_financeiro'', ', '');
  END IF;
END $$;

ALTER TABLE public.vinculos_contabeis ADD CONSTRAINT vinculos_contabeis_permissoes CHECK (
  permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos', 'ver_financeiro', 'gerenciar_obrigacoes',
                      'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro']::text[]);

-- 1. Autorização centralizada (sempre a partir de auth.uid(), nunca do front)
CREATE OR REPLACE FUNCTION public.pode_ver_financeiro(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.e_gestor_empresa(p_id_empresa)
      OR public.contador_pode(p_id_empresa, 'ver_financeiro')
      OR public.contador_pode(p_id_empresa, 'gerenciar_financeiro');
$$;

CREATE OR REPLACE FUNCTION public.pode_gerenciar_financeiro(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.e_gestor_empresa(p_id_empresa) OR public.contador_pode(p_id_empresa, 'gerenciar_financeiro');
$$;

CREATE OR REPLACE FUNCTION public.pode_ver_comprovantes_financeiros(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.e_gestor_empresa(p_id_empresa)
      OR public.contador_pode(p_id_empresa, 'ver_comprovantes_financeiros')
      OR public.contador_pode(p_id_empresa, 'gerenciar_financeiro');
$$;

CREATE OR REPLACE FUNCTION public.pode_exportar_financeiro(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.e_gestor_empresa(p_id_empresa) OR public.contador_pode(p_id_empresa, 'exportar_financeiro');
$$;

-- Data de hoje no fuso de Brasília (vencimentos são datas civis brasileiras)
CREATE OR REPLACE FUNCTION public.hoje_brasil()
RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date; $$;

CREATE OR REPLACE FUNCTION public.uuid_ou_nulo(p_texto text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN p_texto::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- 2. Categorias (por empresa)
CREATE TABLE public.categorias_financeiras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#9ca3af',
  ativa boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categorias_financeiras_tipo CHECK (tipo IN ('receita', 'despesa')),
  CONSTRAINT categorias_financeiras_nome CHECK (char_length(btrim(nome)) BETWEEN 2 AND 60),
  CONSTRAINT categorias_financeiras_cor CHECK (cor ~ '^#[0-9a-fA-F]{6}$')
);
CREATE UNIQUE INDEX categorias_financeiras_nome_unico ON public.categorias_financeiras (id_empresa, tipo, lower(nome));

-- 3. Lançamentos
CREATE TABLE public.lancamentos_financeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  descricao text NOT NULL,
  valor numeric(14, 2) NOT NULL,
  id_categoria uuid NOT NULL REFERENCES public.categorias_financeiras(id) ON DELETE RESTRICT,
  data_competencia date NOT NULL,
  data_vencimento date,
  data_pagamento date,
  status text NOT NULL DEFAULT 'pendente',
  contraparte text,
  observacoes text,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  baixado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  baixado_em timestamptz,
  cancelado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  cancelado_em timestamptz,
  excluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  excluido_em timestamptz,
  CONSTRAINT lancamentos_financeiros_tipo CHECK (tipo IN ('receita', 'despesa')),
  CONSTRAINT lancamentos_financeiros_status CHECK (status IN ('pendente', 'pago', 'cancelado')),
  CONSTRAINT lancamentos_financeiros_descricao CHECK (char_length(btrim(descricao)) BETWEEN 2 AND 200),
  CONSTRAINT lancamentos_financeiros_valor CHECK (valor > 0 AND valor <= 999999999999.99),
  CONSTRAINT lancamentos_financeiros_pago_tem_data CHECK ((status = 'pago') = (data_pagamento IS NOT NULL)),
  CONSTRAINT lancamentos_financeiros_pendente_tem_vencimento CHECK (status <> 'pendente' OR data_vencimento IS NOT NULL),
  CONSTRAINT lancamentos_financeiros_datas CHECK (
    data_competencia BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
    AND (data_vencimento IS NULL OR data_vencimento BETWEEN DATE '2000-01-01' AND DATE '2100-12-31')
    AND (data_pagamento IS NULL OR data_pagamento BETWEEN DATE '2000-01-01' AND DATE '2100-12-31')),
  CONSTRAINT lancamentos_financeiros_contraparte CHECK (contraparte IS NULL OR char_length(contraparte) <= 120),
  CONSTRAINT lancamentos_financeiros_observacoes CHECK (observacoes IS NULL OR char_length(observacoes) <= 1000)
);
CREATE INDEX idx_lancamentos_empresa_pagamento ON public.lancamentos_financeiros (id_empresa, data_pagamento) WHERE excluido_em IS NULL AND status = 'pago';
CREATE INDEX idx_lancamentos_empresa_vencimento ON public.lancamentos_financeiros (id_empresa, data_vencimento) WHERE excluido_em IS NULL AND status = 'pendente';
CREATE INDEX idx_lancamentos_empresa_competencia ON public.lancamentos_financeiros (id_empresa, data_competencia) WHERE excluido_em IS NULL;
CREATE INDEX idx_lancamentos_categoria ON public.lancamentos_financeiros (id_categoria);

-- 4. Comprovantes
CREATE TABLE public.anexos_financeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_lancamento uuid NOT NULL REFERENCES public.lancamentos_financeiros(id) ON DELETE RESTRICT,
  caminho text NOT NULL UNIQUE,
  nome_arquivo text NOT NULL,
  tipo_mime text NOT NULL,
  tamanho integer NOT NULL,
  enviado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  excluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  excluido_em timestamptz,
  CONSTRAINT anexos_financeiros_tipo CHECK (tipo_mime IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT anexos_financeiros_tamanho CHECK (tamanho > 0 AND tamanho <= 10485760),
  CONSTRAINT anexos_financeiros_nome CHECK (char_length(nome_arquivo) BETWEEN 1 AND 200)
);
CREATE INDEX idx_anexos_lancamento ON public.anexos_financeiros (id_lancamento) WHERE excluido_em IS NULL;

-- 5. Histórico de ações (gravado por gatilho/funções; somente leitura para quem vê o financeiro)
CREATE TABLE public.historico_lancamentos_financeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_lancamento uuid NOT NULL REFERENCES public.lancamentos_financeiros(id) ON DELETE RESTRICT,
  acao text NOT NULL,
  dados_anteriores jsonb,
  dados_novos jsonb,
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historico_financeiro_acao CHECK (acao IN ('criado', 'editado', 'baixado', 'estornado', 'cancelado', 'excluido', 'anexo_adicionado', 'anexo_removido'))
);
CREATE INDEX idx_historico_financeiro_lancamento ON public.historico_lancamentos_financeiros (id_lancamento, criado_em);

-- 6. Integridade: categoria da mesma empresa e do mesmo tipo; empresa e tipo imutáveis
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
    IF v_cat.id IS NULL OR v_cat.id_empresa <> NEW.id_empresa OR v_cat.tipo <> NEW.tipo THEN
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
CREATE TRIGGER validar_lancamento_financeiro BEFORE INSERT OR UPDATE ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.validar_lancamento_financeiro();

CREATE OR REPLACE FUNCTION public.registrar_historico_financeiro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acao text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'criado';
  ELSIF NEW.excluido_em IS NOT NULL AND OLD.excluido_em IS NULL THEN
    v_acao := 'excluido';
  ELSIF NEW.status = 'pago' AND OLD.status = 'pendente' THEN
    v_acao := 'baixado';
  ELSIF NEW.status = 'pendente' AND OLD.status = 'pago' THEN
    v_acao := 'estornado';
  ELSIF NEW.status = 'cancelado' AND OLD.status <> 'cancelado' THEN
    v_acao := 'cancelado';
  ELSE
    v_acao := 'editado';
  END IF;
  INSERT INTO public.historico_lancamentos_financeiros (id_empresa, id_lancamento, acao, dados_anteriores, dados_novos, id_usuario)
  VALUES (NEW.id_empresa, NEW.id, v_acao, CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, to_jsonb(NEW), auth.uid());
  RETURN NEW;
END;
$$;
CREATE TRIGGER registrar_historico_financeiro AFTER INSERT OR UPDATE ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.registrar_historico_financeiro();

-- 7. RLS: leitura por empresa e permissão; nenhuma escrita direta
ALTER TABLE public.categorias_financeiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos_financeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anexos_financeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_lancamentos_financeiros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.categorias_financeiras, public.lancamentos_financeiros, public.anexos_financeiros,
              public.historico_lancamentos_financeiros FROM anon, authenticated;
GRANT SELECT ON public.categorias_financeiras, public.lancamentos_financeiros, public.anexos_financeiros,
                public.historico_lancamentos_financeiros TO authenticated;

CREATE POLICY "Financeiro: categorias da empresa" ON public.categorias_financeiras FOR SELECT TO authenticated
  USING (public.pode_ver_financeiro(id_empresa));
CREATE POLICY "Financeiro: lançamentos da empresa" ON public.lancamentos_financeiros FOR SELECT TO authenticated
  USING (excluido_em IS NULL AND public.pode_ver_financeiro(id_empresa));
CREATE POLICY "Financeiro: comprovantes da empresa" ON public.anexos_financeiros FOR SELECT TO authenticated
  USING (excluido_em IS NULL AND public.pode_ver_comprovantes_financeiros(id_empresa));
CREATE POLICY "Financeiro: histórico da empresa" ON public.historico_lancamentos_financeiros FOR SELECT TO authenticated
  USING (public.pode_ver_financeiro(id_empresa));

-- Visão com a situação calculada (vencido) — respeita o RLS de quem consulta
CREATE VIEW public.lancamentos_financeiros_situacao WITH (security_invoker = true) AS
SELECT l.id, l.id_empresa, l.tipo, l.descricao, l.valor, l.id_categoria, c.nome AS categoria_nome, c.cor AS categoria_cor,
       l.data_competencia, l.data_vencimento, l.data_pagamento, l.status,
       CASE WHEN l.status = 'pendente' AND l.data_vencimento < public.hoje_brasil() THEN 'vencido' ELSE l.status END AS situacao,
       l.contraparte, l.observacoes, l.criado_em, l.atualizado_em, l.baixado_em, l.baixado_por,
       (SELECT count(*) FROM public.anexos_financeiros a WHERE a.id_lancamento = l.id AND a.excluido_em IS NULL) AS qtd_anexos
  FROM public.lancamentos_financeiros l
  JOIN public.categorias_financeiras c ON c.id = l.id_categoria
 WHERE l.excluido_em IS NULL;
REVOKE ALL ON public.lancamentos_financeiros_situacao FROM anon, authenticated;
GRANT SELECT ON public.lancamentos_financeiros_situacao TO authenticated;

-- 8. Categorias: modelos iniciais (idempotente) e gestão
CREATE OR REPLACE FUNCTION public.inicializar_categorias_financeiras(p_id_empresa uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inseridas integer;
BEGIN
  IF NOT public.pode_gerenciar_financeiro(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para configurar o financeiro desta empresa.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.categorias_financeiras (id_empresa, tipo, nome, cor, criado_por)
  SELECT p_id_empresa, m.tipo, m.nome, m.cor, auth.uid()
    FROM (VALUES
      ('receita', 'Venda de produtos', '#16a34a'), ('receita', 'Prestação de serviços', '#0d9488'),
      ('receita', 'Outras receitas', '#65a30d'),
      ('despesa', 'Aluguel', '#ef4444'), ('despesa', 'Energia', '#f59e0b'), ('despesa', 'Internet', '#3b82f6'),
      ('despesa', 'Salários', '#8b5cf6'), ('despesa', 'Impostos', '#dc2626'), ('despesa', 'Fornecedores', '#0ea5e9'),
      ('despesa', 'Marketing', '#ec4899'), ('despesa', 'Outras despesas', '#9ca3af')
    ) AS m(tipo, nome, cor)
  ON CONFLICT (id_empresa, tipo, lower(nome)) DO NOTHING;
  GET DIAGNOSTICS v_inseridas = ROW_COUNT;
  RETURN v_inseridas;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_categoria_financeira(p_id uuid, p_id_empresa uuid, p_tipo text, p_nome text, p_cor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_empresa uuid;
BEGIN
  IF p_id IS NULL THEN
    IF NOT public.pode_gerenciar_financeiro(p_id_empresa) THEN
      RAISE EXCEPTION 'Sem permissão para gerenciar categorias desta empresa.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.categorias_financeiras (id_empresa, tipo, nome, cor, criado_por)
    VALUES (p_id_empresa, p_tipo, btrim(p_nome), coalesce(p_cor, '#9ca3af'), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    SELECT id_empresa INTO v_empresa FROM public.categorias_financeiras WHERE id = p_id;
    IF v_empresa IS NULL OR NOT public.pode_gerenciar_financeiro(v_empresa) THEN
      RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.categorias_financeiras SET nome = btrim(p_nome), cor = coalesce(p_cor, cor), atualizado_em = now()
     WHERE id = p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'Já existe uma categoria com este nome.' USING ERRCODE = 'unique_violation';
  WHEN check_violation THEN RAISE EXCEPTION 'Nome da categoria inválido (2 a 60 caracteres).' USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION public.definir_categoria_financeira_ativa(p_id uuid, p_ativa boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT id_empresa INTO v_empresa FROM public.categorias_financeiras WHERE id = p_id;
  IF v_empresa IS NULL OR NOT public.pode_gerenciar_financeiro(v_empresa) THEN
    RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.categorias_financeiras SET ativa = p_ativa, atualizado_em = now() WHERE id = p_id;
END;
$$;

-- 9. Lançamentos: criar/editar, baixa, estorno, cancelamento, exclusão lógica
CREATE OR REPLACE FUNCTION public.salvar_lancamento_financeiro(
  p_id uuid, p_id_empresa uuid, p_tipo text, p_descricao text, p_valor numeric, p_id_categoria uuid,
  p_data_competencia date, p_data_vencimento date, p_data_pagamento date, p_contraparte text, p_observacoes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_atual public.lancamentos_financeiros;
  v_id uuid;
  v_restricao text;
BEGIN
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) THEN
    RAISE EXCEPTION 'Informe um valor maior que zero, com até 2 casas decimais.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data_competencia IS NULL THEN
    RAISE EXCEPTION 'Informe a data de competência.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_id IS NULL THEN
    IF NOT public.pode_gerenciar_financeiro(p_id_empresa) THEN
      RAISE EXCEPTION 'Sem permissão para lançar no financeiro desta empresa.' USING ERRCODE = '42501';
    END IF;
    IF p_data_pagamento IS NULL AND p_data_vencimento IS NULL THEN
      RAISE EXCEPTION 'Informe o vencimento ou a data de pagamento.' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.lancamentos_financeiros (id_empresa, tipo, descricao, valor, id_categoria, data_competencia, data_vencimento,
                                                data_pagamento, status, contraparte, observacoes, criado_por, atualizado_por,
                                                baixado_por, baixado_em)
    VALUES (p_id_empresa, p_tipo, coalesce(p_descricao, ''), p_valor, p_id_categoria, p_data_competencia, p_data_vencimento,
            p_data_pagamento, CASE WHEN p_data_pagamento IS NULL THEN 'pendente' ELSE 'pago' END, p_contraparte, p_observacoes,
            auth.uid(), auth.uid(),
            CASE WHEN p_data_pagamento IS NULL THEN NULL ELSE auth.uid() END, CASE WHEN p_data_pagamento IS NULL THEN NULL ELSE now() END)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  SELECT * INTO v_atual FROM public.lancamentos_financeiros WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF v_atual.id IS NULL OR NOT public.pode_gerenciar_financeiro(v_atual.id_empresa) THEN
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF v_atual.status = 'cancelado' THEN
    RAISE EXCEPTION 'Lançamentos cancelados não podem ser editados.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_atual.status = 'pendente' AND p_data_pagamento IS NOT NULL THEN
    RAISE EXCEPTION 'Para marcar como pago, use "Registrar pagamento".' USING ERRCODE = 'check_violation';
  END IF;
  IF v_atual.status = 'pago' AND p_data_pagamento IS NULL THEN
    RAISE EXCEPTION 'Para desfazer o pagamento, use "Estornar".' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.lancamentos_financeiros
     SET descricao = coalesce(p_descricao, ''), valor = p_valor, id_categoria = p_id_categoria,
         data_competencia = p_data_competencia, data_vencimento = p_data_vencimento, data_pagamento = p_data_pagamento,
         contraparte = p_contraparte, observacoes = p_observacoes, atualizado_por = auth.uid()
   WHERE id = p_id;
  RETURN p_id;
EXCEPTION
  WHEN check_violation THEN
    -- Mensagens nossas passam como estão; violação de restrição da tabela vira mensagem amigável.
    GET STACKED DIAGNOSTICS v_restricao = CONSTRAINT_NAME;
    IF coalesce(v_restricao, '') = '' THEN RAISE; END IF;
    RAISE EXCEPTION 'Dados inválidos: confira descrição, valor e datas.' USING ERRCODE = 'check_violation';
END;
$$;

-- Baixa atômica: só um pedido consegue baixar (UPDATE condicional), mesmo com cliques repetidos ou concorrência.
CREATE OR REPLACE FUNCTION public.registrar_baixa_lancamento(p_id uuid, p_data_pagamento date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa uuid;
  v_status text;
BEGIN
  IF p_data_pagamento IS NULL OR p_data_pagamento NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' THEN
    RAISE EXCEPTION 'Informe uma data de pagamento válida.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT id_empresa, status INTO v_empresa, v_status FROM public.lancamentos_financeiros WHERE id = p_id AND excluido_em IS NULL;
  IF v_empresa IS NULL OR NOT public.pode_gerenciar_financeiro(v_empresa) THEN
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.lancamentos_financeiros
     SET status = 'pago', data_pagamento = p_data_pagamento, baixado_por = auth.uid(), baixado_em = now(), atualizado_por = auth.uid()
   WHERE id = p_id AND status = 'pendente' AND excluido_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este lançamento já foi baixado ou não está pendente.' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.estornar_baixa_lancamento(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT id_empresa INTO v_empresa FROM public.lancamentos_financeiros WHERE id = p_id AND excluido_em IS NULL;
  IF v_empresa IS NULL OR NOT public.pode_gerenciar_financeiro(v_empresa) THEN
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.lancamentos_financeiros
     SET status = 'pendente', data_vencimento = coalesce(data_vencimento, data_pagamento), data_pagamento = NULL,
         baixado_por = NULL, baixado_em = NULL, atualizado_por = auth.uid()
   WHERE id = p_id AND status = 'pago' AND excluido_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Só lançamentos pagos podem ser estornados.' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_lancamento_financeiro(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT id_empresa INTO v_empresa FROM public.lancamentos_financeiros WHERE id = p_id AND excluido_em IS NULL;
  IF v_empresa IS NULL OR NOT public.pode_gerenciar_financeiro(v_empresa) THEN
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.lancamentos_financeiros
     SET status = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(), atualizado_por = auth.uid()
   WHERE id = p_id AND status = 'pendente' AND excluido_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Só lançamentos pendentes podem ser cancelados. Estorne o pagamento antes.' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_lancamento_financeiro(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT id_empresa INTO v_empresa FROM public.lancamentos_financeiros WHERE id = p_id AND excluido_em IS NULL;
  IF v_empresa IS NULL OR NOT public.pode_gerenciar_financeiro(v_empresa) THEN
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.lancamentos_financeiros SET excluido_em = now(), excluido_por = auth.uid(), atualizado_por = auth.uid()
   WHERE id = p_id AND excluido_em IS NULL;
END;
$$;

-- 10. Comprovantes (Storage privado; caminho <id_empresa>/<id_lancamento>/<arquivo>)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('comprovantes-financeiros', 'comprovantes-financeiros', false, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Comprovantes financeiros: leitura autorizada" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'comprovantes-financeiros'
         AND public.pode_ver_comprovantes_financeiros(public.uuid_ou_nulo((storage.foldername(name))[1])));
CREATE POLICY "Comprovantes financeiros: envio autorizado" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprovantes-financeiros'
              AND public.pode_gerenciar_financeiro(public.uuid_ou_nulo((storage.foldername(name))[1]))
              AND EXISTS (SELECT 1 FROM public.lancamentos_financeiros l
                           WHERE l.id = public.uuid_ou_nulo((storage.foldername(name))[2])
                             AND l.id_empresa = public.uuid_ou_nulo((storage.foldername(name))[1])
                             AND l.excluido_em IS NULL));
CREATE POLICY "Comprovantes financeiros: remoção autorizada" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'comprovantes-financeiros'
         AND public.pode_gerenciar_financeiro(public.uuid_ou_nulo((storage.foldername(name))[1])));

CREATE OR REPLACE FUNCTION public.registrar_anexo_financeiro(p_id_lancamento uuid, p_caminho text, p_nome_arquivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lanc public.lancamentos_financeiros;
  v_obj record;
  v_id uuid;
BEGIN
  SELECT * INTO v_lanc FROM public.lancamentos_financeiros WHERE id = p_id_lancamento AND excluido_em IS NULL;
  IF v_lanc.id IS NULL OR NOT public.pode_gerenciar_financeiro(v_lanc.id_empresa) THEN
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF p_caminho IS NULL OR p_caminho NOT LIKE v_lanc.id_empresa::text || '/' || v_lanc.id::text || '/%' THEN
    RAISE EXCEPTION 'Comprovante inválido.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT (o.metadata->>'size')::integer AS tamanho, o.metadata->>'mimetype' AS tipo INTO v_obj
    FROM storage.objects o WHERE o.bucket_id = 'comprovantes-financeiros' AND o.name = p_caminho;
  IF v_obj.tamanho IS NULL THEN
    RAISE EXCEPTION 'Arquivo não encontrado.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.anexos_financeiros (id_empresa, id_lancamento, caminho, nome_arquivo, tipo_mime, tamanho, enviado_por)
  VALUES (v_lanc.id_empresa, v_lanc.id, p_caminho, left(coalesce(nullif(btrim(p_nome_arquivo), ''), 'comprovante'), 200),
          v_obj.tipo, v_obj.tamanho, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.historico_lancamentos_financeiros (id_empresa, id_lancamento, acao, dados_novos, id_usuario)
  VALUES (v_lanc.id_empresa, v_lanc.id, 'anexo_adicionado', jsonb_build_object('arquivo', p_nome_arquivo), auth.uid());
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_anexo_financeiro(p_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_anexo public.anexos_financeiros;
BEGIN
  SELECT * INTO v_anexo FROM public.anexos_financeiros WHERE id = p_id AND excluido_em IS NULL;
  IF v_anexo.id IS NULL OR NOT public.pode_gerenciar_financeiro(v_anexo.id_empresa) THEN
    RAISE EXCEPTION 'Comprovante não encontrado.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.anexos_financeiros SET excluido_em = now(), excluido_por = auth.uid() WHERE id = p_id;
  INSERT INTO public.historico_lancamentos_financeiros (id_empresa, id_lancamento, acao, dados_anteriores, id_usuario)
  VALUES (v_anexo.id_empresa, v_anexo.id_lancamento, 'anexo_removido', jsonb_build_object('arquivo', v_anexo.nome_arquivo), auth.uid());
  RETURN v_anexo.caminho;
END;
$$;

-- 11. Indicadores: regra de cálculo ÚNICA (o painel não soma nada no navegador)
--  - Receitas/despesas do mês: somente PAGOS, pela data de pagamento.
--  - Saldo: acumulado das movimentações pagas até o fim do período (não é saldo bancário).
--  - Contas a vencer: despesas pendentes com vencimento de hoje até +30 dias.
CREATE OR REPLACE FUNCTION public.resumo_financeiro(p_id_empresa uuid, p_mes date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inicio date := date_trunc('month', coalesce(p_mes, public.hoje_brasil()))::date;
  v_fim date := (date_trunc('month', coalesce(p_mes, public.hoje_brasil())) + interval '1 month - 1 day')::date;
  v_ini_ant date := (date_trunc('month', coalesce(p_mes, public.hoje_brasil())) - interval '1 month')::date;
  v_hoje date := public.hoje_brasil();
BEGIN
  IF NOT public.pode_ver_financeiro(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para ver o financeiro desta empresa.' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH base AS (
      SELECT tipo, valor, status, data_pagamento, data_vencimento, id_categoria
        FROM public.lancamentos_financeiros
       WHERE id_empresa = p_id_empresa AND excluido_em IS NULL
    )
    SELECT jsonb_build_object(
      'periodo_inicio', v_inicio, 'periodo_fim', v_fim, 'hoje', v_hoje,
      'receitas_mes', coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'pago' AND data_pagamento BETWEEN v_inicio AND v_fim), 0),
      'despesas_mes', coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'pago' AND data_pagamento BETWEEN v_inicio AND v_fim), 0),
      'receitas_mes_anterior', coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'pago' AND data_pagamento BETWEEN v_ini_ant AND v_inicio - 1), 0),
      'despesas_mes_anterior', coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'pago' AND data_pagamento BETWEEN v_ini_ant AND v_inicio - 1), 0),
      'saldo_acumulado', coalesce(sum(CASE WHEN tipo = 'receita' THEN valor ELSE -valor END) FILTER (WHERE status = 'pago' AND data_pagamento <= v_fim), 0),
      'a_pagar_30_valor', coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'pendente' AND data_vencimento BETWEEN v_hoje AND v_hoje + 30), 0),
      'a_pagar_30_qtd', count(*) FILTER (WHERE tipo = 'despesa' AND status = 'pendente' AND data_vencimento BETWEEN v_hoje AND v_hoje + 30),
      'a_pagar_vencidas_qtd', count(*) FILTER (WHERE tipo = 'despesa' AND status = 'pendente' AND data_vencimento < v_hoje),
      'a_receber_vencidas_qtd', count(*) FILTER (WHERE tipo = 'receita' AND status = 'pendente' AND data_vencimento < v_hoje),
      'tem_lancamentos', count(*) > 0,
      'serie', (
        SELECT jsonb_agg(jsonb_build_object(
                 'mes', m.mes,
                 'receitas', coalesce((SELECT sum(b.valor) FROM base b WHERE b.tipo = 'receita' AND b.status = 'pago'
                                        AND b.data_pagamento BETWEEN m.mes AND (m.mes + interval '1 month - 1 day')::date), 0),
                 'despesas', coalesce((SELECT sum(b.valor) FROM base b WHERE b.tipo = 'despesa' AND b.status = 'pago'
                                        AND b.data_pagamento BETWEEN m.mes AND (m.mes + interval '1 month - 1 day')::date), 0))
               ORDER BY m.mes)
          FROM (SELECT (v_inicio - make_interval(months => g))::date AS mes FROM generate_series(0, 5) g) m
      ),
      'despesas_por_categoria', coalesce((
        SELECT jsonb_agg(jsonb_build_object('categoria', c.nome, 'cor', c.cor, 'valor', t.total) ORDER BY t.total DESC)
          FROM (SELECT b.id_categoria, sum(b.valor) AS total FROM base b
                 WHERE b.tipo = 'despesa' AND b.status = 'pago' AND b.data_pagamento BETWEEN v_inicio AND v_fim
                 GROUP BY b.id_categoria) t
          JOIN public.categorias_financeiras c ON c.id = t.id_categoria), '[]'::jsonb)
    )
    FROM base
  );
END;
$$;

-- 12. Permissões de execução
REVOKE ALL ON FUNCTION public.pode_ver_financeiro(uuid), public.pode_gerenciar_financeiro(uuid),
  public.pode_ver_comprovantes_financeiros(uuid), public.pode_exportar_financeiro(uuid),
  public.validar_lancamento_financeiro(), public.registrar_historico_financeiro(),
  public.inicializar_categorias_financeiras(uuid), public.salvar_categoria_financeira(uuid, uuid, text, text, text),
  public.definir_categoria_financeira_ativa(uuid, boolean),
  public.salvar_lancamento_financeiro(uuid, uuid, text, text, numeric, uuid, date, date, date, text, text),
  public.registrar_baixa_lancamento(uuid, date), public.estornar_baixa_lancamento(uuid),
  public.cancelar_lancamento_financeiro(uuid), public.excluir_lancamento_financeiro(uuid),
  public.registrar_anexo_financeiro(uuid, text, text), public.remover_anexo_financeiro(uuid),
  public.resumo_financeiro(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validar_lancamento_financeiro(), public.registrar_historico_financeiro() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pode_ver_financeiro(uuid), public.pode_gerenciar_financeiro(uuid),
  public.pode_ver_comprovantes_financeiros(uuid), public.pode_exportar_financeiro(uuid),
  public.inicializar_categorias_financeiras(uuid), public.salvar_categoria_financeira(uuid, uuid, text, text, text),
  public.definir_categoria_financeira_ativa(uuid, boolean),
  public.salvar_lancamento_financeiro(uuid, uuid, text, text, numeric, uuid, date, date, date, text, text),
  public.registrar_baixa_lancamento(uuid, date), public.estornar_baixa_lancamento(uuid),
  public.cancelar_lancamento_financeiro(uuid), public.excluir_lancamento_financeiro(uuid),
  public.registrar_anexo_financeiro(uuid, text, text), public.remover_anexo_financeiro(uuid),
  public.resumo_financeiro(uuid, date) TO authenticated;
