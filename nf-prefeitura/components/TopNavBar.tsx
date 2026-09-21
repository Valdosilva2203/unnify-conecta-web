"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Clock, Phone, Bell } from "lucide-react";

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface TopNavBarProps {
  title: string;
  subtitle: string;
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  dateRange?: { start: string; end: string };
  onDateChange?: (start: string, end: string) => void;
  onExport?: () => void;
  userName?: string;
  userRole?: string;
  logoUrl?: string;
}

export default function TopNavBar({
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  dateRange,
  onDateChange,
  onExport,
  userName = "USUÁRIO",
  userRole = "PERFIL",
  logoUrl,
}: TopNavBarProps) {
  const router = useRouter();
  const [showDatePicker, setShowDatePicker] = useState(false);

  return (
    <div className="w-full bg-white border-b border-gray-200 mb-6">
      {/* Header Superior */}
      <div className="px-8 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Logo da prefeitura"
                className="h-16 w-16 object-cover rounded-lg"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Ícones de ação */}
            <button className="text-gray-600 hover:text-gray-800 transition">
              <Clock size={20} />
            </button>
            <button className="text-gray-600 hover:text-gray-800 transition">
              <Phone size={20} />
            </button>
            <button className="text-gray-600 hover:text-gray-800 transition relative">
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-orange-500 rounded-full"></span>
            </button>

            {/* User Info */}
            <button
              onClick={() => router.push("/minha-conta")}
              className="flex items-center gap-3 pl-6 border-l border-gray-200 hover:opacity-80 transition"
            >
              <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold">
                {userName.charAt(0)}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-medium text-gray-900">{userName}</span>
                <span className="text-xs text-gray-600">{userRole}</span>
              </div>
              <ChevronDown size={16} className="text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Abas e Filtros */}
      <div className="px-8 py-4">
        <div className="flex items-center justify-between gap-6">
          {/* Abas */}
          <div className="flex items-center gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-4 py-2 rounded-full font-medium text-sm transition flex items-center gap-2 ${
                  activeTab === tab.id
                    ? "bg-orange-500 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Data e Exportar */}
          <div className="flex items-center gap-4">
            {dateRange && (
              <button
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                <span className="text-sm font-medium">
                  {dateRange.start} — {dateRange.end}
                </span>
              </button>
            )}

            {onExport && (
              <button
                onClick={onExport}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                <span className="text-sm">⬇</span>
                <span className="text-sm font-medium">Exportar</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
