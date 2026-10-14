-- Reverte Clientes. Os lançamentos do Financeiro permanecem (só perdem o vínculo opcional com o cliente).
DROP FUNCTION IF EXISTS public.receitas_sem_cliente(uuid, text);
DROP FUNCTION IF EXISTS public.financeiro_cliente(uuid);
DROP FUNCTION IF EXISTS public.resumo_clientes(uuid);
DROP FUNCTION IF EXISTS public.buscar_clientes(uuid, text, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.vincular_cliente_lancamento(uuid, uuid);
DROP FUNCTION IF EXISTS public.salvar_cliente(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text);
DROP TRIGGER IF EXISTS validar_cliente_lancamento ON public.lancamentos_financeiros;
DROP FUNCTION IF EXISTS public.validar_cliente_lancamento();
DROP INDEX IF EXISTS public.idx_lancamentos_cliente;
ALTER TABLE public.lancamentos_financeiros DROP COLUMN IF EXISTS id_cliente;
DROP TABLE IF EXISTS public.historico_clientes;
DROP TABLE IF EXISTS public.clientes;
DROP FUNCTION IF EXISTS public.pode_ver_clientes(uuid);
DROP FUNCTION IF EXISTS public.pode_gerenciar_clientes(uuid);
DROP FUNCTION IF EXISTS public.cpf_valido(text);
