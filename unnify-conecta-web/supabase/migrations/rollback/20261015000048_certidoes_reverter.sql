-- Reverte Certidões. ATENÇÃO: apaga cadastro, versões e histórico de certidões (os arquivos do bucket ficam; o bucket não é removido).
-- Remove a permissão "gerenciar_certidoes" de vínculos/convites antes de restaurar a regra antiga. Fazer backup antes.
DROP POLICY IF EXISTS "Certidões: envio" ON storage.objects;
DROP POLICY IF EXISTS "Certidões: leitura" ON storage.objects;
DROP POLICY IF EXISTS "Certidões: descarte de envio não registrado" ON storage.objects;
DROP FUNCTION IF EXISTS public.resumo_certidoes(uuid);
DROP FUNCTION IF EXISTS public.processar_alertas_certidoes();
DROP FUNCTION IF EXISTS public.verificar_alertas_certidoes(uuid);
DROP FUNCTION IF EXISTS public.alertas_certidoes_interno(uuid);
DROP FUNCTION IF EXISTS public.arquivar_certidao(uuid, text);
DROP FUNCTION IF EXISTS public.salvar_certidao(uuid, uuid, text, text, text, text, date, date, text, text, text, text);
DROP FUNCTION IF EXISTS public.notificar_certidoes(uuid, text, text, uuid);
DROP VIEW IF EXISTS public.certidoes_situacao;
DROP TABLE IF EXISTS public.historico_certidoes;
DROP TABLE IF EXISTS public.versoes_certidoes;
DROP TABLE IF EXISTS public.certidoes_empresa;
DROP FUNCTION IF EXISTS public.pode_descartar_arquivo_certidao(text, text);
DROP FUNCTION IF EXISTS public.pode_ler_arquivo_certidao(text, text);
DROP FUNCTION IF EXISTS public.caminho_certidao_valido(text);
DROP FUNCTION IF EXISTS public.pode_ver_certidoes(uuid);
DROP FUNCTION IF EXISTS public.pode_gerenciar_certidoes(uuid);
UPDATE public.vinculos_contabeis SET permissoes = array_remove(permissoes, 'gerenciar_certidoes') WHERE 'gerenciar_certidoes' = ANY (permissoes);
UPDATE public.convites_vinculos SET permissoes = array_remove(permissoes, 'gerenciar_certidoes') WHERE 'gerenciar_certidoes' = ANY (permissoes);
ALTER TABLE public.vinculos_contabeis DROP CONSTRAINT vinculos_contabeis_permissoes;
ALTER TABLE public.vinculos_contabeis ADD CONSTRAINT vinculos_contabeis_permissoes CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
  'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro', 'gerenciar_impostos', 'gerenciar_agenda']);
ALTER TABLE public.convites_vinculos DROP CONSTRAINT convites_permissoes;
ALTER TABLE public.convites_vinculos ADD CONSTRAINT convites_permissoes CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
  'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro', 'gerenciar_impostos', 'gerenciar_agenda']);
NOTIFY pgrst, 'reload schema';
