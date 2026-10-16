-- Portal do Colaborador + Controle de Ponto (auxiliar) — Fases 1 a 5.
-- 1. Convite (token de 256 bits gerado no SERVIDOR; o banco guarda só o SHA-256; 7 dias; uso único; revogável; um pendente por funcionário).
--    Vínculo usuário ↔ funcionário só por aceite com a SESSÃO do próprio usuário: token válido + e-mail CONFIRMADO igual ao do convite.
--    O e-mail sozinho nunca autoriza nada. Desligamento revoga acesso e convites na hora.
-- 2. Colaborador NÃO tem acesso direto a tabelas (nem a funcionarios/folha/financeiro): só funções que conferem o próprio vínculo ativo.
-- 3. Marcações imutáveis (hora do SERVIDOR, id do cliente = idempotência). Foto/GPS opcionais e registrados como estão (negado/indisponível).
--    Correções só por solicitação (incluir ou desconsiderar), com histórico; o original nunca muda.
-- 4. Apuração compara marcações × jornada configurada pelo RH (sem presumir regra trabalhista: tolerância, intervalo e tratamento configuráveis).
--    RH confere (classifica), pede esclarecimento, corrige mantendo os originais.
-- 5. Integração idempotente: conferidas viram ocorrências da Folha (052) só com a competência em preparação/correção; nada no Financeiro.
-- Não é REP-P homologado (Portaria MTP 671/2021): controle auxiliar. Admin Master sem acesso.
-- Idempotente (pode ser reaplicada). Reversão: rollback/20261016000056_portal_colaborador_reverter.sql — só antes de existirem dados reais;
-- depois disso, recuperar pelo backup (ver supabase/migrations/CHECKLIST-056.md).

-- ===== 1. Tabelas =====
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS email text
  CONSTRAINT funcionarios_email CHECK (email IS NULL OR (char_length(email) <= 254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));

CREATE TABLE IF NOT EXISTS public.convites_colaborador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_funcionario uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  email text NOT NULL,
  hash_token text NOT NULL UNIQUE CHECK (hash_token ~ '^[0-9a-f]{64}$'),
  expira_em timestamptz NOT NULL,
  enviado boolean,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  usado_em timestamptz,
  usado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  revogado_em timestamptz,
  revogado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS convites_colaborador_um_pendente ON public.convites_colaborador (id_funcionario) WHERE usado_em IS NULL AND revogado_em IS NULL;

CREATE TABLE IF NOT EXISTS public.acessos_colaborador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_funcionario uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  id_usuario uuid NOT NULL REFERENCES public.perfis(id_usuario) ON DELETE CASCADE,
  id_convite uuid REFERENCES public.convites_colaborador(id) ON DELETE SET NULL,
  ativado_em timestamptz NOT NULL DEFAULT now(),
  revogado_em timestamptz,
  revogado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  motivo_revogacao text CHECK (motivo_revogacao IS NULL OR char_length(motivo_revogacao) <= 300)
);
CREATE UNIQUE INDEX IF NOT EXISTS acessos_colaborador_um_ativo ON public.acessos_colaborador (id_funcionario) WHERE revogado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_acessos_colaborador_usuario ON public.acessos_colaborador (id_usuario) WHERE revogado_em IS NULL;

CREATE TABLE IF NOT EXISTS public.jornadas_funcionario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_funcionario uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  vigente_desde date NOT NULL,
  escala jsonb NOT NULL,
  tolerancia_minutos integer NOT NULL DEFAULT 10 CHECK (tolerancia_minutos BETWEEN 0 AND 60),
  intervalo_minimo_minutos integer NOT NULL DEFAULT 60 CHECK (intervalo_minimo_minutos BETWEEN 0 AND 240),
  limite_sem_intervalo_minutos integer NOT NULL DEFAULT 360 CHECK (limite_sem_intervalo_minutos BETWEEN 60 AND 720),
  tratamento_excedente text NOT NULL DEFAULT 'conferir' CHECK (tratamento_excedente IN ('conferir', 'hora_extra', 'banco_horas')),
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jornadas_uma_por_vigencia UNIQUE (id_funcionario, vigente_desde)
);

CREATE TABLE IF NOT EXISTS public.feriados_empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  data date NOT NULL,
  descricao text NOT NULL CHECK (char_length(btrim(descricao)) BETWEEN 2 AND 80),
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feriados_um_por_dia UNIQUE (id_empresa, data)
);

CREATE TABLE IF NOT EXISTS public.solicitacoes_ponto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_funcionario uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('incluir', 'desconsiderar')),
  data date NOT NULL,
  horario time,
  tipo_marcacao text CHECK (tipo_marcacao IS NULL OR tipo_marcacao IN ('entrada', 'saida_intervalo', 'retorno_intervalo', 'saida', 'outra')),
  dia_seguinte boolean NOT NULL DEFAULT false,
  id_marcacao uuid,
  motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 3 AND 500),
  origem text NOT NULL CHECK (origem IN ('colaborador', 'rh')),
  situacao text NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente', 'aprovada', 'recusada', 'cancelada')),
  resposta text CHECK (resposta IS NULL OR char_length(resposta) <= 500),
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  respondido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  respondido_em timestamptz,
  CONSTRAINT solicitacoes_ponto_dados CHECK ((tipo = 'incluir' AND horario IS NOT NULL AND tipo_marcacao IS NOT NULL AND id_marcacao IS NULL)
                                          OR (tipo = 'desconsiderar' AND id_marcacao IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_ponto ON public.solicitacoes_ponto (id_empresa, situacao);

CREATE TABLE IF NOT EXISTS public.marcacoes_ponto (
  id uuid PRIMARY KEY,
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_funcionario uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  id_usuario uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida_intervalo', 'retorno_intervalo', 'saida', 'outra')),
  registrado_em timestamptz NOT NULL DEFAULT now(),
  data_local date NOT NULL, -- data da JORNADA (turno que vira a meia-noite fica no dia em que começou)
  origem text NOT NULL DEFAULT 'portal' CHECK (origem IN ('portal', 'correcao')),
  id_solicitacao uuid REFERENCES public.solicitacoes_ponto(id) ON DELETE RESTRICT,
  situacao_localizacao text NOT NULL CHECK (situacao_localizacao IN ('capturada', 'imprecisa', 'negada', 'indisponivel', 'nao_aplicavel')),
  latitude numeric(9, 6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude numeric(9, 6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  precisao_metros numeric(9, 1) CHECK (precisao_metros IS NULL OR precisao_metros >= 0),
  situacao_foto text NOT NULL CHECK (situacao_foto IN ('pendente', 'capturada', 'negada', 'indisponivel', 'nao_aplicavel', 'expurgada')),
  foto_caminho text,
  foto_expurgada_em timestamptz,
  CONSTRAINT marcacoes_localizacao CHECK ((situacao_localizacao IN ('capturada', 'imprecisa')) = (latitude IS NOT NULL AND longitude IS NOT NULL)),
  CONSTRAINT marcacoes_origem CHECK ((origem = 'correcao') = (id_solicitacao IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_marcacoes_ponto ON public.marcacoes_ponto (id_funcionario, data_local, registrado_em);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solicitacoes_ponto_marcacao') THEN
    ALTER TABLE public.solicitacoes_ponto ADD CONSTRAINT solicitacoes_ponto_marcacao FOREIGN KEY (id_marcacao) REFERENCES public.marcacoes_ponto(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.marcacoes_desconsideradas (
  id_marcacao uuid PRIMARY KEY REFERENCES public.marcacoes_ponto(id) ON DELETE RESTRICT,
  id_solicitacao uuid NOT NULL REFERENCES public.solicitacoes_ponto(id) ON DELETE RESTRICT,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.apuracoes_ponto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_funcionario uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  data date NOT NULL,
  previsto_minutos integer NOT NULL,
  trabalhado_minutos integer NOT NULL,
  excedente_minutos integer NOT NULL DEFAULT 0,
  atraso_minutos integer NOT NULL DEFAULT 0,
  ausencia boolean NOT NULL DEFAULT false,
  intervalo_inconsistente boolean NOT NULL DEFAULT false,
  incompleta boolean NOT NULL DEFAULT false,
  dia_nao_previsto boolean NOT NULL DEFAULT false,
  feriado boolean NOT NULL DEFAULT false,
  jornada_prevista text,
  jornada_registrada text,
  situacao text NOT NULL DEFAULT 'apurada' CHECK (situacao IN ('apurada', 'esclarecimento', 'conferida', 'integrada')),
  classificacao text CHECK (classificacao IS NULL OR classificacao IN ('hora_extra', 'banco_horas', 'compensacao', 'falta', 'falta_justificada', 'abonada',
                                                                      'atraso', 'atraso_justificado', 'ciente')),
  justificativa text CHECK (justificativa IS NULL OR char_length(justificativa) <= 500),
  pedido_esclarecimento text CHECK (pedido_esclarecimento IS NULL OR char_length(pedido_esclarecimento) <= 500),
  resposta_colaborador text CHECK (resposta_colaborador IS NULL OR char_length(resposta_colaborador) <= 500),
  conferido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  conferido_em timestamptz,
  id_ocorrencia uuid REFERENCES public.ocorrencias_folha(id) ON DELETE RESTRICT,
  integrado_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT apuracoes_um_por_dia UNIQUE (id_funcionario, data),
  CONSTRAINT apuracoes_conferida CHECK ((situacao IN ('conferida', 'integrada')) = (classificacao IS NOT NULL)),
  CONSTRAINT apuracoes_integrada CHECK ((situacao = 'integrada') = (id_ocorrencia IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_apuracoes_ponto ON public.apuracoes_ponto (id_empresa, data);

-- Retenção das fotos do ponto: SEM prazo padrão (definido pela empresa com fundamento). Exclusão automática desligada por padrão
-- e, mesmo ligada aqui, só roda com o agendamento habilitado no servidor (PONTO_EXPURGO_FOTOS=ativo).
CREATE TABLE IF NOT EXISTS public.politicas_retencao_ponto (
  id_empresa uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE RESTRICT,
  prazo_dias integer CHECK (prazo_dias IS NULL OR prazo_dias BETWEEN 30 AND 3650),
  exclusao_ativa boolean NOT NULL DEFAULT false,
  fundamento text CHECK (fundamento IS NULL OR char_length(fundamento) <= 500),
  atualizado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT politica_retencao_completa CHECK (NOT exclusao_ativa OR (prazo_dias IS NOT NULL AND char_length(btrim(coalesce(fundamento, ''))) >= 10))
);
-- Retenção legal/litígio: preserva as fotos (da empresa toda ou de um funcionário) enquanto ativa
CREATE TABLE IF NOT EXISTS public.retencoes_legais_ponto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_funcionario uuid REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 5 AND 500),
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  encerrado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  encerrado_em timestamptz
);
CREATE INDEX IF NOT EXISTS idx_retencoes_legais_ponto ON public.retencoes_legais_ponto (id_empresa) WHERE encerrado_em IS NULL;
CREATE TABLE IF NOT EXISTS public.execucoes_expurgo_ponto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  selecionadas integer NOT NULL DEFAULT 0,
  excluidas integer NOT NULL DEFAULT 0,
  falhas integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.expurgos_fotos_ponto (
  id_marcacao uuid PRIMARY KEY REFERENCES public.marcacoes_ponto(id) ON DELETE RESTRICT,
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  caminho text NOT NULL,
  tentativas integer NOT NULL DEFAULT 0,
  ultimo_erro text,
  id_execucao uuid REFERENCES public.execucoes_expurgo_ponto(id) ON DELETE SET NULL,
  excluido_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.historico_ponto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_funcionario uuid REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  acao text NOT NULL,
  descricao text NOT NULL,
  dados jsonb,
  feito_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  feito_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_historico_ponto ON public.historico_ponto (id_empresa, feito_em DESC);

-- ===== 2. RLS: colaborador sem acesso direto; RH (dono/sócio) lê; contador com "ver folha" lê só apurações e jornadas =====
ALTER TABLE public.convites_colaborador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acessos_colaborador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornadas_funcionario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feriados_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_ponto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marcacoes_ponto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marcacoes_desconsideradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apuracoes_ponto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_ponto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.politicas_retencao_ponto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retencoes_legais_ponto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execucoes_expurgo_ponto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expurgos_fotos_ponto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.convites_colaborador, public.acessos_colaborador, public.jornadas_funcionario, public.feriados_empresa, public.solicitacoes_ponto,
  public.marcacoes_ponto, public.marcacoes_desconsideradas, public.apuracoes_ponto, public.historico_ponto, public.politicas_retencao_ponto,
  public.retencoes_legais_ponto, public.execucoes_expurgo_ponto, public.expurgos_fotos_ponto FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.acessos_colaborador, public.jornadas_funcionario, public.feriados_empresa, public.solicitacoes_ponto,
  public.marcacoes_ponto, public.marcacoes_desconsideradas, public.apuracoes_ponto, public.historico_ponto, public.politicas_retencao_ponto,
  public.retencoes_legais_ponto, public.expurgos_fotos_ponto TO authenticated;
DROP POLICY IF EXISTS "Acessos do portal: RH" ON public.acessos_colaborador;
CREATE POLICY "Acessos do portal: RH" ON public.acessos_colaborador FOR SELECT TO authenticated USING (public.pode_gerenciar_folha(id_empresa));
DROP POLICY IF EXISTS "Jornadas: empresa autorizada" ON public.jornadas_funcionario;
CREATE POLICY "Jornadas: empresa autorizada" ON public.jornadas_funcionario FOR SELECT TO authenticated USING (public.pode_ver_folha(id_empresa));
DROP POLICY IF EXISTS "Feriados: empresa autorizada" ON public.feriados_empresa;
CREATE POLICY "Feriados: empresa autorizada" ON public.feriados_empresa FOR SELECT TO authenticated USING (public.pode_ver_folha(id_empresa));
DROP POLICY IF EXISTS "Solicitações de ponto: RH" ON public.solicitacoes_ponto;
CREATE POLICY "Solicitações de ponto: RH" ON public.solicitacoes_ponto FOR SELECT TO authenticated USING (public.pode_gerenciar_folha(id_empresa));
DROP POLICY IF EXISTS "Marcações: RH" ON public.marcacoes_ponto;
CREATE POLICY "Marcações: RH" ON public.marcacoes_ponto FOR SELECT TO authenticated USING (public.pode_gerenciar_folha(id_empresa));
DROP POLICY IF EXISTS "Marcações desconsideradas: RH" ON public.marcacoes_desconsideradas;
CREATE POLICY "Marcações desconsideradas: RH" ON public.marcacoes_desconsideradas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.marcacoes_ponto m WHERE m.id = id_marcacao AND public.pode_gerenciar_folha(m.id_empresa)));
DROP POLICY IF EXISTS "Apurações: empresa autorizada" ON public.apuracoes_ponto;
CREATE POLICY "Apurações: empresa autorizada" ON public.apuracoes_ponto FOR SELECT TO authenticated USING (public.pode_ver_folha(id_empresa));
DROP POLICY IF EXISTS "Histórico do ponto: RH" ON public.historico_ponto;
CREATE POLICY "Histórico do ponto: RH" ON public.historico_ponto FOR SELECT TO authenticated USING (public.pode_gerenciar_folha(id_empresa));
DROP POLICY IF EXISTS "Retenção de fotos: RH" ON public.politicas_retencao_ponto;
CREATE POLICY "Retenção de fotos: RH" ON public.politicas_retencao_ponto FOR SELECT TO authenticated USING (public.pode_gerenciar_folha(id_empresa));
DROP POLICY IF EXISTS "Retenção legal: RH" ON public.retencoes_legais_ponto;
CREATE POLICY "Retenção legal: RH" ON public.retencoes_legais_ponto FOR SELECT TO authenticated USING (public.pode_gerenciar_folha(id_empresa));
DROP POLICY IF EXISTS "Expurgo de fotos: RH" ON public.expurgos_fotos_ponto;
CREATE POLICY "Expurgo de fotos: RH" ON public.expurgos_fotos_ponto FOR SELECT TO authenticated USING (public.pode_gerenciar_folha(id_empresa));

-- Marcações, correções e histórico são imutáveis. Exceções: anexar a foto uma vez (função própria) e anular o autor quando a conta é excluída.
CREATE OR REPLACE FUNCTION public.proteger_registro_ponto()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE novo jsonb; antigo jsonb; col text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    novo := to_jsonb(NEW); antigo := to_jsonb(OLD);
    FOREACH col IN ARRAY TG_ARGV LOOP
      IF novo -> col = 'null'::jsonb THEN novo := novo - col; antigo := antigo - col; END IF;
    END LOOP;
    IF novo = antigo THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME = 'marcacoes_ponto' AND current_setting('unnify.foto_ponto', true) = 'sim' AND OLD.foto_caminho IS NULL AND OLD.situacao_foto = 'pendente'
       AND (novo - 'foto_caminho' - 'situacao_foto') = (antigo - 'foto_caminho' - 'situacao_foto') THEN
      RETURN NEW;
    END IF;
    IF TG_TABLE_NAME = 'marcacoes_ponto' AND current_setting('unnify.expurgo_foto', true) = 'sim' AND OLD.foto_caminho IS NOT NULL
       AND NEW.foto_caminho IS NULL AND NEW.situacao_foto = 'expurgada' AND NEW.foto_expurgada_em IS NOT NULL
       AND (novo - 'foto_caminho' - 'situacao_foto' - 'foto_expurgada_em') = (antigo - 'foto_caminho' - 'situacao_foto' - 'foto_expurgada_em') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Registros do ponto não podem ser alterados nem excluídos: use uma solicitação de correção.' USING ERRCODE = 'check_violation';
END;
$$;
DROP TRIGGER IF EXISTS proteger_marcacao_ponto ON public.marcacoes_ponto;
CREATE TRIGGER proteger_marcacao_ponto BEFORE UPDATE OR DELETE ON public.marcacoes_ponto FOR EACH ROW EXECUTE FUNCTION public.proteger_registro_ponto('id_usuario');
DROP TRIGGER IF EXISTS proteger_desconsideracao_ponto ON public.marcacoes_desconsideradas;
CREATE TRIGGER proteger_desconsideracao_ponto BEFORE UPDATE OR DELETE ON public.marcacoes_desconsideradas FOR EACH ROW EXECUTE FUNCTION public.proteger_registro_ponto('criado_por');
DROP TRIGGER IF EXISTS proteger_historico_ponto ON public.historico_ponto;
CREATE TRIGGER proteger_historico_ponto BEFORE UPDATE OR DELETE ON public.historico_ponto FOR EACH ROW EXECUTE FUNCTION public.proteger_registro_ponto('feito_por');

-- ===== 3. Funções internas =====
CREATE OR REPLACE FUNCTION public.registrar_historico_ponto(p_id_empresa uuid, p_id_funcionario uuid, p_acao text, p_descricao text, p_dados jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.historico_ponto (id_empresa, id_funcionario, acao, descricao, dados, feito_por)
  VALUES (p_id_empresa, p_id_funcionario, p_acao, left(p_descricao, 300), p_dados, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.notificar_colaborador(p_id_funcionario uuid, p_titulo text, p_mensagem text, p_link text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_usuario uuid; v_empresa text;
BEGIN
  SELECT a.id_usuario, coalesce(e.nome_comercial, e.razao_social) INTO v_usuario, v_empresa
    FROM public.acessos_colaborador a
    JOIN public.funcionarios f ON f.id = a.id_funcionario AND f.status = 'ativo'
    JOIN public.empresas e ON e.id = f.id_empresa
   WHERE a.id_funcionario = p_id_funcionario AND a.revogado_em IS NULL;
  IF v_usuario IS NULL THEN RETURN; END IF;
  PERFORM public.notificar_usuario(v_usuario, 'ponto', p_titulo, v_empresa || ': ' || p_mensagem, p_link, false);
END;
$$;

-- Funcionário ativo cujo acesso ao portal pertence ao usuário logado (nulo = sem acesso)
CREATE OR REPLACE FUNCTION public.funcionario_do_colaborador(p_id_funcionario uuid)
RETURNS public.funcionarios LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.* FROM public.funcionarios f
    JOIN public.acessos_colaborador a ON a.id_funcionario = f.id AND a.revogado_em IS NULL
   WHERE f.id = p_id_funcionario AND a.id_usuario = auth.uid() AND auth.uid() IS NOT NULL AND f.status = 'ativo';
$$;
CREATE OR REPLACE FUNCTION public.exigir_colaborador(p_id_funcionario uuid)
RETURNS public.funcionarios LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE f public.funcionarios;
BEGIN
  f := public.funcionario_do_colaborador(p_id_funcionario);
  IF f.id IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE = '42501'; END IF;
  RETURN f;
END;
$$;
CREATE OR REPLACE FUNCTION public.exigir_rh_funcionario(p_id_funcionario uuid)
RETURNS public.funcionarios LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE f public.funcionarios;
BEGIN
  SELECT * INTO f FROM public.funcionarios WHERE id = p_id_funcionario;
  IF f.id IS NULL OR auth.uid() IS NULL OR NOT public.pode_gerenciar_folha(f.id_empresa) THEN
    RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE = '42501';
  END IF;
  RETURN f;
END;
$$;

CREATE OR REPLACE FUNCTION public.minutos_do_horario(p text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT split_part(p, ':', 1)::integer * 60 + split_part(p, ':', 2)::integer;
$$;
CREATE OR REPLACE FUNCTION public.horario_dos_minutos(p integer)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lpad((p / 60)::text, 2, '0') || ':' || lpad((p % 60)::text, 2, '0');
$$;

-- Escala: {"0":[...],"1":[["08:00","12:00"],["14:00","18:00"]],...,"6":[]} — até 4 períodos por dia, crescentes, sem virar a meia-noite
CREATE OR REPLACE FUNCTION public.validar_escala_ponto(p_escala jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d integer; per jsonb; prox jsonb; i integer; n integer; ini integer; fim integer; ant integer;
BEGIN
  IF p_escala IS NULL OR jsonb_typeof(p_escala) <> 'object' THEN RAISE EXCEPTION 'Escala inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_escala) k WHERE k NOT IN ('0', '1', '2', '3', '4', '5', '6')) THEN
    RAISE EXCEPTION 'Escala inválida.' USING ERRCODE = 'check_violation';
  END IF;
  FOR d IN 0..6 LOOP
    per := coalesce(p_escala -> d::text, '[]'::jsonb);
    IF jsonb_typeof(per) <> 'array' OR jsonb_array_length(per) > 4 THEN RAISE EXCEPTION 'Escala inválida: no máximo 4 períodos por dia.' USING ERRCODE = 'check_violation'; END IF;
    n := jsonb_array_length(per);
    ant := -1;
    FOR i IN 0..n - 1 LOOP
      IF jsonb_typeof(per -> i) <> 'array' OR jsonb_array_length(per -> i) <> 2
         OR NOT coalesce((per -> i ->> 0) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$', false) OR NOT coalesce((per -> i ->> 1) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$', false) THEN
        RAISE EXCEPTION 'Horário inválido na escala (use HH:MM).' USING ERRCODE = 'check_violation';
      END IF;
      ini := public.minutos_do_horario(per -> i ->> 0);
      fim := public.minutos_do_horario(per -> i ->> 1);
      IF fim = ini THEN RAISE EXCEPTION 'Período da escala com início e fim iguais.' USING ERRCODE = 'check_violation'; END IF;
      IF ini < ant THEN RAISE EXCEPTION 'Períodos da escala precisam ser crescentes e sem sobreposição.' USING ERRCODE = 'check_violation'; END IF;
      IF fim < ini THEN -- termina no dia seguinte (ex.: 22:00–06:00): só o último período do dia, até 16 h
        IF i < n - 1 THEN RAISE EXCEPTION 'Só o último período do dia pode terminar no dia seguinte.' USING ERRCODE = 'check_violation'; END IF;
        IF fim + 1440 - ini > 960 THEN RAISE EXCEPTION 'Período que vira a meia-noite muito longo (máximo de 16 horas).' USING ERRCODE = 'check_violation'; END IF;
        prox := coalesce(p_escala -> ((d + 1) % 7)::text, '[]'::jsonb);
        IF jsonb_typeof(prox) = 'array' AND jsonb_array_length(prox) > 0 AND jsonb_typeof(prox -> 0) = 'array'
           AND coalesce((prox -> 0 ->> 0) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$', false) AND public.minutos_do_horario(prox -> 0 ->> 0) < fim THEN
          RAISE EXCEPTION 'O turno que termina no dia seguinte invade a jornada do dia seguinte.' USING ERRCODE = 'check_violation';
        END IF;
        ant := fim + 1440;
      ELSE
        ant := fim;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Cálculo de um dia (não grava). Sem jornada configurada: nada a apurar.
CREATE OR REPLACE FUNCTION public.calcular_dia_ponto(p_id_funcionario uuid, p_data date,
  OUT tem_jornada boolean, OUT previsto integer, OUT trabalhado integer, OUT excedente integer, OUT atraso integer, OUT ausencia boolean,
  OUT intervalo_inconsistente boolean, OUT incompleta boolean, OUT nao_previsto boolean, OUT feriado boolean, OUT em_andamento boolean,
  OUT texto_previsto text, OUT texto_registrado text, OUT quantidade integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  f public.funcionarios; j public.jornadas_funcionario; per jsonb; i integer; ini integer; fim integer; fim_previsto integer := 0;
  m integer[]; n integer; maior_intervalo integer := 0; ultimo text; ultimo_em timestamptz;
  v_base timestamptz := p_data::timestamp AT TIME ZONE 'America/Sao_Paulo'; -- 00:00 do dia da jornada (minutos > 1440 = dia seguinte)
  v_hoje date := public.hoje_brasil();
BEGIN
  SELECT * INTO f FROM public.funcionarios WHERE id = p_id_funcionario;
  SELECT * INTO j FROM public.jornadas_funcionario WHERE id_funcionario = p_id_funcionario AND vigente_desde <= p_data ORDER BY vigente_desde DESC LIMIT 1;
  tem_jornada := j.id IS NOT NULL;
  previsto := 0; trabalhado := 0; excedente := 0; atraso := 0; ausencia := false; intervalo_inconsistente := false; incompleta := false;
  nao_previsto := false; em_andamento := false;
  feriado := EXISTS (SELECT 1 FROM public.feriados_empresa WHERE id_empresa = f.id_empresa AND data = p_data);
  texto_previsto := NULL;
  IF tem_jornada AND NOT feriado THEN
    per := coalesce(j.escala -> extract(dow FROM p_data)::integer::text, '[]'::jsonb);
    FOR i IN 0..jsonb_array_length(per) - 1 LOOP
      ini := public.minutos_do_horario(per -> i ->> 0);
      fim := public.minutos_do_horario(per -> i ->> 1);
      IF fim <= ini THEN fim := fim + 1440; END IF;
      previsto := previsto + fim - ini;
      fim_previsto := greatest(fim_previsto, fim);
      texto_previsto := concat_ws(' · ', texto_previsto, (per -> i ->> 0) || '–' || (per -> i ->> 1) || CASE WHEN fim > 1440 THEN ' (+1)' ELSE '' END);
    END LOOP;
  END IF;
  texto_previsto := coalesce(texto_previsto, CASE WHEN feriado THEN 'Feriado' WHEN tem_jornada THEN 'Descanso' END);
  SELECT array_agg(floor(extract(epoch FROM (x.registrado_em - v_base)) / 60)::integer ORDER BY x.registrado_em),
         string_agg(to_char(x.h, 'HH24:MI') || CASE WHEN x.h::date > p_data THEN ' (+1)' ELSE '' END, ' · ' ORDER BY x.registrado_em),
         (array_agg(x.tipo ORDER BY x.registrado_em DESC))[1], max(x.registrado_em)
    INTO m, texto_registrado, ultimo, ultimo_em
    FROM (SELECT mp.registrado_em, mp.tipo, (mp.registrado_em AT TIME ZONE 'America/Sao_Paulo') AS h
            FROM public.marcacoes_ponto mp
           WHERE mp.id_funcionario = p_id_funcionario AND mp.data_local = p_data
             AND NOT EXISTS (SELECT 1 FROM public.marcacoes_desconsideradas d WHERE d.id_marcacao = mp.id)) x;
  n := coalesce(array_length(m, 1), 0);
  quantidade := n;
  IF p_data > v_hoje THEN em_andamento := true; RETURN; END IF;
  -- Jornada ainda aberta: hoje sem saída final; turno (inclusive o que virou a meia-noite) com marcação ímpar há menos de 16 h;
  -- ou dia sem marcação cuja jornada prevista ainda não terminou. Nada é apurado pela metade.
  IF (p_data = v_hoje AND (n = 0 OR n % 2 = 1 OR ultimo IS DISTINCT FROM 'saida'))
     OR (n % 2 = 1 AND ultimo_em > now() - interval '16 hours')
     OR (n = 0 AND previsto > 0 AND now() < v_base + make_interval(mins => fim_previsto)) THEN
    em_andamento := true; RETURN;
  END IF;
  IF n % 2 = 1 THEN incompleta := true; END IF;
  i := 1;
  WHILE i + 1 <= n LOOP
    trabalhado := trabalhado + (m[i + 1] - m[i]);
    IF i > 1 THEN maior_intervalo := greatest(maior_intervalo, m[i] - m[i - 1]); END IF;
    i := i + 2;
  END LOOP;
  IF NOT tem_jornada THEN RETURN; END IF;
  IF n = 0 THEN ausencia := previsto > 0; RETURN; END IF;
  nao_previsto := previsto = 0;
  IF incompleta THEN RETURN; END IF;
  IF trabalhado > j.limite_sem_intervalo_minutos AND j.intervalo_minimo_minutos > 0 AND maior_intervalo < j.intervalo_minimo_minutos THEN
    intervalo_inconsistente := true;
  END IF;
  IF nao_previsto THEN excedente := trabalhado;
  ELSIF trabalhado - previsto > j.tolerancia_minutos THEN excedente := trabalhado - previsto;
  ELSIF previsto - trabalhado > j.tolerancia_minutos THEN atraso := previsto - trabalhado;
  END IF;
END;
$$;

-- Grava/atualiza a apuração do dia. Integrada nunca muda; conferida volta a "apurada" se os números mudarem.
CREATE OR REPLACE FUNCTION public.apurar_dia_ponto(p_id_funcionario uuid, p_data date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f public.funcionarios; r record; a public.apuracoes_ponto; tem boolean;
BEGIN
  SELECT * INTO f FROM public.funcionarios WHERE id = p_id_funcionario;
  IF f.id IS NULL OR p_data < f.data_admissao OR (f.data_desligamento IS NOT NULL AND p_data > f.data_desligamento) THEN RETURN; END IF;
  SELECT * INTO r FROM public.calcular_dia_ponto(p_id_funcionario, p_data);
  SELECT * INTO a FROM public.apuracoes_ponto WHERE id_funcionario = p_id_funcionario AND data = p_data FOR UPDATE;
  IF a.situacao = 'integrada' OR NOT r.tem_jornada OR r.em_andamento THEN RETURN; END IF;
  tem := r.excedente > 0 OR r.atraso > 0 OR r.ausencia OR r.intervalo_inconsistente OR r.incompleta OR r.nao_previsto;
  IF NOT tem THEN
    IF a.id IS NOT NULL THEN DELETE FROM public.apuracoes_ponto WHERE id = a.id; END IF;
    RETURN;
  END IF;
  IF a.id IS NULL THEN
    INSERT INTO public.apuracoes_ponto (id_empresa, id_funcionario, data, previsto_minutos, trabalhado_minutos, excedente_minutos, atraso_minutos, ausencia,
      intervalo_inconsistente, incompleta, dia_nao_previsto, feriado, jornada_prevista, jornada_registrada)
    VALUES (f.id_empresa, f.id, p_data, r.previsto, r.trabalhado, r.excedente, r.atraso, r.ausencia, r.intervalo_inconsistente, r.incompleta, r.nao_previsto,
      r.feriado, r.texto_previsto, r.texto_registrado);
    IF r.incompleta THEN
      PERFORM public.notificar_colaborador(f.id, 'Marcação de ponto incompleta',
        'Falta marcação em ' || to_char(p_data, 'DD/MM/YYYY') || '. Se esqueceu de marcar, solicite a correção.', '/colaborador/jornada?aba=correcoes');
    END IF;
  ELSIF (a.previsto_minutos, a.trabalhado_minutos, a.excedente_minutos, a.atraso_minutos, a.ausencia, a.intervalo_inconsistente, a.incompleta, a.dia_nao_previsto, a.feriado)
        IS DISTINCT FROM (r.previsto, r.trabalhado, r.excedente, r.atraso, r.ausencia, r.intervalo_inconsistente, r.incompleta, r.nao_previsto, r.feriado) THEN
    UPDATE public.apuracoes_ponto
       SET previsto_minutos = r.previsto, trabalhado_minutos = r.trabalhado, excedente_minutos = r.excedente, atraso_minutos = r.atraso, ausencia = r.ausencia,
           intervalo_inconsistente = r.intervalo_inconsistente, incompleta = r.incompleta, dia_nao_previsto = r.nao_previsto, feriado = r.feriado,
           jornada_prevista = r.texto_previsto, jornada_registrada = r.texto_registrado,
           situacao = CASE WHEN a.situacao = 'esclarecimento' THEN 'esclarecimento' ELSE 'apurada' END,
           classificacao = NULL, conferido_por = NULL, conferido_em = NULL, atualizado_em = now()
     WHERE id = a.id;
  END IF;
END;
$$;

-- Apuração não pode mudar um dia já levado à folha
CREATE OR REPLACE FUNCTION public.exigir_dia_nao_integrado(p_id_funcionario uuid, p_data date)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.apuracoes_ponto WHERE id_funcionario = p_id_funcionario AND data = p_data AND situacao = 'integrada') THEN
    RAISE EXCEPTION 'Este dia já foi integrado à folha de pagamento: a correção exige revisão formal da folha.' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- ===== 4. Fase 1 — Convites e acesso =====
-- RH cria o convite (o servidor gera o token e manda só o hash). Revoga o convite pendente anterior.
CREATE OR REPLACE FUNCTION public.criar_convite_colaborador(p_id_funcionario uuid, p_email text, p_hash text,
  OUT id uuid, OUT nome text, OUT empresa text, OUT email text, OUT expira_em timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE f public.funcionarios; v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  f := public.exigir_rh_funcionario(p_id_funcionario);
  IF f.status <> 'ativo' THEN RAISE EXCEPTION 'Funcionário desligado não pode receber convite.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(v_email) > 254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Informe um e-mail válido.' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(p_hash, '') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Convite inválido.' USING ERRCODE = 'check_violation'; END IF;
  PERFORM 1 FROM public.funcionarios WHERE funcionarios.id = f.id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.acessos_colaborador a WHERE a.id_funcionario = f.id AND a.revogado_em IS NULL) THEN
    RAISE EXCEPTION 'Este colaborador já tem acesso ativo ao portal.' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM public.convites_colaborador c WHERE c.id_funcionario = f.id AND c.criado_em > now() - interval '1 day') >= 5 THEN
    RAISE EXCEPTION 'Limite de convites para este colaborador atingido hoje. Tente amanhã.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.convites_colaborador c SET revogado_em = now(), revogado_por = auth.uid()
   WHERE c.id_funcionario = f.id AND c.usado_em IS NULL AND c.revogado_em IS NULL;
  UPDATE public.funcionarios SET email = v_email, atualizado_por = auth.uid(), atualizado_em = now() WHERE funcionarios.id = f.id AND funcionarios.email IS DISTINCT FROM v_email;
  INSERT INTO public.convites_colaborador (id_empresa, id_funcionario, email, hash_token, expira_em, criado_por)
  VALUES (f.id_empresa, f.id, v_email, p_hash, now() + interval '7 days', auth.uid())
  RETURNING convites_colaborador.id, convites_colaborador.expira_em INTO id, expira_em;
  nome := f.nome; email := v_email;
  SELECT coalesce(e.nome_comercial, e.razao_social) INTO empresa FROM public.empresas e WHERE e.id = f.id_empresa;
  PERFORM public.registrar_historico_ponto(f.id_empresa, f.id, 'convite_criado', 'Convite para o portal criado', jsonb_build_object('email', v_email));
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_envio_convite_colaborador(p_id uuid, p_ok boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.convites_colaborador;
BEGIN
  SELECT * INTO c FROM public.convites_colaborador WHERE id = p_id;
  IF c.id IS NULL OR NOT public.pode_gerenciar_folha(c.id_empresa) THEN RAISE EXCEPTION 'Convite não encontrado.' USING ERRCODE = '42501'; END IF;
  UPDATE public.convites_colaborador SET enviado = coalesce(p_ok, false) WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revogar_convite_colaborador(p_id_funcionario uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.funcionarios;
BEGIN
  f := public.exigir_rh_funcionario(p_id_funcionario);
  UPDATE public.convites_colaborador SET revogado_em = now(), revogado_por = auth.uid()
   WHERE id_funcionario = f.id AND usado_em IS NULL AND revogado_em IS NULL;
  IF FOUND THEN PERFORM public.registrar_historico_ponto(f.id_empresa, f.id, 'convite_revogado', 'Convite para o portal revogado', NULL); END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.revogar_acesso_colaborador(p_id_funcionario uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.funcionarios; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  f := public.exigir_rh_funcionario(p_id_funcionario);
  IF v_motivo IS NULL OR char_length(v_motivo) < 3 THEN RAISE EXCEPTION 'Informe o motivo da revogação.' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.acessos_colaborador SET revogado_em = now(), revogado_por = auth.uid(), motivo_revogacao = left(v_motivo, 300)
   WHERE id_funcionario = f.id AND revogado_em IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Este colaborador não tem acesso ativo.' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.convites_colaborador SET revogado_em = now(), revogado_por = auth.uid() WHERE id_funcionario = f.id AND usado_em IS NULL AND revogado_em IS NULL;
  PERFORM public.registrar_historico_ponto(f.id_empresa, f.id, 'acesso_revogado', 'Acesso ao portal revogado: ' || v_motivo, NULL);
END;
$$;

-- Desligamento revoga acesso e convites na hora (reativação exige novo convite)
CREATE OR REPLACE FUNCTION public.revogar_portal_no_desligamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'inativo' AND OLD.status = 'ativo' THEN
    UPDATE public.acessos_colaborador SET revogado_em = now(), revogado_por = auth.uid(), motivo_revogacao = 'Desligamento'
     WHERE id_funcionario = NEW.id AND revogado_em IS NULL;
    UPDATE public.convites_colaborador SET revogado_em = now(), revogado_por = auth.uid() WHERE id_funcionario = NEW.id AND usado_em IS NULL AND revogado_em IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS revogar_portal_no_desligamento ON public.funcionarios;
CREATE TRIGGER revogar_portal_no_desligamento AFTER UPDATE OF status ON public.funcionarios FOR EACH ROW EXECUTE FUNCTION public.revogar_portal_no_desligamento();

-- Situação do portal para o RH
CREATE OR REPLACE FUNCTION public.situacao_portal_funcionario(p_id_funcionario uuid,
  OUT situacao text, OUT email text, OUT convite_expira_em timestamptz, OUT convite_enviado boolean, OUT ativado_em timestamptz, OUT revogado_em timestamptz, OUT motivo_revogacao text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE f public.funcionarios; a public.acessos_colaborador; c public.convites_colaborador;
BEGIN
  f := public.exigir_rh_funcionario(p_id_funcionario);
  email := f.email;
  SELECT * INTO a FROM public.acessos_colaborador WHERE id_funcionario = f.id ORDER BY (revogado_em IS NULL) DESC, ativado_em DESC LIMIT 1;
  SELECT * INTO c FROM public.convites_colaborador WHERE id_funcionario = f.id AND usado_em IS NULL AND revogado_em IS NULL;
  ativado_em := a.ativado_em; revogado_em := a.revogado_em; motivo_revogacao := a.motivo_revogacao;
  convite_expira_em := c.expira_em; convite_enviado := c.enviado;
  situacao := CASE WHEN a.id IS NOT NULL AND a.revogado_em IS NULL THEN 'ativo'
                   WHEN c.id IS NOT NULL AND c.expira_em > now() THEN 'convite_pendente'
                   WHEN c.id IS NOT NULL THEN 'convite_expirado'
                   WHEN a.id IS NOT NULL THEN 'revogado'
                   ELSE 'sem_convite' END;
END;
$$;

-- Leitura pelo token (link do e-mail). Só quem tem o token vê; sem dados contratuais.
CREATE OR REPLACE FUNCTION public.dados_convite_colaborador(p_token text,
  OUT situacao text, OUT nome text, OUT empresa text, OUT email text, OUT expira_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE c public.convites_colaborador; f public.funcionarios;
BEGIN
  IF char_length(coalesce(p_token, '')) < 40 OR char_length(p_token) > 100 THEN situacao := 'invalido'; RETURN; END IF;
  SELECT * INTO c FROM public.convites_colaborador WHERE hash_token = public.hash_convite(p_token);
  IF c.id IS NULL THEN situacao := 'invalido'; RETURN; END IF;
  SELECT * INTO f FROM public.funcionarios WHERE id = c.id_funcionario;
  situacao := CASE WHEN c.usado_em IS NOT NULL THEN 'usado' WHEN c.revogado_em IS NOT NULL OR f.status <> 'ativo' THEN 'revogado'
                   WHEN c.expira_em <= now() THEN 'expirado' ELSE 'valido' END;
  IF situacao <> 'valido' THEN RETURN; END IF;
  nome := split_part(f.nome, ' ', 1); email := c.email; expira_em := c.expira_em;
  SELECT coalesce(e.nome_comercial, e.razao_social) INTO empresa FROM public.empresas e WHERE e.id = c.id_empresa;
END;
$$;

-- Aceite com a sessão do próprio usuário: e-mail confirmado e igual ao do convite; uso único; idempotente para o mesmo usuário
CREATE OR REPLACE FUNCTION public.aceitar_convite_colaborador(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.convites_colaborador; f public.funcionarios; u record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para ativar o acesso.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.convites_colaborador WHERE hash_token = public.hash_convite(coalesce(p_token, '')) FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Convite inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF c.usado_em IS NOT NULL THEN
    IF c.usado_por = auth.uid() AND EXISTS (SELECT 1 FROM public.acessos_colaborador WHERE id_convite = c.id AND revogado_em IS NULL) THEN RETURN c.id_funcionario; END IF;
    RAISE EXCEPTION 'Este convite já foi utilizado.' USING ERRCODE = 'check_violation';
  END IF;
  IF c.revogado_em IS NOT NULL THEN RAISE EXCEPTION 'Este convite foi cancelado pela empresa.' USING ERRCODE = 'check_violation'; END IF;
  IF c.expira_em <= now() THEN RAISE EXCEPTION 'Este convite expirou. Peça um novo ao RH da empresa.' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO f FROM public.funcionarios WHERE id = c.id_funcionario FOR UPDATE;
  IF f.status <> 'ativo' THEN RAISE EXCEPTION 'Este convite foi cancelado pela empresa.' USING ERRCODE = 'check_violation'; END IF;
  SELECT email, email_confirmed_at INTO u FROM auth.users WHERE id = auth.uid();
  IF u.email_confirmed_at IS NULL OR lower(u.email) IS DISTINCT FROM lower(c.email) THEN
    RAISE EXCEPTION 'Entre com a conta do e-mail que recebeu o convite.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.acessos_colaborador WHERE id_funcionario = f.id AND revogado_em IS NULL) THEN
    RAISE EXCEPTION 'Este colaborador já tem acesso ativo ao portal.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.acessos_colaborador (id_empresa, id_funcionario, id_usuario, id_convite) VALUES (f.id_empresa, f.id, auth.uid(), c.id);
  UPDATE public.convites_colaborador SET usado_em = now(), usado_por = auth.uid() WHERE id = c.id;
  PERFORM public.registrar_historico_ponto(f.id_empresa, f.id, 'acesso_ativado', 'Colaborador ativou o acesso ao portal', NULL);
  RETURN f.id;
END;
$$;

-- ===== 5. Fase 2 — Portal (somente os próprios dados) =====
CREATE OR REPLACE FUNCTION public.portal_colaborador()
RETURNS TABLE (id_funcionario uuid, id_empresa uuid, empresa text, nome text, cargo text, vinculo text, data_admissao date, matricula integer, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id, f.id_empresa, coalesce(e.nome_comercial, e.razao_social), f.nome, f.cargo, f.vinculo, f.data_admissao, f.matricula, f.email
    FROM public.acessos_colaborador a
    JOIN public.funcionarios f ON f.id = a.id_funcionario AND f.status = 'ativo'
    JOIN public.empresas e ON e.id = f.id_empresa
   WHERE a.id_usuario = auth.uid() AND a.revogado_em IS NULL
   ORDER BY a.ativado_em;
$$;

-- Holerites só de competências APROVADAS e do próprio colaborador
CREATE OR REPLACE FUNCTION public.meus_holerites(p_id_funcionario uuid)
RETURNS TABLE (id uuid, competencia date, nome_arquivo text, caminho text, enviado_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE f public.funcionarios;
BEGIN
  f := public.exigir_colaborador(p_id_funcionario);
  RETURN QUERY
  SELECT d.id, c.competencia, d.nome_arquivo, d.caminho, d.enviado_em
    FROM public.documentos_folha d
    JOIN public.competencias_folha c ON c.id = d.id_competencia AND c.status = 'aprovada'
    JOIN public.devolucoes_folha v ON v.id = d.id_devolucao AND v.situacao <> 'rascunho'
   WHERE d.id_funcionario = f.id AND d.categoria = 'holerite' AND d.excluido_em IS NULL
   ORDER BY c.competencia DESC, d.enviado_em DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.colaborador_pode_ler_holerite(p_nome text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documentos_folha d
      JOIN public.competencias_folha c ON c.id = d.id_competencia AND c.status = 'aprovada'
      JOIN public.devolucoes_folha v ON v.id = d.id_devolucao AND v.situacao <> 'rascunho'
     WHERE d.caminho = p_nome AND d.categoria = 'holerite' AND d.excluido_em IS NULL
       AND (public.funcionario_do_colaborador(d.id_funcionario)).id IS NOT NULL);
$$;
DROP POLICY IF EXISTS "Folha: holerite do próprio colaborador" ON storage.objects;
CREATE POLICY "Folha: holerite do próprio colaborador" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'folha' AND public.colaborador_pode_ler_holerite(name));

-- ===== 6. Fase 3 — Marcações =====
CREATE OR REPLACE FUNCTION public.registrar_marcacao_ponto(p_id uuid, p_id_funcionario uuid, p_tipo text, p_situacao_localizacao text,
  p_latitude numeric, p_longitude numeric, p_precisao numeric, p_situacao_foto text,
  OUT id uuid, OUT registrado_em timestamptz, OUT data_local date, OUT duplicada boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE f public.funcionarios; m public.marcacoes_ponto; v_loc text := p_situacao_localizacao; v_hoje date := public.hoje_brasil(); v_ref date;
  v_ontem record; v_noturno boolean;
BEGIN
  f := public.exigir_colaborador(p_id_funcionario);
  IF p_id IS NULL THEN RAISE EXCEPTION 'Marcação inválida.' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO m FROM public.marcacoes_ponto mp WHERE mp.id = p_id;
  IF m.id IS NOT NULL THEN
    IF m.id_funcionario <> f.id THEN RAISE EXCEPTION 'Marcação inválida.' USING ERRCODE = 'check_violation'; END IF;
    id := m.id; registrado_em := m.registrado_em; data_local := m.data_local; duplicada := true; RETURN;
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('entrada', 'saida_intervalo', 'retorno_intervalo', 'saida', 'outra') THEN
    RAISE EXCEPTION 'Tipo de marcação inválido.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_loc IS NULL OR v_loc NOT IN ('capturada', 'negada', 'indisponivel') THEN RAISE EXCEPTION 'Situação da localização inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF p_situacao_foto IS NULL OR p_situacao_foto NOT IN ('pendente', 'negada', 'indisponivel') THEN RAISE EXCEPTION 'Situação da foto inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF v_loc = 'capturada' THEN
    IF p_latitude IS NULL OR p_longitude IS NULL OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 OR coalesce(p_precisao, -1) < 0 THEN
      RAISE EXCEPTION 'Localização inválida.' USING ERRCODE = 'check_violation';
    END IF;
    IF p_precisao > 100 THEN v_loc := 'imprecisa'; END IF;
  ELSIF p_latitude IS NOT NULL OR p_longitude IS NOT NULL THEN
    RAISE EXCEPTION 'Localização inválida.' USING ERRCODE = 'check_violation';
  END IF;
  -- Uma marcação por vez por funcionário (cliques repetidos e abas simultâneas)
  PERFORM 1 FROM public.funcionarios WHERE funcionarios.id = f.id FOR UPDATE;
  -- o mesmo id pode ter sido gravado por uma tentativa simultânea enquanto esperávamos a trava
  SELECT * INTO m FROM public.marcacoes_ponto mp WHERE mp.id = p_id;
  IF m.id IS NOT NULL THEN
    IF m.id_funcionario <> f.id THEN RAISE EXCEPTION 'Marcação inválida.' USING ERRCODE = 'check_violation'; END IF;
    id := m.id; registrado_em := m.registrado_em; data_local := m.data_local; duplicada := true; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.marcacoes_ponto mp WHERE mp.id_funcionario = f.id AND mp.tipo = p_tipo AND mp.origem = 'portal'
               AND mp.registrado_em > now() - interval '2 minutes') THEN
    RAISE EXCEPTION 'Esta marcação já foi registrada há instantes.' USING ERRCODE = 'check_violation';
  END IF;
  -- Data da jornada: turno de ontem ainda aberto (marcações ímpares, última há < 16 h) e nada hoje → continua no dia em que começou,
  -- desde que ontem tenha turno previsto virando a meia-noite ou o turno tenha começado à noite (a partir das 18h)
  v_ref := v_hoje;
  IF NOT EXISTS (SELECT 1 FROM public.marcacoes_ponto mp WHERE mp.id_funcionario = f.id AND mp.data_local = v_hoje
                   AND NOT EXISTS (SELECT 1 FROM public.marcacoes_desconsideradas d WHERE d.id_marcacao = mp.id)) THEN
    SELECT count(*) AS n, max(mp.registrado_em) AS ultima, min(mp.registrado_em) AS primeira INTO v_ontem
      FROM public.marcacoes_ponto mp WHERE mp.id_funcionario = f.id AND mp.data_local = v_hoje - 1
       AND NOT EXISTS (SELECT 1 FROM public.marcacoes_desconsideradas d WHERE d.id_marcacao = mp.id);
    IF v_ontem.n % 2 = 1 AND v_ontem.ultima > now() - interval '16 hours' THEN
      SELECT EXISTS (SELECT 1 FROM public.jornadas_funcionario j, LATERAL (SELECT j.escala -> extract(dow FROM v_hoje - 1)::integer::text AS per) x
                      WHERE j.id_funcionario = f.id AND j.vigente_desde <= v_hoje - 1
                        AND j.vigente_desde = (SELECT max(j2.vigente_desde) FROM public.jornadas_funcionario j2 WHERE j2.id_funcionario = f.id AND j2.vigente_desde <= v_hoje - 1)
                        AND jsonb_array_length(coalesce(x.per, '[]'::jsonb)) > 0
                        AND public.minutos_do_horario(x.per -> (jsonb_array_length(x.per) - 1) ->> 1) <= public.minutos_do_horario(x.per -> (jsonb_array_length(x.per) - 1) ->> 0))
        INTO v_noturno;
      IF v_noturno OR (v_ontem.primeira AT TIME ZONE 'America/Sao_Paulo')::time >= TIME '18:00' THEN v_ref := v_hoje - 1; END IF;
    END IF;
  END IF;
  IF (SELECT count(*) FROM public.marcacoes_ponto mp WHERE mp.id_funcionario = f.id AND mp.data_local = v_ref) >= 12 THEN
    RAISE EXCEPTION 'Limite de marcações do dia atingido. Fale com o RH.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.marcacoes_ponto (id, id_empresa, id_funcionario, id_usuario, tipo, data_local, situacao_localizacao, latitude, longitude, precisao_metros, situacao_foto)
  VALUES (p_id, f.id_empresa, f.id, auth.uid(), p_tipo, v_ref, v_loc,
          CASE WHEN v_loc IN ('capturada', 'imprecisa') THEN round(p_latitude, 6) END, CASE WHEN v_loc IN ('capturada', 'imprecisa') THEN round(p_longitude, 6) END,
          CASE WHEN v_loc IN ('capturada', 'imprecisa') THEN round(p_precisao, 1) END, p_situacao_foto)
  RETURNING marcacoes_ponto.id, marcacoes_ponto.registrado_em, marcacoes_ponto.data_local INTO id, registrado_em, data_local;
  duplicada := false;
  PERFORM public.apurar_dia_ponto(f.id, v_ref);
  PERFORM public.apurar_dia_ponto(f.id, v_hoje - 1);
END;
$$;

-- Foto: bucket privado "ponto", <empresa>/<funcionario>/<id_marcacao>.jpg, até 10 min após a marcação, uma vez
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ponto', 'ponto', false, 2097152, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pode_enviar_foto_ponto(p_nome text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.marcacoes_ponto m
     WHERE p_nome = m.id_empresa::text || '/' || m.id_funcionario::text || '/' || m.id::text || '.jpg'
       AND m.id_usuario = auth.uid() AND m.situacao_foto = 'pendente' AND m.foto_caminho IS NULL
       AND m.registrado_em > now() - interval '10 minutes'
       AND (public.funcionario_do_colaborador(m.id_funcionario)).id IS NOT NULL);
$$;
CREATE OR REPLACE FUNCTION public.pode_ler_foto_ponto(p_nome text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.marcacoes_ponto m
     WHERE m.foto_caminho = p_nome
       AND (public.pode_gerenciar_folha(m.id_empresa) OR (public.funcionario_do_colaborador(m.id_funcionario)).id IS NOT NULL));
$$;
DROP POLICY IF EXISTS "Ponto: envio da foto" ON storage.objects;
CREATE POLICY "Ponto: envio da foto" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ponto' AND public.pode_enviar_foto_ponto(name));
-- Leitura: foto já anexada (colaborador dono ou RH) ou o próprio envio ainda pendente (o Storage relê o objeto no upload)
DROP POLICY IF EXISTS "Ponto: leitura da foto" ON storage.objects;
CREATE POLICY "Ponto: leitura da foto" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ponto' AND (public.pode_ler_foto_ponto(name) OR (owner_id = auth.uid()::text AND public.pode_enviar_foto_ponto(name))));

CREATE OR REPLACE FUNCTION public.anexar_foto_marcacao(p_id uuid, p_ok boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.marcacoes_ponto; v_nome text; v record;
BEGIN
  SELECT * INTO m FROM public.marcacoes_ponto WHERE id = p_id FOR UPDATE;
  IF m.id IS NULL OR m.id_usuario IS DISTINCT FROM auth.uid() OR (public.funcionario_do_colaborador(m.id_funcionario)).id IS NULL THEN
    RAISE EXCEPTION 'Marcação não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF m.situacao_foto <> 'pendente' THEN RETURN; END IF;
  PERFORM set_config('unnify.foto_ponto', 'sim', true);
  IF NOT coalesce(p_ok, false) THEN
    UPDATE public.marcacoes_ponto SET situacao_foto = 'indisponivel' WHERE id = m.id;
  ELSE
    v_nome := m.id_empresa::text || '/' || m.id_funcionario::text || '/' || m.id::text || '.jpg';
    SELECT o.metadata ->> 'mimetype' AS tipo, o.owner_id INTO v FROM storage.objects o WHERE o.bucket_id = 'ponto' AND o.name = v_nome;
    IF v.owner_id IS DISTINCT FROM auth.uid()::text OR v.tipo IS DISTINCT FROM 'image/jpeg' THEN
      PERFORM set_config('unnify.foto_ponto', '', true);
      RAISE EXCEPTION 'Foto não recebida.' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.marcacoes_ponto SET situacao_foto = 'capturada', foto_caminho = v_nome WHERE id = m.id;
  END IF;
  PERFORM set_config('unnify.foto_ponto', '', true);
END;
$$;

-- Leitura do próprio ponto
CREATE OR REPLACE FUNCTION public.meu_ponto(p_id_funcionario uuid, p_de date, p_ate date)
RETURNS TABLE (id uuid, tipo text, registrado_em timestamptz, data_local date, origem text, desconsiderada boolean, situacao_foto text, situacao_localizacao text, foto_caminho text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE f public.funcionarios;
BEGIN
  f := public.exigir_colaborador(p_id_funcionario);
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de OR p_ate - p_de > 62 THEN RAISE EXCEPTION 'Período inválido.' USING ERRCODE = 'check_violation'; END IF;
  RETURN QUERY
  SELECT m.id, m.tipo, m.registrado_em, m.data_local, m.origem, EXISTS (SELECT 1 FROM public.marcacoes_desconsideradas d WHERE d.id_marcacao = m.id),
         m.situacao_foto, m.situacao_localizacao, m.foto_caminho
    FROM public.marcacoes_ponto m
   WHERE m.id_funcionario = f.id AND m.data_local BETWEEN p_de AND p_ate
   ORDER BY m.registrado_em;
END;
$$;

-- Jornada vigente + espelho do mês (cálculo ao vivo) + situação da apuração do RH (sem a justificativa interna)
CREATE OR REPLACE FUNCTION public.minha_jornada(p_id_funcionario uuid, p_competencia date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.funcionarios; j public.jornadas_funcionario; v_ini date := date_trunc('month', p_competencia)::date; v_fim date; dia date;
  r record; a public.apuracoes_ponto; dias jsonb := '[]'::jsonb;
BEGIN
  f := public.exigir_colaborador(p_id_funcionario);
  IF p_competencia IS NULL OR p_competencia < DATE '2020-01-01' OR p_competencia > public.hoje_brasil() + 400 THEN RAISE EXCEPTION 'Competência inválida.' USING ERRCODE = 'check_violation'; END IF;
  v_fim := least((v_ini + interval '1 month - 1 day')::date, public.hoje_brasil());
  SELECT * INTO j FROM public.jornadas_funcionario WHERE id_funcionario = f.id AND vigente_desde <= public.hoje_brasil() ORDER BY vigente_desde DESC LIMIT 1;
  dia := greatest(v_ini, f.data_admissao);
  WHILE dia <= v_fim LOOP
    SELECT * INTO r FROM public.calcular_dia_ponto(f.id, dia);
    SELECT * INTO a FROM public.apuracoes_ponto WHERE id_funcionario = f.id AND data = dia;
    dias := dias || jsonb_build_object('data', dia, 'previsto', r.texto_previsto, 'registrado', r.texto_registrado, 'previsto_minutos', r.previsto,
      'trabalhado_minutos', r.trabalhado, 'excedente_minutos', r.excedente, 'atraso_minutos', r.atraso, 'ausencia', r.ausencia, 'incompleta', r.incompleta,
      'intervalo_inconsistente', r.intervalo_inconsistente, 'nao_previsto', r.nao_previsto, 'feriado', r.feriado, 'em_andamento', r.em_andamento,
      'id_apuracao', a.id, 'situacao', a.situacao, 'pedido_esclarecimento', CASE WHEN a.situacao = 'esclarecimento' THEN a.pedido_esclarecimento END,
      'resposta_colaborador', a.resposta_colaborador);
    dia := dia + 1;
  END LOOP;
  RETURN jsonb_build_object(
    'jornada', CASE WHEN j.id IS NOT NULL THEN jsonb_build_object('vigente_desde', j.vigente_desde, 'escala', j.escala, 'tolerancia_minutos', j.tolerancia_minutos,
      'intervalo_minimo_minutos', j.intervalo_minimo_minutos) END,
    'proximos_feriados', coalesce((SELECT jsonb_agg(jsonb_build_object('data', x.data, 'descricao', x.descricao) ORDER BY x.data)
       FROM (SELECT data, descricao FROM public.feriados_empresa WHERE id_empresa = f.id_empresa AND data >= public.hoje_brasil() ORDER BY data LIMIT 5) x), '[]'::jsonb),
    'dias', dias);
END;
$$;

-- ===== 7. Correções =====
DROP FUNCTION IF EXISTS public.solicitar_correcao_ponto(uuid, text, date, time, text, uuid, text);
DROP FUNCTION IF EXISTS public.corrigir_ponto_rh(uuid, text, date, time, text, uuid, text);
DROP FUNCTION IF EXISTS public.validar_solicitacao_ponto(public.funcionarios, text, date, time, text, uuid, text);
CREATE OR REPLACE FUNCTION public.validar_solicitacao_ponto(f public.funcionarios, p_tipo text, p_data date, p_horario time, p_tipo_marcacao text, p_id_marcacao uuid, p_motivo text, p_dia_seguinte boolean)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('incluir', 'desconsiderar') THEN RAISE EXCEPTION 'Tipo de correção inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_motivo, ''))) < 3 OR char_length(p_motivo) > 500 THEN RAISE EXCEPTION 'Informe o motivo da correção.' USING ERRCODE = 'check_violation'; END IF;
  IF p_data IS NULL OR p_data > public.hoje_brasil() OR p_data < public.hoje_brasil() - 62 OR p_data < f.data_admissao THEN
    RAISE EXCEPTION 'Data fora do período permitido para correção (até 62 dias).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tipo = 'incluir' THEN
    IF p_horario IS NULL OR p_tipo_marcacao IS NULL OR p_tipo_marcacao NOT IN ('entrada', 'saida_intervalo', 'retorno_intervalo', 'saida', 'outra') THEN
      RAISE EXCEPTION 'Informe o horário e o tipo da marcação.' USING ERRCODE = 'check_violation';
    END IF;
    IF (p_data + CASE WHEN coalesce(p_dia_seguinte, false) THEN 1 ELSE 0 END + p_horario) AT TIME ZONE 'America/Sao_Paulo' > now() THEN
      RAISE EXCEPTION 'O horário não pode estar no futuro.' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.marcacoes_ponto WHERE id = p_id_marcacao AND id_funcionario = f.id AND data_local = p_data)
       OR EXISTS (SELECT 1 FROM public.marcacoes_desconsideradas WHERE id_marcacao = p_id_marcacao) THEN
      RAISE EXCEPTION 'Marcação não encontrada.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  PERFORM public.exigir_dia_nao_integrado(f.id, p_data);
END;
$$;

CREATE OR REPLACE FUNCTION public.aplicar_solicitacao_ponto(s public.solicitacoes_ponto)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF s.tipo = 'incluir' THEN
    INSERT INTO public.marcacoes_ponto (id, id_empresa, id_funcionario, id_usuario, tipo, registrado_em, data_local, origem, id_solicitacao, situacao_localizacao, situacao_foto)
    VALUES (gen_random_uuid(), s.id_empresa, s.id_funcionario, NULL, s.tipo_marcacao, (s.data + CASE WHEN s.dia_seguinte THEN 1 ELSE 0 END + s.horario) AT TIME ZONE 'America/Sao_Paulo', s.data, 'correcao', s.id,
            'nao_aplicavel', 'nao_aplicavel');
  ELSE
    INSERT INTO public.marcacoes_desconsideradas (id_marcacao, id_solicitacao, criado_por) VALUES (s.id_marcacao, s.id, auth.uid());
  END IF;
  PERFORM public.apurar_dia_ponto(s.id_funcionario, s.data);
END;
$$;

CREATE OR REPLACE FUNCTION public.solicitar_correcao_ponto(p_id_funcionario uuid, p_tipo text, p_data date, p_horario time, p_tipo_marcacao text, p_id_marcacao uuid, p_motivo text, p_dia_seguinte boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.funcionarios; v_id uuid;
BEGIN
  f := public.exigir_colaborador(p_id_funcionario);
  PERFORM public.validar_solicitacao_ponto(f, p_tipo, p_data, p_horario, p_tipo_marcacao, p_id_marcacao, p_motivo, p_dia_seguinte);
  IF (SELECT count(*) FROM public.solicitacoes_ponto WHERE id_funcionario = f.id AND situacao = 'pendente') >= 20 THEN
    RAISE EXCEPTION 'Muitas solicitações pendentes. Aguarde a análise do RH.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.solicitacoes_ponto (id_empresa, id_funcionario, tipo, data, horario, tipo_marcacao, dia_seguinte, id_marcacao, motivo, origem, criado_por)
  VALUES (f.id_empresa, f.id, p_tipo, p_data, CASE WHEN p_tipo = 'incluir' THEN p_horario END, CASE WHEN p_tipo = 'incluir' THEN p_tipo_marcacao END,
          p_tipo = 'incluir' AND coalesce(p_dia_seguinte, false), CASE WHEN p_tipo = 'desconsiderar' THEN p_id_marcacao END, btrim(p_motivo), 'colaborador', auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.registrar_historico_ponto(f.id_empresa, f.id, 'correcao_solicitada', 'Correção de ponto solicitada pelo colaborador (' || to_char(p_data, 'DD/MM/YYYY') || ')',
    jsonb_build_object('id', v_id, 'tipo', p_tipo));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_solicitacao_ponto(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.solicitacoes_ponto;
BEGIN
  SELECT * INTO s FROM public.solicitacoes_ponto WHERE id = p_id FOR UPDATE;
  IF s.id IS NULL OR s.origem <> 'colaborador' OR (public.funcionario_do_colaborador(s.id_funcionario)).id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '42501'; END IF;
  IF s.situacao <> 'pendente' THEN RAISE EXCEPTION 'Só é possível cancelar solicitações pendentes.' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.solicitacoes_ponto SET situacao = 'cancelada', respondido_em = now(), respondido_por = auth.uid() WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.minhas_solicitacoes_ponto(p_id_funcionario uuid)
RETURNS TABLE (id uuid, tipo text, data date, horario time, tipo_marcacao text, dia_seguinte boolean, id_marcacao uuid, motivo text, situacao text, resposta text, criado_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE f public.funcionarios;
BEGIN
  f := public.exigir_colaborador(p_id_funcionario);
  RETURN QUERY SELECT s.id, s.tipo, s.data, s.horario, s.tipo_marcacao, s.dia_seguinte, s.id_marcacao, s.motivo, s.situacao, s.resposta, s.criado_em
                 FROM public.solicitacoes_ponto s WHERE s.id_funcionario = f.id ORDER BY s.criado_em DESC LIMIT 100;
END;
$$;

-- RH: responde pedido do colaborador
CREATE OR REPLACE FUNCTION public.responder_solicitacao_ponto(p_id uuid, p_aprovar boolean, p_resposta text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.solicitacoes_ponto; f public.funcionarios; v_resp text := nullif(btrim(coalesce(p_resposta, '')), '');
BEGIN
  SELECT * INTO s FROM public.solicitacoes_ponto WHERE id = p_id FOR UPDATE;
  IF s.id IS NULL OR NOT public.pode_gerenciar_folha(s.id_empresa) THEN RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '42501'; END IF;
  IF s.situacao <> 'pendente' THEN RAISE EXCEPTION 'Esta solicitação já foi respondida.' USING ERRCODE = 'check_violation'; END IF;
  IF p_aprovar IS NULL THEN RAISE EXCEPTION 'Informe a decisão.' USING ERRCODE = 'check_violation'; END IF;
  IF NOT p_aprovar AND (v_resp IS NULL OR char_length(v_resp) < 3) THEN RAISE EXCEPTION 'Informe o motivo da recusa.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(coalesce(v_resp, '')) > 500 THEN RAISE EXCEPTION 'Resposta muito longa (máximo de 500 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO f FROM public.funcionarios WHERE id = s.id_funcionario;
  IF p_aprovar THEN
    PERFORM public.exigir_dia_nao_integrado(s.id_funcionario, s.data);
    IF s.tipo = 'desconsiderar' AND EXISTS (SELECT 1 FROM public.marcacoes_desconsideradas WHERE id_marcacao = s.id_marcacao) THEN
      RAISE EXCEPTION 'Esta marcação já foi desconsiderada.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  UPDATE public.solicitacoes_ponto SET situacao = CASE WHEN p_aprovar THEN 'aprovada' ELSE 'recusada' END, resposta = v_resp, respondido_por = auth.uid(), respondido_em = now()
   WHERE id = p_id RETURNING * INTO s;
  IF p_aprovar THEN PERFORM public.aplicar_solicitacao_ponto(s); END IF;
  PERFORM public.registrar_historico_ponto(s.id_empresa, s.id_funcionario, CASE WHEN p_aprovar THEN 'correcao_aprovada' ELSE 'correcao_recusada' END,
    CASE WHEN p_aprovar THEN 'Correção de ponto aprovada (' ELSE 'Correção de ponto recusada (' END || to_char(s.data, 'DD/MM/YYYY') || ')', jsonb_build_object('id', s.id));
  IF s.origem = 'colaborador' THEN
    PERFORM public.notificar_colaborador(s.id_funcionario, CASE WHEN p_aprovar THEN 'Correção de ponto aprovada' ELSE 'Correção de ponto recusada' END,
      'Sua solicitação de ' || to_char(s.data, 'DD/MM/YYYY') || CASE WHEN p_aprovar THEN ' foi aprovada.' ELSE ' foi recusada: ' || v_resp END, '/colaborador/jornada?aba=correcoes');
  END IF;
END;
$$;

-- RH: correção direta (mantém o original; fica registrada como solicitação aprovada de origem RH)
CREATE OR REPLACE FUNCTION public.corrigir_ponto_rh(p_id_funcionario uuid, p_tipo text, p_data date, p_horario time, p_tipo_marcacao text, p_id_marcacao uuid, p_motivo text, p_dia_seguinte boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.funcionarios; s public.solicitacoes_ponto;
BEGIN
  f := public.exigir_rh_funcionario(p_id_funcionario);
  PERFORM public.validar_solicitacao_ponto(f, p_tipo, p_data, p_horario, p_tipo_marcacao, p_id_marcacao, p_motivo, p_dia_seguinte);
  INSERT INTO public.solicitacoes_ponto (id_empresa, id_funcionario, tipo, data, horario, tipo_marcacao, dia_seguinte, id_marcacao, motivo, origem, situacao, criado_por, respondido_por, respondido_em)
  VALUES (f.id_empresa, f.id, p_tipo, p_data, CASE WHEN p_tipo = 'incluir' THEN p_horario END, CASE WHEN p_tipo = 'incluir' THEN p_tipo_marcacao END,
          p_tipo = 'incluir' AND coalesce(p_dia_seguinte, false), CASE WHEN p_tipo = 'desconsiderar' THEN p_id_marcacao END, btrim(p_motivo), 'rh', 'aprovada', auth.uid(), auth.uid(), now())
  RETURNING * INTO s;
  PERFORM public.aplicar_solicitacao_ponto(s);
  PERFORM public.registrar_historico_ponto(f.id_empresa, f.id, 'correcao_rh', 'Correção de ponto feita pelo RH (' || to_char(p_data, 'DD/MM/YYYY') || '): ' || btrim(p_motivo),
    jsonb_build_object('id', s.id, 'tipo', p_tipo));
  RETURN s.id;
END;
$$;

-- ===== 8. Fase 4 — Jornada, apuração e conferência (RH) =====
CREATE OR REPLACE FUNCTION public.salvar_jornada_funcionario(p_id_funcionario uuid, p_vigente_desde date, p_escala jsonb, p_tolerancia integer,
  p_intervalo_minimo integer, p_limite_sem_intervalo integer, p_tratamento text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.funcionarios; v_id uuid;
BEGIN
  f := public.exigir_rh_funcionario(p_id_funcionario);
  PERFORM public.validar_escala_ponto(p_escala);
  IF p_vigente_desde IS NULL OR p_vigente_desde < public.hoje_brasil() - 62 OR p_vigente_desde > public.hoje_brasil() + 400 THEN
    RAISE EXCEPTION 'Data de início da jornada inválida (até 62 dias para trás).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tolerancia IS NULL OR p_tolerancia NOT BETWEEN 0 AND 60 OR p_intervalo_minimo IS NULL OR p_intervalo_minimo NOT BETWEEN 0 AND 240
     OR p_limite_sem_intervalo IS NULL OR p_limite_sem_intervalo NOT BETWEEN 60 AND 720 OR p_tratamento IS NULL OR p_tratamento NOT IN ('conferir', 'hora_extra', 'banco_horas') THEN
    RAISE EXCEPTION 'Parâmetros da jornada inválidos.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.jornadas_funcionario (id_empresa, id_funcionario, vigente_desde, escala, tolerancia_minutos, intervalo_minimo_minutos, limite_sem_intervalo_minutos, tratamento_excedente, criado_por)
  VALUES (f.id_empresa, f.id, p_vigente_desde, p_escala, p_tolerancia, p_intervalo_minimo, p_limite_sem_intervalo, p_tratamento, auth.uid())
  ON CONFLICT (id_funcionario, vigente_desde) DO UPDATE
    SET escala = EXCLUDED.escala, tolerancia_minutos = EXCLUDED.tolerancia_minutos, intervalo_minimo_minutos = EXCLUDED.intervalo_minimo_minutos,
        limite_sem_intervalo_minutos = EXCLUDED.limite_sem_intervalo_minutos, tratamento_excedente = EXCLUDED.tratamento_excedente
  RETURNING id INTO v_id;
  PERFORM public.registrar_historico_ponto(f.id_empresa, f.id, 'jornada_salva', 'Jornada configurada a partir de ' || to_char(p_vigente_desde, 'DD/MM/YYYY'),
    jsonb_build_object('escala', p_escala, 'tolerancia', p_tolerancia, 'tratamento', p_tratamento));
  PERFORM public.notificar_colaborador(f.id, 'Sua jornada foi atualizada', 'Nova escala a partir de ' || to_char(p_vigente_desde, 'DD/MM/YYYY') || '.', '/colaborador/jornada');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_feriado_empresa(p_id_empresa uuid, p_data date, p_descricao text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_gerenciar_folha(p_id_empresa) THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501'; END IF;
  IF p_data IS NULL OR char_length(btrim(coalesce(p_descricao, ''))) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'Informe a data e a descrição do feriado.' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.feriados_empresa (id_empresa, data, descricao, criado_por) VALUES (p_id_empresa, p_data, btrim(p_descricao), auth.uid())
  ON CONFLICT (id_empresa, data) DO UPDATE SET descricao = EXCLUDED.descricao RETURNING id INTO v_id;
  PERFORM public.registrar_historico_ponto(p_id_empresa, NULL, 'feriado_salvo', 'Feriado ' || to_char(p_data, 'DD/MM/YYYY') || ': ' || btrim(p_descricao), NULL);
  RETURN v_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.excluir_feriado_empresa(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE x public.feriados_empresa;
BEGIN
  SELECT * INTO x FROM public.feriados_empresa WHERE id = p_id;
  IF x.id IS NULL OR NOT public.pode_gerenciar_folha(x.id_empresa) THEN RAISE EXCEPTION 'Feriado não encontrado.' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.feriados_empresa WHERE id = p_id;
  PERFORM public.registrar_historico_ponto(x.id_empresa, NULL, 'feriado_excluido', 'Feriado excluído: ' || to_char(x.data, 'DD/MM/YYYY'), NULL);
END;
$$;

-- Apura todos os dias da competência (até hoje) de todos os funcionários com jornada. Idempotente.
CREATE OR REPLACE FUNCTION public.apurar_ponto_competencia(p_id_empresa uuid, p_competencia date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ini date; v_fim date; f record; dia date; n integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_gerenciar_folha(p_id_empresa) THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501'; END IF;
  v_ini := public.validar_competencia_folha(p_competencia);
  v_fim := least((v_ini + interval '1 month - 1 day')::date, public.hoje_brasil());
  FOR f IN SELECT x.id FROM public.funcionarios_da_competencia(p_id_empresa, v_ini) x
            WHERE EXISTS (SELECT 1 FROM public.jornadas_funcionario j WHERE j.id_funcionario = x.id AND j.vigente_desde <= v_fim) LOOP
    dia := v_ini;
    WHILE dia <= v_fim LOOP
      PERFORM public.apurar_dia_ponto(f.id, dia);
      dia := dia + 1;
    END LOOP;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.conferir_apuracao_ponto(p_id uuid, p_classificacao text, p_justificativa text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.apuracoes_ponto; v_just text := nullif(btrim(coalesce(p_justificativa, '')), ''); v_validas text[];
BEGIN
  SELECT * INTO a FROM public.apuracoes_ponto WHERE id = p_id FOR UPDATE;
  IF a.id IS NULL OR NOT public.pode_gerenciar_folha(a.id_empresa) THEN RAISE EXCEPTION 'Apuração não encontrada.' USING ERRCODE = '42501'; END IF;
  IF a.situacao = 'integrada' THEN RAISE EXCEPTION 'Este dia já foi integrado à folha de pagamento.' USING ERRCODE = 'check_violation'; END IF;
  IF a.incompleta THEN RAISE EXCEPTION 'Marcações incompletas: corrija o ponto ou peça esclarecimento antes de conferir.' USING ERRCODE = 'check_violation'; END IF;
  -- Horas efetivamente registradas não são apagadas: excedente só vira hora extra, banco de horas ou compensação
  v_validas := CASE WHEN a.excedente_minutos > 0 THEN ARRAY['hora_extra', 'banco_horas', 'compensacao']
                    WHEN a.ausencia THEN ARRAY['falta', 'falta_justificada', 'abonada']
                    WHEN a.atraso_minutos > 0 THEN ARRAY['atraso', 'atraso_justificado', 'compensacao']
                    ELSE ARRAY['ciente'] END;
  IF p_classificacao IS NULL OR NOT (p_classificacao = ANY (v_validas)) THEN RAISE EXCEPTION 'Classificação inválida para esta ocorrência.' USING ERRCODE = 'check_violation'; END IF;
  IF p_classificacao IN ('falta_justificada', 'abonada', 'atraso_justificado', 'compensacao') AND (v_just IS NULL OR char_length(v_just) < 3) THEN
    RAISE EXCEPTION 'Registre a justificativa.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(coalesce(v_just, '')) > 500 THEN RAISE EXCEPTION 'Justificativa muito longa (máximo de 500 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.apuracoes_ponto SET situacao = 'conferida', classificacao = p_classificacao, justificativa = v_just, conferido_por = auth.uid(), conferido_em = now(),
         atualizado_em = now() WHERE id = p_id;
  PERFORM public.registrar_historico_ponto(a.id_empresa, a.id_funcionario, 'apuracao_conferida',
    'Ponto de ' || to_char(a.data, 'DD/MM/YYYY') || ' conferido: ' || replace(p_classificacao, '_', ' '), jsonb_build_object('id', a.id, 'justificativa', v_just));
END;
$$;

CREATE OR REPLACE FUNCTION public.desfazer_conferencia_ponto(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.apuracoes_ponto;
BEGIN
  SELECT * INTO a FROM public.apuracoes_ponto WHERE id = p_id FOR UPDATE;
  IF a.id IS NULL OR NOT public.pode_gerenciar_folha(a.id_empresa) THEN RAISE EXCEPTION 'Apuração não encontrada.' USING ERRCODE = '42501'; END IF;
  IF a.situacao <> 'conferida' THEN RAISE EXCEPTION 'Só é possível desfazer uma conferência ainda não integrada à folha.' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.apuracoes_ponto SET situacao = 'apurada', classificacao = NULL, justificativa = NULL, conferido_por = NULL, conferido_em = NULL, atualizado_em = now() WHERE id = p_id;
  PERFORM public.registrar_historico_ponto(a.id_empresa, a.id_funcionario, 'conferencia_desfeita', 'Conferência do ponto de ' || to_char(a.data, 'DD/MM/YYYY') || ' desfeita', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.solicitar_esclarecimento_ponto(p_id uuid, p_pergunta text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.apuracoes_ponto; v text := nullif(btrim(coalesce(p_pergunta, '')), '');
BEGIN
  SELECT * INTO a FROM public.apuracoes_ponto WHERE id = p_id FOR UPDATE;
  IF a.id IS NULL OR NOT public.pode_gerenciar_folha(a.id_empresa) THEN RAISE EXCEPTION 'Apuração não encontrada.' USING ERRCODE = '42501'; END IF;
  IF a.situacao NOT IN ('apurada', 'esclarecimento') THEN RAISE EXCEPTION 'Desfaça a conferência antes de pedir esclarecimento.' USING ERRCODE = 'check_violation'; END IF;
  IF v IS NULL OR char_length(v) < 3 OR char_length(v) > 500 THEN RAISE EXCEPTION 'Escreva o que precisa ser esclarecido.' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.apuracoes_ponto SET situacao = 'esclarecimento', pedido_esclarecimento = v, resposta_colaborador = NULL, atualizado_em = now() WHERE id = p_id;
  PERFORM public.registrar_historico_ponto(a.id_empresa, a.id_funcionario, 'esclarecimento_solicitado', 'Esclarecimento pedido sobre ' || to_char(a.data, 'DD/MM/YYYY'), jsonb_build_object('pergunta', v));
  PERFORM public.notificar_colaborador(a.id_funcionario, 'O RH pediu um esclarecimento', 'Sobre o ponto de ' || to_char(a.data, 'DD/MM/YYYY') || ': ' || v, '/colaborador/jornada?aba=espelho');
END;
$$;

CREATE OR REPLACE FUNCTION public.responder_esclarecimento_ponto(p_id uuid, p_resposta text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.apuracoes_ponto; v text := nullif(btrim(coalesce(p_resposta, '')), '');
BEGIN
  SELECT * INTO a FROM public.apuracoes_ponto WHERE id = p_id FOR UPDATE;
  IF a.id IS NULL OR (public.funcionario_do_colaborador(a.id_funcionario)).id IS NULL THEN RAISE EXCEPTION 'Apuração não encontrada.' USING ERRCODE = '42501'; END IF;
  IF a.situacao <> 'esclarecimento' THEN RAISE EXCEPTION 'Não há esclarecimento pendente para este dia.' USING ERRCODE = 'check_violation'; END IF;
  IF v IS NULL OR char_length(v) < 3 OR char_length(v) > 500 THEN RAISE EXCEPTION 'Escreva sua resposta (até 500 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.apuracoes_ponto SET situacao = 'apurada', resposta_colaborador = v, atualizado_em = now() WHERE id = p_id;
  PERFORM public.registrar_historico_ponto(a.id_empresa, a.id_funcionario, 'esclarecimento_respondido', 'Colaborador respondeu sobre ' || to_char(a.data, 'DD/MM/YYYY'), jsonb_build_object('resposta', v));
END;
$$;

-- Painel do RH: apurações do mês com funcionário, solicitações pendentes e o que está pronto para a folha
CREATE OR REPLACE FUNCTION public.painel_ponto(p_id_empresa uuid, p_competencia date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ini date; v_fim date; c public.competencias_folha;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_gerenciar_folha(p_id_empresa) THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501'; END IF;
  v_ini := public.validar_competencia_folha(p_competencia);
  v_fim := (v_ini + interval '1 month - 1 day')::date;
  SELECT * INTO c FROM public.competencias_folha WHERE id_empresa = p_id_empresa AND competencia = v_ini;
  RETURN jsonb_build_object(
    'status_folha', coalesce(c.status, 'preparacao'),
    'apuracoes', coalesce((SELECT jsonb_agg(to_jsonb(a) || jsonb_build_object('funcionario', f.nome, 'matricula', f.matricula,
        'tratamento_padrao', (SELECT j.tratamento_excedente FROM public.jornadas_funcionario j WHERE j.id_funcionario = a.id_funcionario AND j.vigente_desde <= a.data ORDER BY j.vigente_desde DESC LIMIT 1),
        'ocorrencia_processada', a.situacao = 'integrada' AND coalesce(c.status, '') = 'aprovada')
        ORDER BY a.data, f.nome)
      FROM public.apuracoes_ponto a JOIN public.funcionarios f ON f.id = a.id_funcionario
      WHERE a.id_empresa = p_id_empresa AND a.data BETWEEN v_ini AND v_fim), '[]'::jsonb),
    'solicitacoes', coalesce((SELECT jsonb_agg(to_jsonb(s) || jsonb_build_object('funcionario', f.nome,
        'marcacao_original', (SELECT to_char(m.registrado_em AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') || ' (' || replace(m.tipo, '_', ' ') || ')' FROM public.marcacoes_ponto m WHERE m.id = s.id_marcacao))
        ORDER BY s.criado_em)
      FROM public.solicitacoes_ponto s JOIN public.funcionarios f ON f.id = s.id_funcionario
      WHERE s.id_empresa = p_id_empresa AND s.situacao = 'pendente'), '[]'::jsonb),
    'sem_jornada', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome) ORDER BY x.nome)
      FROM public.funcionarios_da_competencia(p_id_empresa, v_ini) x
      WHERE x.status = 'ativo' AND NOT EXISTS (SELECT 1 FROM public.jornadas_funcionario j WHERE j.id_funcionario = x.id)), '[]'::jsonb),
    'feriados', coalesce((SELECT jsonb_agg(jsonb_build_object('id', h.id, 'data', h.data, 'descricao', h.descricao) ORDER BY h.data)
      FROM public.feriados_empresa h WHERE h.id_empresa = p_id_empresa AND h.data BETWEEN v_ini - 31 AND v_fim + 366), '[]'::jsonb));
END;
$$;

-- Evidências do dia (RH): marcações originais, correções e situação de foto/GPS
CREATE OR REPLACE FUNCTION public.marcacoes_do_dia(p_id_funcionario uuid, p_data date)
RETURNS TABLE (id uuid, tipo text, registrado_em timestamptz, origem text, desconsiderada boolean, situacao_foto text, foto_caminho text,
               situacao_localizacao text, latitude numeric, longitude numeric, precisao_metros numeric, motivo_correcao text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE f public.funcionarios;
BEGIN
  f := public.exigir_rh_funcionario(p_id_funcionario);
  RETURN QUERY
  SELECT m.id, m.tipo, m.registrado_em, m.origem, EXISTS (SELECT 1 FROM public.marcacoes_desconsideradas d WHERE d.id_marcacao = m.id),
         m.situacao_foto, m.foto_caminho, m.situacao_localizacao, m.latitude, m.longitude, m.precisao_metros,
         (SELECT s.motivo FROM public.solicitacoes_ponto s WHERE s.id = m.id_solicitacao)
    FROM public.marcacoes_ponto m WHERE m.id_funcionario = f.id AND m.data_local = p_data ORDER BY m.registrado_em;
END;
$$;

-- ===== 9. Fase 5 — Integração idempotente com a Folha (052) =====
-- Uma ocorrência por funcionário e tipo a cada integração; cada dia só é integrado uma vez (id_ocorrencia). Só com a folha em preparação/correção.
CREATE OR REPLACE FUNCTION public.integrar_ponto_folha(p_id_empresa uuid, p_competencia date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.competencias_folha; g record; v_oc uuid; n integer := 0; v_fim date;
BEGIN
  c := public.competencia_editavel_folha(p_id_empresa, p_competencia);
  v_fim := (c.competencia + interval '1 month - 1 day')::date;
  FOR g IN
    SELECT a.id_funcionario,
           CASE WHEN a.classificacao = 'hora_extra' THEN 'horas_extras' WHEN a.classificacao IN ('falta', 'falta_justificada') THEN 'faltas' ELSE 'atrasos' END AS tipo,
           CASE WHEN a.classificacao IN ('falta_justificada', 'atraso_justificado') THEN 'justificada' WHEN a.classificacao IN ('falta', 'atraso') THEN 'nao_justificada' END AS sit,
           array_agg(a.id ORDER BY a.data) AS ids, min(a.data) AS inicio, max(a.data) AS fim, count(*) AS dias,
           sum(CASE WHEN a.classificacao = 'hora_extra' THEN a.excedente_minutos ELSE a.atraso_minutos END) AS minutos,
           string_agg(a.justificativa, ' | ' ORDER BY a.data) FILTER (WHERE a.justificativa IS NOT NULL) AS just
      FROM public.apuracoes_ponto a
     WHERE a.id_empresa = p_id_empresa AND a.data BETWEEN c.competencia AND v_fim AND a.situacao = 'conferida'
       AND a.classificacao IN ('hora_extra', 'falta', 'falta_justificada', 'atraso', 'atraso_justificado')
     GROUP BY 1, 2, 3
  LOOP
    IF NOT public.funcionario_na_competencia(g.id_funcionario, c) THEN CONTINUE; END IF;
    v_oc := public.salvar_ocorrencia_folha(NULL, p_id_empresa, c.competencia, g.id_funcionario, g.tipo,
      CASE WHEN g.tipo = 'faltas' THEN g.dias::numeric ELSE round(g.minutos::numeric / 60, 2) END, NULL, g.inicio, g.fim, g.sit,
      CASE WHEN g.sit = 'justificada' THEN left(coalesce(g.just, 'Justificado na conferência do ponto'), 1000) END,
      left('Apurado pelo ponto (' || g.dias || CASE WHEN g.dias = 1 THEN ' dia' ELSE ' dias' END || ') e conferido pelo RH. Controle auxiliar.', 1000));
    UPDATE public.apuracoes_ponto SET situacao = 'integrada', id_ocorrencia = v_oc, integrado_em = now(), atualizado_em = now() WHERE id = ANY (g.ids);
    n := n + 1;
  END LOOP;
  IF n > 0 THEN
    PERFORM public.registrar_historico_ponto(p_id_empresa, NULL, 'integrado_folha', n || ' ocorrência(s) do ponto enviadas à folha de ' || to_char(c.competencia, 'MM/YYYY'), NULL);
  END IF;
  RETURN n;
END;
$$;

-- ===== 9b. Holerite disponível: aviso quando a competência é aprovada =====
CREATE OR REPLACE FUNCTION public.notificar_holerites_aprovados()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record;
BEGIN
  IF NEW.status = 'aprovada' AND OLD.status IS DISTINCT FROM 'aprovada' THEN
    FOR d IN SELECT DISTINCT doc.id_funcionario FROM public.documentos_folha doc
               JOIN public.devolucoes_folha v ON v.id = doc.id_devolucao AND v.situacao <> 'rascunho'
              WHERE doc.id_competencia = NEW.id AND doc.categoria = 'holerite' AND doc.excluido_em IS NULL LOOP
      PERFORM public.notificar_colaborador(d.id_funcionario, 'Holerite disponível',
        'Seu holerite de ' || to_char(NEW.competencia, 'MM/YYYY') || ' está em Meus documentos.', '/colaborador/documentos');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notificar_holerites_aprovados ON public.competencias_folha;
CREATE TRIGGER notificar_holerites_aprovados AFTER UPDATE OF status ON public.competencias_folha FOR EACH ROW EXECUTE FUNCTION public.notificar_holerites_aprovados();

-- ===== 9c. Retenção das fotos do ponto =====
CREATE OR REPLACE FUNCTION public.salvar_politica_retencao_ponto(p_id_empresa uuid, p_prazo_dias integer, p_exclusao_ativa boolean, p_fundamento text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fund text := nullif(btrim(coalesce(p_fundamento, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_gerenciar_folha(p_id_empresa) THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501'; END IF;
  IF p_prazo_dias IS NOT NULL AND p_prazo_dias NOT BETWEEN 30 AND 3650 THEN RAISE EXCEPTION 'Prazo de retenção entre 30 e 3650 dias.' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_exclusao_ativa, false) AND (p_prazo_dias IS NULL OR char_length(coalesce(v_fund, '')) < 10) THEN
    RAISE EXCEPTION 'Para ativar a exclusão automática, informe o prazo e o fundamento jurídico validado.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(coalesce(v_fund, '')) > 500 THEN RAISE EXCEPTION 'Fundamento muito longo (máximo de 500 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.politicas_retencao_ponto (id_empresa, prazo_dias, exclusao_ativa, fundamento, atualizado_por, atualizado_em)
  VALUES (p_id_empresa, p_prazo_dias, coalesce(p_exclusao_ativa, false), v_fund, auth.uid(), now())
  ON CONFLICT (id_empresa) DO UPDATE SET prazo_dias = EXCLUDED.prazo_dias, exclusao_ativa = EXCLUDED.exclusao_ativa, fundamento = EXCLUDED.fundamento,
    atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now();
  PERFORM public.registrar_historico_ponto(p_id_empresa, NULL, 'retencao_fotos',
    'Retenção das fotos: ' || coalesce(p_prazo_dias || ' dias', 'sem prazo') || CASE WHEN coalesce(p_exclusao_ativa, false) THEN ', exclusão automática ativada' ELSE ', exclusão automática desativada' END,
    jsonb_build_object('prazo_dias', p_prazo_dias, 'exclusao_ativa', coalesce(p_exclusao_ativa, false), 'fundamento', v_fund));
END;
$$;

CREATE OR REPLACE FUNCTION public.criar_retencao_legal_ponto(p_id_empresa uuid, p_id_funcionario uuid, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_gerenciar_folha(p_id_empresa) THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501'; END IF;
  IF p_id_funcionario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.funcionarios WHERE id = p_id_funcionario AND id_empresa = p_id_empresa) THEN
    RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF v IS NULL OR char_length(v) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Descreva o motivo da retenção (processo, notificação…).' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.retencoes_legais_ponto (id_empresa, id_funcionario, motivo, criado_por) VALUES (p_id_empresa, p_id_funcionario, v, auth.uid()) RETURNING id INTO v_id;
  PERFORM public.registrar_historico_ponto(p_id_empresa, p_id_funcionario, 'retencao_legal_criada', 'Retenção legal das fotos: ' || v, jsonb_build_object('id', v_id));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.encerrar_retencao_legal_ponto(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.retencoes_legais_ponto;
BEGIN
  SELECT * INTO r FROM public.retencoes_legais_ponto WHERE id = p_id FOR UPDATE;
  IF r.id IS NULL OR NOT public.pode_gerenciar_folha(r.id_empresa) THEN RAISE EXCEPTION 'Retenção não encontrada.' USING ERRCODE = '42501'; END IF;
  IF r.encerrado_em IS NOT NULL THEN RETURN; END IF;
  UPDATE public.retencoes_legais_ponto SET encerrado_em = now(), encerrado_por = auth.uid() WHERE id = p_id;
  PERFORM public.registrar_historico_ponto(r.id_empresa, r.id_funcionario, 'retencao_legal_encerrada', 'Retenção legal das fotos encerrada: ' || r.motivo, jsonb_build_object('id', p_id));
END;
$$;

-- Fotos elegíveis: política da empresa ATIVA com prazo vencido; sem retenção legal; dia sem apuração em aberto; menos de 5 tentativas.
CREATE OR REPLACE FUNCTION public.fotos_elegiveis_expurgo()
RETURNS TABLE (id_marcacao uuid, id_empresa uuid, caminho text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.id_empresa, m.foto_caminho
    FROM public.marcacoes_ponto m
    JOIN public.politicas_retencao_ponto p ON p.id_empresa = m.id_empresa AND p.exclusao_ativa AND p.prazo_dias IS NOT NULL
   WHERE m.foto_caminho IS NOT NULL AND m.situacao_foto = 'capturada'
     AND m.registrado_em < now() - make_interval(days => p.prazo_dias)
     AND NOT EXISTS (SELECT 1 FROM public.retencoes_legais_ponto r WHERE r.id_empresa = m.id_empresa AND r.encerrado_em IS NULL
                       AND (r.id_funcionario IS NULL OR r.id_funcionario = m.id_funcionario))
     AND NOT EXISTS (SELECT 1 FROM public.apuracoes_ponto a WHERE a.id_funcionario = m.id_funcionario AND a.data = m.data_local AND a.situacao IN ('apurada', 'esclarecimento'))
     AND NOT EXISTS (SELECT 1 FROM public.solicitacoes_ponto s WHERE s.id_funcionario = m.id_funcionario AND s.data = m.data_local AND s.situacao = 'pendente')
     AND coalesce((SELECT e.tentativas FROM public.expurgos_fotos_ponto e WHERE e.id_marcacao = m.id), 0) < 5;
$$;

-- Executor (servidor agendado, chave de serviço): reserva um lote e devolve os caminhos a remover do Storage
CREATE OR REPLACE FUNCTION public.iniciar_expurgo_fotos_ponto(p_limite integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exec uuid; v_itens jsonb;
BEGIN
  INSERT INTO public.execucoes_expurgo_ponto DEFAULT VALUES RETURNING id INTO v_exec;
  WITH lote AS (SELECT * FROM public.fotos_elegiveis_expurgo() LIMIT greatest(1, least(coalesce(p_limite, 100), 500))),
  reg AS (
    INSERT INTO public.expurgos_fotos_ponto (id_marcacao, id_empresa, caminho, id_execucao)
    SELECT l.id_marcacao, l.id_empresa, l.caminho, v_exec FROM lote l
    ON CONFLICT (id_marcacao) DO UPDATE SET id_execucao = EXCLUDED.id_execucao, atualizado_em = now()
    RETURNING id_marcacao, caminho)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id_marcacao', id_marcacao, 'caminho', caminho)), '[]'::jsonb) INTO v_itens FROM reg;
  UPDATE public.execucoes_expurgo_ponto SET selecionadas = jsonb_array_length(v_itens) WHERE id = v_exec;
  RETURN jsonb_build_object('id_execucao', v_exec, 'itens', v_itens);
END;
$$;

-- Conclui um item (idempotente). Antes de anular o registro, confere de novo a elegibilidade (retenção legal criada no meio do caminho).
CREATE OR REPLACE FUNCTION public.concluir_expurgo_foto_ponto(p_id_execucao uuid, p_id_marcacao uuid, p_ok boolean, p_erro text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.expurgos_fotos_ponto;
BEGIN
  SELECT * INTO e FROM public.expurgos_fotos_ponto WHERE id_marcacao = p_id_marcacao FOR UPDATE;
  IF e.id_marcacao IS NULL OR e.excluido_em IS NOT NULL THEN RETURN; END IF;
  IF coalesce(p_ok, false) THEN
    PERFORM set_config('unnify.expurgo_foto', 'sim', true);
    UPDATE public.marcacoes_ponto SET foto_caminho = NULL, situacao_foto = 'expurgada', foto_expurgada_em = now() WHERE id = p_id_marcacao AND foto_caminho IS NOT NULL;
    PERFORM set_config('unnify.expurgo_foto', '', true);
    UPDATE public.expurgos_fotos_ponto SET excluido_em = now(), ultimo_erro = NULL, atualizado_em = now() WHERE id_marcacao = p_id_marcacao;
    UPDATE public.execucoes_expurgo_ponto SET excluidas = excluidas + 1 WHERE id = p_id_execucao;
  ELSE
    UPDATE public.expurgos_fotos_ponto SET tentativas = tentativas + 1, ultimo_erro = left(coalesce(p_erro, 'falha'), 300), atualizado_em = now() WHERE id_marcacao = p_id_marcacao;
    UPDATE public.execucoes_expurgo_ponto SET falhas = falhas + 1 WHERE id = p_id_execucao;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalizar_expurgo_fotos_ponto(p_id_execucao uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.execucoes_expurgo_ponto SET concluido_em = now() WHERE id = p_id_execucao AND concluido_em IS NULL;
$$;

-- ===== 10. Permissões de execução =====
REVOKE ALL ON FUNCTION public.registrar_historico_ponto(uuid, uuid, text, text, jsonb), public.funcionario_do_colaborador(uuid), public.exigir_colaborador(uuid),
  public.exigir_rh_funcionario(uuid), public.minutos_do_horario(text), public.horario_dos_minutos(integer), public.validar_escala_ponto(jsonb),
  public.calcular_dia_ponto(uuid, date), public.apurar_dia_ponto(uuid, date), public.exigir_dia_nao_integrado(uuid, date),
  public.revogar_portal_no_desligamento(), public.proteger_registro_ponto(),
  public.colaborador_pode_ler_holerite(text), public.pode_enviar_foto_ponto(text), public.pode_ler_foto_ponto(text),
  public.validar_solicitacao_ponto(public.funcionarios, text, date, time, text, uuid, text, boolean), public.aplicar_solicitacao_ponto(public.solicitacoes_ponto),
  public.notificar_colaborador(uuid, text, text, text), public.notificar_holerites_aprovados(), public.fotos_elegiveis_expurgo(),
  public.iniciar_expurgo_fotos_ponto(integer), public.concluir_expurgo_foto_ponto(uuid, uuid, boolean, text), public.finalizar_expurgo_fotos_ponto(uuid)
  FROM PUBLIC, anon, authenticated;
-- Executor agendado do expurgo: só a chave de serviço (nunca usuários)
GRANT EXECUTE ON FUNCTION public.iniciar_expurgo_fotos_ponto(integer), public.concluir_expurgo_foto_ponto(uuid, uuid, boolean, text),
  public.finalizar_expurgo_fotos_ponto(uuid) TO service_role;
-- Políticas de Storage avaliam estas funções com o papel do usuário
GRANT EXECUTE ON FUNCTION public.colaborador_pode_ler_holerite(text), public.pode_enviar_foto_ponto(text), public.pode_ler_foto_ponto(text) TO authenticated;

REVOKE ALL ON FUNCTION public.criar_convite_colaborador(uuid, text, text), public.registrar_envio_convite_colaborador(uuid, boolean),
  public.revogar_convite_colaborador(uuid), public.revogar_acesso_colaborador(uuid, text), public.situacao_portal_funcionario(uuid),
  public.dados_convite_colaborador(text), public.aceitar_convite_colaborador(text), public.portal_colaborador(), public.meus_holerites(uuid),
  public.registrar_marcacao_ponto(uuid, uuid, text, text, numeric, numeric, numeric, text), public.anexar_foto_marcacao(uuid, boolean),
  public.meu_ponto(uuid, date, date), public.minha_jornada(uuid, date), public.solicitar_correcao_ponto(uuid, text, date, time, text, uuid, text, boolean),
  public.cancelar_solicitacao_ponto(uuid), public.minhas_solicitacoes_ponto(uuid), public.responder_solicitacao_ponto(uuid, boolean, text),
  public.corrigir_ponto_rh(uuid, text, date, time, text, uuid, text, boolean), public.salvar_jornada_funcionario(uuid, date, jsonb, integer, integer, integer, text),
  public.salvar_feriado_empresa(uuid, date, text), public.excluir_feriado_empresa(uuid), public.apurar_ponto_competencia(uuid, date),
  public.conferir_apuracao_ponto(uuid, text, text), public.desfazer_conferencia_ponto(uuid), public.solicitar_esclarecimento_ponto(uuid, text),
  public.responder_esclarecimento_ponto(uuid, text), public.painel_ponto(uuid, date), public.marcacoes_do_dia(uuid, date), public.integrar_ponto_folha(uuid, date),
  public.salvar_politica_retencao_ponto(uuid, integer, boolean, text), public.criar_retencao_legal_ponto(uuid, uuid, text), public.encerrar_retencao_legal_ponto(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_convite_colaborador(uuid, text, text), public.registrar_envio_convite_colaborador(uuid, boolean),
  public.revogar_convite_colaborador(uuid), public.revogar_acesso_colaborador(uuid, text), public.situacao_portal_funcionario(uuid),
  public.dados_convite_colaborador(text), public.aceitar_convite_colaborador(text), public.portal_colaborador(), public.meus_holerites(uuid),
  public.registrar_marcacao_ponto(uuid, uuid, text, text, numeric, numeric, numeric, text), public.anexar_foto_marcacao(uuid, boolean),
  public.meu_ponto(uuid, date, date), public.minha_jornada(uuid, date), public.solicitar_correcao_ponto(uuid, text, date, time, text, uuid, text, boolean),
  public.cancelar_solicitacao_ponto(uuid), public.minhas_solicitacoes_ponto(uuid), public.responder_solicitacao_ponto(uuid, boolean, text),
  public.corrigir_ponto_rh(uuid, text, date, time, text, uuid, text, boolean), public.salvar_jornada_funcionario(uuid, date, jsonb, integer, integer, integer, text),
  public.salvar_feriado_empresa(uuid, date, text), public.excluir_feriado_empresa(uuid), public.apurar_ponto_competencia(uuid, date),
  public.conferir_apuracao_ponto(uuid, text, text), public.desfazer_conferencia_ponto(uuid), public.solicitar_esclarecimento_ponto(uuid, text),
  public.responder_esclarecimento_ponto(uuid, text), public.painel_ponto(uuid, date), public.marcacoes_do_dia(uuid, date), public.integrar_ponto_folha(uuid, date),
  public.salvar_politica_retencao_ponto(uuid, integer, boolean, text), public.criar_retencao_legal_ponto(uuid, uuid, text), public.encerrar_retencao_legal_ponto(uuid)
  TO authenticated;
-- O link do e-mail é aberto antes do login: só a leitura pelo token fica disponível sem sessão
GRANT EXECUTE ON FUNCTION public.dados_convite_colaborador(text) TO anon;
