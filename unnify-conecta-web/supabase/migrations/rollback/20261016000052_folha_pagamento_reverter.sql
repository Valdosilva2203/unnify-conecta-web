-- Reverte a 20261016000052_folha_pagamento.sql. ATENÇÃO: apaga ocorrências, envios, devoluções e o histórico da Folha de Pagamento.
-- Lançamentos de encargos já criados no Financeiro perdem o vínculo (id_valor_folha) mas permanecem; ajustes da aprovação permanecem.
-- Arquivos do bucket "folha" NÃO são apagados aqui (fazer pela API de Storage, se necessário).
DROP POLICY IF EXISTS "Folha: envio" ON storage.objects;
DROP POLICY IF EXISTS "Folha: leitura" ON storage.objects;
DROP POLICY IF EXISTS "Folha: descarte de envio não registrado" ON storage.objects;

DROP FUNCTION IF EXISTS public.painel_folha_pagamento(uuid, date), public.competencias_folha_empresa(uuid),
  public.anexar_comprovante_folha(uuid, uuid, uuid, text, text), public.solicitar_revisao_folha(uuid, uuid, text), public.aprovar_folha(uuid, uuid),
  public.devolucao_para_decisao_folha(uuid, uuid), public.concluir_devolucao_folha(uuid, text), public.faltas_devolucao_folha(uuid),
  public.informar_valores_folha(uuid, jsonb, jsonb), public.registrar_documento_devolucao_folha(uuid, text, uuid, text, text),
  public.devolucao_rascunho_folha(public.competencias_folha), public.solicitar_correcao_folha(uuid, text, jsonb), public.iniciar_processamento_folha(uuid),
  public.competencia_do_contador_folha(uuid, text[]), public.enviar_folha_contador(uuid, date, text, text, boolean), public.excluir_documento_folha(uuid),
  public.anexar_documento_ocorrencia_folha(uuid, text, text), public.validar_arquivo_folha(uuid, text), public.resolver_pendencia_folha(uuid, text),
  public.registrar_pendencia_folha(uuid, date, uuid, text), public.desfazer_conferencia_folha(uuid, date, uuid), public.confirmar_conferencia_folha(uuid, date, uuid, boolean),
  public.excluir_ocorrencia_folha(uuid), public.salvar_ocorrencia_folha(uuid, uuid, date, uuid, text, numeric, numeric, date, date, text, text, text),
  public.integrar_folha_financeiro(uuid), public.categoria_encargos_folha(uuid), public.snapshot_folha(public.competencias_folha),
  public.validar_ocorrencia_folha(text, numeric, numeric, date, date, text, text, date), public.invalidar_conferencia_folha(uuid, uuid, text),
  public.situacao_funcionario_folha(uuid, uuid), public.pendencias_abertas_folha(uuid, uuid), public.pendencia_ocorrencia_folha(public.ocorrencias_folha),
  public.funcionario_na_competencia(uuid, public.competencias_folha), public.competencia_editavel_folha(uuid, date), public.funcionarios_da_competencia(uuid, date),
  public.validar_competencia_folha(date), public.notificar_folha(uuid, text, text, text), public.registrar_evento_folha(uuid, uuid, text, text, integer, jsonb),
  public.pode_descartar_arquivo_folha(text, text), public.pode_ler_arquivo_folha(text, text), public.caminho_folha_valido(text);

DROP TRIGGER IF EXISTS proteger_lancamento_encargo_folha ON public.lancamentos_financeiros;
DROP FUNCTION IF EXISTS public.proteger_lancamento_encargo_folha();
DROP INDEX IF EXISTS public.lancamentos_um_por_encargo_folha;
ALTER TABLE public.lancamentos_financeiros DROP COLUMN IF EXISTS id_valor_folha;
ALTER TABLE public.ajustes_folha DROP COLUMN IF EXISTS id_devolucao_folha;

DROP TABLE IF EXISTS public.eventos_folha, public.documentos_folha, public.valores_folha, public.devolucoes_folha, public.pacotes_folha,
  public.conferencias_folha, public.pendencias_folha, public.ocorrencias_folha, public.competencias_folha;

DROP TRIGGER IF EXISTS atribuir_matricula_funcionario ON public.funcionarios;
DROP FUNCTION IF EXISTS public.atribuir_matricula_funcionario();
ALTER TABLE public.funcionarios DROP CONSTRAINT IF EXISTS funcionarios_matricula_unica;
ALTER TABLE public.funcionarios DROP COLUMN IF EXISTS matricula;

UPDATE public.vinculos_contabeis SET permissoes = array_remove(permissoes, 'processar_folha') WHERE 'processar_folha' = ANY (permissoes);
UPDATE public.convites_vinculos SET permissoes = array_remove(permissoes, 'processar_folha') WHERE 'processar_folha' = ANY (permissoes);
DROP FUNCTION IF EXISTS public.pode_processar_folha(uuid);
ALTER TABLE public.vinculos_contabeis DROP CONSTRAINT vinculos_contabeis_permissoes;
ALTER TABLE public.vinculos_contabeis ADD CONSTRAINT vinculos_contabeis_permissoes CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
  'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro', 'gerenciar_impostos', 'gerenciar_agenda',
  'gerenciar_certidoes']);
ALTER TABLE public.convites_vinculos DROP CONSTRAINT convites_permissoes;
ALTER TABLE public.convites_vinculos ADD CONSTRAINT convites_permissoes CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
  'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro', 'gerenciar_impostos', 'gerenciar_agenda',
  'gerenciar_certidoes']);
-- O bucket "folha" fica (pode conter arquivos); remover manualmente se vazio: DELETE FROM storage.buckets WHERE id = 'folha';
