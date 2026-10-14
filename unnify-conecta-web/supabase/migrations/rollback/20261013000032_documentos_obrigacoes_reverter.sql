-- REVERSÃO da migration 20261013000032 (Documentos e Obrigações).
-- ATENÇÃO: remove as tabelas do módulo. Só é segura enquanto não houver dados reais nelas (a checagem abaixo impede perda).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.documentos_empresa) OR EXISTS (SELECT 1 FROM public.solicitacoes_documentos) OR EXISTS (SELECT 1 FROM public.obrigacoes_empresa) THEN
    RAISE EXCEPTION 'Há documentos, solicitações ou obrigações cadastrados; faça backup e remova-os antes de reverter.';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'documentos-empresas') THEN
    RAISE EXCEPTION 'Há arquivos no bucket documentos-empresas; remova-os antes de reverter.';
  END IF;
END;
$$;
-- 1. Storage (políticas e bucket vazio). O Storage bloqueia DELETE direto; a liberação vale só nesta transação.
DROP POLICY IF EXISTS "Documentos de empresas: envio" ON storage.objects;
DROP POLICY IF EXISTS "Documentos de empresas: leitura" ON storage.objects;
DROP POLICY IF EXISTS "Documentos de empresas: remoção" ON storage.objects;
SET LOCAL storage.allow_delete_query = 'true';
DELETE FROM storage.buckets WHERE id = 'documentos-empresas';
-- 2. Visão e tabelas (com suas políticas) antes das funções que as políticas usam
DROP VIEW IF EXISTS public.obrigacoes_empresa_situacao;
DROP TABLE IF EXISTS public.historico_obrigacoes, public.obrigacoes_empresa, public.historico_solicitacoes_documentos, public.historico_documentos;
ALTER TABLE IF EXISTS public.documentos_empresa DROP CONSTRAINT IF EXISTS documentos_solicitacao_fk;
DROP TABLE IF EXISTS public.solicitacoes_documentos, public.documentos_empresa;
-- 3. Funções
DROP FUNCTION IF EXISTS public.resumo_documentos_obrigacoes(uuid), public.criar_tarefa_da_obrigacao(uuid), public.alterar_situacao_obrigacao(uuid, text, text),
  public.salvar_obrigacao(uuid, uuid, text, text, text, uuid, date, text, uuid), public.responsaveis_obrigacoes(uuid),
  public.cancelar_solicitacao_documento(uuid, text), public.analisar_solicitacao_documento(uuid, boolean, text), public.responder_solicitacao_documento(uuid, uuid),
  public.criar_solicitacao_documento(uuid, text, text, date), public.excluir_documento(uuid), public.atualizar_documento(uuid, text, text, boolean),
  public.registrar_documento(uuid, text, text, text, boolean, text), public.pode_ler_arquivo_documento(text), public.pode_remover_arquivo_documento(text, text),
  public.caminho_documento_valido(text), public.pode_gerenciar_obrigacoes(uuid), public.pode_enviar_documentos(uuid);
