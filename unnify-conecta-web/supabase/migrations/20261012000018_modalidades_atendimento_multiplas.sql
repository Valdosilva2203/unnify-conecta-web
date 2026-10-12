-- Perfil profissional: o contador marca quantas modalidades de atendimento quiser.
-- Troca modalidade_atendimento (valor único) por modalidades_atendimento (lista), convertendo os dados.

ALTER TABLE public.perfis_profissionais
  ADD COLUMN modalidades_atendimento text[] NOT NULL DEFAULT ARRAY['online', 'presencial']::text[];

UPDATE public.perfis_profissionais
   SET modalidades_atendimento = CASE modalidade_atendimento
         WHEN 'online' THEN ARRAY['online']
         WHEN 'presencial' THEN ARRAY['presencial']
         ELSE ARRAY['online', 'presencial']
       END;

ALTER TABLE public.perfis_profissionais
  ADD CONSTRAINT perfis_profissionais_modalidades CHECK (
    cardinality(modalidades_atendimento) BETWEEN 1 AND 4
    AND modalidades_atendimento <@ ARRAY['online', 'presencial', 'visita_cliente', 'telefone_whatsapp']::text[]);

ALTER TABLE public.perfis_profissionais DROP CONSTRAINT perfis_profissionais_modalidade;
ALTER TABLE public.perfis_profissionais DROP COLUMN modalidade_atendimento;

-- Funções do catálogo: tipo de retorno muda, então precisam ser recriadas (continuam sem contatos)
DROP FUNCTION public.buscar_catalogo_contadores(text, text, text, text, text, text, integer, integer);
DROP FUNCTION public.perfil_do_catalogo(uuid);

CREATE FUNCTION public.buscar_catalogo_contadores(
  p_busca text DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_especialidade text DEFAULT NULL,
  p_modalidade text DEFAULT NULL,
  p_tipo text DEFAULT NULL,
  p_limite integer DEFAULT 12,
  p_deslocamento integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, tipo text, nome_profissional text, crc text, cidade text, estado text,
  especialidades text[], servicos text[], descricao text, modalidades_atendimento text[],
  foto_caminho text, total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_ver_catalogo() THEN
    RAISE EXCEPTION 'O catálogo está disponível para empresas cadastradas e ativas.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT pp.id,
           CASE WHEN pp.id_usuario IS NOT NULL THEN 'contador' ELSE 'escritorio' END,
           pp.nome_profissional, pp.crc, pp.cidade, pp.estado::text, pp.especialidades, pp.servicos,
           left(pp.descricao, 300), pp.modalidades_atendimento, pp.foto_caminho,
           count(*) OVER ()
      FROM public.perfis_profissionais pp
     WHERE public.perfil_no_catalogo(pp.id)
       AND (p_estado IS NULL OR p_estado = '' OR pp.estado = p_estado)
       AND (p_cidade IS NULL OR p_cidade = '' OR pp.cidade ILIKE p_cidade)
       AND (p_especialidade IS NULL OR p_especialidade = '' OR p_especialidade = ANY (pp.especialidades))
       AND (p_modalidade IS NULL OR p_modalidade = '' OR p_modalidade = ANY (pp.modalidades_atendimento))
       AND (p_tipo IS NULL OR p_tipo = ''
            OR (p_tipo = 'contador' AND pp.id_usuario IS NOT NULL)
            OR (p_tipo = 'escritorio' AND pp.id_escritorio IS NOT NULL))
       AND (p_busca IS NULL OR p_busca = ''
            OR pp.nome_profissional ILIKE '%' || p_busca || '%'
            OR pp.cidade ILIKE '%' || p_busca || '%'
            OR array_to_string(pp.especialidades, ' ') ILIKE '%' || p_busca || '%'
            OR array_to_string(pp.servicos, ' ') ILIKE '%' || p_busca || '%')
     ORDER BY pp.nome_profissional
     LIMIT LEAST(GREATEST(p_limite, 1), 50) OFFSET GREATEST(p_deslocamento, 0);
END;
$$;

CREATE FUNCTION public.perfil_do_catalogo(p_id_perfil uuid)
RETURNS TABLE (
  id uuid, tipo text, nome_profissional text, crc text, cidade text, estado text,
  especialidades text[], servicos text[], descricao text, modalidades_atendimento text[],
  foto_caminho text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_ver_catalogo() THEN
    RAISE EXCEPTION 'O catálogo está disponível para empresas cadastradas e ativas.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT pp.id,
           CASE WHEN pp.id_usuario IS NOT NULL THEN 'contador' ELSE 'escritorio' END,
           pp.nome_profissional, pp.crc, pp.cidade, pp.estado::text, pp.especialidades, pp.servicos,
           pp.descricao, pp.modalidades_atendimento, pp.foto_caminho
      FROM public.perfis_profissionais pp
     WHERE pp.id = p_id_perfil AND public.perfil_no_catalogo(pp.id);
END;
$$;

REVOKE ALL ON FUNCTION public.buscar_catalogo_contadores(text, text, text, text, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.perfil_do_catalogo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_catalogo_contadores(text, text, text, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perfil_do_catalogo(uuid) TO authenticated;
