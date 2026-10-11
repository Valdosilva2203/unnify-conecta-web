-- Add tipo_empresa to empresas table
ALTER TABLE public.empresas
ADD COLUMN tipo_empresa TEXT NOT NULL DEFAULT 'comum'
CHECK (tipo_empresa IN ('comum', 'escritorio_contabil'));

-- Create usuarios_empresas table (many-to-many relationship)
CREATE TABLE public.usuarios_empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario UUID NOT NULL REFERENCES public.perfis(id_usuario) ON DELETE CASCADE,
  id_empresa UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo_vinculacao TEXT NOT NULL DEFAULT 'dono'
    CHECK (tipo_vinculacao IN ('dono', 'socio', 'contador', 'representante')),
  data_vinculacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ativo BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(id_usuario, id_empresa)
);

-- Create indexes for common queries
CREATE INDEX idx_usuarios_empresas_usuario ON public.usuarios_empresas(id_usuario);
CREATE INDEX idx_usuarios_empresas_empresa ON public.usuarios_empresas(id_empresa);
CREATE INDEX idx_usuarios_empresas_tipo ON public.usuarios_empresas(tipo_vinculacao);

-- Enable RLS
ALTER TABLE public.usuarios_empresas ENABLE ROW LEVEL SECURITY;

-- RLS Policies for usuarios_empresas
CREATE POLICY "Users can view their own company relationships" ON public.usuarios_empresas
  FOR SELECT
  USING (id_usuario = auth.uid() OR EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue2
    WHERE ue2.id_empresa = usuarios_empresas.id_empresa
    AND ue2.id_usuario = auth.uid()
  ));

CREATE POLICY "Users can insert their own relationships (via trigger/function)" ON public.usuarios_empresas
  FOR INSERT
  WITH CHECK (id_usuario = auth.uid() OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can update their own relationships" ON public.usuarios_empresas
  FOR UPDATE
  USING (id_usuario = auth.uid());

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.usuarios_empresas TO authenticated, anon, service_role;
