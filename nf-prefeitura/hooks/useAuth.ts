import { useState, useEffect } from "react";
import { getSession, logout, isAuthenticated } from "@/lib/auth";

export interface AuthSession {
  id: string;
  email: string;
  nome: string;
}

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const adminSession = getSession();

    if (adminSession) {
      setSession(adminSession);
    } else if (typeof window !== "undefined") {
      // Tentar carregar prefeitura_session como fallback
      const prefeituraSession = localStorage.getItem("prefeitura_session");
      if (prefeituraSession) {
        try {
          const parsed = JSON.parse(prefeituraSession);
          setSession(parsed);
        } catch (e) {
          setSession(null);
        }
      } else {
        setSession(null);
      }
    }

    setLoading(false);
  }, []);

  const handleLogout = () => {
    logout();
    localStorage.removeItem("prefeitura_session");
    setSession(null);
    window.location.href = "/auth";
  };

  return {
    session,
    loading,
    isAuthenticated: isAuthenticated(),
    logout: handleLogout,
  };
}
