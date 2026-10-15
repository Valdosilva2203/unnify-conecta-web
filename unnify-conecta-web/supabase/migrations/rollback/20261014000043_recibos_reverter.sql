-- Reverte Recibos. ATENÇÃO: apaga os recibos emitidos (documentos). Fazer backup antes.
DROP FUNCTION IF EXISTS public.pagamentos_sem_recibo(uuid, text, text);
DROP FUNCTION IF EXISTS public.resumo_recibos(uuid, date, date);
DROP FUNCTION IF EXISTS public.buscar_recibos(uuid, text, text, text, uuid, date, date, integer, integer);
DROP FUNCTION IF EXISTS public.registrar_evento_recibo(uuid, text);
DROP FUNCTION IF EXISTS public.cancelar_recibo(uuid, text);
DROP FUNCTION IF EXISTS public.conciliar_recibo(uuid, uuid);
DROP FUNCTION IF EXISTS public.emitir_recibo(uuid, uuid, uuid, text, text, text, numeric, date, text, boolean, numeric, boolean, text, uuid);
DELETE FROM public.historico_clientes WHERE acao IN ('recibo_emitido', 'recibo_cancelado');
ALTER TABLE public.historico_clientes DROP CONSTRAINT historico_clientes_acao_check;
ALTER TABLE public.historico_clientes ADD CONSTRAINT historico_clientes_acao_check
  CHECK (acao IN ('criado', 'editado', 'status', 'receita_vinculada', 'receita_desvinculada', 'venda_registrada', 'venda_cancelada'));
DROP TABLE IF EXISTS public.historico_recibos;
DROP TRIGGER IF EXISTS impedir_exclusao_recibo ON public.recibos;
DROP TABLE IF EXISTS public.recibos;
DROP FUNCTION IF EXISTS public.impedir_exclusao_recibo();
DROP FUNCTION IF EXISTS public.proteger_recibo();
DROP FUNCTION IF EXISTS public.valor_por_extenso(numeric);
DROP FUNCTION IF EXISTS public.extenso_ate_999(integer);
