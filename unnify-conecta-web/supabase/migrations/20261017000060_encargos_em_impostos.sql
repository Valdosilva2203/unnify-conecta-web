-- 060: encargos devolvidos pelo contador e aprovados pela empresa aparecem também em Contabilidade e Obrigações → Impostos.
-- Cada encargo já vira UMA conta a pagar na aprovação (052). Agora vira também UM imposto ligado a ESSA MESMA conta (sem duplicar).
-- O imposto da folha só muda pela folha: valor, vencimento, cancelamento e exclusão bloqueados em Impostos; pagamento segue normal.
-- Se a empresa já cadastrou manualmente o mesmo tributo/competência, a aprovação não falha: registra no histórico da folha e não liga.
-- Encargos de folhas já aprovadas recebem o imposto agora (idempotente). Reversão: rollback/20261017000060_encargos_em_impostos_reverter.sql
ALTER TABLE public.impostos ADD COLUMN IF NOT EXISTS id_valor_folha uuid REFERENCES public.valores_folha(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS impostos_um_por_encargo_folha ON public.impostos (id_valor_folha) WHERE id_valor_folha IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tipo_imposto_do_encargo(p_descricao text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN lower(p_descricao) ~ 'fgts' THEN 'fgts'
              WHEN lower(p_descricao) ~ '(inss|gps|previd)' THEN 'inss'
              WHEN lower(p_descricao) ~ '(irrf|darf|dctf)' THEN 'darf'
              WHEN lower(p_descricao) ~ '(^|[^a-z])iss([^a-z]|$)' THEN 'iss'
              ELSE 'outro' END;
$$;

CREATE OR REPLACE FUNCTION public.imposto_de_encargo_folha(p_id_valor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.valores_folha; d public.devolucoes_folha; c public.competencias_folha; l public.lancamentos_financeiros; v_id uuid;
BEGIN
  SELECT * INTO v FROM public.valores_folha WHERE id = p_id_valor AND tipo = 'encargo';
  IF v.id IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM public.impostos WHERE id_valor_folha = v.id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id_valor_folha = v.id AND excluido_em IS NULL;
  IF l.id IS NULL OR l.id_imposto IS NOT NULL THEN RETURN NULL; END IF;
  SELECT * INTO d FROM public.devolucoes_folha WHERE id = v.id_devolucao;
  SELECT * INTO c FROM public.competencias_folha WHERE id = d.id_competencia;
  BEGIN
    INSERT INTO public.impostos (id_empresa, tipo, nome, orgao, competencia, vencimento, valor, descricao, criado_por, id_valor_folha)
    VALUES (v.id_empresa, public.tipo_imposto_do_encargo(v.descricao), left(btrim(v.descricao), 120), 'Folha de pagamento (contador)', c.competencia,
            v.vencimento, v.valor, left('Encargo da folha de ' || to_char(c.competencia, 'MM/YYYY') || ' informado pelo contador e aprovado pela empresa.', 300),
            auth.uid(), v.id)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    PERFORM public.registrar_evento_folha(c.id, NULL, 'imposto_nao_vinculado',
      'Encargo "' || v.descricao || '" já existe em Impostos para esta competência (cadastro manual): a conta a pagar da folha não foi ligada a ele.', NULL,
      jsonb_build_object('id_valor', v.id));
    RETURN NULL;
  END;
  PERFORM set_config('unnify.operacao_folha', 'sim', true);
  UPDATE public.lancamentos_financeiros SET id_imposto = v_id WHERE id = l.id;
  INSERT INTO public.historico_impostos (id_empresa, id_imposto, acao, dados, id_usuario)
  VALUES (v.id_empresa, v_id, 'criado', jsonb_build_object('origem', 'folha_pagamento', 'competencia', c.competencia, 'valor', v.valor, 'vencimento', v.vencimento), auth.uid());
  RETURN v_id;
END;
$$;

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
    PERFORM public.imposto_de_encargo_folha(r.id); -- também aparece em Impostos (mesma conta a pagar, sem duplicar)
  END LOOP;
  PERFORM set_config('unnify.operacao_folha', '', true);
END;
$$;


-- Imposto vindo da folha: só a folha altera valor, vencimento, identificação, cancelamento e exclusão (pagamento e guias seguem normais)
CREATE OR REPLACE FUNCTION public.proteger_imposto_da_folha()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.id_valor_folha IS NULL OR current_setting('unnify.operacao_folha', true) = 'sim' THEN RETURN NEW; END IF;
  IF (NEW.valor, NEW.vencimento, NEW.tipo, NEW.nome, NEW.orgao, NEW.competencia, NEW.id_valor_folha) IS DISTINCT FROM
     (OLD.valor, OLD.vencimento, OLD.tipo, OLD.nome, OLD.orgao, OLD.competencia, OLD.id_valor_folha)
     OR (NEW.status = 'cancelado' AND OLD.status <> 'cancelado') OR (NEW.excluido_em IS NOT NULL AND OLD.excluido_em IS NULL) THEN
    RAISE EXCEPTION 'Este imposto é um encargo da folha de pagamento aprovada: valor, vencimento e exclusão só mudam pela Folha de Pagamento.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS proteger_imposto_da_folha ON public.impostos;
CREATE TRIGGER proteger_imposto_da_folha BEFORE UPDATE ON public.impostos FOR EACH ROW EXECUTE FUNCTION public.proteger_imposto_da_folha();

-- Folhas já aprovadas: cria o imposto dos encargos que ainda não têm (idempotente)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT v.id FROM public.valores_folha v JOIN public.devolucoes_folha d ON d.id = v.id_devolucao
            WHERE v.tipo = 'encargo' AND d.situacao = 'aprovada' AND NOT EXISTS (SELECT 1 FROM public.impostos i WHERE i.id_valor_folha = v.id) LOOP
    PERFORM public.imposto_de_encargo_folha(r.id);
  END LOOP;
  PERFORM set_config('unnify.operacao_folha', '', true);
END $$;

REVOKE ALL ON FUNCTION public.imposto_de_encargo_folha(uuid), public.tipo_imposto_do_encargo(text), public.proteger_imposto_da_folha() FROM PUBLIC, anon, authenticated;
