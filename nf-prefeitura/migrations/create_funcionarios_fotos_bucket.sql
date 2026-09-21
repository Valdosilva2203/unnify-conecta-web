-- Criar bucket para fotos de funcionários no Supabase Storage
-- Executar via console SQL do Supabase

-- Criar o bucket (executar uma vez)
INSERT INTO storage.buckets (id, name, public)
VALUES ('funcionarios_fotos', 'funcionarios_fotos', true)
ON CONFLICT (id) DO NOTHING;

-- Política para permitir leitura pública
CREATE POLICY "Allow public read access on funcionarios_fotos"
ON storage.objects FOR SELECT
USING (bucket_id = 'funcionarios_fotos');

-- Política para permitir upload autenticado
CREATE POLICY "Allow authenticated upload on funcionarios_fotos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'funcionarios_fotos' AND auth.role() = 'authenticated_user');

-- Política para permitir atualização de próprios uploads
CREATE POLICY "Allow authenticated update on funcionarios_fotos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'funcionarios_fotos' AND auth.role() = 'authenticated_user');

-- Política para permitir delete de próprios uploads
CREATE POLICY "Allow authenticated delete on funcionarios_fotos"
ON storage.objects FOR DELETE
USING (bucket_id = 'funcionarios_fotos' AND auth.role() = 'authenticated_user');
