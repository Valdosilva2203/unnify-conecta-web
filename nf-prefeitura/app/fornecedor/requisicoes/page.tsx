"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import FornecedorSidebar from "@/app/components/FornecedorSidebar";

interface SessionData {
  id: string;
  email: string;
  nome: string;
  prefeitura_id: string;
}

interface Requisicao {
  id: string;
  numero_requisicao: string;
  titulo: string;
  descricao: string;
  status: string;
  created_at: string;
}

export default function FornecedorRequisicoes() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuAberto, setMenuAberto] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    verificarSessao();
  }, []);

  const verificarSessao = async () => {
    try {
      const sessionStr = localStorage.getItem("fornecedor_session");
      if (!sessionStr) {
        router.push("/login");
        return;
      }

      const sessionData: SessionData = JSON.parse(sessionStr);
      setSession(sessionData);

      // Buscar requisições do fornecedor via API
      const response = await fetch(
        `/api/fornecedor/requisicoes?fornecedor_id=${sessionData.id}&prefeitura_id=${sessionData.prefeitura_id}`
      );

      const json = await response.json();

      if (!response.ok) {
        console.error("Erro na API:", json);
        throw new Error(json?.error || "Erro ao buscar requisições");
      }

      setRequisicoes(json?.requisicoes || []);
    } catch (error) {
      console.error("Erro ao buscar requisições:", error);
    } finally {
      setLoading(false);
    }
  };

  const requisicoesFiltradas = requisicoes.filter((req) =>
    req.numero_requisicao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.titulo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">⏳</div>
          <p className="text-gray-700 text-lg font-medium">Carregando requisições...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <FornecedorSidebar
        menuAberto={menuAberto}
        onToggleMenu={() => setMenuAberto(!menuAberto)}
        currentPage="requisicoes"
        onLogout={() => {
          localStorage.removeItem("fornecedor_session");
          router.push("/login");
        }}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900">📋 Minhas Requisições</h1>
            <button
              onClick={() => setMenuAberto(!menuAberto)}
              className="text-gray-600 text-3xl hover:text-gray-900 transition"
            >
              ☰
            </button>
          </div>

          {/* Search */}
          <div className="mb-8">
            <input
              type="text"
              placeholder="Buscar por número, nome, fornecedor ou criador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-6 py-3 border-2 border-gray-300 rounded-lg focus:border-gray-400 focus:outline-none text-lg"
            />
          </div>

          {/* Requisições List */}
          <div className="bg-white rounded-xl shadow-md p-8">
            {requisicoesFiltradas.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">
                  {requisicoes.length === 0 ? "Nenhuma requisição criada" : "Nenhuma requisição encontrada"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {requisicoesFiltradas.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-4 border-2 border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition cursor-pointer"
                    onClick={() => router.push(`/fornecedor/requisicoes/${req.id}`)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold text-lg text-gray-900">{req.numero_requisicao}</h3>
                        <span className="inline-block px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-medium">
                          {new Date(req.created_at).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-600 mb-2">
                        <span className="font-medium">{req.titulo}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-600">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            req.status === "pendente"
                              ? "bg-yellow-100 text-yellow-700"
                              : req.status === "aprovada"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {req.status === "pendente" ? "⏳ Pendente" : req.status === "aprovada" ? "✅ Aprovada" : req.status}
                        </span>
                      </div>
                    </div>
                    <div className="text-2xl">→</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
