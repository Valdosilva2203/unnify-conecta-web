"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface SessionData {
  id: string;
  email: string;
  nome: string;
  prefeitura_id: string;
}

interface Requisicao {
  id: string;
  numero: string;
  data_criacao: string;
  quantidade_itens: number;
  status: string;
  criador: string;
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

      if (!response.ok) throw new Error("Erro ao buscar requisições");

      const { requisicoes: reqData } = await response.json();
      setRequisicoes(reqData || []);
    } catch (error) {
      console.error("Erro ao buscar requisições:", error);
    } finally {
      setLoading(false);
    }
  };

  const requisicoesFiltradas = requisicoes.filter((req) =>
    req.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.criador?.toLowerCase().includes(searchTerm.toLowerCase())
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
      {/* Sidebar */}
      <div className={`${menuAberto ? "w-64" : "w-20"} bg-gradient-to-b from-teal-500 to-teal-600 text-white transition-all duration-300 flex flex-col shadow-lg`}>
        <div className="p-6 flex items-center justify-between">
          <div className={`flex items-center gap-2 ${!menuAberto && "justify-center w-full"}`}>
            <span className="text-3xl">📦</span>
            {menuAberto && <span className="text-xl font-bold">Unnify</span>}
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          <div className={menuAberto ? "text-xs font-bold text-teal-200 uppercase mb-4" : "hidden"}>
            Menu
          </div>
          <button
            onClick={() => router.push("/fornecedor/dashboard")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-teal-600 transition"
          >
            <span className="text-xl">📊</span>
            {menuAberto && <span>Dashboard</span>}
          </button>
          <button
            onClick={() => router.push("/fornecedor/requisicoes")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-teal-600 hover:bg-teal-700 transition"
          >
            <span className="text-xl">📋</span>
            {menuAberto && <span>Requisições</span>}
          </button>
        </nav>

        <div className="p-6 border-t border-teal-400">
          <button
            onClick={() => {
              localStorage.removeItem("fornecedor_session");
              router.push("/login");
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-teal-600 transition text-sm font-medium"
          >
            <span>🚪</span>
            {menuAberto && <span>Sair</span>}
          </button>
        </div>
      </div>

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
              className="w-full px-6 py-3 border-2 border-gray-300 rounded-lg focus:border-teal-500 focus:outline-none text-lg"
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
                    className="flex items-center justify-between p-4 border-2 border-gray-200 rounded-lg hover:border-teal-400 hover:bg-teal-50 transition cursor-pointer"
                    onClick={() => router.push(`/prefeituras/${session?.prefeitura_id}/requisicoes/${req.id}`)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold text-lg text-gray-900">{req.numero}</h3>
                        <span className="inline-block px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-medium">
                          {new Date(req.data_criacao).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-600">
                        <span>🔢 {req.quantidade_itens} item(ns)</span>
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
                        <span>👤 {req.criador || "—"}</span>
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
