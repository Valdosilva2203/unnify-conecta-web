import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const getSupabaseAdmin = () => {
  return createClient(supabaseUrl, supabaseServiceKey);
};

export type Database = {
  public: {
    Tables: {
      prefeituras: {
        Row: {
          id: string;
          nome: string;
          cnpj: string;
          email: string;
          telefone: string;
          endereco: string;
          cidade: string;
          estado: string;
          status: "ativa" | "inativa";
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["prefeituras"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["prefeituras"]["Insert"]
        >;
      };
    };
  };
};
