import { useState, useEffect } from "react";

export interface PrefeituraSession {
  id: string;
  email: string;
  nome: string;
  prefeitura_id: string;
  role?: string;
  tipo?: string;
  cargo?: string;
  secretaria_id?: string | null;
}

export function usePrefeituraAuth() {
  const [session, setSession] = useState<PrefeituraSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = () => {
      // Procurar prefeitura_session (novo - admin via prefeitura_users)
      let sessionStr = localStorage.getItem("prefeitura_session");

      // Se não encontrar, procurar admin_session (antigo - admin via admins table)
      if (!sessionStr) {
        sessionStr = localStorage.getItem("admin_session");
      }

      if (sessionStr) {
        try {
          const parsed = JSON.parse(sessionStr);
          setSession(parsed);
        } catch (error) {
          console.error("Erro ao recuperar sessão:", error);
          localStorage.removeItem("prefeitura_session");
          localStorage.removeItem("admin_session");
        }
      }
      setLoading(false);
    };

    checkSession();
  }, []);

  const logout = () => {
    localStorage.removeItem("prefeitura_session");
    setSession(null);
  };

  return {
    session,
    loading,
    logout,
    isAuthenticated: !!session,
  };
}
