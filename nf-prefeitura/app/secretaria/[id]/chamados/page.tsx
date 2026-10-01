"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Clock, Phone, Bell, ChevronDown } from "lucide-react";

interface Chamado {
  id: string;
  titulo: string;
  descricao: string;
  status: string;
  prioridade: string;
  criador_nome: string;
  created_at: string;
}

export default function ChamadosPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
    loadChamados();
  }, []);

  const checkAuth = () => {
    const sessionKey = localStorage.getItem("admin_session") ? "admin_session" : "prefeitura_session";
    const sessionData = localStorage.getItem(sessionKey);

    if (!sessionData) {
      router.push(`/login?redirect=/secretaria/${id}/chamados`);
    }
  };

  const loadChamados = async () => {
    try {
      const sessionKey = localStorage.getItem("admin_session") ? "admin_session" : "prefeitura_session";
      const sessionData = localStorage.getItem(sessionKey);
      const session = sessionData ? JSON.parse(sessionData) : null;

      if (!session?.id) {
        setErro("Usuário não autenticado");
        return;
      }

      const { data, error } = await supabase
        .from("chamados")
        .select("id, titulo, descricao, status, prioridade, criador_nome, created_at")
        .eq("criado_por", session.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setChamados(data || []);
    } catch (error) {
      console.error("Erro ao carregar chamados:", error);
      setErro("Erro ao carregar chamados");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pendente":
        return "bg-orange-100 text-orange-800";
      case "em_andamento":
        return "bg-blue-100 text-blue-800";
      case "finalizado":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (prioridade: string) => {
    switch (prioridade) {
      case "urgente":
        return "bg-red-100 text-red-800";
      case "normal":
        return "bg-yellow-100 text-yellow-800";
      case "baixa":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("pt-BR");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simple Header */}
      <div className="w-full bg-white border-b border-gray-200">
        <div className="px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">📞 Meus Chamados</h1>
              <p className="text-sm text-gray-600 mt-1">Todos os chamados que você criou</p>
            </div>

            <div className="flex items-center gap-6">
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

              <button
                onClick={() => router.push("/minha-conta")}
                className="flex items-center gap-3 pl-6 border-l border-gray-200 hover:opacity-80 transition"
              >
                <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold">
                  U
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-medium text-gray-900">Usuário</span>
                  <span className="text-xs text-gray-600">Comum</span>
                </div>
                <ChevronDown size={16} className="text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <button
              onClick={() => router.back()}
              className="text-orange-600 hover:text-orange-700 font-medium mb-4"
            >
              ← Voltar
            </button>
            <p className="text-gray-600">Total: {chamados.length} chamados</p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Carregando chamados...</p>
            </div>
          ) : erro ? (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {erro}
            </div>
          ) : chamados.length > 0 ? (
            <div className="grid gap-4">
              {chamados.map((chamado) => (
                <div
                  key={chamado.id}
                  className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow border-l-4 border-orange-500"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{chamado.titulo}</h3>
                      {chamado.descricao && (
                        <p className="text-gray-600 mb-4">{chamado.descricao}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex gap-3">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(chamado.status)}`}>
                        {chamado.status}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPriorityColor(chamado.prioridade)}`}>
                        {chamado.prioridade || "sem prioridade"}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <p>Criador: <strong>{chamado.criador_nome}</strong></p>
                      <p>Data: {formatDate(chamado.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-100 rounded-lg p-12 text-center">
              <p className="text-gray-600 text-lg">Nenhum chamado encontrado</p>
              <p className="text-gray-500 mt-2">Você ainda não criou nenhum chamado</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
