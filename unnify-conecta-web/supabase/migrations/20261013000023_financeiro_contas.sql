-- Financeiro — Contas e bancos: contas financeiras, movimentações (FONTE ÚNICA de saldo), transferências,
-- e baixa de lançamentos vinculada a uma conta. Amplia a migration 000022 (não recria nada).
-- Saldo calculado = saldo_inicial + entradas − saídas (movimentações não estornadas). Não é saldo bancário.
-- Não guarda senhas, agência/conta nem credenciais bancárias.

-- 1. Contas financeiras
CREATE TABLE public.contas_financeiras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  nome text NOT NULL,
  instituicao text,
  tipo text NOT NULL,
  saldo_inicial numeric(14, 2) NOT NULL DEFAULT 0,
  data_saldo_inicial date NOT NULL,
  principal boolean NOT NULL DEFAULT false,
  permite_saldo_negativo boolean NOT NULL DEFAULT false,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  arquivada_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  arquivada_em timestamptz,
  CONSTRAINT contas_financeiras_tipo CHECK (tipo IN ('conta_corrente', 'poupanca', 'caixa', 'carteira_digital', 'outra')),
  CONSTRAINT contas_financeiras_nome CHECK (char_length(btrim(nome)) BETWEEN 2 AND 60),
  CONSTRAINT contas_financeiras_instituicao CHECK (instituicao IS NULL OR char_length(instituicao) <= 80),
  CONSTRAINT contas_financeiras_saldo_inicial CHECK (abs(saldo_inicial) <= 999999999999.99),
  CONSTRAINT contas_financeiras_data CHECK (data_saldo_inicial BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
  CONSTRAINT contas_financeiras_principal_ativa CHECK (NOT (principal AND arquivada_em IS NOT NULL))
);
CREATE UNIQUE INDEX contas_financeiras_nome_unico ON public.contas_financeiras (id_empresa, lower(nome));
CREATE UNIQUE INDEX contas_financeiras_uma_principal ON public.contas_financeiras (id_empresa) WHERE principal;

-- 2. Transferências entre contas da mesma empresa
CREATE TABLE public.transferencias_financeiras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_conta_origem uuid NOT NULL REFERENCES public.contas_financeiras(id) ON DELETE RESTRICT,
  id_conta_destino uuid NOT NULL REFERENCES public.contas_financeiras(id) ON DELETE RESTRICT,
  valor numeric(14, 2) NOT NULL,
  data date NOT NULL,
  descricao text,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  estornada_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  estornada_em timestamptz,
  CONSTRAINT transferencias_contas_diferentes CHECK (id_conta_origem <> id_conta_destino),
  CONSTRAINT transferencias_valor CHECK (valor > 0 AND valor <= 999999999999.99),
  CONSTRAINT transferencias_data CHECK (data BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
  CONSTRAINT transferencias_descricao CHECK (descricao IS NULL OR char_length(descricao) <= 200)
);

-- 3. Movimentações: única fonte de verdade dos saldos das contas
CREATE TABLE public.movimentacoes_financeiras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_conta uuid NOT NULL REFERENCES public.contas_financeiras(id) ON DELETE RESTRICT,
  natureza text NOT NULL,
  valor numeric(14, 2) NOT NULL,
  data date NOT NULL,
  origem text NOT NULL,
  id_lancamento uuid REFERENCES public.lancamentos_financeiros(id) ON DELETE RESTRICT,
  id_transferencia uuid REFERENCES public.transferencias_financeiras(id) ON DELETE RESTRICT,
  descricao text NOT NULL,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  estornada_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  estornada_em timestamptz,
  CONSTRAINT movimentacoes_natureza CHECK (natureza IN ('entrada', 'saida')),
  CONSTRAINT movimentacoes_valor CHECK (valor > 0 AND valor <= 999999999999.99),
  CONSTRAINT movimentacoes_origem CHECK (
    (origem = 'lancamento' AND id_lancamento IS NOT NULL AND id_transferencia IS NULL)
    OR (origem = 'transferencia' AND id_transferencia IS NOT NULL AND id_lancamento IS NULL))
);
-- Um lançamento tem no máximo UMA movimentação ativa (impede pagamento contabilizado duas vezes)
CREATE UNIQUE INDEX movimentacoes_uma_por_lancamento ON public.movimentacoes_financeiras (id_lancamento) WHERE estornada_em IS NULL AND id_lancamento IS NOT NULL;
CREATE INDEX idx_movimentacoes_conta_data ON public.movimentacoes_financeiras (id_conta, data) WHERE estornada_em IS NULL;
CREATE INDEX idx_movimentacoes_empresa_data ON public.movimentacoes_financeiras (id_empresa, data) WHERE estornada_em IS NULL;

-- 4. Lançamento pago guarda a conta usada na baixa
ALTER TABLE public.lancamentos_financeiros ADD COLUMN id_conta_financeira uuid REFERENCES public.contas_financeiras(id) ON DELETE RESTRICT;
ALTER TABLE public.lancamentos_financeiros ADD CONSTRAINT lancamentos_financeiros_pago_tem_conta
  CHECK ((status = 'pago') = (id_conta_financeira IS NOT NULL));

-- Auditoria de contas e transferências (quem, quando, o quê)
CREATE TABLE public.historico_contas_financeiras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_conta uuid REFERENCES public.contas_financeiras(id) ON DELETE RESTRICT,
  id_transferencia uuid REFERENCES public.transferencias_financeiras(id) ON DELETE RESTRICT,
  acao text NOT NULL,
  dados jsonb,
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historico_contas_acao CHECK (acao IN ('conta_criada', 'conta_editada', 'conta_principal', 'conta_arquivada', 'conta_reativada', 'transferencia', 'transferencia_estornada'))
);
CREATE INDEX idx_historico_contas_conta ON public.historico_contas_financeiras (id_conta, criado_em);

-- 5. Saldo calculado (única regra) e trava da conta para operações concorrentes
CREATE OR REPLACE FUNCTION public.saldo_conta_financeira(p_id_conta uuid, p_ate date DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.saldo_inicial
       + coalesce((SELECT sum(CASE WHEN m.natureza = 'entrada' THEN m.valor ELSE -m.valor END)
                     FROM public.movimentacoes_financeiras m
                    WHERE m.id_conta = c.id AND m.estornada_em IS NULL AND (p_ate IS NULL OR m.data <= p_ate)), 0)
    FROM public.contas_financeiras c
   WHERE c.id = p_id_conta AND public.pode_ver_financeiro(c.id_empresa); -- sem permissão: NULL (não vaza saldo)
$$;

-- Garante que a conta é da empresa, está ativa e (para saídas) tem saldo, com a linha travada até o fim da transação.
CREATE OR REPLACE FUNCTION public.travar_conta_para_movimento(p_id_conta uuid, p_id_empresa uuid, p_saida numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conta public.contas_financeiras;
BEGIN
  SELECT * INTO v_conta FROM public.contas_financeiras WHERE id = p_id_conta FOR UPDATE;
  IF v_conta.id IS NULL OR v_conta.id_empresa <> p_id_empresa THEN
    RAISE EXCEPTION 'Conta financeira inválida para esta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_conta.arquivada_em IS NOT NULL THEN
    RAISE EXCEPTION 'A conta "%" está arquivada.', v_conta.nome USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(p_saida, 0) > 0 AND NOT v_conta.permite_saldo_negativo
     AND public.saldo_conta_financeira(v_conta.id) - p_saida < 0 THEN
    RAISE EXCEPTION 'Saldo insuficiente na conta "%". Ative "Permite saldo negativo" na conta, se for o caso.', v_conta.nome
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- 6. RLS: leitura por empresa/permissão; escrita só por funções
ALTER TABLE public.contas_financeiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferencias_financeiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes_financeiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_contas_financeiras ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contas_financeiras, public.transferencias_financeiras, public.movimentacoes_financeiras,
              public.historico_contas_financeiras FROM anon, authenticated;
GRANT SELECT ON public.contas_financeiras, public.transferencias_financeiras, public.movimentacoes_financeiras,
                public.historico_contas_financeiras TO authenticated;

CREATE POLICY "Financeiro: contas da empresa" ON public.contas_financeiras FOR SELECT TO authenticated
  USING (public.pode_ver_financeiro(id_empresa));
CREATE POLICY "Financeiro: transferências da empresa" ON public.transferencias_financeiras FOR SELECT TO authenticated
  USING (public.pode_ver_financeiro(id_empresa));
CREATE POLICY "Financeiro: movimentações da empresa" ON public.movimentacoes_financeiras FOR SELECT TO authenticated
  USING (public.pode_ver_financeiro(id_empresa));
CREATE POLICY "Financeiro: histórico de contas da empresa" ON public.historico_contas_financeiras FOR SELECT TO authenticated
  USING (public.pode_ver_financeiro(id_empresa));

CREATE VIEW public.contas_financeiras_saldo WITH (security_invoker = true) AS
SELECT c.id, c.id_empresa, c.nome, c.instituicao, c.tipo, c.saldo_inicial, c.data_saldo_inicial, c.principal,
       c.permite_saldo_negativo, c.arquivada_em, c.criado_em, public.saldo_conta_financeira(c.id) AS saldo
  FROM public.contas_financeiras c;
REVOKE ALL ON public.contas_financeiras_saldo FROM anon, authenticated;
GRANT SELECT ON public.contas_financeiras_saldo TO authenticated;

-- A visão de lançamentos passa a trazer a conta da baixa
CREATE OR REPLACE VIEW public.lancamentos_financeiros_situacao WITH (security_invoker = true) AS
SELECT l.id, l.id_empresa, l.tipo, l.descricao, l.valor, l.id_categoria, c.nome AS categoria_nome, c.cor AS categoria_cor,
       l.data_competencia, l.data_vencimento, l.data_pagamento, l.status,
       CASE WHEN l.status = 'pendente' AND l.data_vencimento < public.hoje_brasil() THEN 'vencido' ELSE l.status END AS situacao,
       l.contraparte, l.observacoes, l.criado_em, l.atualizado_em, l.baixado_em, l.baixado_por,
       (SELECT count(*) FROM public.anexos_financeiros a WHERE a.id_lancamento = l.id AND a.excluido_em IS NULL) AS qtd_anexos,
       l.id_conta_financeira, cf.nome AS conta_nome
  FROM public.lancamentos_financeiros l
  JOIN public.categorias_financeiras c ON c.id = l.id_categoria
  LEFT JOIN public.contas_financeiras cf ON cf.id = l.id_conta_financeira
 WHERE l.excluido_em IS NULL;

-- 7. Gestão de contas
CREATE OR REPLACE FUNCTION public.salvar_conta_financeira(
  p_id uuid, p_id_empresa uuid, p_nome text, p_instituicao text, p_tipo text, p_saldo_inicial numeric,
  p_data_saldo_inicial date, p_permite_saldo_negativo boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa uuid;
  v_id uuid;
  v_primeira boolean;
BEGIN
  IF p_saldo_inicial IS NULL OR p_saldo_inicial <> round(p_saldo_inicial, 2) THEN
    RAISE EXCEPTION 'Saldo inicial inválido (até 2 casas decimais).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_id IS NULL THEN
    IF NOT public.pode_gerenciar_financeiro(p_id_empresa) THEN
      RAISE EXCEPTION 'Sem permissão para gerenciar contas desta empresa.' USING ERRCODE = '42501';
    END IF;
    v_primeira := NOT EXISTS (SELECT 1 FROM public.contas_financeiras WHERE id_empresa = p_id_empresa AND arquivada_em IS NULL);
    INSERT INTO public.contas_financeiras (id_empresa, nome, instituicao, tipo, saldo_inicial, data_saldo_inicial, principal,
                                           permite_saldo_negativo, criado_por, atualizado_por)
    VALUES (p_id_empresa, btrim(p_nome), nullif(btrim(coalesce(p_instituicao, '')), ''), p_tipo, p_saldo_inicial,
            coalesce(p_data_saldo_inicial, public.hoje_brasil()), v_primeira, coalesce(p_permite_saldo_negativo, false), auth.uid(), auth.uid())
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
           permite_saldo_negativo = coalesce(p_permite_saldo_negativo, false), atualizado_por = auth.uid(), atualizado_em = now()
     WHERE id = p_id RETURNING id INTO v_id;
    INSERT INTO public.historico_contas_financeiras (id_empresa, id_conta, acao, dados, id_usuario)
    VALUES (v_empresa, v_id, 'conta_editada', jsonb_build_object('nome', p_nome, 'saldo_inicial', p_saldo_inicial), auth.uid());
  END IF;
  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'Já existe uma conta com este nome.' USING ERRCODE = 'unique_violation';
END;
$$;

CREATE OR REPLACE FUNCTION public.definir_conta_principal(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conta public.contas_financeiras;
BEGIN
  SELECT * INTO v_conta FROM public.contas_financeiras WHERE id = p_id;
  IF v_conta.id IS NULL OR NOT public.pode_gerenciar_financeiro(v_conta.id_empresa) THEN
    RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF v_conta.arquivada_em IS NOT NULL THEN
    RAISE EXCEPTION 'Uma conta arquivada não pode ser a principal.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.contas_financeiras SET principal = false WHERE id_empresa = v_conta.id_empresa AND principal AND id <> p_id;
  UPDATE public.contas_financeiras SET principal = true, atualizado_por = auth.uid(), atualizado_em = now() WHERE id = p_id;
  INSERT INTO public.historico_contas_financeiras (id_empresa, id_conta, acao, id_usuario) VALUES (v_conta.id_empresa, p_id, 'conta_principal', auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.arquivar_conta_financeira(p_id uuid, p_arquivar boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conta public.contas_financeiras;
BEGIN
  SELECT * INTO v_conta FROM public.contas_financeiras WHERE id = p_id FOR UPDATE;
  IF v_conta.id IS NULL OR NOT public.pode_gerenciar_financeiro(v_conta.id_empresa) THEN
    RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.contas_financeiras
     SET arquivada_em = CASE WHEN p_arquivar THEN coalesce(arquivada_em, now()) END,
         arquivada_por = CASE WHEN p_arquivar THEN auth.uid() END,
         principal = CASE WHEN p_arquivar THEN false ELSE principal END,
         atualizado_por = auth.uid(), atualizado_em = now()
   WHERE id = p_id;
  INSERT INTO public.historico_contas_financeiras (id_empresa, id_conta, acao, id_usuario)
  VALUES (v_conta.id_empresa, p_id, CASE WHEN p_arquivar THEN 'conta_arquivada' ELSE 'conta_reativada' END, auth.uid());
END;
$$;

-- 8. Baixa com conta (substitui a versão sem conta). Valor deve ser o total: pagamento parcial ainda não é suportado.
DROP FUNCTION public.registrar_baixa_lancamento(uuid, date);
CREATE FUNCTION public.registrar_baixa_lancamento(p_id uuid, p_data_pagamento date, p_id_conta uuid, p_valor numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lanc public.lancamentos_financeiros;
BEGIN
  IF p_data_pagamento IS NULL OR p_data_pagamento NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' THEN
    RAISE EXCEPTION 'Informe uma data de pagamento válida.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_lanc FROM public.lancamentos_financeiros WHERE id = p_id AND excluido_em IS NULL;
  IF v_lanc.id IS NULL OR NOT public.pode_gerenciar_financeiro(v_lanc.id_empresa) THEN
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF p_id_conta IS NULL THEN
    RAISE EXCEPTION 'Escolha a conta financeira.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_valor IS NULL OR p_valor <> v_lanc.valor THEN
    RAISE EXCEPTION 'Pagamento parcial ainda não é suportado: o valor deve ser o total do lançamento.' USING ERRCODE = 'check_violation';
  END IF;
  -- Trava a conta (serializa pagamentos concorrentes) e valida empresa, arquivamento e saldo
  PERFORM public.travar_conta_para_movimento(p_id_conta, v_lanc.id_empresa, CASE WHEN v_lanc.tipo = 'despesa' THEN v_lanc.valor ELSE 0 END);
  UPDATE public.lancamentos_financeiros
     SET status = 'pago', data_pagamento = p_data_pagamento, id_conta_financeira = p_id_conta,
         baixado_por = auth.uid(), baixado_em = now(), atualizado_por = auth.uid()
   WHERE id = p_id AND status = 'pendente' AND excluido_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este lançamento já foi baixado ou não está pendente.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.movimentacoes_financeiras (id_empresa, id_conta, natureza, valor, data, origem, id_lancamento, descricao, criado_por)
  VALUES (v_lanc.id_empresa, p_id_conta, CASE WHEN v_lanc.tipo = 'receita' THEN 'entrada' ELSE 'saida' END, v_lanc.valor,
          p_data_pagamento, 'lancamento', v_lanc.id, v_lanc.descricao, auth.uid());
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
         id_conta_financeira = NULL, baixado_por = NULL, baixado_em = NULL, atualizado_por = auth.uid()
   WHERE id = p_id AND status = 'pago' AND excluido_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Só lançamentos pagos podem ser estornados.' USING ERRCODE = 'check_violation';
  END IF;
  -- A movimentação não é apagada: fica marcada como estornada (deixa de contar no saldo)
  UPDATE public.movimentacoes_financeiras SET estornada_em = now(), estornada_por = auth.uid()
   WHERE id_lancamento = p_id AND estornada_em IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_lancamento_financeiro(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lanc public.lancamentos_financeiros;
BEGIN
  SELECT * INTO v_lanc FROM public.lancamentos_financeiros WHERE id = p_id AND excluido_em IS NULL;
  IF v_lanc.id IS NULL OR NOT public.pode_gerenciar_financeiro(v_lanc.id_empresa) THEN
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF v_lanc.status = 'pago' THEN
    RAISE EXCEPTION 'Estorne o pagamento antes de excluir: ele está registrado em uma conta.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.lancamentos_financeiros SET excluido_em = now(), excluido_por = auth.uid(), atualizado_por = auth.uid()
   WHERE id = p_id AND excluido_em IS NULL;
END;
$$;

-- 9. Criar/editar lançamento: criação já paga exige conta e gera a movimentação; edição de pago não muda valor/data
DROP FUNCTION public.salvar_lancamento_financeiro(uuid, uuid, text, text, numeric, uuid, date, date, date, text, text);
CREATE FUNCTION public.salvar_lancamento_financeiro(
  p_id uuid, p_id_empresa uuid, p_tipo text, p_descricao text, p_valor numeric, p_id_categoria uuid,
  p_data_competencia date, p_data_vencimento date, p_data_pagamento date, p_contraparte text, p_observacoes text,
  p_id_conta_financeira uuid DEFAULT NULL)
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
                                                data_pagamento, status, contraparte, observacoes, criado_por, atualizado_por)
    VALUES (p_id_empresa, p_tipo, coalesce(p_descricao, ''), p_valor, p_id_categoria, p_data_competencia,
            coalesce(p_data_vencimento, p_data_pagamento), NULL, 'pendente', p_contraparte, p_observacoes, auth.uid(), auth.uid())
    RETURNING id INTO v_id;
    -- Já pago/recebido: a baixa passa pela mesma regra (conta obrigatória, saldo, movimentação única)
    IF p_data_pagamento IS NOT NULL THEN
      PERFORM public.registrar_baixa_lancamento(v_id, p_data_pagamento, p_id_conta_financeira, p_valor);
    END IF;
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
  IF v_atual.status = 'pago' AND (p_valor <> v_atual.valor OR p_data_pagamento IS DISTINCT FROM v_atual.data_pagamento) THEN
    RAISE EXCEPTION 'Para alterar valor ou data de um lançamento pago, estorne o pagamento primeiro.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.lancamentos_financeiros
     SET descricao = coalesce(p_descricao, ''), valor = p_valor, id_categoria = p_id_categoria,
         data_competencia = p_data_competencia, data_vencimento = p_data_vencimento,
         contraparte = p_contraparte, observacoes = p_observacoes, atualizado_por = auth.uid()
   WHERE id = p_id;
  RETURN p_id;
EXCEPTION
  WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_restricao = CONSTRAINT_NAME;
    IF coalesce(v_restricao, '') = '' THEN RAISE; END IF;
    RAISE EXCEPTION 'Dados inválidos: confira descrição, valor e datas.' USING ERRCODE = 'check_violation';
END;
$$;

-- 10. Transferências (atômicas; não são receita nem despesa)
CREATE OR REPLACE FUNCTION public.realizar_transferencia(p_id_conta_origem uuid, p_id_conta_destino uuid, p_valor numeric, p_data date, p_descricao text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa uuid;
  v_empresa_destino uuid;
  v_id uuid;
  v_nome_origem text;
  v_nome_destino text;
BEGIN
  IF p_id_conta_origem IS NULL OR p_id_conta_destino IS NULL OR p_id_conta_origem = p_id_conta_destino THEN
    RAISE EXCEPTION 'Escolha contas de origem e destino diferentes.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) THEN
    RAISE EXCEPTION 'Informe um valor maior que zero, com até 2 casas decimais.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data IS NULL OR p_data NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' THEN
    RAISE EXCEPTION 'Informe uma data válida.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT id_empresa, nome INTO v_empresa, v_nome_origem FROM public.contas_financeiras WHERE id = p_id_conta_origem;
  SELECT id_empresa, nome INTO v_empresa_destino, v_nome_destino FROM public.contas_financeiras WHERE id = p_id_conta_destino;
  IF v_empresa IS NULL OR v_empresa_destino IS NULL OR v_empresa <> v_empresa_destino OR NOT public.pode_gerenciar_financeiro(v_empresa) THEN
    RAISE EXCEPTION 'Contas inválidas: as duas devem ser da mesma empresa.' USING ERRCODE = '42501';
  END IF;
  -- Trava as duas contas sempre na mesma ordem (evita impasse entre transferências opostas)
  IF p_id_conta_origem < p_id_conta_destino THEN
    PERFORM public.travar_conta_para_movimento(p_id_conta_origem, v_empresa, p_valor);
    PERFORM public.travar_conta_para_movimento(p_id_conta_destino, v_empresa, 0);
  ELSE
    PERFORM public.travar_conta_para_movimento(p_id_conta_destino, v_empresa, 0);
    PERFORM public.travar_conta_para_movimento(p_id_conta_origem, v_empresa, p_valor);
  END IF;
  INSERT INTO public.transferencias_financeiras (id_empresa, id_conta_origem, id_conta_destino, valor, data, descricao, criado_por)
  VALUES (v_empresa, p_id_conta_origem, p_id_conta_destino, p_valor, p_data, nullif(btrim(coalesce(p_descricao, '')), ''), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.movimentacoes_financeiras (id_empresa, id_conta, natureza, valor, data, origem, id_transferencia, descricao, criado_por)
  VALUES (v_empresa, p_id_conta_origem, 'saida', p_valor, p_data, 'transferencia', v_id, 'Transferência para ' || v_nome_destino, auth.uid()),
         (v_empresa, p_id_conta_destino, 'entrada', p_valor, p_data, 'transferencia', v_id, 'Transferência de ' || v_nome_origem, auth.uid());
  INSERT INTO public.historico_contas_financeiras (id_empresa, id_transferencia, acao, dados, id_usuario)
  VALUES (v_empresa, v_id, 'transferencia', jsonb_build_object('origem', v_nome_origem, 'destino', v_nome_destino, 'valor', p_valor), auth.uid());
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.estornar_transferencia(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_transf public.transferencias_financeiras;
BEGIN
  SELECT * INTO v_transf FROM public.transferencias_financeiras WHERE id = p_id FOR UPDATE;
  IF v_transf.id IS NULL OR NOT public.pode_gerenciar_financeiro(v_transf.id_empresa) THEN
    RAISE EXCEPTION 'Transferência não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF v_transf.estornada_em IS NOT NULL THEN
    RAISE EXCEPTION 'Esta transferência já foi estornada.' USING ERRCODE = 'check_violation';
  END IF;
  -- O estorno devolve o valor à origem: a conta de destino precisa ter saldo (salvo se permitir negativo)
  PERFORM public.travar_conta_para_movimento(v_transf.id_conta_destino, v_transf.id_empresa, v_transf.valor);
  UPDATE public.transferencias_financeiras SET estornada_em = now(), estornada_por = auth.uid() WHERE id = p_id;
  UPDATE public.movimentacoes_financeiras SET estornada_em = now(), estornada_por = auth.uid()
   WHERE id_transferencia = p_id AND estornada_em IS NULL;
  INSERT INTO public.historico_contas_financeiras (id_empresa, id_transferencia, acao, id_usuario)
  VALUES (v_transf.id_empresa, p_id, 'transferencia_estornada', auth.uid());
END;
$$;

-- 11. Indicadores: saldo passa a vir das contas (saldo inicial + movimentações), regra única
CREATE OR REPLACE FUNCTION public.resumo_financeiro(p_id_empresa uuid, p_mes date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inicio date := date_trunc('month', coalesce(p_mes, public.hoje_brasil()))::date;
  v_fim date := (date_trunc('month', coalesce(p_mes, public.hoje_brasil())) + interval '1 month - 1 day')::date;
  v_ini_ant date := (date_trunc('month', coalesce(p_mes, public.hoje_brasil())) - interval '1 month')::date;
  v_hoje date := public.hoje_brasil();
  v_saldo numeric;
  v_qtd_contas integer;
BEGIN
  IF NOT public.pode_ver_financeiro(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para ver o financeiro desta empresa.' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(sum(public.saldo_conta_financeira(c.id, v_fim)) FILTER (WHERE c.data_saldo_inicial <= v_fim), 0), count(*)
    INTO v_saldo, v_qtd_contas
    FROM public.contas_financeiras c WHERE c.id_empresa = p_id_empresa;
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
      'saldo_acumulado', v_saldo,
      'qtd_contas', v_qtd_contas,
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
REVOKE ALL ON FUNCTION public.saldo_conta_financeira(uuid, date), public.travar_conta_para_movimento(uuid, uuid, numeric),
  public.salvar_conta_financeira(uuid, uuid, text, text, text, numeric, date, boolean), public.definir_conta_principal(uuid),
  public.arquivar_conta_financeira(uuid, boolean), public.registrar_baixa_lancamento(uuid, date, uuid, numeric),
  public.salvar_lancamento_financeiro(uuid, uuid, text, text, numeric, uuid, date, date, date, text, text, uuid),
  public.realizar_transferencia(uuid, uuid, numeric, date, text), public.estornar_transferencia(uuid) FROM PUBLIC, anon;
-- Trava interna: não é chamável pelo navegador. saldo_conta_financeira confere a permissão por conta própria.
REVOKE ALL ON FUNCTION public.travar_conta_para_movimento(uuid, uuid, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.saldo_conta_financeira(uuid, date), public.salvar_conta_financeira(uuid, uuid, text, text, text, numeric, date, boolean), public.definir_conta_principal(uuid),
  public.arquivar_conta_financeira(uuid, boolean), public.registrar_baixa_lancamento(uuid, date, uuid, numeric),
  public.salvar_lancamento_financeiro(uuid, uuid, text, text, numeric, uuid, date, date, date, text, text, uuid),
  public.realizar_transferencia(uuid, uuid, numeric, date, text), public.estornar_transferencia(uuid) TO authenticated;
