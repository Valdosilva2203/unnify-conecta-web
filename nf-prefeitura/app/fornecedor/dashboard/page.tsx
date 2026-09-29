"use client";

import { useState, useEffect, useRef } from "react";
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
  titulo: string;
  descricao: string;
  status: "pendente" | "atribuida" | "em_andamento" | "finalizada" | "cancelada";
  prioridade: "baixa" | "normal" | "urgente";
  created_at: string;
  data_finalizacao?: string;
  fornecedor_id: string;
  prefeitura_id: string;
  criador_nome?: string;
}

export default function FornecedorDashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [prefeitura, setPrefeitura] = useState<PrefeituraData | null>(null);
  const [fornecedorInfo, setFornecedorInfo] = useState<FornecedorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [chamadosCount, setChamadosCount] = useState(0);
  const [requisicoesCriadas, setRequisicoesCriadas] = useState(0);
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [menuAberto, setMenuAberto] = useState(true);
  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null);
  const [modalFinalizacao, setModalFinalizacao] = useState<string | null>(null);
  const [justificativaText, setJustificativaText] = useState("");
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    verificarSessao();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuAbertoId(null);
      }
    };

    if (menuAbertoId) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [menuAbertoId]);

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

        // Buscar requisições criadas pelo fornecedor
        const { count: reqCount } = await supabase
          .from("requisicoes")
          .select("*", { count: "exact", head: true })
          .eq("fornecedor_id", sessionData.id)
          .eq("prefeitura_id", sessionData.prefeitura_id);

        setRequisicoesCriadas(reqCount || 0);

        // Buscar chamados do fornecedor nessa prefeitura via API
        try {
          const response = await fetch(
            `/api/fornecedor/chamados?fornecedor_id=${sessionData.id}&prefeitura_id=${sessionData.prefeitura_id}`
          );
          if (response.ok) {
            const { chamados: chamadosData } = await response.json();
            if (chamadosData) {
              setChamados(chamadosData);
            }
          }
        } catch (error) {
          console.error("Erro ao buscar chamados:", error);
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

  const atualizarStatusChamado = async (chamadoId: string, novoStatus: string) => {
    try {
      setAtualizando(chamadoId);
      setMenuAbertoId(null);
      const response = await fetch("/api/fornecedor/chamados/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chamadoId, status: novoStatus }),
      });

      if (!response.ok) throw new Error("Erro ao atualizar status");

      setChamados(chamados.map(c => c.id === chamadoId ? { ...c, status: novoStatus as any } : c));
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
    } finally {
      setAtualizando(null);
    }
  };

  const handleIniciar = (chamadoId: string) => {
    atualizarStatusChamado(chamadoId, "em_andamento");
  };

  const handlePausar = (chamadoId: string) => {
    atualizarStatusChamado(chamadoId, "pendente");
  };

  const handleFinalizarClick = (chamadoId: string) => {
    setModalFinalizacao(chamadoId);
    setJustificativaText("");
  };

  const handleFinalizarConfirmar = async () => {
    if (!modalFinalizacao) return;
    try {
      setAtualizando(modalFinalizacao);
      const response = await fetch("/api/fornecedor/chamados/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: modalFinalizacao,
          status: "finalizada",
          justificativa: justificativaText,
        }),
      });

      if (!response.ok) throw new Error("Erro ao finalizar chamado");

      setChamados(chamados.map(c => c.id === modalFinalizacao ? { ...c, status: "finalizada" } : c));
      setModalFinalizacao(null);
      setJustificativaText("");
    } catch (error) {
      console.error("Erro ao finalizar:", error);
    } finally {
      setAtualizando(null);
    }
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

              <button
                onClick={() => router.push("/fornecedor/requisicoes")}
                className="bg-gradient-to-br from-rose-50 to-pink-100 rounded-xl p-6 border border-rose-200 shadow-sm hover:shadow-md transition cursor-pointer text-left w-full"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-rose-600 font-semibold mb-2">Requisições</p>
                    <p className="text-4xl font-bold text-rose-900">{requisicoesCriadas}</p>
                  </div>
                  <div className="text-6xl opacity-40">📋</div>
                </div>
              </button>

              <div className="bg-gradient-to-br from-purple-50 to-violet-100 rounded-xl p-6 border border-purple-200 shadow-sm hover:shadow-md transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-purple-600 font-semibold mb-2">Contratos Ativos</p>
                    <p className="text-4xl font-bold text-purple-900">{contratos.filter(c => c.status === "ativo").length}</p>
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
                    <thead className="border-b-2 border-gray-300 bg-gradient-to-r from-indigo-50 to-blue-50">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-bold text-indigo-600">CHAMADO</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-indigo-600">DESCRIÇÃO</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-indigo-600">PRIORIDADE</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-indigo-600">STATUS</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-indigo-600">CRIADOR</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-indigo-600">VINCULADO A</th>
                        <th className="px-6 py-4 text-center text-sm font-bold text-indigo-600">DELETAR</th>
                        <th className="px-6 py-4 text-right text-sm font-bold text-indigo-600">AÇÕES</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {chamados.map((chamado) => (
                        <tr key={chamado.id} className="hover:bg-blue-50 transition">
                          <td className="px-6 py-4">
                            <span className="font-bold text-gray-900">{chamado.titulo}</span>
                          </td>
                          <td className="px-6 py-4 text-gray-700 line-clamp-2">{chamado.descricao}</td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${
                                chamado.prioridade === "urgente"
                                  ? "bg-red-50 text-red-700 border-red-200"
                                  : chamado.prioridade === "normal"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}
                            >
                              🔴 {chamado.prioridade === "urgente" ? "Urgente" : chamado.prioridade === "normal" ? "Normal" : "Baixa"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                                chamado.status === "pendente"
                                  ? "bg-orange-100 text-orange-700"
                                  : chamado.status === "em_andamento"
                                    ? "bg-blue-100 text-blue-700"
                                    : chamado.status === "finalizada"
                                      ? "bg-green-100 text-green-700"
                                      : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              • {chamado.status === "em_andamento" ? "Em Andamento" : chamado.status === "finalizada" ? "Finalizada" : chamado.status === "pendente" ? "Pendente" : chamado.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                            {chamado.criador_nome || "—"}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                              Compras
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button className="p-2 hover:bg-red-100 rounded-full transition text-red-600 font-bold text-lg hover:scale-110">
                              🗑️
                            </button>
                          </td>
                          <td className="px-6 py-4 text-right relative" ref={menuRef}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuAbertoId(menuAbertoId === chamado.id ? null : chamado.id);
                              }}
                              className="p-2 hover:bg-gray-200 rounded-full transition text-gray-600 font-bold text-lg"
                            >
                              ⋮
                            </button>
                            {menuAbertoId === chamado.id && (
                              <div className="absolute right-0 bottom-full mb-2 bg-white border-2 border-gray-200 rounded-lg shadow-2xl z-[9999] w-56">
                                {/* Header AÇÕES */}
                                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                                  <p className="text-sm font-bold text-gray-800">AÇÕES</p>
                                </div>

                                <div className="py-2">
                                  {/* Editar */}
                                  <button className="w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-center gap-2 text-sm text-gray-700 font-medium border-b border-gray-100">
                                    ✏️ Editar
                                  </button>

                                  {/* Justificativa */}
                                  <button className="w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-center gap-2 text-sm text-gray-700 font-medium border-b border-gray-100 mb-2">
                                    📝 Justificativa
                                  </button>

                                  {/* Header MUDAR STATUS */}
                                  <div className="px-4 py-2">
                                    <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Mudar Status</p>
                                  </div>

                                  {/* Status: Pendente */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      atualizarStatusChamado(chamado.id, "pendente");
                                    }}
                                    disabled={atualizando === chamado.id || chamado.status === "pendente"}
                                    className="w-full text-left px-4 py-3 hover:bg-amber-50 transition flex items-center gap-2 text-sm text-gray-700 font-medium border-b border-gray-100 disabled:opacity-50"
                                  >
                                    🔵 Pendente
                                  </button>

                                  {/* Status: Atribuída */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      atualizarStatusChamado(chamado.id, "atribuida");
                                    }}
                                    disabled={atualizando === chamado.id || chamado.status === "atribuida"}
                                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition flex items-center gap-2 text-sm text-gray-700 font-medium border-b border-gray-100 disabled:opacity-50"
                                  >
                                    👤 Atribuída
                                  </button>

                                  {/* Status: Em Andamento */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleIniciar(chamado.id);
                                    }}
                                    disabled={atualizando === chamado.id || chamado.status === "em_andamento"}
                                    className="w-full text-left px-4 py-3 hover:bg-green-50 transition flex items-center gap-2 text-sm text-gray-700 font-medium border-b border-gray-100 disabled:opacity-50"
                                  >
                                    📌 Em Andamento
                                  </button>

                                  {/* Status: Finalizada */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleFinalizarClick(chamado.id);
                                    }}
                                    disabled={atualizando === chamado.id || chamado.status === "finalizada"}
                                    className="w-full text-left px-4 py-3 hover:bg-emerald-50 transition flex items-center gap-2 text-sm text-gray-700 font-medium disabled:opacity-50"
                                  >
                                    ✅ Finalizada
                                  </button>
                                </div>
                              </div>
                            )}
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

      {/* Modal Finalização */}
      {modalFinalizacao && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModalFinalizacao(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-gray-900 mb-4">✅ Confirmar Finalização</h3>
            <p className="text-gray-700 mb-6">
              Deseja realmente finalizar este chamado? O criador receberá uma solicitação de confirmação.
            </p>
            <textarea
              value={justificativaText}
              onChange={(e) => setJustificativaText(e.target.value)}
              placeholder="Adicione uma justificativa (opcional)"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg mb-6 focus:border-blue-500 focus:outline-none resize-none"
              rows={4}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setModalFinalizacao(null)}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium disabled:opacity-50"
                disabled={atualizando === modalFinalizacao}
              >
                Cancelar
              </button>
              <button
                onClick={handleFinalizarConfirmar}
                disabled={atualizando === modalFinalizacao}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
              >
                {atualizando === modalFinalizacao ? "Finalizando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
