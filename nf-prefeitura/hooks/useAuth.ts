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
    setSession(adminSession);
    setLoading(false);
  }, []);

  const handleLogout = () => {
    logout();
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
