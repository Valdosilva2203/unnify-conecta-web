"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface FornecedorTopNavBarProps {
  userName: string;
  prefeituraName?: string;
  prefeituraEstado?: string;
  onMenuToggle?: () => void;
  onLogout?: () => void;
}

export default function FornecedorTopNavBar({
  userName,
  prefeituraName,
  prefeituraEstado,
  onMenuToggle,
  onLogout,
}: FornecedorTopNavBarProps) {
  const router = useRouter();
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuAberto(false);
      }
    };

    if (menuAberto) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [menuAberto]);

  const handleLogout = () => {
    setMenuAberto(false);
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem("fornecedor_session");
      router.push("/login");
    }
  };

  const handleNavigate = (path: string) => {
    setMenuAberto(false);
    router.push(path);
  };

  return (
    <div className="bg-white shadow px-8 py-4 flex justify-between items-center">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Bem-vindo, {userName}!</h1>
        {prefeituraName && (
          <p className="text-gray-600 mt-1">
            {prefeituraName} {prefeituraEstado ? `- ${prefeituraEstado}` : ""}
          </p>
        )}
      </div>

      <div className="flex items-center gap-4" ref={menuRef}>
        <div className="relative">
          <button
            onClick={() => setMenuAberto(!menuAberto)}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white font-bold text-lg hover:shadow-md transition flex items-center justify-center"
            title="Menu do perfil"
          >
            👤
          </button>

          {menuAberto && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50">
              <button
                onClick={() => handleNavigate("/fornecedor/minha-conta")}
                className="w-full px-4 py-3 text-left hover:bg-gray-100 transition font-medium text-gray-900 flex items-center gap-3"
              >
                <span className="text-lg">👤</span>
                Minha Conta
              </button>

              <button
                onClick={() => handleNavigate("/fornecedor/dashboard")}
                className="w-full px-4 py-3 text-left hover:bg-gray-100 transition font-medium text-gray-900 flex items-center gap-3"
              >
                <span className="text-lg">📊</span>
                Dashboard
              </button>

              <button
                onClick={() => handleNavigate("/fornecedor/prefeituras")}
                className="w-full px-4 py-3 text-left hover:bg-gray-100 transition font-medium text-gray-900 flex items-center gap-3"
              >
                <span className="text-lg">🏛️</span>
                Prefeituras
              </button>

              <div className="border-t border-gray-200 my-2"></div>

              <button
                onClick={handleLogout}
                className="w-full px-4 py-3 text-left hover:bg-red-50 transition font-medium text-red-700 flex items-center gap-3"
              >
                <span className="text-lg">🚪</span>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
