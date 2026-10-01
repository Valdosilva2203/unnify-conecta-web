"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import FornecedorSidebar from "@/app/components/FornecedorSidebar";

interface Chamado {
  id: string;
  titulo: string;
  descricao: string;
  status: "pendente" | "atribuida" | "em_andamento" | "em_requisicao" | "finalizada" | "cancelada";
  prioridade: "baixa" | "normal" | "urgente";
  created_at: string;
  criador_nome?: string;
}

interface Justificativa {
  id: string;
  descricao: string;
  created_at: string;
}

interface Contrato {
  id: string;
  numero: string;
  descricao: string;
  valor: number;
  status: "ativo" | "concluido" | "cancelado";
}

export default function DetalheChamadoPage() {
  const params = useParams();
  const router = useRouter();
  const chamadoId = params.chamadoId as string;

  const [menuAberto, setMenuAberto] = useState(true);
  const [chamado, setChamado] = useState<Chamado | null>(null);
  const [justificativas, setJustificativas] = useState<Justificativa[]>([]);
  const [loading, setLoading] = useState(true);
  const [novaJustificativa, setNovaJustificativa] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [abrirFormularioObjeto, setAbrirFormularioObjeto] = useState(false);
  const [novoObjeto, setNovoObjeto] = useState("");
  const [objetos, setObjetos] = useState<{ id: string; numero: string; descricao: string }[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [carregandoContratos, setCarregandoContratos] = useState(false);

  useEffect(() => {
    carregarChamado();
  }, [chamadoId]);

  const carregarChamado = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("chamados")
        .select("*")
        .eq("id", chamadoId)
        .single();

      if (error) throw error;
      setChamado(data);

      await carregarJustificativas();
    } catch (error) {
      console.error("Erro ao carregar chamado:", error);
    } finally {
      setLoading(false);
    }
  };

  const carregarJustificativas = async () => {
    try {
      const response = await fetch(`/api/fornecedor/justificativas?chamado_id=${chamadoId}`);
      if (response.ok) {
        const { justificativas: justs } = await response.json();
        setJustificativas(justs || []);
      }
    } catch (error) {
      console.error("Erro ao buscar justificativas:", error);
    }
  };

  const adicionarJustificativa = async () => {
    if (!novaJustificativa.trim()) return;

    try {
      setAdicionando(true);
      const response = await fetch(`/api/fornecedor/justificativas?chamado_id=${chamadoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: novaJustificativa }),
      });

      if (!response.ok) throw new Error("Erro ao adicionar justificativa");

      setNovaJustificativa("");
      await carregarJustificativas();
    } catch (error) {
      console.error("Erro ao adicionar justificativa:", error);
    } finally {
      setAdicionando(false);
    }
  };

  const deletarJustificativa = async (justificativaId: string) => {
    try {
      const response = await fetch(`/api/fornecedor/justificativas?id=${justificativaId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Erro ao deletar justificativa");
      await carregarJustificativas();
    } catch (error) {
      console.error("Erro ao deletar justificativa:", error);
    }
  };

  const adicionarObjeto = () => {
    if (novoObjeto.trim()) {
      setObjetos([...objetos, novoObjeto]);
      setNovoObjeto("");
      setAbrirFormularioObjeto(false);
    }
  };

  const removerObjeto = (index: number) => {
    setObjetos(objetos.filter((_, i) => i !== index));
  };

  const carregarContratos = async () => {
    try {
      setCarregandoContratos(true);
      const sessionStr = localStorage.getItem("fornecedor_session");
      const session = sessionStr ? JSON.parse(sessionStr) : null;

      if (!session) return;

      const { data, error } = await supabase
        .from("contratos")
        .select("*")
        .eq("fornecedor_id", session.id)
        .eq("prefeitura_id", session.prefeitura_id)
        .eq("status", "ativo");

      if (error) throw error;
      setContratos(data || []);
    } catch (error) {
      console.error("Erro ao carregar contratos:", error);
    } finally {
      setCarregandoContratos(false);
    }
  };

  const adicionarContratoComoObjeto = (contrato: Contrato) => {
    setObjetos([...objetos, {
      id: contrato.id,
      numero: contrato.numero,
      descricao: contrato.descricao
    }]);
    setAbrirFormularioObjeto(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">⏳</div>
          <p className="text-gray-700 text-lg font-medium">Carregando chamado...</p>
        </div>
      </div>
    );
  }

  if (!chamado) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-700 text-lg font-medium">Chamado não encontrado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <FornecedorSidebar
        menuAberto={menuAberto}
        onToggleMenu={() => setMenuAberto(!menuAberto)}
        currentPage="dashboard"
      />

      <div className="flex-1 flex flex-col">
        <div className="bg-white shadow px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📞 {chamado.titulo}</h1>
          </div>
          <button
            onClick={() => setMenuAberto(!menuAberto)}
            className="text-2xl hover:bg-gray-100 p-2 rounded-lg transition"
          >
            ☰
          </button>
        </div>

        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md p-8">
            {/* Detalhes do Chamado */}
            <div className="space-y-6 mb-8">
              <div>
                <p className="text-xs font-bold text-gray-600 uppercase">Descrição</p>
                <p className="text-gray-700 mt-2 text-lg">{chamado.descricao}</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-bold text-gray-600 uppercase">Prioridade</p>
                  <span
                    className={`inline-block px-4 py-2 rounded-full text-sm font-semibold border mt-2 ${
                      chamado.prioridade === "urgente"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : chamado.prioridade === "normal"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}
                  >
                    🔴{" "}
                    {chamado.prioridade === "urgente"
                      ? "Urgente"
                      : chamado.prioridade === "normal"
                        ? "Normal"
                        : "Baixa"}
                  </span>
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-600 uppercase">Status</p>
                  <span
                    className={`inline-block px-4 py-2 rounded-full text-sm font-semibold mt-2 ${
                      chamado.status === "pendente"
                        ? "bg-orange-100 text-orange-700"
                        : chamado.status === "em_andamento"
                          ? "bg-blue-100 text-blue-700"
                          : chamado.status === "em_requisicao"
                            ? "bg-cyan-100 text-cyan-700"
                            : chamado.status === "finalizada"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    •{" "}
                    {chamado.status === "em_andamento"
                      ? "Em Andamento"
                      : chamado.status === "em_requisicao"
                        ? "Em Requisição"
                        : chamado.status === "finalizada"
                          ? "Finalizada"
                          : chamado.status === "pendente"
                            ? "Pendente"
                            : chamado.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-bold text-gray-600 uppercase">Criador</p>
                  <p className="text-gray-700 mt-2 text-lg font-medium">{chamado.criador_nome || "—"}</p>
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-600 uppercase">Data de Criação</p>
                  <p className="text-gray-700 mt-2 text-lg font-medium">
                    {new Date(chamado.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
            </div>

            {/* Objetos */}
            <div className="border-t pt-8 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900">📦 Objetos</h3>
                <button
                  onClick={() => {
                    setAbrirFormularioObjeto(true);
                    carregarContratos();
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  + Adicionar Objeto
                </button>
              </div>

              {objetos.length > 0 ? (
                <div className="space-y-3 mb-6">
                  {objetos.map((objeto, index) => (
                    <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <p className="text-gray-700 font-bold">{objeto.numero}</p>
                        <p className="text-sm text-gray-600 mt-1">{objeto.descricao}</p>
                      </div>
                      <button
                        onClick={() => removerObjeto(index)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-100 p-2 rounded-full transition flex-shrink-0"
                        title="Remover objeto"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500 mb-6">
                  Nenhum objeto adicionado
                </div>
              )}

              {abrirFormularioObjeto && (
                <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200 mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-sm font-medium text-gray-700">Selecione um Contrato</p>
                    <button
                      onClick={() => setAbrirFormularioObjeto(false)}
                      className="text-gray-600 hover:text-gray-900 text-xl"
                    >
                      ✕
                    </button>
                  </div>

                  {carregandoContratos ? (
                    <div className="text-center py-4 text-gray-600">
                      <div className="animate-spin inline-block text-2xl mb-2">⏳</div>
                      <p>Carregando contratos...</p>
                    </div>
                  ) : contratos.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {contratos.map((contrato) => (
                        <button
                          key={contrato.id}
                          onClick={() => adicionarContratoComoObjeto(contrato)}
                          className="w-full text-left p-3 bg-white border border-gray-300 rounded-lg hover:bg-blue-100 hover:border-blue-500 transition"
                        >
                          <p className="font-bold text-gray-900">{contrato.numero}</p>
                          <p className="text-sm text-gray-600 mt-1">{contrato.descricao}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            R$ {(contrato.valor || 0).toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-600">
                      <p>Nenhum contrato ativo vinculado a essa prefeitura</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Justificativas */}
            <div className="border-t pt-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">
                📝 Justificativas ({justificativas.length}/3)
              </h3>

              {justificativas.length > 0 ? (
                <div className="space-y-4 mb-8">
                  {justificativas.map((just) => (
                    <div key={just.id} className="bg-gray-50 p-4 rounded-lg border-l-4 border-blue-500 flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <p className="text-gray-700">{just.descricao}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          {new Date(just.created_at).toLocaleDateString("pt-BR", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <button
                        onClick={() => deletarJustificativa(just.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-100 p-2 rounded-full transition flex-shrink-0"
                        title="Remover justificativa"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 mb-8">
                  Nenhuma justificativa adicionada
                </div>
              )}

              {/* Adicionar Justificativa */}
              {justificativas.length < 3 && (
                <div className="border-t pt-6">
                  <p className="text-sm font-medium text-gray-700 mb-4">
                    Adicionar Justificativa ({justificativas.length}/3)
                  </p>
                  <textarea
                    value={novaJustificativa}
                    onChange={(e) => setNovaJustificativa(e.target.value)}
                    placeholder="Descreva a justificativa..."
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg mb-4 focus:border-blue-500 focus:outline-none resize-none"
                    rows={4}
                  />
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => router.back()}
                      className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={adicionarJustificativa}
                      disabled={!novaJustificativa.trim() || adicionando}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
                    >
                      {adicionando ? "Adicionando..." : "Adicionar"}
                    </button>
                  </div>
                </div>
              )}

              {justificativas.length >= 3 && (
                <div className="border-t pt-6 text-center">
                  <p className="text-sm font-medium text-gray-700 mb-4">
                    ✅ Você atingiu o limite de 3 justificativas
                  </p>
                  <button
                    onClick={() => router.back()}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                  >
                    Voltar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
