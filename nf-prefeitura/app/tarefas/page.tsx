"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TopNavBar from "@/components/TopNavBar";
import ProtectedRoute from "@/components/ProtectedRoute";

interface Tarefa {
  id: string;
  titulo: string;
  status: "pendente" | "em_andamento" | "concluida" | "cancelada";
  prioridade: "urgente" | "normal" | "baixa";
  data_vencimento: string;
  responsavel: string;
}

function TarefasContent() {
  const router = useRouter();
  const [tarefas, setTarefas] = useState<Tarefa[]>([
    {
      id: "1",
      titulo: "Validar notas fiscais pendentes",
      status: "pendente",
      prioridade: "urgente",
      data_vencimento: "2026-09-24",
      responsavel: "João Silva",
    },
    {
      id: "2",
      titulo: "Atualizar dados de fornecedores",
      status: "em_andamento",
      prioridade: "normal",
      data_vencimento: "2026-09-26",
      responsavel: "Maria Santos",
    },
    {
      id: "3",
      titulo: "Processar requisições",
      status: "pendente",
      prioridade: "normal",
      data_vencimento: "2026-09-25",
      responsavel: "Pedro Costa",
    },
  ]);

  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [editingId, setEditingId] = useState<string | null>(null);

  const tarefasFiltradas = tarefas.filter((tarefa) => {
    return filtroStatus === "todos" || tarefa.status === filtroStatus;
  });

  const stats = [
    {
      titulo: "Total de Tarefas",
      valor: tarefas.length,
      icone: "📋",
      cor: "from-blue-500 to-blue-600",
    },
    {
      titulo: "Concluídas",
      valor: tarefas.filter((t) => t.status === "concluida").length,
      icone: "✓",
      cor: "from-green-500 to-green-600",
    },
    {
      titulo: "Em Andamento",
      valor: tarefas.filter((t) => t.status === "em_andamento").length,
      icone: "⚡",
      cor: "from-purple-500 to-purple-600",
    },
    {
      titulo: "Urgentes",
      valor: tarefas.filter((t) => t.prioridade === "urgente").length,
      icone: "🔴",
      cor: "from-red-500 to-red-600",
    },
  ];

  const handleDeleteTarefa = (id: string) => {
    setTarefas(tarefas.filter((t) => t.id !== id));
  };

  const handleStatusChange = (id: string, novoStatus: Tarefa["status"]) => {
    setTarefas(
      tarefas.map((t) => (t.id === id ? { ...t, status: novoStatus } : t))
    );
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pendente: "Pendente",
      em_andamento: "Em Andamento",
      concluida: "Concluída",
      cancelada: "Cancelada",
    };
    return labels[status] || status;
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "pendente":
        return "text-orange-600";
      case "em_andamento":
        return "text-blue-600";
      case "concluida":
        return "text-green-600";
      case "cancelada":
        return "text-gray-600";
      default:
        return "text-gray-600";
    }
  };

  const getPrioridadeLabel = (prioridade: string) => {
    const labels: Record<string, string> = {
      urgente: "Urgente",
      normal: "Normal",
      baixa: "Baixa",
    };
    return labels[prioridade] || prioridade;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNavBar
        title="Tarefas"
        subtitle="Gerencie todas as tarefas do sistema"
        tabs={[{ id: "tarefas", label: "Tarefas" }]}
        activeTab="tarefas"
        onTabChange={() => {}}
        onExport={() => console.log("Exportando...")}
        userName="Usuário"
        userRole="Master"
      />

      <div className="p-8">
        {/* Cards de Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <div
              key={index}
              className={`bg-gradient-to-br ${stat.cor} rounded-2xl shadow-lg p-6 text-white overflow-hidden relative`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-sm font-medium opacity-90">{stat.titulo}</p>
                  <p className="text-4xl font-bold mt-2">{stat.valor}</p>
                </div>
                <span className="text-5xl opacity-30">{stat.icone}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Filtro e Título */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Tarefas</h2>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="todos">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="em_andamento">Em Andamento</option>
            <option value="concluida">Concluída</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>

        {/* Lista de Tarefas */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {tarefasFiltradas.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-600 text-lg">Nenhuma tarefa encontrada</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {/* Cabeçalho */}
              <div className="px-6 py-4 bg-gray-50 grid grid-cols-12 gap-4 font-semibold text-sm text-gray-700">
                <div className="col-span-5">Tarefa</div>
                <div className="col-span-2">Responsável</div>
                <div className="col-span-2">Vencimento</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-1">Ação</div>
              </div>

              {/* Linhas */}
              {tarefasFiltradas.map((tarefa) => (
                <div
                  key={tarefa.id}
                  className="px-6 py-4 hover:bg-gray-50 transition grid grid-cols-12 gap-4 items-center"
                >
                  <div className="col-span-5">
                    <h3 className="font-semibold text-gray-900">
                      {tarefa.titulo}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {getPrioridadeLabel(tarefa.prioridade)}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-gray-900">{tarefa.responsavel}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-gray-900">{tarefa.data_vencimento}</p>
                  </div>
                  <div className="col-span-2">
                    <span className={`text-sm font-semibold ${getStatusBadgeColor(tarefa.status)}`}>
                      {getStatusLabel(tarefa.status)}
                    </span>
                  </div>
                  <div className="col-span-1 flex gap-2">
                    <button
                      onClick={() => handleDeleteTarefa(tarefa.id)}
                      className="text-gray-400 hover:text-red-600 transition"
                    >
                      ⋯
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Tarefas() {
  return (
    <ProtectedRoute>
      <TarefasContent />
    </ProtectedRoute>
  );
}
