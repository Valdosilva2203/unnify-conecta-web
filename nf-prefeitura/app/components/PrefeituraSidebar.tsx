"use client";

import { useRouter, useParams } from "next/navigation";
import Image from "next/image";

interface PrefeituraSidebarProps {
  prefeituraLogo?: string;
  prefeituraNome?: string;
  activeTab?: string;
}

export default function PrefeituraSidebar({
  prefeituraLogo,
  prefeituraNome = "Prefeitura",
  activeTab = "dashboard",
}: PrefeituraSidebarProps) {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const menuItems = [
    { id: "dashboard", icon: "🏠", label: "Dashboard", path: `/prefeituras/${id}` },
    { id: "solicitacoes", icon: "📋", label: "Solicitações", path: `/prefeituras/${id}?tab=solicitacoes` },
    { id: "resumo", icon: "📊", label: "Resumo", path: `/prefeituras/${id}?tab=resumo` },
    { id: "relatorios", icon: "📑", label: "Relatórios", path: `/prefeituras/${id}?tab=relatorios` },
  ];

  return (
    <aside className="w-64 bg-white border-r border-gray-200 fixed left-0 top-0 h-screen overflow-y-auto">
      {/* Logo e Nome */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          {prefeituraLogo ? (
            <div className="w-10 h-10 relative">
              <Image
                src={prefeituraLogo}
                alt="Logo"
                width={40}
                height={40}
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-lg">
              🏛️
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">
              Prefeitura Municipal
            </p>
            <p className="text-sm font-bold text-gray-900 truncate">{prefeituraNome}</p>
          </div>
        </div>
      </div>

      {/* Menu */}
      <nav className="p-4 space-y-2">
        <p className="text-xs font-bold text-gray-500 uppercase px-2 mb-4">Menu Principal</p>

        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => router.push(item.path)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              activeTab === item.id
                ? "bg-orange-500 text-white shadow-md"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-white">
        <p className="text-xs text-gray-500 text-center">
          © 2026 Unnify. Todos os direitos reservados.
        </p>
      </div>
    </aside>
  );
}
