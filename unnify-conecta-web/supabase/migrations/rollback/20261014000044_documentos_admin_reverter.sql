-- Reverte Documentos administrativos. ATENÇÃO: remove o cadastro dos documentos (os arquivos do bucket ficam; o bucket não é
-- removido para não apagar arquivos). Fazer backup antes.
DROP POLICY IF EXISTS "Documentos admin: leitura" ON storage.objects;
DROP POLICY IF EXISTS "Documentos admin: envio" ON storage.objects;
DROP POLICY IF EXISTS "Documentos admin: descarte de envio não registrado" ON storage.objects;
DROP FUNCTION IF EXISTS public.buscar_documentos_admin(uuid, text, text, text, boolean, integer, integer);
DROP FUNCTION IF EXISTS public.resumo_documentos_admin();
DROP FUNCTION IF EXISTS public.registrar_download_documento_admin(uuid, integer);
DROP FUNCTION IF EXISTS public.excluir_documento_admin(uuid, boolean);
DROP FUNCTION IF EXISTS public.atualizar_documento_admin(uuid, text, uuid, boolean);
DROP FUNCTION IF EXISTS public.registrar_versao_documento_admin(uuid, integer, text, bigint, text, text, text, text, boolean, boolean);
DROP FUNCTION IF EXISTS public.registrar_documento_admin(uuid, text, text, text, text, bigint, text, boolean);
DROP FUNCTION IF EXISTS public.excluir_pasta_documentos_admin(uuid);
DROP FUNCTION IF EXISTS public.salvar_pasta_documentos_admin(uuid, text);
DROP FUNCTION IF EXISTS public.conferir_arquivo_documento_admin(text, bigint);
DROP FUNCTION IF EXISTS public.exigir_admin_master();
DROP TABLE IF EXISTS public.historico_documentos_admin;
DROP TRIGGER IF EXISTS proteger_versao_documento_admin ON public.versoes_documentos_admin;
DROP TABLE IF EXISTS public.versoes_documentos_admin;
DROP TABLE IF EXISTS public.documentos_admin;
DROP TABLE IF EXISTS public.pastas_documentos_admin;
DROP FUNCTION IF EXISTS public.proteger_versao_documento_admin();
