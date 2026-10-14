-- E4 — Meu Contador: apenas FUNÇÕES DE LEITURA (indicadores e histórico do relacionamento, painel do contador).
-- Nenhuma tabela nova: reaproveita vinculos_contabeis (+ histórico), solicitacoes_documentos, documentos_empresa e
-- obrigacoes_empresa (E3) e as permissões existentes (e_gestor_empresa, contador_pode).
-- DEPENDE de 20261013000032 (E3). Reversão: rollback/20261013000033_meu_contador_reverter.sql

DO $$
BEGIN
  IF to_regclass('public.solicitacoes_documentos') IS NULL OR to_regclass('public.obrigacoes_empresa') IS NULL THEN
    RAISE EXCEPTION 'E4: aplique antes a migration 20261013000032 (Documentos e Obrigações); nada foi alterado.';
  END IF;
END;
$$;

-- 1. Indicadores do relacionamento (visão do empresário): só dono/sócio da empresa
CREATE OR REPLACE FUNCTION public.resumo_relacionamento_contabil(p_id_empresa uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := public.hoje_brasil();
BEGIN
  IF NOT public.e_gestor_empresa(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'documentos_solicitados', (SELECT count(*) FROM public.solicitacoes_documentos WHERE id_empresa = p_id_empresa AND status IN ('pendente', 'correcao_solicitada', 'enviado')),
    'aguardando_resposta', (SELECT count(*) FROM public.solicitacoes_documentos WHERE id_empresa = p_id_empresa AND status IN ('pendente', 'correcao_solicitada')),
    'aguardando_contador', (SELECT count(*) FROM public.solicitacoes_documentos WHERE id_empresa = p_id_empresa AND status = 'enviado'),
    'obrigacoes_pendentes', (SELECT count(*) FROM public.obrigacoes_empresa WHERE id_empresa = p_id_empresa AND status IN ('pendente', 'em_andamento')),
    'obrigacoes_atrasadas', (SELECT count(*) FROM public.obrigacoes_empresa WHERE id_empresa = p_id_empresa AND status IN ('pendente', 'em_andamento') AND data_vencimento < v_hoje),
    'itens_concluidos', (SELECT count(*) FROM public.solicitacoes_documentos WHERE id_empresa = p_id_empresa AND status = 'aceito')
                      + (SELECT count(*) FROM public.obrigacoes_empresa WHERE id_empresa = p_id_empresa AND status = 'concluida'),
    'documentos_compartilhados', (SELECT count(*) FROM public.documentos_empresa WHERE id_empresa = p_id_empresa AND excluido_em IS NULL AND compartilhado_contador)
  );
END;
$$;

-- 2. Histórico do relacionamento (visão do empresário): eventos de vínculo/permissões, solicitações, compartilhamentos e
--    obrigações. Só descrição, data e NOME de quem fez — sem IDs, e-mails ou conteúdo de documentos.
CREATE OR REPLACE FUNCTION public.historico_relacionamento_contabil(p_id_empresa uuid, p_limite integer DEFAULT 50)
RETURNS TABLE (quando timestamptz, tipo text, descricao text, autor text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.e_gestor_empresa(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.quando, e.tipo, e.descricao, coalesce(p.nome_completo, 'Sistema')
    FROM (
      SELECT h.alterado_em AS quando, 'vinculo'::text AS tipo,
             CASE h.acao
               WHEN 'solicitado' THEN 'Vínculo solicitado com ' || coalesce(pc.nome_completo, 'contador')
               WHEN 'ativo' THEN 'Vínculo aceito com ' || coalesce(pc.nome_completo, 'contador')
               WHEN 'recusado' THEN 'Vínculo recusado'
               WHEN 'encerrado' THEN 'Vínculo encerrado com ' || coalesce(pc.nome_completo, 'contador')
               ELSE 'Permissões ou função do contador alteradas'
             END AS descricao,
             h.alterado_por AS id_usuario
        FROM public.historico_vinculos_contabeis h
        JOIN public.vinculos_contabeis v ON v.id = h.id_vinculo
        LEFT JOIN public.perfis pc ON pc.id_usuario = coalesce(h.id_contador, v.id_contador)
       WHERE v.id_empresa = p_id_empresa
      UNION ALL
      SELECT hs.criado_em, 'solicitacao',
             CASE hs.acao
               WHEN 'criada' THEN 'Documento solicitado: '
               WHEN 'documento_enviado' THEN 'Documento enviado: '
               WHEN 'aceito' THEN 'Documento aceito: '
               WHEN 'correcao_solicitada' THEN 'Correção solicitada: '
               WHEN 'cancelada' THEN 'Solicitação cancelada: '
               ELSE 'Solicitação atualizada: '
             END || s.titulo,
             hs.id_usuario
        FROM public.historico_solicitacoes_documentos hs
        JOIN public.solicitacoes_documentos s ON s.id = hs.id_solicitacao
       WHERE hs.id_empresa = p_id_empresa
      UNION ALL
      SELECT hd.criado_em, 'documento',
             CASE hd.acao
               WHEN 'compartilhado' THEN 'Documento compartilhado com o contador: '
               WHEN 'compartilhamento_removido' THEN 'Compartilhamento removido: '
               ELSE 'Documento entregue em solicitação: '
             END || d.nome,
             hd.id_usuario
        FROM public.historico_documentos hd
        JOIN public.documentos_empresa d ON d.id = hd.id_documento
       WHERE hd.id_empresa = p_id_empresa AND hd.acao IN ('compartilhado', 'compartilhamento_removido', 'anexado_solicitacao')
      UNION ALL
      SELECT ho.criado_em, 'obrigacao',
             CASE ho.acao
               WHEN 'criada' THEN 'Obrigação cadastrada: '
               WHEN 'concluir' THEN 'Obrigação concluída: '
               WHEN 'cancelar' THEN 'Obrigação cancelada: '
               WHEN 'reabrir' THEN 'Obrigação reaberta: '
               ELSE 'Obrigação atualizada: '
             END || o.titulo,
             ho.id_usuario
        FROM public.historico_obrigacoes ho
        JOIN public.obrigacoes_empresa o ON o.id = ho.id_obrigacao
       WHERE ho.id_empresa = p_id_empresa AND ho.acao IN ('criada', 'concluir', 'cancelar', 'reabrir')
    ) e
    LEFT JOIN public.perfis p ON p.id_usuario = e.id_usuario
   ORDER BY e.quando DESC
   LIMIT least(greatest(coalesce(p_limite, 50), 1), 200);
END;
$$;

-- 3. Painel do contador: SÓ empresas com vínculo ATIVO do próprio contador. Cada número só aparece se a empresa
--    concedeu a permissão correspondente (null = sem permissão; nunca vaza contagem de áreas não autorizadas).
CREATE OR REPLACE FUNCTION public.painel_contador()
RETURNS TABLE (id_empresa uuid, nome text, cnpj text, permissoes text[], solicitacoes_aguardando_analise bigint, solicitacoes_aguardando_empresa bigint,
               obrigacoes_abertas bigint, obrigacoes_atrasadas bigint, obrigacoes_7_dias bigint, itens_concluidos bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := public.hoje_brasil();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.id, coalesce(e.nome_comercial, e.razao_social), e.cnpj, v.permissoes,
         CASE WHEN 'ver_documentos' = ANY (v.permissoes) THEN (SELECT count(*) FROM public.solicitacoes_documentos s WHERE s.id_empresa = e.id AND s.status = 'enviado') END,
         CASE WHEN 'ver_documentos' = ANY (v.permissoes) THEN (SELECT count(*) FROM public.solicitacoes_documentos s WHERE s.id_empresa = e.id AND s.status IN ('pendente', 'correcao_solicitada')) END,
         CASE WHEN 'gerenciar_obrigacoes' = ANY (v.permissoes) THEN (SELECT count(*) FROM public.obrigacoes_empresa o WHERE o.id_empresa = e.id AND o.status IN ('pendente', 'em_andamento')) END,
         CASE WHEN 'gerenciar_obrigacoes' = ANY (v.permissoes) THEN (SELECT count(*) FROM public.obrigacoes_empresa o WHERE o.id_empresa = e.id AND o.status IN ('pendente', 'em_andamento') AND o.data_vencimento < v_hoje) END,
         CASE WHEN 'gerenciar_obrigacoes' = ANY (v.permissoes) THEN (SELECT count(*) FROM public.obrigacoes_empresa o WHERE o.id_empresa = e.id AND o.status IN ('pendente', 'em_andamento') AND o.data_vencimento BETWEEN v_hoje AND v_hoje + 7) END,
         coalesce(CASE WHEN 'ver_documentos' = ANY (v.permissoes) THEN (SELECT count(*) FROM public.solicitacoes_documentos s WHERE s.id_empresa = e.id AND s.status = 'aceito') END, 0)
         + coalesce(CASE WHEN 'gerenciar_obrigacoes' = ANY (v.permissoes) THEN (SELECT count(*) FROM public.obrigacoes_empresa o WHERE o.id_empresa = e.id AND o.status = 'concluida') END, 0)
    FROM public.vinculos_contabeis v
    JOIN public.empresas e ON e.id = v.id_empresa
   WHERE v.id_contador = auth.uid() AND v.status = 'ativo'
   ORDER BY 2;
END;
$$;

-- 4. Próximas obrigações do contador (empresas com vínculo ativo e "gerenciar_obrigacoes"), em aberto, por vencimento
CREATE OR REPLACE FUNCTION public.proximas_obrigacoes_contador(p_limite integer DEFAULT 8)
RETURNS TABLE (id uuid, id_empresa uuid, empresa_nome text, titulo text, data_vencimento date, situacao text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT o.id, o.id_empresa, coalesce(e.nome_comercial, e.razao_social), o.titulo, o.data_vencimento,
         CASE WHEN o.data_vencimento < public.hoje_brasil() THEN 'atrasada' ELSE o.status END
    FROM public.obrigacoes_empresa o
    JOIN public.empresas e ON e.id = o.id_empresa
   WHERE o.status IN ('pendente', 'em_andamento')
     AND EXISTS (SELECT 1 FROM public.vinculos_contabeis v WHERE v.id_empresa = o.id_empresa AND v.id_contador = auth.uid()
                  AND v.status = 'ativo' AND 'gerenciar_obrigacoes' = ANY (v.permissoes))
   ORDER BY o.data_vencimento, o.titulo
   LIMIT least(greatest(coalesce(p_limite, 8), 1), 50);
END;
$$;

REVOKE ALL ON FUNCTION public.resumo_relacionamento_contabil(uuid), public.historico_relacionamento_contabil(uuid, integer),
  public.painel_contador(), public.proximas_obrigacoes_contador(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resumo_relacionamento_contabil(uuid), public.historico_relacionamento_contabil(uuid, integer),
  public.painel_contador(), public.proximas_obrigacoes_contador(integer) TO authenticated;
