-- REVERSÃO da migration 20261013000033 (só funções de leitura; nenhum dado é afetado).
DROP FUNCTION IF EXISTS public.proximas_obrigacoes_contador(integer), public.painel_contador(),
  public.historico_relacionamento_contabil(uuid, integer), public.resumo_relacionamento_contabil(uuid);
