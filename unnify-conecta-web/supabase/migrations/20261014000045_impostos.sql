-- Impostos e parcelamentos tributários (empresa + contador), integrados ao Financeiro.
--   * Cada imposto (ou parcela de parcelamento) = 1 linha em "impostos" = EXATAMENTE 1 lançamento de despesa em Contas a pagar
--     (lancamentos_financeiros.id_imposto, único). Sem duplicidade; o lançamento só muda pelas funções deste módulo.
--   * "Pago" vem do Financeiro (baixa com conta = confirmação). "Pagamento informado" é só a declaração de quem pagou e
--     NÃO conta como pago. Estorno no Financeiro volta o imposto para pendente automaticamente.
--   * Guias e comprovantes: bucket privado "guias-impostos" (<empresa>/<imposto>/<guia|comprovante>-<uuid>.<ext>), registro em
--     arquivos_impostos. Histórico de tudo em historico_impostos. Notificações: guia nova → empresa; pagamento informado → contador.
-- Acesso: dono/sócio da empresa; contador com vínculo ATIVO e a nova permissão "gerenciar_impostos". Admin Master sem acesso.
-- Confirmar pagamento usa a baixa do Financeiro (exige permissão financeira). Reversão: rollback/20261014000045_impostos_reverter.sql

-- Nova permissão do contador
ALTER TABLE public.vinculos_contabeis DROP CONSTRAINT vinculos_contabeis_permissoes;
ALTER TABLE public.vinculos_contabeis ADD CONSTRAINT vinculos_contabeis_permissoes CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
  'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro', 'gerenciar_impostos']);
ALTER TABLE public.convites_vinculos DROP CONSTRAINT convites_permissoes;
ALTER TABLE public.convites_vinculos ADD CONSTRAINT convites_permissoes CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
  'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro', 'gerenciar_impostos']);

CREATE OR REPLACE FUNCTION public.pode_gerenciar_impostos(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.e_gestor_empresa(p_id_empresa) OR public.contador_pode(p_id_empresa, 'gerenciar_impostos');
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('guias-impostos', 'guias-impostos', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.parcelamentos_tributarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  tributo text NOT NULL CHECK (char_length(btrim(tributo)) BETWEEN 2 AND 120),
  orgao text NOT NULL CHECK (char_length(btrim(orgao)) BETWEEN 2 AND 120),
  numero_acordo text NOT NULL CHECK (char_length(btrim(numero_acordo)) BETWEEN 1 AND 60),
  valor_negociado numeric(14, 2) NOT NULL CHECK (valor_negociado > 0),
  observacoes text CHECK (observacoes IS NULL OR char_length(observacoes) <= 500),
  cancelado_em timestamptz,
  motivo_cancelamento text CHECK (motivo_cancelamento IS NULL OR char_length(motivo_cancelamento) <= 500),
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX parcelamentos_tributarios_acordo ON public.parcelamentos_tributarios (id_empresa, lower(btrim(numero_acordo)));

CREATE TABLE public.impostos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_parcelamento uuid REFERENCES public.parcelamentos_tributarios(id) ON DELETE RESTRICT,
  numero_parcela integer,
  tipo text NOT NULL CHECK (tipo IN ('das', 'fgts', 'darf', 'iss', 'icms', 'pis_cofins', 'inss', 'parcelamento', 'outro')),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 120),
  orgao text NOT NULL CHECK (char_length(btrim(orgao)) BETWEEN 2 AND 120),
  competencia date CHECK (competencia IS NULL OR extract(day FROM competencia) = 1),
  vencimento date NOT NULL,
  valor numeric(14, 2) NOT NULL CHECK (valor > 0 AND valor <= 999999999.99),
  descricao text CHECK (descricao IS NULL OR char_length(descricao) <= 300),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pagamento_informado', 'cancelado')),
  informado_em timestamptz,
  informado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  data_pagamento_informada date,
  valor_informado numeric(14, 2),
  cancelado_em timestamptz,
  motivo_cancelamento text CHECK (motivo_cancelamento IS NULL OR char_length(motivo_cancelamento) <= 500),
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT impostos_parcela CHECK ((id_parcelamento IS NULL) = (numero_parcela IS NULL) AND (numero_parcela IS NULL OR numero_parcela >= 1)),
  CONSTRAINT impostos_competencia CHECK (id_parcelamento IS NOT NULL OR competencia IS NOT NULL),
  CONSTRAINT impostos_parcela_unica UNIQUE (id_parcelamento, numero_parcela)
);
-- Mesmo tributo e competência não é cadastrado duas vezes (exceto cancelados)
CREATE UNIQUE INDEX impostos_sem_duplicidade ON public.impostos (id_empresa, tipo, lower(btrim(nome)), competencia) WHERE id_parcelamento IS NULL AND status <> 'cancelado';
CREATE INDEX idx_impostos_empresa ON public.impostos (id_empresa, vencimento);

CREATE TABLE public.arquivos_impostos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_imposto uuid NOT NULL REFERENCES public.impostos(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('guia', 'comprovante')),
  caminho text NOT NULL UNIQUE,
  nome_arquivo text NOT NULL CHECK (char_length(nome_arquivo) BETWEEN 1 AND 200),
  tamanho bigint NOT NULL CHECK (tamanho > 0 AND tamanho <= 10485760),
  enviado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_arquivos_impostos ON public.arquivos_impostos (id_imposto, tipo, criado_em DESC);

CREATE TABLE public.historico_impostos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_imposto uuid REFERENCES public.impostos(id) ON DELETE RESTRICT,
  id_parcelamento uuid REFERENCES public.parcelamentos_tributarios(id) ON DELETE RESTRICT,
  acao text NOT NULL CHECK (acao IN ('criado', 'editado', 'guia_enviada', 'comprovante_enviado', 'pagamento_informado', 'pagamento_confirmado', 'cancelado', 'parcelamento_criado', 'parcelamento_cancelado')),
  dados jsonb,
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_historico_impostos ON public.historico_impostos (id_imposto, criado_em DESC);
CREATE INDEX idx_historico_parcelamentos ON public.historico_impostos (id_parcelamento, criado_em DESC);

-- Financeiro: um lançamento por imposto
ALTER TABLE public.lancamentos_financeiros ADD COLUMN id_imposto uuid REFERENCES public.impostos(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX lancamentos_um_por_imposto ON public.lancamentos_financeiros (id_imposto) WHERE id_imposto IS NOT NULL;
CREATE OR REPLACE FUNCTION public.proteger_lancamento_imposto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.id_imposto IS NULL OR coalesce(current_setting('unnify.operacao_imposto', true), '') = 'sim' THEN RETURN NEW; END IF;
  IF NEW.id_imposto IS DISTINCT FROM OLD.id_imposto OR NEW.valor IS DISTINCT FROM OLD.valor OR NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento
     OR NEW.id_categoria IS DISTINCT FROM OLD.id_categoria OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR (NEW.status = 'cancelado' AND OLD.status <> 'cancelado') OR (NEW.excluido_em IS NOT NULL AND OLD.excluido_em IS NULL) THEN
    RAISE EXCEPTION 'Este lançamento pertence a um imposto: altere valor, vencimento ou cancelamento em Impostos.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proteger_lancamento_imposto BEFORE UPDATE ON public.lancamentos_financeiros FOR EACH ROW EXECUTE FUNCTION public.proteger_lancamento_imposto();

-- RLS: leitura por quem pode ver; escrita só pelas funções
ALTER TABLE public.parcelamentos_tributarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impostos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arquivos_impostos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_impostos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parcelamentos_tributarios, public.impostos, public.arquivos_impostos, public.historico_impostos FROM anon, authenticated;
GRANT SELECT ON public.parcelamentos_tributarios, public.impostos, public.arquivos_impostos, public.historico_impostos TO authenticated;
CREATE POLICY "Parcelamentos tributários: empresa autorizada" ON public.parcelamentos_tributarios FOR SELECT TO authenticated USING (public.pode_gerenciar_impostos(id_empresa));
CREATE POLICY "Impostos: empresa autorizada" ON public.impostos FOR SELECT TO authenticated USING (public.pode_gerenciar_impostos(id_empresa));
CREATE POLICY "Arquivos de impostos: empresa autorizada" ON public.arquivos_impostos FOR SELECT TO authenticated USING (public.pode_gerenciar_impostos(id_empresa));
CREATE POLICY "Histórico de impostos: empresa autorizada" ON public.historico_impostos FOR SELECT TO authenticated USING (public.pode_gerenciar_impostos(id_empresa));

-- Storage: ler/enviar só quem gerencia os impostos da empresa da pasta; descartar só envio não registrado
CREATE POLICY "Guias de impostos: leitura" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'guias-impostos' AND public.pode_gerenciar_impostos(public.uuid_ou_nulo((storage.foldername(name))[1])));
CREATE POLICY "Guias de impostos: envio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'guias-impostos' AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(guia|comprovante)-[0-9a-f-]{36}\.(pdf|jpg|png)$'
              AND public.pode_gerenciar_impostos(public.uuid_ou_nulo((storage.foldername(name))[1])));
CREATE POLICY "Guias de impostos: descarte de envio não registrado" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'guias-impostos' AND public.pode_gerenciar_impostos(public.uuid_ou_nulo((storage.foldername(name))[1]))
         AND NOT EXISTS (SELECT 1 FROM public.arquivos_impostos a WHERE a.caminho = storage.objects.name));

-- ===== Funções internas =====
CREATE OR REPLACE FUNCTION public.categoria_imposto(p_id_empresa uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.categorias_financeiras WHERE id_empresa = p_id_empresa AND tipo = 'despesa' AND lower(nome) IN ('impostos', 'impostos e taxas', 'tributos') ORDER BY ativa DESC LIMIT 1;
  IF v_id IS NOT NULL THEN UPDATE public.categorias_financeiras SET ativa = true WHERE id = v_id AND NOT ativa; RETURN v_id; END IF;
  INSERT INTO public.categorias_financeiras (id_empresa, tipo, nome, cor, icone, ativa, criado_por) VALUES (p_id_empresa, 'despesa', 'Impostos', '#dc2626', 'landmark', true, auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Avisa a outra parte: guia nova → donos/sócios; pagamento informado → contadores com a permissão (quem agiu não recebe)
CREATE OR REPLACE FUNCTION public.notificar_impostos(p_id_empresa uuid, p_para text, p_titulo text, p_mensagem text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid;
BEGIN
  IF p_para = 'empresa' THEN
    FOR u IN SELECT ue.id_usuario FROM public.usuarios_empresas ue WHERE ue.id_empresa = p_id_empresa AND ue.ativo AND ue.tipo_vinculacao IN ('dono', 'socio') AND ue.id_usuario <> auth.uid() LOOP
      PERFORM public.notificar_usuario(u, 'impostos', p_titulo, p_mensagem, '/app/impostos', false);
    END LOOP;
  ELSE
    FOR u IN SELECT v.id_contador FROM public.vinculos_contabeis v WHERE v.id_empresa = p_id_empresa AND v.status = 'ativo' AND 'gerenciar_impostos' = ANY (v.permissoes) AND v.id_contador <> auth.uid() LOOP
      PERFORM public.notificar_usuario(u, 'impostos', p_titulo, p_mensagem, '/contador/empresas/' || p_id_empresa || '#impostos', false);
    END LOOP;
  END IF;
END;
$$;

-- Cria o imposto e o seu lançamento (despesa pendente) na mesma transação
CREATE OR REPLACE FUNCTION public.criar_imposto_interno(p_id_empresa uuid, p_id_parcelamento uuid, p_numero integer, p_tipo text, p_nome text, p_orgao text,
  p_competencia date, p_vencimento date, p_valor numeric, p_descricao text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) THEN RAISE EXCEPTION 'Informe um valor válido (até 2 casas decimais).' USING ERRCODE = 'check_violation'; END IF;
  IF p_vencimento IS NULL OR p_vencimento < DATE '2000-01-01' OR p_vencimento > DATE '2100-12-31' THEN RAISE EXCEPTION 'Informe um vencimento válido.' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.impostos (id_empresa, id_parcelamento, numero_parcela, tipo, nome, orgao, competencia, vencimento, valor, descricao, criado_por)
  VALUES (p_id_empresa, p_id_parcelamento, p_numero, p_tipo, btrim(p_nome), btrim(p_orgao), p_competencia, p_vencimento, p_valor, nullif(btrim(coalesce(p_descricao, '')), ''), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.lancamentos_financeiros (id_empresa, tipo, descricao, valor, id_categoria, data_competencia, data_vencimento, status, contraparte,
                                              criado_por, atualizado_por, natureza_financeira, id_imposto)
  VALUES (p_id_empresa, 'despesa', left(btrim(p_nome) || CASE WHEN p_numero IS NOT NULL THEN '' WHEN p_competencia IS NOT NULL THEN ' — ' || to_char(p_competencia, 'MM/YYYY') ELSE '' END, 200),
          p_valor, public.categoria_imposto(p_id_empresa), coalesce(p_competencia, date_trunc('month', p_vencimento)::date), p_vencimento, 'pendente', left(btrim(p_orgao), 120),
          auth.uid(), auth.uid(), 'operacional', v_id);
  RETURN v_id;
END;
$$;

-- ===== Impostos =====
CREATE OR REPLACE FUNCTION public.salvar_imposto(p_id uuid, p_id_empresa uuid, p_tipo text, p_nome text, p_orgao text, p_competencia date, p_vencimento date,
  p_valor numeric, p_descricao text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.impostos; l public.lancamentos_financeiros; v_id uuid; v_comp date := date_trunc('month', p_competencia)::date; v_campos text[] := '{}';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = '28000'; END IF;
  -- Acesso primeiro (ID de outra empresa não revela nada além de "não encontrado")
  IF p_id IS NOT NULL THEN
    SELECT * INTO i FROM public.impostos WHERE id = p_id FOR UPDATE;
    IF i.id IS NULL OR NOT public.pode_gerenciar_impostos(i.id_empresa) THEN RAISE EXCEPTION 'Imposto não encontrado.' USING ERRCODE = '42501'; END IF;
    IF i.id_parcelamento IS NOT NULL THEN RAISE EXCEPTION 'Parcelas são alteradas pelo parcelamento.' USING ERRCODE = 'check_violation'; END IF;
  END IF;
  IF coalesce(p_tipo, '') NOT IN ('das', 'fgts', 'darf', 'iss', 'icms', 'pis_cofins', 'inss', 'outro') THEN RAISE EXCEPTION 'Tipo de imposto inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_nome, ''))) NOT BETWEEN 2 AND 120 OR char_length(btrim(coalesce(p_orgao, ''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Informe nome e órgão.' USING ERRCODE = 'check_violation'; END IF;
  IF v_comp IS NULL THEN RAISE EXCEPTION 'Informe a competência.' USING ERRCODE = 'check_violation'; END IF;
  IF p_id IS NULL THEN
    IF p_id_empresa IS NULL OR NOT public.pode_gerenciar_impostos(p_id_empresa) THEN RAISE EXCEPTION 'Sem permissão para gerenciar os impostos desta empresa.' USING ERRCODE = '42501'; END IF;
    v_id := public.criar_imposto_interno(p_id_empresa, NULL, NULL, p_tipo, p_nome, p_orgao, v_comp, p_vencimento, p_valor, p_descricao);
    INSERT INTO public.historico_impostos (id_empresa, id_imposto, acao, dados, id_usuario) VALUES (p_id_empresa, v_id, 'criado', jsonb_build_object('valor', p_valor, 'vencimento', p_vencimento), auth.uid());
    PERFORM public.notificar_impostos(p_id_empresa, 'empresa', 'Novo imposto lançado', btrim(p_nome) || ' — vence em ' || to_char(p_vencimento, 'DD/MM/YYYY') || ' (' || to_char(p_valor, 'FM999G999G990D00') || ').');
    RETURN v_id;
  END IF;
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id_imposto = i.id FOR UPDATE;
  IF i.status = 'cancelado' OR l.status = 'pago' THEN RAISE EXCEPTION 'Imposto pago ou cancelado não pode ser alterado (estorne o pagamento no Financeiro antes).' USING ERRCODE = 'check_violation'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) OR p_vencimento IS NULL THEN RAISE EXCEPTION 'Informe valor e vencimento válidos.' USING ERRCODE = 'check_violation'; END IF;
  IF i.valor <> p_valor THEN v_campos := array_append(v_campos, 'valor'); END IF;
  IF i.vencimento <> p_vencimento THEN v_campos := array_append(v_campos, 'vencimento'); END IF;
  IF i.competencia IS DISTINCT FROM v_comp OR i.tipo <> p_tipo OR i.nome <> btrim(p_nome) OR i.orgao <> btrim(p_orgao) OR i.descricao IS DISTINCT FROM nullif(btrim(coalesce(p_descricao, '')), '') THEN v_campos := array_append(v_campos, 'dados'); END IF;
  UPDATE public.impostos SET tipo = p_tipo, nome = btrim(p_nome), orgao = btrim(p_orgao), competencia = v_comp, vencimento = p_vencimento, valor = p_valor,
         descricao = nullif(btrim(coalesce(p_descricao, '')), ''), atualizado_em = now() WHERE id = i.id;
  PERFORM set_config('unnify.operacao_imposto', 'sim', true);
  UPDATE public.lancamentos_financeiros SET valor = p_valor, data_vencimento = p_vencimento, data_competencia = v_comp, contraparte = left(btrim(p_orgao), 120),
         descricao = left(btrim(p_nome) || ' — ' || to_char(v_comp, 'MM/YYYY'), 200), atualizado_por = auth.uid() WHERE id = l.id;
  PERFORM set_config('unnify.operacao_imposto', '', true);
  IF cardinality(v_campos) > 0 THEN
    INSERT INTO public.historico_impostos (id_empresa, id_imposto, acao, dados, id_usuario)
    VALUES (i.id_empresa, i.id, 'editado', jsonb_build_object('campos', v_campos, 'valor_de', i.valor, 'valor_para', p_valor, 'vencimento_de', i.vencimento, 'vencimento_para', p_vencimento), auth.uid());
  END IF;
  RETURN i.id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Já existe este imposto para a mesma competência.' USING ERRCODE = '23505';
END;
$$;

-- Declaração de pagamento (não é confirmação bancária)
CREATE OR REPLACE FUNCTION public.informar_pagamento_imposto(p_id uuid, p_data date, p_valor numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.impostos; l public.lancamentos_financeiros;
BEGIN
  SELECT * INTO i FROM public.impostos WHERE id = p_id FOR UPDATE;
  IF i.id IS NULL OR NOT public.pode_gerenciar_impostos(i.id_empresa) THEN RAISE EXCEPTION 'Imposto não encontrado.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id_imposto = i.id;
  IF i.status <> 'pendente' OR l.status <> 'pendente' THEN RAISE EXCEPTION 'Só impostos pendentes recebem informação de pagamento.' USING ERRCODE = 'check_violation'; END IF;
  IF p_data IS NULL OR p_data > public.hoje_brasil() THEN RAISE EXCEPTION 'A data do pagamento não pode ser futura.' USING ERRCODE = 'check_violation'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) THEN RAISE EXCEPTION 'Informe o valor pago.' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.impostos SET status = 'pagamento_informado', informado_em = now(), informado_por = auth.uid(), data_pagamento_informada = p_data, valor_informado = p_valor, atualizado_em = now() WHERE id = i.id;
  INSERT INTO public.historico_impostos (id_empresa, id_imposto, acao, dados, id_usuario) VALUES (i.id_empresa, i.id, 'pagamento_informado', jsonb_build_object('data', p_data, 'valor', p_valor), auth.uid());
  PERFORM public.notificar_impostos(i.id_empresa, CASE WHEN public.e_gestor_empresa(i.id_empresa) THEN 'contador' ELSE 'empresa' END,
    'Pagamento de imposto informado', i.nome || ' — informado como pago em ' || to_char(p_data, 'DD/MM/YYYY') || '. Aguarda confirmação no Financeiro.');
END;
$$;

-- Confirmação = baixa no Financeiro (conta + saldo + movimentação). Exige permissão financeira (o banco confere na baixa).
CREATE OR REPLACE FUNCTION public.confirmar_pagamento_imposto(p_id uuid, p_data date, p_id_conta uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.impostos; l public.lancamentos_financeiros;
BEGIN
  SELECT * INTO i FROM public.impostos WHERE id = p_id FOR UPDATE;
  IF i.id IS NULL OR NOT public.pode_gerenciar_impostos(i.id_empresa) THEN RAISE EXCEPTION 'Imposto não encontrado.' USING ERRCODE = '42501'; END IF;
  IF i.status = 'cancelado' THEN RAISE EXCEPTION 'Imposto cancelado.' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id_imposto = i.id;
  PERFORM public.registrar_baixa_lancamento(l.id, p_data, p_id_conta, l.valor);
  INSERT INTO public.historico_impostos (id_empresa, id_imposto, acao, dados, id_usuario) VALUES (i.id_empresa, i.id, 'pagamento_confirmado', jsonb_build_object('data', p_data), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_imposto(p_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.impostos; l public.lancamentos_financeiros;
BEGIN
  SELECT * INTO i FROM public.impostos WHERE id = p_id FOR UPDATE;
  IF i.id IS NULL OR NOT public.pode_gerenciar_impostos(i.id_empresa) THEN RAISE EXCEPTION 'Imposto não encontrado.' USING ERRCODE = '42501'; END IF;
  IF i.status = 'cancelado' THEN RAISE EXCEPTION 'Este imposto já está cancelado.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id_imposto = i.id FOR UPDATE;
  IF l.status = 'pago' THEN RAISE EXCEPTION 'Imposto pago: estorne o pagamento no Financeiro antes de cancelar.' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.impostos SET status = 'cancelado', cancelado_em = now(), motivo_cancelamento = btrim(p_motivo), atualizado_em = now() WHERE id = i.id;
  PERFORM set_config('unnify.operacao_imposto', 'sim', true);
  UPDATE public.lancamentos_financeiros SET status = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(), atualizado_por = auth.uid() WHERE id = l.id AND status = 'pendente';
  PERFORM set_config('unnify.operacao_imposto', '', true);
  INSERT INTO public.historico_impostos (id_empresa, id_imposto, acao, dados, id_usuario) VALUES (i.id_empresa, i.id, 'cancelado', jsonb_build_object('motivo', btrim(p_motivo)), auth.uid());
END;
$$;

-- Guia ou comprovante já enviado ao bucket (caminho <empresa>/<imposto>/<tipo>-<uuid>.<ext>)
CREATE OR REPLACE FUNCTION public.registrar_arquivo_imposto(p_id_imposto uuid, p_tipo text, p_caminho text, p_nome text, p_tamanho bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.impostos; v_tam bigint; v_id uuid;
BEGIN
  SELECT * INTO i FROM public.impostos WHERE id = p_id_imposto;
  IF i.id IS NULL OR NOT public.pode_gerenciar_impostos(i.id_empresa) THEN RAISE EXCEPTION 'Imposto não encontrado.' USING ERRCODE = '42501'; END IF;
  IF coalesce(p_tipo, '') NOT IN ('guia', 'comprovante') THEN RAISE EXCEPTION 'Tipo de arquivo inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF i.status = 'cancelado' THEN RAISE EXCEPTION 'Imposto cancelado.' USING ERRCODE = 'check_violation'; END IF;
  IF p_caminho !~ ('^' || i.id_empresa || '/' || i.id || '/' || p_tipo || '-[0-9a-f-]{36}\.(pdf|jpg|png)$') THEN RAISE EXCEPTION 'Caminho do arquivo inválido.' USING ERRCODE = 'check_violation'; END IF;
  SELECT (o.metadata->>'size')::bigint INTO v_tam FROM storage.objects o WHERE o.bucket_id = 'guias-impostos' AND o.name = p_caminho;
  IF NOT FOUND OR v_tam IS DISTINCT FROM p_tamanho THEN RAISE EXCEPTION 'Arquivo não encontrado ou tamanho não confere.' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.arquivos_impostos (id_empresa, id_imposto, tipo, caminho, nome_arquivo, tamanho, enviado_por)
  VALUES (i.id_empresa, i.id, p_tipo, p_caminho, left(btrim(p_nome), 200), p_tamanho, auth.uid()) RETURNING id INTO v_id;
  INSERT INTO public.historico_impostos (id_empresa, id_imposto, acao, dados, id_usuario)
  VALUES (i.id_empresa, i.id, CASE WHEN p_tipo = 'guia' THEN 'guia_enviada' ELSE 'comprovante_enviado' END, jsonb_build_object('arquivo', left(btrim(p_nome), 200)), auth.uid());
  IF p_tipo = 'guia' THEN
    PERFORM public.notificar_impostos(i.id_empresa, 'empresa', 'Guia de imposto disponível', i.nome || ' — vence em ' || to_char(i.vencimento, 'DD/MM/YYYY') || '.');
  END IF;
  RETURN v_id;
END;
$$;

-- ===== Parcelamentos =====
-- p_parcelas: [{"vencimento": "AAAA-MM-DD", "valor": n}] — valores podem diferir entre si
CREATE OR REPLACE FUNCTION public.salvar_parcelamento_tributario(p_id_empresa uuid, p_tributo text, p_orgao text, p_numero_acordo text, p_valor_negociado numeric,
  p_observacoes text, p_parcelas jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; it jsonb; n integer := 0;
BEGIN
  IF p_id_empresa IS NULL OR NOT public.pode_gerenciar_impostos(p_id_empresa) THEN RAISE EXCEPTION 'Sem permissão para gerenciar os impostos desta empresa.' USING ERRCODE = '42501'; END IF;
  IF char_length(btrim(coalesce(p_tributo, ''))) NOT BETWEEN 2 AND 120 OR char_length(btrim(coalesce(p_orgao, ''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Informe tributo e órgão.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_numero_acordo, ''))) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Informe o número do acordo.' USING ERRCODE = 'check_violation'; END IF;
  IF p_valor_negociado IS NULL OR p_valor_negociado <= 0 OR p_valor_negociado <> round(p_valor_negociado, 2) THEN RAISE EXCEPTION 'Informe o valor negociado.' USING ERRCODE = 'check_violation'; END IF;
  IF jsonb_typeof(p_parcelas) <> 'array' OR jsonb_array_length(p_parcelas) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Informe de 1 a 120 parcelas.' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.parcelamentos_tributarios (id_empresa, tributo, orgao, numero_acordo, valor_negociado, observacoes, criado_por)
  VALUES (p_id_empresa, btrim(p_tributo), btrim(p_orgao), btrim(p_numero_acordo), p_valor_negociado, nullif(btrim(coalesce(p_observacoes, '')), ''), auth.uid())
  RETURNING id INTO v_id;
  FOR it IN SELECT * FROM jsonb_array_elements(p_parcelas) LOOP
    n := n + 1;
    PERFORM public.criar_imposto_interno(p_id_empresa, v_id, n, 'parcelamento',
      left(btrim(p_tributo) || ' — parcela ' || n || '/' || jsonb_array_length(p_parcelas), 120), p_orgao, NULL,
      (it->>'vencimento')::date, (it->>'valor')::numeric, 'Acordo ' || btrim(p_numero_acordo));
  END LOOP;
  INSERT INTO public.historico_impostos (id_empresa, id_parcelamento, acao, dados, id_usuario)
  VALUES (p_id_empresa, v_id, 'parcelamento_criado', jsonb_build_object('parcelas', n, 'valor_negociado', p_valor_negociado), auth.uid());
  PERFORM public.notificar_impostos(p_id_empresa, 'empresa', 'Parcelamento tributário cadastrado', btrim(p_tributo) || ' — ' || n || ' parcelas (acordo ' || btrim(p_numero_acordo) || ').');
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Já existe um parcelamento com este número de acordo.' USING ERRCODE = '23505';
  WHEN invalid_datetime_format OR invalid_text_representation OR datetime_field_overflow THEN
  RAISE EXCEPTION 'Parcela com vencimento ou valor inválido.' USING ERRCODE = 'check_violation';
END;
$$;

-- Cancela as parcelas ainda não pagas (pagas são preservadas)
CREATE OR REPLACE FUNCTION public.cancelar_parcelamento_tributario(p_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.parcelamentos_tributarios; r record;
BEGIN
  SELECT * INTO p FROM public.parcelamentos_tributarios WHERE id = p_id FOR UPDATE;
  IF p.id IS NULL OR NOT public.pode_gerenciar_impostos(p.id_empresa) THEN RAISE EXCEPTION 'Parcelamento não encontrado.' USING ERRCODE = '42501'; END IF;
  IF p.cancelado_em IS NOT NULL THEN RAISE EXCEPTION 'Este parcelamento já está cancelado.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.' USING ERRCODE = 'check_violation'; END IF;
  FOR r IN SELECT i.id FROM public.impostos i JOIN public.lancamentos_financeiros l ON l.id_imposto = i.id
            WHERE i.id_parcelamento = p.id AND i.status <> 'cancelado' AND l.status <> 'pago' ORDER BY i.numero_parcela LOOP
    UPDATE public.impostos SET status = 'cancelado', cancelado_em = now(), motivo_cancelamento = 'Parcelamento cancelado: ' || btrim(p_motivo), atualizado_em = now() WHERE id = r.id;
    PERFORM set_config('unnify.operacao_imposto', 'sim', true);
    UPDATE public.lancamentos_financeiros SET status = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(), atualizado_por = auth.uid() WHERE id_imposto = r.id AND status = 'pendente';
    PERFORM set_config('unnify.operacao_imposto', '', true);
  END LOOP;
  UPDATE public.parcelamentos_tributarios SET cancelado_em = now(), motivo_cancelamento = btrim(p_motivo), atualizado_em = now() WHERE id = p.id;
  INSERT INTO public.historico_impostos (id_empresa, id_parcelamento, acao, dados, id_usuario) VALUES (p.id_empresa, p.id, 'parcelamento_cancelado', jsonb_build_object('motivo', btrim(p_motivo)), auth.uid());
END;
$$;

-- ===== Consultas =====
CREATE OR REPLACE FUNCTION public.situacao_imposto(p_status text, p_status_lancamento text, p_vencimento date)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN p_status_lancamento = 'pago' THEN 'pago' WHEN p_status = 'cancelado' THEN 'cancelado' WHEN p_status = 'pagamento_informado' THEN 'pagamento_informado'
              WHEN p_vencimento < public.hoje_brasil() THEN 'vencido' ELSE 'pendente' END;
$$;

CREATE OR REPLACE FUNCTION public.buscar_impostos(p_id_empresa uuid, p_busca text DEFAULT NULL, p_situacao text DEFAULT NULL, p_tipo text DEFAULT NULL,
  p_vencimento text DEFAULT NULL, p_origem text DEFAULT 'correntes', p_limite integer DEFAULT 50, p_deslocamento integer DEFAULT 0)
RETURNS TABLE (id uuid, id_parcelamento uuid, numero_parcela integer, tipo text, nome text, orgao text, competencia date, vencimento date, valor numeric, descricao text,
               situacao text, data_pagamento date, data_pagamento_informada date, id_lancamento uuid, guia_caminho text, guia_nome text, guia_tamanho bigint, guia_enviada_em timestamptz,
               comprovantes bigint, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b text := nullif(btrim(coalesce(p_busca, '')), ''); h date := public.hoje_brasil();
BEGIN
  IF NOT public.pode_gerenciar_impostos(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso aos impostos desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    WITH base AS (
      SELECT i.*, public.situacao_imposto(i.status, l.status, i.vencimento) AS sit, l.data_pagamento AS pago_em, l.id AS lanc
        FROM public.impostos i JOIN public.lancamentos_financeiros l ON l.id_imposto = i.id
       WHERE i.id_empresa = p_id_empresa
         AND (coalesce(p_origem, 'correntes') = 'todos' OR (p_origem = 'correntes' AND i.id_parcelamento IS NULL) OR (p_origem = 'parcelas' AND i.id_parcelamento IS NOT NULL))
         AND (p_tipo IS NULL OR i.tipo = p_tipo)
         AND (b IS NULL OR i.nome ILIKE '%' || b || '%' OR i.orgao ILIKE '%' || b || '%' OR to_char(i.competencia, 'MM/YYYY') LIKE '%' || b || '%'))
    SELECT base.id, base.id_parcelamento, base.numero_parcela, base.tipo, base.nome, base.orgao, base.competencia, base.vencimento, base.valor, base.descricao, base.sit,
           base.pago_em, base.data_pagamento_informada, base.lanc, g.caminho, g.nome_arquivo, g.tamanho, g.criado_em,
           (SELECT count(*) FROM public.arquivos_impostos a WHERE a.id_imposto = base.id AND a.tipo = 'comprovante'), count(*) OVER ()
      FROM base LEFT JOIN LATERAL (SELECT a.caminho, a.nome_arquivo, a.tamanho, a.criado_em FROM public.arquivos_impostos a WHERE a.id_imposto = base.id AND a.tipo = 'guia' ORDER BY a.criado_em DESC LIMIT 1) g ON true
     WHERE (p_situacao IS NULL OR base.sit = p_situacao)
       AND (p_vencimento IS NULL OR (p_vencimento = 'vencidos' AND base.sit = 'vencido') OR (p_vencimento = '7' AND base.vencimento BETWEEN h AND h + 7)
            OR (p_vencimento = '30' AND base.vencimento BETWEEN h AND h + 30) OR (p_vencimento = 'mes' AND date_trunc('month', base.vencimento) = date_trunc('month', h)))
     ORDER BY base.vencimento, base.nome
     LIMIT least(greatest(coalesce(p_limite, 50), 1), 200) OFFSET greatest(coalesce(p_deslocamento, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_parcelamentos_tributarios(p_id_empresa uuid)
RETURNS TABLE (id uuid, tributo text, orgao text, numero_acordo text, valor_negociado numeric, observacoes text, situacao text, parcelas bigint, pagas bigint,
               saldo numeric, proximo_vencimento date, atrasadas bigint, criado_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_gerenciar_impostos(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso aos impostos desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT p.id, p.tributo, p.orgao, p.numero_acordo, p.valor_negociado, p.observacoes,
           CASE WHEN p.cancelado_em IS NOT NULL THEN 'cancelado' WHEN count(*) FILTER (WHERE l.status <> 'pago' AND i.status <> 'cancelado') = 0 THEN 'concluido' ELSE 'em_andamento' END,
           count(*), count(*) FILTER (WHERE l.status = 'pago'),
           coalesce(sum(i.valor) FILTER (WHERE l.status <> 'pago' AND i.status <> 'cancelado'), 0),
           min(i.vencimento) FILTER (WHERE l.status <> 'pago' AND i.status <> 'cancelado'),
           count(*) FILTER (WHERE l.status <> 'pago' AND i.status = 'pendente' AND i.vencimento < public.hoje_brasil()), p.criado_em
      FROM public.parcelamentos_tributarios p JOIN public.impostos i ON i.id_parcelamento = p.id JOIN public.lancamentos_financeiros l ON l.id_imposto = i.id
     WHERE p.id_empresa = p_id_empresa
     GROUP BY p.id ORDER BY p.criado_em DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.resumo_impostos(p_id_empresa uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE h date := public.hoje_brasil();
BEGIN
  IF NOT public.pode_gerenciar_impostos(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso aos impostos desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT jsonb_build_object(
    'a_pagar', coalesce(sum(i.valor) FILTER (WHERE l.status = 'pendente' AND i.status <> 'cancelado'), 0),
    'qtd_a_pagar', count(*) FILTER (WHERE l.status = 'pendente' AND i.status <> 'cancelado'),
    'vencidos', count(*) FILTER (WHERE l.status = 'pendente' AND i.status = 'pendente' AND i.vencimento < h),
    'vencendo_7', count(*) FILTER (WHERE l.status = 'pendente' AND i.status <> 'cancelado' AND i.vencimento BETWEEN h AND h + 7),
    'guias', (SELECT count(DISTINCT a.id_imposto) FROM public.arquivos_impostos a WHERE a.id_empresa = p_id_empresa AND a.tipo = 'guia'),
    'pagos_90', count(*) FILTER (WHERE l.status = 'pago' AND l.data_pagamento >= h - 90))
    FROM public.impostos i JOIN public.lancamentos_financeiros l ON l.id_imposto = i.id WHERE i.id_empresa = p_id_empresa);
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_lancamento_imposto(), public.categoria_imposto(uuid), public.notificar_impostos(uuid, text, text, text),
  public.criar_imposto_interno(uuid, uuid, integer, text, text, text, date, date, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pode_gerenciar_impostos(uuid), public.salvar_imposto(uuid, uuid, text, text, text, date, date, numeric, text),
  public.informar_pagamento_imposto(uuid, date, numeric), public.confirmar_pagamento_imposto(uuid, date, uuid), public.cancelar_imposto(uuid, text),
  public.registrar_arquivo_imposto(uuid, text, text, text, bigint), public.salvar_parcelamento_tributario(uuid, text, text, text, numeric, text, jsonb),
  public.cancelar_parcelamento_tributario(uuid, text), public.situacao_imposto(text, text, date),
  public.buscar_impostos(uuid, text, text, text, text, text, integer, integer), public.listar_parcelamentos_tributarios(uuid), public.resumo_impostos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_gerenciar_impostos(uuid), public.salvar_imposto(uuid, uuid, text, text, text, date, date, numeric, text),
  public.informar_pagamento_imposto(uuid, date, numeric), public.confirmar_pagamento_imposto(uuid, date, uuid), public.cancelar_imposto(uuid, text),
  public.registrar_arquivo_imposto(uuid, text, text, text, bigint), public.salvar_parcelamento_tributario(uuid, text, text, text, numeric, text, jsonb),
  public.cancelar_parcelamento_tributario(uuid, text), public.situacao_imposto(text, text, date),
  public.buscar_impostos(uuid, text, text, text, text, text, integer, integer), public.listar_parcelamentos_tributarios(uuid), public.resumo_impostos(uuid) TO authenticated;
