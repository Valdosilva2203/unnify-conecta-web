-- Agenda (MVP): compromissos próprios + visão unificada (somente leitura) de tarefas, obrigações e vencimentos financeiros.
-- Integração SEM duplicar: tarefas/obrigações/lançamentos são lidos ao vivo das tabelas de origem (status sempre sincronizado);
-- mudanças de status nesses itens usam as funções dos próprios módulos (alterar_status_tarefa, alterar_situacao_obrigacao).
-- Acesso (função SECURITY DEFINER aplica a regra de CADA origem):
--   compromissos → membro ativo da empresa; "privado" só criador/responsável; "empresa" todos os membros. Contador/Admin: não.
--   tarefas → pode_acessar_contexto_tarefas · obrigações → pode_gerenciar_obrigacoes (inclui contador com permissão)
--   vencimentos → pode_ver_financeiro (inclui contador com "Ver financeiro"). Admin Master sem acesso automático.
-- Datas: timestamptz; períodos e "dia" no fuso America/Sao_Paulo.
-- Reversão: rollback/20261014000037_agenda_reverter.sql

CREATE OR REPLACE FUNCTION public.e_membro_empresa(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuarios_empresas ue JOIN public.empresas e ON e.id = ue.id_empresa
                  WHERE ue.id_empresa = p_id_empresa AND ue.id_usuario = auth.uid() AND ue.ativo AND e.tipo_empresa = 'comum');
$$;

CREATE TABLE public.compromissos_agenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  titulo text NOT NULL,
  descricao text,
  local text,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  dia_inteiro boolean NOT NULL DEFAULT false,
  categoria text NOT NULL DEFAULT 'reuniao',
  status text NOT NULL DEFAULT 'agendado',
  id_responsavel uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  visibilidade text NOT NULL DEFAULT 'empresa',
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  excluido_em timestamptz,
  excluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  CONSTRAINT compromissos_titulo CHECK (char_length(btrim(titulo)) BETWEEN 2 AND 120),
  CONSTRAINT compromissos_descricao CHECK (descricao IS NULL OR char_length(descricao) <= 2000),
  CONSTRAINT compromissos_local CHECK (local IS NULL OR char_length(local) <= 120),
  CONSTRAINT compromissos_periodo CHECK (fim > inicio AND fim - inicio <= interval '31 days'),
  CONSTRAINT compromissos_datas CHECK (inicio BETWEEN timestamptz '2000-01-01' AND timestamptz '2100-12-31'),
  CONSTRAINT compromissos_categoria CHECK (categoria IN ('reuniao', 'consulta', 'visita', 'treinamento', 'pessoal', 'outro')),
  CONSTRAINT compromissos_status CHECK (status IN ('agendado', 'confirmado', 'concluido', 'cancelado')),
  CONSTRAINT compromissos_visibilidade CHECK (visibilidade IN ('privado', 'empresa'))
);
CREATE INDEX idx_compromissos_empresa_inicio ON public.compromissos_agenda (id_empresa, inicio) WHERE excluido_em IS NULL;

CREATE OR REPLACE FUNCTION public.pode_ver_compromisso(c public.compromissos_agenda)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.excluido_em IS NULL AND public.e_membro_empresa(c.id_empresa)
     AND (c.visibilidade = 'empresa' OR c.criado_por = auth.uid() OR c.id_responsavel = auth.uid());
$$;

ALTER TABLE public.compromissos_agenda ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compromissos_agenda FROM anon, authenticated;
GRANT SELECT ON public.compromissos_agenda TO authenticated;
CREATE POLICY "Agenda: compromissos visíveis" ON public.compromissos_agenda FOR SELECT TO authenticated
  USING (excluido_em IS NULL AND public.e_membro_empresa(id_empresa)
         AND (visibilidade = 'empresa' OR criado_por = auth.uid() OR id_responsavel = auth.uid()));

-- Membros que podem ser responsáveis (somente membros ativos da empresa; sem e-mails)
CREATE OR REPLACE FUNCTION public.membros_agenda(p_id_empresa uuid)
RETURNS TABLE (id_usuario uuid, nome text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.e_membro_empresa(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso à agenda desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT ue.id_usuario, coalesce(nullif(btrim(p.nome_completo), ''), 'Usuário')
    FROM public.usuarios_empresas ue JOIN public.perfis p ON p.id_usuario = ue.id_usuario
   WHERE ue.id_empresa = p_id_empresa AND ue.ativo ORDER BY 2;
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Faça login para usar a agenda.' USING ERRCODE = '28000'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v FROM public.compromissos_agenda WHERE id = p_id FOR UPDATE;
    IF v.id IS NULL OR NOT public.pode_ver_compromisso(v) OR NOT (v.criado_por = v_uid OR v.id_responsavel = v_uid OR public.e_gestor_empresa(v.id_empresa)) THEN
      RAISE EXCEPTION 'Compromisso não encontrado.' USING ERRCODE = '42501';
    END IF;
    p_id_empresa := v.id_empresa; -- a empresa de um compromisso nunca muda
  ELSIF p_id_empresa IS NULL OR NOT public.e_membro_empresa(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem acesso à agenda desta empresa.' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(coalesce(p_titulo, ''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Informe um título (2 a 120 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim <= p_inicio THEN RAISE EXCEPTION 'O término deve ser depois do início.' USING ERRCODE = 'check_violation'; END IF;
  IF p_fim - p_inicio > interval '31 days' THEN RAISE EXCEPTION 'Um compromisso pode durar no máximo 31 dias.' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_categoria, '') NOT IN ('reuniao', 'consulta', 'visita', 'treinamento', 'pessoal', 'outro') THEN RAISE EXCEPTION 'Categoria inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_status, 'agendado') NOT IN ('agendado', 'confirmado', 'concluido', 'cancelado') THEN RAISE EXCEPTION 'Status inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_visibilidade, '') NOT IN ('privado', 'empresa') THEN RAISE EXCEPTION 'Visibilidade inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF p_id_responsavel IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.usuarios_empresas WHERE id_empresa = p_id_empresa AND id_usuario = p_id_responsavel AND ativo) THEN
    RAISE EXCEPTION 'O responsável precisa ser membro da empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(coalesce(p_descricao, '')) > 2000 OR char_length(coalesce(p_local, '')) > 120 THEN RAISE EXCEPTION 'Descrição ou local muito longos.' USING ERRCODE = 'check_violation'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.compromissos_agenda (id_empresa, titulo, descricao, local, inicio, fim, dia_inteiro, categoria, status, id_responsavel, visibilidade, criado_por, atualizado_por)
    VALUES (p_id_empresa, btrim(p_titulo), nullif(btrim(coalesce(p_descricao, '')), ''), nullif(btrim(coalesce(p_local, '')), ''), p_inicio, p_fim, coalesce(p_dia_inteiro, false),
            p_categoria, coalesce(p_status, 'agendado'), coalesce(p_id_responsavel, v_uid), p_visibilidade, v_uid, v_uid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.compromissos_agenda
       SET titulo = btrim(p_titulo), descricao = nullif(btrim(coalesce(p_descricao, '')), ''), local = nullif(btrim(coalesce(p_local, '')), ''),
           inicio = p_inicio, fim = p_fim, dia_inteiro = coalesce(p_dia_inteiro, false), categoria = p_categoria, status = coalesce(p_status, status),
           id_responsavel = p_id_responsavel, visibilidade = p_visibilidade, atualizado_por = v_uid, atualizado_em = now()
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
  IF v.id IS NULL OR NOT public.pode_ver_compromisso(v) OR NOT (v.criado_por = auth.uid() OR v.id_responsavel = auth.uid() OR public.e_gestor_empresa(v.id_empresa)) THEN
    RAISE EXCEPTION 'Compromisso não encontrado.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.compromissos_agenda SET excluido_em = now(), excluido_por = auth.uid() WHERE id = p_id;
END;
$$;

-- Visão unificada do período [p_inicio, p_fim] (datas no fuso de São Paulo; até 62 dias). Cada origem com a SUA regra de acesso.
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
  v_tarefas boolean := public.pode_acessar_contexto_tarefas('empresa', p_id_empresa);
  v_obrig boolean := public.pode_gerenciar_obrigacoes(p_id_empresa);
  v_fin boolean := public.pode_ver_financeiro(p_id_empresa);
BEGIN
  IF auth.uid() IS NULL OR NOT (v_membro OR v_tarefas OR v_obrig OR v_fin) THEN
    RAISE EXCEPTION 'Sem acesso à agenda desta empresa.' USING ERRCODE = '42501';
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio OR p_fim - p_inicio > 62 THEN
    RAISE EXCEPTION 'Período inválido (até 62 dias).' USING ERRCODE = 'check_violation';
  END IF;
  v_ini := p_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim := (p_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  IF v_membro THEN
    RETURN QUERY
      SELECT 'compromisso'::text, c.id, c.titulo, c.descricao, c.local, c.inicio, c.fim, c.dia_inteiro, c.categoria,
             CASE WHEN c.status IN ('agendado', 'confirmado') AND c.fim < now() THEN 'atrasado' ELSE c.status END, c.status,
             c.id_responsavel, p.nome_completo, c.visibilidade, NULL::numeric, '/app/agenda'::text,
             (c.criado_por = auth.uid() OR c.id_responsavel = auth.uid() OR public.e_gestor_empresa(c.id_empresa))
        FROM public.compromissos_agenda c LEFT JOIN public.perfis p ON p.id_usuario = c.id_responsavel
       WHERE c.id_empresa = p_id_empresa AND c.excluido_em IS NULL AND c.inicio < v_fim AND c.fim > v_ini
         AND (c.visibilidade = 'empresa' OR c.criado_por = auth.uid() OR c.id_responsavel = auth.uid());
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

REVOKE ALL ON FUNCTION public.e_membro_empresa(uuid), public.pode_ver_compromisso(public.compromissos_agenda) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.membros_agenda(uuid), public.salvar_compromisso(uuid, uuid, text, text, text, timestamptz, timestamptz, boolean, text, text, uuid, text),
  public.excluir_compromisso(uuid), public.agenda_eventos(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.e_membro_empresa(uuid), public.pode_ver_compromisso(public.compromissos_agenda),
  public.membros_agenda(uuid), public.salvar_compromisso(uuid, uuid, text, text, text, timestamptz, timestamptz, boolean, text, text, uuid, text),
  public.excluir_compromisso(uuid), public.agenda_eventos(uuid, date, date) TO authenticated;
