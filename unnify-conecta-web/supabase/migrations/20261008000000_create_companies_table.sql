-- Create companies table (separate from accounting_offices)
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CNPJ and basic info (from API or manual entry)
  cnpj TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  trade_name TEXT,

  -- Contact info (user provided)
  phone TEXT,
  commercial_email TEXT NOT NULL,

  -- Location (from API)
  city TEXT NOT NULL,
  state VARCHAR(2) NOT NULL,

  -- API metadata
  registration_status TEXT,  -- ATIVA, SUSPENSA, etc
  cnae_main TEXT,            -- Main activity classification

  -- Audit
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Validation constraints
  CONSTRAINT valid_cnpj CHECK (cnpj ~ '^\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}$'),
  CONSTRAINT valid_state CHECK (state IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  CONSTRAINT valid_email CHECK (commercial_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view companies they created
CREATE POLICY "Users can view own companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- RLS Policy: Users can update companies they created
CREATE POLICY "Users can update own companies"
  ON public.companies
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

-- RLS Policy: Users can delete companies they created
CREATE POLICY "Users can delete own companies"
  ON public.companies
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- RLS Policy: Service role bypass for admin operations
CREATE POLICY "Service role bypass on companies"
  ON public.companies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_companies_created_by ON public.companies(created_by);
CREATE INDEX idx_companies_cnpj ON public.companies(cnpj);
CREATE INDEX idx_companies_created_at ON public.companies(created_at DESC);
