"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface SessionData {
  id: string;
  email: string;
  nome: string;
  prefeitura_id: string;
  tipo: string;
}

interface PrefeituraData {
  id: string;
  nome: string;
  estado: string;
}

interface FornecedorInfo {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  endereco?: string;
  especialidades?: string[];
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

interface Chamado {
  id: string;
  numero: string;
  titulo: string;
  descricao: string;
  status: "pendente" | "em_andamento" | "concluido";
  prioridade: "baixa" | "media" | "alta";
  data_criacao: string;
  data_atualizacao: string;
}

export default function FornecedorDashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [prefeitura, setPrefeitura] = useState<PrefeituraData | null>(null);
  const [fornecedorInfo, setFornecedorInfo] = useState<FornecedorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [chamadosCount, setChamadosCount] = useState(0);
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [menuAberto, setMenuAberto] = useState(true);

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

      const { data: prefeituraData } = await supabase
        .from("prefeituras")
        .select("id, nome, estado")
        .eq("id", sessionData.prefeitura_id)
        .single();

      if (prefeituraData) {
        setPrefeitura(prefeituraData);
      }

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
          .eq("fornecedor_id", sessionData.id)
          .eq("prefeitura_id", sessionData.prefeitura_id)
          .in("status", ["pendente", "em_andamento"]);

        setChamadosCount(count || 0);

        // Buscar chamados do fornecedor nessa prefeitura
        const { data: chamadosData } = await supabase
          .from("chamados")
          .select("*")
          .eq("fornecedor_id", sessionData.id)
          .eq("prefeitura_id", sessionData.prefeitura_id)
          .order("data_atualizacao", { ascending: false });

        if (chamadosData) {
          setChamados(chamadosData);
        }

        // Buscar contratos do fornecedor nessa prefeitura
        const { data: contratosData } = await supabase
          .from("contratos")
          .select("*")
          .eq("fornecedor_id", sessionData.id)
          .eq("prefeitura_id", sessionData.prefeitura_id)
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
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">⏳</div>
          <p className="text-gray-700 text-lg font-medium">Carregando dashboard...</p>
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
          <a
            href="#"
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-teal-600 hover:bg-teal-700 transition"
          >
            <span className="text-xl">📊</span>
            {menuAberto && <span>Dashboard</span>}
          </a>
          <a
            href="#"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-teal-600 transition"
          >
            <span className="text-xl">📞</span>
            {menuAberto && <span>Chamados</span>}
          </a>
          <a
            href="#"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-teal-600 transition"
          >
            <span className="text-xl">📋</span>
            {menuAberto && <span>Requisições</span>}
          </a>
          <a
            href="#"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-teal-600 transition"
          >
            <span className="text-xl">📄</span>
            {menuAberto && <span>Contratos</span>}
          </a>
        </nav>

        <div className="p-4 space-y-2 border-t border-teal-600">
          <a
            href="#"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-teal-600 transition"
          >
            <span className="text-xl">⚙️</span>
            {menuAberto && <span>Configurações</span>}
          </a>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-600 transition text-left"
          >
            <span className="text-xl">🚪</span>
            {menuAberto && <span>Sair</span>}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="bg-white shadow px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Bem-vindo, {session?.nome}!</h1>
            <p className="text-gray-600 mt-1">{prefeitura?.nome} - {prefeitura?.estado}</p>
          </div>
          <button
            onClick={() => setMenuAberto(!menuAberto)}
            className="text-2xl hover:bg-gray-100 p-2 rounded-lg transition"
          >
            ☰
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-8">
          <div className="space-y-8">
            {/* Informações da Empresa */}
            <div className="bg-white rounded-xl shadow-md p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">📊 Informações da Empresa</h2>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="text-sm text-gray-600 uppercase tracking-wide mb-2">Razão Social</p>
                  <p className="text-xl font-semibold text-gray-900">{fornecedorInfo?.nome}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 uppercase tracking-wide mb-2">Email</p>
                  <p className="text-xl font-semibold text-gray-900">{fornecedorInfo?.email}</p>
                </div>
                {fornecedorInfo?.telefone && (
                  <div>
                    <p className="text-sm text-gray-600 uppercase tracking-wide mb-2">Telefone</p>
                    <p className="text-xl font-semibold text-gray-900">{fornecedorInfo.telefone}</p>
                  </div>
                )}
                {fornecedorInfo?.endereco && (
                  <div>
                    <p className="text-sm text-gray-600 uppercase tracking-wide mb-2">Endereço</p>
                    <p className="text-xl font-semibold text-gray-900">{fornecedorInfo.endereco}</p>
                  </div>
                )}
              </div>

              {fornecedorInfo?.especialidades && fornecedorInfo.especialidades.length > 0 && (
                <div className="mt-8 pt-8 border-t">
                  <p className="text-sm text-gray-600 uppercase tracking-wide mb-4">Especialidades</p>
                  <div className="flex flex-wrap gap-3">
                    {fornecedorInfo.especialidades.map((esp, idx) => {
                      const cores = [
                        "bg-cyan-100 text-cyan-700",
                        "bg-blue-100 text-blue-700",
                        "bg-rose-100 text-rose-700",
                        "bg-purple-100 text-purple-700",
                        "bg-teal-100 text-teal-700",
                      ];
                      return (
                        <span
                          key={idx}
                          className={`inline-block px-4 py-2 ${cores[idx % cores.length]} rounded-full font-medium text-sm`}
                        >
                          {esp}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-cyan-50 to-blue-100 rounded-xl p-6 border border-cyan-200 shadow-sm hover:shadow-md transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-cyan-600 font-semibold mb-2">Chamados em Aberto</p>
                    <p className="text-4xl font-bold text-cyan-900">{chamadosCount}</p>
                  </div>
                  <div className="text-6xl opacity-40">📞</div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-rose-50 to-pink-100 rounded-xl p-6 border border-rose-200 shadow-sm hover:shadow-md transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-rose-600 font-semibold mb-2">Requisições</p>
                    <p className="text-4xl font-bold text-rose-900">0</p>
                  </div>
                  <div className="text-6xl opacity-40">📋</div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-violet-100 rounded-xl p-6 border border-purple-200 shadow-sm hover:shadow-md transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-purple-600 font-semibold mb-2">Contratos Ativos</p>
                    <p className="text-4xl font-bold text-purple-900">0</p>
                  </div>
                  <div className="text-6xl opacity-40">📄</div>
                </div>
              </div>
            </div>

            {/* Contratos */}
            <div className="bg-white rounded-xl shadow-md p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">📄 Contratos ({contratos.length})</h2>
              {contratos.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-lg">Nenhum contrato vinculado no momento</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b-2 border-gray-300">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Número</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Descrição</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Valor</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Data Fim</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Dias Restantes</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Status</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {contratos.map((contrato) => {
                        const hoje = new Date();
                        const dataFim = new Date(contrato.data_fim);
                        const diasRestantes = Math.ceil(
                          (dataFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
                        );
                        const percentualAlerta = (diasRestantes / 365) * 100;

                        return (
                          <tr key={contrato.id} className="hover:bg-gray-50 transition">
                            <td className="px-6 py-4">
                              <span className="font-bold text-gray-900">{contrato.numero}</span>
                            </td>
                            <td className="px-6 py-4 text-gray-700">{contrato.descricao}</td>
                            <td className="px-6 py-4">
                              <span className="font-semibold text-gray-900">
                                R${" "}
                                {(contrato.valor || 0).toLocaleString("pt-BR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-gray-700">
                              {new Date(contrato.data_fim).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      diasRestantes < 0
                                        ? "bg-red-500"
                                        : diasRestantes < 30
                                          ? "bg-red-500"
                                          : diasRestantes < 90
                                            ? "bg-yellow-500"
                                            : "bg-green-500"
                                    }`}
                                    style={{ width: `${Math.max(0, Math.min(100, percentualAlerta))}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-gray-700 w-12">
                                  {diasRestantes < 0 ? "Expirado" : `${diasRestantes}d`}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                                  contrato.status === "ativo"
                                    ? "bg-green-100 text-green-700"
                                    : contrato.status === "concluido"
                                      ? "bg-gray-100 text-gray-700"
                                      : "bg-red-100 text-red-700"
                                }`}
                              >
                                {contrato.status === "ativo"
                                  ? "ativo"
                                  : contrato.status === "concluido"
                                    ? "concluído"
                                    : "cancelado"}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => router.push(`/prefeituras/${session?.prefeitura_id}/contratos/${contrato.id}`)}
                                className="text-teal-600 hover:text-teal-700 font-semibold text-sm hover:underline transition"
                              >
                                Visualizar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Chamados Recentes */}
            <div className="bg-white rounded-xl shadow-md p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">📞 Chamados Recentes ({chamados.length})</h2>
              {chamados.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-lg">Nenhum chamado no momento</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b-2 border-gray-300">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Número</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Título</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Descrição</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Prioridade</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Status</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Data Criação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {chamados.map((chamado) => (
                        <tr key={chamado.id} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-4">
                            <span className="font-bold text-gray-900">{chamado.numero}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-semibold text-gray-900">{chamado.titulo}</span>
                          </td>
                          <td className="px-6 py-4 text-gray-700 truncate max-w-xs">{chamado.descricao}</td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                                chamado.prioridade === "alta"
                                  ? "bg-red-100 text-red-700"
                                  : chamado.prioridade === "media"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-green-100 text-green-700"
                              }`}
                            >
                              {chamado.prioridade}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                                chamado.status === "pendente"
                                  ? "bg-orange-100 text-orange-700"
                                  : chamado.status === "em_andamento"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-green-100 text-green-700"
                              }`}
                            >
                              {chamado.status === "em_andamento" ? "em andamento" : chamado.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {new Date(chamado.data_criacao).toLocaleDateString("pt-BR")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
