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
        .eq("status", "ativa")
        .order("ordem", { ascending: true });

      if (error) throw error;
      setPrefeituras(data || []);
    } catch (error) {
      console.error("Erro ao carregar prefeituras:", error);
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
                  className={`bg-white rounded-lg shadow-sm p-5 transition cursor-move border-2 ${
                    dragOverId === prefeitura.id
                      ? "border-orange-500 bg-orange-50"
                      : draggedId === prefeitura.id
                      ? "opacity-50 border-gray-300"
                      : "border-gray-200 hover:shadow-md"
                  }`}
                >
                  {/* Logo/Brasão */}
                  <div className="flex justify-center mb-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-100 to-green-200 rounded-full flex items-center justify-center text-2xl">
                      🏛️
                    </div>
                  </div>

                  {/* Nome da Prefeitura */}
                  <h3 className="text-sm font-bold text-gray-900 text-center mb-1">
                    {prefeitura.nome}
                  </h3>
                  <p className="text-xs text-gray-500 text-center mb-4">({prefeitura.id})</p>

                  {/* Informações */}
                  <div className="space-y-2 mb-4 text-xs">
                    <div>
                      <p className="text-gray-600 font-medium">CNPJ:</p>
                      <p className="text-gray-900">{prefeitura.cnpj}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Endereço:</p>
                      <p className="text-gray-900">{prefeitura.endereco}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Cidade:</p>
                      <p className="text-gray-900">
                        {prefeitura.cidade}, {prefeitura.estado}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Telefone:</p>
                      <p className="text-gray-900">{prefeitura.telefone}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">E-mail:</p>
                      <p className="text-gray-900">{prefeitura.email}</p>
                    </div>
                  </div>

                  {/* Botões */}
                  <div className="space-y-1.5">
                    <button
                      onClick={() => router.push(`/prefeituras/${prefeitura.id}`)}
                      className="w-full bg-teal-500 hover:bg-teal-600 text-white font-medium py-1.5 px-3 rounded text-sm transition"
                    >
                      Acessar
                    </button>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => router.push(`/prefeituras/${prefeitura.id}/configuracoes`)}
                        className="flex-1 text-orange-600 hover:text-orange-700 border border-orange-600 hover:border-orange-700 font-medium text-xs py-1 px-2 rounded transition"
                      >
                        ⚙️ Config
                      </button>
                      <button
                        onClick={() => handleDeleteClick(prefeitura)}
                        className="flex-1 text-red-600 hover:text-red-700 border border-red-600 hover:border-red-700 font-medium text-xs py-1 px-2 rounded transition"
                      >
                        Excluir
                      </button>
                    </div>
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
