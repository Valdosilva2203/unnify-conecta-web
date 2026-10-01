"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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

interface Objeto {
  consumo_id: string;
  objeto_id: string;
  nome: string;
  quantidade: number;
  valor_unitario: number;
  contrato_numero: string;
}

const statusConfig = {
  pendente: { label: "Pendente", cor: "bg-yellow-100 text-yellow-800" },
  atribuida: { label: "Atribuída", cor: "bg-blue-100 text-blue-800" },
  em_andamento: { label: "Em Andamento", cor: "bg-purple-100 text-purple-800" },
  em_requisicao: { label: "Em Requisição", cor: "bg-cyan-100 text-cyan-800" },
  finalizada: { label: "Finalizada", cor: "bg-green-100 text-green-800" },
  cancelada: { label: "Cancelada", cor: "bg-gray-100 text-gray-800" },
};

const prioridadeConfig = {
  baixa: { label: "Baixa", cor: "bg-green-100 text-green-800" },
  normal: { label: "Normal", cor: "bg-yellow-100 text-yellow-800" },
  urgente: { label: "Urgente", cor: "bg-red-100 text-red-800" },
};

export default function DetalheChamadoPage() {
  const params = useParams();
  const router = useRouter();
  const chamadoId = params.chamadoId as string;

  const [chamado, setChamado] = useState<Chamado | null>(null);
  const [justificativas, setJustificativas] = useState<Justificativa[]>([]);
  const [objetos, setObjetos] = useState<Objeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    validarAcessoECarregar();
  }, [chamadoId]);

  const validarAcessoECarregar = async () => {
    try {
      // Verificar autenticação
      const prefeituraSession = localStorage.getItem("prefeitura_session");
      const fornecedorSession = localStorage.getItem("fornecedor_session");

      if (!prefeituraSession && !fornecedorSession) {
        router.push("/login");
        return;
      }

      // Carrega dados
      await carregarChamado();
      await carregarJustificativas();
      await carregarObjetos();
    } catch (err) {
      console.error("Erro:", err);
      setErro("Erro ao carregar chamado");
    }
  };

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

  const carregarObjetos = async () => {
    try {
      const { data, error } = await supabase
        .from("consumo_objetos")
        .select("id, quantidade_usada, objeto_id")
        .eq("tipo", "chamado")
        .eq("chamado_id", chamadoId);

      if (error) {
        console.warn("Aviso ao carregar objetos:", error);
        return;
      }

      if (!data || data.length === 0) {
        setObjetos([]);
        return;
      }

      const detalhes: Objeto[] = [];
      for (const consumo of data) {
        const { data: obj, error: erroObj } = await supabase
          .from("objetos_contratos")
          .select("*")
          .eq("id", consumo.objeto_id)
          .single();

        if (erroObj) {
          console.warn("⚠️ Erro ao buscar objeto:", erroObj);
          continue;
        }

        if (obj) {
          const { data: contrato, error: erroContrato } = await supabase
            .from("contratos")
            .select("numero")
            .eq("id", obj.contrato_id)
            .single();

          if (erroContrato) {
            console.warn("⚠️ Erro ao buscar contrato:", erroContrato);
          }

          detalhes.push({
            consumo_id: consumo.id,
            objeto_id: consumo.objeto_id,
            nome: obj.nome || obj.descricao || "Objeto sem nome",
            quantidade: consumo.quantidade_usada,
            valor_unitario: obj.valor_unitario || 0,
            contrato_numero: contrato?.numero || "—"
          });
        }
      }
      setObjetos(detalhes);
    } catch (error) {
      console.error("Erro ao carregar objetos:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⏳</div>
          <p className="text-xl font-semibold text-gray-600">Carregando chamado...</p>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <p className="text-xl font-semibold text-gray-600 mb-6">{erro}</p>
          <button
            onClick={() => router.back()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
          >
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  if (!chamado) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <p className="text-xl font-semibold text-gray-600 mb-6">Chamado não encontrado</p>
          <button
            onClick={() => router.back()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
          >
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition"
          >
            ← Voltar
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{chamado.titulo}</h1>
          <div></div>
        </div>

        {/* Card principal */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          {/* Info básicas */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className="text-xs font-bold text-gray-600 uppercase">Descrição</p>
              <p className="text-gray-700 mt-2 text-lg">{chamado.descricao}</p>
            </div>
            <div className="flex gap-8">
              <div>
                <p className="text-xs font-bold text-gray-600 uppercase">Prioridade</p>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mt-2 ${prioridadeConfig[chamado.prioridade].cor}`}>
                  {prioridadeConfig[chamado.prioridade].label}
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-600 uppercase">Status</p>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mt-2 ${statusConfig[chamado.status].cor}`}>
                  {statusConfig[chamado.status].label}
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 py-6"></div>

          {/* Criador e Data */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-xs font-bold text-gray-600 uppercase">Criador</p>
              <p className="text-gray-700 mt-2 text-lg">{chamado.criador_nome || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-600 uppercase">Data de Criação</p>
              <p className="text-gray-700 mt-2 text-lg">
                {new Date(chamado.created_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
          </div>
        </div>

        {/* Objetos do Chamado */}
        {objetos.length > 0 && (
          <div className="bg-green-50 rounded-2xl shadow-lg p-8 mb-8 border-2 border-green-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">📦 Objetos do Chamado</h2>
            <div className="space-y-4">
              {objetos.map((objeto) => (
                <div key={objeto.consumo_id} className="bg-white p-6 rounded-lg border border-green-300">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-bold text-gray-900">Contrato: {objeto.contrato_numero}</p>
                      <p className="text-gray-700 mt-1 font-medium">{objeto.nome}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Quantidade: <strong>{objeto.quantidade}</strong></p>
                      <p className="text-sm text-gray-600 mt-1">
                        Valor Unitário: <strong>R$ {objeto.valor_unitario.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </p>
                      <p className="text-sm font-bold text-gray-800 mt-1">
                        Subtotal: R$ {(objeto.valor_unitario * objeto.quantidade).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="mt-6 pt-6 border-t-2 border-green-300">
              <p className="text-lg font-bold text-gray-900">
                Valor Total: R$ {objetos.reduce((total, obj) => total + (obj.valor_unitario * obj.quantidade), 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}

        {/* Justificativas */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            📝 Justificativas ({justificativas.length}/3)
          </h2>

          {justificativas.length > 0 && (
            <div className="space-y-3 mb-6">
              {justificativas.map((just) => (
                <div key={just.id} className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                  <p className="text-gray-700">{just.descricao}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(just.created_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}

          {justificativas.length === 0 && (
            <p className="text-gray-600 text-sm italic">Nenhuma justificativa adicionada</p>
          )}
        </div>
      </div>
    </div>
  );
}
