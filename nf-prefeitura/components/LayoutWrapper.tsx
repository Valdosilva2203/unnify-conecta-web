"use client";

import { ReactNode, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useSidebar } from "@/context/SidebarContext";
import { isAuthenticated } from "@/lib/auth";

interface LayoutWrapperProps {
  children: ReactNode;
  showSidebar?: boolean;
}

export default function LayoutWrapper({ children, showSidebar = true }: LayoutWrapperProps) {
  const [mounted, setMounted] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [isUserAuthenticated, setIsUserAuthenticated] = useState(false);
  const { isOpen } = useSidebar();

  useEffect(() => {
    // Verifica se existe sessão válida (master ou prefeitura)
    const prefeituraSession = localStorage.getItem("prefeitura_session");

    let userAuthenticated = false;
    let userMaster = false;

    // Se é master (usuário autenticado sem prefeitura_session)
    if (isAuthenticated()) {
      userAuthenticated = true;
      userMaster = true;
    }
    // Se existe prefeitura_session, é um usuário de prefeitura
    else if (prefeituraSession) {
      try {
        const session = JSON.parse(prefeituraSession);
        if (session.prefeitura_id && session.email) {
          userAuthenticated = true;
          userMaster = false;
        }
      } catch (error) {
        console.error("Erro ao verificar sessão:", error);
      }
    }

    setIsUserAuthenticated(userAuthenticated);
    setIsMaster(userMaster);
    setMounted(true);
  }, []);

  // Enquanto verifica, renderiza página vazia
  if (!mounted) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  // Se não está autenticado ou não é master, renderiza sem sidebar
  if (!isUserAuthenticated || !isMaster) {
    return <div className="w-full">{children}</div>;
  }

  // Se é master, renderiza com sidebar (se showSidebar for true)
  if (!showSidebar) {
    return <div className="w-full">{children}</div>;
  }

  const marginClass = isOpen ? "ml-64" : "ml-20";

  return (
    <div className="flex">
      <Sidebar />
      <div className={`${marginClass} w-full transition-all duration-300`}>
        {children}
      </div>
    </div>
  );
}
