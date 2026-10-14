-- Reverte Relatórios (só leitura; nenhum dado é tocado).
DROP FUNCTION IF EXISTS public.relatorio_financeiro(uuid, date, date, uuid);
