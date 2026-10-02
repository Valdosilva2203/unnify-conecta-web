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
  data_criacao: string;
  data_atribuicao?: string;
  data_inicio?: string;
  data_finalizacao?: string;
  criado_por: string;
  fornecedor_id?: string;
  fornecedor_nome?: string;
}

interface Notificacao {
  id: string;
  tipo: string;
  referencia_id: string;
  mensagem: string;
  lida: boolean;
}

const statusConfig = {
  pendente: { icon: "⏳", label: "Pendente", color: "from-orange-500 to-orange-600" },
  atribuida: { icon: "👤", label: "Atribuída", color: "from-blue-500 to-blue-600" },
  em_andamento: { icon: "⚙️", label: "Em Andamento", color: "from-purple-500 to-purple-600" },
  em_requisicao: { icon: "📄", label: "Em Requisição", color: "from-cyan-500 to-cyan-600" },
  finalizada: { icon: "✅", label: "Finalizada", color: "from-green-500 to-green-600" },
  cancelada: { icon: "❌", label: "Cancelada", color: "from-gray-400 to-gray-600" },
};

const prioridadeConfig = {
  urgente: { icon: "🔴", label: "Urgente", badge: "bg-red-50 text-red-700 border-red-200" },
  normal: { icon: "🟡", label: "Normal", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  baixa: { icon: "🟢", label: "Baixa", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export default function ChamadosPage() {
  const params = useParams();
  const router = useRouter();
  const prefeituraId = params.id as string;
  const { session } = usePrefeituraAuth();

  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [secretarias, setSecretarias] = useState<any[]>([]);
  const [funcionariosSecretaria, setFuncionariosSecretaria] = useState<string[]>([]);
  const [notificacoesAguardandoConfirmacao, setNotificacoesAguardandoConfirmacao] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroPrioridade, setFiltroPrioridade] = useState("todos");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFornecedor, setSearchFornecedor] = useState("");
  const [formData, setFormData] = useState({
    titulo: "",
    descricao: "",
    prioridade: "normal" as const,
    fornecedor_id: "",
  });
  const [modalAguardandoConfirmacao, setModalAguardandoConfirmacao] = useState(false);
  const [confirmandoChamado, setConfirmandoChamado] = useState<string | null>(null);
  const [chamadoParaNegar, setChamadoParaNegar] = useState<Chamado | null>(null);
  const [justificativaNegacao, setJustificativaNegacao] = useState("");
  const [negandoChamado, setNegandoChamado] = useState<string | null>(null);
  const [objetosAdicionados, setObjetosAdicionados] = useState<any[]>([]);
  const [chamadoSelecionado, setChamadoSelecionado] = useState<string | null>(null);

  // Filtrar fornecedores por nome ou CNPJ/CPF
  const fornecedoresFiltrados = fornecedores.filter((forn) => {
    const termo = searchFornecedor.toLowerCase();
    return (
      forn.nome?.toLowerCase().includes(termo) ||
      forn.cnpj_cpf?.toLowerCase().includes(termo)
    );
  });

  useEffect(() => {
    loadChamados();
    loadFornecedores();
    loadSecretarias();
    loadFuncionariosSecretaria();
  }, []);

  useEffect(() => {
    if (session?.id) {
      loadNotificacoesAguardandoConfirmacao();

      // Monitora mudanças nas notificações em tempo real
      const subscription = supabase
        .channel("notificacoes-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notificacoes",
            filter: `usuario_id=eq.${session.id}`,
          },
          () => {
            loadNotificacoesAguardandoConfirmacao();
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [session?.id]);

  const carregarObjetosAdicionados = async (chamadoId: string) => {
    if (!chamadoId) return;

    try {
      const { data, error } = await supabase
        .from("consumo_objetos")
        .select("*")
        .eq("chamado_id", chamadoId);

      if (error) throw error;
      setObjetosAdicionados(data || []);
    } catch (error) {
      console.error("Erro ao carregar objetos:", error);
      setObjetosAdicionados([]);
    }
  };

  const loadNotificacoesAguardandoConfirmacao = async () => {
    if (!session?.id) {
      return;
    }

    try {
      const response = await fetch(`/api/prefeitura/notificacoes?usuario_id=${session.id}&prefeitura_id=${prefeituraId}`);
      const json = await response.json();

      if (!response.ok) {
        setNotificacoesAguardandoConfirmacao([]);
      } else {
        setNotificacoesAguardandoConfirmacao(json.notificacoes || []);
      }
    } catch (error) {
      console.error("Erro ao carregar notificações:", error);
      setNotificacoesAguardandoConfirmacao([]);
    }
  };

  const confirmarFinalizacaoChamado = async (chamadoId: string) => {
    try {
      setConfirmandoChamado(chamadoId);

      const notificacao = notificacoesAguardandoConfirmacao.find(n => n.referencia_id === chamadoId);

      if (!notificacao) {
        alert("Notificação não encontrada!");
        return;
      }

      // Usar API com admin privileges
      const response = await fetch("/api/prefeitura/chamados/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chamado_id: chamadoId,
          notificacao_id: notificacao.id
        })
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Erro ao confirmar");
      }

      setChamados(
        chamados.map(c => c.id === chamadoId ? { ...c, status: "em_requisicao" } : c)
      );

      setNotificacoesAguardandoConfirmacao(
        notificacoesAguardandoConfirmacao.filter(n => n.referencia_id !== chamadoId)
      );

      alert("✅ Finalização confirmada!");
    } catch (error) {
      console.error("Erro ao confirmar finalização:", error);
      alert("Erro ao confirmar finalização");
    } finally {
      setConfirmandoChamado(null);
    }
  };

  const negarFinalizacaoChamado = async () => {
    if (!chamadoParaNegar || !justificativaNegacao.trim()) {
      alert("Adicione uma justificativa!");
      return;
    }

    try {
      setNegandoChamado(chamadoParaNegar.id);

      const notificacao = notificacoesAguardandoConfirmacao.find(n => n.referencia_id === chamadoParaNegar.id);

      if (!notificacao) {
        alert("Notificação não encontrada!");
        return;
      }

      // Usar API com admin privileges
      const response = await fetch("/api/prefeitura/chamados/negar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chamado_id: chamadoParaNegar.id,
          notificacao_id: notificacao.id,
          justificativa: justificativaNegacao
        })
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Erro ao registrar recusa");
      }

      setChamados(
        chamados.map(c => c.id === chamadoParaNegar.id ? { ...c, status: "pendente" } : c)
      );

      setNotificacoesAguardandoConfirmacao(
        notificacoesAguardandoConfirmacao.filter(n => n.referencia_id !== chamadoParaNegar.id)
      );

      alert("✅ Serviço recusado! Status voltou para pendente.");
      setChamadoParaNegar(null);
      setJustificativaNegacao("");
      setModalAguardandoConfirmacao(false);
    } catch (error) {
      console.error("Erro ao negar finalização:", error);
      alert("Erro ao registrar recusa");
    } finally {
      setNegandoChamado(null);
    }
  };

  const loadFornecedores = async () => {
    try {

      const { data, error } = await supabase
        .from("fornecedores")
        .select("*")
        .eq("prefeitura_id", prefeituraId)
        .order("nome", { ascending: true });

      if (error) {
        console.error("❌ Erro ao carregar fornecedores:", error);
        setFornecedores([]);
      } else {
        console.log("✅ Fornecedores carregados:", data);
        console.log("Total:", data?.length || 0);
        setFornecedores(data || []);
      }
    } catch (error) {
      console.error("❌ Erro ao carregar fornecedores:", error);
      setFornecedores([]);
    }
  };

  const loadSecretarias = async () => {
    try {
      const { data, error } = await supabase
        .from("secretarias")
        .select("id, nome")
        .eq("prefeitura_id", prefeituraId)
        .order("nome", { ascending: true });

      if (error) {
        setSecretarias([]);
      } else {
        setSecretarias(data || []);
      }
    } catch (error) {
      console.error("❌ Erro ao carregar secretarias:", error);
      setSecretarias([]);
    }
  };

  const loadFuncionariosSecretaria = async () => {
    if (!session?.secretaria_id) {
      setFuncionariosSecretaria([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("id")
        .eq("secretaria_id", session.secretaria_id);

      if (error) {
        setFuncionariosSecretaria([]);
      } else {
        setFuncionariosSecretaria(data?.map(f => f.id) || []);
      }
    } catch (error) {
      console.error("❌ Erro ao carregar funcionários:", error);
      setFuncionariosSecretaria([]);
    }
  };

  const loadChamados = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("chamados")
        .select("*")
        .eq("prefeitura_id", prefeituraId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("❌ Erro do Supabase:", error);
        throw error;
      }

      console.log("✅ Chamados carregados:", data);
      setChamados(data || []);
    } catch (error: any) {
      console.error("❌ Erro ao carregar chamados:", error?.message || error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChamado = async () => {
    if (!formData.titulo.trim() || !formData.fornecedor_id) {
      alert("Preencha o título e selecione um fornecedor!");
      return;
    }

    if (!session?.id) {
      alert("Usuário não autenticado!");
      return;
    }

    try {
      const insertData: any = {
        prefeitura_id: prefeituraId,
        titulo: formData.titulo,
        fornecedor_id: formData.fornecedor_id,
        status: "pendente",
        criado_por: session.id,
        criador_nome: session.nome,
        secretaria_id: session?.secretaria_id || null,
      };

      // Adicionar campos opcionais apenas se a tabela os suportar
      if (formData.descricao) insertData.descricao = formData.descricao;
      if (formData.prioridade) insertData.prioridade = formData.prioridade;

      console.log("📝 Inserindo:", insertData);

      const { data, error } = await supabase
        .from("chamados")
        .insert([insertData])
        .select();

      if (error) {
        console.error("❌ Erro do Supabase:", error);
        throw error;
      }

      console.log("✅ Chamado criado:", data);
      await loadChamados();
      setIsModalOpen(false);
      setFormData({ titulo: "", descricao: "", prioridade: "normal", fornecedor_id: "" });
      alert("✅ Chamado criado com sucesso!");
    } catch (error: any) {
      console.error("❌ Erro ao criar:", error);
      alert(`❌ Erro: ${error?.message || "Erro desconhecido"}`);
    }
  };

  const isMaster =
    session?.role === "admin" ||
    session?.role === "prefeitura" ||
    session?.role === "master" ||
    (!session?.role && !session?.cargo && session?.id);

  const chamadosVisiveis = isMaster
    ? chamados
    : chamados.filter((n) => {
        const isSecretario = session?.cargo?.toLowerCase().includes("secretario");
        if (isSecretario) {
          return n.secretaria_id === session?.secretaria_id;
        } else {
          return n.criado_por === session?.id;
        }
      });

  const chamadosFiltrados = chamadosVisiveis.filter((n) => {
    const statusMatch = filtroStatus === "todos" || n.status === filtroStatus;
    const prioridadeMatch = filtroPrioridade === "todos" || n.prioridade === filtroPrioridade;
    const searchMatch = searchTerm === "" || (n.titulo && n.titulo.toLowerCase().includes(searchTerm.toLowerCase()));

    return statusMatch && prioridadeMatch && searchMatch;
  });

  const contagemAguardandoConfirmacaoPorFornecedor = (fornecedorId: string) => {
    return notificacoesAguardandoConfirmacao.filter(notif => {
      const chamado = chamados.find(c => c.id === notif.referencia_id);
      return chamado && chamado.fornecedor_id === fornecedorId;
    }).length;
  };

  const stats = [
    {
      label: "Pendentes",
      value: chamadosVisiveis.filter((n) => n.status === "pendente").length,
      icon: "⏳",
      color: "from-orange-500 to-orange-600",
    },
    {
      label: "Em Andamento",
      value: chamadosVisiveis.filter((n) => n.status === "em_andamento").length,
      icon: "⚙️",
      color: "from-purple-500 to-purple-600",
    },
    {
      label: "Finalizadas",
      value: chamadosVisiveis.filter((n) => n.status === "finalizada").length,
      icon: "✅",
      color: "from-green-500 to-green-600",
    },
    {
      label: "Em Requisição",
      value: chamadosVisiveis.filter((n) => n.status === "em_requisicao").length,
      icon: "📄",
      color: "from-cyan-500 to-cyan-600",
    },
    {
      label: "Urgentes",
      value: chamadosVisiveis.filter((n) => n.prioridade === "urgente").length,
      icon: "🔴",
      color: "from-red-500 to-red-600",
    },
    ...(notificacoesAguardandoConfirmacao.length > 0 ? [{
      label: "Aguardando Confirmação",
      value: notificacoesAguardandoConfirmacao.length,
      icon: "⏸️",
      color: "from-yellow-500 to-yellow-600",
    }] : []),
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      <TopNavBar
        title="Central de Chamados"
        subtitle="Gerencie e acompanhe todas as solicitações de serviço"
        tabs={[{ id: "chamados", label: "Chamados" }]}
        activeTab="chamados"
        onTabChange={() => {}}
        onExport={() => console.log("Exportando...")}
        userName={session?.nome || "Usuário"}
        userRole={session?.cargo || "Prefeitura"}
      />

      <div className="p-8 w-full max-w-[2280px] mx-auto">
        {/* Banner de Notificações Aguardando Confirmação */}
        {notificacoesAguardandoConfirmacao.length > 0 && (
          <div className="mb-8 bg-gradient-to-r from-yellow-400 to-yellow-500 text-yellow-900 rounded-2xl p-6 border-2 border-yellow-600 shadow-lg animate-pulse">
            <div className="flex items-center gap-4">
              <span className="text-5xl">⏸️</span>
              <div className="flex-1">
                <p className="text-xl font-black">Você tem {notificacoesAguardandoConfirmacao.length} chamado{notificacoesAguardandoConfirmacao.length > 1 ? 's' : ''} aguardando sua confirmação de finalização</p>
                <p className="text-sm mt-2 font-medium">O fornecedor já finalizou e está aguardando você confirmar se o serviço foi realmente concluído.</p>
              </div>
              <button
                onClick={() => setModalAguardandoConfirmacao(true)}
                className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded-lg transition transform hover:scale-105"
              >
                Ver Chamados
              </button>
            </div>
          </div>
        )}

        {/* Stats Cards - Design Premium */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {stats.map((stat, idx) => (
            <div
              key={idx}
              onClick={() => {
                if (stat.label === "Em Requisição") {
                  router.push(`/prefeituras/${prefeituraId}/chamados/em-requisicao`);
                }
              }}
              className={`bg-gradient-to-br ${stat.color} rounded-2xl p-7 text-white shadow-xl hover:shadow-2xl transition duration-300 transform hover:-translate-y-1 cursor-pointer group overflow-hidden relative`}
            >
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition duration-300"></div>
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <p className="text-white/80 text-sm font-semibold uppercase tracking-wider">{stat.label}</p>
                  <p className="text-5xl font-black mt-3 group-hover:scale-110 transition duration-300 inline-block">{stat.value}</p>
                </div>
                <span className="text-5xl opacity-70 group-hover:opacity-100 transition duration-300 group-hover:scale-125">{stat.icon}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Search & Botão Create */}
        <div className="mb-8 flex flex-col md:flex-row gap-4 items-stretch md:items-center">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Pesquisar chamados por título..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-5 py-4 bg-white border-2 border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition shadow-sm hover:border-gray-400 font-medium"
            />
            <span className="absolute right-4 top-4 text-gray-400 text-xl">🔍</span>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-8 py-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-bold transition shadow-lg hover:shadow-2xl transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap text-lg"
          >
            <span>✨</span> Novo Chamado
          </button>
        </div>

        {/* Filtros - Card Premium */}
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 md:p-7 mb-8 shadow-sm hover:shadow-md transition">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-5">🎯 Filtros Avançados</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Status</label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 text-gray-900 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition bg-white hover:border-gray-400 font-medium cursor-pointer"
              >
                <option value="todos">📊 Todos os status</option>
                <option value="pendente">⏳ Pendente</option>
                <option value="atribuida">👤 Atribuída</option>
                <option value="em_andamento">⚙️ Em Andamento</option>
                <option value="finalizada">✅ Finalizada</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Prioridade</label>
              <select
                value={filtroPrioridade}
                onChange={(e) => setFiltroPrioridade(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 text-gray-900 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition bg-white hover:border-gray-400 font-medium cursor-pointer"
              >
                <option value="todos">🎯 Todas as prioridades</option>
                <option value="urgente">🔴 Urgente</option>
                <option value="normal">🟡 Normal</option>
                <option value="baixa">🟢 Baixa</option>
              </select>
            </div>
          </div>
        </div>

        {/* Grid de Cards de Chamados */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin text-6xl mb-4">⏳</div>
            <p className="text-gray-600 font-bold text-lg">Carregando chamados...</p>
          </div>
        ) : chamadosFiltrados.length === 0 ? (
          <div className="bg-white rounded-2xl p-16 text-center border-2 border-gray-300 shadow-sm">
            <p className="text-6xl mb-4">📭</p>
            <p className="text-gray-900 text-2xl font-bold mb-2">Nenhum chamado encontrado</p>
            <p className="text-gray-600 text-lg">Crie um novo chamado ou ajuste os filtros</p>
          </div>
        ) : (
          <div className="grid gap-6 justify-items-center w-full" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(370px, 380px))", justifyContent: "center" }}>
            {Array.from(
              chamadosFiltrados
                .reduce((map, notif) => {
                  if (!map.has(notif.fornecedor_id)) {
                    map.set(notif.fornecedor_id, []);
                  }
                  map.get(notif.fornecedor_id)!.push(notif);
                  return map;
                }, new Map<string, Chamado[]>())
                .entries()
            ).filter(([fornecedorId, chamadosForn]) => {
              const chamadosAbertas = chamadosForn.filter(n => n.status === "pendente").length;
              return chamadosAbertas > 0;
            }).map(([fornecedorId, chamadosForn]) => {
              const f = fornecedores.find(forn => forn.id === fornecedorId);
              const chamadosAbertas = chamadosForn.filter(n => n.status === "pendente").length;
              const contratoAtivo = chamadosForn[0]?.titulo || f?.tipo || "Contrato";

              return (
                <div
                  key={fornecedorId}
                  className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition overflow-hidden border border-gray-100 min-w-[370px] max-w-[380px] flex flex-col"
                >
                  {/* Avatar e Info Top */}
                  <div className="p-6 text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl font-bold text-white shadow-md">
                      {f?.nome?.charAt(0) || "?"}
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{f?.nome || "Sem fornecedor"}</h3>
                    <p className="text-sm text-gray-600 mt-1">{f?.especialidade || "Fornecedor"}</p>

                    {/* Rating Badge */}
                    <div className="mt-4">
                      <span className="inline-block px-3 py-1 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-700">
                        ⭐ {f?.rating || 4.5}
                      </span>
                    </div>
                  </div>

                  {/* Localização */}
                  <div className="px-6 py-3 border-t border-gray-100">
                    <p className="text-sm text-gray-600">
                      📍 {f?.cidade || "N/A"} - {f?.estado || "SP"}
                    </p>
                  </div>

                  {/* Experiência */}
                  <div className="px-6 py-3 border-t border-gray-100">
                    <p className="text-sm text-gray-600">
                      {f?.total_atendimentos || 0}+ Atendimentos
                    </p>
                  </div>

                  {/* Especialidades */}
                  {f?.especialidades && f.especialidades.length > 0 ? (
                    <div className="px-6 py-3 border-t border-gray-100">
                      <p className="text-sm text-gray-600 mb-2">🎯 Especialidades:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {f.especialidades.map((esp, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"
                          >
                            {esp}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Badge Chamados em Aberto */}
                  <div className="px-6 py-3 border-t border-gray-100">
                    <div className="flex gap-2 flex-wrap">
                      <span className="inline-block px-3 py-1.5 rounded-full text-sm font-bold bg-orange-100 text-orange-700">
                        🔔 {chamadosAbertas} chamados
                      </span>
                      {contagemAguardandoConfirmacaoPorFornecedor(fornecedorId!) > 0 && (
                        <span className="inline-block px-3 py-1.5 rounded-full text-sm font-bold bg-yellow-100 text-yellow-700 animate-pulse">
                          ⏸️ {contagemAguardandoConfirmacaoPorFornecedor(fornecedorId!)} aguardando
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Espaçador flexível */}
                  <div className="flex-grow"></div>

                  {/* Botão CTA */}
                  <div className="px-6 py-4 border-t border-gray-100">
                    <button
                      onClick={() => router.push(`/prefeituras/${prefeituraId}/chamados/fornecedor/${fornecedorId}`)}
                      className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition shadow-md hover:shadow-lg"
                    >
                      Ver Chamados
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Criar Chamado - Premium */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-10 border-2 border-gray-300 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-3xl font-black text-gray-900">✨ Novo Chamado</h3>
                <p className="text-gray-600 text-base mt-2">Crie uma nova solicitação de serviço</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-500 hover:text-gray-900 text-3xl transition transform hover:rotate-90"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">📝 Título *</label>
                <input
                  type="text"
                  value={formData.titulo}
                  onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                  className="w-full px-5 py-3 bg-gray-50 border-2 border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 focus:bg-white transition font-medium"
                  placeholder="Ex: Impressora do setor não está funcionando"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">📋 Descrição</label>
                <textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  className="w-full px-5 py-3 bg-gray-50 border-2 border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 focus:bg-white transition resize-none font-medium"
                  placeholder="Descreva com detalhes o problema ou o serviço solicitado..."
                  rows={4}
                />
              </div>

              <div className="relative">
                <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">🏢 Fornecedor *</label>

                {/* Campo de Busca */}
                <input
                  type="text"
                  placeholder="Buscar por nome ou CNPJ..."
                  value={searchFornecedor}
                  onChange={(e) => setSearchFornecedor(e.target.value)}
                  className="w-full px-5 py-3 bg-gray-50 border-2 border-gray-300 text-gray-900 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 focus:bg-white transition font-medium"
                />

                {/* Lista Dinâmica de Fornecedores */}
                {searchFornecedor.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-orange-300 rounded-lg shadow-2xl z-40 max-h-80 overflow-y-auto">
                    {fornecedoresFiltrados.length === 0 ? (
                      <div className="px-5 py-4 text-gray-500 text-center font-medium">
                        Nenhum fornecedor encontrado
                      </div>
                    ) : (
                      fornecedoresFiltrados.map((forn) => (
                        <button
                          key={forn.id}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, fornecedor_id: forn.id });
                            setSearchFornecedor("");
                          }}
                          className="w-full px-5 py-4 text-left border-b border-gray-100 hover:bg-orange-50 transition group flex items-start justify-between"
                        >
                          <div>
                            <p className="font-bold text-gray-900 group-hover:text-orange-600 transition">
                              {forn.nome}
                            </p>
                            <p className="text-sm text-gray-500 group-hover:text-orange-500 transition">
                              {forn.cnpj_cpf}
                            </p>
                          </div>
                          <span className="text-lg group-hover:scale-125 transition">→</span>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {/* Fornecedor Selecionado */}
                {formData.fornecedor_id && (
                  <div className="mt-3 p-4 bg-emerald-50 border-2 border-emerald-200 rounded-lg">
                    <p className="text-emerald-700 font-bold flex items-center gap-2">
                      ✅ {fornecedores.find(f => f.id === formData.fornecedor_id)?.nome}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">🏢 Secretaria</label>
                <div className="w-full px-5 py-3 bg-blue-50 border-2 border-blue-300 rounded-lg text-gray-900 font-bold">
                  {session?.secretaria_id
                    ? `✅ Vinculado automaticamente à ${secretarias.find(s => s.id === session.secretaria_id)?.nome || "Secretaria"}`
                    : `⚠️ Sem secretaria vinculada`
                  }
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">🎯 Prioridade</label>
                  <select
                    value={formData.prioridade}
                    onChange={(e) => setFormData({ ...formData, prioridade: e.target.value as any })}
                    className="w-full px-5 py-3 bg-gray-50 border-2 border-gray-300 text-gray-900 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 focus:bg-white transition font-bold cursor-pointer"
                  >
                    <option value="baixa">🟢 Baixa</option>
                    <option value="normal">🟡 Normal</option>
                    <option value="urgente">🔴 Urgente</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <div className={`w-full px-5 py-3 rounded-lg font-bold text-center ${prioridadeConfig[formData.prioridade].badge}`}>
                    {prioridadeConfig[formData.prioridade].icon} {prioridadeConfig[formData.prioridade].label}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-8">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-8 py-3 text-gray-700 border-2 border-gray-300 hover:bg-gray-100 rounded-lg transition font-bold text-base"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateChamado}
                disabled={!formData.titulo.trim()}
                className="px-8 py-3 text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition font-bold text-base shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Criar Chamado
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Chamados Aguardando Confirmação */}
      {modalAguardandoConfirmacao && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-10 border-2 border-gray-300 shadow-2xl animate-in zoom-in-95 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-3xl font-black text-gray-900">⏸️ Confirmar Finalizações</h3>
                <p className="text-gray-600 text-base mt-2">Revise e confirme os chamados finalizados pelos fornecedores</p>
              </div>
              <button
                onClick={() => setModalAguardandoConfirmacao(false)}
                className="text-gray-500 hover:text-gray-900 text-3xl transition transform hover:rotate-90"
              >
                ✕
              </button>
            </div>

            {notificacoesAguardandoConfirmacao.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-6xl mb-4">✅</p>
                <p className="text-gray-900 text-lg font-bold">Nenhum chamado aguardando confirmação!</p>
                <p className="text-gray-600 mt-2">Todos os serviços foram confirmados.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {notificacoesAguardandoConfirmacao.map((notif) => {
                  const chamado = chamados.find(c => c.id === notif.referencia_id);
                  if (!chamado) return null;

                  // Carregar objetos quando o modal abrir
                  if (chamadoSelecionado !== chamado.id) {
                    setChamadoSelecionado(chamado.id);
                    carregarObjetosAdicionados(chamado.id);
                  }

                  const fornecedor = fornecedores.find(f => f.id === chamado.fornecedor_id);

                  return (
                    <div key={notif.id} className={`border-2 rounded-lg p-6 transition ${
                      chamadoParaNegar?.id === chamado.id
                        ? "bg-red-50 border-red-300"
                        : "bg-gray-50 border-yellow-200 hover:bg-yellow-50"
                    }`}>
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <h4 className="text-lg font-bold text-gray-900">{chamado.titulo}</h4>
                          <p className="text-sm text-gray-600 mt-1">{chamado.descricao}</p>

                          {/* Objetos Adicionados */}
                          {objetosAdicionados.length > 0 && chamadoSelecionado === chamado.id && (
                            <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                              <p className="text-sm font-bold text-gray-900 mb-2">📦 Objetos Adicionados:</p>
                              <div className="space-y-2">
                                {objetosAdicionados.map((item) => (
                                  <div key={item.id} className="bg-white p-2 rounded border-l-4 border-yellow-400 text-xs">
                                    <p className="font-bold text-gray-900">
                                      Contrato: {item.objetos_contratos?.contratos?.numero}
                                    </p>
                                    <p className="text-gray-600">
                                      {item.objetos_contratos?.nome} - Qtd: {item.quantidade_usada}
                                    </p>
                                    <p className="text-gray-500 mt-1">
                                      R$ {((item.objetos_contratos?.valor_unitario || 0) * item.quantidade_usada).toFixed(2)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="mt-4 flex gap-3">
                            <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                              🏢 {fornecedor?.nome || "Desconhecido"}
                            </span>
                            <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                              chamado.prioridade === "urgente" ? "bg-red-100 text-red-700" :
                              chamado.prioridade === "normal" ? "bg-amber-100 text-amber-700" :
                              "bg-emerald-100 text-emerald-700"
                            }`}>
                              {chamado.prioridade === "urgente" ? "🔴 Urgente" :
                               chamado.prioridade === "normal" ? "🟡 Normal" :
                               "🟢 Baixa"}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {chamadoParaNegar?.id === chamado.id ? (
                            <button
                              onClick={() => {
                                setChamadoParaNegar(null);
                                setJustificativaNegacao("");
                              }}
                              className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition"
                            >
                              ← Voltar
                            </button>
                          ) : (
                            <button
                              onClick={() => setChamadoParaNegar(chamado)}
                              className="px-4 py-3 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-lg transition"
                            >
                              ❌ Negar
                            </button>
                          )}
                          <button
                            onClick={() => confirmarFinalizacaoChamado(chamado.id)}
                            disabled={confirmandoChamado === chamado.id || chamadoParaNegar?.id === chamado.id}
                            className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition transform hover:scale-105 whitespace-nowrap"
                          >
                            {confirmandoChamado === chamado.id ? "Confirmando..." : "✅ Confirmar"}
                          </button>
                        </div>
                      </div>

                      {chamadoParaNegar?.id === chamado.id && (
                        <div className="mt-6 pt-6 border-t-2 border-red-200">
                          <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">📝 Justificativa *</label>
                          <textarea
                            value={justificativaNegacao}
                            onChange={(e) => setJustificativaNegacao(e.target.value)}
                            placeholder="Explique por que o serviço não foi finalizado corretamente..."
                            className="w-full px-4 py-3 bg-white border-2 border-red-300 rounded-lg text-gray-900 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 resize-none font-medium"
                            rows={4}
                          />
                          <button
                            onClick={negarFinalizacaoChamado}
                            disabled={!justificativaNegacao.trim() || negandoChamado === chamado.id}
                            className="mt-4 w-full px-6 py-3 text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition font-bold shadow-lg hover:shadow-xl"
                          >
                            {negandoChamado === chamado.id ? "Processando..." : "❌ Recusar Serviço"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
