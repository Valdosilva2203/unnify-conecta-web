"use client";

import { useRouter } from "next/navigation";

interface FornecedorSidebarProps {
  menuAberto: boolean;
  onToggleMenu: () => void;
  currentPage?: "dashboard" | "requisicoes" | "prefeituras";
  onLogout?: () => void;
}

export default function FornecedorSidebar({
  menuAberto,
  onToggleMenu,
  currentPage = "dashboard",
  onLogout,
}: FornecedorSidebarProps) {
  const router = useRouter();

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem("fornecedor_session");
      router.push("/login");
    }
  };

  const menuItems = [
    { id: "prefeituras", icon: "🏛️", label: "Minhas Prefeituras", path: "/fornecedor/prefeituras" },
    { id: "dashboard", icon: "📊", label: "Dashboard", path: "/fornecedor/dashboard" },
    { id: "requisicoes", icon: "📋", label: "Requisições", path: "/fornecedor/requisicoes" },
  ];

  return (
    <div
      className={`${
        menuAberto ? "w-64" : "w-20"
      } bg-white text-gray-900 border-r border-gray-200 transition-all duration-300 flex flex-col shadow-sm`}
    >
      {/* Logo */}
      <div className="p-6 flex items-center justify-between">
        <div className={`flex items-center gap-2 ${!menuAberto && "justify-center w-full"}`}>
          <span className="text-3xl">📦</span>
          {menuAberto && <span className="text-xl font-bold">Unnify</span>}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        <div className={menuAberto ? "text-xs font-bold text-gray-600 uppercase mb-4" : "hidden"}>
          Menu
        </div>

        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => router.push(item.path)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
              currentPage === item.id
                ? "bg-gray-100 hover:bg-gray-200 text-gray-900"
                : "hover:bg-gray-100 text-gray-900"
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            {menuAberto && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 space-y-2 border-t border-gray-200">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-100 text-red-700 transition text-sm font-medium text-left"
        >
          <span className="text-xl">🚪</span>
          {menuAberto && <span>Sair</span>}
        </button>
      </div>
    </div>
  );
}
