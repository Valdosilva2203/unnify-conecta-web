-- Agenda do contador — reutiliza a MESMA tabela e funções da Agenda (037); sem segunda agenda.
--   * Permissão nova do vínculo: "gerenciar_agenda" (o empresário libera; o banco confere em toda operação).
--   * Compromisso PESSOAL do contador: id_empresa NULL, sempre privado (só ele).
--   * Visibilidade nova "compartilhado": membros da empresa + contadores com vínculo ATIVO e "gerenciar_agenda".
--     "empresa" continua interna dos membros (o contador NÃO a vê); "privado" só criador/responsável.
--   * Uma única linha por compromisso: alteração e conclusão aparecem para os dois lados (sincronizado por construção).
--   * Perdeu o vínculo ou a permissão → perde o acesso aos compromissos da empresa (inclusive os que criou); os pessoais ficam.
--   * Responsável contador só em compromisso compartilhado (ou ele mesmo). Aviso (notificação) ao outro lado ao criar compartilhado.
-- Não destrutiva: só relaxa/estende restrições; compromissos existentes continuam iguais.
-- Reversão: rollback/20261014000046_agenda_contador_reverter.sql

ALTER TABLE public.vinculos_contabeis DROP CONSTRAINT vinculos_contabeis_permissoes;
ALTER TABLE public.vinculos_contabeis ADD CONSTRAINT vinculos_contabeis_permissoes CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
  'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro', 'gerenciar_impostos', 'gerenciar_agenda']);
ALTER TABLE public.convites_vinculos DROP CONSTRAINT convites_permissoes;
ALTER TABLE public.convites_vinculos ADD CONSTRAINT convites_permissoes CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
  'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro', 'gerenciar_impostos', 'gerenciar_agenda']);

ALTER TABLE public.compromissos_agenda ALTER COLUMN id_empresa DROP NOT NULL;
ALTER TABLE public.compromissos_agenda DROP CONSTRAINT compromissos_visibilidade;
ALTER TABLE public.compromissos_agenda ADD CONSTRAINT compromissos_visibilidade CHECK (visibilidade IN ('privado', 'empresa', 'compartilhado'));
ALTER TABLE public.compromissos_agenda ADD CONSTRAINT compromissos_pessoal CHECK (id_empresa IS NOT NULL OR visibilidade = 'privado');
CREATE INDEX idx_compromissos_pessoais ON public.compromissos_agenda (criado_por, inicio) WHERE id_empresa IS NULL AND excluido_em IS NULL;

CREATE OR REPLACE FUNCTION public.pode_ver_compromisso(c public.compromissos_agenda)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.excluido_em IS NULL AND (
    (c.id_empresa IS NULL AND c.criado_por = auth.uid())
    OR (c.id_empresa IS NOT NULL AND (
         (public.e_membro_empresa(c.id_empresa) AND (c.visibilidade IN ('empresa', 'compartilhado') OR c.criado_por = auth.uid() OR c.id_responsavel = auth.uid()))
      OR (public.contador_pode(c.id_empresa, 'gerenciar_agenda') AND (c.visibilidade = 'compartilhado' OR c.criado_por = auth.uid() OR c.id_responsavel = auth.uid()))))
  );
$$;

DROP POLICY "Agenda: compromissos visíveis" ON public.compromissos_agenda;
CREATE POLICY "Agenda: compromissos visíveis" ON public.compromissos_agenda FOR SELECT TO authenticated USING (public.pode_ver_compromisso(compromissos_agenda));

-- Quem pode ser responsável: membro vê membros + contadores autorizados; contador vê só a si e aos donos/sócios da empresa
CREATE OR REPLACE FUNCTION public.membros_agenda(p_id_empresa uuid)
RETURNS TABLE (id_usuario uuid, nome text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.e_membro_empresa(p_id_empresa) THEN
    RETURN QUERY
      SELECT x.id_usuario, x.nome FROM (
        SELECT ue.id_usuario, coalesce(nullif(btrim(p.nome_completo), ''), 'Usuário') AS nome
          FROM public.usuarios_empresas ue JOIN public.perfis p ON p.id_usuario = ue.id_usuario WHERE ue.id_empresa = p_id_empresa AND ue.ativo
        UNION
        SELECT v.id_contador, coalesce(nullif(btrim(p.nome_completo), ''), 'Contador') || ' (contador)'
          FROM public.vinculos_contabeis v JOIN public.perfis p ON p.id_usuario = v.id_contador
         WHERE v.id_empresa = p_id_empresa AND v.status = 'ativo' AND 'gerenciar_agenda' = ANY (v.permissoes)) x ORDER BY 2;
  ELSIF public.contador_pode(p_id_empresa, 'gerenciar_agenda') THEN
    RETURN QUERY
      SELECT x.id_usuario, x.nome FROM (
        SELECT p.id_usuario, coalesce(nullif(btrim(p.nome_completo), ''), 'Contador') AS nome FROM public.perfis p WHERE p.id_usuario = auth.uid()
        UNION
        SELECT ue.id_usuario, coalesce(nullif(btrim(p.nome_completo), ''), 'Usuário')
          FROM public.usuarios_empresas ue JOIN public.perfis p ON p.id_usuario = ue.id_usuario
         WHERE ue.id_empresa = p_id_empresa AND ue.ativo AND ue.tipo_vinculacao IN ('dono', 'socio')) x ORDER BY 2;
  ELSE
    RAISE EXCEPTION 'Sem acesso à agenda desta empresa.' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Aviso ao outro lado quando um compromisso COMPARTILHADO é criado (quem criou não recebe)
CREATE OR REPLACE FUNCTION public.notificar_compromisso_compartilhado(p_id_empresa uuid, p_titulo text, p_inicio timestamptz, p_pelo_contador boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid; v_msg text := left(p_titulo, 100) || ' — ' || to_char(p_inicio AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
BEGIN
  IF p_pelo_contador THEN
    FOR u IN SELECT ue.id_usuario FROM public.usuarios_empresas ue WHERE ue.id_empresa = p_id_empresa AND ue.ativo AND ue.tipo_vinculacao IN ('dono', 'socio') AND ue.id_usuario <> auth.uid() LOOP
      PERFORM public.notificar_usuario(u, 'agenda', 'Compromisso compartilhado pelo contador', v_msg, '/app/agenda', false);
    END LOOP;
  ELSE
    FOR u IN SELECT v.id_contador FROM public.vinculos_contabeis v WHERE v.id_empresa = p_id_empresa AND v.status = 'ativo' AND 'gerenciar_agenda' = ANY (v.permissoes) AND v.id_contador <> auth.uid() LOOP
      PERFORM public.notificar_usuario(u, 'agenda', 'Compromisso compartilhado pela empresa', v_msg, '/contador/agenda', false);
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_compromisso(
  p_id uuid, p_id_empresa uuid, p_titulo text, p_descricao text, p_local text, p_inicio timestamptz, p_fim timestamptz,
  p_dia_inteiro boolean, p_categoria text, p_status text, p_id_responsavel uuid, p_visibilidade text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v public.compromissos_agenda;
  v_id uuid;
  v_membro boolean;
  v_cont boolean;
  v_resp uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Faça login para usar a agenda.' USING ERRCODE = '28000'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v FROM public.compromissos_agenda WHERE id = p_id FOR UPDATE;
    IF v.id IS NULL OR NOT public.pode_ver_compromisso(v)
       OR NOT (v.criado_por = v_uid OR v.id_responsavel = v_uid OR (v.id_empresa IS NOT NULL AND public.e_gestor_empresa(v.id_empresa))) THEN
      RAISE EXCEPTION 'Compromisso não encontrado.' USING ERRCODE = '42501';
    END IF;
    p_id_empresa := v.id_empresa; -- a empresa de um compromisso nunca muda
  END IF;
  v_membro := p_id_empresa IS NOT NULL AND public.e_membro_empresa(p_id_empresa);
  v_cont := p_id_empresa IS NOT NULL AND NOT v_membro AND public.contador_pode(p_id_empresa, 'gerenciar_agenda');
  IF p_id IS NULL THEN
    IF p_id_empresa IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.perfis WHERE id_usuario = v_uid AND tipo_usuario = 'contador') THEN
        RAISE EXCEPTION 'Informe a empresa do compromisso.' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT (v_membro OR v_cont) THEN
      RAISE EXCEPTION 'Sem acesso à agenda desta empresa.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF char_length(btrim(coalesce(p_titulo, ''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Informe um título (2 a 120 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim <= p_inicio THEN RAISE EXCEPTION 'O término deve ser depois do início.' USING ERRCODE = 'check_violation'; END IF;
  IF p_fim - p_inicio > interval '31 days' THEN RAISE EXCEPTION 'Um compromisso pode durar no máximo 31 dias.' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_categoria, '') NOT IN ('reuniao', 'consulta', 'visita', 'treinamento', 'pessoal', 'outro') THEN RAISE EXCEPTION 'Categoria inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_status, 'agendado') NOT IN ('agendado', 'confirmado', 'concluido', 'cancelado') THEN RAISE EXCEPTION 'Status inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_visibilidade, '') NOT IN ('privado', 'empresa', 'compartilhado') THEN RAISE EXCEPTION 'Visibilidade inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF p_id_empresa IS NULL AND p_visibilidade <> 'privado' THEN RAISE EXCEPTION 'Compromisso pessoal é sempre privado.' USING ERRCODE = 'check_violation'; END IF;
  IF p_visibilidade = 'empresa' AND NOT v_membro THEN
    RAISE EXCEPTION 'A visibilidade "empresa" é interna dos membros da empresa; para incluir o contador use "compartilhado".' USING ERRCODE = 'check_violation';
  END IF;
  v_resp := coalesce(p_id_responsavel, CASE WHEN p_id IS NULL THEN v_uid END);
  IF v_resp IS NOT NULL AND v_resp <> v_uid THEN
    IF p_id_empresa IS NULL THEN
      RAISE EXCEPTION 'Compromisso pessoal só pode ter você como responsável.' USING ERRCODE = 'check_violation';
    ELSIF NOT (EXISTS (SELECT 1 FROM public.usuarios_empresas WHERE id_empresa = p_id_empresa AND id_usuario = v_resp AND ativo)
               OR (p_visibilidade = 'compartilhado' AND EXISTS (SELECT 1 FROM public.vinculos_contabeis WHERE id_empresa = p_id_empresa AND id_contador = v_resp AND status = 'ativo' AND 'gerenciar_agenda' = ANY (permissoes)))) THEN
      RAISE EXCEPTION 'O responsável precisa ser membro da empresa (ou o contador, em compromisso compartilhado).' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF char_length(coalesce(p_descricao, '')) > 2000 OR char_length(coalesce(p_local, '')) > 120 THEN RAISE EXCEPTION 'Descrição ou local muito longos.' USING ERRCODE = 'check_violation'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.compromissos_agenda (id_empresa, titulo, descricao, local, inicio, fim, dia_inteiro, categoria, status, id_responsavel, visibilidade, criado_por, atualizado_por)
    VALUES (p_id_empresa, btrim(p_titulo), nullif(btrim(coalesce(p_descricao, '')), ''), nullif(btrim(coalesce(p_local, '')), ''), p_inicio, p_fim, coalesce(p_dia_inteiro, false),
            p_categoria, coalesce(p_status, 'agendado'), v_resp, p_visibilidade, v_uid, v_uid)
    RETURNING id INTO v_id;
    IF p_visibilidade = 'compartilhado' AND p_id_empresa IS NOT NULL THEN
      PERFORM public.notificar_compromisso_compartilhado(p_id_empresa, btrim(p_titulo), p_inicio, v_cont);
    END IF;
  ELSE
    UPDATE public.compromissos_agenda
       SET titulo = btrim(p_titulo), descricao = nullif(btrim(coalesce(p_descricao, '')), ''), local = nullif(btrim(coalesce(p_local, '')), ''),
           inicio = p_inicio, fim = p_fim, dia_inteiro = coalesce(p_dia_inteiro, false), categoria = p_categoria, status = coalesce(p_status, status),
           id_responsavel = v_resp, visibilidade = p_visibilidade, atualizado_por = v_uid, atualizado_em = now()
     WHERE id = p_id;
    v_id := p_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_compromisso(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.compromissos_agenda;
BEGIN
  SELECT * INTO v FROM public.compromissos_agenda WHERE id = p_id FOR UPDATE;
  IF v.id IS NULL OR NOT public.pode_ver_compromisso(v)
     OR NOT (v.criado_por = auth.uid() OR v.id_responsavel = auth.uid() OR (v.id_empresa IS NOT NULL AND public.e_gestor_empresa(v.id_empresa))) THEN
    RAISE EXCEPTION 'Compromisso não encontrado.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.compromissos_agenda SET excluido_em = now(), excluido_por = auth.uid() WHERE id = p_id;
END;
$$;

-- Visão da empresa (empresário e, agora, contador com "gerenciar_agenda" nos compromissos compartilhados)
CREATE OR REPLACE FUNCTION public.agenda_eventos(p_id_empresa uuid, p_inicio date, p_fim date)
RETURNS TABLE (origem text, id uuid, titulo text, descricao text, local text, inicio timestamptz, fim timestamptz, dia_inteiro boolean,
               categoria text, status text, status_origem text, id_responsavel uuid, responsavel_nome text, visibilidade text,
               valor numeric, link text, editavel boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ini timestamptz;
  v_fim timestamptz;
  v_hoje date := public.hoje_brasil();
  v_membro boolean := public.e_membro_empresa(p_id_empresa);
  v_agcont boolean := public.contador_pode(p_id_empresa, 'gerenciar_agenda');
  v_tarefas boolean := public.pode_acessar_contexto_tarefas('empresa', p_id_empresa);
  v_obrig boolean := public.pode_gerenciar_obrigacoes(p_id_empresa);
  v_fin boolean := public.pode_ver_financeiro(p_id_empresa);
BEGIN
  IF auth.uid() IS NULL OR NOT (v_membro OR v_agcont OR v_tarefas OR v_obrig OR v_fin) THEN
    RAISE EXCEPTION 'Sem acesso à agenda desta empresa.' USING ERRCODE = '42501';
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio OR p_fim - p_inicio > 62 THEN
    RAISE EXCEPTION 'Período inválido (até 62 dias).' USING ERRCODE = 'check_violation';
  END IF;
  v_ini := p_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim := (p_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  IF v_membro OR v_agcont THEN
    RETURN QUERY
      SELECT 'compromisso'::text, c.id, c.titulo, c.descricao, c.local, c.inicio, c.fim, c.dia_inteiro, c.categoria,
             CASE WHEN c.status IN ('agendado', 'confirmado') AND c.fim < now() THEN 'atrasado' ELSE c.status END, c.status,
             c.id_responsavel, p.nome_completo, c.visibilidade, NULL::numeric, '/app/agenda'::text,
             (c.criado_por = auth.uid() OR c.id_responsavel = auth.uid() OR (v_membro AND public.e_gestor_empresa(c.id_empresa)))
        FROM public.compromissos_agenda c LEFT JOIN public.perfis p ON p.id_usuario = c.id_responsavel
       WHERE c.id_empresa = p_id_empresa AND c.excluido_em IS NULL AND c.inicio < v_fim AND c.fim > v_ini
         AND public.pode_ver_compromisso(c);
  END IF;

  IF v_tarefas THEN
    RETURN QUERY
      SELECT 'tarefa'::text, t.id, t.titulo, t.descricao, NULL::text,
             CASE WHEN t.hora IS NULL THEN t.prazo::timestamp AT TIME ZONE 'America/Sao_Paulo' ELSE (t.prazo + t.hora) AT TIME ZONE 'America/Sao_Paulo' END,
             CASE WHEN t.hora IS NULL THEN (t.prazo + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo' ELSE (t.prazo + t.hora + interval '30 minutes') AT TIME ZONE 'America/Sao_Paulo' END,
             t.hora IS NULL, 'tarefa'::text,
             CASE WHEN t.status = 'concluida' THEN 'concluido' WHEN t.status = 'cancelada' THEN 'cancelado'
                  WHEN t.prazo < v_hoje THEN 'atrasado' WHEN t.status = 'em_andamento' THEN 'em_andamento' ELSE 'pendente' END,
             t.status, t.id_responsavel, p.nome_completo, NULL::text, NULL::numeric, '/app/tarefas'::text, false
        FROM public.tarefas t LEFT JOIN public.perfis p ON p.id_usuario = t.id_responsavel
       WHERE t.contexto = 'empresa' AND t.id_empresa = p_id_empresa AND t.arquivada_em IS NULL AND t.prazo BETWEEN p_inicio AND p_fim;
  END IF;

  IF v_obrig THEN
    RETURN QUERY
      SELECT 'obrigacao'::text, o.id, o.titulo, o.descricao, NULL::text,
             o.data_vencimento::timestamp AT TIME ZONE 'America/Sao_Paulo', (o.data_vencimento + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo', true, 'obrigacao'::text,
             CASE o.situacao WHEN 'concluida' THEN 'concluido' WHEN 'cancelada' THEN 'cancelado' WHEN 'atrasada' THEN 'atrasado'
                             WHEN 'em_andamento' THEN 'em_andamento' ELSE 'pendente' END,
             o.situacao, o.id_responsavel, p.nome_completo, NULL::text, NULL::numeric, '/app/obrigacoes'::text, false
        FROM public.obrigacoes_empresa_situacao o LEFT JOIN public.perfis p ON p.id_usuario = o.id_responsavel
       WHERE o.id_empresa = p_id_empresa AND o.data_vencimento BETWEEN p_inicio AND p_fim;
  END IF;

  IF v_fin THEN
    RETURN QUERY
      SELECT 'financeiro'::text, l.id,
             (CASE WHEN l.tipo = 'receita' THEN 'Receber: ' ELSE 'Pagar: ' END) || l.descricao, NULL::text, NULL::text,
             l.data_vencimento::timestamp AT TIME ZONE 'America/Sao_Paulo', (l.data_vencimento + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo', true,
             CASE WHEN l.tipo = 'receita' THEN 'receber' ELSE 'pagar' END,
             CASE WHEN l.status = 'pago' THEN 'concluido' WHEN l.data_vencimento < v_hoje THEN 'atrasado' ELSE 'pendente' END,
             l.status, NULL::uuid, NULL::text, NULL::text, l.valor,
             CASE WHEN l.tipo = 'receita' THEN '/app/financeiro#receber' ELSE '/app/financeiro#pagar' END, false
        FROM public.lancamentos_financeiros l
       WHERE l.id_empresa = p_id_empresa AND l.excluido_em IS NULL AND l.status <> 'cancelado' AND l.data_vencimento BETWEEN p_inicio AND p_fim;
  END IF;
END;
$$;

-- Agenda do contador: compromissos pessoais + compartilhados das empresas com vínculo ativo e "gerenciar_agenda",
-- mais as obrigações (somente leitura) das empresas em que ele tem "gerenciar_obrigacoes". Nada de dados privados da empresa.
CREATE OR REPLACE FUNCTION public.agenda_contador(p_inicio date, p_fim date, p_id_empresa uuid DEFAULT NULL)
RETURNS TABLE (origem text, id uuid, titulo text, descricao text, local text, inicio timestamptz, fim timestamptz, dia_inteiro boolean,
               categoria text, status text, status_origem text, id_responsavel uuid, responsavel_nome text, visibilidade text,
               valor numeric, link text, editavel boolean, id_empresa uuid, empresa_nome text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ini timestamptz; v_fim timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.perfis WHERE id_usuario = auth.uid() AND tipo_usuario = 'contador') THEN
    RAISE EXCEPTION 'Agenda disponível para contadores.' USING ERRCODE = '42501';
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio OR p_fim - p_inicio > 62 THEN
    RAISE EXCEPTION 'Período inválido (até 62 dias).' USING ERRCODE = 'check_violation';
  END IF;
  v_ini := p_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim := (p_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  RETURN QUERY
    SELECT 'compromisso'::text, c.id, c.titulo, c.descricao, c.local, c.inicio, c.fim, c.dia_inteiro, c.categoria,
           CASE WHEN c.status IN ('agendado', 'confirmado') AND c.fim < now() THEN 'atrasado' ELSE c.status END, c.status,
           c.id_responsavel, p.nome_completo, c.visibilidade, NULL::numeric, '/contador/agenda'::text,
           (c.criado_por = auth.uid() OR c.id_responsavel = auth.uid()), c.id_empresa, coalesce(nullif(e.nome_comercial, ''), e.razao_social)
      FROM public.compromissos_agenda c LEFT JOIN public.perfis p ON p.id_usuario = c.id_responsavel LEFT JOIN public.empresas e ON e.id = c.id_empresa
     WHERE c.excluido_em IS NULL AND c.inicio < v_fim AND c.fim > v_ini
       AND (p_id_empresa IS NULL OR c.id_empresa = p_id_empresa)
       AND (c.id_empresa IS NULL OR public.contador_pode(c.id_empresa, 'gerenciar_agenda'))
       AND public.pode_ver_compromisso(c);
  RETURN QUERY
    SELECT 'obrigacao'::text, o.id, o.titulo, o.descricao, NULL::text,
           o.data_vencimento::timestamp AT TIME ZONE 'America/Sao_Paulo', (o.data_vencimento + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo', true, 'obrigacao'::text,
           CASE o.situacao WHEN 'concluida' THEN 'concluido' WHEN 'cancelada' THEN 'cancelado' WHEN 'atrasada' THEN 'atrasado'
                           WHEN 'em_andamento' THEN 'em_andamento' ELSE 'pendente' END,
           o.situacao, o.id_responsavel, p.nome_completo, NULL::text, NULL::numeric, '/contador/empresas/' || o.id_empresa || '#obrigacoes', false,
           o.id_empresa, coalesce(nullif(e.nome_comercial, ''), e.razao_social)
      FROM public.obrigacoes_empresa_situacao o JOIN public.empresas e ON e.id = o.id_empresa LEFT JOIN public.perfis p ON p.id_usuario = o.id_responsavel
     WHERE o.data_vencimento BETWEEN p_inicio AND p_fim AND (p_id_empresa IS NULL OR o.id_empresa = p_id_empresa)
       AND public.contador_pode(o.id_empresa, 'gerenciar_obrigacoes');
END;
$$;

REVOKE ALL ON FUNCTION public.notificar_compromisso_compartilhado(uuid, text, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agenda_contador(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agenda_contador(date, date, uuid), public.membros_agenda(uuid), public.agenda_eventos(uuid, date, date), public.pode_ver_compromisso(public.compromissos_agenda),
  public.salvar_compromisso(uuid, uuid, text, text, text, timestamptz, timestamptz, boolean, text, text, uuid, text), public.excluir_compromisso(uuid) TO authenticated;
