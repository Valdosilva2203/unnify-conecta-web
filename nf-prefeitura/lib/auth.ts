import { supabase } from "./supabase";

export interface Admin {
  id: string;
  email: string;
  nome: string;
  ativo: boolean;
  created_at: string;
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function cadastroAdmin(
  email: string,
  nome: string,
  senha: string
): Promise<{ sucesso: boolean; erro?: string; admin?: Admin }> {
  try {
    // Normalizar email e senha
    const emailNormalizado = email.toLowerCase().trim();
    const senhaTrimmed = senha.trim();

    // Verificar se email já existe
    const { data: existente } = await supabase
      .from("admins")
      .select("id")
      .eq("email", emailNormalizado)
      .single();

    if (existente) {
      return { sucesso: false, erro: "Email já cadastrado" };
    }

    // Hash da senha
    const senhaHash = await hashPassword(senhaTrimmed);

    // Inserir admin
    const { data, error } = await supabase
      .from("admins")
      .insert([
        {
          email: emailNormalizado,
          nome,
          senha_hash: senhaHash,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Salvar no localStorage
    localStorage.setItem(
      "admin_session",
      JSON.stringify({
        id: data.id,
        email: data.email,
        nome: data.nome,
      })
    );

    return {
      sucesso: true,
      admin: data,
    };
  } catch (error) {
    console.error("Erro ao cadastrar admin:", error);
    return { sucesso: false, erro: "Erro ao cadastrar" };
  }
}

export async function loginAdmin(
  email: string,
  senha: string
): Promise<{ sucesso: boolean; erro?: string; admin?: Admin }> {
  try {
    // Normalizar email e senha
    const emailNormalizado = email.toLowerCase().trim();
    const senhaTrimmed = senha.trim();

    // Buscar admin
    const { data, error } = await supabase
      .from("admins")
      .select("*")
      .eq("email", emailNormalizado)
      .single();

    if (error || !data) {
      return { sucesso: false, erro: "Email ou senha inválidos" };
    }

    // Validar senha
    const senhaHash = await hashPassword(senhaTrimmed);
    if (senhaHash !== data.senha_hash) {
      return { sucesso: false, erro: "Email ou senha inválidos" };
    }

    if (!data.ativo) {
      return { sucesso: false, erro: "Admin inativo" };
    }

    return {
      sucesso: true,
      admin: data,
    };
  } catch (error) {
    console.error("Erro ao fazer login:", error);
    return { sucesso: false, erro: "Erro ao fazer login" };
  }
}

export function getSession(): Admin | null {
  if (typeof window === "undefined") return null;

  const session = localStorage.getItem("admin_session");
  return session ? JSON.parse(session) : null;
}

export function logout(): void {
  localStorage.removeItem("admin_session");
}

export function isAuthenticated(): boolean {
  // Verificar tanto admin_session quanto prefeitura_session (para admin via prefeitura_users)
  const adminSession = getSession();
  const prefeituraSession = typeof window !== "undefined" ? localStorage.getItem("prefeitura_session") : null;
  return adminSession !== null || prefeituraSession !== null;
}

export async function adminJaExiste(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("admins")
      .select("id")
      .limit(1);

    if (error) return false;
    return data && data.length > 0;
  } catch (error) {
    return false;
  }
}
