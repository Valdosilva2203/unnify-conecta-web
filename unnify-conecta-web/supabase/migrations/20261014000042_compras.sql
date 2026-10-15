-- Compras (Etapa 1): fornecedores, compras, recebimentos e integração com Estoque e Financeiro. Sem sistema paralelo:
--   * Itens vêm do catálogo do Estoque (produtos). Serviços são comprados sem controle de estoque.
--   * Confirmar a compra gera as contas a pagar no Financeiro (lancamentos_financeiros.id_compra), à vista ou parcelada.
--     NÃO mexe no estoque. Pagamento é outra etapa (integral ou parcial; parcial = lançamento pago próprio).
--   * Estoque só entra no RECEBIMENTO confirmado (parcial ou total, nunca acima do comprado), com movimentação rastreável
--     e chave de idempotência. Correção = estorno do recebimento (histórico mantido).
--   * Cancelamento só sem recebimento ativo e sem pagamento (estornar antes); cancela as contas pendentes.
-- Acesso: dono/sócio opera; contador com vínculo ATIVO e "Ver/Gerenciar financeiro" só lê. Admin Master sem acesso automático.
-- Depende de 041 (produtos, movimentacoes_estoque, pode_ver_comercial/pode_operar_comercial).
-- Reversão: rollback/20261014000042_compras_reverter.sql

-- ===== Fornecedores =====
CREATE TABLE public.fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  tipo_pessoa text NOT NULL DEFAULT 'pj',
  nome text NOT NULL,
  nome_fantasia text,
  documento text,
  telefone text,
  email text,
  endereco text,
  cidade text,
  estado text,
  observacoes text,
  status text NOT NULL DEFAULT 'ativo',
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fornecedores_tipo CHECK (tipo_pessoa IN ('pf', 'pj')),
  CONSTRAINT fornecedores_status CHECK (status IN ('ativo', 'inativo')),
  CONSTRAINT fornecedores_nome CHECK (char_length(btrim(nome)) BETWEEN 2 AND 150),
  CONSTRAINT fornecedores_documento CHECK (documento IS NULL OR documento ~ '^[0-9]{11}$|^[0-9]{14}$'),
  CONSTRAINT fornecedores_textos CHECK ((nome_fantasia IS NULL OR char_length(nome_fantasia) <= 150) AND (telefone IS NULL OR telefone ~ '^[0-9]{10,11}$')
    AND (email IS NULL OR char_length(email) <= 254) AND (endereco IS NULL OR char_length(endereco) <= 300) AND (cidade IS NULL OR char_length(cidade) <= 100)
    AND (estado IS NULL OR estado ~ '^[A-Z]{2}$') AND (observacoes IS NULL OR char_length(observacoes) <= 1000))
);
CREATE UNIQUE INDEX fornecedores_documento_unico ON public.fornecedores (id_empresa, documento) WHERE documento IS NOT NULL;
CREATE INDEX idx_fornecedores_empresa ON public.fornecedores (id_empresa, status, lower(nome));

CREATE TABLE public.historico_fornecedores (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_fornecedor uuid NOT NULL REFERENCES public.fornecedores(id) ON DELETE RESTRICT,
  acao text NOT NULL CHECK (acao IN ('criado', 'editado', 'status')),
  dados jsonb, -- só nomes de campos/situação (sem dados de contato)
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_historico_fornecedores ON public.historico_fornecedores (id_fornecedor, criado_em DESC);

-- ===== Compras =====
CREATE TABLE public.compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  numero integer NOT NULL,
  id_fornecedor uuid REFERENCES public.fornecedores(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'rascunho',
  condicao text NOT NULL DEFAULT 'a_vista',
  forma_pagamento text NOT NULL DEFAULT 'pix',
  parcelas integer NOT NULL DEFAULT 1,
  primeiro_vencimento date,
  subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  desconto numeric(14, 2) NOT NULL DEFAULT 0,
  frete numeric(14, 2) NOT NULL DEFAULT 0,
  total numeric(14, 2) NOT NULL DEFAULT 0,
  data_compra date NOT NULL,
  previsao_entrega date,
  observacoes text,
  chave_idempotencia uuid,
  confirmada_em timestamptz,
  cancelada_em timestamptz,
  cancelada_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  motivo_cancelamento text,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compras_status CHECK (status IN ('rascunho', 'confirmada', 'cancelada')),
  CONSTRAINT compras_condicao CHECK (condicao IN ('a_vista', 'a_prazo')),
  CONSTRAINT compras_forma CHECK (forma_pagamento IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'outro')),
  CONSTRAINT compras_parcelas CHECK (parcelas BETWEEN 1 AND 24 AND (condicao = 'a_prazo' OR parcelas = 1)),
  CONSTRAINT compras_valores CHECK (subtotal >= 0 AND desconto >= 0 AND desconto <= subtotal AND frete >= 0 AND total = subtotal - desconto + frete),
  CONSTRAINT compras_textos CHECK ((observacoes IS NULL OR char_length(observacoes) <= 1000) AND (motivo_cancelamento IS NULL OR char_length(motivo_cancelamento) <= 500)),
  CONSTRAINT compras_numero_unico UNIQUE (id_empresa, numero)
);
CREATE UNIQUE INDEX compras_idempotencia ON public.compras (id_empresa, chave_idempotencia) WHERE chave_idempotencia IS NOT NULL;
CREATE INDEX idx_compras_empresa ON public.compras (id_empresa, data_compra DESC);
CREATE INDEX idx_compras_fornecedor ON public.compras (id_fornecedor) WHERE id_fornecedor IS NOT NULL;

CREATE TABLE public.itens_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_compra uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  id_produto uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  descricao text NOT NULL,
  quantidade numeric(14, 3) NOT NULL CHECK (quantidade > 0),
  quantidade_recebida numeric(14, 3) NOT NULL DEFAULT 0,
  preco_unitario numeric(14, 2) NOT NULL CHECK (preco_unitario >= 0),
  desconto numeric(14, 2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  total numeric(14, 2) NOT NULL CHECK (total >= 0),
  CONSTRAINT itens_compra_recebida CHECK (quantidade_recebida >= 0 AND quantidade_recebida <= quantidade)
);
CREATE INDEX idx_itens_compra ON public.itens_compra (id_compra);

CREATE TABLE public.recebimentos_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_compra uuid NOT NULL REFERENCES public.compras(id) ON DELETE RESTRICT,
  data_recebimento date NOT NULL,
  observacoes text CHECK (observacoes IS NULL OR char_length(observacoes) <= 500),
  chave_idempotencia uuid,
  estornado_em timestamptz,
  estornado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  motivo_estorno text CHECK (motivo_estorno IS NULL OR char_length(motivo_estorno) <= 500),
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX recebimentos_compra_idempotencia ON public.recebimentos_compra (id_empresa, chave_idempotencia) WHERE chave_idempotencia IS NOT NULL;
CREATE INDEX idx_recebimentos_compra ON public.recebimentos_compra (id_compra, criado_em);

CREATE TABLE public.itens_recebimento_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_recebimento uuid NOT NULL REFERENCES public.recebimentos_compra(id) ON DELETE RESTRICT,
  id_item uuid NOT NULL REFERENCES public.itens_compra(id) ON DELETE RESTRICT,
  quantidade numeric(14, 3) NOT NULL CHECK (quantidade > 0)
);
CREATE INDEX idx_itens_recebimento ON public.itens_recebimento_compra (id_recebimento);

CREATE TABLE public.historico_compras (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_compra uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  acao text NOT NULL CHECK (acao IN ('rascunho', 'confirmada', 'recebimento', 'recebimento_estornado', 'pagamento', 'cancelada')),
  dados jsonb,
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_historico_compras ON public.historico_compras (id_compra, criado_em);

-- ===== Estoque: entradas por recebimento de compra =====
ALTER TABLE public.movimentacoes_estoque DROP CONSTRAINT movimentacoes_estoque_tipo_check;
ALTER TABLE public.movimentacoes_estoque ADD CONSTRAINT movimentacoes_estoque_tipo_check
  CHECK (tipo IN ('entrada', 'saida', 'ajuste', 'venda', 'estorno_venda', 'compra', 'estorno_compra'));
ALTER TABLE public.movimentacoes_estoque ADD COLUMN id_compra uuid REFERENCES public.compras(id) ON DELETE RESTRICT;
ALTER TABLE public.movimentacoes_estoque ADD COLUMN id_recebimento_compra uuid REFERENCES public.recebimentos_compra(id) ON DELETE RESTRICT;
CREATE INDEX idx_movimentacoes_estoque_compra ON public.movimentacoes_estoque (id_compra) WHERE id_compra IS NOT NULL;

-- ===== Financeiro: contas a pagar da compra =====
ALTER TABLE public.lancamentos_financeiros ADD COLUMN id_compra uuid REFERENCES public.compras(id) ON DELETE RESTRICT;
CREATE INDEX idx_lancamentos_compra ON public.lancamentos_financeiros (id_compra) WHERE id_compra IS NOT NULL;
CREATE OR REPLACE FUNCTION public.proteger_lancamento_compra()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.id_compra IS NULL OR coalesce(current_setting('unnify.operacao_compra', true), '') = 'sim' THEN RETURN NEW; END IF;
  IF NEW.id_compra IS DISTINCT FROM OLD.id_compra OR NEW.valor IS DISTINCT FROM OLD.valor OR NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento
     OR NEW.id_categoria IS DISTINCT FROM OLD.id_categoria OR NEW.natureza_financeira IS DISTINCT FROM OLD.natureza_financeira OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR (NEW.status = 'cancelado' AND OLD.status <> 'cancelado') OR (NEW.excluido_em IS NOT NULL AND OLD.excluido_em IS NULL) THEN
    RAISE EXCEPTION 'Este lançamento pertence a uma compra: altere valores, pagamentos parciais e cancelamento em Compras.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proteger_lancamento_compra BEFORE UPDATE ON public.lancamentos_financeiros FOR EACH ROW EXECUTE FUNCTION public.proteger_lancamento_compra();

-- ===== RLS: leitura por empresa autorizada; escrita só por funções =====
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimentos_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_recebimento_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_compras ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fornecedores, public.historico_fornecedores, public.compras, public.itens_compra, public.recebimentos_compra,
  public.itens_recebimento_compra, public.historico_compras FROM anon, authenticated;
GRANT SELECT ON public.fornecedores, public.historico_fornecedores, public.compras, public.itens_compra, public.recebimentos_compra,
  public.itens_recebimento_compra, public.historico_compras TO authenticated;
CREATE POLICY "Fornecedores: empresa autorizada" ON public.fornecedores FOR SELECT TO authenticated USING (public.pode_ver_comercial(id_empresa));
CREATE POLICY "Histórico de fornecedores: empresa autorizada" ON public.historico_fornecedores FOR SELECT TO authenticated USING (public.pode_ver_comercial(id_empresa));
CREATE POLICY "Compras: empresa autorizada" ON public.compras FOR SELECT TO authenticated USING (public.pode_ver_comercial(id_empresa));
CREATE POLICY "Itens de compra: empresa autorizada" ON public.itens_compra FOR SELECT TO authenticated USING (public.pode_ver_comercial(id_empresa));
CREATE POLICY "Recebimentos de compra: empresa autorizada" ON public.recebimentos_compra FOR SELECT TO authenticated USING (public.pode_ver_comercial(id_empresa));
CREATE POLICY "Itens recebidos: empresa autorizada" ON public.itens_recebimento_compra FOR SELECT TO authenticated USING (public.pode_ver_comercial(id_empresa));
CREATE POLICY "Histórico de compras: empresa autorizada" ON public.historico_compras FOR SELECT TO authenticated USING (public.pode_ver_comercial(id_empresa));

-- ===== Fornecedores: cadastro =====
CREATE OR REPLACE FUNCTION public.salvar_fornecedor(
  p_id uuid, p_id_empresa uuid, p_tipo_pessoa text, p_nome text, p_nome_fantasia text, p_documento text, p_telefone text, p_email text,
  p_endereco text, p_cidade text, p_estado text, p_observacoes text, p_status text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f public.fornecedores;
  v_id uuid;
  v_doc text := nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '');
  v_tel text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_uf text := nullif(upper(btrim(coalesce(p_estado, ''))), '');
  v_campos text[] := '{}';
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT * INTO f FROM public.fornecedores WHERE id = p_id FOR UPDATE;
    IF f.id IS NULL OR NOT public.pode_operar_comercial(f.id_empresa) THEN RAISE EXCEPTION 'Fornecedor não encontrado.' USING ERRCODE = '42501'; END IF;
    p_id_empresa := f.id_empresa;
  ELSIF p_id_empresa IS NULL OR NOT public.pode_operar_comercial(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar fornecedores desta empresa.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_tipo_pessoa, '') NOT IN ('pf', 'pj') THEN RAISE EXCEPTION 'Tipo de pessoa inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_nome, ''))) NOT BETWEEN 2 AND 150 THEN RAISE EXCEPTION 'Informe o nome (2 a 150 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  IF v_doc IS NOT NULL AND ((p_tipo_pessoa = 'pf' AND NOT public.cpf_valido(v_doc)) OR (p_tipo_pessoa = 'pj' AND NOT public.cnpj_valido(v_doc))) THEN
    RAISE EXCEPTION '% inválido.', CASE WHEN p_tipo_pessoa = 'pf' THEN 'CPF' ELSE 'CNPJ' END USING ERRCODE = 'check_violation';
  END IF;
  IF v_tel IS NOT NULL AND v_tel !~ '^[0-9]{10,11}$' THEN RAISE EXCEPTION 'Telefone inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN RAISE EXCEPTION 'E-mail inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF v_uf IS NOT NULL AND v_uf !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'UF inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_status, '') NOT IN ('ativo', 'inativo') THEN RAISE EXCEPTION 'Situação inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF v_doc IS NOT NULL AND EXISTS (SELECT 1 FROM public.fornecedores x WHERE x.id_empresa = p_id_empresa AND x.documento = v_doc AND x.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Já existe um fornecedor com este %.', CASE WHEN p_tipo_pessoa = 'pf' THEN 'CPF' ELSE 'CNPJ' END USING ERRCODE = '23505';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.fornecedores (id_empresa, tipo_pessoa, nome, nome_fantasia, documento, telefone, email, endereco, cidade, estado, observacoes, status, criado_por)
    VALUES (p_id_empresa, p_tipo_pessoa, btrim(p_nome), nullif(btrim(coalesce(p_nome_fantasia, '')), ''), v_doc, v_tel, v_email, nullif(btrim(coalesce(p_endereco, '')), ''),
            nullif(btrim(coalesce(p_cidade, '')), ''), v_uf, nullif(btrim(coalesce(p_observacoes, '')), ''), p_status, auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.historico_fornecedores (id_empresa, id_fornecedor, acao, dados, id_usuario) VALUES (p_id_empresa, v_id, 'criado', jsonb_build_object('status', p_status), auth.uid());
    RETURN v_id;
  END IF;
  IF f.nome <> btrim(p_nome) OR f.nome_fantasia IS DISTINCT FROM nullif(btrim(coalesce(p_nome_fantasia, '')), '') OR f.tipo_pessoa <> p_tipo_pessoa THEN v_campos := array_append(v_campos, 'nome'); END IF;
  IF f.documento IS DISTINCT FROM v_doc THEN v_campos := array_append(v_campos, 'documento'); END IF;
  IF f.telefone IS DISTINCT FROM v_tel OR f.email IS DISTINCT FROM v_email THEN v_campos := array_append(v_campos, 'contato'); END IF;
  IF f.endereco IS DISTINCT FROM nullif(btrim(coalesce(p_endereco, '')), '') OR f.cidade IS DISTINCT FROM nullif(btrim(coalesce(p_cidade, '')), '') OR f.estado IS DISTINCT FROM v_uf THEN v_campos := array_append(v_campos, 'endereco'); END IF;
  IF f.observacoes IS DISTINCT FROM nullif(btrim(coalesce(p_observacoes, '')), '') THEN v_campos := array_append(v_campos, 'observacoes'); END IF;
  IF f.status <> p_status THEN
    INSERT INTO public.historico_fornecedores (id_empresa, id_fornecedor, acao, dados, id_usuario) VALUES (f.id_empresa, f.id, 'status', jsonb_build_object('de', f.status, 'para', p_status), auth.uid());
  END IF;
  IF cardinality(v_campos) > 0 THEN
    INSERT INTO public.historico_fornecedores (id_empresa, id_fornecedor, acao, dados, id_usuario) VALUES (f.id_empresa, f.id, 'editado', jsonb_build_object('campos', v_campos), auth.uid());
  END IF;
  UPDATE public.fornecedores SET tipo_pessoa = p_tipo_pessoa, nome = btrim(p_nome), nome_fantasia = nullif(btrim(coalesce(p_nome_fantasia, '')), ''), documento = v_doc,
         telefone = v_tel, email = v_email, endereco = nullif(btrim(coalesce(p_endereco, '')), ''), cidade = nullif(btrim(coalesce(p_cidade, '')), ''), estado = v_uf,
         observacoes = nullif(btrim(coalesce(p_observacoes, '')), ''), status = p_status, atualizado_em = now()
   WHERE id = f.id;
  RETURN f.id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Já existe um fornecedor com este documento.' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.buscar_fornecedores(p_id_empresa uuid, p_busca text DEFAULT NULL, p_status text DEFAULT 'ativo', p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0)
RETURNS TABLE (id uuid, tipo_pessoa text, nome text, nome_fantasia text, documento text, telefone text, email text, cidade text, estado text, status text,
               compras bigint, total_comprado numeric, a_pagar numeric, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b text := nullif(btrim(coalesce(p_busca, '')), ''); d text := nullif(regexp_replace(coalesce(p_busca, ''), '\D', '', 'g'), '');
BEGIN
  IF NOT public.pode_ver_comercial(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso aos fornecedores desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT f.id, f.tipo_pessoa, f.nome, f.nome_fantasia, f.documento, f.telefone, f.email, f.cidade, f.estado, f.status,
           (SELECT count(*) FROM public.compras c WHERE c.id_fornecedor = f.id AND c.status = 'confirmada'),
           (SELECT coalesce(sum(c.total), 0) FROM public.compras c WHERE c.id_fornecedor = f.id AND c.status = 'confirmada'),
           (SELECT coalesce(sum(l.valor), 0) FROM public.lancamentos_financeiros l JOIN public.compras c ON c.id = l.id_compra
             WHERE c.id_fornecedor = f.id AND l.status = 'pendente' AND l.excluido_em IS NULL),
           count(*) OVER ()
      FROM public.fornecedores f
     WHERE f.id_empresa = p_id_empresa AND (p_status IS NULL OR f.status = p_status)
       AND (b IS NULL OR f.nome ILIKE '%' || b || '%' OR f.nome_fantasia ILIKE '%' || b || '%' OR (d IS NOT NULL AND length(d) >= 3 AND f.documento LIKE '%' || d || '%'))
     ORDER BY lower(coalesce(nullif(f.nome_fantasia, ''), f.nome))
     LIMIT least(greatest(coalesce(p_limite, 10), 1), 100) OFFSET greatest(coalesce(p_deslocamento, 0), 0);
END;
$$;

-- ===== Compras: rascunho e confirmação =====
CREATE OR REPLACE FUNCTION public.categoria_compra(p_id_empresa uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.categorias_financeiras WHERE id_empresa = p_id_empresa AND tipo = 'despesa' AND ativa AND lower(nome) IN ('fornecedores', 'compras') ORDER BY lower(nome) = 'fornecedores' DESC LIMIT 1;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.categorias_financeiras WHERE id_empresa = p_id_empresa AND tipo = 'despesa' AND lower(nome) = 'compras';
    IF v_id IS NOT NULL THEN UPDATE public.categorias_financeiras SET ativa = true WHERE id = v_id; RETURN v_id; END IF;
    INSERT INTO public.categorias_financeiras (id_empresa, tipo, nome, cor, icone, ativa, criado_por) VALUES (p_id_empresa, 'despesa', 'Compras', '#ea580c', 'shopping-cart', true, auth.uid()) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- p_itens: [{"id_produto": uuid, "quantidade": n, "preco_unitario": n, "desconto": n}]
-- p_confirmar: gera as contas a pagar (à vista: 1, vencendo hoje; a prazo: p_parcelas mensais desde p_primeiro_vencimento).
-- p_pago: só à vista — registra o pagamento já feito (com a conta), pela mesma baixa do Financeiro.
CREATE OR REPLACE FUNCTION public.salvar_compra(
  p_id uuid, p_id_empresa uuid, p_id_fornecedor uuid, p_itens jsonb, p_desconto numeric, p_frete numeric, p_condicao text, p_forma_pagamento text,
  p_parcelas integer, p_primeiro_vencimento date, p_previsao_entrega date, p_observacoes text, p_confirmar boolean, p_pago boolean, p_id_conta uuid, p_chave uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.compras;
  v_id uuid;
  v_hoje date := public.hoje_brasil();
  it jsonb;
  pr public.produtos;
  f public.fornecedores;
  v_qtd numeric; v_preco numeric; v_desc numeric; v_total_item numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_numero integer;
  v_parc integer := CASE WHEN p_condicao = 'a_prazo' THEN coalesce(p_parcelas, 1) ELSE 1 END;
  v_base numeric; v_valor numeric; v_lanc uuid; v_cat uuid; v_desc_lanc text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para registrar compras.' USING ERRCODE = '28000'; END IF;
  IF p_chave IS NOT NULL THEN
    SELECT * INTO v FROM public.compras WHERE id_empresa = p_id_empresa AND chave_idempotencia = p_chave;
    IF v.id IS NOT NULL THEN
      IF NOT public.pode_operar_comercial(v.id_empresa) THEN RAISE EXCEPTION 'Compra não encontrada.' USING ERRCODE = '42501'; END IF;
      RETURN v.id;
    END IF;
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v FROM public.compras WHERE id = p_id FOR UPDATE;
    IF v.id IS NULL OR NOT public.pode_operar_comercial(v.id_empresa) THEN RAISE EXCEPTION 'Compra não encontrada.' USING ERRCODE = '42501'; END IF;
    IF v.status <> 'rascunho' THEN RAISE EXCEPTION 'Só rascunhos podem ser alterados.' USING ERRCODE = 'check_violation'; END IF;
    p_id_empresa := v.id_empresa;
  ELSIF p_id_empresa IS NULL OR NOT public.pode_operar_comercial(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para registrar compras nesta empresa.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_condicao, '') NOT IN ('a_vista', 'a_prazo') THEN RAISE EXCEPTION 'Condição de pagamento inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_forma_pagamento, '') NOT IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'outro') THEN RAISE EXCEPTION 'Forma de pagamento inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF v_parc NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'Parcelas: de 1 a 24.' USING ERRCODE = 'check_violation'; END IF;
  IF p_condicao = 'a_prazo' AND (p_primeiro_vencimento IS NULL OR p_primeiro_vencimento < v_hoje) THEN RAISE EXCEPTION 'Informe o primeiro vencimento (a partir de hoje).' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_pago, false) AND (p_condicao <> 'a_vista' OR NOT coalesce(p_confirmar, false)) THEN RAISE EXCEPTION 'Pagamento imediato só em compra à vista confirmada.' USING ERRCODE = 'check_violation'; END IF;
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Adicione de 1 a 200 itens.' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_frete, 0) < 0 OR coalesce(p_frete, 0) <> round(coalesce(p_frete, 0), 2) OR coalesce(p_frete, 0) > 999999999 THEN RAISE EXCEPTION 'Frete inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF p_id_fornecedor IS NOT NULL THEN
    SELECT * INTO f FROM public.fornecedores WHERE id = p_id_fornecedor;
    IF f.id IS NULL OR f.id_empresa <> p_id_empresa THEN RAISE EXCEPTION 'Fornecedor não encontrado.' USING ERRCODE = '42501'; END IF;
    IF f.status = 'inativo' AND coalesce(p_confirmar, false) THEN RAISE EXCEPTION 'Fornecedor inativo: reative-o antes de comprar.' USING ERRCODE = 'check_violation'; END IF;
  END IF;

  IF p_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('compras:' || p_id_empresa::text));
    SELECT coalesce(max(numero), 0) + 1 INTO v_numero FROM public.compras WHERE id_empresa = p_id_empresa;
    INSERT INTO public.compras (id_empresa, numero, id_fornecedor, condicao, forma_pagamento, parcelas, primeiro_vencimento, data_compra, previsao_entrega, observacoes, chave_idempotencia, criado_por)
    VALUES (p_id_empresa, v_numero, p_id_fornecedor, p_condicao, p_forma_pagamento, v_parc, CASE WHEN p_condicao = 'a_prazo' THEN p_primeiro_vencimento END, v_hoje,
            p_previsao_entrega, nullif(btrim(coalesce(p_observacoes, '')), ''), p_chave, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    v_id := p_id;
    DELETE FROM public.itens_compra WHERE id_compra = v_id;
    UPDATE public.compras SET id_fornecedor = p_id_fornecedor, condicao = p_condicao, forma_pagamento = p_forma_pagamento, parcelas = v_parc,
           primeiro_vencimento = CASE WHEN p_condicao = 'a_prazo' THEN p_primeiro_vencimento END, previsao_entrega = p_previsao_entrega,
           observacoes = nullif(btrim(coalesce(p_observacoes, '')), ''), chave_idempotencia = coalesce(chave_idempotencia, p_chave), atualizado_em = now()
     WHERE id = v_id;
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    SELECT * INTO pr FROM public.produtos WHERE id = public.uuid_ou_nulo(it->>'id_produto');
    IF pr.id IS NULL OR pr.id_empresa <> p_id_empresa THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = '42501'; END IF;
    IF pr.status <> 'ativo' THEN RAISE EXCEPTION 'O item "%" está inativo.', pr.nome USING ERRCODE = 'check_violation'; END IF;
    v_qtd := (it->>'quantidade')::numeric;
    v_preco := coalesce((it->>'preco_unitario')::numeric, pr.custo);
    v_desc := coalesce((it->>'desconto')::numeric, 0);
    IF v_qtd IS NULL OR v_qtd <= 0 OR v_qtd <> round(v_qtd, 3) OR v_qtd > 999999 THEN RAISE EXCEPTION 'Quantidade inválida em "%".', pr.nome USING ERRCODE = 'check_violation'; END IF;
    IF v_preco < 0 OR v_preco <> round(v_preco, 2) OR v_desc < 0 OR v_desc <> round(v_desc, 2) THEN RAISE EXCEPTION 'Preço ou desconto inválido em "%".', pr.nome USING ERRCODE = 'check_violation'; END IF;
    v_total_item := round(v_qtd * v_preco, 2) - v_desc;
    IF v_total_item < 0 THEN RAISE EXCEPTION 'O desconto de "%" é maior que o valor do item.', pr.nome USING ERRCODE = 'check_violation'; END IF;
    INSERT INTO public.itens_compra (id_empresa, id_compra, id_produto, tipo, descricao, quantidade, preco_unitario, desconto, total)
    VALUES (p_id_empresa, v_id, pr.id, pr.tipo, pr.nome, v_qtd, v_preco, v_desc, v_total_item);
    v_subtotal := v_subtotal + v_total_item;
  END LOOP;
  IF coalesce(p_desconto, 0) < 0 OR coalesce(p_desconto, 0) <> round(coalesce(p_desconto, 0), 2) OR coalesce(p_desconto, 0) > v_subtotal THEN
    RAISE EXCEPTION 'Desconto da compra inválido (máximo: subtotal).' USING ERRCODE = 'check_violation';
  END IF;
  v_total := v_subtotal - coalesce(p_desconto, 0) + coalesce(p_frete, 0);
  UPDATE public.compras SET subtotal = v_subtotal, desconto = coalesce(p_desconto, 0), frete = coalesce(p_frete, 0), total = v_total WHERE id = v_id;

  IF NOT coalesce(p_confirmar, false) THEN
    INSERT INTO public.historico_compras (id_empresa, id_compra, acao, dados, id_usuario) VALUES (p_id_empresa, v_id, 'rascunho', jsonb_build_object('total', v_total), auth.uid());
    RETURN v_id;
  END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'O total da compra deve ser maior que zero.' USING ERRCODE = 'check_violation'; END IF;

  SELECT * INTO v FROM public.compras WHERE id = v_id;
  v_cat := public.categoria_compra(p_id_empresa);
  v_desc_lanc := 'Compra #' || lpad(v.numero::text, 6, '0');
  -- Parcelas iguais em centavos; a diferença de arredondamento fica na última. Pedido ≠ pagamento: tudo nasce pendente.
  v_base := trunc(v_total / v_parc, 2);
  FOR i IN 1..v_parc LOOP
    v_valor := CASE WHEN i = v_parc THEN v_total - v_base * (v_parc - 1) ELSE v_base END;
    INSERT INTO public.lancamentos_financeiros (id_empresa, tipo, descricao, valor, id_categoria, data_competencia, data_vencimento, status,
                                                contraparte, criado_por, atualizado_por, natureza_financeira, id_compra)
    VALUES (p_id_empresa, 'despesa', v_desc_lanc || CASE WHEN v_parc > 1 THEN ' (' || i || '/' || v_parc || ')' ELSE '' END, v_valor, v_cat, v_hoje,
            CASE WHEN p_condicao = 'a_prazo' THEN (p_primeiro_vencimento + make_interval(months => i - 1))::date ELSE v_hoje END, 'pendente',
            left(coalesce(nullif(f.nome_fantasia, ''), f.nome), 120), auth.uid(), auth.uid(), 'operacional', v_id)
    RETURNING id INTO v_lanc;
  END LOOP;
  UPDATE public.compras SET status = 'confirmada', confirmada_em = now(), data_compra = v_hoje WHERE id = v_id;
  INSERT INTO public.historico_compras (id_empresa, id_compra, acao, dados, id_usuario)
  VALUES (p_id_empresa, v_id, 'confirmada', jsonb_build_object('total', v_total, 'condicao', p_condicao, 'parcelas', v_parc, 'forma', p_forma_pagamento), auth.uid());
  IF coalesce(p_pago, false) THEN
    PERFORM public.registrar_baixa_lancamento(v_lanc, v_hoje, p_id_conta, v_total);
    INSERT INTO public.historico_compras (id_empresa, id_compra, acao, dados, id_usuario) VALUES (p_id_empresa, v_id, 'pagamento', jsonb_build_object('valor', v_total, 'data', v_hoje), auth.uid());
  END IF;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Esta compra já foi registrada.' USING ERRCODE = '23505';
END;
$$;

-- ===== Recebimento (parcial ou total) — única forma de a compra entrar no estoque =====
-- p_itens: [{"id_item": uuid, "quantidade": n}]
CREATE OR REPLACE FUNCTION public.registrar_recebimento_compra(p_id_compra uuid, p_itens jsonb, p_data date, p_observacoes text, p_chave uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.compras; ic public.itens_compra; pr public.produtos;
  it jsonb; v_qtd numeric; v_rec uuid; v_n integer := 0; r record;
BEGIN
  SELECT * INTO v FROM public.compras WHERE id = p_id_compra FOR UPDATE; -- serializa recebimentos da mesma compra
  IF v.id IS NULL OR NOT public.pode_operar_comercial(v.id_empresa) THEN RAISE EXCEPTION 'Compra não encontrada.' USING ERRCODE = '42501'; END IF;
  IF p_chave IS NOT NULL THEN
    SELECT id INTO v_rec FROM public.recebimentos_compra WHERE id_empresa = v.id_empresa AND chave_idempotencia = p_chave;
    IF v_rec IS NOT NULL THEN RETURN v_rec; END IF;
  END IF;
  IF v.status <> 'confirmada' THEN RAISE EXCEPTION 'Só compras confirmadas podem ser recebidas.' USING ERRCODE = 'check_violation'; END IF;
  IF p_data IS NULL OR p_data > public.hoje_brasil() OR p_data < v.data_compra THEN RAISE EXCEPTION 'Data de recebimento inválida (entre a compra e hoje).' USING ERRCODE = 'check_violation'; END IF;
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN RAISE EXCEPTION 'Informe as quantidades recebidas.' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.recebimentos_compra (id_empresa, id_compra, data_recebimento, observacoes, chave_idempotencia, criado_por)
  VALUES (v.id_empresa, v.id, p_data, nullif(btrim(coalesce(p_observacoes, '')), ''), p_chave, auth.uid())
  RETURNING id INTO v_rec;
  -- Itens em ordem fixa de produto (sem deadlock com vendas/movimentações simultâneas)
  FOR r IN SELECT x.value AS item, i.id_produto FROM jsonb_array_elements(p_itens) x
             LEFT JOIN public.itens_compra i ON i.id = public.uuid_ou_nulo(x.value->>'id_item') ORDER BY i.id_produto LOOP
    it := r.item;
    v_qtd := (it->>'quantidade')::numeric;
    IF v_qtd IS NULL OR v_qtd = 0 THEN CONTINUE; END IF;
    SELECT * INTO ic FROM public.itens_compra WHERE id = public.uuid_ou_nulo(it->>'id_item') AND id_compra = v.id FOR UPDATE;
    IF ic.id IS NULL THEN RAISE EXCEPTION 'Item não pertence a esta compra.' USING ERRCODE = '42501'; END IF;
    IF v_qtd < 0 OR v_qtd <> round(v_qtd, 3) THEN RAISE EXCEPTION 'Quantidade inválida em "%".', ic.descricao USING ERRCODE = 'check_violation'; END IF;
    IF ic.quantidade_recebida + v_qtd > ic.quantidade THEN
      RAISE EXCEPTION 'Recebimento maior que o comprado em "%": pendente %.', ic.descricao, trim(to_char(ic.quantidade - ic.quantidade_recebida, 'FM999999990.###')) USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.itens_compra SET quantidade_recebida = quantidade_recebida + v_qtd WHERE id = ic.id;
    INSERT INTO public.itens_recebimento_compra (id_empresa, id_recebimento, id_item, quantidade) VALUES (v.id_empresa, v_rec, ic.id, v_qtd);
    IF ic.tipo = 'produto' THEN
      SELECT * INTO pr FROM public.produtos WHERE id = ic.id_produto FOR UPDATE;
      PERFORM set_config('unnify.operacao_estoque', 'sim', true);
      UPDATE public.produtos SET estoque_atual = pr.estoque_atual + v_qtd, atualizado_em = now() WHERE id = pr.id;
      PERFORM set_config('unnify.operacao_estoque', '', true);
      INSERT INTO public.movimentacoes_estoque (id_empresa, id_produto, tipo, quantidade, saldo_apos, motivo, id_compra, id_recebimento_compra, criado_por)
      VALUES (v.id_empresa, pr.id, 'compra', v_qtd, pr.estoque_atual + v_qtd, 'Recebimento da compra #' || lpad(v.numero::text, 6, '0'), v.id, v_rec, auth.uid());
    END IF;
    v_n := v_n + 1;
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION 'Informe ao menos uma quantidade recebida.' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.historico_compras (id_empresa, id_compra, acao, dados, id_usuario) VALUES (v.id_empresa, v.id, 'recebimento', jsonb_build_object('itens', v_n, 'data', p_data), auth.uid());
  RETURN v_rec;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Este recebimento já foi registrado.' USING ERRCODE = '23505';
END;
$$;

-- Correção: estorna um recebimento (tira do estoque o que entrou; histórico mantido). Falha se o saldo já foi consumido.
CREATE OR REPLACE FUNCTION public.estornar_recebimento_compra(p_id_recebimento uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rc public.recebimentos_compra; v public.compras; pr public.produtos; r record;
BEGIN
  SELECT * INTO rc FROM public.recebimentos_compra WHERE id = p_id_recebimento;
  IF rc.id IS NULL OR NOT public.pode_operar_comercial(rc.id_empresa) THEN RAISE EXCEPTION 'Recebimento não encontrado.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v FROM public.compras WHERE id = rc.id_compra FOR UPDATE;
  SELECT * INTO rc FROM public.recebimentos_compra WHERE id = p_id_recebimento FOR UPDATE;
  IF rc.estornado_em IS NOT NULL THEN RAISE EXCEPTION 'Este recebimento já foi estornado.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo do estorno.' USING ERRCODE = 'check_violation'; END IF;
  FOR r IN SELECT ir.id_item, ir.quantidade, i.tipo, i.id_produto, i.descricao FROM public.itens_recebimento_compra ir JOIN public.itens_compra i ON i.id = ir.id_item
            WHERE ir.id_recebimento = rc.id ORDER BY i.id_produto LOOP
    UPDATE public.itens_compra SET quantidade_recebida = quantidade_recebida - r.quantidade WHERE id = r.id_item;
    IF r.tipo = 'produto' THEN
      SELECT * INTO pr FROM public.produtos WHERE id = r.id_produto FOR UPDATE;
      IF pr.estoque_atual < r.quantidade THEN
        RAISE EXCEPTION 'Não é possível estornar "%": o estoque atual (%) é menor que o recebido.', r.descricao, trim(to_char(pr.estoque_atual, 'FM999999990.###')) USING ERRCODE = 'check_violation';
      END IF;
      PERFORM set_config('unnify.operacao_estoque', 'sim', true);
      UPDATE public.produtos SET estoque_atual = pr.estoque_atual - r.quantidade, atualizado_em = now() WHERE id = pr.id;
      PERFORM set_config('unnify.operacao_estoque', '', true);
      INSERT INTO public.movimentacoes_estoque (id_empresa, id_produto, tipo, quantidade, saldo_apos, motivo, id_compra, id_recebimento_compra, criado_por)
      VALUES (rc.id_empresa, pr.id, 'estorno_compra', -r.quantidade, pr.estoque_atual - r.quantidade, left('Estorno de recebimento: ' || btrim(p_motivo), 300), v.id, rc.id, auth.uid());
    END IF;
  END LOOP;
  UPDATE public.recebimentos_compra SET estornado_em = now(), estornado_por = auth.uid(), motivo_estorno = btrim(p_motivo) WHERE id = rc.id;
  INSERT INTO public.historico_compras (id_empresa, id_compra, acao, dados, id_usuario) VALUES (rc.id_empresa, v.id, 'recebimento_estornado', jsonb_build_object('motivo', btrim(p_motivo)), auth.uid());
END;
$$;

-- ===== Pagamento (integral ou parcial) de uma conta a pagar da compra — mesma baixa do Financeiro =====
CREATE OR REPLACE FUNCTION public.registrar_pagamento_compra(p_id_lancamento uuid, p_valor numeric, p_data date, p_id_conta uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.lancamentos_financeiros; v public.compras; v_id uuid;
BEGIN
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id = p_id_lancamento AND excluido_em IS NULL;
  IF l.id IS NULL OR l.id_compra IS NULL OR NOT public.pode_operar_comercial(l.id_empresa) THEN RAISE EXCEPTION 'Conta a pagar não encontrada.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v FROM public.compras WHERE id = l.id_compra FOR UPDATE;
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id = p_id_lancamento FOR UPDATE;
  IF v.status <> 'confirmada' THEN RAISE EXCEPTION 'Compra cancelada ou não confirmada.' USING ERRCODE = 'check_violation'; END IF;
  IF l.status <> 'pendente' THEN RAISE EXCEPTION 'Esta conta já foi paga ou cancelada.' USING ERRCODE = 'check_violation'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) THEN RAISE EXCEPTION 'Informe um valor válido.' USING ERRCODE = 'check_violation'; END IF;
  IF p_valor > l.valor THEN RAISE EXCEPTION 'O valor é maior que o saldo desta conta (%).', l.valor USING ERRCODE = 'check_violation'; END IF;
  IF p_data IS NULL OR p_data > public.hoje_brasil() THEN RAISE EXCEPTION 'A data do pagamento não pode ser futura.' USING ERRCODE = 'check_violation'; END IF;
  IF p_valor = l.valor THEN
    PERFORM public.registrar_baixa_lancamento(l.id, p_data, p_id_conta, p_valor);
    v_id := l.id;
  ELSE
    PERFORM set_config('unnify.operacao_compra', 'sim', true);
    UPDATE public.lancamentos_financeiros SET valor = l.valor - p_valor, atualizado_por = auth.uid() WHERE id = l.id;
    INSERT INTO public.lancamentos_financeiros (id_empresa, tipo, descricao, valor, id_categoria, data_competencia, data_vencimento, status,
                                                contraparte, criado_por, atualizado_por, natureza_financeira, id_compra)
    VALUES (l.id_empresa, 'despesa', left(l.descricao || ' (parcial)', 200), p_valor, l.id_categoria, l.data_competencia, p_data, 'pendente',
            l.contraparte, auth.uid(), auth.uid(), 'operacional', v.id)
    RETURNING id INTO v_id;
    PERFORM set_config('unnify.operacao_compra', '', true);
    PERFORM public.registrar_baixa_lancamento(v_id, p_data, p_id_conta, p_valor);
  END IF;
  INSERT INTO public.historico_compras (id_empresa, id_compra, acao, dados, id_usuario) VALUES (v.id_empresa, v.id, 'pagamento', jsonb_build_object('valor', p_valor, 'data', p_data), auth.uid());
  RETURN v_id;
END;
$$;

-- ===== Cancelamento: sem recebimento ativo e sem pagamento; cancela as contas pendentes (histórico mantido) =====
CREATE OR REPLACE FUNCTION public.cancelar_compra(p_id_compra uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.compras;
BEGIN
  SELECT * INTO v FROM public.compras WHERE id = p_id_compra FOR UPDATE;
  IF v.id IS NULL OR NOT public.pode_operar_comercial(v.id_empresa) THEN RAISE EXCEPTION 'Compra não encontrada.' USING ERRCODE = '42501'; END IF;
  IF v.status = 'cancelada' THEN RAISE EXCEPTION 'Esta compra já está cancelada.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.itens_compra WHERE id_compra = v.id AND quantidade_recebida > 0) THEN
    RAISE EXCEPTION 'Há itens recebidos nesta compra. Estorne os recebimentos antes de cancelar.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lancamentos_financeiros WHERE id_compra = v.id AND status = 'pago' AND excluido_em IS NULL) THEN
    RAISE EXCEPTION 'Há pagamento registrado nesta compra. Estorne o pagamento no Financeiro (ou registre a devolução) antes de cancelar.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('unnify.operacao_compra', 'sim', true);
  UPDATE public.lancamentos_financeiros SET status = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(), atualizado_por = auth.uid()
   WHERE id_compra = v.id AND status = 'pendente' AND excluido_em IS NULL;
  PERFORM set_config('unnify.operacao_compra', '', true);
  UPDATE public.compras SET status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid(), motivo_cancelamento = btrim(p_motivo), atualizado_em = now() WHERE id = v.id;
  INSERT INTO public.historico_compras (id_empresa, id_compra, acao, dados, id_usuario) VALUES (v.id_empresa, v.id, 'cancelada', jsonb_build_object('motivo', btrim(p_motivo), 'status_anterior', v.status), auth.uid());
END;
$$;

-- ===== Situação calculada: entrega (itens) e financeiro (lançamentos) separados =====
CREATE OR REPLACE FUNCTION public.situacao_compra(p_id_compra uuid, p_status text)
RETURNS TABLE (situacao text, valor_recebido numeric, pago numeric, a_pagar numeric, itens_total numeric, itens_recebidos numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH i AS (SELECT coalesce(sum(quantidade), 0) q, coalesce(sum(quantidade_recebida), 0) r,
                    coalesce(sum(round(total * quantidade_recebida / quantidade, 2)), 0) vr FROM public.itens_compra WHERE id_compra = p_id_compra),
       l AS (SELECT coalesce(sum(valor) FILTER (WHERE status = 'pago'), 0) p, coalesce(sum(valor) FILTER (WHERE status = 'pendente'), 0) ap
               FROM public.lancamentos_financeiros WHERE id_compra = p_id_compra AND excluido_em IS NULL)
  SELECT CASE WHEN p_status IN ('cancelada', 'rascunho') THEN p_status WHEN i.r = 0 THEN 'solicitada' WHEN i.r < i.q THEN 'parcialmente_recebida' ELSE 'recebida' END,
         i.vr, l.p, l.ap, i.q, i.r
    FROM i, l;
$$;

CREATE OR REPLACE FUNCTION public.buscar_compras(p_id_empresa uuid, p_busca text DEFAULT NULL, p_situacao text DEFAULT NULL, p_id_fornecedor uuid DEFAULT NULL,
  p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL, p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0)
RETURNS TABLE (id uuid, numero integer, data_compra date, fornecedor text, id_fornecedor uuid, condicao text, forma_pagamento text, parcelas integer, itens bigint,
               total numeric, valor_recebido numeric, pago numeric, a_pagar numeric, situacao text, total_linhas bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b text := nullif(btrim(coalesce(p_busca, '')), '');
BEGIN
  IF NOT public.pode_ver_comercial(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso às compras desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    WITH base AS (
      SELECT c.id, c.numero, c.data_compra, coalesce(nullif(f.nome_fantasia, ''), f.nome) AS forn, c.id_fornecedor, c.condicao, c.forma_pagamento, c.parcelas, c.total,
             s.situacao AS sit, s.valor_recebido AS vr, s.pago AS pg, s.a_pagar AS ap,
             (SELECT count(*) FROM public.itens_compra i WHERE i.id_compra = c.id) AS qtd
        FROM public.compras c LEFT JOIN public.fornecedores f ON f.id = c.id_fornecedor
        CROSS JOIN LATERAL public.situacao_compra(c.id, c.status) s
       WHERE c.id_empresa = p_id_empresa
         AND (p_id_fornecedor IS NULL OR c.id_fornecedor = p_id_fornecedor)
         AND (p_inicio IS NULL OR c.data_compra >= p_inicio) AND (p_fim IS NULL OR c.data_compra <= p_fim)
         AND (b IS NULL OR c.numero::text = ltrim(regexp_replace(b, '\D', '', 'g'), '0') OR f.nome ILIKE '%' || b || '%' OR f.nome_fantasia ILIKE '%' || b || '%'
              OR EXISTS (SELECT 1 FROM public.itens_compra i WHERE i.id_compra = c.id AND i.descricao ILIKE '%' || b || '%')))
    SELECT base.id, base.numero, base.data_compra, base.forn, base.id_fornecedor, base.condicao, base.forma_pagamento, base.parcelas, base.qtd,
           base.total, base.vr, base.pg, base.ap, base.sit, count(*) OVER ()
      FROM base WHERE p_situacao IS NULL OR base.sit = p_situacao
     ORDER BY base.numero DESC
     LIMIT least(greatest(coalesce(p_limite, 10), 1), 100) OFFSET greatest(coalesce(p_deslocamento, 0), 0);
END;
$$;

-- Indicadores: comprado no período (pedido) ≠ pago no período (caixa) ≠ a pagar hoje
CREATE OR REPLACE FUNCTION public.resumo_compras(p_id_empresa uuid, p_inicio date, p_fim date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dias integer; v_ai date; v_af date;
BEGIN
  IF NOT public.pode_ver_comercial(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso às compras desta empresa.' USING ERRCODE = '42501'; END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio OR p_fim - p_inicio > 366 THEN RAISE EXCEPTION 'Período inválido.' USING ERRCODE = 'check_violation'; END IF;
  v_dias := p_fim - p_inicio + 1; v_af := p_inicio - 1; v_ai := p_inicio - v_dias;
  RETURN jsonb_build_object(
    'comprado', (SELECT coalesce(sum(total), 0) FROM public.compras WHERE id_empresa = p_id_empresa AND status = 'confirmada' AND data_compra BETWEEN p_inicio AND p_fim),
    'comprado_anterior', (SELECT coalesce(sum(total), 0) FROM public.compras WHERE id_empresa = p_id_empresa AND status = 'confirmada' AND data_compra BETWEEN v_ai AND v_af),
    'quantidade', (SELECT count(*) FROM public.compras WHERE id_empresa = p_id_empresa AND status = 'confirmada' AND data_compra BETWEEN p_inicio AND p_fim),
    'a_pagar', (SELECT coalesce(sum(l.valor), 0) FROM public.lancamentos_financeiros l WHERE l.id_empresa = p_id_empresa AND l.id_compra IS NOT NULL AND l.status = 'pendente' AND l.excluido_em IS NULL),
    'a_pagar_vencido', (SELECT coalesce(sum(l.valor), 0) FROM public.lancamentos_financeiros l WHERE l.id_empresa = p_id_empresa AND l.id_compra IS NOT NULL AND l.status = 'pendente' AND l.excluido_em IS NULL AND l.data_vencimento < public.hoje_brasil()),
    'pago', (SELECT coalesce(sum(l.valor), 0) FROM public.lancamentos_financeiros l WHERE l.id_empresa = p_id_empresa AND l.id_compra IS NOT NULL AND l.status = 'pago' AND l.excluido_em IS NULL AND l.data_pagamento BETWEEN p_inicio AND p_fim),
    'aguardando_entrega', (SELECT count(*) FROM public.compras c WHERE c.id_empresa = p_id_empresa AND c.status = 'confirmada'
                             AND EXISTS (SELECT 1 FROM public.itens_compra i WHERE i.id_compra = c.id AND i.quantidade_recebida < i.quantidade)),
    'recebidas', (SELECT count(DISTINCT r.id_compra) FROM public.recebimentos_compra r JOIN public.compras c ON c.id = r.id_compra
                   WHERE r.id_empresa = p_id_empresa AND r.estornado_em IS NULL AND c.status = 'confirmada' AND r.data_recebimento BETWEEN p_inicio AND p_fim
                     AND NOT EXISTS (SELECT 1 FROM public.itens_compra i WHERE i.id_compra = c.id AND i.quantidade_recebida < i.quantidade)));
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_lancamento_compra(), public.categoria_compra(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  public.salvar_fornecedor(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text),
  public.buscar_fornecedores(uuid, text, text, integer, integer),
  public.salvar_compra(uuid, uuid, uuid, jsonb, numeric, numeric, text, text, integer, date, date, text, boolean, boolean, uuid, uuid),
  public.registrar_recebimento_compra(uuid, jsonb, date, text, uuid), public.estornar_recebimento_compra(uuid, text),
  public.registrar_pagamento_compra(uuid, numeric, date, uuid), public.cancelar_compra(uuid, text), public.situacao_compra(uuid, text),
  public.buscar_compras(uuid, text, text, uuid, date, date, integer, integer), public.resumo_compras(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.salvar_fornecedor(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text),
  public.buscar_fornecedores(uuid, text, text, integer, integer),
  public.salvar_compra(uuid, uuid, uuid, jsonb, numeric, numeric, text, text, integer, date, date, text, boolean, boolean, uuid, uuid),
  public.registrar_recebimento_compra(uuid, jsonb, date, text, uuid), public.estornar_recebimento_compra(uuid, text),
  public.registrar_pagamento_compra(uuid, numeric, date, uuid), public.cancelar_compra(uuid, text), public.situacao_compra(uuid, text),
  public.buscar_compras(uuid, text, text, uuid, date, date, integer, integer), public.resumo_compras(uuid, date, date) TO authenticated;
