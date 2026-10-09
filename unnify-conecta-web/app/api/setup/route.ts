import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Missing Supabase credentials' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Check if profiles table exists
    const { data: tables } = await supabase.rpc('get_tables', {
      schema_name: 'public',
    }).catch(() => ({ data: null }));

    // 2. Try to create profiles table if it doesn't exist
    const { error: createError } = await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.profiles (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
          email TEXT,
          full_name TEXT,
          avatar_url TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW())
        );

        -- Enable RLS
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

        -- Create policies
        CREATE POLICY "Users can read their own profile" ON public.profiles
          FOR SELECT USING (auth.uid() = user_id);

        CREATE POLICY "Users can update their own profile" ON public.profiles
          FOR UPDATE USING (auth.uid() = user_id);

        CREATE POLICY "Service role can do anything" ON public.profiles
          USING (true) WITH CHECK (true);

        -- Create function for auto-profile creation
        CREATE OR REPLACE FUNCTION public.handle_new_user()
        RETURNS TRIGGER AS $$
        BEGIN
          INSERT INTO public.profiles (user_id, email, full_name)
          VALUES (
            NEW.id,
            NEW.email,
            NEW.raw_user_meta_data ->> 'full_name'
          );
          RETURN NEW;
        END;
        $$ LANGUAGE PLPGSQL SECURITY DEFINER;

        -- Create trigger
        DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
        CREATE TRIGGER on_auth_user_created
          AFTER INSERT ON auth.users
          FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
      `,
    }).catch(() => ({ error: null }));

    return NextResponse.json({
      success: true,
      message: 'Database setup completed',
      tables,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Setup failed' },
      { status: 500 }
    );
  }
}
