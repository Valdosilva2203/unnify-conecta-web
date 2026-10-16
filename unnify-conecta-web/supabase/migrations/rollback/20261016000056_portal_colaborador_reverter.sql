-- Reverte a 000056 (Portal do Colaborador + Ponto). Use SÓ se nenhum dado real foi criado (ver CHECKLIST-056.md). APAGA convites, acessos, jornadas, feriados, marcações, correções, apurações e histórico do ponto.
-- Ocorrências da folha criadas pela integração permanecem (são registros da 052).
BEGIN;
DROP POLICY IF EXISTS "Folha: holerite do próprio colaborador" ON storage.objects;
DROP POLICY IF EXISTS "Ponto: envio da foto" ON storage.objects;
DROP POLICY IF EXISTS "Ponto: leitura da foto" ON storage.objects;
-- O bucket "ponto" fica (pode conter fotos); remover pela API de Storage se vazio.
DROP TRIGGER IF EXISTS revogar_portal_no_desligamento ON public.funcionarios;
DROP TRIGGER IF EXISTS notificar_holerites_aprovados ON public.competencias_folha;

DROP FUNCTION IF EXISTS public.finalizar_expurgo_fotos_ponto(uuid), public.concluir_expurgo_foto_ponto(uuid, uuid, boolean, text),
  public.iniciar_expurgo_fotos_ponto(integer), public.fotos_elegiveis_expurgo(), public.encerrar_retencao_legal_ponto(uuid),
  public.criar_retencao_legal_ponto(uuid, uuid, text), public.salvar_politica_retencao_ponto(uuid, integer, boolean, text),
  public.notificar_holerites_aprovados(), public.notificar_colaborador(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.integrar_ponto_folha(uuid, date), public.marcacoes_do_dia(uuid, date), public.painel_ponto(uuid, date),
  public.responder_esclarecimento_ponto(uuid, text), public.solicitar_esclarecimento_ponto(uuid, text), public.desfazer_conferencia_ponto(uuid),
  public.conferir_apuracao_ponto(uuid, text, text), public.apurar_ponto_competencia(uuid, date), public.excluir_feriado_empresa(uuid),
  public.salvar_feriado_empresa(uuid, date, text), public.salvar_jornada_funcionario(uuid, date, jsonb, integer, integer, integer, text),
  public.corrigir_ponto_rh(uuid, text, date, time, text, uuid, text, boolean), public.responder_solicitacao_ponto(uuid, boolean, text),
  public.minhas_solicitacoes_ponto(uuid), public.cancelar_solicitacao_ponto(uuid), public.solicitar_correcao_ponto(uuid, text, date, time, text, uuid, text, boolean),
  public.minha_jornada(uuid, date), public.meu_ponto(uuid, date, date), public.anexar_foto_marcacao(uuid, boolean),
  public.pode_ler_foto_ponto(text), public.pode_enviar_foto_ponto(text), public.registrar_marcacao_ponto(uuid, uuid, text, text, numeric, numeric, numeric, text),
  public.colaborador_pode_ler_holerite(text), public.meus_holerites(uuid), public.portal_colaborador(), public.aceitar_convite_colaborador(text),
  public.dados_convite_colaborador(text), public.situacao_portal_funcionario(uuid), public.revogar_portal_no_desligamento(),
  public.revogar_acesso_colaborador(uuid, text), public.revogar_convite_colaborador(uuid), public.registrar_envio_convite_colaborador(uuid, boolean),
  public.criar_convite_colaborador(uuid, text, text), public.exigir_dia_nao_integrado(uuid, date), public.apurar_dia_ponto(uuid, date),
  public.calcular_dia_ponto(uuid, date), public.validar_escala_ponto(jsonb), public.horario_dos_minutos(integer), public.minutos_do_horario(text);

DROP TABLE IF EXISTS public.expurgos_fotos_ponto, public.execucoes_expurgo_ponto, public.retencoes_legais_ponto, public.politicas_retencao_ponto;
DROP TABLE IF EXISTS public.historico_ponto, public.apuracoes_ponto, public.marcacoes_desconsideradas;
ALTER TABLE IF EXISTS public.solicitacoes_ponto DROP CONSTRAINT IF EXISTS solicitacoes_ponto_marcacao;
DROP TABLE IF EXISTS public.marcacoes_ponto;
DROP FUNCTION IF EXISTS public.aplicar_solicitacao_ponto(public.solicitacoes_ponto);
DROP FUNCTION IF EXISTS public.validar_solicitacao_ponto(public.funcionarios, text, date, time, text, uuid, text, boolean);
DROP TABLE IF EXISTS public.solicitacoes_ponto, public.feriados_empresa, public.jornadas_funcionario, public.acessos_colaborador, public.convites_colaborador;
DROP FUNCTION IF EXISTS public.proteger_registro_ponto(), public.registrar_historico_ponto(uuid, uuid, text, text, jsonb),
  public.exigir_rh_funcionario(uuid), public.exigir_colaborador(uuid), public.funcionario_do_colaborador(uuid);
ALTER TABLE public.funcionarios DROP COLUMN IF EXISTS email;
COMMIT;
NOTIFY pgrst, 'reload schema';
