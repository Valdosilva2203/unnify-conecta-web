"use client";

import { useEffect, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const checkAuth = () => {
      // Admin Master
      if (isAuthenticated()) {
        setIsAuthorized(true);
        return;
      }

      // Prefeito user
      const prefeituraSession = localStorage.getItem("prefeitura_session");
      if (prefeituraSession) {
        setIsAuthorized(true);
        return;
      }

      // Não autorizado
      router.push("/auth");
    };

    checkAuth();
  }, [router]);

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Redirecionando...</p>
      </div>
    );
  }

  return <>{children}</>;
}
