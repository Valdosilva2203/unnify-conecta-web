const https = require('https');
const token = 'sbp_fc4f3d3f907cd33f51db3253968e3e7bcc9480d2';
const projectRef = 'bvwfoafkqjquxcbijffj';

// SQL SIMPLIFICADO - Ordem corrigida: Funções ANTES de Policies
const sql = `
BEGIN;

-- 1. COLUNAS
ALTER TABLE public.profiles ADD COLUMN global_role TEXT DEFAULT 'user' NOT NULL CHECK (global_role IN ('user','admin','admin_master'));
ALTER TABLE public.profiles ADD COLUMN mfa_enabled BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE public.profiles ADD COLUMN status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active','suspended','inactive'));
ALTER TABLE public.profiles ADD COLUMN last_role_change TIMESTAMP WITH TIME ZONE DEFAULT NOW();
CREATE INDEX idx_profiles_global_role ON public.profiles(global_role);
CREATE INDEX idx_profiles_mfa_enabled ON public.profiles(mfa_enabled);
CREATE INDEX idx_profiles_status ON public.profiles(status);

-- 2. AUDIT TABLE
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_audit_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_table ON public.audit_logs(table_name);
CREATE INDEX idx_audit_timestamp ON public.audit_logs(timestamp DESC);

-- 3. ADMIN OPERATIONS
CREATE SCHEMA IF NOT EXISTS admin_operations;
CREATE TABLE admin_operations.pending_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  operation_type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT different_requester_approver CHECK (requested_by != approved_by)
);
CREATE INDEX idx_pending_status ON admin_operations.pending_changes(status);

-- 4. FUNÇÕES (ANTES de POLICIES!)
DROP FUNCTION IF EXISTS public.is_admin_master(uuid);
CREATE FUNCTION public.is_admin_master(p_user_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_user_id UUID; v_role TEXT;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN RETURN false; END IF;
  SELECT global_role INTO v_role FROM public.profiles WHERE user_id = v_user_id;
  RETURN v_role = 'admin_master';
END; $$;

DROP FUNCTION IF EXISTS public.prevent_privilege_escalation();
CREATE FUNCTION public.prevent_privilege_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    IF NEW.global_role IS DISTINCT FROM OLD.global_role THEN
      RAISE EXCEPTION 'Permission denied: Cannot modify role';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Permission denied: Cannot modify status';
    END IF;
    IF NEW.mfa_enabled IS DISTINCT FROM OLD.mfa_enabled THEN
      RAISE EXCEPTION 'Permission denied: Cannot modify MFA';
    END IF;
  END IF;
  IF NEW.global_role IS DISTINCT FROM OLD.global_role AND auth.uid() = NEW.user_id AND NEW.global_role != 'admin_master' THEN
    RAISE EXCEPTION 'Cannot remove your own admin status';
  END IF;
  RETURN NEW;
END; $$;

-- 5. RLS (agora que funções existem)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own" ON public.profiles;
DROP POLICY IF EXISTS "Service role full access" ON public.profiles;

CREATE POLICY "Users view own" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users cannot delete" ON public.profiles FOR DELETE USING (false);
CREATE POLICY "Admin Master all" ON public.profiles FOR SELECT USING (public.is_admin_master(auth.uid()));
CREATE POLICY "Admin Master update" ON public.profiles FOR UPDATE USING (public.is_admin_master(auth.uid()));
CREATE POLICY "Service role all" ON public.profiles USING (true) WITH CHECK (true);

REVOKE DELETE ON public.profiles FROM anon;
REVOKE DELETE ON public.profiles FROM authenticated;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users audit own" ON public.audit_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admin Master audit all" ON public.audit_logs FOR SELECT USING (public.is_admin_master(auth.uid()));

-- 6. TRIGGERS
DROP TRIGGER IF EXISTS enforce_privilege_immutability ON public.profiles;
CREATE TRIGGER enforce_privilege_immutability BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_privilege_escalation();

DROP FUNCTION IF EXISTS public.handle_new_user();
CREATE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, global_role, mfa_enabled, status)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'user', FALSE, 'active')
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;
`;

console.log('\n📡 EXECUTANDO MIGRATION (ORDEM CORRIGIDA)');
console.log('═'.repeat(70) + '\n');

const postData = JSON.stringify({ query: sql });

const options = {
  hostname: 'api.supabase.com',
  port: 443,
  path: `/v1/projects/${projectRef}/database/query`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => { data += chunk; });
  
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅ MIGRATION EXECUTADA COM SUCESSO!\n');
      console.log('═'.repeat(70));
      console.log('🎉 RESULTADO:');
      console.log('═'.repeat(70) + '\n');
      console.log('✅ Colunas adicionadas (global_role, mfa_enabled, status)');
      console.log('✅ Tabela audit_logs criada');
      console.log('✅ Schema admin_operations criado');
      console.log('✅ Funções de segurança criadas');
      console.log('✅ RLS policies implementadas');
      console.log('✅ Triggers configurados');
      console.log('✅ Transaction executado com COMMIT\n');
      process.exit(0);
    } else {
      console.log(`❌ ERRO (${res.statusCode}):\n`);
      console.log(data);
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ ERRO: ${e.message}`);
  process.exit(1);
});

req.write(postData);
req.end();
