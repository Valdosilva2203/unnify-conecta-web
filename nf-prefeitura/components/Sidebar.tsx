"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useSidebar } from "@/context/SidebarContext";

export default function Sidebar() {
  const { isOpen, setIsOpen } = useSidebar();
  const [showProfile, setShowProfile] = useState(false);
  const { session, logout } = useAuth();

  const menuItems = [
    { name: "Dashboard", icon: "📊", href: "/" },
    { name: "Prefeituras", icon: "🏛️", href: "/prefeituras" },
    { name: "Configurações", icon: "⚙️", href: "/config", action: () => setShowProfile(!showProfile) },
  ];

  return (
    <div
      className={`fixed left-0 top-0 h-screen bg-slate-900 text-white transition-all duration-300 ${
        isOpen ? "w-64" : "w-20"
      }`}
    >
      <div className="p-4 flex items-center justify-between">
        {isOpen && <h1 className="text-xl font-bold">NF Prefeitura</h1>}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-slate-800 rounded-lg transition"
        >
          {isOpen ? "❮" : "❯"}
        </button>
      </div>

      <nav className="mt-8 flex-1">
        {menuItems.map((item) => (
          <div key={item.name}>
            {item.action ? (
              <button
                onClick={item.action}
                className="w-full px-4 py-3 flex items-center gap-4 hover:bg-slate-800 transition cursor-pointer text-left"
              >
                <span className="text-xl">{item.icon}</span>
                {isOpen && <span>{item.name}</span>}
              </button>
            ) : (
              <Link href={item.href}>
                <div className="px-4 py-3 flex items-center gap-4 hover:bg-slate-800 transition cursor-pointer">
                  <span className="text-xl">{item.icon}</span>
                  {isOpen && <span>{item.name}</span>}
                </div>
              </Link>
            )}
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-700 p-4">
        {session && showProfile && (
          <div className="space-y-3 mb-3">
            <div className="px-2">
              {isOpen && (
                <div>
                  <p className="text-xs text-gray-400">Conectado como</p>
                  <p className="text-sm font-medium text-white truncate">
                    {session.nome}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {session.email}
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={logout}
              className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition text-sm font-medium"
            >
              {isOpen ? "Sair" : "⬅️"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
