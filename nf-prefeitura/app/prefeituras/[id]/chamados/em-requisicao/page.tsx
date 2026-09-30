"use client";

import { useState, useEffect } from "react";
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

  useEffect(() => {
    if (session?.id) {
      loadChamados();
    }
  }, [session?.id]);

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
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
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
                    } border-b border-gray-200 hover:bg-blue-50 transition`}
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
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => {
                          if (session?.secretaria_id) {
                            router.push(`/secretaria/${session.secretaria_id}?tab=requisicoes`);
                          }
                        }}
                        className="p-2 hover:bg-cyan-100 rounded-full transition text-cyan-600 font-bold text-lg cursor-pointer"
                        title="Ir para Requisições"
                      >
                        📄
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
