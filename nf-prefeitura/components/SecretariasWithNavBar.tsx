"use client";

import { useState } from "react";
import TopNavBar from "./TopNavBar";
import { FileText, Clock, Calendar } from "lucide-react";

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export default function SecretariasWithNavBar({ children }: { children?: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState("tudo");
  const [dateRange, setDateRange] = useState({
    start: "01 de set.",
    end: "31 de dez.",
  });

  const tabs: Tab[] = [
    { id: "tudo", label: "Tudo" },
    { id: "ativas", label: "Ativas", icon: <Clock size={16} /> },
    { id: "inativas", label: "Inativas" },
    { id: "recentes", label: "Recentes", icon: <Calendar size={16} /> },
    { id: "todas", label: "Todas" },
  ];

  const handleExport = () => {
    console.log("Exportando dados...");
    // Implementar lógica de exportação
  };

  return (
    <>
      <TopNavBar
        title="Secretarias"
        subtitle="Gerenciar secretarias da prefeitura"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        dateRange={dateRange}
        onExport={handleExport}
        userName="João Silva"
        userRole="Administrador"
      />

      {/* Conteúdo abaixo do NavBar */}
      <div className="p-8">
        {children}
      </div>
    </>
  );
}
