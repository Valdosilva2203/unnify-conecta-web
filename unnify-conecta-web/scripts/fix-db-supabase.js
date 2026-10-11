const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://bvwfoafkqjquxcbijffj.supabase.co',
  'sb_secret_IE2ixB_BfCw8LCbDN22d7Q_5oRjAajW'
);

const sqlStatements = [
  'DROP TABLE IF EXISTS public.profiles CASCADE',
  'DROP TYPE IF EXISTS public.global_role CASCADE',
  "CREATE TYPE public.funcao_global AS ENUM ('admin_master', 'admin', 'user')",
  `CREATE TABLE IF NOT EXISTS public.perfis (
    id_usuario UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    nome_completo TEXT,
    funcao_global public.funcao_global NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )`,
  'ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY',
  `CREATE POLICY IF NOT EXISTS "Users can read own perfil"
    ON public.perfis FOR SELECT TO authenticated
    USING (auth.uid() = id_usuario)`,
  `CREATE POLICY IF NOT EXISTS "Service role bypass"
    ON public.perfis FOR ALL TO service_role
    USING (true) WITH CHECK (true)`,
  'DROP FUNCTION IF EXISTS public.handle_new_user()',
  `CREATE FUNCTION public.handle_new_user()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO public.perfis (id_usuario, funcao_global, nome_completo, email, status)
      VALUES (
        NEW.id,
        'user',
        COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email),
        NEW.email,
        'active'
      )
      ON CONFLICT (id_usuario) DO NOTHING;
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`,
  'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users',
  `CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user()`,
  'GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role',
  'GRANT INSERT ON public.perfis TO service_role'
];

(async () => {
  try {
    console.log('🚀 Executando migrations via Supabase RPC...\n');

    for (const sql of sqlStatements) {
      try {
        const { data, error } = await supabase.rpc('sql_query', { query: sql });

        if (error) {
          console.log(`⚠️  ${sql.substring(0, 50)}... - ${error.message}`);
        } else {
          console.log(`✅ ${sql.substring(0, 50)}...`);
        }
      } catch (err) {
        console.log(`⚠️  ${sql.substring(0, 50)}... - ${err.message}`);
      }
    }

    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
})();
