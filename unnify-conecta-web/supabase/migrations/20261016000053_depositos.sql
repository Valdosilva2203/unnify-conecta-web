-- Depositar (Financeiro → Contas e bancos): registra a entrada de dinheiro numa conta bancária SEM criar uma segunda fonte de saldo.
--   * Espécie (caixa → banco) e conta → conta: usam realizar_transferencia (débito e crédito na mesma transação; saldo negativo
--     recusado conforme a conta). O caixa é uma conta do tipo "Caixa físico"; sem ela, o depósito em espécie é recusado.
--   * Origem externa: exige classificação (aporte de sócio ou empréstimo/financiamento) e vira lançamento de receita NÃO operacional,
--     já recebido na conta (salvar_lancamento_financeiro + baixa). Nunca vira receita de vendas.
--   * Idempotência: o identificador do depósito é gerado pela tela; repetir a mesma chave não gera nova movimentação.
--   * Comprovante opcional no bucket privado "comprovantes-financeiros" (<empresa>/depositos/<id>/<arquivo>).
-- Acesso: dono/sócio ou contador com "gerenciar_financeiro" registra; leitura por quem vê o financeiro. Admin Master sem acesso.
-- Reversão: rollback/20261016000053_depositos_reverter.sql

ALTER TABLE public.historico_contas_financeiras DROP CONSTRAINT historico_contas_acao;
ALTER TABLE public.historico_contas_financeiras ADD CONSTRAINT historico_contas_acao
  CHECK (acao IN ('conta_criada', 'conta_editada', 'conta_principal', 'conta_arquivada', 'conta_reativada', 'transferencia', 'transferencia_estornada', 'deposito'));

CREATE TABLE public.depositos_financeiros (
  id uuid PRIMARY KEY, -- chave de idempotência (gerada pela tela)
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_conta_destino uuid NOT NULL REFERENCES public.contas_financeiras(id) ON DELETE RESTRICT,
  origem text NOT NULL CHECK (origem IN ('especie', 'conta', 'externa')),
  id_conta_origem uuid REFERENCES public.contas_financeiras(id) ON DELETE RESTRICT,
  classificacao text CHECK (classificacao IS NULL OR classificacao IN ('aporte_socio', 'financiamento')),
  contraparte text CHECK (contraparte IS NULL OR char_length(contraparte) <= 120),
  valor numeric(14, 2) NOT NULL CHECK (valor > 0 AND valor <= 999999999999.99),
  data date NOT NULL,
  descricao text CHECK (descricao IS NULL OR char_length(descricao) <= 200),
  id_transferencia uuid REFERENCES public.transferencias_financeiras(id) ON DELETE RESTRICT,
  id_lancamento uuid REFERENCES public.lancamentos_financeiros(id) ON DELETE RESTRICT,
  comprovante_caminho text,
  comprovante_nome text CHECK (comprovante_nome IS NULL OR char_length(comprovante_nome) <= 200),
  comprovante_tipo text,
  comprovante_tamanho bigint,
  criado_por uuid NOT NULL REFERENCES public.perfis(id_usuario) ON DELETE RESTRICT,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT depositos_forma CHECK (
    (origem IN ('especie', 'conta') AND id_conta_origem IS NOT NULL AND id_conta_origem <> id_conta_destino AND id_transferencia IS NOT NULL AND classificacao IS NULL AND id_lancamento IS NULL)
    OR (origem = 'externa' AND id_conta_origem IS NULL AND classificacao IS NOT NULL AND id_lancamento IS NOT NULL AND id_transferencia IS NULL))
);
CREATE INDEX idx_depositos_empresa ON public.depositos_financeiros (id_empresa, data DESC);

ALTER TABLE public.depositos_financeiros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.depositos_financeiros FROM anon, authenticated;
GRANT SELECT ON public.depositos_financeiros TO authenticated;
CREATE POLICY "Depósitos: empresa autorizada" ON public.depositos_financeiros FOR SELECT TO authenticated USING (public.pode_ver_financeiro(id_empresa));

-- Comprovante do depósito: só na pasta de um depósito existente da própria empresa
CREATE POLICY "Comprovantes financeiros: envio de comprovante de depósito" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprovantes-financeiros'
              AND (storage.foldername(name))[2] = 'depositos'
              AND public.pode_gerenciar_financeiro(public.uuid_ou_nulo((storage.foldername(name))[1]))
              AND EXISTS (SELECT 1 FROM public.depositos_financeiros d
                           WHERE d.id = public.uuid_ou_nulo((storage.foldername(name))[3])
                             AND d.id_empresa = public.uuid_ou_nulo((storage.foldername(name))[1])));

-- Categoria de receita não operacional (criada se faltar; nunca "Venda de produtos")
CREATE OR REPLACE FUNCTION public.categoria_deposito_externo(p_id_empresa uuid, p_classificacao text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text := CASE p_classificacao WHEN 'aporte_socio' THEN 'Aportes de sócios' ELSE 'Empréstimos e financiamentos' END; v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.categorias_financeiras WHERE id_empresa = p_id_empresa AND tipo = 'receita' AND lower(nome) = lower(v_nome);
  IF v_id IS NOT NULL THEN
    UPDATE public.categorias_financeiras SET ativa = true WHERE id = v_id AND NOT ativa;
    RETURN v_id;
  END IF;
  INSERT INTO public.categorias_financeiras (id_empresa, tipo, nome, cor, icone, ativa, criado_por)
  VALUES (p_id_empresa, 'receita', v_nome, CASE p_classificacao WHEN 'aporte_socio' THEN '#0284c7' ELSE '#7c3aed' END, 'landmark', true, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_deposito(p_id uuid, p_id_empresa uuid, p_id_conta_destino uuid, p_origem text, p_id_conta_origem uuid,
  p_classificacao text, p_contraparte text, p_valor numeric, p_data date, p_descricao text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existente public.depositos_financeiros;
  v_destino public.contas_financeiras;
  v_origem public.contas_financeiras;
  v_desc text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_contraparte text := nullif(btrim(coalesce(p_contraparte, '')), '');
  v_transf uuid;
  v_lanc uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = '42501'; END IF;
  IF p_id IS NULL OR p_id_empresa IS NULL OR NOT public.pode_gerenciar_financeiro(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para lançar no financeiro desta empresa.' USING ERRCODE = '42501';
  END IF;
  -- Mesma chave = mesmo depósito: não repete a movimentação (clique duplo, nova tentativa após falha de rede)
  PERFORM pg_advisory_xact_lock(hashtext('deposito:' || p_id::text));
  SELECT * INTO v_existente FROM public.depositos_financeiros WHERE id = p_id;
  IF v_existente.id IS NOT NULL THEN
    IF v_existente.id_empresa <> p_id_empresa OR v_existente.criado_por <> auth.uid() THEN
      RAISE EXCEPTION 'Identificador de depósito inválido.' USING ERRCODE = '42501';
    END IF;
    RETURN v_existente.id;
  END IF;

  IF coalesce(p_origem, '') NOT IN ('especie', 'conta', 'externa') THEN RAISE EXCEPTION 'Escolha a origem do dinheiro.' USING ERRCODE = 'check_violation'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) OR p_valor > 999999999999.99 THEN
    RAISE EXCEPTION 'Informe um valor maior que zero, com até 2 casas decimais.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data IS NULL OR p_data < DATE '2000-01-01' OR p_data > public.hoje_brasil() THEN
    RAISE EXCEPTION 'Informe a data do depósito (não pode ser futura).' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(coalesce(v_desc, '')) > 200 THEN RAISE EXCEPTION 'Descrição muito longa (máximo de 200 caracteres).' USING ERRCODE = 'check_violation'; END IF;

  SELECT * INTO v_destino FROM public.contas_financeiras WHERE id = p_id_conta_destino;
  IF v_destino.id IS NULL OR v_destino.id_empresa <> p_id_empresa THEN RAISE EXCEPTION 'Conta de destino inválida.' USING ERRCODE = '42501'; END IF;
  IF v_destino.arquivada_em IS NOT NULL THEN RAISE EXCEPTION 'A conta de destino está arquivada.' USING ERRCODE = 'check_violation'; END IF;
  IF v_destino.tipo = 'caixa' THEN RAISE EXCEPTION 'O destino do depósito deve ser uma conta bancária, não o caixa.' USING ERRCODE = 'check_violation'; END IF;

  IF p_origem IN ('especie', 'conta') THEN
    SELECT * INTO v_origem FROM public.contas_financeiras WHERE id = p_id_conta_origem;
    IF v_origem.id IS NULL OR v_origem.id_empresa <> p_id_empresa THEN RAISE EXCEPTION 'Conta de origem inválida.' USING ERRCODE = '42501'; END IF;
    IF v_origem.id = v_destino.id THEN RAISE EXCEPTION 'A origem não pode ser a própria conta de destino.' USING ERRCODE = 'check_violation'; END IF;
    IF p_origem = 'especie' AND v_origem.tipo <> 'caixa' THEN RAISE EXCEPTION 'Para depósito em espécie, a origem deve ser uma conta do tipo Caixa físico.' USING ERRCODE = 'check_violation'; END IF;
    IF p_origem = 'conta' AND v_origem.tipo = 'caixa' THEN RAISE EXCEPTION 'Saída do caixa é depósito em espécie.' USING ERRCODE = 'check_violation'; END IF;
    IF NOT v_origem.permite_saldo_negativo AND public.saldo_conta_financeira(v_origem.id) - p_valor < 0 THEN
      RAISE EXCEPTION 'Saldo insuficiente em "%": a conta não permite saldo negativo.', v_origem.nome USING ERRCODE = 'check_violation';
    END IF;
    -- Débito e crédito atômicos, com trava das contas e regra de saldo negativo conferida de novo sob trava
    v_transf := public.realizar_transferencia(v_origem.id, v_destino.id, p_valor, p_data,
      coalesce(v_desc, CASE p_origem WHEN 'especie' THEN 'Depósito em espécie' ELSE 'Depósito entre contas' END));
  ELSE
    IF coalesce(p_classificacao, '') NOT IN ('aporte_socio', 'financiamento') THEN
      RAISE EXCEPTION 'Classifique a origem externa: aporte de sócio ou empréstimo/financiamento.' USING ERRCODE = 'check_violation';
    END IF;
    IF char_length(coalesce(v_contraparte, '')) NOT BETWEEN 2 AND 120 THEN
      RAISE EXCEPTION '%', CASE p_classificacao WHEN 'aporte_socio' THEN 'Informe o sócio que fez o aporte.' ELSE 'Informe a instituição ou credor do empréstimo.' END USING ERRCODE = 'check_violation';
    END IF;
    v_lanc := public.salvar_lancamento_financeiro(NULL, p_id_empresa, 'receita',
      coalesce(v_desc, CASE p_classificacao WHEN 'aporte_socio' THEN 'Aporte de sócio' ELSE 'Entrada de empréstimo/financiamento' END),
      p_valor, public.categoria_deposito_externo(p_id_empresa, p_classificacao), p_data, NULL, p_data, v_contraparte, 'Registrado por Depositar', v_destino.id, p_classificacao);
  END IF;

  INSERT INTO public.depositos_financeiros (id, id_empresa, id_conta_destino, origem, id_conta_origem, classificacao, contraparte, valor, data, descricao, id_transferencia, id_lancamento, criado_por)
  VALUES (p_id, p_id_empresa, v_destino.id, p_origem, CASE WHEN p_origem <> 'externa' THEN v_origem.id END, CASE WHEN p_origem = 'externa' THEN p_classificacao END,
          CASE WHEN p_origem = 'externa' THEN v_contraparte END, p_valor, p_data, v_desc, v_transf, v_lanc, auth.uid());
  INSERT INTO public.historico_contas_financeiras (id_empresa, id_transferencia, acao, dados, id_usuario)
  VALUES (p_id_empresa, v_transf, 'deposito', jsonb_strip_nulls(jsonb_build_object('id_deposito', p_id, 'origem', p_origem, 'destino', v_destino.nome, 'conta_origem', v_origem.nome,
          'classificacao', p_classificacao, 'valor', p_valor, 'data', p_data, 'id_lancamento', v_lanc)), auth.uid());
  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_comprovante_deposito(p_id_deposito uuid, p_caminho text, p_nome_arquivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.depositos_financeiros; v record;
BEGIN
  SELECT * INTO d FROM public.depositos_financeiros WHERE id = p_id_deposito FOR UPDATE;
  IF d.id IS NULL OR NOT public.pode_gerenciar_financeiro(d.id_empresa) THEN RAISE EXCEPTION 'Depósito não encontrado.' USING ERRCODE = '42501'; END IF;
  IF d.comprovante_caminho IS NOT NULL THEN RAISE EXCEPTION 'Este depósito já tem comprovante.' USING ERRCODE = 'check_violation'; END IF;
  IF p_caminho IS NULL OR p_caminho NOT LIKE d.id_empresa::text || '/depositos/' || d.id::text || '/%' OR p_caminho LIKE '%..%' THEN
    RAISE EXCEPTION 'Comprovante inválido.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT (o.metadata ->> 'size')::bigint AS tamanho, o.metadata ->> 'mimetype' AS tipo, o.owner_id INTO v
    FROM storage.objects o WHERE o.bucket_id = 'comprovantes-financeiros' AND o.name = p_caminho;
  IF v.tamanho IS NULL OR v.owner_id IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Arquivo não encontrado.' USING ERRCODE = 'check_violation'; END IF;
  IF v.tipo NOT IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') OR v.tamanho > 10485760 THEN
    RAISE EXCEPTION 'Use PDF, JPG, PNG ou WebP de até 10 MB.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.depositos_financeiros
     SET comprovante_caminho = p_caminho, comprovante_nome = left(coalesce(nullif(btrim(p_nome_arquivo), ''), 'comprovante'), 200), comprovante_tipo = v.tipo, comprovante_tamanho = v.tamanho
   WHERE id = d.id;
END;
$$;

REVOKE ALL ON FUNCTION public.categoria_deposito_externo(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_deposito(uuid, uuid, uuid, text, uuid, text, text, numeric, date, text), public.registrar_comprovante_deposito(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_deposito(uuid, uuid, uuid, text, uuid, text, text, numeric, date, text), public.registrar_comprovante_deposito(uuid, text, text) TO authenticated;
