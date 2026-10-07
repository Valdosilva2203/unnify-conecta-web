-- Create global_role enum
CREATE TYPE public.global_role AS ENUM ('admin_master', 'admin', 'user');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  global_role public.global_role NOT NULL DEFAULT 'user',
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- RLS Policy: Users cannot modify their own global_role
CREATE POLICY "Users cannot modify global_role"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (global_role = (SELECT global_role FROM public.profiles WHERE id = auth.uid()));

-- RLS Policy: Service role can do anything (for admin operations)
CREATE POLICY "Service role bypass"
  ON public.profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to create profile on user signup
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, global_role, full_name)
  VALUES (
    NEW.id,
    'user',
    COALESCE(NEW.user_metadata->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Comment for clarity
COMMENT ON COLUMN public.profiles.global_role IS 'Global platform role. admin_master and admin can only be set via database operations, never from frontend.';
