"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import TopNavBar from "@/components/TopNavBar";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";

interface Tarefa {
  id: string;
  titulo: string;
  descricao: string;
  status: "pendente" | "em_andamento" | "concluida" | "cancelada";
  prioridade: "urgente" | "normal" | "baixa";
  data_criacao: string;
  data_vencimento: string;
  responsavel: string;
}

function TarefasContent() {
  const router = useRouter();
  const [tarefas, setTarefas] = useState<Tarefa[]>([
    {
      id: "1",
      titulo: "Validar notas fiscais pendentes",
      descricao: "Revisar e validar 3 notas fiscais aguardando aprovação",
      status: "pendente",
      prioridade: "urgente",
      data_criacao: "2026-09-20",
      data_vencimento: "2026-09-24",
      responsavel: "João Silva",
    },
    {
      id: "2",
      titulo: "Atualizar dados de fornecedores",
      descricao: "Atualizar informações de 12 fornecedores",
      status: "em_andamento",
      prioridade: "normal",
      data_criacao: "2026-09-19",
      data_vencimento: "2026-09-26",
      responsavel: "Maria Santos",
    },
    {
      id: "3",
      titulo: "Processar requisições",
      descricao: "Processar 5 requisições em andamento",
      status: "pendente",
      prioridade: "normal",
      data_criacao: "2026-09-21",
      data_vencimento: "2026-09-25",
      responsavel: "Pedro Costa",
    },
  ]);

  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroPrioridade, setFiltroPrioridade] = useState<string>("todos");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    titulo: "",
    descricao: "",
    status: "pendente" as const,
    prioridade: "normal" as const,
    data_vencimento: "",
    responsavel: "",
  });

  const tarefasFiltradas = tarefas.filter((tarefa) => {
    const statusMatch = filtroStatus === "todos" || tarefa.status === filtroStatus;
    const prioridadeMatch =
      filtroPrioridade === "todos" || tarefa.prioridade === filtroPrioridade;
    return statusMatch && prioridadeMatch;
  });

  const handleAddTarefa = () => {
    setEditingId(null);
    setFormData({
      titulo: "",
      descricao: "",
      status: "pendente",
      prioridade: "normal",
      data_vencimento: "",
      responsavel: "",
    });
    setIsModalOpen(true);
  };

  const handleEditTarefa = (tarefa: Tarefa) => {
    setEditingId(tarefa.id);
    setFormData({
      titulo: tarefa.titulo,
      descricao: tarefa.descricao,
      status: tarefa.status,
      prioridade: tarefa.prioridade,
      data_vencimento: tarefa.data_vencimento,
      responsavel: tarefa.responsavel,
    });
    setIsModalOpen(true);
  };

  const handleSaveTarefa = () => {
    if (!formData.titulo.trim()) return;

    if (editingId) {
      setTarefas(
        tarefas.map((t) =>
          t.id === editingId
            ? {
                ...t,
                ...formData,
              }
            : t
        )
      );
    } else {
      const newTarefa: Tarefa = {
        id: Math.random().toString(),
        ...formData,
        data_criacao: new Date().toISOString().split("T")[0],
      };
      setTarefas([...tarefas, newTarefa]);
    }
    setIsModalOpen(false);
  };

  const handleDeleteTarefa = (id: string) => {
    setTarefas(tarefas.filter((t) => t.id !== id));
  };

  const handleStatusChange = (id: string, novoStatus: Tarefa["status"]) => {
    setTarefas(
      tarefas.map((t) => (t.id === id ? { ...t, status: novoStatus } : t))
    );
  };

  const getPrioridadeColor = (prioridade: string) => {
    switch (prioridade) {
      case "urgente":
        return "bg-red-100 text-red-700";
      case "normal":
        return "bg-yellow-100 text-yellow-700";
      case "baixa":
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pendente":
        return "bg-gray-100 text-gray-700";
      case "em_andamento":
        return "bg-blue-100 text-blue-700";
      case "concluida":
        return "bg-green-100 text-green-700";
      case "cancelada":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
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
        {/* Header com Botão */}
        <div className="mb-8 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">
            Tarefas ({tarefasFiltradas.length})
          </h2>
          <button
            onClick={handleAddTarefa}
            className="flex items-center gap-2 px-5 py-2.5 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition font-medium text-sm"
          >
            <span className="text-lg">+</span>
            Nova Tarefa
          </button>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="todos">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="em_andamento">Em Andamento</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prioridade
              </label>
              <select
                value={filtroPrioridade}
                onChange={(e) => setFiltroPrioridade(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="todos">Todos</option>
                <option value="urgente">Urgente</option>
                <option value="normal">Normal</option>
                <option value="baixa">Baixa</option>
              </select>
            </div>
          </div>
        </div>

        {/* Lista de Tarefas */}
        {tarefasFiltradas.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center border border-gray-200">
            <p className="text-gray-600 text-lg">Nenhuma tarefa encontrada</p>
            <p className="text-gray-500 mt-2">
              Crie uma nova tarefa para começar
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {tarefasFiltradas.map((tarefa) => (
              <div
                key={tarefa.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <input
                        type="checkbox"
                        checked={tarefa.status === "concluida"}
                        onChange={(e) =>
                          handleStatusChange(
                            tarefa.id,
                            e.target.checked ? "concluida" : "pendente"
                          )
                        }
                        className="w-5 h-5 text-indigo-600 rounded cursor-pointer"
                      />
                      <h3 className="text-lg font-semibold text-gray-900">
                        {tarefa.titulo}
                      </h3>
                    </div>
                    <p className="text-gray-600 mb-3 ml-8">{tarefa.descricao}</p>

                    <div className="flex flex-wrap items-center gap-3 ml-8">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                          tarefa.status
                        )}`}
                      >
                        {getStatusLabel(tarefa.status)}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${getPrioridadeColor(
                          tarefa.prioridade
                        )}`}
                      >
                        {getPrioridadeLabel(tarefa.prioridade)}
                      </span>
                      <span className="text-xs text-gray-500">
                        Venc: {tarefa.data_vencimento}
                      </span>
                      <span className="text-xs text-gray-500">
                        Responsável: {tarefa.responsavel}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditTarefa(tarefa)}
                      className="px-3 py-1 text-orange-600 hover:text-orange-700 border border-orange-600 hover:border-orange-700 rounded text-xs font-medium transition"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDeleteTarefa(tarefa.id)}
                      className="px-3 py-1 text-red-600 hover:text-red-700 border border-red-600 hover:border-red-700 rounded text-xs font-medium transition"
                    >
                      Deletar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {editingId ? "Editar Tarefa" : "Nova Tarefa"}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Título
                </label>
                <input
                  type="text"
                  value={formData.titulo}
                  onChange={(e) =>
                    setFormData({ ...formData, titulo: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Título da tarefa"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descrição
                </label>
                <textarea
                  value={formData.descricao}
                  onChange={(e) =>
                    setFormData({ ...formData, descricao: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="Descrição da tarefa"
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as Tarefa["status"],
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="pendente">Pendente</option>
                    <option value="em_andamento">Em Andamento</option>
                    <option value="concluida">Concluída</option>
                    <option value="cancelada">Cancelada</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prioridade
                  </label>
                  <select
                    value={formData.prioridade}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        prioridade: e.target.value as Tarefa["prioridade"],
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="urgente">Urgente</option>
                    <option value="normal">Normal</option>
                    <option value="baixa">Baixa</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data de Vencimento
                  </label>
                  <input
                    type="date"
                    value={formData.data_vencimento}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        data_vencimento: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Responsável
                  </label>
                  <input
                    type="text"
                    value={formData.responsavel}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        responsavel: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Nome do responsável"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveTarefa}
                className="px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition font-medium"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
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
