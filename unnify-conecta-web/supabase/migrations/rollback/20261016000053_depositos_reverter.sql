-- Reverte a 20261016000053_depositos.sql. As transferências e lançamentos criados pelos depósitos PERMANECEM (são movimentações
-- reais do Financeiro); só o registro do depósito (e o vínculo do comprovante) some. Arquivos no Storage não são apagados aqui.
DROP POLICY IF EXISTS "Comprovantes financeiros: envio de comprovante de depósito" ON storage.objects;
DROP FUNCTION IF EXISTS public.registrar_comprovante_deposito(uuid, text, text), public.registrar_deposito(uuid, uuid, uuid, text, uuid, text, text, numeric, date, text),
  public.categoria_deposito_externo(uuid, text);
DROP TABLE IF EXISTS public.depositos_financeiros;
DELETE FROM public.historico_contas_financeiras WHERE acao = 'deposito';
ALTER TABLE public.historico_contas_financeiras DROP CONSTRAINT historico_contas_acao;
ALTER TABLE public.historico_contas_financeiras ADD CONSTRAINT historico_contas_acao
  CHECK (acao IN ('conta_criada', 'conta_editada', 'conta_principal', 'conta_arquivada', 'conta_reativada', 'transferencia', 'transferencia_estornada'));
