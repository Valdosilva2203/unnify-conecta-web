-- Fix prevent_privilege_escalation trigger to use correct column name (funcao_global, not global_role)
CREATE OR REPLACE FUNCTION prevent_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check if funcao_global is being changed
  IF NEW.funcao_global IS DISTINCT FROM OLD.funcao_global THEN
    -- Check if user is trying to elevate their own privileges
    IF NEW.funcao_global IN ('admin', 'admin_master') AND auth.uid() = NEW.id_usuario THEN
      RAISE EXCEPTION 'Users cannot elevate their own privileges';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
