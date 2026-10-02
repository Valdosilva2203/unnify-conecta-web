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
  criado_por?: string;
  prefeitura_id?: string;
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
  data_inicio?: string;
  data_fim?: string;
}

interface ObjetoContrato {
  id: string;
  nome: string;
  descricao?: string;
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
  const [mostrarFormJustificativa, setMostrarFormJustificativa] = useState(false);
  const [finalizandoChamado, setFinalizandoChamado] = useState(false);
  const [mostrarContratos, setMostrarContratos] = useState(false);

  // Objetos vinculados ao chamado (lista única)
  const [objetos, setObjetos] = useState<any[]>([]);

  // Contratos disponíveis
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [carregandoContratos, setCarregandoContratos] = useState(false);

  // Seleção para adicionar novo objeto
  const [contratoSelecionado, setContratoSelecionado] = useState<Contrato | null>(null);
  const [objetosContrato, setObjetosContrato] = useState<ObjetoContrato[]>([]);
  const [carregandoObjetos, setCarregandoObjetos] = useState(false);
  const [buscaObjeto, setBuscaObjeto] = useState("");
  const [objetoSelecionado, setObjetoSelecionado] = useState<ObjetoContrato | null>(null);
  const [quantidadeObjeto, setQuantidadeObjeto] = useState("");

  useEffect(() => {
    carregarChamado();
    carregarContratos();
    carregarObjetos();
  }, [chamadoId]);

  const carregarObjetos = async () => {
    try {
      console.log("📥 Carregando objetos para chamado:", chamadoId);

      const { data, error } = await supabase
        .from("consumo_objetos")
        .select("id, quantidade_usada, objeto_id")
        .eq("tipo", "chamado")
        .eq("chamado_id", chamadoId);

      if (error) {
        console.error("❌ Erro ao carregar consumo_objetos:", error);
        return;
      }

      console.log("📊 Registros encontrados:", data?.length);

      if (!data || data.length === 0) {
        console.log("ℹ️ Nenhum objeto vinculado ainda");
        setObjetos([]);
        return;
      }

      const detalhes: any[] = [];
      for (const consumo of data) {
        console.log("🔍 Buscando detalhes do objeto:", consumo.objeto_id);

        const { data: obj, error: erroObj } = await supabase
          .from("objetos_contratos")
          .select("*")
          .eq("id", consumo.objeto_id)
          .single();

        if (erroObj) {
          console.warn("⚠️ Erro ao buscar objeto:", erroObj);
          console.log("📋 Objeto data:", obj);
          continue;
        }

        if (obj) {
          console.log("✅ Objeto encontrado:", obj);
          console.log("💰 Campos do objeto:", Object.keys(obj));
          console.log("💵 valor_unitario:", obj.valor_unitario);

          const { data: contrato, error: erroContrato } = await supabase
            .from("contratos")
            .select("numero")
            .eq("id", obj.contrato_id)
            .single();

          if (erroContrato) {
            console.warn("⚠️ Erro ao buscar contrato:", erroContrato);
          }

          const detalhe = {
            consumo_id: consumo.id,
            objeto_id: consumo.objeto_id,
            nome: obj.nome || obj.descricao || "Objeto sem nome",
            quantidade: consumo.quantidade_usada,
            valor_unitario: obj.valor_unitario || 0,
            contrato_numero: contrato?.numero
          };
          console.log("📝 Detalhe adicionado:", detalhe);
          detalhes.push(detalhe);
        }
      }
      setObjetos(detalhes);
      console.log("✅ Objetos carregados:", detalhes.length, detalhes);
    } catch (error) {
      console.error("❌ Erro geral ao carregar objetos:", error);
    }
  };

  const carregarChamado = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("chamados")
        .select("*, criado_por, prefeitura_id")
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
      setMostrarFormJustificativa(false);
      alert("✅ Justificativa adicionada!");
    } catch (error) {
      console.error("Erro ao adicionar justificativa:", error);
      alert("Erro ao adicionar justificativa");
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

  const finalizarChamado = async () => {
    try {
      setFinalizandoChamado(true);

      // Verifica se há objetos adicionados
      if (objetos.length === 0) {
        alert("⚠️ Adicione pelo menos um objeto antes de finalizar!");
        return;
      }

      // 1. Atualiza status do chamado para "em_andamento" (aguardando confirmação do secretário)
      const { error: erroStatus } = await supabase
        .from("chamados")
        .update({ status: "em_andamento" })
        .eq("id", chamadoId);

      if (erroStatus) throw erroStatus;

      // 2. Envia notificação para o criador do chamado
      if (chamado?.criado_por && chamado?.prefeitura_id) {
        console.log("🔍 Enviando notificação para criador do chamado:", chamado.criado_por);

        const notifPayload = {
          usuario_id: chamado.criado_por,
          prefeitura_id: chamado.prefeitura_id,
          tipo: "chamado_aguardando_confirmacao",
          mensagem: `Chamado "${chamado.titulo}" aguardando confirmação. O fornecedor finalizou o trabalho.`,
          referencia_id: chamadoId
        };
        console.log("📨 Criando notificação:", notifPayload);

        const response = await fetch("/api/prefeitura/notificacoes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notifPayload)
        });

        console.log("📊 Resposta da notificação:", response.status);
        const result = await response.json();
        console.log("✅ Notificação criada:", result);
      }

      alert("✅ Chamado enviado! Aguardando confirmação.");
      await carregarChamado();
    } catch (error) {
      console.error("Erro ao finalizar chamado:", error);
      alert("Erro ao finalizar chamado");
    } finally {
      setFinalizandoChamado(false);
    }
  };

  const adicionarObjeto = () => {
    if (novoObjeto.trim()) {
      setObjetos([...objetos, novoObjeto]);
      setNovoObjeto("");
      setAbrirFormularioObjeto(false);
    }
  };

  const removerObjeto = async (consumoId: string) => {
    try {
      // DELETE do consumo
      const { error } = await supabase
        .from("consumo_objetos")
        .delete()
        .eq("id", consumoId);

      if (error) {
        console.error("Erro ao remover objeto:", error);
        alert("Erro ao remover objeto");
        return;
      }

      console.log("✅ Objeto removido! Saldo atualizado.");

      // Recarrega objetos do chamado
      await carregarObjetos();

      // Recarrega objetos do contrato selecionado
      if (contratoSelecionado) {
        await carregarObjetosContrato(contratoSelecionado.id);
      }
    } catch (error) {
      console.error("Erro ao remover objeto:", error);
      alert("Erro ao remover objeto");
    }
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
      console.log("Contratos carregados:", data);
      setContratos(data || []);
    } catch (error) {
      console.error("Erro ao carregar contratos:", error);
    } finally {
      setCarregandoContratos(false);
    }
  };

  const carregarObjetosContrato = async (contratoId: string) => {
    try {
      setCarregandoObjetos(true);

      // Carrega objetos_contratos com todos os campos
      const { data, error } = await supabase
        .from("objetos_contratos")
        .select("*")
        .eq("contrato_id", contratoId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro ao carregar objetos do contrato:", error);
        setObjetosContrato([]);
        return;
      }

      // Buscar consumo de cada objeto
      const objetoIds = (data || []).map(o => o.id);
      const { data: consumoData } = await supabase
        .from("consumo_objetos")
        .select("objeto_id, quantidade_usada")
        .in("objeto_id", objetoIds);

      // Calcular consumo total por objeto
      const consumoMap: Record<string, number> = {};
      (consumoData || []).forEach(c => {
        consumoMap[c.objeto_id] = (consumoMap[c.objeto_id] || 0) + c.quantidade_usada;
      });

      // Adicionar quantidade disponível e percentual aos objetos
      const objetosComConsumo = (data || []).map(obj => ({
        ...obj,
        consumido: consumoMap[obj.id] || 0,
        disponivel: obj.quantidade - (consumoMap[obj.id] || 0),
        percentualUsado: obj.quantidade ? Math.round(((consumoMap[obj.id] || 0) / obj.quantidade) * 100) : 0
      }));

      console.log("Objetos carregados para contrato", contratoId, ":", objetosComConsumo);
      setObjetosContrato(objetosComConsumo);
    } catch (error) {
      console.error("Erro ao carregar objetos do contrato:", error);
      setObjetosContrato([]);
    } finally {
      setCarregandoObjetos(false);
    }
  };

  const selecionarContrato = (contrato: Contrato) => {
    setContratoSelecionado(contrato);
    setBuscaObjeto("");
    setObjetoSelecionado(null);
    carregarObjetosContrato(contrato.id);
  };

  const adicionarObjetoAoChamado = async () => {
    if (!contratoSelecionado || !objetoSelecionado || !quantidadeObjeto) return;

    try {
      const novaQuantidade = parseFloat(quantidadeObjeto);

      // Busca se o objeto já existe neste chamado
      const { data: consumoExistente } = await supabase
        .from("consumo_objetos")
        .select("id, quantidade_usada")
        .eq("tipo", "chamado")
        .eq("chamado_id", chamadoId)
        .eq("objeto_id", objetoSelecionado.id)
        .single();

      if (consumoExistente) {
        // Objeto já existe: UPDATE quantidade
        const novaQtd = (consumoExistente.quantidade_usada || 0) + novaQuantidade;
        const { error } = await supabase
          .from("consumo_objetos")
          .update({ quantidade_usada: novaQtd })
          .eq("id", consumoExistente.id);

        if (error) {
          console.error("Erro ao atualizar quantidade:", error);
          alert("Erro ao atualizar quantidade");
          return;
        }

        console.log(`✅ Quantidade atualizada para ${novaQtd}!`);
      } else {
        // Novo objeto: INSERT
        const { error } = await supabase
          .from("consumo_objetos")
          .insert([{
            objeto_id: objetoSelecionado.id,
            quantidade_usada: novaQuantidade,
            tipo: "chamado",
            chamado_id: chamadoId
          }]);

        if (error) {
          console.error("Erro ao adicionar objeto:", error);
          alert("Erro ao adicionar objeto");
          return;
        }

        console.log("✅ Objeto adicionado com sucesso!");
      }

      // Recarrega a lista de objetos do chamado
      await carregarObjetos();

      // Recarrega objetos disponíveis do contrato
      await carregarObjetosContrato(contratoSelecionado.id);

      // Limpa formulário
      setObjetoSelecionado(null);
      setBuscaObjeto("");
      setQuantidadeObjeto("");
      alert("✅ Objeto adicionado com sucesso!");
    } catch (error) {
      console.error("Erro ao adicionar objeto:", error);
      alert("Erro ao adicionar objeto");
    }
  };

  const objetosFiltrados = objetosContrato.filter(obj => {
    const nomeObjeto = (obj.nome || obj.descricao || "").toLowerCase();
    return nomeObjeto.includes(buscaObjeto.toLowerCase());
  });

  const calcularProgressoContrato = (contrato: Contrato) => {
    if (!contrato.data_inicio || !contrato.data_fim) {
      return null;
    }

    const agora = new Date().getTime();
    const inicio = new Date(contrato.data_inicio).getTime();
    const fim = new Date(contrato.data_fim).getTime();
    const duracao = fim - inicio;
    const decorrido = agora - inicio;
    const restante = fim - agora;

    const porcentagem = Math.max(0, Math.min(100, (decorrido / duracao) * 100));
    const diasRestantes = Math.ceil(restante / (1000 * 60 * 60 * 24));

    let cor = "bg-green-500";
    let texCor = "text-green-700";
    if (diasRestantes <= 0) {
      cor = "bg-red-700";
      texCor = "text-red-700";
    } else if (diasRestantes <= 30) {
      cor = "bg-red-500";
      texCor = "text-red-500";
    } else if (diasRestantes <= 90) {
      cor = "bg-orange-500";
      texCor = "text-orange-500";
    } else if (diasRestantes <= 180) {
      cor = "bg-yellow-500";
      texCor = "text-yellow-500";
    }

    return { porcentagem, diasRestantes, cor, texCor };
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

            {/* Objetos e Contratos */}
            <div className="border-t pt-8 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Contratos</h3>
                <button
                  onClick={() => setMostrarContratos(!mostrarContratos)}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition"
                >
                  {mostrarContratos ? "Ocultar Contratos" : "Visualizar Contratos"}
                </button>
              </div>

              {/* Lista de Objetos do Chamado */}
              {objetos.length > 0 && (
                <div className="mb-8 p-4 bg-green-50 rounded-lg border-2 border-green-200">
                  <p className="font-bold text-gray-900 mb-4">📦 Objetos do Chamado:</p>
                  <div className="space-y-3">
                    {objetos.map((objeto) => (
                      <div key={objeto.consumo_id} className="bg-white p-4 rounded-lg border border-green-300 flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <p className="text-sm font-bold text-gray-900">
                            Contrato: {objeto.contrato_numero}
                          </p>
                          <p className="text-gray-700 mt-1">{objeto.nome}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            Quantidade: <strong>{objeto.quantidade}</strong>
                          </p>
                          <p className="text-sm text-gray-600 mt-1">
                            Valor Unitário: <strong>R$ {(objeto.valor_unitario || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                          </p>
                          <p className="text-sm text-gray-800 font-bold mt-1">
                            Subtotal: R$ {((objeto.valor_unitario || 0) * objeto.quantidade).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <button
                          onClick={() => removerObjeto(objeto.consumo_id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-100 p-2 rounded-full transition flex-shrink-0"
                          title="Remover objeto e recuperar saldo"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="mt-4 pt-4 border-t-2 border-green-300">
                    <p className="text-lg font-bold text-gray-900">
                      Valor Total: R$ {objetos.reduce((total, obj) => total + ((obj.valor_unitario || 0) * obj.quantidade), 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              )}

              {mostrarContratos && !contratoSelecionado ? (
                /* Lista de Contratos - Grade sem scroll */
                <>
                  <p className="text-sm font-medium text-gray-700 mb-4">Selecione um Contrato:</p>
                  {carregandoContratos ? (
                    <div className="text-center py-8 text-gray-600">
                      <div className="animate-spin inline-block text-3xl mb-2">⏳</div>
                      <p>Carregando contratos...</p>
                    </div>
                  ) : contratos.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                      {contratos.map((contrato) => {
                        const progresso = calcularProgressoContrato(contrato);
                        return (
                          <button
                            key={contrato.id}
                            onClick={() => selecionarContrato(contrato)}
                            className="text-left p-4 bg-white border-2 border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-500 transition"
                          >
                            <p className="font-bold text-gray-900 text-lg">{contrato.numero}</p>
                            <p className="text-sm text-gray-600 mt-2">{contrato.descricao}</p>
                            <p className="text-sm text-gray-500 mt-3 font-medium">
                              R$ {(contrato.valor || 0).toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </p>

                            {/* Barra de Progresso de Data Final */}
                            {progresso && (
                              <div className="mt-3 pt-3 border-t border-gray-200">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-xs font-medium text-gray-600">
                                    {new Date(contrato.data_fim!).toLocaleDateString("pt-BR")}
                                  </p>
                                  <p className={`text-xs font-bold ${progresso.texCor}`}>
                                    {progresso.diasRestantes <= 0 ? "Expirado" : `${progresso.diasRestantes} dias`}
                                  </p>
                                </div>
                                <div className="w-full h-2 bg-gray-300 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${progresso.cor}`}
                                    style={{ width: `${progresso.porcentagem}%` }}
                                  ></div>
                                </div>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-600">
                      <p>Nenhum contrato ativo vinculado a essa prefeitura</p>
                    </div>
                  )}
                </>
              ) : contratoSelecionado ? (
                /* Objetos do Contrato Selecionado - Interface de Requisições */
                <>
                  {/* Informações do Contrato Selecionado */}
                  <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200 mb-6">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <p className="text-sm text-green-700 font-bold uppercase">✓ Contrato nº {contratoSelecionado.numero}</p>
                        <p className="text-gray-700 mt-1">{contratoSelecionado.descricao}</p>
                      </div>
                      <button
                        onClick={() => {
                          setContratoSelecionado(null);
                          setObjetoSelecionado(null);
                          setBuscaObjeto("");
                          setQuantidadeObjeto("");
                        }}
                        className="text-gray-600 hover:text-gray-900 text-xl flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Barra de Progresso de Data Final */}
                    {contratoSelecionado.data_inicio && contratoSelecionado.data_fim ? (() => {
                      const progresso = calcularProgressoContrato(contratoSelecionado);
                      if (!progresso) return null;

                      return (
                        <div className="mt-3 pt-3 border-t border-green-300">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-medium text-gray-600">
                              Vencimento: {new Date(contratoSelecionado.data_fim).toLocaleDateString("pt-BR")}
                            </p>
                            <p className={`text-xs font-bold ${progresso.texCor}`}>
                              {progresso.diasRestantes <= 0 ? "Expirado" : `${progresso.diasRestantes} dias`}
                            </p>
                          </div>
                          <div className="w-full h-2 bg-gray-300 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${progresso.cor}`}
                              style={{ width: `${progresso.porcentagem}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })() : (
                      <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-green-300">
                        ⚠️ Datas do contrato não informadas
                      </p>
                    )}
                  </div>

                  {/* Objetos do Contrato */}
                  <div className="bg-yellow-50 p-6 rounded-lg border-2 border-yellow-200">
                    <p className="font-bold text-gray-900 mb-4">Objetos do Contrato:</p>

                    {carregandoObjetos ? (
                      <div className="text-center py-8 text-gray-600">
                        <div className="animate-spin inline-block text-3xl mb-2">⏳</div>
                        <p className="text-sm">Carregando objetos...</p>
                      </div>
                    ) : (objetosContrato as any[]).length > 0 ? (
                      <div className="space-y-4">
                        {(objetosContrato as any[]).map((objeto) => (
                          <div key={objeto.id} className="bg-white p-4 rounded-lg border-2 border-yellow-200">
                            {/* Título e Porcentagem */}
                            <div className="flex justify-between items-start mb-2">
                              <p className="font-bold text-gray-900">{objeto.nome || objeto.descricao}</p>
                              <span className="bg-yellow-400 text-gray-900 px-2 py-1 rounded text-xs font-bold">
                                {objeto.percentualUsado || 0}%
                              </span>
                            </div>

                            {/* Valor e Quantidade */}
                            <p className="text-xs text-gray-600 mb-3">
                              Valor Unit.: R$ {(objeto.valor_unitario || 0).toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })} | Qtd Disponível: {objeto.disponivel || 0}/{objeto.quantidade || 0}
                            </p>

                            {/* Barra de Progresso com cores dinâmicas */}
                            <div className="w-full h-2 bg-gray-300 rounded-full mb-3 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  objeto.percentualUsado < 25
                                    ? "bg-green-500"
                                    : objeto.percentualUsado < 50
                                    ? "bg-blue-500"
                                    : objeto.percentualUsado < 75
                                    ? "bg-orange-500"
                                    : "bg-red-500"
                                }`}
                                style={{ width: `${objeto.percentualUsado || 0}%` }}
                              ></div>
                            </div>

                            {/* Quantidade Input e Botão */}
                            <div className="flex gap-2">
                              <input
                                type="number"
                                value={objetoSelecionado?.id === objeto.id ? quantidadeObjeto : ""}
                                onChange={(e) => {
                                  setObjetoSelecionado(objeto);
                                  setQuantidadeObjeto(e.target.value);
                                }}
                                placeholder="Qtd"
                                className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-orange-500"
                                min="1"
                                max={objeto.disponivel || 0}
                              />
                              <button
                                onClick={adicionarObjetoAoChamado}
                                disabled={!quantidadeObjeto || objetoSelecionado?.id !== objeto.id || parseInt(quantidadeObjeto) > (objeto.disponivel || 0)}
                                className="flex-1 px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded font-bold transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Adicionar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-600">
                        <p className="text-sm font-medium text-red-600">
                          ⚠️ Nenhum objeto cadastrado para este contrato
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          Entre em contato com a administração para adicionar objetos
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Justificativas */}
            <div className="border-t pt-8 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900">
                  📝 Justificativas ({justificativas.length}/3)
                </h3>
                {justificativas.length < 3 && !mostrarFormJustificativa && (
                  <button
                    onClick={() => setMostrarFormJustificativa(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
                  >
                    <span className="text-lg">+</span>
                    <span>Adicionar</span>
                  </button>
                )}
              </div>

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
              ) : !mostrarFormJustificativa ? (
                <div className="text-center py-8 text-gray-500 mb-8">
                  Nenhuma justificativa adicionada
                </div>
              ) : null}

              {/* Adicionar Justificativa - Só mostra quando botão é clicado */}
              {mostrarFormJustificativa && justificativas.length < 3 && (
                <div className="bg-blue-50 p-6 rounded-lg border-2 border-blue-200">
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
                      onClick={() => setMostrarFormJustificativa(false)}
                      className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                    >
                      Cancelar
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
                <div className="text-center py-6 text-gray-700 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm font-medium">
                    ✅ Você atingiu o limite de 3 justificativas
                  </p>
                </div>
              )}
            </div>

            {/* Botão Finalizar Chamado */}
            <div className="border-t pt-8 flex gap-3 justify-end">
              <button
                onClick={() => router.back()}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
              >
                Voltar
              </button>
              <button
                onClick={finalizarChamado}
                disabled={finalizandoChamado}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50"
              >
                {finalizandoChamado ? "Finalizando..." : "✅ Finalizar Chamado"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
