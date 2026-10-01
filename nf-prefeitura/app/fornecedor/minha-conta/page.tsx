"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import FornecedorSidebar from "@/app/components/FornecedorSidebar";
import FornecedorTopNavBar from "@/app/components/FornecedorTopNavBar";

interface SessionData {
  id: string;
  email: string;
  nome: string;
  prefeitura_id: string;
  tipo: string;
}

interface FornecedorInfo {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  endereco?: string;
  especialidades?: string[];
  razao_social?: string;
  cnpj?: string;
}

interface Contrato {
  id: string;
  numero: string;
  descricao: string;
  valor: number;
  status: "ativo" | "concluido" | "cancelado";
  data_inicio: string;
  data_fim: string;
}

export default function MinhaContaFornecedorPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [fornecedorInfo, setFornecedorInfo] = useState<FornecedorInfo | null>(null);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuAberto, setMenuAberto] = useState(true);
  const [chamadosCount, setChamadosCount] = useState(0);
  const [editando, setEditando] = useState(false);

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

      const { data: fornecedor } = await supabase
        .from("fornecedores")
        .select("*")
        .eq("id", sessionData.id)
        .single();

      if (fornecedor) {
        setFornecedorInfo(fornecedor);

        const { count } = await supabase
          .from("chamados")
          .select("*", { count: "exact", head: true })
          .eq("fornecedor_id", sessionData.id);

        setChamadosCount(count || 0);

        const { data: contratosData } = await supabase
          .from("contratos")
          .select("*")
          .eq("fornecedor_id", sessionData.id)
          .order("data_inicio", { ascending: false });

        if (contratosData) {
          setContratos(contratosData);
        }
      }
    } catch (error) {
      console.error("Erro ao verificar sessão:", error);
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("fornecedor_session");
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⏳</div>
          <p className="text-xl font-semibold text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!fornecedorInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <p className="text-xl font-semibold text-gray-600 mb-6">Fornecedor não encontrado</p>
          <button
            onClick={() => router.push("/fornecedor/dashboard")}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
          >
            ← Voltar ao Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <FornecedorSidebar
        menuAberto={menuAberto}
        onToggleMenu={() => setMenuAberto(!menuAberto)}
        currentPage="minha-conta"
        onLogout={handleLogout}
      />

      <main className="flex-1 overflow-auto flex flex-col">
        <FornecedorTopNavBar
          userName={session?.nome || "Fornecedor"}
          onMenuToggle={() => setMenuAberto(!menuAberto)}
          onLogout={handleLogout}
        />

        <div className="flex-1 overflow-auto p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900">Minha Conta</h1>
            <p className="text-gray-600 mt-2">Informações do seu perfil e contratos</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Info Cards */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">📋 Informações da Empresa</h2>
                  {!editando && (
                    <button
                      onClick={() => setEditando(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                    >
                      ✏️ Editar
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <p className="text-xs font-bold text-gray-600 uppercase mb-2">Razão Social</p>
                    <p className="text-lg font-semibold text-gray-900">{fornecedorInfo.razao_social || fornecedorInfo.nome}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-600 uppercase mb-2">Email</p>
                    <p className="text-lg font-semibold text-gray-900">{fornecedorInfo.email}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-600 uppercase mb-2">CNPJ</p>
                    <p className="text-lg font-semibold text-gray-900">{fornecedorInfo.cnpj || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-600 uppercase mb-2">Telefone</p>
                    <p className="text-lg font-semibold text-gray-900">{fornecedorInfo.telefone || "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-bold text-gray-600 uppercase mb-2">Endereço</p>
                    <p className="text-lg font-semibold text-gray-900">{fornecedorInfo.endereco || "—"}</p>
                  </div>
                </div>
              </div>

              {/* Contratos */}
              <div className="bg-white rounded-2xl shadow-lg p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">📄 Contratos ({contratos.length})</h2>

                {contratos.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">Nenhum contrato encontrado</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 border-b-2 border-gray-300">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900">Número</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900">Descrição</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900">Valor</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900">Data Início</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contratos.map((contrato, idx) => (
                          <tr
                            key={contrato.id}
                            className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} border-b border-gray-200 hover:bg-blue-50 transition`}
                          >
                            <td className="px-4 py-3 font-semibold text-gray-900">{contrato.numero}</td>
                            <td className="px-4 py-3 text-gray-700">{contrato.descricao}</td>
                            <td className="px-4 py-3 font-semibold text-gray-900">
                              R$ {contrato.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {new Date(contrato.data_inicio).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                  contrato.status === "ativo"
                                    ? "bg-green-100 text-green-800"
                                    : contrato.status === "concluido"
                                      ? "bg-blue-100 text-blue-800"
                                      : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {contrato.status === "ativo" ? "✅ Ativo" : contrato.status === "concluido" ? "✓ Concluído" : "❌ Cancelado"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar Cards */}
            <div>
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg p-8 text-white mb-6">
                <div className="text-5xl mb-4">📞</div>
                <p className="text-xs font-bold uppercase opacity-80 mb-2">Chamados Totais</p>
                <p className="text-5xl font-bold">{chamadosCount}</p>
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-8">
                <h3 className="text-lg font-bold text-gray-900 mb-4">⚡ Ações Rápidas</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => router.push("/fornecedor/dashboard")}
                    className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={() => router.push("/fornecedor/chamados")}
                    className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium text-sm"
                  >
                    Meus Chamados
                  </button>
                  <button
                    onClick={() => router.push("/fornecedor/requisicoes")}
                    className="w-full px-4 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition font-medium text-sm"
                  >
                    Requisições
                  </button>
                  <button
                    onClick={() => router.push("/fornecedor/prefeituras")}
                    className="w-full px-4 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition font-medium text-sm"
                  >
                    Prefeituras
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
