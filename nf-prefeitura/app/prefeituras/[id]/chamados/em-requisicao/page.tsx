"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import TopNavBar from "@/components/TopNavBar";
import { supabase } from "@/lib/supabase";
import { usePrefeituraAuth } from "@/hooks/usePrefeituraAuth";

interface Chamado {
  id: string;
  titulo: string;
  descricao: string;
  prioridade: "baixa" | "normal" | "urgente";
  status: "pendente" | "atribuida" | "em_andamento" | "em_requisicao" | "finalizada" | "cancelada";
  created_at: string;
  criado_por: string;
  fornecedor_id?: string;
  fornecedor_nome?: string;
}

const prioridadeConfig = {
  urgente: { icon: "🔴", label: "Urgente", badge: "bg-red-50 text-red-700 border-red-200" },
  normal: { icon: "🟡", label: "Normal", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  baixa: { icon: "🟢", label: "Baixa", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const statusConfig = {
  pendente: { icon: "⏳", label: "Pendente", color: "from-orange-500 to-orange-600" },
  atribuida: { icon: "👤", label: "Atribuída", color: "from-blue-500 to-blue-600" },
  em_andamento: { icon: "⚙️", label: "Em Andamento", color: "from-purple-500 to-purple-600" },
  em_requisicao: { icon: "📄", label: "Em Requisição", color: "from-cyan-500 to-cyan-600" },
  finalizada: { icon: "✅", label: "Finalizada", color: "from-green-500 to-green-600" },
  cancelada: { icon: "❌", label: "Cancelada", color: "from-gray-400 to-gray-600" },
};

export default function ChamadosEmRequisicaoPage() {
  const params = useParams();
  const router = useRouter();
  const prefeituraId = params.id as string;
  const { session } = usePrefeituraAuth();

  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const [modalChamado, setModalChamado] = useState<Chamado | null>(null);
  const [fornecedorBusca, setFornecedorBusca] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [contratoModal, setContratoModal] = useState<any>(null);

  useEffect(() => {
    if (session?.id) {
      loadChamados();
    }
  }, [session?.id]);

  useEffect(() => {
    const handleClickOutside = () => {
      setMenuAbertoId(null);
    };

    if (menuAbertoId) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [menuAbertoId]);

  useEffect(() => {
    if (modalChamado) {
      carregarContratoDoModal(modalChamado.id);
    }
  }, [modalChamado]);

  const carregarContratosDoModal = async (chamadoId: string) => {
    try {
      console.log("🔍 Buscando consumo_objetos para chamadoId:", chamadoId);

      // Buscar objetos consumidos no chamado
      const { data: consumoData, error: consumoError } = await supabase
        .from("consumo_objetos")
        .select("objeto_id")
        .eq("chamado_id", chamadoId)
        .eq("tipo", "chamado");

      console.log("📦 Consumo data:", consumoData, "Error:", consumoError);

      if (consumoError) throw consumoError;

      if (!consumoData || consumoData.length === 0) {
        console.log("⚠️ Nenhum objeto consumido encontrado");
        setContratosModal([]);
        return;
      }

      // Extrair IDs de objetos
      const objetoIds = consumoData.map(c => c.objeto_id);
      console.log("🎯 Objeto IDs:", objetoIds);

      // Buscar detalhes dos objetos e contratos
      const { data: objetosData, error: objetosError } = await supabase
        .from("objetos_contratos")
        .select("id, numero, descricao, valor_unitario, contrato_id")
        .in("id", objetoIds);

      console.log("📋 Objetos data:", objetosData, "Error:", objetosError);

      if (objetosError) throw objetosError;

      if (!objetosData || objetosData.length === 0) {
        console.log("⚠️ Nenhum objeto_contrato encontrado");
        setContratosModal([]);
        return;
      }

      // Extrair IDs de contratos únicos
      const contratoIds = [...new Set(objetosData.map(o => o.contrato_id))];
      console.log("🔗 Contrato IDs:", contratoIds);

      // Buscar detalhes dos contratos
      const { data: contratosData, error: contratosError } = await supabase
        .from("contratos")
        .select("id, numero, descricao, valor")
        .in("id", contratoIds);

      console.log("✅ Contratos data:", contratosData, "Error:", contratosError);

      if (contratosError) throw contratosError;

      setContratosModal(contratosData || []);
    } catch (error) {
      console.error("❌ Erro ao carregar contratos:", error);
      setContratosModal([]);
    }
  };

  const loadChamados = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("chamados")
        .select(`
          *,
          fornecedores!fornecedor_id(nome)
        `)
        .eq("prefeitura_id", prefeituraId)
        .eq("status", "em_requisicao")
        .eq("criado_por", session?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const chamadosComNome = (data || []).map((c: any) => ({
        ...c,
        fornecedor_nome: c.fornecedores?.nome || "—"
      }));

      setChamados(chamadosComNome);
    } catch (error) {
      console.error("❌ Erro ao carregar chamados:", error);
    } finally {
      setLoading(false);
    }
  };

  const carregarContratoDoModal = async (chamadoId: string) => {
    try {
      // Buscar consumo_objetos do chamado
      const { data: consumo } = await supabase
        .from("consumo_objetos")
        .select("objeto_id")
        .eq("chamado_id", chamadoId)
        .eq("tipo", "chamado")
        .limit(1);

      if (!consumo || consumo.length === 0) {
        setContratoModal(null);
        return;
      }

      const objetoId = consumo[0].objeto_id;

      // Buscar contrato via objeto
      const { data: objetos } = await supabase
        .from("objetos_contratos")
        .select("contrato_id")
        .eq("id", objetoId)
        .limit(1);

      if (!objetos || objetos.length === 0) {
        setContratoModal(null);
        return;
      }

      const contratoId = objetos[0].contrato_id;

      // Buscar detalhes do contrato
      const { data: contrato } = await supabase
        .from("contratos")
        .select("id, numero, descricao, valor")
        .eq("id", contratoId)
        .single();

      setContratoModal(contrato);
    } catch (error) {
      console.error("Erro ao carregar contrato:", error);
      setContratoModal(null);
    }
  };

  const gerarRequisicao = (chamado: Chamado) => {
    setMenuAbertoId(null);
    setModalChamado(chamado);
    setFornecedorBusca(chamado.fornecedor_nome || "");
    setObservacoes("");
  };

  const criarRequisicao = async () => {
    if (!fornecedorBusca.trim()) {
      alert("Por favor, selecione um fornecedor");
      return;
    }

    if (!modalChamado) return;

    try {
      // Criar requisição com dados do chamado
      const { error } = await supabase
        .from("requisicoes")
        .insert([{
          chamado_id: modalChamado.id,
          fornecedor_id: modalChamado.fornecedor_id,
          prefeitura_id: prefeituraId,
          secretaria_id: session?.secretaria_id,
          observacoes: observacoes,
          status: "pendente"
        }]);

      if (error) throw error;

      alert("Requisição criada com sucesso!");
      setModalChamado(null);
      setFornecedorBusca("");
      setObservacoes("");
      await loadChamados();
    } catch (error) {
      console.error("❌ Erro ao criar requisição:", error);
      alert("Erro ao criar requisição");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      <TopNavBar
        title="Chamados em Requisição"
        subtitle="Chamados aguardando confirmação da finalização"
        tabs={[{ id: "em-requisicao", label: "Em Requisição" }]}
        activeTab="em-requisicao"
        onTabChange={() => {}}
        onExport={() => console.log("Exportando...")}
        userName={session?.nome || "Usuário"}
        userRole={session?.cargo || "Prefeitura"}
      />

      <div className="p-8 w-full max-w-[2280px] mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-6 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition"
        >
          ← Voltar
        </button>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin text-6xl mb-4">⏳</div>
            <p className="text-gray-600 font-bold text-lg">Carregando chamados...</p>
          </div>
        ) : chamados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <p className="text-4xl mb-4">📭</p>
            <p className="text-xl font-semibold">Nenhum chamado em requisição</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white">
                <tr>
                  <th className="px-6 py-4 text-left font-semibold">CHAMADO</th>
                  <th className="px-6 py-4 text-left font-semibold">DESCRIÇÃO</th>
                  <th className="px-6 py-4 text-left font-semibold">PRIORIDADE</th>
                  <th className="px-6 py-4 text-left font-semibold">DATA</th>
                  <th className="px-6 py-4 text-left font-semibold">FORNECEDOR</th>
                  <th className="px-6 py-4 text-center font-semibold">AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {chamados.map((chamado, idx) => (
                  <tr
                    key={chamado.id}
                    className={`${
                      idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                    } border-b border-gray-200 hover:bg-blue-50 transition cursor-pointer`}
                    onClick={() => router.push(`/chamados/${chamado.id}`)}
                  >
                    <td className="px-6 py-4 font-semibold text-gray-900">{chamado.titulo}</td>
                    <td className="px-6 py-4 text-gray-700 text-sm">{chamado.descricao || "—"}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${
                          prioridadeConfig[chamado.prioridade].badge
                        }`}
                      >
                        {prioridadeConfig[chamado.prioridade].icon} {prioridadeConfig[chamado.prioridade].label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm">
                      {chamado.created_at
                        ? new Date(chamado.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric"
                          })
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-gray-700">{chamado.fornecedor_nome || "—"}</td>
                    <td className="px-6 py-4 text-center relative">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          ref={(el) => {
                            if (el) menuRefs.current[chamado.id] = el;
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (menuAbertoId === chamado.id) {
                              setMenuAbertoId(null);
                            } else {
                              const rect = menuRefs.current[chamado.id]?.getBoundingClientRect();
                              if (rect) {
                                setMenuPos({
                                  top: rect.bottom + 8,
                                  left: rect.left - 180
                                });
                              }
                              setMenuAbertoId(chamado.id);
                            }
                          }}
                          className="p-2 hover:bg-gray-200 rounded-full transition"
                        >
                          ⋮
                        </button>
                      </div>

                      {menuAbertoId === chamado.id && (
                        <div
                          className="fixed w-48 bg-white border border-gray-300 rounded-lg shadow-2xl z-50"
                          style={{
                            top: `${menuPos.top}px`,
                            left: `${menuPos.left}px`
                          }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              gerarRequisicao(chamado);
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-blue-50 transition text-sm font-medium text-gray-700 flex items-center gap-2"
                          >
                            📋 Gerar Requisição
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal Nova Requisição */}
        {modalChamado && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Nova Requisição</h2>
                  <p className="text-sm text-gray-600 mt-1">Chamado: {modalChamado.titulo}</p>
                </div>
                <button
                  onClick={() => setModalChamado(null)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* Fornecedor (pré-preenchido) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fornecedor
                  </label>
                  <input
                    type="text"
                    value={fornecedorBusca}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                  />
                </div>

                {/* Contrato */}
                {contratoModal && (
                  <div className="bg-cyan-50 border border-cyan-300 rounded-lg p-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Contrato</p>
                    <p className="font-semibold text-gray-900">✓ {contratoModal.numero}</p>
                    <p className="text-sm text-gray-600">{contratoModal.descricao}</p>
                    <p className="text-sm text-gray-700 mt-2">
                      <strong>Valor:</strong> R$ {(contratoModal.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}

                {/* Contratos Adicionados */}
                {contratosModal.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Contratos Adicionados
                    </label>
                    <div className="space-y-2">
                      {contratosModal.map((contrato) => (
                        <div key={contrato.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <p className="font-semibold text-gray-900">{contrato.numero}</p>
                          <p className="text-sm text-gray-600">{contrato.descricao}</p>
                          <p className="text-sm text-gray-700 mt-1">
                            <strong>Valor:</strong> R$ {(contrato.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Observações */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Observações
                  </label>
                  <textarea
                    placeholder="Digite observações adicionais (opcional)"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  />
                </div>

                {/* Botões */}
                <div className="flex gap-4">
                  <button
                    onClick={criarRequisicao}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 px-4 rounded-lg transition"
                  >
                    Criar Requisição
                  </button>
                  <button
                    onClick={() => setModalChamado(null)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium py-3 px-4 rounded-lg transition"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
