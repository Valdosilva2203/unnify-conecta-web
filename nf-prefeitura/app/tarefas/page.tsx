"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import TopNavBar from "@/components/TopNavBar";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";

interface Tarefa {
  id: string;
  titulo: string;
  status: "pendente" | "em_andamento" | "concluida" | "cancelada";
  prioridade: "urgente" | "normal" | "baixa";
  data_vencimento: string;
  responsavel: string;
  created_at?: string;
}

function TarefasContent() {
  const router = useRouter();
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);

  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [busca, setBusca] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    titulo: "",
    prioridade: "normal" as const,
    data_vencimento: "",
    responsavel: "",
  });

  useEffect(() => {
    loadTarefas();
  }, []);

  const loadTarefas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tarefas")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTarefas(data || []);
    } catch (error) {
      console.error("Erro ao carregar tarefas:", error);
    } finally {
      setLoading(false);
    }
  };

  const tarefasFiltradas = tarefas.filter((tarefa) => {
    const statusMatch = filtroStatus === "todos" || tarefa.status === filtroStatus;
    const buscaMatch = tarefa.titulo.toLowerCase().includes(busca.toLowerCase());
    return statusMatch && buscaMatch;
  });

  const handleAddTarefa = () => {
    setEditingId(null);
    setFormData({
      titulo: "",
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
      prioridade: tarefa.prioridade,
      data_vencimento: tarefa.data_vencimento,
      responsavel: tarefa.responsavel,
    });
    setIsModalOpen(true);
  };

  const handleSaveTarefa = async () => {
    if (!formData.titulo.trim()) return;

    try {
      setIsSaving(true);

      if (editingId) {
        const { error } = await supabase
          .from("tarefas")
          .update({
            titulo: formData.titulo,
            prioridade: formData.prioridade,
            data_vencimento: formData.data_vencimento,
            responsavel: formData.responsavel,
          })
          .eq("id", editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("tarefas").insert({
          titulo: formData.titulo,
          prioridade: formData.prioridade,
          data_vencimento: formData.data_vencimento,
          responsavel: formData.responsavel,
          status: "pendente",
        });

        if (error) throw error;
      }

      await loadTarefas();
      setIsModalOpen(false);
    } catch (error) {
      console.error("Erro ao salvar tarefa:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalizarTarefa = async (id: string) => {
    try {
      const { error } = await supabase
        .from("tarefas")
        .update({ status: "concluida" })
        .eq("id", id);

      if (error) throw error;
      await loadTarefas();
    } catch (error) {
      console.error("Erro ao finalizar tarefa:", error);
    }
  };

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

  const handleDeleteTarefa = async (id: string) => {
    try {
      const { error } = await supabase
        .from("tarefas")
        .delete()
        .eq("id", id);

      if (error) throw error;
      await loadTarefas();
    } catch (error) {
      console.error("Erro ao deletar tarefa:", error);
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

        {/* Header com Busca e Filtros */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Tarefas</h2>
            <button
              onClick={handleAddTarefa}
              className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition flex items-center gap-2"
            >
              <span>+</span> Nova Tarefa
            </button>
          </div>

          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="Buscar por nome da tarefa..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
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
        </div>

        {/* Lista de Tarefas */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {loading ? (
            <div className="p-12 text-center">
              <p className="text-gray-600 text-lg">Carregando tarefas...</p>
            </div>
          ) : tarefasFiltradas.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-600 text-lg">Nenhuma tarefa encontrada</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {/* Cabeçalho */}
              <div className="px-6 py-4 bg-gray-50 grid grid-cols-10 gap-4 font-semibold text-sm text-gray-700">
                <div className="col-span-4">Tarefa</div>
                <div className="col-span-2">Responsável</div>
                <div className="col-span-2">Vencimento</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-1">Ação</div>
              </div>

              {/* Linhas */}
              {tarefasFiltradas.map((tarefa) => (
                <div
                  key={tarefa.id}
                  className="px-6 py-4 hover:bg-gray-50 transition grid grid-cols-10 gap-4 items-start"
                >
                  <div className="col-span-4">
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
                  <div className="col-span-1">
                    <span className={`text-sm font-semibold ${getStatusBadgeColor(tarefa.status)}`}>
                      {getStatusLabel(tarefa.status)}
                    </span>
                  </div>
                  <div className="col-span-1 flex justify-center items-center relative">
                    <button
                      onClick={() => setMenuAberto(menuAberto === tarefa.id ? null : tarefa.id)}
                      className="text-gray-400 hover:text-gray-600 text-lg leading-none transition"
                      title="Opções"
                    >
                      ⋯
                    </button>

                    {menuAberto === tarefa.id && (
                      <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-40">
                        <button
                          onClick={() => {
                            handleEditTarefa(tarefa);
                            setMenuAberto(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 border-b border-gray-100 font-medium transition"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => {
                            handleFinalizarTarefa(tarefa.id);
                            setMenuAberto(null);
                          }}
                          disabled={tarefa.status === "concluida"}
                          className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-green-50 border-b border-gray-100 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ✓ Finalizar
                        </button>
                        <button
                          onClick={() => {
                            handleDeleteTarefa(tarefa.id);
                            setMenuAberto(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-medium transition"
                        >
                          🗑️ Deletar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Criar/Editar Tarefa */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6">
              {editingId ? "Editar Tarefa" : "Nova Tarefa"}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Título da Tarefa
                </label>
                <input
                  type="text"
                  value={formData.titulo}
                  onChange={(e) =>
                    setFormData({ ...formData, titulo: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Validar notas fiscais"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="urgente">Urgente</option>
                    <option value="normal">Normal</option>
                    <option value="baixa">Baixa</option>
                  </select>
                </div>

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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nome do responsável"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveTarefa}
                disabled={isSaving}
                className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition font-medium disabled:opacity-50"
              >
                {isSaving ? "Salvando..." : editingId ? "Atualizar" : "Criar"} Tarefa
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
