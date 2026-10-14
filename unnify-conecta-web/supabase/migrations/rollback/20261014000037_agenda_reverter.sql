-- Reverte a Agenda (remove compromissos; tarefas, obrigações e lançamentos não são tocados).
DROP FUNCTION IF EXISTS public.agenda_eventos(uuid, date, date);
DROP FUNCTION IF EXISTS public.excluir_compromisso(uuid);
DROP FUNCTION IF EXISTS public.salvar_compromisso(uuid, uuid, text, text, text, timestamptz, timestamptz, boolean, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.membros_agenda(uuid);
DROP FUNCTION IF EXISTS public.pode_ver_compromisso(public.compromissos_agenda);
DROP TABLE IF EXISTS public.compromissos_agenda;
DROP FUNCTION IF EXISTS public.e_membro_empresa(uuid);
