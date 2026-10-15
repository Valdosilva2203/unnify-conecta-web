-- Reverte Impostos. Lançamentos já gerados no Financeiro permanecem (sem o vínculo id_imposto). ATENÇÃO: apaga o cadastro de
-- impostos/parcelamentos e o histórico; os arquivos do bucket ficam (o bucket não é removido). Remove a permissão
-- "gerenciar_impostos" dos vínculos/convites antes de restaurar a regra antiga. Fazer backup antes.
DROP POLICY IF EXISTS "Guias de impostos: leitura" ON storage.objects;
DROP POLICY IF EXISTS "Guias de impostos: envio" ON storage.objects;
DROP POLICY IF EXISTS "Guias de impostos: descarte de envio não registrado" ON storage.objects;
DROP FUNCTION IF EXISTS public.resumo_impostos(uuid);
DROP FUNCTION IF EXISTS public.listar_parcelamentos_tributarios(uuid);
DROP FUNCTION IF EXISTS public.buscar_impostos(uuid, text, text, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.situacao_imposto(text, text, date);
DROP FUNCTION IF EXISTS public.cancelar_parcelamento_tributario(uuid, text);
DROP FUNCTION IF EXISTS public.salvar_parcelamento_tributario(uuid, text, text, text, numeric, text, jsonb);
DROP FUNCTION IF EXISTS public.registrar_arquivo_imposto(uuid, text, text, text, bigint);
DROP FUNCTION IF EXISTS public.cancelar_imposto(uuid, text);
DROP FUNCTION IF EXISTS public.confirmar_pagamento_imposto(uuid, date, uuid);
DROP FUNCTION IF EXISTS public.informar_pagamento_imposto(uuid, date, numeric);
DROP FUNCTION IF EXISTS public.salvar_imposto(uuid, uuid, text, text, text, date, date, numeric, text);
DROP FUNCTION IF EXISTS public.criar_imposto_interno(uuid, uuid, integer, text, text, text, date, date, numeric, text);
DROP FUNCTION IF EXISTS public.notificar_impostos(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.categoria_imposto(uuid);
DROP TRIGGER IF EXISTS proteger_lancamento_imposto ON public.lancamentos_financeiros;
DROP FUNCTION IF EXISTS public.proteger_lancamento_imposto();
DROP INDEX IF EXISTS public.lancamentos_um_por_imposto;
ALTER TABLE public.lancamentos_financeiros DROP COLUMN IF EXISTS id_imposto;
DROP TABLE IF EXISTS public.historico_impostos;
DROP TABLE IF EXISTS public.arquivos_impostos;
DROP TABLE IF EXISTS public.impostos;
DROP TABLE IF EXISTS public.parcelamentos_tributarios;
DROP FUNCTION IF EXISTS public.pode_gerenciar_impostos(uuid);
UPDATE public.vinculos_contabeis SET permissoes = array_remove(permissoes, 'gerenciar_impostos') WHERE 'gerenciar_impostos' = ANY (permissoes);
UPDATE public.convites_vinculos SET permissoes = array_remove(permissoes, 'gerenciar_impostos') WHERE 'gerenciar_impostos' = ANY (permissoes);
ALTER TABLE public.vinculos_contabeis DROP CONSTRAINT vinculos_contabeis_permissoes;
ALTER TABLE public.vinculos_contabeis ADD CONSTRAINT vinculos_contabeis_permissoes CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
  'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro']);
ALTER TABLE public.convites_vinculos DROP CONSTRAINT convites_permissoes;
ALTER TABLE public.convites_vinculos ADD CONSTRAINT convites_permissoes CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
  'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro']);
