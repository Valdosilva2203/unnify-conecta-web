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
  status: "pendente" | "atribuida" | "em_andamento" | "finalizada" | "cancelada";
  data_criacao?: string;
  created_at?: string;
  criado_por: string;
  criador_nome?: string;
  fornecedor_id?: string;
  secretaria_id?: string | null;
}

interface Justificativa {
  id: string;
  chamado_id: string;
  descricao: string;
  created_at: string;
}

interface Fornecedor {
  id: string;
  nome: string;
  cnpj_cpf: string;
  especialidade?: string;
  especialidades?: string[];
  rating?: number;
  cidade?: string;
  estado?: string;
}

const statusConfig = {
  pendente: { icon: "⏳", label: "Pendente", color: "from-orange-500 to-orange-600" },
  atribuida: { icon: "👤", label: "Atribuída", color: "from-blue-500 to-blue-600" },
  em_andamento: { icon: "⚙️", label: "Em Andamento", color: "from-purple-500 to-purple-600" },
  finalizada: { icon: "✅", label: "Finalizada", color: "from-green-500 to-green-600" },
  cancelada: { icon: "❌", label: "Cancelada", color: "from-gray-400 to-gray-600" },
};

const prioridadeConfig = {
  urgente: { icon: "🔴", label: "Urgente", badge: "bg-red-50 text-red-700 border-red-200" },
  normal: { icon: "🟡", label: "Normal", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  baixa: { icon: "🟢", label: "Baixa", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export default function FornecedorChamadosPage() {
  const params = useParams();
  const router = useRouter();
  const prefeituraId = params.id as string;
  const fornecedorId = params.fornecedorId as string;
  const { session } = usePrefeituraAuth();

  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [fornecedor, setFornecedor] = useState<Fornecedor | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const [modalJustificativaAberto, setModalJustificativaAberto] = useState<string | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [justificativas, setJustificativas] = useState<Map<string, Justificativa[]>>(new Map());
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [deletandoMultiplos, setDeletandoMultiplos] = useState(false);
  const [secretarias, setSecretarias] = useState<Map<string, string>>(new Map());
  const [chamadoEditando, setChamadoEditando] = useState<Chamado | null>(null);
  const [formEdicao, setFormEdicao] = useState({ titulo: "", descricao: "", prioridade: "normal", status: "pendente", secretaria_id: "" });
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  useEffect(() => {
    loadFornecedor();
    loadChamados();
    loadSecretarias();
  }, []);

  const loadSecretarias = async () => {
    try {
      const { data, error } = await supabase
        .from("secretarias")
        .select("id, nome")
        .eq("prefeitura_id", prefeituraId);

      if (error) throw error;

      const map = new Map<string, string>();
      (data || []).forEach(sec => {
        map.set(sec.id, sec.nome);
      });
      setSecretarias(map);
    } catch (error) {
      console.error("Erro ao carregar secretarias:", error);
    }
  };

  const loadJustificativas = async (chamadoId: string) => {
    try {
      const { data, error } = await supabase
        .from("justificativas_chamados")
        .select("*")
        .eq("chamado_id", chamadoId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setJustificativas(prev => new Map(prev).set(chamadoId, data || []));
    } catch (error) {
      console.error("Erro ao carregar justificativas:", error);
    }
  };

  // Fechar menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = () => {
      setMenuAberto(null);
    };

    if (menuAberto) {
      document.addEventListener("click", handleClickOutside);
      return () => {
        document.removeEventListener("click", handleClickOutside);
      };
    }
  }, [menuAberto]);

  const loadFornecedor = async () => {
    try {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("*")
        .eq("id", fornecedorId)
        .single();

      if (error) throw error;
      setFornecedor(data);
    } catch (error) {
      console.error("Erro ao carregar fornecedor:", error);
    }
  };

  const loadChamados = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from("chamados")
        .select("*")
        .eq("fornecedor_id", fornecedorId);

      // Master vê todos os chamados do fornecedor
      const isMaster =
        session?.role === "admin" ||
        session?.role === "prefeitura" ||
        (!session?.role && !session?.cargo && session?.id);

      // Filtrar por tipo de usuário (se não for master)
      if (!isMaster) {
        if (session?.tipo === "secretario" || session?.cargo?.toLowerCase().includes("secretario")) {
          query = query.eq("secretaria_id", session.secretaria_id);
        } else if (session?.id) {
          query = query.eq("criado_por", session.id);
        }
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;

      setChamados(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar chamados:", error?.message || error);
    } finally {
      setLoading(false);
    }
  };

  const isMaster =
    session?.role === "admin" ||
    session?.role === "prefeitura" ||
    (!session?.role && !session?.cargo && session?.id);

  const chamadosFiltrados = chamados.filter((n) => {
    const passouFiltroStatus = filtroStatus === "todos" || n.status === filtroStatus;

    if (isMaster) {
      // Master vê todos os chamados
      return passouFiltroStatus;
    } else if (session?.cargo?.toLowerCase().includes("secretario")) {
      // Secretário vê chamados da sua secretaria
      return passouFiltroStatus && n.secretaria_id === session?.secretaria_id;
    } else {
      // Não-master/não-secretário vê apenas seus chamados
      return passouFiltroStatus && n.criado_por === session?.id;
    }
  });

  const atualizarStatus = async (chamadoId: string, novoStatus: string) => {
    try {
      const { error } = await supabase
        .from("chamados")
        .update({ status: novoStatus })
        .eq("id", chamadoId);

      if (error) throw error;

      setChamados(
        chamados.map((n) =>
          n.id === chamadoId ? { ...n, status: novoStatus as any } : n
        )
      );

      setMenuAberto(null);
      console.log("✅ Status atualizado com sucesso!");
    } catch (error) {
      console.error("❌ Erro ao atualizar status:", error);
      alert("Erro ao atualizar status");
    }
  };

  const adicionarJustificativa = async (chamadoId: string) => {
    if (!justificativa.trim()) {
      alert("Adicione uma justificativa!");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("justificativas_chamados")
        .insert([{
          chamado_id: chamadoId,
          descricao: justificativa
        }])
        .select();

      if (error) throw error;

      const novaJustificativa = data?.[0];
      if (novaJustificativa) {
        setJustificativas(prev => {
          const map = new Map(prev);
          const lista = map.get(chamadoId) || [];
          map.set(chamadoId, [novaJustificativa, ...lista]);
          return map;
        });
      }

      setModalJustificativaAberto(null);
      setJustificativa("");
      alert("✅ Justificativa adicionada com sucesso!");
    } catch (error) {
      console.error("❌ Erro ao adicionar justificativa:", error);
      alert("Erro ao adicionar justificativa");
    }
  };

  const deletarJustificativa = async (justificativaId: string, chamadoId: string) => {
    try {
      console.log("🗑️ Deletando justificativa:", justificativaId);

      const { error } = await supabase
        .from("justificativas_chamados")
        .delete()
        .eq("id", justificativaId);

      if (error) {
        console.error("❌ Erro do Supabase ao deletar:", error.message, error.code);
        alert(`Erro ao deletar: ${error.message}`);
        return;
      }

      console.log("✅ Justificativa deletada com sucesso!");

      setJustificativas(prev => {
        const map = new Map(prev);
        const lista = (map.get(chamadoId) || []).filter(j => j.id !== justificativaId);
        map.set(chamadoId, lista);
        return map;
      });

      // Recarregar justificativas para garantir sincronização
      loadJustificativas(chamadoId);
    } catch (error: any) {
      console.error("❌ Erro ao deletar justificativa:", error?.message || error);
      alert("Erro ao deletar justificativa");
    }
  };

  const handleDeleteChamado = async (chamadoId: string, titulo: string) => {
    if (!window.confirm(`Tem certeza que deseja deletar o chamado "${titulo}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("chamados")
        .delete()
        .eq("id", chamadoId);

      if (error) {
        console.error("❌ Erro ao deletar chamado:", error.message);
        alert(`Erro ao deletar: ${error.message}`);
        return;
      }

      console.log("✅ Chamado deletado com sucesso!");
      setChamados(chamados.filter(c => c.id !== chamadoId));
      setMenuAberto(null);
      alert("✅ Chamado deletado com sucesso!");
    } catch (error: any) {
      console.error("❌ Erro ao deletar chamado:", error?.message || error);
      alert("Erro ao deletar chamado");
    }
  };

  const toggleSelecionado = (chamadoId: string) => {
    const novo = new Set(selecionados);
    if (novo.has(chamadoId)) {
      novo.delete(chamadoId);
    } else {
      novo.add(chamadoId);
    }
    setSelecionados(novo);
  };

  const toggleTodosSelecionados = () => {
    if (selecionados.size === chamadosFiltrados.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(chamadosFiltrados.map(c => c.id)));
    }
  };

  const handleDeletarSelecionados = async () => {
    if (selecionados.size === 0) {
      alert("Selecione pelo menos um chamado para deletar");
      return;
    }

    if (!confirm(`Tem certeza que deseja deletar ${selecionados.size} chamado(s)? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setDeletandoMultiplos(true);
    try {
      const { error } = await supabase
        .from("chamados")
        .delete()
        .in("id", Array.from(selecionados));

      if (error) throw error;

      alert(`✅ ${selecionados.size} chamado(s) deletado(s) com sucesso!`);
      setSelecionados(new Set());
      await loadChamados();
    } catch (error: any) {
      console.error("Erro ao deletar chamados:", error);
      alert(`Erro ao deletar: ${error?.message || "Erro desconhecido"}`);
    } finally {
      setDeletandoMultiplos(false);
    }
  };

  const handleAbrirEdicao = (chamado: Chamado) => {
    setChamadoEditando(chamado);
    setFormEdicao({
      titulo: chamado.titulo,
      descricao: chamado.descricao || "",
      prioridade: chamado.prioridade,
      status: chamado.status,
      secretaria_id: chamado.secretaria_id || ""
    });
    setMenuAberto(null);
  };

  const handleSalvarEdicao = async () => {
    if (!chamadoEditando) return;

    if (!formEdicao.titulo.trim()) {
      alert("O título não pode estar vazio!");
      return;
    }

    setSalvandoEdicao(true);
    try {
      const { error } = await supabase
        .from("chamados")
        .update({
          titulo: formEdicao.titulo,
          descricao: formEdicao.descricao,
          prioridade: formEdicao.prioridade,
          status: formEdicao.status,
          secretaria_id: formEdicao.secretaria_id || null
        })
        .eq("id", chamadoEditando.id);

      if (error) throw error;

      alert("✅ Chamado atualizado com sucesso!");
      setChamadoEditando(null);
      await loadChamados();
    } catch (error: any) {
      console.error("Erro ao salvar edição:", error);
      alert(`Erro ao salvar: ${error?.message || "Erro desconhecido"}`);
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const stats = [
    {
      label: "Total",
      value: chamados.length,
      icon: "📋",
      color: "from-blue-500 to-blue-600",
    },
    {
      label: "Pendentes",
      value: chamados.filter((n) => n.status === "pendente").length,
      icon: "⏳",
      color: "from-orange-500 to-orange-600",
    },
    {
      label: "Em Andamento",
      value: chamados.filter((n) => n.status === "em_andamento").length,
      icon: "⚙️",
      color: "from-purple-500 to-purple-600",
    },
    {
      label: "Finalizadas",
      value: chamados.filter((n) => n.status === "finalizada").length,
      icon: "✅",
      color: "from-green-500 to-green-600",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      <TopNavBar
        title={`Chamados - ${fornecedor?.nome || "Fornecedor"}`}
        subtitle={fornecedor?.cnpj_cpf || ""}
        tabs={[{ id: "chamados", label: "Chamados" }]}
        activeTab="chamados"
        onTabChange={() => {}}
        onExport={() => console.log("Exportando...")}
        userName={session?.nome || "Usuário"}
        userRole={session?.cargo || "Prefeitura"}
      />

      <div className="p-8 w-full max-w-[2280px] mx-auto">
        {/* Botão Voltar */}
        <button
          onClick={() => router.back()}
          className="mb-6 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition"
        >
          ← Voltar
        </button>

        {/* Info Fornecedor */}
        {fornecedor && (
          <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 md:p-8 mb-8 shadow-sm">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white text-3xl font-bold">
                {fornecedor.nome?.charAt(0)}
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-900">{fornecedor.nome}</h2>
                <p className="text-gray-600 mb-3">{fornecedor.especialidade || "Fornecedor"}</p>
                {fornecedor.especialidades && fornecedor.especialidades.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {fornecedor.especialidades.map((esp, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"
                      >
                        {esp}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="text-sm text-gray-500 mt-2">
                  📍 {fornecedor.cidade || "N/A"} - {fornecedor.estado || "SP"} | ⭐ {fornecedor.rating || 4.5}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {stats.map((stat, idx) => (
            <div
              key={idx}
              className={`bg-gradient-to-br ${stat.color} rounded-2xl p-7 text-white shadow-xl hover:shadow-2xl transition duration-300 transform hover:-translate-y-1 cursor-pointer group overflow-hidden relative`}
            >
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition duration-300"></div>
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <p className="text-white/80 text-sm font-semibold uppercase tracking-wider">{stat.label}</p>
                  <p className="text-5xl font-black mt-3">{stat.value}</p>
                </div>
                <span className="text-5xl opacity-70">{stat.icon}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Filtro */}
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 mb-8 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-5">🎯 Filtro por Status</h3>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="w-full md:w-64 px-4 py-3 border-2 border-gray-300 text-gray-900 rounded-lg focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition bg-white hover:border-gray-400 font-medium cursor-pointer"
          >
            <option value="todos">📊 Todos os status</option>
            <option value="pendente">⏳ Pendente</option>
            <option value="atribuida">👤 Atribuída</option>
            <option value="em_andamento">⚙️ Em Andamento</option>
            <option value="finalizada">✅ Finalizada</option>
          </select>
        </div>

        {/* Lista de Chamados - Tabela */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin text-6xl mb-4">⏳</div>
            <p className="text-gray-600 font-bold text-lg">Carregando chamados...</p>
          </div>
        ) : chamadosFiltrados.length === 0 ? (
          <div className="bg-white rounded-2xl p-16 text-center border-2 border-gray-300 shadow-sm">
            <p className="text-6xl mb-4">📭</p>
            <p className="text-gray-900 text-2xl font-bold mb-2">Nenhum chamado encontrado</p>
            <p className="text-gray-600 text-lg">Não há chamados com esse filtro</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm">
            {/* Botão deletar múltiplos */}
            {selecionados.size > 0 && (
              <div className="px-6 py-3 bg-red-50 border-b-2 border-red-200 flex items-center justify-between">
                <span className="text-sm font-semibold text-red-700">
                  {selecionados.size} chamado(s) selecionado(s)
                </span>
                <button
                  onClick={handleDeletarSelecionados}
                  disabled={deletandoMultiplos}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-medium transition"
                >
                  🗑️ Deletar Selecionados
                </button>
              </div>
            )}

            {/* Header da Tabela */}
            <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-4 bg-gradient-to-r from-indigo-50 to-blue-50 border-b-2 border-gray-200 items-center">
              <div className="md:col-span-1 flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selecionados.size === chamadosFiltrados.length && chamadosFiltrados.length > 0}
                  onChange={toggleTodosSelecionados}
                  className="w-4 h-4 cursor-pointer"
                  title="Selecionar todos"
                />
              </div>
              <div className="md:col-span-2">
                <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wide">Chamado</h4>
              </div>
              <div className="md:col-span-2">
                <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wide">Descrição</h4>
              </div>
              <div className="md:col-span-1">
                <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wide">Prioridade</h4>
              </div>
              <div className="md:col-span-1">
                <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wide">Status</h4>
              </div>
              <div className="md:col-span-1">
                <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wide">Criador</h4>
              </div>
              <div className="md:col-span-2">
                <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wide">Vinculado a</h4>
              </div>
              <div className="md:col-span-1 flex justify-center items-center">
                <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wide">Deletar</h4>
              </div>
              <div className="md:col-span-1 flex justify-end items-center">
                <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wide">Ações</h4>
              </div>
            </div>

            {/* Linhas da Tabela */}
            <div className="divide-y divide-gray-200 overflow-visible">
              {chamadosFiltrados.map((chamado) => {
                const statusInfo = statusConfig[chamado.status as keyof typeof statusConfig];
                const prioridadeInfo = prioridadeConfig[chamado.prioridade as keyof typeof prioridadeConfig];

                return (
                  <div
                    key={chamado.id}
                    className="hover:bg-blue-50 transition p-4 md:p-6"
                  >
                    {/* Mobile View */}
                    <div className="md:hidden space-y-3">
                      <h3 className="text-lg font-bold text-gray-900">{chamado.titulo}</h3>
                      {chamado.descricao && (
                        <p className="text-sm text-gray-600">{chamado.descricao}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${prioridadeInfo.badge} border`}>
                          {prioridadeInfo.icon} {prioridadeInfo.label}
                        </span>
                        <span className="px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-700">
                          {statusInfo.icon} {statusInfo.label}
                        </span>
                      </div>
                    </div>

                    {/* Desktop View */}
                    <div className="hidden md:grid md:grid-cols-12 gap-4 items-center">
                      <div className="md:col-span-1 flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selecionados.has(chamado.id)}
                          onChange={() => toggleSelecionado(chamado.id)}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <h3 className="text-base font-bold text-gray-900">{chamado.titulo}</h3>
                      </div>
                      <div className="md:col-span-2">
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {chamado.descricao || "—"}
                        </p>
                      </div>
                      <div className="md:col-span-1">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${prioridadeInfo.badge} border inline-block`}>
                          {prioridadeInfo.icon} {prioridadeInfo.label}
                        </span>
                      </div>
                      <div className="md:col-span-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full bg-current`} style={{
                            color: statusInfo.color.includes('orange') ? '#f59e0b' :
                                   statusInfo.color.includes('green') ? '#10b981' :
                                   statusInfo.color.includes('purple') ? '#a855f7' :
                                   statusInfo.color.includes('blue') ? '#3b82f6' : '#6b7280'
                          }}></div>
                          <span className="text-sm font-semibold text-gray-700">
                            {statusInfo.label}
                          </span>
                        </div>
                      </div>
                      <div className="md:col-span-1">
                        <p className="text-sm text-gray-700 font-medium">
                          {chamado.criador_nome || "—"}
                        </p>
                      </div>
                      <div className="md:col-span-2">
                        <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                          {chamado.secretaria_id ? secretarias.get(chamado.secretaria_id) || "—" : "—"}
                        </span>
                      </div>
                      <div className="md:col-span-1 flex items-center justify-center">
                        <button
                          onClick={() => handleDeleteChamado(chamado.id, chamado.titulo)}
                          className="p-2 hover:bg-red-100 rounded-full transition text-red-600 font-bold text-lg hover:scale-110"
                          title="Deletar chamado"
                        >
                          🗑️
                        </button>
                      </div>
                      <div className="md:col-span-1 flex items-center justify-end relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuAberto(menuAberto === chamado.id ? null : chamado.id);
                          }}
                          className="p-2 hover:bg-gray-200 rounded-full transition text-gray-600 font-bold text-lg"
                        >
                          ⋮
                        </button>

                        {/* Menu de Ações */}
                        {menuAberto === chamado.id && (
                          <div
                            className="absolute right-0 bottom-full mb-2 bg-white border-2 border-gray-200 rounded-lg shadow-2xl z-50 w-56 max-h-80 overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="py-2">
                              <p className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide border-b border-gray-200">Ações</p>

                              {/* Botão Editar */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAbrirEdicao(chamado);
                                }}
                                className="w-full text-left px-4 py-3 hover:bg-blue-50 transition flex items-center gap-2 text-sm text-gray-700 font-medium border-b border-gray-100"
                              >
                                ✏️ Editar
                              </button>

                              {/* Botão Justificativa */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  loadJustificativas(chamado.id);
                                  setModalJustificativaAberto(chamado.id);
                                  setMenuAberto(null);
                                }}
                                className="w-full text-left px-4 py-3 hover:bg-purple-50 transition flex items-center gap-2 text-sm text-gray-700 font-medium border-b border-gray-100"
                              >
                                📝 Justificativa {justificativas.get(chamado.id)?.length ? `(${justificativas.get(chamado.id)?.length})` : ""}
                              </button>

                              <p className="px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wide border-t border-gray-200 mt-2">Mudar Status</p>
                              <div className="pt-2">
                                {Object.entries(statusConfig).map(([key, value]) => (
                                  <button
                                    key={key}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      atualizarStatus(chamado.id, key);
                                    }}
                                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition flex items-center gap-2 text-sm text-gray-700 font-medium border-b border-gray-100 last:border-b-0"
                                  >
                                    {value.icon} {value.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Modal de Edição */}
        {chamadoEditando && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-10 border-2 border-gray-300 shadow-2xl animate-in zoom-in-95">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-3xl font-black text-gray-900">✏️ Editar Chamado</h3>
                  <p className="text-gray-600 text-base mt-2">Modifique os dados do chamado</p>
                </div>
                <button
                  onClick={() => setChamadoEditando(null)}
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
                    value={formEdicao.titulo}
                    onChange={(e) => setFormEdicao({ ...formEdicao, titulo: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:bg-white transition font-medium"
                    placeholder="Título do chamado"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">📋 Descrição</label>
                  <textarea
                    value={formEdicao.descricao}
                    onChange={(e) => setFormEdicao({ ...formEdicao, descricao: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:bg-white transition resize-none font-medium"
                    placeholder="Descrição do chamado"
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">🎯 Prioridade</label>
                    <select
                      value={formEdicao.prioridade}
                      onChange={(e) => setFormEdicao({ ...formEdicao, prioridade: e.target.value as any })}
                      className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition font-medium cursor-pointer"
                    >
                      <option value="baixa">🟢 Baixa</option>
                      <option value="normal">🟡 Normal</option>
                      <option value="urgente">🔴 Urgente</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">📊 Status</label>
                    <select
                      value={formEdicao.status}
                      onChange={(e) => setFormEdicao({ ...formEdicao, status: e.target.value as any })}
                      className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition font-medium cursor-pointer"
                    >
                      <option value="pendente">⏳ Pendente</option>
                      <option value="atribuida">👤 Atribuída</option>
                      <option value="em_andamento">⚙️ Em Andamento</option>
                      <option value="finalizada">✅ Finalizada</option>
                      <option value="cancelada">❌ Cancelada</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">🏢 Vincular Secretaria</label>
                  <select
                    value={formEdicao.secretaria_id}
                    onChange={(e) => setFormEdicao({ ...formEdicao, secretaria_id: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition font-medium cursor-pointer"
                  >
                    <option value="">-- Nenhuma secretaria --</option>
                    {Array.from(secretarias.entries()).map(([id, nome]) => (
                      <option key={id} value={id}>{nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-4 mt-8">
                <button
                  onClick={() => setChamadoEditando(null)}
                  className="px-8 py-3 text-gray-700 border-2 border-gray-300 hover:bg-gray-100 rounded-lg transition font-bold text-base"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSalvarEdicao}
                  disabled={salvandoEdicao}
                  className="px-8 py-3 text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition font-bold text-base shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  {salvandoEdicao ? "Salvando..." : "Salvar Edição"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Justificativa */}
        {modalJustificativaAberto && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-10 border-2 border-gray-300 shadow-2xl animate-in zoom-in-95">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-3xl font-black text-gray-900">📝 Adicionar Justificativa</h3>
                  <p className="text-gray-600 text-base mt-2">Explique o motivo da demora ou situação do serviço</p>
                </div>
                <button
                  onClick={() => {
                    setModalJustificativaAberto(null);
                    setJustificativa("");
                  }}
                  className="text-gray-500 hover:text-gray-900 text-3xl transition transform hover:rotate-90"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* Lista de Justificativas Existentes */}
                {(justificativas.get(modalJustificativaAberto || "") || []).length > 0 && (
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
                    <h4 className="font-bold text-blue-900 mb-4">📋 Justificativas Anteriores</h4>
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {(justificativas.get(modalJustificativaAberto || "") || []).map((j) => (
                        <div key={j.id} className="bg-white p-4 rounded-lg border border-blue-100">
                          <div className="flex justify-between items-start gap-4 mb-2">
                            <p className="text-sm text-gray-700">{j.descricao}</p>
                            <button
                              onClick={() => deletarJustificativa(j.id, modalJustificativaAberto || "")}
                              className="text-red-500 hover:text-red-700 font-bold text-lg transition"
                            >
                              ✕
                            </button>
                          </div>
                          <p className="text-xs text-gray-500">
                            📅 {new Date(j.created_at).toLocaleDateString("pt-BR")} às {new Date(j.created_at).toLocaleTimeString("pt-BR")}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="border-t-2 border-blue-200 mt-4 pt-4">
                      <p className="text-sm font-semibold text-blue-900">✏️ Adicione uma nova justificativa abaixo</p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">📋 Nova Justificativa *</label>
                  <textarea
                    value={justificativa}
                    onChange={(e) => setJustificativa(e.target.value)}
                    placeholder="Ex: A demora foi causada por falta de material disponível no mercado. Esperamos receber o pedido até próxima segunda..."
                    className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 focus:bg-white transition resize-none font-medium"
                    rows={5}
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    {justificativa.length} caracteres
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-4 mt-8">
                <button
                  onClick={() => {
                    setModalJustificativaAberto(null);
                    setJustificativa("");
                  }}
                  className="px-8 py-3 text-gray-700 border-2 border-gray-300 hover:bg-gray-100 rounded-lg transition font-bold text-base"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => adicionarJustificativa(modalJustificativaAberto)}
                  disabled={!justificativa.trim()}
                  className="px-8 py-3 text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition font-bold text-base shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  Adicionar Justificativa
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
