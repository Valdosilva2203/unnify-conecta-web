"use client";

import { useState, useEffect, useRef } from "react";
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

interface PrefeituraData {
  id: string;
  nome: string;
  estado: string;
}

interface Chamado {
  id: string;
  titulo: string;
  descricao: string;
  status: "pendente" | "atribuida" | "em_andamento" | "em_requisicao" | "finalizada" | "cancelada";
  prioridade: "baixa" | "normal" | "urgente";
  created_at: string;
  data_finalizacao?: string;
  fornecedor_id: string;
  prefeitura_id: string;
  criador_nome?: string;
  secretarias?: { nome: string };
}

export default function MeusChamados() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [prefeitura, setPrefeitura] = useState<PrefeituraData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [menuAberto, setMenuAberto] = useState(true);
  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null);
  const [modalFinalizacao, setModalFinalizacao] = useState<string | null>(null);
  const [justificativaText, setJustificativaText] = useState("");
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const [modalJustificativas, setModalJustificativas] = useState<string | null>(null);
  const [justificativas, setJustificativas] = useState<{ [key: string]: any[] }>({});
  const [novaJustificativa, setNovaJustificativa] = useState("");
  const [modalDetalhes, setModalDetalhes] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    verificarSessao();
  }, []);

  useEffect(() => {
    if (modalDetalhes) {
      buscarJustificativas(modalDetalhes);
    }
  }, [modalDetalhes]);

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

      try {
        const response = await fetch(
          `/api/fornecedor/meus-chamados?fornecedor_id=${sessionData.id}&prefeitura_id=${sessionData.prefeitura_id}`
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

      const { error } = await supabase
        .from("chamados")
        .update({ status: novoStatus })
        .eq("id", chamadoId);

      if (error) throw error;

      setChamados(chamados.map(c => c.id === chamadoId ? { ...c, status: novoStatus as any } : c));
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      alert("Erro ao atualizar status");
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

      const chamado = chamados.find(c => c.id === modalFinalizacao);
      if (!chamado) throw new Error("Chamado não encontrado");

      const { error } = await supabase
        .from("notificacoes")
        .insert([{
          tipo: "chamado_aguardando_confirmacao",
          usuario_id: chamado.criado_por || "unknown",
          prefeitura_id: chamado.prefeitura_id,
          referencia_id: chamado.id,
          mensagem: `O fornecedor finalizou o chamado "${chamado.titulo}". Confirme se o serviço foi realmente concluído.`,
          lida: false
        }]);

      if (error) {
        console.error("❌ Erro ao inserir notificação:", error);
        throw error;
      }

      console.log("✅ Notificação enviada com sucesso!");
      alert("✅ Notificação enviada! Aguardando confirmação do criador.");
      setModalFinalizacao(null);
      setJustificativaText("");
    } catch (error) {
      console.error("❌ Erro ao finalizar:", error);
    } finally {
      setAtualizando(null);
    }
  };

  const buscarJustificativas = async (chamadoId: string) => {
    try {
      const response = await fetch(`/api/fornecedor/justificativas?chamado_id=${chamadoId}`);
      if (response.ok) {
        const { justificativas: justs } = await response.json();
        setJustificativas(prev => ({ ...prev, [chamadoId]: justs || [] }));
      }
    } catch (error) {
      console.error("Erro ao buscar justificativas:", error);
    }
  };

  const abrirModalJustificativas = (chamadoId: string) => {
    setModalJustificativas(chamadoId);
    setNovaJustificativa("");
    buscarJustificativas(chamadoId);
  };

  const deletarJustificativa = async (justificativaId: string) => {
    try {
      setAtualizando(justificativaId);
      const response = await fetch(`/api/fornecedor/justificativas?id=${justificativaId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Erro ao deletar justificativa");

      if (modalJustificativas) {
        await buscarJustificativas(modalJustificativas);
      }
    } catch (error) {
      console.error("Erro ao deletar justificativa:", error);
    } finally {
      setAtualizando(null);
    }
  };

  const adicionarJustificativa = async () => {
    if (!modalJustificativas || !novaJustificativa.trim()) return;

    try {
      setAtualizando(modalJustificativas);
      const response = await fetch(`/api/fornecedor/justificativas?chamado_id=${modalJustificativas}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: novaJustificativa }),
      });

      const json = await response.json();

      if (!response.ok) {
        console.error("Erro na API:", json);
        throw new Error(json?.error || "Erro ao adicionar justificativa");
      }

      await buscarJustificativas(modalJustificativas);
      setNovaJustificativa("");
    } catch (error) {
      console.error("Erro ao adicionar justificativa:", error);
    } finally {
      setAtualizando(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4">
            <div className="inline-block w-12 h-12 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
          <p className="text-gray-600 text-sm font-medium">Carregando chamados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <FornecedorSidebar
        menuAberto={menuAberto}
        onToggleMenu={() => setMenuAberto(!menuAberto)}
        currentPage="meus-chamados"
        onLogout={handleLogout}
        prefeituraId={session?.prefeitura_id}
      />

      <div className="flex-1 flex flex-col">
        <FornecedorTopNavBar
          userName={session?.nome || "Fornecedor"}
          prefeituraName={prefeitura?.nome}
          prefeituraEstado={prefeitura?.estado}
          onMenuToggle={() => setMenuAberto(!menuAberto)}
          onLogout={handleLogout}
        />

        <div className="flex-1 overflow-auto p-8">
          <div className="bg-white rounded-xl shadow-md p-8 overflow-visible">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">🎫 Meus Chamados ({chamados.length})</h2>
            {chamados.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">Nenhum chamado no momento</p>
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-visible">
                <table className="w-full">
                  <thead className="border-b-2 border-gray-300 bg-gradient-to-r from-indigo-50 to-blue-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-bold text-indigo-600">CHAMADO</th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-indigo-600">DESCRIÇÃO</th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-indigo-600">PRIORIDADE</th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-indigo-600">STATUS</th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-indigo-600">CRIADOR</th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-indigo-600">VINCULADO A</th>
                      <th className="px-6 py-4 text-right text-sm font-bold text-indigo-600">AÇÕES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {chamados.map((chamado) => (
                      <tr key={chamado.id} className="hover:bg-blue-50 transition cursor-pointer" onClick={() => router.push(`/fornecedor/chamados/${chamado.id}`)}>
                        <td className="px-6 py-4">
                          <span className="font-bold text-gray-900">{chamado.titulo}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-700 line-clamp-2">{chamado.descricao}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border max-w-xs truncate ${
                              chamado.prioridade === "urgente"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : chamado.prioridade === "normal"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                            title={chamado.prioridade === "urgente" ? "Urgente" : chamado.prioridade === "normal" ? "Normal" : "Baixa"}
                          >
                            🔴 {chamado.prioridade === "urgente" ? "Urgente" : chamado.prioridade === "normal" ? "Normal" : "Baixa"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold max-w-xs truncate ${
                              chamado.status === "pendente"
                                ? "bg-orange-100 text-orange-700"
                                : chamado.status === "em_andamento"
                                  ? "bg-blue-100 text-blue-700"
                                  : chamado.status === "finalizada"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-gray-100 text-gray-700"
                            }`}
                            title={chamado.status === "em_andamento" ? "Em Andamento" : chamado.status === "finalizada" ? "Finalizada" : chamado.status === "pendente" ? "Pendente" : chamado.status}
                          >
                            • {chamado.status === "em_andamento" ? "Em Andamento" : chamado.status === "finalizada" ? "Finalizada" : chamado.status === "pendente" ? "Pendente" : chamado.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700 font-medium max-w-xs truncate" title={chamado.criador_nome}>
                          {chamado.criador_nome || "—"}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium max-w-xs truncate" title={chamado.secretarias?.nome || "Secretaria"}>
                            {chamado.secretarias?.nome || "Secretaria"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (menuAbertoId === chamado.id) {
                                setMenuAbertoId(null);
                                setMenuPos(null);
                              } else {
                                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                setMenuPos({
                                  top: rect.bottom + 8,
                                  left: rect.left - 180
                                });
                                setMenuAbertoId(chamado.id);
                              }
                            }}
                            disabled={chamado.status === "em_requisicao" || chamado.status === "finalizada"}
                            className={`p-2 rounded-full transition font-bold text-lg ${
                              chamado.status === "em_requisicao" || chamado.status === "finalizada"
                                ? "text-gray-300 cursor-not-allowed opacity-50"
                                : "hover:bg-gray-200 text-gray-600"
                            }`}
                          >
                            ⋮
                          </button>
                          {menuAbertoId === chamado.id && menuPos && (
                            <div
                              className="fixed bg-white border-2 border-gray-200 rounded-lg shadow-2xl z-[9999] w-56"
                              style={{
                                top: `${menuPos.top}px`,
                                left: `${menuPos.left}px`
                              }}
                            >
                              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                                <p className="text-sm font-bold text-gray-800">AÇÕES</p>
                              </div>

                              <div className="py-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    abrirModalJustificativas(chamado.id);
                                    setMenuAbertoId(null);
                                  }}
                                  disabled={(justificativas[chamado.id]?.length || 0) >= 3}
                                  className="w-full text-left px-4 py-3 hover:bg-purple-50 transition flex items-center gap-2 text-sm text-gray-700 font-medium border-b border-gray-100 mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  📝 {(justificativas[chamado.id]?.length || 0) >= 3 ? "Acabou suas Justificativas" : "Ver Justificativas"}
                                </button>

                                {chamado.status === "pendente" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleIniciar(chamado.id);
                                    }}
                                    disabled={atualizando === chamado.id}
                                    className="w-full text-left px-4 py-3 hover:bg-green-50 transition flex items-center gap-2 text-sm text-gray-700 font-medium disabled:opacity-50"
                                  >
                                    ▶️ Iniciar
                                  </button>
                                )}

                                {chamado.status === "em_andamento" && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePausar(chamado.id);
                                      }}
                                      disabled={atualizando === chamado.id}
                                      className="w-full text-left px-4 py-3 hover:bg-yellow-50 transition flex items-center gap-2 text-sm text-gray-700 font-medium border-b border-gray-100 disabled:opacity-50"
                                    >
                                      ⏸️ Pausar
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleFinalizarClick(chamado.id);
                                      }}
                                      disabled={atualizando === chamado.id}
                                      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition flex items-center gap-2 text-sm text-gray-700 font-medium disabled:opacity-50"
                                    >
                                      ✅ Finalizar
                                    </button>
                                  </>
                                )}
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

      {/* Modal Detalhes do Chamado */}
      {modalDetalhes && chamados.find(c => c.id === modalDetalhes) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModalDetalhes(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const chamado = chamados.find(c => c.id === modalDetalhes);
              return (
                <>
                  <h3 className="text-2xl font-bold text-gray-900 mb-6">📞 {chamado?.titulo}</h3>

                  <div className="space-y-4 mb-8">
                    <div>
                      <p className="text-xs font-bold text-gray-600 uppercase">Descrição</p>
                      <p className="text-gray-700 mt-1">{chamado?.descricao}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-bold text-gray-600 uppercase">Prioridade</p>
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border mt-1 ${
                          chamado?.prioridade === "urgente"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : chamado?.prioridade === "normal"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}>
                          🔴 {chamado?.prioridade === "urgente" ? "Urgente" : chamado?.prioridade === "normal" ? "Normal" : "Baixa"}
                        </span>
                      </div>

                      <div>
                        <p className="text-xs font-bold text-gray-600 uppercase">Status</p>
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mt-1 ${
                          chamado?.status === "pendente"
                            ? "bg-orange-100 text-orange-700"
                            : chamado?.status === "em_andamento"
                              ? "bg-blue-100 text-blue-700"
                              : chamado?.status === "finalizada"
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-700"
                        }`}>
                          • {chamado?.status === "em_andamento" ? "Em Andamento" : chamado?.status === "finalizada" ? "Finalizada" : chamado?.status === "pendente" ? "Pendente" : chamado?.status}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-bold text-gray-600 uppercase">Criador</p>
                        <p className="text-gray-700 mt-1">{chamado?.criador_nome || "—"}</p>
                      </div>

                      <div>
                        <p className="text-xs font-bold text-gray-600 uppercase">Data de Criação</p>
                        <p className="text-gray-700 mt-1">{new Date(chamado?.created_at).toLocaleDateString("pt-BR")}</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-6">
                    <h4 className="text-lg font-bold text-gray-900 mb-4">📝 Justificativas ({justificativas[modalDetalhes]?.length || 0}/3)</h4>

                    {justificativas[modalDetalhes] && justificativas[modalDetalhes].length > 0 ? (
                      <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
                        {justificativas[modalDetalhes].map((just: any, idx: number) => (
                          <div key={just.id || idx} className="bg-gray-50 p-4 rounded-lg border-l-4 border-blue-500">
                            <p className="text-sm text-gray-700">{just.descricao}</p>
                            <p className="text-xs text-gray-500 mt-2">
                              {new Date(just.created_at).toLocaleDateString("pt-BR", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm mb-4">Nenhuma justificativa adicionada</p>
                    )}
                  </div>

                  <div className="border-t pt-6 flex justify-end">
                    <button
                      onClick={() => setModalDetalhes(null)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                    >
                      Fechar
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal Justificativas */}
      {modalJustificativas && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModalJustificativas(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-gray-900 mb-6">📝 Justificativas</h3>

            {justificativas[modalJustificativas] && justificativas[modalJustificativas].length > 0 ? (
              <div className="mb-8 space-y-3 max-h-64 overflow-y-auto">
                {justificativas[modalJustificativas].map((just: any, idx: number) => (
                  <div key={just.id || idx} className="bg-gray-50 p-4 rounded-lg border-l-4 border-blue-500 flex justify-between items-start gap-3">
                    <div className="flex-1">
                      <p className="text-sm text-gray-700">{just.descricao}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(just.created_at).toLocaleDateString("pt-BR", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() => deletarJustificativa(just.id)}
                      disabled={atualizando === just.id}
                      className="text-red-500 hover:text-red-700 hover:bg-red-100 p-2 rounded-full transition disabled:opacity-50 flex-shrink-0"
                      title="Remover justificativa"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-8 text-center py-6 text-gray-500">
                Nenhuma justificativa adicionada ainda
              </div>
            )}

            {(justificativas[modalJustificativas]?.length || 0) < 3 && (
              <div className="border-t pt-6">
                <p className="text-sm font-medium text-gray-700 mb-3">
                  Adicionar Justificativa ({justificativas[modalJustificativas]?.length || 0}/3)
                </p>
                <textarea
                  value={novaJustificativa}
                  onChange={(e) => setNovaJustificativa(e.target.value)}
                  placeholder="Descreva a justificativa..."
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg mb-4 focus:border-blue-500 focus:outline-none resize-none"
                  rows={3}
                />
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setModalJustificativas(null)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                  >
                    Fechar
                  </button>
                  <button
                    onClick={adicionarJustificativa}
                    disabled={!novaJustificativa.trim() || atualizando === modalJustificativas}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
                  >
                    {atualizando === modalJustificativas ? "Adicionando..." : "Adicionar"}
                  </button>
                </div>
              </div>
            )}

            {(justificativas[modalJustificativas]?.length || 0) >= 3 && (
              <div className="border-t pt-6 text-center">
                <p className="text-sm font-medium text-gray-700 mb-4">✅ Você atingiu o limite de 3 justificativas</p>
                <button
                  onClick={() => setModalJustificativas(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
