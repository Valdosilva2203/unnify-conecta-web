-- Reverte "excluir impostos". Itens excluídos VOLTAM a aparecer (e seus lançamentos são restaurados em Contas a pagar), o histórico
-- "excluido"/"parcelamento_excluido" é removido e as colunas de exclusão são descartadas. ATENÇÃO: falha se, depois das exclusões, o mesmo
-- tributo/competência ou número de acordo foi cadastrado de novo (índices únicos antigos) — resolva a duplicidade antes. Fazer backup antes.
DROP TRIGGER IF EXISTS bloquear_arquivo_imposto_excluido ON public.arquivos_impostos;
DROP TRIGGER IF EXISTS bloquear_parcelamento_excluido ON public.parcelamentos_tributarios;
DROP TRIGGER IF EXISTS bloquear_imposto_excluido ON public.impostos;
DROP FUNCTION IF EXISTS public.bloquear_imposto_excluido();
DROP FUNCTION IF EXISTS public.excluir_parcelamento_tributario(uuid);
DROP FUNCTION IF EXISTS public.excluir_imposto(uuid);
SELECT set_config('unnify.operacao_imposto', 'sim', true);
UPDATE public.lancamentos_financeiros SET excluido_em = NULL, excluido_por = NULL WHERE id_imposto IN (SELECT id FROM public.impostos WHERE excluido_em IS NOT NULL);
SELECT set_config('unnify.operacao_imposto', '', true);
DELETE FROM public.historico_impostos WHERE acao IN ('excluido', 'parcelamento_excluido');
ALTER TABLE public.historico_impostos DROP CONSTRAINT historico_impostos_acao_check;
ALTER TABLE public.historico_impostos ADD CONSTRAINT historico_impostos_acao_check CHECK (acao IN ('criado', 'editado', 'guia_enviada', 'guia_excluida', 'comprovante_enviado',
  'pagamento_informado', 'pagamento_confirmado', 'cancelado', 'parcelamento_criado', 'parcelamento_cancelado'));
DROP INDEX public.impostos_sem_duplicidade;
CREATE UNIQUE INDEX impostos_sem_duplicidade ON public.impostos (id_empresa, tipo, lower(btrim(nome)), competencia) WHERE id_parcelamento IS NULL AND status <> 'cancelado';
DROP INDEX public.parcelamentos_tributarios_acordo;
CREATE UNIQUE INDEX parcelamentos_tributarios_acordo ON public.parcelamentos_tributarios (id_empresa, lower(btrim(numero_acordo)));

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

ALTER TABLE public.impostos DROP COLUMN excluido_em, DROP COLUMN excluido_por;
ALTER TABLE public.parcelamentos_tributarios DROP COLUMN excluido_em, DROP COLUMN excluido_por;
NOTIFY pgrst, 'reload schema';
