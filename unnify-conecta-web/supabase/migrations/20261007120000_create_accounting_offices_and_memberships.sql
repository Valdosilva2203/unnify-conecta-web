-- Create accounting_offices table
CREATE TABLE public.accounting_offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  cnpj TEXT NOT NULL UNIQUE,
  phone TEXT,
  commercial_email TEXT NOT NULL,
  city TEXT NOT NULL,
  state VARCHAR(2) NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT valid_cnpj CHECK (cnpj ~ '^\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}$'),
  CONSTRAINT valid_state CHECK (state IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  CONSTRAINT valid_email CHECK (commercial_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);

-- Create user_accounting_office_memberships table
CREATE TABLE public.user_accounting_office_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accounting_office_id UUID NOT NULL REFERENCES public.accounting_offices(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_user_office_membership UNIQUE (user_id, accounting_office_id),
  CONSTRAINT valid_role CHECK (role IN ('owner', 'member', 'viewer'))
);

-- Enable RLS
ALTER TABLE public.accounting_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_accounting_office_memberships ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view accounting offices they belong to
CREATE POLICY "Users can view accounting offices they belong to"
  ON public.accounting_offices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_accounting_office_memberships
      WHERE accounting_office_id = accounting_offices.id
      AND user_id = auth.uid()
    )
  );

-- RLS Policy: Only owners can update accounting offices
CREATE POLICY "Only owners can update accounting offices"
  ON public.accounting_offices
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- RLS Policy: Only owners can delete accounting offices
CREATE POLICY "Only owners can delete accounting offices"
  ON public.accounting_offices
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- RLS Policy: Service role bypass for accounting_offices
CREATE POLICY "Service role bypass on accounting_offices"
  ON public.accounting_offices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policy: Users can view own memberships
CREATE POLICY "Users can view own memberships"
  ON public.user_accounting_office_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policy: Service role bypass for memberships
CREATE POLICY "Service role bypass on memberships"
  ON public.user_accounting_office_memberships
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to create accounting office with owner membership
CREATE FUNCTION public.create_accounting_office_with_owner_membership(
  p_legal_name TEXT,
  p_trade_name TEXT,
  p_cnpj TEXT,
  p_phone TEXT,
  p_commercial_email TEXT,
  p_city TEXT,
  p_state VARCHAR(2)
)
RETURNS TABLE (
  office_id UUID,
  membership_id UUID,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_office_id UUID;
  v_membership_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT null::UUID, null::UUID, false, 'Usuário não autenticado'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.accounting_offices WHERE cnpj = p_cnpj) THEN
    RETURN QUERY SELECT null::UUID, null::UUID, false, 'CNPJ já cadastrado'::TEXT;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.accounting_offices (
      legal_name, trade_name, cnpj, phone,
      commercial_email, city, state, created_by
    ) VALUES (
      p_legal_name, p_trade_name, p_cnpj, p_phone,
      p_commercial_email, p_city, p_state, v_user_id
    )
    RETURNING id INTO v_office_id;

    INSERT INTO public.user_accounting_office_memberships (
      user_id, accounting_office_id, role
    ) VALUES (
      v_user_id, v_office_id, 'owner'
    )
    RETURNING id INTO v_membership_id;

    RETURN QUERY SELECT v_office_id, v_membership_id, true, 'Escritório criado com sucesso'::TEXT;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN QUERY SELECT null::UUID, null::UUID, false, 'CNPJ já cadastrado'::TEXT;
    WHEN check_violation THEN
      RETURN QUERY SELECT null::UUID, null::UUID, false, 'Dados inválidos'::TEXT;
    WHEN OTHERS THEN
      RETURN QUERY SELECT null::UUID, null::UUID, false, 'Erro ao criar escritório. Tente novamente.'::TEXT;
  END;
END;
$$;

-- Indexes for performance
CREATE INDEX idx_user_accounting_office_memberships_user_id
  ON public.user_accounting_office_memberships(user_id);
CREATE INDEX idx_user_accounting_office_memberships_accounting_office_id
  ON public.user_accounting_office_memberships(accounting_office_id);
CREATE INDEX idx_accounting_offices_created_by
  ON public.accounting_offices(created_by);
