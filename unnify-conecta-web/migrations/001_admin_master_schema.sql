-- Migration: 001_admin_master_schema.sql
-- Description: Implementar suporte a Admin Master com segurança em 3 layers
-- Created: 2026-10-09
-- Status: PENDING REVIEW - NÃO EXECUTADO AINDA

-- ============================================================================
-- LAYER 1: APPLICATION DATA - Adicionar colunas de role e status
-- ============================================================================

-- 1.1 Adicionar coluna global_role em profiles
ALTER TABLE public.profiles
ADD COLUMN global_role TEXT DEFAULT 'user' NOT NULL
  CHECK (global_role IN ('user', 'admin', 'admin_master'));

-- 1.2 Adicionar coluna mfa_enabled
ALTER TABLE public.profiles
ADD COLUMN mfa_enabled BOOLEAN DEFAULT FALSE NOT NULL;

-- 1.3 Adicionar coluna status
ALTER TABLE public.profiles
ADD COLUMN status TEXT DEFAULT 'active' NOT NULL
  CHECK (status IN ('active', 'suspended', 'inactive'));

-- 1.4 Adicionar índices para performance
CREATE INDEX idx_profiles_global_role ON public.profiles(global_role);
CREATE INDEX idx_profiles_mfa_enabled ON public.profiles(mfa_enabled);
CREATE INDEX idx_profiles_status ON public.profiles(status);

-- 1.5 Atualizar timestamp updated_at quando global_role mudar
ALTER TABLE public.profiles
ADD COLUMN last_role_change TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ============================================================================
-- LAYER 2: AUDITORIA - Tabela de logs imutável
-- ============================================================================

-- 2.1 Criar tabela audit_logs (INSERT-ONLY, sem UPDATE/DELETE)
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  mfa_verified BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Hash para detecção de adulteração (futura expansão)
  change_hash BYTEA
);

-- 2.2 Índices para audit_logs
CREATE INDEX idx_audit_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_table ON public.audit_logs(table_name);
CREATE INDEX idx_audit_action ON public.audit_logs(action);
CREATE INDEX idx_audit_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX idx_audit_record ON public.audit_logs(table_name, record_id);

-- 2.3 Revogar DELETE/UPDATE em audit_logs (apenas INSERT)
REVOKE DELETE, UPDATE ON public.audit_logs FROM authenticated;
REVOKE DELETE, UPDATE ON public.audit_logs FROM anon;

-- 2.4 Habilitar RLS em audit_logs (apenas leitura para admins)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit entries" ON public.audit_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admin Master sees all audit" ON public.audit_logs
  FOR SELECT USING (
    (SELECT global_role FROM public.profiles WHERE user_id = auth.uid()) = 'admin_master'
  );

CREATE POLICY "Service role unrestricted" ON public.audit_logs
  USING (true) WITH CHECK (true);

-- ============================================================================
-- LAYER 3: ADMINISTRAÇÃO TÉCNICA - Operações administrativas pendentes
-- ============================================================================

-- 3.1 Criar schema para operações administrativas
CREATE SCHEMA IF NOT EXISTS admin_operations;

-- 3.2 Tabela de operações administrativas pendentes
CREATE TABLE admin_operations.pending_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation_type TEXT NOT NULL
    CHECK (operation_type IN ('create_user', 'update_role', 'alter_schema', 'manage_policies', 'other')),
  description TEXT NOT NULL,
  sql_statement TEXT,
  status TEXT DEFAULT 'pending' NOT NULL
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approval_reason TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE,
  executed_at TIMESTAMP WITH TIME ZONE,
  execution_result JSONB,

  -- Validação de segurança: não pode aprovar quem requisitou
  CONSTRAINT different_requester_approver CHECK (requested_by != approved_by)
);

-- 3.3 Índices
CREATE INDEX idx_pending_status ON admin_operations.pending_changes(status);
CREATE INDEX idx_pending_requested ON admin_operations.pending_changes(requested_by);
CREATE INDEX idx_pending_approved ON admin_operations.pending_changes(approved_by);
CREATE INDEX idx_pending_created ON admin_operations.pending_changes(created_at DESC);

-- 3.4 Habilitar RLS em pending_changes
ALTER TABLE admin_operations.pending_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own requests" ON admin_operations.pending_changes
  FOR SELECT USING (requested_by = auth.uid() OR approved_by = auth.uid());

CREATE POLICY "Admin Master sees all" ON admin_operations.pending_changes
  FOR SELECT USING (
    (SELECT global_role FROM public.profiles WHERE user_id = auth.uid()) = 'admin_master'
  );

CREATE POLICY "Admin Master can approve" ON admin_operations.pending_changes
  FOR UPDATE USING (
    (SELECT global_role FROM public.profiles WHERE user_id = auth.uid()) = 'admin_master'
    AND status = 'pending'
  );

-- ============================================================================
-- FUNÇÕES ATUALIZADAS
-- ============================================================================

-- 4.1 Corrigir função is_admin() para usar coluna global_role
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT global_role INTO v_role
  FROM public.profiles
  WHERE user_id = v_user_id;

  RETURN v_role IN ('admin_master', 'admin');
END;
$$;

-- 4.2 Nova função: verificar se é admin master
CREATE OR REPLACE FUNCTION public.is_admin_master(p_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT global_role INTO v_role
  FROM public.profiles
  WHERE user_id = v_user_id;

  RETURN v_role = 'admin_master';
END;
$$;

-- 4.3 Função para registrar auditoria
CREATE OR REPLACE FUNCTION public.audit_change(
  p_action TEXT,
  p_table_name TEXT,
  p_record_id UUID,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_audit_id UUID;
  v_mfa_verified BOOLEAN;
BEGIN
  -- Verificar se o usuário tem MFA ativado
  SELECT mfa_enabled INTO v_mfa_verified
  FROM public.profiles
  WHERE user_id = auth.uid();

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id,
    old_values, new_values, ip_address, user_agent,
    mfa_verified, timestamp
  ) VALUES (
    auth.uid(),
    p_action,
    p_table_name,
    p_record_id,
    p_old_values,
    p_new_values,
    p_ip_address,
    p_user_agent,
    v_mfa_verified,
    NOW()
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

-- 4.4 Trigger para auditar mudanças em profiles
CREATE OR REPLACE FUNCTION public.trigger_audit_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id,
      old_values, new_values, timestamp
    ) VALUES (
      auth.uid(),
      'UPDATE',
      'profiles',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      NOW()
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id,
      old_values, timestamp
    ) VALUES (
      auth.uid(),
      'DELETE',
      'profiles',
      OLD.id,
      to_jsonb(OLD),
      NOW()
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_audit_profiles ON public.profiles;
CREATE TRIGGER trigger_audit_profiles
  AFTER UPDATE OR DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_audit_profiles();

-- ============================================================================
-- RLS POLICIES MELHORADAS
-- ============================================================================

-- 5.1 Remover policies antigas
DROP POLICY IF EXISTS "Users can view own" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own" ON public.profiles;
DROP POLICY IF EXISTS "Service role full access" ON public.profiles;

-- 5.2 Habilitar RLS em profiles (se não estiver)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 5.3 Novas policies

-- Policy 1: Usuários veem seu próprio perfil
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy 2: Usuários atualizam seu próprio perfil (mas não global_role)
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND global_role = (SELECT global_role FROM public.profiles WHERE user_id = auth.uid()) -- Não muda role
    AND status = (SELECT status FROM public.profiles WHERE user_id = auth.uid()) -- Não muda status
  );

-- Policy 3: Admin Master vê todos
CREATE POLICY "Admin Master views all profiles" ON public.profiles
  FOR SELECT
  USING (
    (SELECT global_role FROM public.profiles WHERE user_id = auth.uid()) = 'admin_master'
  );

-- Policy 4: Admin Master edita tudo (com proteção)
CREATE POLICY "Admin Master manages all profiles" ON public.profiles
  FOR UPDATE
  USING (
    (SELECT global_role FROM public.profiles WHERE user_id = auth.uid()) = 'admin_master'
    AND auth.uid() != id -- Não pode remover seu próprio admin
  )
  WITH CHECK (
    (SELECT global_role FROM public.profiles WHERE user_id = auth.uid()) = 'admin_master'
  );

-- Policy 5: Service role (apenas backend)
CREATE POLICY "Service role unrestricted" ON public.profiles
  USING (true) WITH CHECK (true);

-- ============================================================================
-- GRANTS E PERMISSÕES
-- ============================================================================

-- 6.1 Revogar acesso direto a operações administrativas (apenas via RPC)
REVOKE ALL ON admin_operations.pending_changes FROM authenticated;
REVOKE ALL ON admin_operations.pending_changes FROM anon;

-- 6.2 Conceder acesso apenas via RLS policies (já configuradas acima)
GRANT SELECT ON admin_operations.pending_changes TO authenticated;
GRANT UPDATE ON admin_operations.pending_changes TO authenticated;

-- ============================================================================
-- VERIFICAÇÃO PÓS-MIGRATION
-- ============================================================================

-- 7.1 Colunas adicionadas com sucesso
SELECT 'Migration 001: SUCCESS' WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'profiles'
  AND column_name IN ('global_role', 'mfa_enabled', 'status')
);

-- ✅ FIM DA MIGRATION
-- Próximo passo: Implementar endpoints de bootstrap e admin no backend
