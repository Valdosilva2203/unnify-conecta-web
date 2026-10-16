-- Folha de Pagamento (Recursos Humanos): preparação da competência, ocorrências, conferência, envio consolidado ao contador,
-- devolução (holerites, guias, valores), aprovação pela empresa e integração com o Financeiro. NÃO calcula folha (sem INSS/FGTS/IRRF/eSocial).
-- Reaproveita a 038 (funcionarios, folhas_competencia, ajustes_folha, lançamentos com id_folha) e a baixa do Financeiro.
-- Modelo:
--   competencias_folha = UMA por empresa e competência; o status é a única fonte do fluxo (só muda pelas funções abaixo).
--   ocorrencias_folha  = fatos do mês (horas extras, faltas...). Pendência é OUTRA coisa: falta de informação (calculada a partir da
--                        ocorrência) ou correção registrada (pendencias_folha). Apto = conferência confirmada e nenhuma pendência.
--   conferencias_folha = confirmação explícita do RH (com ou sem ocorrências): quem, quando, competência e funcionário.
--                        Qualquer mudança nas ocorrências ou nova pendência do funcionário invalida a confirmação.
--   pacotes_folha      = envio consolidado (versão + snapshot imutável). Correção = nova versão; a anterior fica "substituído".
--   devolucoes_folha   = retorno do contador para a versão enviada (documentos + líquidos + encargos); revisão = nova devolução.
--   Aprovação: só da devolução vigente e completa. Integra ao Financeiro uma única vez (salários pela 038; encargos separados).
-- Acesso: dono/sócio prepara, envia, aprova e paga. Contador com vínculo ATIVO: "ver_folha" lê; "ver_folha" + "processar_folha" processa.
-- Admin Master sem acesso. Escrita só pelas funções (SECURITY DEFINER). Arquivos no bucket PRIVADO "folha".
-- Reversão: rollback/20261016000052_folha_pagamento_reverter.sql

-- ===== 1. Permissão nova do contador =====
ALTER TABLE public.vinculos_contabeis DROP CONSTRAINT vinculos_contabeis_permissoes;
ALTER TABLE public.vinculos_contabeis ADD CONSTRAINT vinculos_contabeis_permissoes CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
  'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro', 'gerenciar_impostos', 'gerenciar_agenda',
  'gerenciar_certidoes', 'processar_folha']);
ALTER TABLE public.convites_vinculos DROP CONSTRAINT convites_permissoes;
ALTER TABLE public.convites_vinculos ADD CONSTRAINT convites_permissoes CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
  'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro', 'gerenciar_impostos', 'gerenciar_agenda',
  'gerenciar_certidoes', 'processar_folha']);

CREATE OR REPLACE FUNCTION public.pode_processar_folha(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_id_empresa IS NOT NULL AND public.contador_pode(p_id_empresa, 'ver_folha') AND public.contador_pode(p_id_empresa, 'processar_folha');
$$;

-- ===== 2. Matrícula do funcionário (sequencial por empresa; existentes numerados pela ordem de cadastro) =====
ALTER TABLE public.funcionarios ADD COLUMN matricula integer;
UPDATE public.funcionarios f SET matricula = x.n
  FROM (SELECT id, row_number() OVER (PARTITION BY id_empresa ORDER BY criado_em, id) n FROM public.funcionarios) x WHERE x.id = f.id;
ALTER TABLE public.funcionarios ALTER COLUMN matricula SET NOT NULL;
ALTER TABLE public.funcionarios ADD CONSTRAINT funcionarios_matricula_unica UNIQUE (id_empresa, matricula);

CREATE OR REPLACE FUNCTION public.atribuir_matricula_funcionario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN NEW.matricula := OLD.matricula; RETURN NEW; END IF; -- matrícula nunca muda
  PERFORM pg_advisory_xact_lock(hashtext('matricula:' || NEW.id_empresa::text));
  SELECT coalesce(max(matricula), 0) + 1 INTO NEW.matricula FROM public.funcionarios WHERE id_empresa = NEW.id_empresa;
  RETURN NEW;
END;
$$;
CREATE TRIGGER atribuir_matricula_funcionario BEFORE INSERT OR UPDATE OF matricula ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.atribuir_matricula_funcionario();

-- ===== 3. Tabelas =====
CREATE TABLE public.competencias_folha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  competencia date NOT NULL CHECK (extract(day FROM competencia) = 1),
  status text NOT NULL DEFAULT 'preparacao'
    CHECK (status IN ('preparacao', 'enviada', 'em_processamento', 'correcao_solicitada', 'devolvida', 'revisao_solicitada', 'aprovada')),
  versao_atual integer NOT NULL DEFAULT 0 CHECK (versao_atual >= 0),
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competencias_folha_unica UNIQUE (id_empresa, competencia)
);

CREATE TABLE public.ocorrencias_folha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_competencia uuid NOT NULL REFERENCES public.competencias_folha(id) ON DELETE RESTRICT,
  id_funcionario uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('horas_extras', 'faltas', 'atrasos', 'comissoes', 'bonificacoes', 'adiantamentos', 'ferias', 'afastamentos',
                                     'alteracao_salarial', 'admissao', 'desligamento', 'outras')),
  quantidade numeric(10, 2) CHECK (quantidade IS NULL OR (quantidade > 0 AND quantidade <= 9999)),
  valor numeric(14, 2) CHECK (valor IS NULL OR (valor > 0 AND valor <= 9999999.99)),
  data_inicio date,
  data_fim date,
  situacao_justificativa text CHECK (situacao_justificativa IS NULL OR situacao_justificativa IN ('justificada', 'nao_justificada', 'pendente')),
  justificativa text CHECK (justificativa IS NULL OR char_length(justificativa) <= 1000),
  observacoes text CHECK (observacoes IS NULL OR char_length(observacoes) <= 1000),
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  excluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  excluido_em timestamptz,
  CONSTRAINT ocorrencias_folha_datas CHECK (data_fim IS NULL OR (data_inicio IS NOT NULL AND data_fim >= data_inicio))
);
CREATE INDEX idx_ocorrencias_folha ON public.ocorrencias_folha (id_competencia, id_funcionario) WHERE excluido_em IS NULL;

CREATE TABLE public.pendencias_folha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_competencia uuid NOT NULL REFERENCES public.competencias_folha(id) ON DELETE RESTRICT,
  id_funcionario uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  origem text NOT NULL CHECK (origem IN ('rh', 'contador')),
  descricao text NOT NULL CHECK (char_length(btrim(descricao)) BETWEEN 3 AND 500),
  versao integer,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  resolvida_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  resolvida_em timestamptz,
  resolucao text CHECK (resolucao IS NULL OR char_length(resolucao) <= 500)
);
CREATE INDEX idx_pendencias_folha ON public.pendencias_folha (id_competencia, id_funcionario) WHERE resolvida_em IS NULL;

CREATE TABLE public.conferencias_folha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_competencia uuid NOT NULL REFERENCES public.competencias_folha(id) ON DELETE RESTRICT,
  id_funcionario uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  sem_ocorrencias boolean NOT NULL,
  confirmado_por uuid NOT NULL REFERENCES public.perfis(id_usuario) ON DELETE RESTRICT,
  confirmado_em timestamptz NOT NULL DEFAULT now(),
  invalidada_em timestamptz,
  motivo_invalidacao text
);
CREATE UNIQUE INDEX conferencias_folha_vigente ON public.conferencias_folha (id_competencia, id_funcionario) WHERE invalidada_em IS NULL;

CREATE TABLE public.pacotes_folha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_competencia uuid NOT NULL REFERENCES public.competencias_folha(id) ON DELETE RESTRICT,
  versao integer NOT NULL CHECK (versao >= 1),
  situacao text NOT NULL DEFAULT 'vigente' CHECK (situacao IN ('vigente', 'substituido')),
  snapshot jsonb NOT NULL,
  responsavel text NOT NULL CHECK (char_length(btrim(responsavel)) BETWEEN 3 AND 120),
  observacoes text CHECK (observacoes IS NULL OR char_length(observacoes) <= 1000),
  enviado_por uuid NOT NULL REFERENCES public.perfis(id_usuario) ON DELETE RESTRICT,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pacotes_folha_versao UNIQUE (id_competencia, versao)
);
CREATE UNIQUE INDEX pacotes_folha_um_vigente ON public.pacotes_folha (id_competencia) WHERE situacao = 'vigente';

CREATE TABLE public.devolucoes_folha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_competencia uuid NOT NULL REFERENCES public.competencias_folha(id) ON DELETE RESTRICT,
  id_pacote uuid NOT NULL REFERENCES public.pacotes_folha(id) ON DELETE RESTRICT,
  numero integer NOT NULL CHECK (numero >= 1),
  situacao text NOT NULL DEFAULT 'rascunho' CHECK (situacao IN ('rascunho', 'enviada', 'revisao_solicitada', 'aprovada', 'substituida')),
  observacoes text CHECK (observacoes IS NULL OR char_length(observacoes) <= 1000),
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  enviada_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  enviada_em timestamptz,
  motivo_revisao text CHECK (motivo_revisao IS NULL OR char_length(motivo_revisao) <= 1000),
  revisao_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  revisao_em timestamptz,
  aprovada_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  aprovada_em timestamptz,
  CONSTRAINT devolucoes_folha_numero UNIQUE (id_competencia, numero)
);
CREATE UNIQUE INDEX devolucoes_folha_uma_aberta ON public.devolucoes_folha (id_competencia) WHERE situacao IN ('rascunho', 'enviada');

CREATE TABLE public.valores_folha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_devolucao uuid NOT NULL REFERENCES public.devolucoes_folha(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('liquido', 'encargo')),
  id_funcionario uuid REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  descricao text CHECK (descricao IS NULL OR char_length(btrim(descricao)) BETWEEN 2 AND 120),
  valor numeric(14, 2) NOT NULL CHECK (valor >= 0 AND valor <= 9999999.99),
  vencimento date,
  CONSTRAINT valores_folha_forma CHECK ((tipo = 'liquido' AND id_funcionario IS NOT NULL) OR (tipo = 'encargo' AND descricao IS NOT NULL AND vencimento IS NOT NULL AND valor > 0))
);
CREATE UNIQUE INDEX valores_folha_um_liquido ON public.valores_folha (id_devolucao, id_funcionario) WHERE tipo = 'liquido';

CREATE TABLE public.documentos_folha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_competencia uuid NOT NULL REFERENCES public.competencias_folha(id) ON DELETE RESTRICT,
  categoria text NOT NULL CHECK (categoria IN ('anexo_ocorrencia', 'holerite', 'resumo', 'liquidos', 'guia', 'outro', 'comprovante')),
  id_funcionario uuid REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  id_ocorrencia uuid REFERENCES public.ocorrencias_folha(id) ON DELETE RESTRICT,
  id_devolucao uuid REFERENCES public.devolucoes_folha(id) ON DELETE RESTRICT,
  id_valor uuid REFERENCES public.valores_folha(id) ON DELETE RESTRICT,
  caminho text NOT NULL,
  nome_arquivo text NOT NULL CHECK (char_length(nome_arquivo) BETWEEN 1 AND 200),
  tipo_mime text NOT NULL,
  tamanho bigint,
  enviado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  excluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  excluido_em timestamptz,
  CONSTRAINT documentos_folha_vinculo CHECK (
    (categoria = 'anexo_ocorrencia' AND id_ocorrencia IS NOT NULL AND id_funcionario IS NOT NULL)
    OR (categoria = 'holerite' AND id_funcionario IS NOT NULL AND id_devolucao IS NOT NULL)
    OR (categoria IN ('resumo', 'liquidos', 'guia', 'outro') AND id_devolucao IS NOT NULL)
    OR (categoria = 'comprovante' AND (id_funcionario IS NOT NULL OR id_valor IS NOT NULL)))
);
CREATE INDEX idx_documentos_folha ON public.documentos_folha (id_competencia) WHERE excluido_em IS NULL;
CREATE INDEX idx_documentos_folha_caminho ON public.documentos_folha (caminho);

CREATE TABLE public.eventos_folha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_competencia uuid NOT NULL REFERENCES public.competencias_folha(id) ON DELETE RESTRICT,
  id_funcionario uuid REFERENCES public.funcionarios(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  descricao text NOT NULL,
  versao integer,
  dados jsonb,
  id_usuario uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_eventos_folha ON public.eventos_folha (id_competencia, criado_em DESC);

-- Integração: ajustes vindos da folha aprovada e lançamentos de encargos (um por valor informado: idempotente)
ALTER TABLE public.ajustes_folha ADD COLUMN id_devolucao_folha uuid REFERENCES public.devolucoes_folha(id) ON DELETE RESTRICT;
ALTER TABLE public.lancamentos_financeiros ADD COLUMN id_valor_folha uuid REFERENCES public.valores_folha(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX lancamentos_um_por_encargo_folha ON public.lancamentos_financeiros (id_valor_folha) WHERE id_valor_folha IS NOT NULL;

-- Lançamentos de encargos: valor, vencimento, categoria, cancelamento e exclusão só pela folha (baixa/estorno seguem no Financeiro)
CREATE OR REPLACE FUNCTION public.proteger_lancamento_encargo_folha()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.id_valor_folha IS NULL OR current_setting('unnify.operacao_folha', true) = 'sim' THEN RETURN NEW; END IF;
  IF NEW.id_valor_folha IS DISTINCT FROM OLD.id_valor_folha OR NEW.valor IS DISTINCT FROM OLD.valor OR NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento
     OR NEW.id_categoria IS DISTINCT FROM OLD.id_categoria OR (NEW.status = 'cancelado' AND OLD.status <> 'cancelado') OR (NEW.excluido_em IS NOT NULL AND OLD.excluido_em IS NULL) THEN
    RAISE EXCEPTION 'Este lançamento é um encargo da folha aprovada: ele só muda pela Folha de Pagamento.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proteger_lancamento_encargo_folha BEFORE UPDATE ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.proteger_lancamento_encargo_folha();

-- ===== 4. RLS: leitura por quem pode ver a folha; nenhuma escrita direta =====
ALTER TABLE public.competencias_folha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias_folha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pendencias_folha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conferencias_folha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacotes_folha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devolucoes_folha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valores_folha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_folha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_folha ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.competencias_folha, public.ocorrencias_folha, public.pendencias_folha, public.conferencias_folha, public.pacotes_folha,
  public.devolucoes_folha, public.valores_folha, public.documentos_folha, public.eventos_folha FROM anon, authenticated;
GRANT SELECT ON public.competencias_folha, public.ocorrencias_folha, public.pendencias_folha, public.conferencias_folha, public.pacotes_folha,
  public.devolucoes_folha, public.valores_folha, public.documentos_folha, public.eventos_folha TO authenticated;
CREATE POLICY "Competências da folha: empresa autorizada" ON public.competencias_folha FOR SELECT TO authenticated USING (public.pode_ver_folha(id_empresa));
CREATE POLICY "Ocorrências da folha: empresa autorizada" ON public.ocorrencias_folha FOR SELECT TO authenticated USING (excluido_em IS NULL AND public.pode_ver_folha(id_empresa));
CREATE POLICY "Pendências da folha: empresa autorizada" ON public.pendencias_folha FOR SELECT TO authenticated USING (public.pode_ver_folha(id_empresa));
CREATE POLICY "Conferências da folha: empresa autorizada" ON public.conferencias_folha FOR SELECT TO authenticated USING (public.pode_ver_folha(id_empresa));
CREATE POLICY "Pacotes da folha: empresa autorizada" ON public.pacotes_folha FOR SELECT TO authenticated USING (public.pode_ver_folha(id_empresa));
-- Rascunho da devolução: só o contador que processa o vê antes do envio
CREATE POLICY "Devoluções da folha: empresa autorizada" ON public.devolucoes_folha FOR SELECT TO authenticated
  USING (public.pode_ver_folha(id_empresa) AND (situacao <> 'rascunho' OR public.pode_processar_folha(id_empresa)));
CREATE POLICY "Valores da folha: empresa autorizada" ON public.valores_folha FOR SELECT TO authenticated
  USING (public.pode_ver_folha(id_empresa) AND EXISTS (SELECT 1 FROM public.devolucoes_folha d WHERE d.id = id_devolucao AND (d.situacao <> 'rascunho' OR public.pode_processar_folha(d.id_empresa))));
CREATE POLICY "Documentos da folha: empresa autorizada" ON public.documentos_folha FOR SELECT TO authenticated
  USING (excluido_em IS NULL AND public.pode_ver_folha(id_empresa)
         AND (id_devolucao IS NULL OR EXISTS (SELECT 1 FROM public.devolucoes_folha d WHERE d.id = id_devolucao AND (d.situacao <> 'rascunho' OR public.pode_processar_folha(d.id_empresa)))));
CREATE POLICY "Histórico da folha: empresa autorizada" ON public.eventos_folha FOR SELECT TO authenticated USING (public.pode_ver_folha(id_empresa));

-- ===== 5. Storage privado (PDF/JPG/PNG até 10 MB; caminho <empresa>/<uuid>.<ext>) =====
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('folha', 'folha', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.caminho_folha_valido(p_nome text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(p_nome ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$', false);
$$;
CREATE OR REPLACE FUNCTION public.pode_ler_arquivo_folha(p_nome text, p_dono text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.documentos_folha d WHERE d.caminho = p_nome AND d.excluido_em IS NULL AND public.pode_ver_folha(d.id_empresa)
                   AND (d.id_devolucao IS NULL OR EXISTS (SELECT 1 FROM public.devolucoes_folha v WHERE v.id = d.id_devolucao AND (v.situacao <> 'rascunho' OR public.pode_processar_folha(v.id_empresa)))))
      OR (p_dono = auth.uid()::text AND NOT EXISTS (SELECT 1 FROM public.documentos_folha d WHERE d.caminho = p_nome));
$$;
CREATE OR REPLACE FUNCTION public.pode_descartar_arquivo_folha(p_nome text, p_dono text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_dono = auth.uid()::text AND NOT EXISTS (SELECT 1 FROM public.documentos_folha d WHERE d.caminho = p_nome);
$$;
CREATE POLICY "Folha: envio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'folha' AND public.caminho_folha_valido(name)
              AND (public.pode_gerenciar_folha(public.uuid_ou_nulo((storage.foldername(name))[1])) OR public.pode_processar_folha(public.uuid_ou_nulo((storage.foldername(name))[1]))));
CREATE POLICY "Folha: leitura" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'folha' AND public.pode_ler_arquivo_folha(name, owner_id));
CREATE POLICY "Folha: descarte de envio não registrado" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'folha' AND public.pode_descartar_arquivo_folha(name, owner_id));

-- ===== 6. Funções internas =====
CREATE OR REPLACE FUNCTION public.registrar_evento_folha(p_id_competencia uuid, p_id_funcionario uuid, p_tipo text, p_descricao text, p_versao integer, p_dados jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.eventos_folha (id_empresa, id_competencia, id_funcionario, tipo, descricao, versao, dados, id_usuario)
  SELECT c.id_empresa, c.id, p_id_funcionario, p_tipo, left(p_descricao, 500), p_versao, p_dados, auth.uid() FROM public.competencias_folha c WHERE c.id = p_id_competencia;
$$;

-- Notifica a empresa (dono/sócio) ou os contadores que processam a folha, exceto quem agiu
CREATE OR REPLACE FUNCTION public.notificar_folha(p_id_empresa uuid, p_para text, p_titulo text, p_mensagem text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid;
BEGIN
  IF p_para = 'empresa' THEN
    FOR u IN SELECT ue.id_usuario FROM public.usuarios_empresas ue WHERE ue.id_empresa = p_id_empresa AND ue.ativo AND ue.tipo_vinculacao IN ('dono', 'socio')
               AND ue.id_usuario IS DISTINCT FROM auth.uid() LOOP
      PERFORM public.notificar_usuario(u, 'folha', p_titulo, p_mensagem, '/app/folha-pagamento', true);
    END LOOP;
  ELSE
    FOR u IN SELECT v.id_contador FROM public.vinculos_contabeis v WHERE v.id_empresa = p_id_empresa AND v.status = 'ativo'
               AND v.permissoes @> ARRAY['ver_folha', 'processar_folha'] AND v.id_contador IS DISTINCT FROM auth.uid() LOOP
      PERFORM public.notificar_usuario(u, 'folha', p_titulo, p_mensagem, '/contador/empresas/' || p_id_empresa || '/folha', true);
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_competencia_folha(p_competencia date)
RETURNS date LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v date := date_trunc('month', p_competencia)::date;
BEGIN
  IF v IS NULL OR v < DATE '2000-01-01' OR v > (date_trunc('month', public.hoje_brasil()) + interval '1 month')::date THEN
    RAISE EXCEPTION 'Competência inválida (até o mês seguinte ao atual).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN v;
END;
$$;

-- Funcionários da competência: admitidos até o fim do mês e não desligados antes do início
CREATE OR REPLACE FUNCTION public.funcionarios_da_competencia(p_id_empresa uuid, p_competencia date)
RETURNS SETOF public.funcionarios LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.* FROM public.funcionarios f
   WHERE f.id_empresa = p_id_empresa AND f.data_admissao <= (p_competencia + interval '1 month - 1 day')::date
     AND (f.data_desligamento IS NULL OR f.data_desligamento >= p_competencia)
   ORDER BY f.nome, f.id;
$$;

-- Competência editável pelo RH (cria se ainda não existe). Bloqueada depois do envio, salvo correção solicitada.
CREATE OR REPLACE FUNCTION public.competencia_editavel_folha(p_id_empresa uuid, p_competencia date)
RETURNS public.competencias_folha LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_comp date; c public.competencias_folha;
BEGIN
  IF NOT public.pode_gerenciar_folha(p_id_empresa) THEN RAISE EXCEPTION 'Sem permissão para preparar a folha desta empresa.' USING ERRCODE = '42501'; END IF;
  v_comp := public.validar_competencia_folha(p_competencia);
  INSERT INTO public.competencias_folha (id_empresa, competencia, criado_por) VALUES (p_id_empresa, v_comp, auth.uid())
  ON CONFLICT (id_empresa, competencia) DO NOTHING;
  SELECT * INTO c FROM public.competencias_folha WHERE id_empresa = p_id_empresa AND competencia = v_comp FOR UPDATE;
  IF c.status NOT IN ('preparacao', 'correcao_solicitada') THEN
    RAISE EXCEPTION 'A folha desta competência já foi enviada ao contador e não pode ser alterada.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN c;
END;
$$;

CREATE OR REPLACE FUNCTION public.funcionario_na_competencia(p_id_funcionario uuid, c public.competencias_folha)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.funcionarios_da_competencia(c.id_empresa, c.competencia) f WHERE f.id = p_id_funcionario);
$$;

-- Pendência de informação de uma ocorrência (NULL = completa)
CREATE OR REPLACE FUNCTION public.pendencia_ocorrencia_folha(o public.ocorrencias_folha)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN o.situacao_justificativa = 'pendente' THEN 'Justificativa pendente'
    WHEN o.tipo = 'afastamentos' AND NOT EXISTS (SELECT 1 FROM public.documentos_folha d WHERE d.id_ocorrencia = o.id AND d.excluido_em IS NULL)
      THEN 'Documento do afastamento não anexado'
  END;
$$;

-- Todas as pendências abertas de um funcionário na competência (calculadas + registradas)
CREATE OR REPLACE FUNCTION public.pendencias_abertas_folha(p_id_competencia uuid, p_id_funcionario uuid)
RETURNS TABLE (origem text, id uuid, descricao text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'ocorrencia'::text, o.id, public.pendencia_ocorrencia_folha(o) FROM public.ocorrencias_folha o
   WHERE o.id_competencia = p_id_competencia AND o.id_funcionario = p_id_funcionario AND o.excluido_em IS NULL AND public.pendencia_ocorrencia_folha(o) IS NOT NULL
  UNION ALL
  SELECT p.origem, p.id, p.descricao FROM public.pendencias_folha p
   WHERE p.id_competencia = p_id_competencia AND p.id_funcionario = p_id_funcionario AND p.resolvida_em IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.situacao_funcionario_folha(p_id_competencia uuid, p_id_funcionario uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.pendencias_abertas_folha(p_id_competencia, p_id_funcionario)) THEN 'pendente'
    WHEN EXISTS (SELECT 1 FROM public.conferencias_folha k WHERE k.id_competencia = p_id_competencia AND k.id_funcionario = p_id_funcionario AND k.invalidada_em IS NULL) THEN 'apto'
    ELSE 'a_conferir' END;
$$;

CREATE OR REPLACE FUNCTION public.invalidar_conferencia_folha(p_id_competencia uuid, p_id_funcionario uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conferencias_folha SET invalidada_em = now(), motivo_invalidacao = left(p_motivo, 200)
   WHERE id_competencia = p_id_competencia AND id_funcionario = p_id_funcionario AND invalidada_em IS NULL;
  IF FOUND THEN
    PERFORM public.registrar_evento_folha(p_id_competencia, p_id_funcionario, 'conferencia_invalidada', 'Conferência desfeita: ' || p_motivo, NULL, NULL);
  END IF;
END;
$$;

-- Validação por tipo de ocorrência (campos obrigatórios); falta de justificativa/documento vira pendência, não erro
CREATE OR REPLACE FUNCTION public.validar_ocorrencia_folha(p_tipo text, p_quantidade numeric, p_valor numeric, p_inicio date, p_fim date,
  p_sit_justificativa text, p_justificativa text, p_competencia date)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_just text := nullif(btrim(coalesce(p_justificativa, '')), '');
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('horas_extras', 'faltas', 'atrasos', 'comissoes', 'bonificacoes', 'adiantamentos', 'ferias', 'afastamentos',
                                      'alteracao_salarial', 'admissao', 'desligamento', 'outras') THEN
    RAISE EXCEPTION 'Tipo de ocorrência inválido.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_quantidade IS NOT NULL AND (p_quantidade <= 0 OR p_quantidade > 9999 OR p_quantidade <> round(p_quantidade, 2)) THEN
    RAISE EXCEPTION 'Quantidade inválida.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_valor IS NOT NULL AND (p_valor <= 0 OR p_valor > 9999999.99 OR p_valor <> round(p_valor, 2)) THEN
    RAISE EXCEPTION 'Valor inválido.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_fim IS NOT NULL AND (p_inicio IS NULL OR p_fim < p_inicio) THEN RAISE EXCEPTION 'A data final não pode ser anterior à inicial.' USING ERRCODE = 'check_violation'; END IF;
  IF (p_inicio IS NOT NULL AND (p_inicio < p_competencia - 366 OR p_inicio > p_competencia + 400))
     OR (p_fim IS NOT NULL AND p_fim > p_competencia + 400) THEN
    RAISE EXCEPTION 'Datas muito distantes da competência.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_sit_justificativa IS NOT NULL AND p_sit_justificativa NOT IN ('justificada', 'nao_justificada', 'pendente') THEN
    RAISE EXCEPTION 'Situação da justificativa inválida.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tipo IN ('horas_extras', 'faltas', 'atrasos') AND p_quantidade IS NULL THEN
    RAISE EXCEPTION 'Informe a quantidade (%).', CASE p_tipo WHEN 'faltas' THEN 'dias' ELSE 'horas' END USING ERRCODE = 'check_violation';
  END IF;
  IF p_tipo = 'faltas' AND p_quantidade > 31 THEN RAISE EXCEPTION 'Faltas: no máximo 31 dias.' USING ERRCODE = 'check_violation'; END IF;
  IF p_tipo IN ('horas_extras', 'atrasos') AND p_quantidade > 400 THEN RAISE EXCEPTION 'Quantidade de horas acima do limite.' USING ERRCODE = 'check_violation'; END IF;
  IF p_tipo IN ('faltas', 'atrasos') AND (p_inicio IS NULL OR p_sit_justificativa IS NULL) THEN
    RAISE EXCEPTION 'Informe a data e se há justificativa.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tipo IN ('comissoes', 'bonificacoes', 'adiantamentos', 'alteracao_salarial') AND p_valor IS NULL THEN
    RAISE EXCEPTION 'Informe o valor.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tipo IN ('adiantamentos', 'ferias', 'afastamentos', 'alteracao_salarial', 'admissao', 'desligamento') AND p_inicio IS NULL THEN
    RAISE EXCEPTION 'Informe a data.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tipo = 'ferias' AND (p_fim IS NULL OR p_fim - p_inicio > 60) THEN RAISE EXCEPTION 'Férias: informe início e fim (até 60 dias).' USING ERRCODE = 'check_violation'; END IF;
  IF p_tipo IN ('afastamentos', 'desligamento', 'outras') AND v_just IS NULL THEN
    RAISE EXCEPTION 'Descreva o motivo.' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- Snapshot consolidado da competência (o que o contador recebe; imutável depois do envio)
CREATE OR REPLACE FUNCTION public.snapshot_folha(c public.competencias_folha)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'competencia', c.competencia,
    'empresa', (SELECT coalesce(nullif(e.nome_comercial, ''), e.razao_social) FROM public.empresas e WHERE e.id = c.id_empresa),
    'funcionarios', coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'nome', f.nome, 'matricula', f.matricula, 'cargo', f.cargo, 'vinculo', f.vinculo, 'data_admissao', f.data_admissao,
      'salario_base', public.salario_vigente(f.id, c.competencia),
      'sem_ocorrencias', k.sem_ocorrencias, 'conferido_em', k.confirmado_em,
      'conferido_por', (SELECT p.nome_completo FROM public.perfis p WHERE p.id_usuario = k.confirmado_por),
      'ocorrencias', (SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', o.id, 'tipo', o.tipo, 'quantidade', o.quantidade, 'valor', o.valor,
                        'data_inicio', o.data_inicio, 'data_fim', o.data_fim, 'situacao_justificativa', o.situacao_justificativa,
                        'justificativa', o.justificativa, 'observacoes', o.observacoes,
                        'documentos', (SELECT jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome_arquivo)) FROM public.documentos_folha d WHERE d.id_ocorrencia = o.id AND d.excluido_em IS NULL)))
                        ORDER BY o.criado_em), '[]'::jsonb)
                      FROM public.ocorrencias_folha o WHERE o.id_competencia = c.id AND o.id_funcionario = f.id AND o.excluido_em IS NULL)
    ) ORDER BY f.nome, f.id), '[]'::jsonb))
  FROM public.funcionarios_da_competencia(c.id_empresa, c.competencia) f
  LEFT JOIN public.conferencias_folha k ON k.id_competencia = c.id AND k.id_funcionario = f.id AND k.invalidada_em IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.categoria_encargos_folha(p_id_empresa uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.categorias_financeiras WHERE id_empresa = p_id_empresa AND tipo = 'despesa' AND lower(nome) = 'encargos da folha';
  IF v_id IS NOT NULL THEN
    UPDATE public.categorias_financeiras SET ativa = true WHERE id = v_id AND NOT ativa;
    RETURN v_id;
  END IF;
  INSERT INTO public.categorias_financeiras (id_empresa, tipo, nome, cor, icone, ativa, criado_por)
  VALUES (p_id_empresa, 'despesa', 'Encargos da folha', '#6366f1', 'landmark', true, auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Integração com o Financeiro na aprovação (uma vez por competência: o status impede repetir; índices únicos impedem duplicar)
--   Salários: a previsão da 038 (uma por funcionário) passa a valer o líquido informado, por um ajuste identificado.
--   Encargos: um lançamento a pagar por encargo informado (categoria "Encargos da folha").
CREATE OR REPLACE FUNCTION public.integrar_folha_financeiro(p_id_devolucao uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.devolucoes_folha;
  c public.competencias_folha;
  r record;
  v_folha public.folhas_competencia;
  t record;
  v_dif numeric;
  v_lanc uuid;
BEGIN
  SELECT * INTO d FROM public.devolucoes_folha WHERE id = p_id_devolucao;
  SELECT * INTO c FROM public.competencias_folha WHERE id = d.id_competencia;
  FOR r IN SELECT v.* FROM public.valores_folha v WHERE v.id_devolucao = d.id AND v.tipo = 'liquido' LOOP
    PERFORM public.gerar_folha_funcionario(r.id_funcionario, c.competencia);
    SELECT * INTO v_folha FROM public.folhas_competencia WHERE id_funcionario = r.id_funcionario AND competencia = c.competencia FOR UPDATE;
    IF v_folha.id IS NULL OR v_folha.cancelada_em IS NOT NULL THEN
      PERFORM public.registrar_evento_folha(c.id, r.id_funcionario, 'financeiro_divergencia', 'Salário não integrado: funcionário sem previsão ativa nesta competência.', NULL, NULL);
      CONTINUE;
    END IF;
    SELECT * INTO t FROM public.totais_folha(v_folha.id);
    v_dif := r.valor - t.total;
    IF r.valor < t.pago THEN
      PERFORM public.registrar_evento_folha(c.id, r.id_funcionario, 'financeiro_divergencia',
        'Salário não ajustado: o líquido aprovado é menor que o já pago no Financeiro.', NULL, jsonb_build_object('liquido', r.valor, 'pago', t.pago));
      CONTINUE;
    END IF;
    IF v_dif <> 0 THEN
      INSERT INTO public.ajustes_folha (id_empresa, id_folha, tipo, descricao, valor, criado_por, id_devolucao_folha)
      VALUES (c.id_empresa, v_folha.id, CASE WHEN v_dif > 0 THEN 'adicional' ELSE 'desconto' END, 'Ajuste conforme folha aprovada', abs(v_dif), auth.uid(), d.id);
      PERFORM public.recalcular_folha(v_folha.id);
    END IF;
  END LOOP;
  PERFORM set_config('unnify.operacao_folha', 'sim', true);
  FOR r IN SELECT v.* FROM public.valores_folha v WHERE v.id_devolucao = d.id AND v.tipo = 'encargo' ORDER BY v.vencimento, v.descricao LOOP
    INSERT INTO public.lancamentos_financeiros (id_empresa, tipo, descricao, valor, id_categoria, data_competencia, data_vencimento, status,
                                                contraparte, criado_por, atualizado_por, natureza_financeira, id_valor_folha)
    VALUES (c.id_empresa, 'despesa', left(r.descricao || ' — folha ' || to_char(c.competencia, 'MM/YYYY'), 200), r.valor, public.categoria_encargos_folha(c.id_empresa),
            c.competencia, r.vencimento, 'pendente', NULL, auth.uid(), auth.uid(), 'operacional', r.id)
    ON CONFLICT (id_valor_folha) WHERE id_valor_folha IS NOT NULL DO NOTHING;
  END LOOP;
  PERFORM set_config('unnify.operacao_folha', '', true);
END;
$$;

-- ===== 7. Funções públicas: preparação (RH = dono/sócio) =====
CREATE OR REPLACE FUNCTION public.salvar_ocorrencia_folha(p_id uuid, p_id_empresa uuid, p_competencia date, p_id_funcionario uuid, p_tipo text,
  p_quantidade numeric, p_valor numeric, p_data_inicio date, p_data_fim date, p_situacao_justificativa text, p_justificativa text, p_observacoes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.competencias_folha;
  o public.ocorrencias_folha;
  v_id uuid;
  v_func uuid := p_id_funcionario;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = '42501'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO o FROM public.ocorrencias_folha WHERE id = p_id AND excluido_em IS NULL;
    IF o.id IS NULL OR o.id_empresa IS DISTINCT FROM p_id_empresa OR NOT public.pode_gerenciar_folha(o.id_empresa) THEN
      RAISE EXCEPTION 'Ocorrência não encontrada.' USING ERRCODE = '42501';
    END IF;
    SELECT competencia INTO p_competencia FROM public.competencias_folha WHERE id = o.id_competencia;
    v_func := o.id_funcionario; -- funcionário e competência nunca mudam
  END IF;
  c := public.competencia_editavel_folha(p_id_empresa, p_competencia);
  IF v_func IS NULL OR NOT public.funcionario_na_competencia(v_func, c) THEN RAISE EXCEPTION 'Funcionário não encontrado nesta competência.' USING ERRCODE = '42501'; END IF;
  PERFORM public.validar_ocorrencia_folha(p_tipo, p_quantidade, p_valor, p_data_inicio, p_data_fim, p_situacao_justificativa, p_justificativa, c.competencia);
  IF char_length(coalesce(p_justificativa, '')) > 1000 OR char_length(coalesce(p_observacoes, '')) > 1000 THEN
    RAISE EXCEPTION 'Texto muito longo (máximo de 1000 caracteres).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.ocorrencias_folha (id_empresa, id_competencia, id_funcionario, tipo, quantidade, valor, data_inicio, data_fim, situacao_justificativa,
                                         justificativa, observacoes, criado_por, atualizado_por)
    VALUES (c.id_empresa, c.id, v_func, p_tipo, p_quantidade, p_valor, p_data_inicio, p_data_fim,
            CASE WHEN p_tipo IN ('faltas', 'atrasos') THEN p_situacao_justificativa END,
            nullif(btrim(coalesce(p_justificativa, '')), ''), nullif(btrim(coalesce(p_observacoes, '')), ''), auth.uid(), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ocorrencias_folha
       SET tipo = p_tipo, quantidade = p_quantidade, valor = p_valor, data_inicio = p_data_inicio, data_fim = p_data_fim,
           situacao_justificativa = CASE WHEN p_tipo IN ('faltas', 'atrasos') THEN p_situacao_justificativa END,
           justificativa = nullif(btrim(coalesce(p_justificativa, '')), ''), observacoes = nullif(btrim(coalesce(p_observacoes, '')), ''),
           atualizado_por = auth.uid(), atualizado_em = now()
     WHERE id = p_id RETURNING id INTO v_id;
  END IF;
  UPDATE public.competencias_folha SET atualizado_em = now() WHERE id = c.id;
  PERFORM public.invalidar_conferencia_folha(c.id, v_func, CASE WHEN p_id IS NULL THEN 'nova ocorrência registrada' ELSE 'ocorrência alterada' END);
  PERFORM public.registrar_evento_folha(c.id, v_func, CASE WHEN p_id IS NULL THEN 'ocorrencia_registrada' ELSE 'ocorrencia_alterada' END,
    CASE WHEN p_id IS NULL THEN 'Ocorrência registrada: ' ELSE 'Ocorrência alterada: ' END || replace(p_tipo, '_', ' '), NULL,
    jsonb_strip_nulls(jsonb_build_object('id', v_id, 'tipo', p_tipo, 'quantidade', p_quantidade, 'valor', p_valor, 'antes',
      CASE WHEN p_id IS NOT NULL THEN jsonb_strip_nulls(jsonb_build_object('tipo', o.tipo, 'quantidade', o.quantidade, 'valor', o.valor, 'data_inicio', o.data_inicio)) END)));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_ocorrencia_folha(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.ocorrencias_folha; c public.competencias_folha;
BEGIN
  SELECT * INTO o FROM public.ocorrencias_folha WHERE id = p_id AND excluido_em IS NULL;
  IF o.id IS NULL OR NOT public.pode_gerenciar_folha(o.id_empresa) THEN RAISE EXCEPTION 'Ocorrência não encontrada.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.competencias_folha WHERE id = o.id_competencia;
  c := public.competencia_editavel_folha(o.id_empresa, c.competencia);
  UPDATE public.ocorrencias_folha SET excluido_em = now(), excluido_por = auth.uid() WHERE id = p_id;
  PERFORM public.invalidar_conferencia_folha(c.id, o.id_funcionario, 'ocorrência excluída');
  PERFORM public.registrar_evento_folha(c.id, o.id_funcionario, 'ocorrencia_excluida', 'Ocorrência excluída: ' || replace(o.tipo, '_', ' '), NULL, jsonb_build_object('id', o.id));
END;
$$;

-- Confirmação explícita do RH. Sem ocorrências: só com o botão "Confirmar sem ocorrências" (nunca presumido).
CREATE OR REPLACE FUNCTION public.confirmar_conferencia_folha(p_id_empresa uuid, p_competencia date, p_id_funcionario uuid, p_sem_ocorrencias boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.competencias_folha; v_qtd integer; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = '42501'; END IF;
  c := public.competencia_editavel_folha(p_id_empresa, p_competencia);
  IF p_id_funcionario IS NULL OR NOT public.funcionario_na_competencia(p_id_funcionario, c) THEN RAISE EXCEPTION 'Funcionário não encontrado nesta competência.' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('conferencia:' || c.id::text || p_id_funcionario::text));
  SELECT count(*) INTO v_qtd FROM public.ocorrencias_folha WHERE id_competencia = c.id AND id_funcionario = p_id_funcionario AND excluido_em IS NULL;
  IF p_sem_ocorrencias IS NULL THEN RAISE EXCEPTION 'Informe o tipo de confirmação.' USING ERRCODE = 'check_violation'; END IF;
  IF p_sem_ocorrencias AND v_qtd > 0 THEN RAISE EXCEPTION 'Este funcionário tem ocorrências registradas: confirme a conferência delas.' USING ERRCODE = 'check_violation'; END IF;
  IF NOT p_sem_ocorrencias AND v_qtd = 0 THEN RAISE EXCEPTION 'Nenhuma ocorrência registrada: use "Confirmar sem ocorrências".' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.pendencias_abertas_folha(c.id, p_id_funcionario)) THEN
    RAISE EXCEPTION 'Resolva as pendências deste funcionário antes de confirmar.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.conferencias_folha WHERE id_competencia = c.id AND id_funcionario = p_id_funcionario AND invalidada_em IS NULL) THEN
    RAISE EXCEPTION 'A conferência deste funcionário já está confirmada.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.conferencias_folha (id_empresa, id_competencia, id_funcionario, sem_ocorrencias, confirmado_por)
  VALUES (c.id_empresa, c.id, p_id_funcionario, p_sem_ocorrencias, auth.uid()) RETURNING id INTO v_id;
  PERFORM public.registrar_evento_folha(c.id, p_id_funcionario, 'conferencia_confirmada',
    CASE WHEN p_sem_ocorrencias THEN 'Confirmado sem ocorrências no mês' ELSE 'Conferência das ocorrências confirmada' END, NULL, NULL);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.desfazer_conferencia_folha(p_id_empresa uuid, p_competencia date, p_id_funcionario uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.competencias_folha;
BEGIN
  c := public.competencia_editavel_folha(p_id_empresa, p_competencia);
  IF NOT public.funcionario_na_competencia(p_id_funcionario, c) THEN RAISE EXCEPTION 'Funcionário não encontrado nesta competência.' USING ERRCODE = '42501'; END IF;
  PERFORM public.invalidar_conferencia_folha(c.id, p_id_funcionario, 'desfeita pelo RH');
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_pendencia_folha(p_id_empresa uuid, p_competencia date, p_id_funcionario uuid, p_descricao text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.competencias_folha; v_id uuid;
BEGIN
  c := public.competencia_editavel_folha(p_id_empresa, p_competencia);
  IF p_id_funcionario IS NULL OR NOT public.funcionario_na_competencia(p_id_funcionario, c) THEN RAISE EXCEPTION 'Funcionário não encontrado nesta competência.' USING ERRCODE = '42501'; END IF;
  IF char_length(btrim(coalesce(p_descricao, ''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Descreva a pendência (3 a 500 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.pendencias_folha (id_empresa, id_competencia, id_funcionario, origem, descricao, criado_por)
  VALUES (c.id_empresa, c.id, p_id_funcionario, 'rh', btrim(p_descricao), auth.uid()) RETURNING id INTO v_id;
  PERFORM public.invalidar_conferencia_folha(c.id, p_id_funcionario, 'pendência registrada');
  PERFORM public.registrar_evento_folha(c.id, p_id_funcionario, 'pendencia_registrada', 'Pendência registrada: ' || btrim(p_descricao), NULL, NULL);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_pendencia_folha(p_id uuid, p_resolucao text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.pendencias_folha; c public.competencias_folha;
BEGIN
  SELECT * INTO p FROM public.pendencias_folha WHERE id = p_id AND resolvida_em IS NULL;
  IF p.id IS NULL OR NOT public.pode_gerenciar_folha(p.id_empresa) THEN RAISE EXCEPTION 'Pendência não encontrada.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.competencias_folha WHERE id = p.id_competencia;
  c := public.competencia_editavel_folha(p.id_empresa, c.competencia);
  IF char_length(btrim(coalesce(p_resolucao, ''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Descreva como foi resolvida (3 a 500 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.pendencias_folha SET resolvida_em = now(), resolvida_por = auth.uid(), resolucao = btrim(p_resolucao) WHERE id = p_id;
  PERFORM public.registrar_evento_folha(c.id, p.id_funcionario, 'pendencia_resolvida', 'Pendência resolvida: ' || btrim(p_resolucao), NULL, jsonb_build_object('pendencia', p.descricao));
END;
$$;

-- Anexo de ocorrência (RH) — o arquivo já precisa estar no bucket, enviado pelo próprio usuário
CREATE OR REPLACE FUNCTION public.validar_arquivo_folha(p_id_empresa uuid, p_caminho text, OUT tipo text, OUT tamanho bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  IF NOT public.caminho_folha_valido(p_caminho) OR split_part(p_caminho, '/', 1) <> p_id_empresa::text THEN RAISE EXCEPTION 'Arquivo inválido.' USING ERRCODE = 'check_violation'; END IF;
  SELECT o.metadata ->> 'mimetype' AS tipo, (o.metadata ->> 'size')::bigint AS tamanho, o.owner_id INTO v FROM storage.objects o WHERE o.bucket_id = 'folha' AND o.name = p_caminho;
  IF v.tipo IS NULL OR v.tipo NOT IN ('application/pdf', 'image/jpeg', 'image/png') OR v.owner_id IS DISTINCT FROM auth.uid()::text THEN
    RAISE EXCEPTION 'Arquivo não encontrado.' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(v.tamanho, 0) > 10485760 THEN RAISE EXCEPTION 'Arquivo acima de 10 MB.' USING ERRCODE = 'check_violation'; END IF;
  IF (v.tipo = 'application/pdf') <> (p_caminho LIKE '%.pdf') THEN RAISE EXCEPTION 'Arquivo inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.documentos_folha d WHERE d.caminho = p_caminho) THEN RAISE EXCEPTION 'Arquivo já registrado.' USING ERRCODE = 'check_violation'; END IF;
  tipo := v.tipo; tamanho := v.tamanho;
END;
$$;

CREATE OR REPLACE FUNCTION public.anexar_documento_ocorrencia_folha(p_id_ocorrencia uuid, p_caminho text, p_nome_arquivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.ocorrencias_folha; c public.competencias_folha; v record; v_id uuid;
BEGIN
  SELECT * INTO o FROM public.ocorrencias_folha WHERE id = p_id_ocorrencia AND excluido_em IS NULL;
  IF o.id IS NULL OR NOT public.pode_gerenciar_folha(o.id_empresa) THEN RAISE EXCEPTION 'Ocorrência não encontrada.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.competencias_folha WHERE id = o.id_competencia;
  c := public.competencia_editavel_folha(o.id_empresa, c.competencia);
  SELECT * INTO v FROM public.validar_arquivo_folha(o.id_empresa, p_caminho);
  INSERT INTO public.documentos_folha (id_empresa, id_competencia, categoria, id_funcionario, id_ocorrencia, caminho, nome_arquivo, tipo_mime, tamanho, enviado_por)
  VALUES (o.id_empresa, c.id, 'anexo_ocorrencia', o.id_funcionario, o.id, p_caminho, left(coalesce(nullif(btrim(p_nome_arquivo), ''), 'documento'), 200), v.tipo, v.tamanho, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.registrar_evento_folha(c.id, o.id_funcionario, 'documento_anexado', 'Documento anexado à ocorrência: ' || left(coalesce(p_nome_arquivo, ''), 120), NULL, NULL);
  RETURN v_id;
END;
$$;

-- Excluir documento: anexo (RH, competência editável), arquivo da devolução (contador, devolução em rascunho), comprovante (RH)
CREATE OR REPLACE FUNCTION public.excluir_documento_folha(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.documentos_folha; c public.competencias_folha; v_dev public.devolucoes_folha;
BEGIN
  SELECT * INTO d FROM public.documentos_folha WHERE id = p_id AND excluido_em IS NULL;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Documento não encontrado.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.competencias_folha WHERE id = d.id_competencia;
  IF d.categoria = 'anexo_ocorrencia' THEN
    IF NOT public.pode_gerenciar_folha(d.id_empresa) THEN RAISE EXCEPTION 'Documento não encontrado.' USING ERRCODE = '42501'; END IF;
    c := public.competencia_editavel_folha(d.id_empresa, c.competencia);
    PERFORM public.invalidar_conferencia_folha(c.id, d.id_funcionario, 'documento da ocorrência removido');
  ELSIF d.categoria = 'comprovante' THEN
    IF NOT public.pode_gerenciar_folha(d.id_empresa) THEN RAISE EXCEPTION 'Documento não encontrado.' USING ERRCODE = '42501'; END IF;
  ELSE
    SELECT * INTO v_dev FROM public.devolucoes_folha WHERE id = d.id_devolucao;
    IF NOT public.pode_processar_folha(d.id_empresa) THEN RAISE EXCEPTION 'Documento não encontrado.' USING ERRCODE = '42501'; END IF;
    IF v_dev.situacao <> 'rascunho' THEN RAISE EXCEPTION 'A devolução já foi enviada: os documentos dela não mudam.' USING ERRCODE = 'check_violation'; END IF;
  END IF;
  UPDATE public.documentos_folha SET excluido_em = now(), excluido_por = auth.uid() WHERE id = p_id;
  PERFORM public.registrar_evento_folha(c.id, d.id_funcionario, 'documento_removido', 'Documento removido: ' || d.nome_arquivo, NULL, jsonb_build_object('categoria', d.categoria));
END;
$$;

-- Envio consolidado: todos aptos, contador habilitado, confirmação e responsável. Gera nova versão com snapshot.
CREATE OR REPLACE FUNCTION public.enviar_folha_contador(p_id_empresa uuid, p_competencia date, p_responsavel text, p_observacoes text, p_confirmo boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.competencias_folha;
  v_total integer; v_aptos integer;
  v_snap jsonb;
  v_id uuid;
  v_versao integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = '42501'; END IF;
  c := public.competencia_editavel_folha(p_id_empresa, p_competencia);
  IF p_confirmo IS NOT TRUE THEN RAISE EXCEPTION 'Confirme o envio.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_responsavel, ''))) NOT BETWEEN 3 AND 120 THEN RAISE EXCEPTION 'Informe o responsável pelo envio.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(coalesce(p_observacoes, '')) > 1000 THEN RAISE EXCEPTION 'Observações muito longas (máximo de 1000 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  SELECT count(*), count(*) FILTER (WHERE public.situacao_funcionario_folha(c.id, f.id) = 'apto') INTO v_total, v_aptos
    FROM public.funcionarios_da_competencia(c.id_empresa, c.competencia) f;
  IF v_total = 0 THEN RAISE EXCEPTION 'Não há funcionários nesta competência.' USING ERRCODE = 'check_violation'; END IF;
  IF v_aptos < v_total THEN RAISE EXCEPTION 'Ainda há % funcionário(s) a conferir ou com pendência.', v_total - v_aptos USING ERRCODE = 'check_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vinculos_contabeis v WHERE v.id_empresa = c.id_empresa AND v.status = 'ativo' AND v.permissoes @> ARRAY['ver_folha', 'processar_folha']) THEN
    RAISE EXCEPTION 'Nenhum contador com vínculo ativo e permissão para processar a folha.' USING ERRCODE = 'check_violation';
  END IF;
  v_snap := public.snapshot_folha(c);
  v_versao := c.versao_atual + 1;
  UPDATE public.pacotes_folha SET situacao = 'substituido' WHERE id_competencia = c.id AND situacao = 'vigente';
  UPDATE public.devolucoes_folha SET situacao = 'substituida' WHERE id_competencia = c.id AND situacao IN ('rascunho', 'enviada', 'revisao_solicitada');
  INSERT INTO public.pacotes_folha (id_empresa, id_competencia, versao, snapshot, responsavel, observacoes, enviado_por)
  VALUES (c.id_empresa, c.id, v_versao, v_snap, btrim(p_responsavel), nullif(btrim(coalesce(p_observacoes, '')), ''), auth.uid()) RETURNING id INTO v_id;
  UPDATE public.competencias_folha SET status = 'enviada', versao_atual = v_versao, atualizado_em = now() WHERE id = c.id;
  PERFORM public.registrar_evento_folha(c.id, NULL, 'folha_enviada', 'Folha enviada ao contador (versão ' || v_versao || ') por ' || btrim(p_responsavel), v_versao,
    jsonb_build_object('funcionarios', v_total));
  PERFORM public.notificar_folha(c.id_empresa, 'contador', 'Folha de pagamento recebida',
    'A folha de ' || to_char(c.competencia, 'MM/YYYY') || ' foi enviada (versão ' || v_versao || ', ' || v_total || ' funcionário(s)).');
  RETURN v_id;
END;
$$;

-- ===== 8. Funções públicas: contador =====
CREATE OR REPLACE FUNCTION public.competencia_do_contador_folha(p_id_competencia uuid, p_status text[])
RETURNS public.competencias_folha LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.competencias_folha;
BEGIN
  SELECT * INTO c FROM public.competencias_folha WHERE id = p_id_competencia FOR UPDATE;
  IF c.id IS NULL OR NOT public.pode_processar_folha(c.id_empresa) THEN RAISE EXCEPTION 'Folha não encontrada.' USING ERRCODE = '42501'; END IF;
  IF NOT (c.status = ANY (p_status)) THEN RAISE EXCEPTION 'Esta ação não está disponível na etapa atual da folha.' USING ERRCODE = 'check_violation'; END IF;
  RETURN c;
END;
$$;

CREATE OR REPLACE FUNCTION public.iniciar_processamento_folha(p_id_competencia uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.competencias_folha;
BEGIN
  c := public.competencia_do_contador_folha(p_id_competencia, ARRAY['enviada', 'revisao_solicitada']);
  UPDATE public.competencias_folha SET status = 'em_processamento', atualizado_em = now() WHERE id = c.id;
  PERFORM public.registrar_evento_folha(c.id, NULL, 'processamento_iniciado', 'Contador iniciou o processamento', c.versao_atual, NULL);
  PERFORM public.notificar_folha(c.id_empresa, 'empresa', 'Folha em processamento', 'O contador iniciou o processamento da folha de ' || to_char(c.competencia, 'MM/YYYY') || '.');
END;
$$;

-- Correção: volta ao RH com pendências por funcionário (p_itens = [{id_funcionario, descricao}]); o reenvio vira nova versão
CREATE OR REPLACE FUNCTION public.solicitar_correcao_folha(p_id_competencia uuid, p_mensagem text, p_itens jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.competencias_folha; v_snap jsonb; i jsonb; v_func uuid; v_desc text;
BEGIN
  c := public.competencia_do_contador_folha(p_id_competencia, ARRAY['enviada', 'em_processamento']);
  IF char_length(btrim(coalesce(p_mensagem, ''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Explique a correção necessária (3 a 1000 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  IF p_itens IS NOT NULL AND (jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) > 200) THEN RAISE EXCEPTION 'Itens inválidos.' USING ERRCODE = 'check_violation'; END IF;
  SELECT snapshot INTO v_snap FROM public.pacotes_folha WHERE id_competencia = c.id AND situacao = 'vigente';
  FOR i IN SELECT * FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) LOOP
    v_func := public.uuid_ou_nulo(i ->> 'id_funcionario');
    v_desc := btrim(coalesce(i ->> 'descricao', ''));
    IF v_func IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_snap -> 'funcionarios') f WHERE f ->> 'id' = v_func::text) THEN
      RAISE EXCEPTION 'Funcionário fora da folha enviada.' USING ERRCODE = 'check_violation';
    END IF;
    IF char_length(v_desc) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Descreva a correção de cada funcionário (3 a 500 caracteres).' USING ERRCODE = 'check_violation'; END IF;
    INSERT INTO public.pendencias_folha (id_empresa, id_competencia, id_funcionario, origem, descricao, versao, criado_por)
    VALUES (c.id_empresa, c.id, v_func, 'contador', v_desc, c.versao_atual, auth.uid());
    PERFORM public.invalidar_conferencia_folha(c.id, v_func, 'correção solicitada pelo contador');
  END LOOP;
  UPDATE public.competencias_folha SET status = 'correcao_solicitada', atualizado_em = now() WHERE id = c.id;
  PERFORM public.registrar_evento_folha(c.id, NULL, 'correcao_solicitada', 'Contador solicitou correção: ' || btrim(p_mensagem), c.versao_atual,
    jsonb_build_object('itens', coalesce(jsonb_array_length(p_itens), 0)));
  PERFORM public.notificar_folha(c.id_empresa, 'empresa', 'Correção solicitada na folha', left(btrim(p_mensagem), 300));
END;
$$;

-- Devolução em rascunho do contador (criada na primeira ação; revisão = nova devolução com os arquivos/valores da anterior)
CREATE OR REPLACE FUNCTION public.devolucao_rascunho_folha(c public.competencias_folha)
RETURNS public.devolucoes_folha LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.devolucoes_folha; v_ant public.devolucoes_folha; v_pacote uuid; v_num integer;
BEGIN
  SELECT * INTO d FROM public.devolucoes_folha WHERE id_competencia = c.id AND situacao = 'rascunho';
  IF d.id IS NOT NULL THEN RETURN d; END IF;
  SELECT id INTO v_pacote FROM public.pacotes_folha WHERE id_competencia = c.id AND situacao = 'vigente';
  SELECT coalesce(max(numero), 0) + 1 INTO v_num FROM public.devolucoes_folha WHERE id_competencia = c.id;
  INSERT INTO public.devolucoes_folha (id_empresa, id_competencia, id_pacote, numero, criado_por)
  VALUES (c.id_empresa, c.id, v_pacote, v_num, auth.uid()) RETURNING * INTO d;
  -- Revisão da mesma versão: parte do que já foi devolvido (o contador troca só o necessário)
  SELECT * INTO v_ant FROM public.devolucoes_folha WHERE id_pacote = v_pacote AND situacao = 'revisao_solicitada' ORDER BY numero DESC LIMIT 1;
  IF v_ant.id IS NOT NULL THEN
    INSERT INTO public.valores_folha (id_empresa, id_devolucao, tipo, id_funcionario, descricao, valor, vencimento)
    SELECT id_empresa, d.id, tipo, id_funcionario, descricao, valor, vencimento FROM public.valores_folha WHERE id_devolucao = v_ant.id;
    INSERT INTO public.documentos_folha (id_empresa, id_competencia, categoria, id_funcionario, id_devolucao, caminho, nome_arquivo, tipo_mime, tamanho, enviado_por, enviado_em)
    SELECT id_empresa, id_competencia, categoria, id_funcionario, d.id, caminho, nome_arquivo, tipo_mime, tamanho, enviado_por, enviado_em
      FROM public.documentos_folha WHERE id_devolucao = v_ant.id AND excluido_em IS NULL;
    UPDATE public.devolucoes_folha SET situacao = 'substituida' WHERE id = v_ant.id;
  END IF;
  RETURN d;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_documento_devolucao_folha(p_id_competencia uuid, p_categoria text, p_id_funcionario uuid, p_caminho text, p_nome_arquivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.competencias_folha; d public.devolucoes_folha; v record; v_snap jsonb; v_id uuid;
BEGIN
  c := public.competencia_do_contador_folha(p_id_competencia, ARRAY['em_processamento']);
  IF coalesce(p_categoria, '') NOT IN ('holerite', 'resumo', 'liquidos', 'guia', 'outro') THEN RAISE EXCEPTION 'Tipo de documento inválido.' USING ERRCODE = 'check_violation'; END IF;
  SELECT snapshot INTO v_snap FROM public.pacotes_folha WHERE id_competencia = c.id AND situacao = 'vigente';
  IF p_categoria = 'holerite' THEN
    IF p_id_funcionario IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_snap -> 'funcionarios') f WHERE f ->> 'id' = p_id_funcionario::text) THEN
      RAISE EXCEPTION 'Holerite: escolha um funcionário da folha enviada.' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    p_id_funcionario := NULL;
  END IF;
  d := public.devolucao_rascunho_folha(c);
  SELECT * INTO v FROM public.validar_arquivo_folha(c.id_empresa, p_caminho);
  INSERT INTO public.documentos_folha (id_empresa, id_competencia, categoria, id_funcionario, id_devolucao, caminho, nome_arquivo, tipo_mime, tamanho, enviado_por)
  VALUES (c.id_empresa, c.id, p_categoria, p_id_funcionario, d.id, p_caminho, left(coalesce(nullif(btrim(p_nome_arquivo), ''), 'documento'), 200), v.tipo, v.tamanho, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Valores devolvidos: líquido por funcionário [{id_funcionario, valor}] e encargos [{descricao, valor, vencimento}] (substitui o rascunho)
CREATE OR REPLACE FUNCTION public.informar_valores_folha(p_id_competencia uuid, p_liquidos jsonb, p_encargos jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.competencias_folha; d public.devolucoes_folha; v_snap jsonb; i jsonb; v_func uuid; v_valor numeric; v_venc date; v_desc text;
BEGIN
  c := public.competencia_do_contador_folha(p_id_competencia, ARRAY['em_processamento']);
  IF jsonb_typeof(coalesce(p_liquidos, '[]')) <> 'array' OR jsonb_typeof(coalesce(p_encargos, '[]')) <> 'array'
     OR jsonb_array_length(coalesce(p_liquidos, '[]')) > 500 OR jsonb_array_length(coalesce(p_encargos, '[]')) > 50 THEN
    RAISE EXCEPTION 'Valores inválidos.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT snapshot INTO v_snap FROM public.pacotes_folha WHERE id_competencia = c.id AND situacao = 'vigente';
  d := public.devolucao_rascunho_folha(c);
  DELETE FROM public.valores_folha WHERE id_devolucao = d.id;
  FOR i IN SELECT * FROM jsonb_array_elements(coalesce(p_liquidos, '[]')) LOOP
    v_func := public.uuid_ou_nulo(i ->> 'id_funcionario');
    IF v_func IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_snap -> 'funcionarios') f WHERE f ->> 'id' = v_func::text) THEN
      RAISE EXCEPTION 'Funcionário fora da folha enviada.' USING ERRCODE = 'check_violation';
    END IF;
    BEGIN v_valor := (i ->> 'valor')::numeric; EXCEPTION WHEN others THEN v_valor := NULL; END;
    IF v_valor IS NULL OR v_valor < 0 OR v_valor > 9999999.99 OR v_valor <> round(v_valor, 2) THEN RAISE EXCEPTION 'Líquido inválido.' USING ERRCODE = 'check_violation'; END IF;
    BEGIN
      INSERT INTO public.valores_folha (id_empresa, id_devolucao, tipo, id_funcionario, valor) VALUES (c.id_empresa, d.id, 'liquido', v_func, v_valor);
    EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Líquido informado duas vezes para o mesmo funcionário.' USING ERRCODE = 'check_violation';
    END;
  END LOOP;
  FOR i IN SELECT * FROM jsonb_array_elements(coalesce(p_encargos, '[]')) LOOP
    v_desc := btrim(coalesce(i ->> 'descricao', ''));
    BEGIN v_valor := (i ->> 'valor')::numeric; v_venc := (i ->> 'vencimento')::date; EXCEPTION WHEN others THEN v_valor := NULL; END;
    IF char_length(v_desc) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Descreva cada encargo (ex.: FGTS, INSS).' USING ERRCODE = 'check_violation'; END IF;
    IF v_valor IS NULL OR v_valor <= 0 OR v_valor > 9999999.99 OR v_valor <> round(v_valor, 2) THEN RAISE EXCEPTION 'Valor de encargo inválido.' USING ERRCODE = 'check_violation'; END IF;
    IF v_venc IS NULL OR v_venc < c.competencia OR v_venc > c.competencia + 400 THEN RAISE EXCEPTION 'Vencimento de encargo inválido.' USING ERRCODE = 'check_violation'; END IF;
    INSERT INTO public.valores_folha (id_empresa, id_devolucao, tipo, descricao, valor, vencimento) VALUES (c.id_empresa, d.id, 'encargo', v_desc, v_valor, v_venc);
  END LOOP;
END;
$$;

-- Devolução completa = holerite e líquido para cada funcionário da versão enviada
CREATE OR REPLACE FUNCTION public.faltas_devolucao_folha(p_id_devolucao uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer FROM public.devolucoes_folha d JOIN public.pacotes_folha p ON p.id = d.id_pacote
   CROSS JOIN LATERAL jsonb_array_elements(p.snapshot -> 'funcionarios') f
   WHERE d.id = p_id_devolucao
     AND (NOT EXISTS (SELECT 1 FROM public.documentos_folha x WHERE x.id_devolucao = d.id AND x.categoria = 'holerite' AND x.excluido_em IS NULL AND x.id_funcionario::text = f ->> 'id')
          OR NOT EXISTS (SELECT 1 FROM public.valores_folha v WHERE v.id_devolucao = d.id AND v.tipo = 'liquido' AND v.id_funcionario::text = f ->> 'id'));
$$;

CREATE OR REPLACE FUNCTION public.concluir_devolucao_folha(p_id_competencia uuid, p_observacoes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.competencias_folha; d public.devolucoes_folha; v_faltas integer;
BEGIN
  c := public.competencia_do_contador_folha(p_id_competencia, ARRAY['em_processamento']);
  SELECT * INTO d FROM public.devolucoes_folha WHERE id_competencia = c.id AND situacao = 'rascunho' FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Anexe os holerites e informe os valores antes de concluir.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(coalesce(p_observacoes, '')) > 1000 THEN RAISE EXCEPTION 'Observações muito longas (máximo de 1000 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  v_faltas := public.faltas_devolucao_folha(d.id);
  IF v_faltas > 0 THEN RAISE EXCEPTION 'Falta holerite ou líquido de % funcionário(s).', v_faltas USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.devolucoes_folha SET situacao = 'enviada', enviada_por = auth.uid(), enviada_em = now(), observacoes = nullif(btrim(coalesce(p_observacoes, '')), '') WHERE id = d.id;
  UPDATE public.competencias_folha SET status = 'devolvida', atualizado_em = now() WHERE id = c.id;
  PERFORM public.registrar_evento_folha(c.id, NULL, 'folha_devolvida', 'Contador devolveu a folha processada (devolução ' || d.numero || ')', c.versao_atual, NULL);
  PERFORM public.notificar_folha(c.id_empresa, 'empresa', 'Folha processada pelo contador',
    'A folha de ' || to_char(c.competencia, 'MM/YYYY') || ' foi devolvida com holerites e valores. Confira e aprove.');
  RETURN d.id;
END;
$$;

-- ===== 9. Funções públicas: aprovação e revisão (empresa) =====
CREATE OR REPLACE FUNCTION public.devolucao_para_decisao_folha(p_id_competencia uuid, p_id_devolucao uuid)
RETURNS public.devolucoes_folha LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.competencias_folha; d public.devolucoes_folha;
BEGIN
  SELECT * INTO c FROM public.competencias_folha WHERE id = p_id_competencia FOR UPDATE;
  IF c.id IS NULL OR NOT public.pode_gerenciar_folha(c.id_empresa) THEN RAISE EXCEPTION 'Folha não encontrada.' USING ERRCODE = '42501'; END IF;
  IF c.status <> 'devolvida' THEN RAISE EXCEPTION 'Não há devolução aguardando aprovação.' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO d FROM public.devolucoes_folha WHERE id = p_id_devolucao AND id_competencia = c.id FOR UPDATE;
  IF d.id IS NULL OR d.situacao <> 'enviada' OR NOT EXISTS (SELECT 1 FROM public.pacotes_folha p WHERE p.id = d.id_pacote AND p.situacao = 'vigente') THEN
    RAISE EXCEPTION 'Esta versão foi substituída: atualize a página e confira a versão atual.' USING ERRCODE = 'check_violation';
  END IF;
  IF public.faltas_devolucao_folha(d.id) > 0 THEN RAISE EXCEPTION 'Devolução incompleta: não pode ser aprovada.' USING ERRCODE = 'check_violation'; END IF;
  RETURN d;
END;
$$;

CREATE OR REPLACE FUNCTION public.aprovar_folha(p_id_competencia uuid, p_id_devolucao uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.devolucoes_folha; c public.competencias_folha;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = '42501'; END IF;
  d := public.devolucao_para_decisao_folha(p_id_competencia, p_id_devolucao);
  SELECT * INTO c FROM public.competencias_folha WHERE id = d.id_competencia;
  UPDATE public.devolucoes_folha SET situacao = 'aprovada', aprovada_por = auth.uid(), aprovada_em = now() WHERE id = d.id;
  UPDATE public.competencias_folha SET status = 'aprovada', atualizado_em = now() WHERE id = c.id;
  PERFORM public.integrar_folha_financeiro(d.id);
  PERFORM public.registrar_evento_folha(c.id, NULL, 'folha_aprovada', 'Folha aprovada pela empresa (versão ' || c.versao_atual || ', devolução ' || d.numero || ')',
    c.versao_atual, jsonb_build_object('id_devolucao', d.id));
  PERFORM public.notificar_folha(c.id_empresa, 'contador', 'Folha aprovada', 'A empresa aprovou a folha de ' || to_char(c.competencia, 'MM/YYYY') || '.');
END;
$$;

CREATE OR REPLACE FUNCTION public.solicitar_revisao_folha(p_id_competencia uuid, p_id_devolucao uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.devolucoes_folha; c public.competencias_folha;
BEGIN
  IF char_length(btrim(coalesce(p_motivo, ''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Explique o que precisa ser revisado (3 a 1000 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  d := public.devolucao_para_decisao_folha(p_id_competencia, p_id_devolucao);
  SELECT * INTO c FROM public.competencias_folha WHERE id = d.id_competencia;
  UPDATE public.devolucoes_folha SET situacao = 'revisao_solicitada', motivo_revisao = btrim(p_motivo), revisao_por = auth.uid(), revisao_em = now() WHERE id = d.id;
  UPDATE public.competencias_folha SET status = 'revisao_solicitada', atualizado_em = now() WHERE id = c.id;
  PERFORM public.registrar_evento_folha(c.id, NULL, 'revisao_solicitada', 'Empresa solicitou revisão: ' || btrim(p_motivo), c.versao_atual, NULL);
  PERFORM public.notificar_folha(c.id_empresa, 'contador', 'Revisão solicitada na folha', left(btrim(p_motivo), 300));
END;
$$;

-- ===== 10. Pagamento (depois da aprovação): comprovantes; a baixa usa as funções existentes (registrar_pagamento_folha / registrar_baixa_lancamento) =====
CREATE OR REPLACE FUNCTION public.anexar_comprovante_folha(p_id_competencia uuid, p_id_funcionario uuid, p_id_valor uuid, p_caminho text, p_nome_arquivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.competencias_folha; v record; v_id uuid; v_aprov uuid;
BEGIN
  SELECT * INTO c FROM public.competencias_folha WHERE id = p_id_competencia;
  IF c.id IS NULL OR NOT public.pode_gerenciar_folha(c.id_empresa) THEN RAISE EXCEPTION 'Folha não encontrada.' USING ERRCODE = '42501'; END IF;
  IF c.status <> 'aprovada' THEN RAISE EXCEPTION 'Comprovantes só depois da aprovação da folha.' USING ERRCODE = 'check_violation'; END IF;
  IF (p_id_funcionario IS NULL) = (p_id_valor IS NULL) THEN RAISE EXCEPTION 'Escolha um funcionário ou um encargo.' USING ERRCODE = 'check_violation'; END IF;
  SELECT id INTO v_aprov FROM public.devolucoes_folha WHERE id_competencia = c.id AND situacao = 'aprovada';
  IF p_id_funcionario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.valores_folha WHERE id_devolucao = v_aprov AND tipo = 'liquido' AND id_funcionario = p_id_funcionario) THEN
    RAISE EXCEPTION 'Funcionário fora da folha aprovada.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_id_valor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.valores_folha WHERE id = p_id_valor AND id_devolucao = v_aprov AND tipo = 'encargo') THEN
    RAISE EXCEPTION 'Encargo fora da folha aprovada.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v FROM public.validar_arquivo_folha(c.id_empresa, p_caminho);
  INSERT INTO public.documentos_folha (id_empresa, id_competencia, categoria, id_funcionario, id_valor, caminho, nome_arquivo, tipo_mime, tamanho, enviado_por)
  VALUES (c.id_empresa, c.id, 'comprovante', p_id_funcionario, p_id_valor, p_caminho, left(coalesce(nullif(btrim(p_nome_arquivo), ''), 'comprovante'), 200), v.tipo, v.tamanho, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.registrar_evento_folha(c.id, p_id_funcionario, 'comprovante_anexado', 'Comprovante de pagamento anexado: ' || left(coalesce(p_nome_arquivo, ''), 120), NULL, NULL);
  RETURN v_id;
END;
$$;

-- ===== 11. Leitura consolidada (indicadores e tabela vêm daqui; nunca números fixos) =====
CREATE OR REPLACE FUNCTION public.painel_folha_pagamento(p_id_empresa uuid, p_competencia date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_comp date := date_trunc('month', p_competencia)::date;
  c public.competencias_folha;
  v_func jsonb; v_pend jsonb; v_dev jsonb; v_pac jsonb; v_pag jsonb;
  v_contador boolean := public.pode_processar_folha(p_id_empresa);
BEGIN
  IF v_comp IS NULL OR NOT public.pode_ver_folha(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso à folha desta empresa.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.competencias_folha WHERE id_empresa = p_id_empresa AND competencia = v_comp;

  -- Depois do envio, o contador vê a versão enviada; antes, a lista viva da competência
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'nome', f.nome, 'matricula', f.matricula, 'cargo', f.cargo, 'vinculo', f.vinculo, 'data_admissao', f.data_admissao,
      'status_funcionario', f.status, 'salario_base', public.salario_vigente(f.id, v_comp),
      'ocorrencias', CASE WHEN c.id IS NULL THEN 0 ELSE (SELECT count(*) FROM public.ocorrencias_folha o WHERE o.id_competencia = c.id AND o.id_funcionario = f.id AND o.excluido_em IS NULL) END,
      'pendencias', CASE WHEN c.id IS NULL THEN 0 ELSE (SELECT count(*) FROM public.pendencias_abertas_folha(c.id, f.id)) END,
      'situacao', CASE WHEN c.id IS NULL THEN 'a_conferir' ELSE public.situacao_funcionario_folha(c.id, f.id) END,
      'conferencia', (SELECT jsonb_build_object('sem_ocorrencias', k.sem_ocorrencias, 'confirmado_em', k.confirmado_em,
                        'confirmado_por', (SELECT p.nome_completo FROM public.perfis p WHERE p.id_usuario = k.confirmado_por))
                        FROM public.conferencias_folha k WHERE k.id_competencia = c.id AND k.id_funcionario = f.id AND k.invalidada_em IS NULL)
    ) ORDER BY f.nome, f.id), '[]'::jsonb)
    INTO v_func FROM public.funcionarios_da_competencia(p_id_empresa, v_comp) f;

  IF c.id IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id_funcionario', f.id, 'origem', p.origem, 'id', p.id, 'descricao', p.descricao)), '[]'::jsonb) INTO v_pend
      FROM public.funcionarios_da_competencia(p_id_empresa, v_comp) f CROSS JOIN LATERAL public.pendencias_abertas_folha(c.id, f.id) p;
    SELECT jsonb_build_object('id', p.id, 'versao', p.versao, 'responsavel', p.responsavel, 'enviado_em', p.enviado_em, 'observacoes', p.observacoes,
                              'enviado_por', (SELECT nome_completo FROM public.perfis WHERE id_usuario = p.enviado_por))
      INTO v_pac FROM public.pacotes_folha p WHERE p.id_competencia = c.id AND p.situacao = 'vigente';
    SELECT jsonb_build_object('id', d.id, 'numero', d.numero, 'situacao', d.situacao, 'enviada_em', d.enviada_em, 'observacoes', d.observacoes,
                              'motivo_revisao', d.motivo_revisao, 'aprovada_em', d.aprovada_em, 'faltas', public.faltas_devolucao_folha(d.id),
                              'aprovada_por', (SELECT nome_completo FROM public.perfis WHERE id_usuario = d.aprovada_por))
      INTO v_dev FROM public.devolucoes_folha d
     WHERE d.id_competencia = c.id AND (d.situacao <> 'rascunho' OR v_contador)
     ORDER BY (d.situacao IN ('rascunho', 'enviada', 'aprovada')) DESC, d.numero DESC LIMIT 1;
    IF c.status = 'aprovada' THEN
      SELECT jsonb_build_object(
        'salarios', coalesce((SELECT jsonb_agg(jsonb_build_object('id_funcionario', v.id_funcionario, 'liquido', v.valor, 'id_folha', fo.id,
                      'pago', t.pago, 'pendente', t.pendente, 'total', t.total) ORDER BY fu.nome)
                    FROM public.valores_folha v JOIN public.funcionarios fu ON fu.id = v.id_funcionario
                    LEFT JOIN public.folhas_competencia fo ON fo.id_funcionario = v.id_funcionario AND fo.competencia = c.competencia
                    LEFT JOIN LATERAL public.totais_folha(fo.id) t ON true
                   WHERE v.id_devolucao = (v_dev ->> 'id')::uuid AND v.tipo = 'liquido'), '[]'::jsonb),
        'encargos', coalesce((SELECT jsonb_agg(jsonb_build_object('id_valor', v.id, 'descricao', v.descricao, 'valor', v.valor, 'vencimento', v.vencimento,
                      'id_lancamento', l.id, 'status', l.status) ORDER BY v.vencimento, v.descricao)
                    FROM public.valores_folha v LEFT JOIN public.lancamentos_financeiros l ON l.id_valor_folha = v.id AND l.excluido_em IS NULL
                   WHERE v.id_devolucao = (v_dev ->> 'id')::uuid AND v.tipo = 'encargo'), '[]'::jsonb)) INTO v_pag;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'competencia', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id', c.id, 'competencia', c.competencia, 'status', c.status, 'versao_atual', c.versao_atual,
                     'atualizado_em', c.atualizado_em) END,
    'funcionarios', v_func,
    'pendencias', coalesce(v_pend, '[]'::jsonb),
    'pacote', v_pac,
    'devolucao', v_dev,
    'pagamento', v_pag,
    'pode_preparar', public.pode_gerenciar_folha(p_id_empresa),
    'pode_processar', v_contador,
    'contador_habilitado', EXISTS (SELECT 1 FROM public.vinculos_contabeis v WHERE v.id_empresa = p_id_empresa AND v.status = 'ativo' AND v.permissoes @> ARRAY['ver_folha', 'processar_folha']));
END;
$$;

-- Competências com folha registrada (para o contador achar o que recebeu)
CREATE OR REPLACE FUNCTION public.competencias_folha_empresa(p_id_empresa uuid)
RETURNS TABLE (id uuid, competencia date, status text, versao_atual integer, atualizado_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_ver_folha(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso à folha desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT c.id, c.competencia, c.status, c.versao_atual, c.atualizado_em FROM public.competencias_folha c WHERE c.id_empresa = p_id_empresa ORDER BY c.competencia DESC;
END;
$$;

-- ===== 12. Grants: internas sem acesso; públicas só para authenticated =====
REVOKE ALL ON FUNCTION public.atribuir_matricula_funcionario(), public.proteger_lancamento_encargo_folha(),
  public.registrar_evento_folha(uuid, uuid, text, text, integer, jsonb), public.notificar_folha(uuid, text, text, text),
  public.validar_competencia_folha(date), public.funcionarios_da_competencia(uuid, date), public.competencia_editavel_folha(uuid, date),
  public.funcionario_na_competencia(uuid, public.competencias_folha), public.pendencia_ocorrencia_folha(public.ocorrencias_folha),
  public.pendencias_abertas_folha(uuid, uuid), public.situacao_funcionario_folha(uuid, uuid), public.invalidar_conferencia_folha(uuid, uuid, text),
  public.validar_ocorrencia_folha(text, numeric, numeric, date, date, text, text, date), public.snapshot_folha(public.competencias_folha),
  public.categoria_encargos_folha(uuid), public.integrar_folha_financeiro(uuid), public.validar_arquivo_folha(uuid, text),
  public.competencia_do_contador_folha(uuid, text[]), public.devolucao_rascunho_folha(public.competencias_folha), public.faltas_devolucao_folha(uuid),
  public.devolucao_para_decisao_folha(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pode_processar_folha(uuid), public.caminho_folha_valido(text), public.pode_ler_arquivo_folha(text, text), public.pode_descartar_arquivo_folha(text, text),
  public.salvar_ocorrencia_folha(uuid, uuid, date, uuid, text, numeric, numeric, date, date, text, text, text), public.excluir_ocorrencia_folha(uuid),
  public.confirmar_conferencia_folha(uuid, date, uuid, boolean), public.desfazer_conferencia_folha(uuid, date, uuid),
  public.registrar_pendencia_folha(uuid, date, uuid, text), public.resolver_pendencia_folha(uuid, text),
  public.anexar_documento_ocorrencia_folha(uuid, text, text), public.excluir_documento_folha(uuid), public.enviar_folha_contador(uuid, date, text, text, boolean),
  public.iniciar_processamento_folha(uuid), public.solicitar_correcao_folha(uuid, text, jsonb), public.registrar_documento_devolucao_folha(uuid, text, uuid, text, text),
  public.informar_valores_folha(uuid, jsonb, jsonb), public.concluir_devolucao_folha(uuid, text), public.aprovar_folha(uuid, uuid),
  public.solicitar_revisao_folha(uuid, uuid, text), public.anexar_comprovante_folha(uuid, uuid, uuid, text, text),
  public.painel_folha_pagamento(uuid, date), public.competencias_folha_empresa(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_processar_folha(uuid), public.caminho_folha_valido(text), public.pode_ler_arquivo_folha(text, text), public.pode_descartar_arquivo_folha(text, text),
  public.salvar_ocorrencia_folha(uuid, uuid, date, uuid, text, numeric, numeric, date, date, text, text, text), public.excluir_ocorrencia_folha(uuid),
  public.confirmar_conferencia_folha(uuid, date, uuid, boolean), public.desfazer_conferencia_folha(uuid, date, uuid),
  public.registrar_pendencia_folha(uuid, date, uuid, text), public.resolver_pendencia_folha(uuid, text),
  public.anexar_documento_ocorrencia_folha(uuid, text, text), public.excluir_documento_folha(uuid), public.enviar_folha_contador(uuid, date, text, text, boolean),
  public.iniciar_processamento_folha(uuid), public.solicitar_correcao_folha(uuid, text, jsonb), public.registrar_documento_devolucao_folha(uuid, text, uuid, text, text),
  public.informar_valores_folha(uuid, jsonb, jsonb), public.concluir_devolucao_folha(uuid, text), public.aprovar_folha(uuid, uuid),
  public.solicitar_revisao_folha(uuid, uuid, text), public.anexar_comprovante_folha(uuid, uuid, uuid, text, text),
  public.painel_folha_pagamento(uuid, date), public.competencias_folha_empresa(uuid)
  TO authenticated;
