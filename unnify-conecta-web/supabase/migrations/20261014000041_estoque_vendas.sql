-- Estoque + Vendas (integrados). Sem sistema financeiro paralelo: cada venda confirmada gera UMA receita no Financeiro
-- (lancamentos_financeiros.id_venda) e recebimentos usam a mesma baixa do Financeiro (conta, saldo, movimentação).
--   Estoque: saldo só muda por movimentação registrada (entrada/saída/ajuste/venda/estorno), com produto travado (FOR UPDATE);
--            sem estoque negativo; serviços não têm saldo. SKU único por empresa. Inativar preserva histórico.
--   Vendas : rascunho (sem efeitos) → confirmada (baixa de estoque + receita pendente, ATÔMICO) → recebimento à parte
--            (integral/parcial). Situação "aguardando pagamento"/"concluída" é CALCULADA dos lançamentos (sincroniza com o
--            Financeiro). Cancelamento devolve o estoque com estorno (histórico mantido) e cancela pendências; se já houver
--            recebimento, recusa até o estorno no Financeiro (não apaga dinheiro que entrou). Repetição com a mesma chave
--            de idempotência devolve o resultado anterior sem duplicar nada.
-- Acesso: dono/sócio opera; contador com vínculo ATIVO e "Ver/Gerenciar financeiro" só lê. Admin Master sem acesso automático.
-- Depende de 039 (clientes, id_cliente). Reversão: rollback/20261014000041_estoque_vendas_reverter.sql

CREATE OR REPLACE FUNCTION public.pode_ver_comercial(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.e_gestor_empresa(p_id_empresa) OR public.pode_ver_financeiro(p_id_empresa);
$$;
CREATE OR REPLACE FUNCTION public.pode_operar_comercial(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.e_gestor_empresa(p_id_empresa);
$$;

-- ===== Produtos e serviços =====
CREATE TABLE public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  tipo text NOT NULL DEFAULT 'produto',
  nome text NOT NULL,
  descricao text,
  sku text,
  codigo_barras text,
  categoria text,
  unidade text NOT NULL DEFAULT 'un',
  custo numeric(14, 2) NOT NULL DEFAULT 0,
  preco_venda numeric(14, 2) NOT NULL DEFAULT 0,
  estoque_atual numeric(14, 3) NOT NULL DEFAULT 0,
  estoque_minimo numeric(14, 3) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativo',
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT produtos_tipo CHECK (tipo IN ('produto', 'servico')),
  CONSTRAINT produtos_status CHECK (status IN ('ativo', 'inativo')),
  CONSTRAINT produtos_nome CHECK (char_length(btrim(nome)) BETWEEN 2 AND 150),
  CONSTRAINT produtos_textos CHECK ((descricao IS NULL OR char_length(descricao) <= 2000) AND (sku IS NULL OR char_length(sku) BETWEEN 1 AND 60)
                                    AND (codigo_barras IS NULL OR codigo_barras ~ '^[0-9]{6,20}$') AND (categoria IS NULL OR char_length(categoria) <= 60)
                                    AND char_length(unidade) BETWEEN 1 AND 10),
  CONSTRAINT produtos_valores CHECK (custo >= 0 AND preco_venda >= 0 AND custo <= 999999999.99 AND preco_venda <= 999999999.99),
  CONSTRAINT produtos_estoque CHECK (estoque_atual >= 0 AND estoque_minimo >= 0),
  CONSTRAINT produtos_servico_sem_estoque CHECK (tipo = 'produto' OR (estoque_atual = 0 AND estoque_minimo = 0))
);
CREATE UNIQUE INDEX produtos_sku_unico ON public.produtos (id_empresa, lower(sku)) WHERE sku IS NOT NULL;
CREATE INDEX idx_produtos_empresa ON public.produtos (id_empresa, status, lower(nome));

CREATE TABLE public.historico_produtos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_produto uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  acao text NOT NULL CHECK (acao IN ('criado', 'editado', 'preco', 'status')),
  dados jsonb,
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_historico_produtos ON public.historico_produtos (id_produto, criado_em DESC);

-- ===== Vendas =====
CREATE TABLE public.vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  numero integer NOT NULL,
  id_cliente uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'rascunho',
  condicao text NOT NULL DEFAULT 'a_vista',
  forma_pagamento text NOT NULL DEFAULT 'pix',
  subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  desconto numeric(14, 2) NOT NULL DEFAULT 0,
  total numeric(14, 2) NOT NULL DEFAULT 0,
  data_venda date NOT NULL,
  vencimento date,
  observacoes text,
  chave_idempotencia uuid,
  confirmada_em timestamptz,
  cancelada_em timestamptz,
  cancelada_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  motivo_cancelamento text,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendas_status CHECK (status IN ('rascunho', 'confirmada', 'cancelada')),
  CONSTRAINT vendas_condicao CHECK (condicao IN ('a_vista', 'a_prazo')),
  CONSTRAINT vendas_forma CHECK (forma_pagamento IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'outro')),
  CONSTRAINT vendas_valores CHECK (subtotal >= 0 AND desconto >= 0 AND desconto <= subtotal AND total = subtotal - desconto),
  CONSTRAINT vendas_textos CHECK ((observacoes IS NULL OR char_length(observacoes) <= 1000) AND (motivo_cancelamento IS NULL OR char_length(motivo_cancelamento) <= 500)),
  CONSTRAINT vendas_numero_unico UNIQUE (id_empresa, numero)
);
CREATE UNIQUE INDEX vendas_idempotencia ON public.vendas (id_empresa, chave_idempotencia) WHERE chave_idempotencia IS NOT NULL;
CREATE INDEX idx_vendas_empresa ON public.vendas (id_empresa, data_venda DESC);
CREATE INDEX idx_vendas_cliente ON public.vendas (id_cliente) WHERE id_cliente IS NOT NULL;

CREATE TABLE public.itens_venda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_venda uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  id_produto uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  descricao text NOT NULL,
  quantidade numeric(14, 3) NOT NULL CHECK (quantidade > 0),
  preco_unitario numeric(14, 2) NOT NULL CHECK (preco_unitario >= 0),
  desconto numeric(14, 2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  total numeric(14, 2) NOT NULL CHECK (total >= 0)
);
CREATE INDEX idx_itens_venda ON public.itens_venda (id_venda);

CREATE TABLE public.historico_vendas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_venda uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  acao text NOT NULL CHECK (acao IN ('rascunho', 'confirmada', 'recebimento', 'cancelada')),
  dados jsonb,
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_historico_vendas ON public.historico_vendas (id_venda, criado_em);

-- ===== Movimentações de estoque (única forma de alterar saldo) =====
CREATE TABLE public.movimentacoes_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_produto uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste', 'venda', 'estorno_venda')),
  quantidade numeric(14, 3) NOT NULL CHECK (quantidade <> 0),
  saldo_apos numeric(14, 3) NOT NULL CHECK (saldo_apos >= 0),
  motivo text CHECK (motivo IS NULL OR char_length(motivo) <= 300),
  id_venda uuid REFERENCES public.vendas(id) ON DELETE RESTRICT,
  chave_idempotencia uuid,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX movimentacoes_estoque_idempotencia ON public.movimentacoes_estoque (id_empresa, chave_idempotencia) WHERE chave_idempotencia IS NOT NULL;
CREATE INDEX idx_movimentacoes_estoque ON public.movimentacoes_estoque (id_produto, criado_em DESC);

-- Saldo nunca muda "por fora" (defesa extra além da ausência de escrita direta)
CREATE OR REPLACE FUNCTION public.proteger_saldo_produto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estoque_atual IS DISTINCT FROM OLD.estoque_atual AND coalesce(current_setting('unnify.operacao_estoque', true), '') <> 'sim' THEN
    RAISE EXCEPTION 'O saldo de estoque só muda por movimentação registrada.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proteger_saldo_produto BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.proteger_saldo_produto();

-- ===== Integração com o Financeiro =====
ALTER TABLE public.lancamentos_financeiros ADD COLUMN id_venda uuid REFERENCES public.vendas(id) ON DELETE RESTRICT;
CREATE INDEX idx_lancamentos_venda ON public.lancamentos_financeiros (id_venda) WHERE id_venda IS NOT NULL;
CREATE OR REPLACE FUNCTION public.proteger_lancamento_venda()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.id_venda IS NULL OR coalesce(current_setting('unnify.operacao_venda', true), '') = 'sim' THEN RETURN NEW; END IF;
  IF NEW.id_venda IS DISTINCT FROM OLD.id_venda OR NEW.valor IS DISTINCT FROM OLD.valor OR NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento
     OR NEW.id_categoria IS DISTINCT FROM OLD.id_categoria OR NEW.natureza_financeira IS DISTINCT FROM OLD.natureza_financeira OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR (NEW.status = 'cancelado' AND OLD.status <> 'cancelado') OR (NEW.excluido_em IS NOT NULL AND OLD.excluido_em IS NULL) THEN
    RAISE EXCEPTION 'Este lançamento pertence a uma venda: altere valores, recebimentos parciais e cancelamento em Vendas.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proteger_lancamento_venda BEFORE UPDATE ON public.lancamentos_financeiros FOR EACH ROW EXECUTE FUNCTION public.proteger_lancamento_venda();

-- Histórico do cliente passa a registrar vendas
ALTER TABLE public.historico_clientes DROP CONSTRAINT historico_clientes_acao_check;
ALTER TABLE public.historico_clientes ADD CONSTRAINT historico_clientes_acao_check
  CHECK (acao IN ('criado', 'editado', 'status', 'receita_vinculada', 'receita_desvinculada', 'venda_registrada', 'venda_cancelada'));

-- ===== RLS: leitura por empresa autorizada; escrita só por funções =====
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_vendas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.produtos, public.historico_produtos, public.movimentacoes_estoque, public.vendas, public.itens_venda, public.historico_vendas FROM anon, authenticated;
GRANT SELECT ON public.produtos, public.historico_produtos, public.movimentacoes_estoque, public.vendas, public.itens_venda, public.historico_vendas TO authenticated;
CREATE POLICY "Produtos: empresa autorizada" ON public.produtos FOR SELECT TO authenticated USING (public.pode_ver_comercial(id_empresa));
CREATE POLICY "Histórico de produtos: empresa autorizada" ON public.historico_produtos FOR SELECT TO authenticated USING (public.pode_ver_comercial(id_empresa));
CREATE POLICY "Movimentações de estoque: empresa autorizada" ON public.movimentacoes_estoque FOR SELECT TO authenticated USING (public.pode_ver_comercial(id_empresa));
CREATE POLICY "Vendas: empresa autorizada" ON public.vendas FOR SELECT TO authenticated USING (public.pode_ver_comercial(id_empresa));
CREATE POLICY "Itens de venda: empresa autorizada" ON public.itens_venda FOR SELECT TO authenticated USING (public.pode_ver_comercial(id_empresa));
CREATE POLICY "Histórico de vendas: empresa autorizada" ON public.historico_vendas FOR SELECT TO authenticated USING (public.pode_ver_comercial(id_empresa));

-- ===== Produtos =====
CREATE OR REPLACE FUNCTION public.salvar_produto(
  p_id uuid, p_id_empresa uuid, p_tipo text, p_nome text, p_descricao text, p_sku text, p_codigo_barras text, p_categoria text,
  p_unidade text, p_custo numeric, p_preco numeric, p_estoque_minimo numeric, p_status text, p_estoque_inicial numeric DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.produtos;
  v_id uuid;
  v_sku text := nullif(btrim(coalesce(p_sku, '')), '');
  v_cb text := nullif(regexp_replace(coalesce(p_codigo_barras, ''), '\s', '', 'g'), '');
  v_min numeric := CASE WHEN p_tipo = 'servico' THEN 0 ELSE coalesce(p_estoque_minimo, 0) END;
  v_campos text[] := '{}';
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT * INTO v FROM public.produtos WHERE id = p_id FOR UPDATE;
    IF v.id IS NULL OR NOT public.pode_operar_comercial(v.id_empresa) THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = '42501'; END IF;
    p_id_empresa := v.id_empresa;
    IF v.tipo <> p_tipo THEN RAISE EXCEPTION 'Não é possível trocar entre produto e serviço; cadastre um novo item.' USING ERRCODE = 'check_violation'; END IF;
  ELSIF p_id_empresa IS NULL OR NOT public.pode_operar_comercial(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar o estoque desta empresa.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_tipo, '') NOT IN ('produto', 'servico') THEN RAISE EXCEPTION 'Tipo inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_nome, ''))) NOT BETWEEN 2 AND 150 THEN RAISE EXCEPTION 'Informe o nome (2 a 150 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  IF p_preco IS NULL OR p_preco < 0 OR p_preco <> round(p_preco, 2) OR coalesce(p_custo, 0) < 0 OR coalesce(p_custo, 0) <> round(coalesce(p_custo, 0), 2) THEN
    RAISE EXCEPTION 'Informe custo e preço válidos (até 2 casas decimais).' USING ERRCODE = 'check_violation';
  END IF;
  IF v_min < 0 OR v_min <> round(v_min, 3) OR coalesce(p_estoque_inicial, 0) < 0 THEN RAISE EXCEPTION 'Quantidades inválidas.' USING ERRCODE = 'check_violation'; END IF;
  IF v_cb IS NOT NULL AND v_cb !~ '^[0-9]{6,20}$' THEN RAISE EXCEPTION 'Código de barras deve ter só números (6 a 20).' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_status, '') NOT IN ('ativo', 'inativo') THEN RAISE EXCEPTION 'Situação inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF v_sku IS NOT NULL AND EXISTS (SELECT 1 FROM public.produtos x WHERE x.id_empresa = p_id_empresa AND lower(x.sku) = lower(v_sku) AND x.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Já existe um item com o SKU %.', v_sku USING ERRCODE = '23505';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.produtos (id_empresa, tipo, nome, descricao, sku, codigo_barras, categoria, unidade, custo, preco_venda, estoque_minimo, status, criado_por, atualizado_por)
    VALUES (p_id_empresa, p_tipo, btrim(p_nome), nullif(btrim(coalesce(p_descricao, '')), ''), v_sku, v_cb, nullif(btrim(coalesce(p_categoria, '')), ''),
            coalesce(nullif(btrim(coalesce(p_unidade, '')), ''), CASE WHEN p_tipo = 'servico' THEN 'serv' ELSE 'un' END), coalesce(p_custo, 0), p_preco, v_min, p_status, auth.uid(), auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.historico_produtos (id_empresa, id_produto, acao, dados, id_usuario) VALUES (p_id_empresa, v_id, 'criado', jsonb_build_object('custo', coalesce(p_custo, 0), 'preco', p_preco), auth.uid());
    IF p_tipo = 'produto' AND coalesce(p_estoque_inicial, 0) > 0 THEN
      PERFORM public.movimentar_estoque(v_id, 'entrada', p_estoque_inicial, 'Estoque inicial', NULL);
    END IF;
    RETURN v_id;
  END IF;

  IF v.custo <> coalesce(p_custo, 0) OR v.preco_venda <> p_preco THEN
    INSERT INTO public.historico_produtos (id_empresa, id_produto, acao, dados, id_usuario)
    VALUES (v.id_empresa, p_id, 'preco', jsonb_build_object('custo_de', v.custo, 'custo_para', coalesce(p_custo, 0), 'preco_de', v.preco_venda, 'preco_para', p_preco), auth.uid());
  END IF;
  IF v.status <> p_status THEN
    INSERT INTO public.historico_produtos (id_empresa, id_produto, acao, dados, id_usuario) VALUES (v.id_empresa, p_id, 'status', jsonb_build_object('de', v.status, 'para', p_status), auth.uid());
  END IF;
  IF v.nome <> btrim(p_nome) OR v.sku IS DISTINCT FROM v_sku OR v.codigo_barras IS DISTINCT FROM v_cb OR v.categoria IS DISTINCT FROM nullif(btrim(coalesce(p_categoria, '')), '')
     OR v.estoque_minimo <> v_min OR v.descricao IS DISTINCT FROM nullif(btrim(coalesce(p_descricao, '')), '') THEN
    INSERT INTO public.historico_produtos (id_empresa, id_produto, acao, dados, id_usuario) VALUES (v.id_empresa, p_id, 'editado', NULL, auth.uid());
  END IF;
  UPDATE public.produtos
     SET nome = btrim(p_nome), descricao = nullif(btrim(coalesce(p_descricao, '')), ''), sku = v_sku, codigo_barras = v_cb,
         categoria = nullif(btrim(coalesce(p_categoria, '')), ''), unidade = coalesce(nullif(btrim(coalesce(p_unidade, '')), ''), unidade),
         custo = coalesce(p_custo, 0), preco_venda = p_preco, estoque_minimo = v_min, status = p_status, atualizado_por = auth.uid(), atualizado_em = now()
   WHERE id = p_id; -- estoque_atual NÃO muda aqui
  RETURN p_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Já existe um item com este SKU.' USING ERRCODE = '23505';
END;
$$;

-- Entrada/saída: quantidade positiva. Ajuste: p_quantidade = saldo CONTADO (o sistema registra a diferença). Motivo obrigatório
-- em saída e ajuste. Chave de idempotência: repetir a mesma requisição devolve o mesmo movimento.
CREATE OR REPLACE FUNCTION public.movimentar_estoque(p_id_produto uuid, p_tipo text, p_quantidade numeric, p_motivo text, p_chave uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.produtos;
  v_delta numeric;
  v_novo numeric;
  v_id uuid;
BEGIN
  SELECT * INTO p FROM public.produtos WHERE id = p_id_produto FOR UPDATE;
  IF p.id IS NULL OR NOT public.pode_operar_comercial(p.id_empresa) THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = '42501'; END IF;
  IF p_chave IS NOT NULL THEN
    SELECT id INTO v_id FROM public.movimentacoes_estoque WHERE id_empresa = p.id_empresa AND chave_idempotencia = p_chave;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF p.tipo = 'servico' THEN RAISE EXCEPTION 'Serviços não têm controle de estoque.' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_tipo, '') NOT IN ('entrada', 'saida', 'ajuste') THEN RAISE EXCEPTION 'Tipo de movimentação inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF p_quantidade IS NULL OR p_quantidade < 0 OR p_quantidade <> round(p_quantidade, 3) OR (p_tipo <> 'ajuste' AND p_quantidade = 0) OR p_quantidade > 99999999 THEN
    RAISE EXCEPTION 'Informe uma quantidade válida.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tipo IN ('saida', 'ajuste') AND char_length(btrim(coalesce(p_motivo, ''))) < 3 THEN
    RAISE EXCEPTION 'Informe a justificativa da movimentação.' USING ERRCODE = 'check_violation';
  END IF;
  v_delta := CASE p_tipo WHEN 'entrada' THEN p_quantidade WHEN 'saida' THEN -p_quantidade ELSE p_quantidade - p.estoque_atual END;
  IF v_delta = 0 THEN RAISE EXCEPTION 'O saldo contado é igual ao atual; nada a ajustar.' USING ERRCODE = 'check_violation'; END IF;
  v_novo := p.estoque_atual + v_delta;
  IF v_novo < 0 THEN RAISE EXCEPTION 'Estoque insuficiente: saldo atual %.', trim(to_char(p.estoque_atual, 'FM999999990.###')) USING ERRCODE = 'check_violation'; END IF;
  PERFORM set_config('unnify.operacao_estoque', 'sim', true);
  UPDATE public.produtos SET estoque_atual = v_novo, atualizado_em = now() WHERE id = p.id;
  PERFORM set_config('unnify.operacao_estoque', '', true);
  INSERT INTO public.movimentacoes_estoque (id_empresa, id_produto, tipo, quantidade, saldo_apos, motivo, chave_idempotencia, criado_por)
  VALUES (p.id_empresa, p.id, p_tipo, v_delta, v_novo, nullif(btrim(coalesce(p_motivo, '')), ''), p_chave, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resumo_estoque(p_id_empresa uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_ver_comercial(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso ao estoque desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT jsonb_build_object(
    'cadastrados', count(*) FILTER (WHERE status = 'ativo'),
    'produtos', count(*) FILTER (WHERE status = 'ativo' AND tipo = 'produto'),
    'servicos', count(*) FILTER (WHERE status = 'ativo' AND tipo = 'servico'),
    'em_estoque', count(*) FILTER (WHERE status = 'ativo' AND tipo = 'produto' AND estoque_atual > estoque_minimo),
    'estoque_baixo', count(*) FILTER (WHERE status = 'ativo' AND tipo = 'produto' AND estoque_atual > 0 AND estoque_atual <= estoque_minimo),
    'sem_estoque', count(*) FILTER (WHERE status = 'ativo' AND tipo = 'produto' AND estoque_atual = 0),
    'valor_estoque_custo', coalesce(sum(estoque_atual * custo) FILTER (WHERE status = 'ativo' AND tipo = 'produto'), 0),
    'novos_mes', count(*) FILTER (WHERE (criado_em AT TIME ZONE 'America/Sao_Paulo')::date >= date_trunc('month', public.hoje_brasil())::date))
    FROM public.produtos WHERE id_empresa = p_id_empresa);
END;
$$;

CREATE OR REPLACE FUNCTION public.buscar_produtos(p_id_empresa uuid, p_busca text DEFAULT NULL, p_filtro text DEFAULT NULL, p_categoria text DEFAULT NULL,
  p_status text DEFAULT 'ativo', p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0)
RETURNS TABLE (id uuid, tipo text, nome text, sku text, codigo_barras text, categoria text, unidade text, custo numeric, preco_venda numeric,
               estoque_atual numeric, estoque_minimo numeric, status text, situacao_estoque text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b text := nullif(btrim(coalesce(p_busca, '')), '');
BEGIN
  IF NOT public.pode_ver_comercial(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso ao estoque desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    WITH base AS (
      SELECT x.*, CASE WHEN x.tipo = 'servico' THEN 'servico' WHEN x.estoque_atual = 0 THEN 'sem_estoque'
                       WHEN x.estoque_atual <= x.estoque_minimo THEN 'estoque_baixo' ELSE 'em_estoque' END AS sit
        FROM public.produtos x
       WHERE x.id_empresa = p_id_empresa AND (p_status IS NULL OR x.status = p_status)
         AND (p_categoria IS NULL OR x.categoria = p_categoria)
         AND (b IS NULL OR x.nome ILIKE '%' || b || '%' OR x.sku ILIKE '%' || b || '%' OR x.codigo_barras = b OR x.categoria ILIKE '%' || b || '%'))
    SELECT base.id, base.tipo, base.nome, base.sku, base.codigo_barras, base.categoria, base.unidade, base.custo, base.preco_venda,
           base.estoque_atual, base.estoque_minimo, base.status, base.sit, count(*) OVER ()
      FROM base WHERE p_filtro IS NULL OR base.sit = p_filtro
     ORDER BY lower(base.nome)
     LIMIT least(greatest(coalesce(p_limite, 10), 1), 100) OFFSET greatest(coalesce(p_deslocamento, 0), 0);
END;
$$;

-- ===== Vendas =====
CREATE OR REPLACE FUNCTION public.categoria_venda(p_id_empresa uuid, p_so_servicos boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.categorias_financeiras WHERE id_empresa = p_id_empresa AND tipo = 'receita' AND ativa
     AND lower(nome) = CASE WHEN p_so_servicos THEN 'prestação de serviços' ELSE 'venda de produtos' END LIMIT 1;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.categorias_financeiras WHERE id_empresa = p_id_empresa AND tipo = 'receita' AND ativa AND lower(nome) IN ('venda de produtos', 'prestação de serviços', 'vendas') LIMIT 1;
  END IF;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.categorias_financeiras WHERE id_empresa = p_id_empresa AND tipo = 'receita' AND lower(nome) = 'vendas';
    IF v_id IS NOT NULL THEN UPDATE public.categorias_financeiras SET ativa = true WHERE id = v_id; RETURN v_id; END IF;
    INSERT INTO public.categorias_financeiras (id_empresa, tipo, nome, cor, icone, ativa, criado_por) VALUES (p_id_empresa, 'receita', 'Vendas', '#16a34a', 'shopping-cart', true, auth.uid()) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- Cria/atualiza (rascunho) e, se p_confirmar, confirma ATOMICAMENTE: baixa de estoque + receita no Financeiro (+ recebimento opcional).
-- p_itens: [{"id_produto": uuid, "quantidade": n, "preco_unitario": n, "desconto": n}]
CREATE OR REPLACE FUNCTION public.salvar_venda(
  p_id uuid, p_id_empresa uuid, p_id_cliente uuid, p_itens jsonb, p_desconto numeric, p_condicao text, p_forma_pagamento text,
  p_vencimento date, p_observacoes text, p_confirmar boolean, p_recebido boolean, p_id_conta uuid, p_chave uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.vendas;
  v_id uuid;
  v_hoje date := public.hoje_brasil();
  it jsonb;
  pr public.produtos;
  v_qtd numeric; v_preco numeric; v_desc_item numeric; v_total_item numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_numero integer;
  v_cliente public.clientes;
  v_so_servicos boolean := true;
  v_lanc uuid;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para registrar vendas.' USING ERRCODE = '28000'; END IF;
  -- Idempotência: mesma chave = mesma operação (devolve sem refazer)
  IF p_chave IS NOT NULL THEN
    SELECT * INTO v FROM public.vendas WHERE id_empresa = p_id_empresa AND chave_idempotencia = p_chave;
    IF v.id IS NOT NULL THEN
      IF NOT public.pode_operar_comercial(v.id_empresa) THEN RAISE EXCEPTION 'Venda não encontrada.' USING ERRCODE = '42501'; END IF;
      RETURN v.id;
    END IF;
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v FROM public.vendas WHERE id = p_id FOR UPDATE;
    IF v.id IS NULL OR NOT public.pode_operar_comercial(v.id_empresa) THEN RAISE EXCEPTION 'Venda não encontrada.' USING ERRCODE = '42501'; END IF;
    IF v.status <> 'rascunho' THEN RAISE EXCEPTION 'Só rascunhos podem ser alterados.' USING ERRCODE = 'check_violation'; END IF;
    p_id_empresa := v.id_empresa;
  ELSIF p_id_empresa IS NULL OR NOT public.pode_operar_comercial(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para registrar vendas nesta empresa.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_condicao, '') NOT IN ('a_vista', 'a_prazo') THEN RAISE EXCEPTION 'Condição de pagamento inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_forma_pagamento, '') NOT IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'outro') THEN RAISE EXCEPTION 'Forma de pagamento inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF p_condicao = 'a_prazo' AND (p_vencimento IS NULL OR p_vencimento < v_hoje) THEN RAISE EXCEPTION 'Informe o vencimento (a partir de hoje).' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_recebido, false) AND (p_condicao <> 'a_vista' OR NOT coalesce(p_confirmar, false)) THEN RAISE EXCEPTION 'Recebimento imediato só em venda à vista confirmada.' USING ERRCODE = 'check_violation'; END IF;
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Adicione de 1 a 200 itens.' USING ERRCODE = 'check_violation'; END IF;
  IF p_id_cliente IS NOT NULL THEN
    SELECT * INTO v_cliente FROM public.clientes WHERE id = p_id_cliente;
    IF v_cliente.id IS NULL OR v_cliente.id_empresa <> p_id_empresa THEN RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = '42501'; END IF;
    IF v_cliente.status = 'inativo' THEN RAISE EXCEPTION 'Cliente inativo: reative-o antes de vender.' USING ERRCODE = 'check_violation'; END IF;
  END IF;

  IF p_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('vendas:' || p_id_empresa::text));
    SELECT coalesce(max(numero), 0) + 1 INTO v_numero FROM public.vendas WHERE id_empresa = p_id_empresa;
    INSERT INTO public.vendas (id_empresa, numero, id_cliente, condicao, forma_pagamento, data_venda, vencimento, observacoes, chave_idempotencia, criado_por)
    VALUES (p_id_empresa, v_numero, p_id_cliente, p_condicao, p_forma_pagamento, v_hoje, CASE WHEN p_condicao = 'a_prazo' THEN p_vencimento END,
            nullif(btrim(coalesce(p_observacoes, '')), ''), p_chave, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    v_id := p_id;
    DELETE FROM public.itens_venda WHERE id_venda = v_id;
    UPDATE public.vendas SET id_cliente = p_id_cliente, condicao = p_condicao, forma_pagamento = p_forma_pagamento,
           vencimento = CASE WHEN p_condicao = 'a_prazo' THEN p_vencimento END, observacoes = nullif(btrim(coalesce(p_observacoes, '')), ''),
           chave_idempotencia = coalesce(chave_idempotencia, p_chave), atualizado_em = now()
     WHERE id = v_id;
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    SELECT * INTO pr FROM public.produtos WHERE id = public.uuid_ou_nulo(it->>'id_produto');
    IF pr.id IS NULL OR pr.id_empresa <> p_id_empresa THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = '42501'; END IF;
    IF pr.status <> 'ativo' THEN RAISE EXCEPTION 'O item "%" está inativo.', pr.nome USING ERRCODE = 'check_violation'; END IF;
    v_qtd := (it->>'quantidade')::numeric;
    v_preco := coalesce((it->>'preco_unitario')::numeric, pr.preco_venda);
    v_desc_item := coalesce((it->>'desconto')::numeric, 0);
    IF v_qtd IS NULL OR v_qtd <= 0 OR v_qtd <> round(v_qtd, 3) OR v_qtd > 999999 THEN RAISE EXCEPTION 'Quantidade inválida em "%".', pr.nome USING ERRCODE = 'check_violation'; END IF;
    IF v_preco < 0 OR v_preco <> round(v_preco, 2) OR v_desc_item < 0 OR v_desc_item <> round(v_desc_item, 2) THEN RAISE EXCEPTION 'Preço ou desconto inválido em "%".', pr.nome USING ERRCODE = 'check_violation'; END IF;
    v_total_item := round(v_qtd * v_preco, 2) - v_desc_item;
    IF v_total_item < 0 THEN RAISE EXCEPTION 'O desconto de "%" é maior que o valor do item.', pr.nome USING ERRCODE = 'check_violation'; END IF;
    IF pr.tipo = 'produto' THEN v_so_servicos := false; END IF;
    INSERT INTO public.itens_venda (id_empresa, id_venda, id_produto, tipo, descricao, quantidade, preco_unitario, desconto, total)
    VALUES (p_id_empresa, v_id, pr.id, pr.tipo, pr.nome, v_qtd, v_preco, v_desc_item, v_total_item);
    v_subtotal := v_subtotal + v_total_item;
  END LOOP;
  IF coalesce(p_desconto, 0) < 0 OR coalesce(p_desconto, 0) <> round(coalesce(p_desconto, 0), 2) OR coalesce(p_desconto, 0) > v_subtotal THEN
    RAISE EXCEPTION 'Desconto da venda inválido (máximo: subtotal).' USING ERRCODE = 'check_violation';
  END IF;
  v_total := v_subtotal - coalesce(p_desconto, 0);
  UPDATE public.vendas SET subtotal = v_subtotal, desconto = coalesce(p_desconto, 0), total = v_total WHERE id = v_id;

  IF NOT coalesce(p_confirmar, false) THEN
    INSERT INTO public.historico_vendas (id_empresa, id_venda, acao, dados, id_usuario) VALUES (p_id_empresa, v_id, 'rascunho', jsonb_build_object('total', v_total), auth.uid());
    RETURN v_id;
  END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'O total da venda deve ser maior que zero.' USING ERRCODE = 'check_violation'; END IF;

  -- Baixa de estoque: produtos travados em ordem fixa (sem deadlock); vendas simultâneas não passam do saldo
  FOR r IN SELECT i.id_produto, sum(i.quantidade) qtd FROM public.itens_venda i JOIN public.produtos x ON x.id = i.id_produto
            WHERE i.id_venda = v_id AND x.tipo = 'produto' GROUP BY i.id_produto ORDER BY i.id_produto LOOP
    SELECT * INTO pr FROM public.produtos WHERE id = r.id_produto FOR UPDATE;
    IF pr.estoque_atual < r.qtd THEN
      RAISE EXCEPTION 'Estoque insuficiente para "%": disponível %, pedido %.', pr.nome, trim(to_char(pr.estoque_atual, 'FM999999990.###')), trim(to_char(r.qtd, 'FM999999990.###')) USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('unnify.operacao_estoque', 'sim', true);
    UPDATE public.produtos SET estoque_atual = pr.estoque_atual - r.qtd, atualizado_em = now() WHERE id = pr.id;
    PERFORM set_config('unnify.operacao_estoque', '', true);
    INSERT INTO public.movimentacoes_estoque (id_empresa, id_produto, tipo, quantidade, saldo_apos, motivo, id_venda, criado_por)
    VALUES (p_id_empresa, pr.id, 'venda', -r.qtd, pr.estoque_atual - r.qtd, NULL, v_id, auth.uid());
  END LOOP;

  SELECT * INTO v FROM public.vendas WHERE id = v_id;
  -- Uma única receita no Financeiro (pendente); recebimento é outra etapa
  INSERT INTO public.lancamentos_financeiros (id_empresa, tipo, descricao, valor, id_categoria, data_competencia, data_vencimento, status,
                                              contraparte, criado_por, atualizado_por, natureza_financeira, id_venda, id_cliente)
  VALUES (p_id_empresa, 'receita', 'Venda #' || lpad(v.numero::text, 6, '0'), v_total, public.categoria_venda(p_id_empresa, v_so_servicos), v_hoje,
          coalesce(v.vencimento, v_hoje), 'pendente', left(coalesce(nullif(v_cliente.nome_fantasia, ''), v_cliente.nome), 120), auth.uid(), auth.uid(), 'operacional', v_id, p_id_cliente)
  RETURNING id INTO v_lanc;
  UPDATE public.vendas SET status = 'confirmada', confirmada_em = now(), data_venda = v_hoje WHERE id = v_id;
  INSERT INTO public.historico_vendas (id_empresa, id_venda, acao, dados, id_usuario)
  VALUES (p_id_empresa, v_id, 'confirmada', jsonb_build_object('total', v_total, 'condicao', p_condicao, 'forma', p_forma_pagamento), auth.uid());
  IF p_id_cliente IS NOT NULL THEN
    INSERT INTO public.historico_clientes (id_empresa, id_cliente, acao, dados, id_usuario)
    VALUES (p_id_empresa, p_id_cliente, 'venda_registrada', jsonb_build_object('descricao', 'Venda #' || lpad(v.numero::text, 6, '0'), 'valor', v_total), auth.uid());
  END IF;
  IF coalesce(p_recebido, false) THEN
    PERFORM public.registrar_baixa_lancamento(v_lanc, v_hoje, p_id_conta, v_total);
    INSERT INTO public.historico_vendas (id_empresa, id_venda, acao, dados, id_usuario) VALUES (p_id_empresa, v_id, 'recebimento', jsonb_build_object('valor', v_total), auth.uid());
  END IF;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Esta venda já foi registrada.' USING ERRCODE = '23505';
END;
$$;

-- Recebimento integral ou parcial (parcial = lançamento pago próprio; o pendente diminui). Mesma baixa do Financeiro.
CREATE OR REPLACE FUNCTION public.registrar_recebimento_venda(p_id_venda uuid, p_valor numeric, p_data date, p_id_conta uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.vendas; l public.lancamentos_financeiros; v_id uuid;
BEGIN
  SELECT * INTO v FROM public.vendas WHERE id = p_id_venda FOR UPDATE;
  IF v.id IS NULL OR NOT public.pode_operar_comercial(v.id_empresa) THEN RAISE EXCEPTION 'Venda não encontrada.' USING ERRCODE = '42501'; END IF;
  IF v.status <> 'confirmada' THEN RAISE EXCEPTION 'Só vendas confirmadas recebem pagamento.' USING ERRCODE = 'check_violation'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) THEN RAISE EXCEPTION 'Informe um valor válido.' USING ERRCODE = 'check_violation'; END IF;
  IF p_data IS NULL OR p_data > public.hoje_brasil() THEN RAISE EXCEPTION 'A data do recebimento não pode ser futura.' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id_venda = v.id AND status = 'pendente' AND excluido_em IS NULL ORDER BY criado_em LIMIT 1 FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Esta venda não tem saldo a receber.' USING ERRCODE = 'check_violation'; END IF;
  IF p_valor > l.valor THEN RAISE EXCEPTION 'O valor é maior que o saldo a receber (%).', l.valor USING ERRCODE = 'check_violation'; END IF;
  IF p_valor = l.valor THEN
    PERFORM public.registrar_baixa_lancamento(l.id, p_data, p_id_conta, p_valor);
    v_id := l.id;
  ELSE
    PERFORM set_config('unnify.operacao_venda', 'sim', true);
    UPDATE public.lancamentos_financeiros SET valor = l.valor - p_valor, atualizado_por = auth.uid() WHERE id = l.id;
    INSERT INTO public.lancamentos_financeiros (id_empresa, tipo, descricao, valor, id_categoria, data_competencia, data_vencimento, status,
                                                contraparte, criado_por, atualizado_por, natureza_financeira, id_venda, id_cliente)
    VALUES (v.id_empresa, 'receita', left(l.descricao || ' (parcial)', 200), p_valor, l.id_categoria, l.data_competencia, p_data, 'pendente',
            l.contraparte, auth.uid(), auth.uid(), 'operacional', v.id, l.id_cliente)
    RETURNING id INTO v_id;
    PERFORM set_config('unnify.operacao_venda', '', true);
    PERFORM public.registrar_baixa_lancamento(v_id, p_data, p_id_conta, p_valor);
  END IF;
  INSERT INTO public.historico_vendas (id_empresa, id_venda, acao, dados, id_usuario) VALUES (v.id_empresa, v.id, 'recebimento', jsonb_build_object('valor', p_valor, 'data', p_data), auth.uid());
  RETURN v_id;
END;
$$;

-- Cancelamento: devolve estoque (estorno, histórico mantido) e cancela pendências. Com recebimento registrado, recusa.
CREATE OR REPLACE FUNCTION public.cancelar_venda(p_id_venda uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.vendas; m record; pr public.produtos;
BEGIN
  SELECT * INTO v FROM public.vendas WHERE id = p_id_venda FOR UPDATE;
  IF v.id IS NULL OR NOT public.pode_operar_comercial(v.id_empresa) THEN RAISE EXCEPTION 'Venda não encontrada.' USING ERRCODE = '42501'; END IF;
  IF v.status = 'cancelada' THEN RAISE EXCEPTION 'Esta venda já está cancelada.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.lancamentos_financeiros WHERE id_venda = v.id AND status = 'pago' AND excluido_em IS NULL) THEN
    RAISE EXCEPTION 'Há recebimento registrado nesta venda. Estorne o recebimento no Financeiro (ou registre a devolução) antes de cancelar.' USING ERRCODE = 'check_violation';
  END IF;
  FOR m IN SELECT me.id_produto, sum(-me.quantidade) qtd FROM public.movimentacoes_estoque me
            WHERE me.id_venda = v.id AND me.tipo IN ('venda', 'estorno_venda') GROUP BY me.id_produto HAVING sum(-me.quantidade) > 0 ORDER BY me.id_produto LOOP
    SELECT * INTO pr FROM public.produtos WHERE id = m.id_produto FOR UPDATE;
    PERFORM set_config('unnify.operacao_estoque', 'sim', true);
    UPDATE public.produtos SET estoque_atual = pr.estoque_atual + m.qtd, atualizado_em = now() WHERE id = pr.id;
    PERFORM set_config('unnify.operacao_estoque', '', true);
    INSERT INTO public.movimentacoes_estoque (id_empresa, id_produto, tipo, quantidade, saldo_apos, motivo, id_venda, criado_por)
    VALUES (v.id_empresa, pr.id, 'estorno_venda', m.qtd, pr.estoque_atual + m.qtd, left('Cancelamento: ' || btrim(p_motivo), 300), v.id, auth.uid());
  END LOOP;
  PERFORM set_config('unnify.operacao_venda', 'sim', true);
  UPDATE public.lancamentos_financeiros SET status = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(), atualizado_por = auth.uid()
   WHERE id_venda = v.id AND status = 'pendente' AND excluido_em IS NULL;
  PERFORM set_config('unnify.operacao_venda', '', true);
  UPDATE public.vendas SET status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid(), motivo_cancelamento = btrim(p_motivo), atualizado_em = now() WHERE id = v.id;
  INSERT INTO public.historico_vendas (id_empresa, id_venda, acao, dados, id_usuario) VALUES (v.id_empresa, v.id, 'cancelada', jsonb_build_object('motivo', btrim(p_motivo), 'status_anterior', v.status), auth.uid());
  IF v.id_cliente IS NOT NULL AND v.status = 'confirmada' THEN
    INSERT INTO public.historico_clientes (id_empresa, id_cliente, acao, dados, id_usuario)
    VALUES (v.id_empresa, v.id_cliente, 'venda_cancelada', jsonb_build_object('descricao', 'Venda #' || lpad(v.numero::text, 6, '0'), 'valor', v.total), auth.uid());
  END IF;
END;
$$;

-- Situação calculada da venda a partir do Financeiro
CREATE OR REPLACE FUNCTION public.situacao_venda(p_id_venda uuid, p_status text)
RETURNS TABLE (situacao text, recebido numeric, a_receber numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p_status = 'cancelada' THEN 'cancelada' WHEN p_status = 'rascunho' THEN 'rascunho'
              WHEN coalesce(sum(valor) FILTER (WHERE status = 'pendente'), 0) > 0 THEN 'aguardando_pagamento' ELSE 'concluida' END,
         coalesce(sum(valor) FILTER (WHERE status = 'pago'), 0), coalesce(sum(valor) FILTER (WHERE status = 'pendente'), 0)
    FROM public.lancamentos_financeiros WHERE id_venda = p_id_venda AND excluido_em IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.buscar_vendas(p_id_empresa uuid, p_busca text DEFAULT NULL, p_situacao text DEFAULT NULL, p_condicao text DEFAULT NULL,
  p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL, p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0)
RETURNS TABLE (id uuid, numero integer, data_venda date, cliente text, id_cliente uuid, condicao text, forma_pagamento text, itens bigint, tipos text,
               total numeric, recebido numeric, a_receber numeric, situacao text, total_linhas bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b text := nullif(btrim(coalesce(p_busca, '')), '');
BEGIN
  IF NOT public.pode_ver_comercial(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso às vendas desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    WITH base AS (
      SELECT v.id, v.numero, v.data_venda, coalesce(nullif(c.nome_fantasia, ''), c.nome) AS cli, v.id_cliente, v.condicao, v.forma_pagamento, v.total,
             s.situacao AS sit, s.recebido AS rec, s.a_receber AS arec,
             (SELECT count(*) FROM public.itens_venda i WHERE i.id_venda = v.id) AS qtd,
             (SELECT string_agg(DISTINCT i.tipo, ',') FROM public.itens_venda i WHERE i.id_venda = v.id) AS tps
        FROM public.vendas v LEFT JOIN public.clientes c ON c.id = v.id_cliente
        CROSS JOIN LATERAL public.situacao_venda(v.id, v.status) s
       WHERE v.id_empresa = p_id_empresa
         AND (p_condicao IS NULL OR v.condicao = p_condicao)
         AND (p_inicio IS NULL OR v.data_venda >= p_inicio) AND (p_fim IS NULL OR v.data_venda <= p_fim)
         AND (b IS NULL OR v.numero::text = ltrim(regexp_replace(b, '\D', '', 'g'), '0') OR c.nome ILIKE '%' || b || '%' OR c.nome_fantasia ILIKE '%' || b || '%'))
    SELECT base.id, base.numero, base.data_venda, base.cli, base.id_cliente, base.condicao, base.forma_pagamento, base.qtd, base.tps,
           base.total, base.rec, base.arec, base.sit, count(*) OVER ()
      FROM base WHERE p_situacao IS NULL OR base.sit = p_situacao
     ORDER BY base.numero DESC
     LIMIT least(greatest(coalesce(p_limite, 10), 1), 100) OFFSET greatest(coalesce(p_deslocamento, 0), 0);
END;
$$;

-- Indicadores: vendas comerciais (confirmadas no período) SEPARADAS do caixa (recebimentos efetivos no período)
CREATE OR REPLACE FUNCTION public.resumo_vendas(p_id_empresa uuid, p_inicio date, p_fim date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dias integer; v_ai date; v_af date;
BEGIN
  IF NOT public.pode_ver_comercial(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso às vendas desta empresa.' USING ERRCODE = '42501'; END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio OR p_fim - p_inicio > 366 THEN RAISE EXCEPTION 'Período inválido.' USING ERRCODE = 'check_violation'; END IF;
  v_dias := p_fim - p_inicio + 1; v_af := p_inicio - 1; v_ai := p_inicio - v_dias;
  RETURN jsonb_build_object(
    'vendido', (SELECT coalesce(sum(total), 0) FROM public.vendas WHERE id_empresa = p_id_empresa AND status = 'confirmada' AND data_venda BETWEEN p_inicio AND p_fim),
    'vendido_anterior', (SELECT coalesce(sum(total), 0) FROM public.vendas WHERE id_empresa = p_id_empresa AND status = 'confirmada' AND data_venda BETWEEN v_ai AND v_af),
    'quantidade', (SELECT count(*) FROM public.vendas WHERE id_empresa = p_id_empresa AND status = 'confirmada' AND data_venda BETWEEN p_inicio AND p_fim),
    'quantidade_anterior', (SELECT count(*) FROM public.vendas WHERE id_empresa = p_id_empresa AND status = 'confirmada' AND data_venda BETWEEN v_ai AND v_af),
    'a_receber', (SELECT coalesce(sum(l.valor), 0) FROM public.lancamentos_financeiros l WHERE l.id_empresa = p_id_empresa AND l.id_venda IS NOT NULL AND l.status = 'pendente' AND l.excluido_em IS NULL),
    'a_receber_vencido', (SELECT coalesce(sum(l.valor), 0) FROM public.lancamentos_financeiros l WHERE l.id_empresa = p_id_empresa AND l.id_venda IS NOT NULL AND l.status = 'pendente' AND l.excluido_em IS NULL AND l.data_vencimento < public.hoje_brasil()),
    'recebido', (SELECT coalesce(sum(l.valor), 0) FROM public.lancamentos_financeiros l WHERE l.id_empresa = p_id_empresa AND l.id_venda IS NOT NULL AND l.status = 'pago' AND l.excluido_em IS NULL AND l.data_pagamento BETWEEN p_inicio AND p_fim),
    'recebido_anterior', (SELECT coalesce(sum(l.valor), 0) FROM public.lancamentos_financeiros l WHERE l.id_empresa = p_id_empresa AND l.id_venda IS NOT NULL AND l.status = 'pago' AND l.excluido_em IS NULL AND l.data_pagamento BETWEEN v_ai AND v_af));
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_saldo_produto(), public.proteger_lancamento_venda(), public.categoria_venda(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pode_ver_comercial(uuid), public.pode_operar_comercial(uuid),
  public.salvar_produto(uuid, uuid, text, text, text, text, text, text, text, numeric, numeric, numeric, text, numeric),
  public.movimentar_estoque(uuid, text, numeric, text, uuid), public.resumo_estoque(uuid),
  public.buscar_produtos(uuid, text, text, text, text, integer, integer),
  public.salvar_venda(uuid, uuid, uuid, jsonb, numeric, text, text, date, text, boolean, boolean, uuid, uuid),
  public.registrar_recebimento_venda(uuid, numeric, date, uuid), public.cancelar_venda(uuid, text), public.situacao_venda(uuid, text),
  public.buscar_vendas(uuid, text, text, text, date, date, integer, integer), public.resumo_vendas(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_ver_comercial(uuid), public.pode_operar_comercial(uuid),
  public.salvar_produto(uuid, uuid, text, text, text, text, text, text, text, numeric, numeric, numeric, text, numeric),
  public.movimentar_estoque(uuid, text, numeric, text, uuid), public.resumo_estoque(uuid),
  public.buscar_produtos(uuid, text, text, text, text, integer, integer),
  public.salvar_venda(uuid, uuid, uuid, jsonb, numeric, text, text, date, text, boolean, boolean, uuid, uuid),
  public.registrar_recebimento_venda(uuid, numeric, date, uuid), public.cancelar_venda(uuid, text), public.situacao_venda(uuid, text),
  public.buscar_vendas(uuid, text, text, text, date, date, integer, integer), public.resumo_vendas(uuid, date, date) TO authenticated;
