"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { usePrefeituraAuth } from "@/hooks/usePrefeituraAuth";
import Card from "@/components/Card";
import TopNavBar from "@/components/TopNavBar";
import PrefeituraModal from "@/components/PrefeituraModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";

interface Prefeitura {
  id: string;
  nome: string;
  cnpj: string;
  email: string;
  telefone: string;
  endereco: string;
  cidade: string;
  estado: string;
  status: "ativa" | "inativa";
  created_at: string;
}

function DashboardContent() {
  const router = useRouter();
  const { session: prefeituraSession } = usePrefeituraAuth();
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [prefeituras, setPrefeituras] = useState<Prefeitura[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPrefeitura, setSelectedPrefeitura] = useState<Prefeitura | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    // Verificar se usuário é master - só master pode acessar dashboard
    const checkAuth = async () => {
      try {
        const prefeituraSession = localStorage.getItem("prefeitura_session");

        // Se houver prefeitura_session, qualquer usuário que não seja master é redirecionado
        if (prefeituraSession) {
          try {
            const session = JSON.parse(prefeituraSession);
            // Se tiver prefeitura_id vinculada, não é master - redirecionar
            if (session.prefeitura_id) {
              router.push(`/prefeituras/${session.prefeitura_id}`);
              return;
            }
          } catch (error) {
            console.error("Erro ao verificar sessão:", error);
          }
          // Remove sessão de prefeitura - não é master
          localStorage.removeItem("prefeitura_session");
        }

        // Se for Admin Master (isAuthenticated), carregar prefeituras
        if (isAuthenticated()) {
          setIsAuthorized(true);
          await loadPrefeituras();
          setIsAuthChecking(false);
          return;
        }

        // Nenhum usuário master logado, redirecionar para /auth (página de login do master)
        setIsAuthChecking(false);
        router.push("/auth");
      } catch (error) {
        console.error("Erro ao verificar autenticação:", error);
        setIsAuthChecking(false);
        router.push("/auth");
      }
    };

    checkAuth();
  }, [router]);

  const loadPrefeituras = async () => {
    try {
      const { data, error } = await supabase
        .from("prefeituras")
        .select("*")
        .order("ordem", { ascending: true });

      if (error) {
        console.error("Erro ao carregar prefeituras:", error?.message || JSON.stringify(error));
        setPrefeituras([]);
      } else {
        setPrefeituras(data || []);
      }
    } finally {
      setLoading(false);
      setIsAuthChecking(false);
    }
  };

  const handleAddPrefeitura = async (formData: any) => {
    try {
      // Calcular próxima ordem
      const proximaOrdem = prefeituras.length;

      const { error } = await supabase.from("prefeituras").insert([
        {
          ...formData,
          status: "ativa",
          ordem: proximaOrdem,
        },
      ]);

      if (error) throw error;
      await loadPrefeituras();
    } catch (error: any) {
      console.error("Erro ao adicionar prefeitura:", error?.message || error);
      throw error;
    }
  };

  const handleEditClick = (prefeitura: Prefeitura) => {
    router.push(`/prefeituras/${prefeitura.id}`);
  };

  const handleDeleteClick = (prefeitura: Prefeitura) => {
    setSelectedPrefeitura(prefeitura);
    setDeletingId(prefeitura.id);
    setIsDeleteConfirmOpen(true);
  };

  const handleDragStart = (e: React.DragEvent, prefeituraId: string) => {
    setDraggedId(prefeituraId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragEnter = (prefeituraId: string) => {
    setDragOverId(prefeituraId);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, dropPrefeituraId: string) => {
    e.preventDefault();
    setDragOverId(null);

    if (!draggedId || draggedId === dropPrefeituraId) {
      setDraggedId(null);
      return;
    }

    const draggedIndex = prefeituras.findIndex((p) => p.id === draggedId);
    const dropIndex = prefeituras.findIndex((p) => p.id === dropPrefeituraId);

    if (draggedIndex === -1 || dropIndex === -1) {
      setDraggedId(null);
      return;
    }

    const newPrefeituras = [...prefeituras];
    const draggedPrefeitura = newPrefeituras[draggedIndex];
    newPrefeituras.splice(draggedIndex, 1);
    newPrefeituras.splice(dropIndex, 0, draggedPrefeitura);

    setPrefeituras(newPrefeituras);
    setDraggedId(null);

    // Salvar nova ordem no banco de dados
    try {
      const updates = newPrefeituras.map((prefeitura, index) => ({
        id: prefeitura.id,
        ordem: index,
      }));

      for (const update of updates) {
        await supabase
          .from("prefeituras")
          .update({ ordem: update.ordem })
          .eq("id", update.id);
      }
    } catch (error) {
      console.error("Erro ao salvar ordem:", error);
    }
  };

  const handleDeletePrefeitura = async () => {
    if (!deletingId) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("prefeituras")
        .delete()
        .eq("id", deletingId);

      if (error) throw error;
      await loadPrefeituras();
      setIsDeleteConfirmOpen(false);
      setDeletingId(null);
    } catch (error) {
      console.error("Erro ao excluir prefeitura:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const stats = [
    {
      title: "Total de Prefeituras",
      value: prefeituras.length,
      icon: "🏛️",
      color: "teal" as const,
    },
    {
      title: "Notas Fiscais",
      value: "0",
      icon: "📄",
      color: "purple" as const,
    },
    {
      title: "Fornecedores",
      value: "0",
      icon: "🏢",
      color: "orange" as const,
    },
    {
      title: "Ativas",
      value: prefeituras.filter((p) => p.status === "ativa").length,
      icon: "✅",
      color: "blue" as const,
    },
  ];

  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "prefeituras", label: "Prefeituras" },
    { id: "relatorios", label: "Relatórios" },
  ];

  const handleExport = () => {
    console.log("Exportando dados...");
  };

  // Enquanto verifica autenticação, renderiza apenas página vazia
  if (isAuthChecking) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  // Se não foi autorizado, apenas retorna vazio (redirect já foi acionado)
  if (!isAuthorized) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  // Só renderiza o dashboard após autenticação ser confirmada
  return (
    <div className="min-h-screen bg-gray-50">
      <TopNavBar
        title="Dashboard"
        subtitle="Bem-vindo ao sistema de gestão de notas fiscais"
        tabs={tabs}
        activeTab="dashboard"
        onTabChange={() => {}}
        onExport={handleExport}
        userName={prefeituraSession?.nome || "Usuário"}
        userRole={prefeituraSession?.role || prefeituraSession?.cargo || "Usuário"}
      />

      <div className="p-8">
        <div className="mb-8 flex justify-end">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 text-orange-600 hover:text-orange-700 border-2 border-orange-600 hover:border-orange-700 rounded-lg transition bg-white hover:bg-orange-50 font-medium text-sm"
          >
            <span className="text-lg">✨</span>
            Adicionar Prefeitura
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <Card
              key={index}
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              color={stat.color}
            />
          ))}
        </div>


        <div className="bg-white rounded-xl shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Prefeituras Ativas
          </h2>

          {loading ? (
            <p className="text-gray-600">Carregando...</p>
          ) : prefeituras.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">
                Nenhuma prefeitura cadastrada
              </p>
              <p className="text-gray-500 mt-2">
                Clique no botão acima para adicionar a primeira prefeitura
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {prefeituras.map((prefeitura) => (
                <div
                  key={prefeitura.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, prefeitura.id)}
                  onDragOver={handleDragOver}
                  onDragEnter={() => handleDragEnter(prefeitura.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, prefeitura.id)}
                  className={`bg-white rounded-2xl overflow-hidden transition cursor-move border border-gray-200 hover:border-orange-300 hover:shadow-lg ${
                    dragOverId === prefeitura.id
                      ? "border-orange-500 bg-orange-50 shadow-lg"
                      : draggedId === prefeitura.id
                      ? "opacity-50 border-gray-300"
                      : "shadow-sm"
                  }`}
                >
                  {/* Header com Icon */}
                  <div className="bg-gradient-to-r from-teal-50 to-green-50 px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-green-500 rounded-lg flex items-center justify-center text-xl shadow-sm">
                          🏛️
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-gray-900 truncate">
                            {prefeitura.nome}
                          </h3>
                          <p className="text-xs text-gray-500">
                            {prefeitura.cidade}, {prefeitura.estado}
                          </p>
                        </div>
                      </div>
                      <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        prefeitura.status === "ativa"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}>
                        {prefeitura.status === "ativa" ? "Ativa" : "Inativa"}
                      </div>
                    </div>
                  </div>

                  {/* Conteúdo */}
                  <div className="px-6 py-4">
                    {/* Informações Compactas */}
                    <div className="space-y-3 mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-600">CNPJ</span>
                        <span className="text-sm font-medium text-gray-900">{prefeitura.cnpj}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-600">Email</span>
                        <span className="text-sm text-gray-900 truncate ml-2">{prefeitura.email}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-600">Telefone</span>
                        <span className="text-sm font-medium text-gray-900">{prefeitura.telefone}</span>
                      </div>
                    </div>
                  </div>

                  {/* Botões de Ação */}
                  <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 grid grid-cols-3 gap-2">
                    <button
                      onClick={() => router.push(`/prefeituras/${prefeitura.id}`)}
                      className="bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 px-3 rounded-lg text-sm transition shadow-sm"
                    >
                      Acessar
                    </button>
                    <button
                      onClick={() => router.push(`/prefeituras/${prefeitura.id}/configuracoes`)}
                      className="bg-orange-100 hover:bg-orange-200 text-orange-700 font-semibold py-2 px-3 rounded-lg text-sm transition"
                    >
                      ⚙️
                    </button>
                    <button
                      onClick={() => handleDeleteClick(prefeitura)}
                      className="bg-red-100 hover:bg-red-200 text-red-700 font-semibold py-2 px-3 rounded-lg text-sm transition"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <PrefeituraModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleAddPrefeitura}
      />

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title="Excluir Prefeitura"
        message={`Tem certeza que deseja excluir ${selectedPrefeitura?.nome}? Esta ação não pode ser desfeita.`}
        onConfirm={handleDeletePrefeitura}
        onCancel={() => {
          setIsDeleteConfirmOpen(false);
          setSelectedPrefeitura(null);
          setDeletingId(null);
        }}
        loading={isDeleting}
      />
    </div>
  );
}

export default function Home() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
