"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import FornecedorSidebar from "@/app/components/FornecedorSidebar";
import LoadingSpinner from "@/app/components/LoadingSpinner";

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
  nota_fiscal_url?: string;
  nota_fiscal_arquivo?: string;
}

interface Secretaria {
  id: string;
  nome: string;
  email?: string;
}

export default function FornecedorRequisicoes() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuAberto, setMenuAberto] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [modalNotaFiscalAberto, setModalNotaFiscalAberto] = useState(false);
  const [modalSecretariasAberto, setModalSecretariasAberto] = useState(false);
  const [requisicaoSelecionada, setRequisicaoSelecionada] = useState<string | null>(null);
  const [enviandoNota, setEnviandoNota] = useState(false);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [carregandoSecretarias, setCarregandoSecretarias] = useState(false);
  const [secretariasSelecionadas, setSecretariasSelecionadas] = useState<string[]>([]);
  const [enviandoParaSecretarias, setEnviandoParaSecretarias] = useState(false);

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
        console.error("Erro na API:", response.status, json);
        throw new Error(json?.error || `Erro ${response.status} ao buscar requisições`);
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

  const baixarNotaFiscal = async (requisicaoId: string) => {
    try {
      const response = await fetch("/api/fornecedor/download-nota-fiscal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requisicaoId })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao gerar URL");
      }

      const { url } = await response.json();
      window.open(url, "_blank");
    } catch (error) {
      console.error("Erro ao baixar nota fiscal:", error);
      alert("Erro ao abrir arquivo");
    }
  };

  const enviarNotaFiscal = async (file: File) => {
    if (!requisicaoSelecionada || !session) return;

    try {
      setEnviandoNota(true);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("requisicaoId", requisicaoSelecionada);
      formData.append("fornecedorId", session.id);

      const response = await fetch("/api/fornecedor/upload-nota-fiscal", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      if (!data.url) {
        throw new Error("Resposta inválida do servidor");
      }

      alert("✅ Nota fiscal enviada com sucesso!");
      setModalNotaFiscalAberto(false);
      setRequisicaoSelecionada(null);

      // Recarrega os dados
      await verificarSessao();
    } catch (error) {
      console.error("Erro ao enviar nota fiscal:", error);
      alert("❌ Erro ao enviar nota fiscal: " + (error as any).message);
    } finally {
      setEnviandoNota(false);
    }
  };

  const abrirModalSecretarias = async (requisicaoId: string) => {
    setRequisicaoSelecionada(requisicaoId);
    setModalSecretariasAberto(true);
    setCarregandoSecretarias(true);

    try {
      const { data, error } = await supabase
        .from("secretarias")
        .select("id, nome, email")
        .eq("prefeitura_id", session?.prefeitura_id)
        .order("nome");

      if (error) throw error;

      setSecretarias(data || []);
    } catch (error) {
      console.error("Erro ao carregar secretarias:", error);
      alert("❌ Erro ao carregar secretarias");
    } finally {
      setCarregandoSecretarias(false);
    }
  };

  const enviarParaSecretarias = async () => {
    if (secretariasSelecionadas.length === 0) {
      alert("❌ Selecione pelo menos uma secretaria");
      return;
    }

    if (!requisicaoSelecionada || !session) return;

    setEnviandoParaSecretarias(true);

    try {
      const response = await fetch("/api/fornecedor/send-nota-fiscal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requisicaoId: requisicaoSelecionada,
          secretariaIds: secretariasSelecionadas,
          fornecedorId: session.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao enviar");
      }

      const data = await response.json();
      const secretariasNomes = secretarias
        .filter((s) => secretariasSelecionadas.includes(s.id))
        .map((s) => s.nome)
        .join(", ");

      alert(`✅ Nota enviada para: ${secretariasNomes}`);

      setModalSecretariasAberto(false);
      setSecretariasSelecionadas([]);
      setRequisicaoSelecionada(null);
      setSecretarias([]);

      // Recarrega os dados
      await verificarSessao();
    } catch (error) {
      console.error("Erro ao enviar:", error);
      alert("❌ Erro ao enviar nota: " + (error as any).message);
    } finally {
      setEnviandoParaSecretarias(false);
    }
  };

  const removerNotaFiscal = async (requisicaoId: string, nomeArquivo: string) => {
    if (!confirm("Tem certeza que deseja remover este arquivo?")) return;

    try {
      const response = await fetch("/api/fornecedor/delete-nota-fiscal", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requisicaoId, nomeArquivo }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ${response.status}: ${errorText}`);
      }

      setRequisicoes(
        requisicoes.map((req) =>
          req.id === requisicaoId
            ? {
                ...req,
                nota_fiscal_url: undefined,
                nota_fiscal_arquivo: undefined,
              }
            : req
        )
      );

      alert("✅ Arquivo removido com sucesso!");
    } catch (error) {
      console.error("Erro ao remover arquivo:", error);
      alert("❌ Erro ao remover arquivo: " + (error as any).message);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Carregando requisições..." />;
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
                    className="flex items-center justify-between p-4 border-2 border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition"
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
                              : req.status === "Nota Enviada"
                              ? "bg-blue-100 text-blue-700"
                              : req.status === "Aguardando nota fiscal"
                              ? req.nota_fiscal_arquivo
                                ? "bg-green-100 text-green-700"
                                : "bg-red-200 text-red-800 font-bold"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {req.status === "pendente"
                            ? "⏳ Pendente"
                            : req.status === "aprovada"
                            ? "✅ Aprovada"
                            : req.status === "Nota Enviada"
                            ? "✉️ Nota Enviada"
                            : req.status === "Aguardando nota fiscal"
                            ? req.nota_fiscal_arquivo
                              ? "📄 Nota Anexada"
                              : "⏳ Aguardando nota fiscal"
                            : req.status}
                        </span>
                        {req.status === "Aguardando nota fiscal" && !req.nota_fiscal_arquivo && (
                          <button
                            onClick={() => {
                              setRequisicaoSelecionada(req.id);
                              setModalNotaFiscalAberto(true);
                            }}
                            className="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-medium rounded transition"
                            title="Anexar nota fiscal"
                          >
                            📎 Anexar nota
                          </button>
                        )}
                        {req.nota_fiscal_arquivo && req.status !== "Nota Enviada" && (
                          <div className="flex items-center gap-2">
                            <a
                              href={req.nota_fiscal_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 text-xs font-medium rounded transition cursor-pointer"
                              title="Abrir nota fiscal"
                            >
                              📄 {req.nota_fiscal_arquivo.split("/")[1]?.substring(0, 20)}...
                            </a>
                            <button
                              onClick={() => removerNotaFiscal(req.id, req.nota_fiscal_arquivo!)}
                              className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded transition"
                              title="Remover arquivo"
                            >
                              ✖ Remover
                            </button>
                          </div>
                        )}
                        {req.nota_fiscal_arquivo && req.status === "Nota Enviada" && (
                          <button
                            onClick={() => baixarNotaFiscal(req.id)}
                            className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-medium rounded transition cursor-pointer"
                            title="Abrir PDF da nota fiscal"
                          >
                            📥 Ver PDF
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {req.nota_fiscal_arquivo && req.status !== "Nota Enviada" && (
                        <button
                          onClick={() => abrirModalSecretarias(req.id)}
                          className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded transition"
                          title="Enviar ou atualizar nota fiscal"
                        >
                          📤 Enviar nota
                        </button>
                      )}
                      <button
                        onClick={() => router.push(`/fornecedor/requisicoes/${req.id}`)}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded transition"
                      >
                        Visualizar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Enviar Nota Fiscal */}
      {modalNotaFiscalAberto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">📄 Enviar Nota Fiscal</h2>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file && file.type === "application/pdf") {
                  enviarNotaFiscal(file);
                } else {
                  alert("❌ Por favor, selecione um arquivo PDF");
                }
              }}
              className="border-2 border-dashed border-blue-400 rounded-lg p-8 text-center mb-4 hover:bg-blue-50 transition cursor-pointer"
            >
              <p className="text-gray-600 mb-2">Arraste e solte o PDF aqui</p>
              <p className="text-sm text-gray-500 mb-4">ou</p>
              <label className="inline-block">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.type !== "application/pdf") {
                        alert("❌ Por favor, selecione um arquivo PDF");
                        return;
                      }
                      if (file.size > 5 * 1024 * 1024) {
                        alert("❌ Arquivo muito grande. Máximo 5MB");
                        return;
                      }
                      enviarNotaFiscal(file);
                    }
                  }}
                  disabled={enviandoNota}
                  className="hidden"
                />
                <span className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded cursor-pointer transition inline-block disabled:opacity-50">
                  Selecionar arquivo
                </span>
              </label>
            </div>

            {enviandoNota && (
              <div className="text-center mb-4">
                <div className="inline-block w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin mb-2"></div>
                <p className="text-gray-600 text-sm">Enviando arquivo...</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setModalNotaFiscalAberto(false);
                  setRequisicaoSelecionada(null);
                }}
                disabled={enviandoNota}
                className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium rounded transition disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Secretarias */}
      {modalSecretariasAberto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">🏢 Secretarias da Prefeitura</h2>

            {carregandoSecretarias ? (
              <div className="text-center py-8">
                <div className="inline-block w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin mb-2"></div>
                <p className="text-gray-600 text-sm">Carregando secretarias...</p>
              </div>
            ) : secretarias.length === 0 ? (
              <p className="text-gray-600 text-center py-8">Nenhuma secretaria encontrada</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto mb-6">
                {secretarias.map((sec) => (
                  <label
                    key={sec.id}
                    className="flex items-start p-4 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={secretariasSelecionadas.includes(sec.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSecretariasSelecionadas([...secretariasSelecionadas, sec.id]);
                        } else {
                          setSecretariasSelecionadas(
                            secretariasSelecionadas.filter((id) => id !== sec.id)
                          );
                        }
                      }}
                      className="mt-1 mr-3 w-4 h-4 cursor-pointer"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{sec.nome}</h3>
                      {sec.email && <p className="text-xs text-gray-600 mt-1">{sec.email}</p>}
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setModalSecretariasAberto(false);
                  setRequisicaoSelecionada(null);
                  setSecretarias([]);
                  setSecretariasSelecionadas([]);
                }}
                disabled={enviandoParaSecretarias}
                className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium rounded transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={enviarParaSecretarias}
                disabled={enviandoParaSecretarias || secretariasSelecionadas.length === 0}
                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded transition disabled:opacity-50"
              >
                📤 Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
