-- Categorias financeiras: ícone escolhido pelo usuário (só aparência; cálculos não mudam).
-- O ícone é um IDENTIFICADOR de uma lista fixa (Lucide) — nunca SVG/HTML/código enviado pelo usuário.

CREATE OR REPLACE FUNCTION public.icones_categoria_permitidos()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['tag', 'house', 'zap', 'wifi', 'utensils', 'car', 'users', 'landmark', 'truck', 'megaphone', 'shopping-cart',
               'briefcase', 'heart-pulse', 'graduation-cap', 'wallet', 'package', 'fuel', 'phone', 'building', 'receipt',
               'banknote', 'piggy-bank', 'wrench', 'plane', 'shirt', 'coffee', 'gift', 'laptop', 'file-text', 'scale',
               'calculator', 'droplets', 'bus', 'shield-check', 'credit-card', 'trending-up', 'store']::text[];
$$;

ALTER TABLE public.categorias_financeiras ADD COLUMN icone text NOT NULL DEFAULT 'tag';
ALTER TABLE public.categorias_financeiras ADD CONSTRAINT categorias_financeiras_icone
  CHECK (icone = ANY (public.icones_categoria_permitidos()));

-- Categorias iniciais já existentes ganham ícones coerentes (as demais ficam com o padrão 'tag')
UPDATE public.categorias_financeiras c
   SET icone = m.icone
  FROM (VALUES ('receita', 'Venda de produtos', 'shopping-cart'), ('receita', 'Prestação de serviços', 'briefcase'),
               ('receita', 'Outras receitas', 'wallet'), ('despesa', 'Aluguel', 'house'), ('despesa', 'Energia', 'zap'),
               ('despesa', 'Internet', 'wifi'), ('despesa', 'Salários', 'users'), ('despesa', 'Impostos', 'landmark'),
               ('despesa', 'Fornecedores', 'truck'), ('despesa', 'Marketing', 'megaphone'), ('despesa', 'Outras despesas', 'tag')
       ) AS m(tipo, nome, icone)
 WHERE c.tipo = m.tipo AND c.nome = m.nome AND c.icone = 'tag';

-- Modelos iniciais com ícone (continua idempotente)
CREATE OR REPLACE FUNCTION public.inicializar_categorias_financeiras(p_id_empresa uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inseridas integer;
BEGIN
  IF NOT public.pode_gerenciar_financeiro(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para configurar o financeiro desta empresa.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.categorias_financeiras (id_empresa, tipo, nome, cor, icone, criado_por)
  SELECT p_id_empresa, m.tipo, m.nome, m.cor, m.icone, auth.uid()
    FROM (VALUES
      ('receita', 'Venda de produtos', '#16a34a', 'shopping-cart'), ('receita', 'Prestação de serviços', '#0d9488', 'briefcase'),
      ('receita', 'Outras receitas', '#65a30d', 'wallet'),
      ('despesa', 'Aluguel', '#ef4444', 'house'), ('despesa', 'Energia', '#f59e0b', 'zap'), ('despesa', 'Internet', '#3b82f6', 'wifi'),
      ('despesa', 'Salários', '#8b5cf6', 'users'), ('despesa', 'Impostos', '#dc2626', 'landmark'), ('despesa', 'Fornecedores', '#0ea5e9', 'truck'),
      ('despesa', 'Marketing', '#ec4899', 'megaphone'), ('despesa', 'Outras despesas', '#9ca3af', 'tag')
    ) AS m(tipo, nome, cor, icone)
  ON CONFLICT (id_empresa, tipo, lower(nome)) DO NOTHING;
  GET DIAGNOSTICS v_inseridas = ROW_COUNT;
  RETURN v_inseridas;
END;
$$;

-- Salvar categoria: mesma função, com ícone opcional validado
DROP FUNCTION public.salvar_categoria_financeira(uuid, uuid, text, text, text);
CREATE FUNCTION public.salvar_categoria_financeira(p_id uuid, p_id_empresa uuid, p_tipo text, p_nome text, p_cor text, p_icone text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_empresa uuid;
BEGIN
  IF p_icone IS NOT NULL AND NOT (p_icone = ANY (public.icones_categoria_permitidos())) THEN
    RAISE EXCEPTION 'Ícone inválido.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_cor IS NOT NULL AND p_cor !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'Cor inválida.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_id IS NULL THEN
    IF NOT public.pode_gerenciar_financeiro(p_id_empresa) THEN
      RAISE EXCEPTION 'Sem permissão para gerenciar categorias desta empresa.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.categorias_financeiras (id_empresa, tipo, nome, cor, icone, criado_por)
    VALUES (p_id_empresa, p_tipo, btrim(p_nome), coalesce(p_cor, '#9ca3af'), coalesce(p_icone, 'tag'), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    SELECT id_empresa INTO v_empresa FROM public.categorias_financeiras WHERE id = p_id;
    IF v_empresa IS NULL OR NOT public.pode_gerenciar_financeiro(v_empresa) THEN
      RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.categorias_financeiras
       SET nome = btrim(p_nome), cor = coalesce(p_cor, cor), icone = coalesce(p_icone, icone), atualizado_em = now()
     WHERE id = p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'Já existe uma categoria com este nome.' USING ERRCODE = 'unique_violation';
  WHEN check_violation THEN
    IF SQLERRM IN ('Ícone inválido.', 'Cor inválida.') THEN RAISE; END IF;
    RAISE EXCEPTION 'Nome da categoria inválido (2 a 60 caracteres).' USING ERRCODE = 'check_violation';
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_categoria_financeira(uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_categoria_financeira(uuid, uuid, text, text, text, text) TO authenticated;

-- Lista de lançamentos traz o ícone da categoria
CREATE OR REPLACE VIEW public.lancamentos_financeiros_situacao WITH (security_invoker = true) AS
SELECT l.id, l.id_empresa, l.tipo, l.descricao, l.valor, l.id_categoria, c.nome AS categoria_nome, c.cor AS categoria_cor,
       l.data_competencia, l.data_vencimento, l.data_pagamento, l.status,
       CASE WHEN l.status = 'pendente' AND l.data_vencimento < public.hoje_brasil() THEN 'vencido' ELSE l.status END AS situacao,
       l.contraparte, l.observacoes, l.criado_em, l.atualizado_em, l.baixado_em, l.baixado_por,
       (SELECT count(*) FROM public.anexos_financeiros a WHERE a.id_lancamento = l.id AND a.excluido_em IS NULL) AS qtd_anexos,
       l.id_conta_financeira, cf.nome AS conta_nome, c.icone AS categoria_icone
  FROM public.lancamentos_financeiros l
  JOIN public.categorias_financeiras c ON c.id = l.id_categoria
  LEFT JOIN public.contas_financeiras cf ON cf.id = l.id_conta_financeira
 WHERE l.excluido_em IS NULL;

-- Resumo: despesas por categoria passam a trazer o ícone (cálculo inalterado)
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.resumo_financeiro(uuid,date)'::regprocedure);
BEGIN
  IF position('''icone''' IN v_def) = 0 THEN
    EXECUTE replace(v_def, '''cor'', c.cor, ''valor'', t.total', '''cor'', c.cor, ''icone'', c.icone, ''valor'', t.total');
  END IF;
END $$;
