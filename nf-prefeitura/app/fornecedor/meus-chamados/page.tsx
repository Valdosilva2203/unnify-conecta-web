"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import FornecedorSidebar from "@/app/components/FornecedorSidebar";
import LoadingSpinner from "@/app/components/LoadingSpinner";

interface SessionData {
  id: string;
  email: string;
  nome: string;
  prefeitura_id: string;
}

interface Chamado {
  id: string;
  titulo: string;
  descricao: string;
  status: string;
  prioridade: string;
  created_at: string;
  updated_at: string;
  numero_chamado?: string;
  secretaria_nome?: string;
  criado_por?: string;
}

export default function MeusChamados() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuAberto, setMenuAberto] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

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

      // Buscar chamados do fornecedor
      const response = await fetch(
        `/api/fornecedor/meus-chamados?fornecedor_id=${sessionData.id}&prefeitura_id=${sessionData.prefeitura_id}`
      );

      const json = await response.json();

      if (!response.ok) {
        console.error("Erro na API:", response.status, json);
        throw new Error(json?.error || `Erro ${response.status}`);
      }

      setChamados(json?.chamados || []);
    } catch (error) {
      console.error("Erro ao buscar chamados:", error);
    } finally {
      setLoading(false);
    }
  };

  const chamadosFiltrados = chamados.filter((chamado) => {
    const matchSearch =
      chamado.titulo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chamado.numero_chamado?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = !filtroStatus || chamado.status === filtroStatus;
    return matchSearch && matchStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "aberto":
        return "bg-blue-100 text-blue-700";
      case "em_andamento":
        return "bg-yellow-100 text-yellow-700";
      case "resolvido":
        return "bg-green-100 text-green-700";
      case "fechado":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getPrioridadeColor = (prioridade: string) => {
    switch (prioridade) {
      case "alta":
        return "bg-red-100 text-red-700";
      case "media":
        return "bg-orange-100 text-orange-700";
      case "baixa":
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <FornecedorSidebar
        menuAberto={menuAberto}
        onToggleMenu={() => setMenuAberto(!menuAberto)}
        currentPage="meus-chamados"
      />

      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">🎫 Meus Chamados</h1>
              <p className="text-gray-600 mt-2">Acompanhe todos os seus chamados abertos com as secretarias</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <input
              type="text"
              placeholder="Buscar por título ou número..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Todos os Status</option>
              <option value="aberto">Aberto</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="resolvido">Resolvido</option>
              <option value="fechado">Fechado</option>
            </select>
          </div>

          {chamadosFiltrados.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">Nenhum chamado encontrado</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-blue-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-blue-600 uppercase">Chamado</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-blue-600 uppercase">Descrição</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-blue-600 uppercase">Prioridade</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-blue-600 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-blue-600 uppercase">Criador</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-blue-600 uppercase">Vinculado a</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-blue-600 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {chamadosFiltrados.map((chamado) => (
                    <tr key={chamado.id} className="border-b border-gray-200 hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-gray-900 font-bold">{chamado.titulo}</td>
                      <td className="px-6 py-4 text-gray-600 text-sm truncate" title={chamado.descricao}>
                        {chamado.descricao}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPrioridadeColor(chamado.prioridade)}`}>
                          {chamado.prioridade === "alta"
                            ? "● Urgente"
                            : chamado.prioridade === "media"
                            ? "● Normal"
                            : chamado.prioridade === "baixa"
                            ? "● Baixa"
                            : chamado.prioridade}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(chamado.status)}`}>
                          {chamado.status === "aberto"
                            ? "● aberto"
                            : chamado.status === "em_andamento"
                            ? "● em_requisicao"
                            : chamado.status === "resolvido"
                            ? "● Finalizada"
                            : chamado.status === "fechado"
                            ? "● Fechado"
                            : chamado.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-900">{chamado.criado_por || "—"}</td>
                      <td className="px-6 py-4">
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                          }}
                          className="text-blue-600 hover:underline font-medium text-sm"
                        >
                          {chamado.secretaria_nome || "—"}
                        </a>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => router.push(`/fornecedor/meus-chamados/${chamado.id}`)}
                          className="text-blue-600 hover:underline font-medium text-sm"
                        >
                          Compras
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
