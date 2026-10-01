"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PrefeituraHeaderProps {
  userName?: string;
  userRole?: string;
  onLogout?: () => void;
}

export default function PrefeituraHeader({
  userName = "Usuário",
  userRole = "Admin",
  onLogout,
}: PrefeituraHeaderProps) {
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem("prefeitura_session");
      router.push("/login");
    }
  };

  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center justify-between px-8 py-4 gap-6">
        {/* Search Bar */}
        <div className="flex-1 max-w-xl">
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar por solicitações, notas, contratos, fornecedores..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-3 pl-11 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition"
            />
            <span className="absolute left-4 top-3.5 text-gray-400">🔍</span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-6">
          {/* Icons */}
          <button className="text-gray-500 hover:text-gray-700 text-lg transition" title="Horário">
            🕐
          </button>
          <button className="text-gray-500 hover:text-gray-700 text-lg transition" title="Telefone">
            ☎️
          </button>
          <button className="text-gray-500 hover:text-gray-700 text-lg transition relative" title="Notificações">
            🔔
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-200"></div>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-3 hover:opacity-80 transition"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-sm">
                {userInitial}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-semibold text-gray-900">{userName}</p>
                <p className="text-xs text-gray-500">{userRole}</p>
              </div>
              <span className="text-gray-400">▼</span>
            </button>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2">
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    router.push("/prefeituras/[id]/configuracoes");
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition"
                >
                  ⚙️ Configurações
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    handleLogout();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition border-t border-gray-200"
                >
                  🚪 Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
