"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isAuthenticated } from "@/lib/auth";
import { usePrefeituraAuth } from "@/hooks/usePrefeituraAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import TopNavBar from "@/components/TopNavBar";
import AdicionarFuncionarioModal from "@/components/AdicionarFuncionarioModal";
import EditarFuncionarioModal from "@/components/EditarFuncionarioModal";
import CompartilharLinkModal from "@/components/CompartilharLinkModal";
import crypto from "crypto";

interface Prefeitura {
  id: string;
  nome: string;
  cnpj: string;
  email: string;
  telefone: string;
  endereco: string;
  cidade: string;
  estado: string;
  status: "ativa" | "inativa";
  created_at: string;
}

interface Funcionario {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cargo: string;
}

function DetalhePrefeituraContent() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { session: prefeituraSession } = usePrefeituraAuth();

  const [prefeitura, setPrefeitura] = useState<Prefeitura | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [prefeito, setPrefeito] = useState<Funcionario | null>(null);
  const [vicePrefeito, setVicePrefeito] = useState<Funcionario | null>(null);
  const [secretarias, setSecretarias] = useState<any[]>([]);
  const [quantidadeCargos, setQuantidadeCargos] = useState(0);
  const [mostrarDetalheCargos, setMostrarDetalheCargos] = useState(false);
  const [cargosPorTipo, setCargosPorTipo] = useState<Map<string, number>>(new Map());
  const [todosOsCargos, setTodosOsCargos] = useState<Array<{ nome: string; quantidade: number }>>(
    []
  );
  const [quantidadeFornecedores, setQuantidadeFornecedores] = useState(0);
  const [quantidadeContratos, setQuantidadeContratos] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalPrefeito, setModalPrefeito] = useState(false);
  const [modalVicePrefeito, setModalVicePrefeito] = useState(false);
  const [modalEditarPrefeito, setModalEditarPrefeito] = useState(false);
  const [modalEditarVicePrefeito, setModalEditarVicePrefeito] = useState(false);
  const [autenticado, setAutenticado] = useState(false);
  const [acessoLiberado, setAcessoLiberado] = useState(false);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [tokenCompartilhado, setTokenCompartilhado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [usuarioCriadoEmail, setUsuarioCriadoEmail] = useState<string | null>(null);
  const [mostrarCompartilharLink, setMostrarCompartilharLink] = useState(false);
  const [mostrarTodosFuncionarios, setMostrarTodosFuncionarios] = useState(false);
  const [todosFuncionarios, setTodosFuncionarios] = useState<
    Array<Funcionario & { secretaria?: string }>
  >([]);
  const [modalEditarCargo, setModalEditarCargo] = useState(false);
  const [cargoEditando, setCargoEditando] = useState<{ nome: string; quantidade: number } | null>(null);
  const [novoNomeCargo, setNovoNomeCargo] = useState("");
  const [salvandoCargo, setSalvandoCargo] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [solicitacoesPendentes, setSolicitacoesPendentes] = useState<any[]>([]);
  const [processandoSolicitacao, setProcessandoSolicitacao] = useState<string | null>(null);

  const loadSolicitacoesPendentes = async () => {
    try {
      const { data, error } = await supabase
        .from("vinculos_funcionario_pendentes")
        .select(`
          id,
          status,
          data_solicitacao,
          funcionarios:funcionario_id (id, nome, email, cargo),
          secretarias:secretaria_id (id, nome),
          solicitantes:solicitante_id (id, nome)
        `)
        .eq("prefeitura_id", id)
        .eq("status", "pendente")
        .order("data_solicitacao", { ascending: false });

      if (error) throw error;
      setSolicitacoesPendentes(data || []);
    } catch (error) {
      console.error("Erro ao carregar solicitações:", error);
    }
  };

  const aprovarSolicitacao = async (solicitacaoId: string, funcionarioId: string, secretariaId: string) => {
    setProcessandoSolicitacao(solicitacaoId);
    try {
      // Atualizar secretaria_id do funcionário
      const { error: updateError } = await supabase
        .from("funcionarios")
        .update({ secretaria_id: secretariaId })
        .eq("id", funcionarioId);

      if (updateError) throw updateError;

      // Marcar solicitação como aprovada
      const { error: solicitacaoError } = await supabase
        .from("vinculos_funcionario_pendentes")
        .update({
          status: "aprovado",
          data_resposta: new Date().toISOString(),
        })
        .eq("id", solicitacaoId);

      if (solicitacaoError) throw solicitacaoError;

      // Recarregar solicitações
      await loadSolicitacoesPendentes();
    } catch (error) {
      console.error("Erro ao aprovar solicitação:", error);
      alert("Erro ao aprovar solicitação");
    } finally {
      setProcessandoSolicitacao(null);
    }
  };

  const rejeitarSolicitacao = async (solicitacaoId: string, motivo?: string) => {
    setProcessandoSolicitacao(solicitacaoId);
    try {
      const { error } = await supabase
        .from("vinculos_funcionario_pendentes")
        .update({
          status: "rejeitado",
          data_resposta: new Date().toISOString(),
          mensagem_motivo: motivo || "Solicitação rejeitada",
        })
        .eq("id", solicitacaoId);

      if (error) throw error;

      // Recarregar solicitações
      await loadSolicitacoesPendentes();
    } catch (error) {
      console.error("Erro ao rejeitar solicitação:", error);
      alert("Erro ao rejeitar solicitação");
    } finally {
      setProcessandoSolicitacao(null);
    }
  };

  useEffect(() => {
    const isAdminCheck = isAuthenticated();
    const isPrefeituraUser = prefeituraSession && prefeituraSession.prefeitura_id === id;

    if (isAdminCheck) {
      // Admin master pode ver qualquer prefeitura
      setIsAdmin(true);
      setAutenticado(true);
      loadPrefeitura();
      loadTodosFuncionarios();
      loadSecretarias();
      loadSolicitacoesPendentes();
    } else if (isPrefeituraUser) {
      // Usuário de prefeitura pode ver apenas sua prefeitura
      setIsAdmin(false);
      setAutenticado(true);
      loadPrefeitura();
      loadTodosFuncionarios();
      loadSecretarias();
      loadSolicitacoesPendentes();
    } else if (prefeituraSession && prefeituraSession.prefeitura_id !== id) {
      // Usuário de prefeitura tentando acessar prefeitura que não é dele
      setErro("Acesso negado: você só pode visualizar sua própria prefeitura");
      setLoading(false);
    } else {
      // Não autenticado
      setLoading(false);
    }
  }, [id, prefeituraSession]);

  useEffect(() => {
    if (!autenticado || !prefeituraSession?.email) return;

    const redirect = async () => {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("secretaria_id, nome")
        .eq("email", prefeituraSession.email)
        .eq("prefeitura_id", id)
        .single();

      if (data?.secretaria_id) {
        router.push(`/secretaria/${data.secretaria_id}`);
      }
    };

    redirect();
  }, [autenticado, prefeituraSession?.email, id, router]);

  const loadPrefeitura = async () => {
    try {
      const { data, error } = await supabase
        .from("prefeituras")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      setPrefeitura(data);

      // Carregar logo da prefeitura
      const { data: configData } = await supabase
        .from("configuracao_prefeitura")
        .select("logo_url")
        .eq("prefeitura_id", id)
        .single();

      if (configData?.logo_url) {
        setLogoUrl(configData.logo_url);
      }

      // Carregar prefeito, vice-prefeito, fornecedores e contratos
      await loadFuncionarios();
      await loadFornecedores();
      await loadContratos();
    } catch (error) {
      console.error("Erro ao carregar prefeitura:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadFornecedores = async () => {
    try {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("id")
        .eq("prefeitura_id", id);

      if (!error) {
        setQuantidadeFornecedores(data?.length || 0);
      }
    } catch (error) {
      // Tabela pode não existir ainda
      setQuantidadeFornecedores(0);
    }
  };

  const loadContratos = async () => {
    try {
      const { data, error } = await supabase
        .from("contratos")
        .select("id")
        .eq("prefeitura_id", id);

      if (!error) {
        setQuantidadeContratos(data?.length || 0);
      }
    } catch (error) {
      // Tabela pode não existir ainda
      setQuantidadeContratos(0);
    }
  };

  const loadTodosFuncionarios = async () => {
    try {
      const { data: funcionarios, error } = await supabase
        .from("funcionarios")
        .select("*")
        .eq("prefeitura_id", id)
        .order("nome", { ascending: true });

      if (error) throw error;

      // Carregar nomes das secretarias
      const funcionariosComSecretaria = await Promise.all(
        (funcionarios || []).map(async (func) => {
          if (func.secretaria_id) {
            try {
              const { data: secretaria } = await supabase
                .from("secretarias")
                .select("nome")
                .eq("id", func.secretaria_id)
                .single();
              return { ...func, secretaria: secretaria?.nome };
            } catch (error) {
              return func;
            }
          }
          return func;
        })
      );

      setTodosFuncionarios(funcionariosComSecretaria);
    } catch (error) {
      console.error("Erro ao carregar funcionários:", error);
    }
  };

  const loadSecretarias = async () => {
    try {
      const { data, error } = await supabase
        .from("secretarias")
        .select("*")
        .eq("prefeitura_id", id);

      if (error) throw error;
      setSecretarias(data || []);
    } catch (error) {
      console.error("Erro ao carregar secretarias:", error);
    }
  };

  const loadFuncionarios = async () => {
    try {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("*")
        .eq("prefeitura_id", id);

      if (error) throw error;

      const pref = data?.find((f) => f.cargo === "prefeito") || null;
      const vice = data?.find((f) => f.cargo === "vice-prefeito") || null;

      // Contar cargos únicos e agrupar por tipo
      const cargosMap = new Map<string, number>();
      data?.forEach((f) => {
        const cargoNormalizado = f.cargo.toLowerCase();
        cargosMap.set(cargoNormalizado, (cargosMap.get(cargoNormalizado) || 0) + 1);
      });

      setCargosPorTipo(cargosMap);

      // Carregar TODOS os cargos da tabela cargos
      try {
        const { data: cargosData, error: cargosError } = await supabase
          .from("cargos")
          .select("id, nome")
          .eq("prefeitura_id", id)
          .order("nome", { ascending: true });

        if (!cargosError && cargosData) {
          const cargosComQuantidade = cargosData.map((cargo) => ({
            nome: cargo.nome,
            quantidade: cargosMap.get(cargo.nome.toLowerCase()) || 0,
          }));

          setTodosOsCargos(cargosComQuantidade);
          setQuantidadeCargos(cargosData.length);
        } else {
          setQuantidadeCargos(cargosMap.size);
        }
      } catch (error) {
        setQuantidadeCargos(cargosMap.size);
      }

      setPrefeito(pref);
      setVicePrefeito(vice);
    } catch (error) {
      console.error("Erro ao carregar funcionários:", error);
    }
  };

  const handleAddFuncionario = async (
    cargo: "prefeito" | "vice-prefeito",
    nome: string,
    email: string,
    telefone: string
  ) => {
    try {
      // Gerar senha aleatória
      const senhaTemp = Math.random().toString(36).substring(2, 10).toUpperCase();
      const senhaHash = crypto
        .createHash("sha256")
        .update(senhaTemp)
        .digest("hex");

      // Criar usuário em prefeitura_users
      const { error: userError } = await supabase
        .from("prefeitura_users")
        .insert([
          {
            prefeitura_id: id,
            nome,
            email,
            senha: senhaHash,
            role: cargo === "prefeito" ? "admin" : "vice-prefeito",
            status: "ativo",
          },
        ]);

      if (userError) throw userError;

      // Também registrar em funcionarios
      const { error: funcError } = await supabase.from("funcionarios").insert([
        {
          prefeitura_id: id,
          nome,
          email,
          telefone,
          cargo,
        },
      ]);

      if (funcError) throw funcError;
      await loadFuncionarios();

      // Armazenar email para atualizar senha se customizada
      setUsuarioCriadoEmail(email);

      return { senha: senhaTemp };
    } catch (error) {
      console.error("Erro ao adicionar funcionário:", error);
      throw error;
    }
  };

  const handleAtualizarSenhaCustomizada = async (novaSenha: string) => {
    if (!usuarioCriadoEmail) return;

    try {
      const senhaHash = crypto
        .createHash("sha256")
        .update(novaSenha)
        .digest("hex");

      const { error } = await supabase
        .from("prefeitura_users")
        .update({ senha: senhaHash })
        .eq("email", usuarioCriadoEmail)
        .eq("prefeitura_id", id);

      if (error) throw error;
      setUsuarioCriadoEmail(null);
    } catch (error) {
      console.error("Erro ao atualizar senha:", error);
      throw error;
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("prefeitura_session");
    router.push("/login");
  };

  const handleAbrirEditarCargo = (cargo: { nome: string; quantidade: number }) => {
    setCargoEditando(cargo);
    setNovoNomeCargo(cargo.nome);
    setModalEditarCargo(true);
  };

  const handleSalvarEditarCargo = async () => {
    if (!cargoEditando || !novoNomeCargo.trim()) {
      alert("Digite o novo nome do cargo");
      return;
    }

    setSalvandoCargo(true);

    try {
      const { error } = await supabase
        .from("cargos")
        .update({ nome: novoNomeCargo.trim() })
        .eq("nome", cargoEditando.nome)
        .eq("prefeitura_id", id);

      if (error) throw error;

      alert(`Cargo atualizado com sucesso!`);
      setModalEditarCargo(false);
      setCargoEditando(null);
      setNovoNomeCargo("");

      // Recarregar dados
      await loadPrefeitura();
    } catch (error) {
      console.error("Erro ao atualizar cargo:", error);
      alert("Erro ao atualizar cargo");
    } finally {
      setSalvandoCargo(false);
    }
  };

  const handleDeletarCargo = async () => {
    if (!cargoEditando) return;

    if (!confirm(`Tem certeza que deseja deletar o cargo "${cargoEditando.nome}"?`)) {
      return;
    }

    setSalvandoCargo(true);

    try {
      const { error } = await supabase
        .from("cargos")
        .delete()
        .eq("nome", cargoEditando.nome)
        .eq("prefeitura_id", id);

      if (error) throw error;

      alert("Cargo deletado com sucesso!");
      setModalEditarCargo(false);
      setCargoEditando(null);
      setNovoNomeCargo("");

      // Recarregar dados
      await loadPrefeitura();
    } catch (error) {
      console.error("Erro ao deletar cargo:", error);
      alert("Erro ao deletar cargo");
    } finally {
      setSalvandoCargo(false);
    }
  };


  const handleEditarFuncionario = async (
    funcionarioId: string,
    nome: string,
    email: string,
    telefone: string
  ) => {
    try {
      const { error } = await supabase
        .from("funcionarios")
        .update({ nome, email, telefone })
        .eq("id", funcionarioId);

      if (error) throw error;
      await loadFuncionarios();
    } catch (error) {
      console.error("Erro ao editar funcionário:", error);
      throw error;
    }
  };

  const handleLiberarAcesso = async () => {
    if (!prefeito || !prefeito.email || !prefeitura) return;

    setEnviandoEmail(true);
    try {
      // Verificar se já existe token
      const { data: existingToken } = await supabase
        .from("shared_access")
        .select("token")
        .eq("funcionario_email", prefeito.email)
        .eq("prefeitura_id", id)
        .gt("expires_at", new Date().toISOString())
        .single();

      let token: string;

      if (existingToken) {
        token = existingToken.token;
      } else {
        // Gerar novo token
        token = Math.random().toString(36).substring(2, 15) +
               Math.random().toString(36).substring(2, 15);

        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const { error: insertError } = await supabase
          .from("shared_access")
          .insert([
            {
              prefeitura_id: id,
              funcionario_nome: prefeito.nome,
              funcionario_email: prefeito.email,
              token,
              expires_at: expiresAt.toISOString(),
            },
          ]);

        if (insertError) throw insertError;
      }

      const acessoLink = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3003"}/acesso-prefeitura?token=${token}`;
      setTokenCompartilhado(acessoLink);
      setEnviandoEmail(false);
    } catch (error) {
      console.error("Erro ao liberar acesso:", error);
      alert("Erro ao liberar acesso. Tente novamente.");
      setEnviandoEmail(false);
    }
  };

  const handleCopiarLink = () => {
    if (!tokenCompartilhado) return;
    navigator.clipboard.writeText(tokenCompartilhado);
    alert("Link copiado para a área de transferência! 📋");
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Carregando...</p>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-6 text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">🔒 Acesso Negado</h2>
          <p className="text-gray-600 mb-6">{erro}</p>
          <button
            onClick={() => router.push("/")}
            className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-6 rounded transition"
          >
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!prefeitura) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Prefeitura não encontrada</p>
      </div>
    );
  }

  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "solicitacoes", label: "Solicitações" },
    { id: "resumo", label: "Resumo" },
    { id: "relatorios", label: "Relatórios" },
  ];

  const handleExport = () => {
    console.log("Exportando dados da prefeitura...");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNavBar
        title={`${prefeitura?.nome || "Prefeitura"}`}
        subtitle="Aqui está o que está acontecendo na sua prefeitura hoje"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tabId) => {
          setActiveTab(tabId);
          if (tabId === "solicitacoes") {
            loadSolicitacoesPendentes();
          }
        }}
        onExport={handleExport}
        userName={prefeituraSession?.nome || "Usuário"}
        userRole={prefeituraSession?.role || prefeituraSession?.cargo || "Usuário"}
        logoUrl={logoUrl}
      />

      <div className="app-container p-8">
        {/* Conteúdo Principal */}
        {/* Botão Compartilhar Link */}
        {autenticado && isAuthenticated() && (
          <div className="mt-12 mb-8 flex flex-col items-end gap-3">
            {tokenCompartilhado ? (
              <div className="bg-white border border-gray-300 rounded-lg p-3 max-w-sm">
                <p className="text-xs text-gray-600 mb-2 font-medium">Link para compartilhar:</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tokenCompartilhado}
                    readOnly
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded bg-gray-50 text-gray-700"
                  />
                  <button
                    onClick={handleCopiarLink}
                    className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition"
                  >
                    Copiar
                  </button>
                </div>
              </div>
            ) : null}
            <button
              onClick={() => setMostrarCompartilharLink(true)}
              disabled={!prefeitura}
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition font-medium bg-green-600 text-white border border-green-600 hover:bg-green-700"
            >
              <span className="text-lg">🔗</span>
              Liberar acesso
            </button>
          </div>
        )}

        {/* Cards Estatísticos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Card 1: Prefeitura */}
          <div
            onClick={() => router.push(`/prefeituras/${id}/configuracoes`)}
            className="bg-white rounded-xl shadow-sm p-6 cursor-pointer hover:shadow-md transition"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Prefeitura</p>
                <p className="text-lg font-bold text-gray-900 mt-2">
                  {prefeitura.nome}
                </p>
                <p className="text-xs text-gray-500 mt-2">CNPJ: {prefeitura.cnpj}</p>
              </div>
              <div className="bg-teal-100 p-3 rounded-lg text-2xl">🏛️</div>
            </div>
          </div>

          {/* Card 2: Total de Colaboradores */}
          <div
            onClick={() => router.push(`/prefeituras/${id}/funcionarios`)}
            className="bg-white rounded-xl shadow-sm p-6 cursor-pointer hover:shadow-md transition"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">
                  Total Colaboradores
                </p>
                <p className="text-3xl font-bold text-orange-600 mt-2">{todosFuncionarios.length}</p>
                <p className="text-xs text-gray-500 mt-2">
                  {todosFuncionarios.length > 0 ? "Cadastrados" : "Nenhum cadastrado"}
                </p>
              </div>
              <div className="bg-orange-100 p-3 rounded-lg text-2xl">👥</div>
            </div>
          </div>

          {/* Card 3: Secretários */}
          <div
            onClick={() => router.push(`/prefeituras/${id}/secretarios`)}
            className="bg-white rounded-xl shadow-sm p-6 cursor-pointer hover:shadow-md transition"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Secretários</p>
                <p className="text-3xl font-bold text-purple-600 mt-2">
                  {todosFuncionarios.filter((f) => {
                    const cargoLower = f.cargo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
                    return cargoLower.includes("secretario");
                  }).length}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {todosFuncionarios.filter((f) => {
                    const cargoLower = f.cargo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
                    return cargoLower.includes("secretario");
                  }).length > 0
                    ? "Ativos"
                    : "Nenhum"}
                </p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg text-2xl">🎩</div>
            </div>
          </div>

          {/* Card 4: Secretarias */}
          <div
            onClick={() => router.push(`/prefeituras/${id}/secretarias`)}
            className="bg-white rounded-xl shadow-sm p-6 cursor-pointer hover:shadow-md transition"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">
                  Secretarias
                </p>
                <p className="text-3xl font-bold text-blue-600 mt-2">{secretarias.length}</p>
                <p className="text-xs text-gray-500 mt-2">
                  {secretarias.length > 0 ? "Cadastradas" : "Nenhuma"}
                </p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg text-2xl">📂</div>
            </div>
          </div>

          {/* Card 5: Prefeito - Apenas Admin Master */}
          {isAdmin && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-gray-600 text-sm font-medium">Prefeito</p>
                  {prefeito ? (
                    <>
                      <p className="text-lg font-bold text-gray-900 mt-2">
                        {prefeito.nome}
                      </p>
                      {autenticado && (
                        <button
                          onClick={() => setModalEditarPrefeito(true)}
                          className="mt-2 px-2 py-1 text-blue-600 hover:text-blue-700 text-xs font-medium flex items-center gap-1 transition"
                        >
                          ✏️ Editar
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => setModalPrefeito(true)}
                      className="mt-3 px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm font-medium transition"
                    >
                      + Adicionar Prefeito
                    </button>
                  )}
                </div>
                <div className="bg-amber-100 p-3 rounded-lg text-2xl">👔</div>
              </div>
            </div>
          )}

          {/* Card 6: Vice Prefeito - Apenas Admin Master */}
          {isAdmin && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-gray-600 text-sm font-medium">
                    Vice Prefeito
                  </p>
                  {vicePrefeito ? (
                    <>
                      <p className="text-lg font-bold text-gray-900 mt-2">
                        {vicePrefeito.nome}
                      </p>
                      {autenticado && (
                        <button
                          onClick={() => setModalEditarVicePrefeito(true)}
                          className="mt-2 px-2 py-1 text-blue-600 hover:text-blue-700 text-xs font-medium flex items-center gap-1 transition"
                        >
                          ✏️ Editar
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => setModalVicePrefeito(true)}
                      className="mt-3 px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm font-medium transition"
                    >
                      + Adicionar Vice
                    </button>
                  )}
                </div>
                <div className="bg-rose-100 p-3 rounded-lg text-2xl">👩‍💼</div>
              </div>
            </div>
          )}


          {/* Card 9: Avisos */}
          <div
            onClick={() => setMostrarDetalheCargos(!mostrarDetalheCargos)}
            className="bg-white rounded-xl shadow-sm p-6 cursor-pointer hover:shadow-md transition"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">
                  Avisos
                </p>
                <p className="text-2xl font-bold text-purple-600 mt-2">
                  {quantidadeCargos}
                </p>
                <p className="text-xs text-gray-500 mt-2">Tipos diferentes</p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg text-2xl">👔</div>
            </div>
          </div>

          {/* Card 7: Notas Fiscais */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">
                  Notas Fiscais
                </p>
                <p className="text-3xl font-bold text-orange-600 mt-2">156</p>
                <p className="text-xs text-green-600 mt-2">↑ 12 este mês</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-lg text-2xl">📄</div>
            </div>
          </div>

          {/* Card 8: Total Gasto */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">
                  Total Gasto (4m)
                </p>
                <p className="text-2xl font-bold text-green-600 mt-2">
                  R$ 125.4k
                </p>
                <p className="text-xs text-red-600 mt-2">↑ 5% vs ago</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg text-2xl">💰</div>
            </div>
          </div>

          {/* Card 9: Avisos */}
          <div
            onClick={() => setMostrarDetalheCargos(!mostrarDetalheCargos)}
            className="bg-white rounded-xl shadow-sm p-6 cursor-pointer hover:shadow-md transition"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">
                  Avisos
                </p>
                <p className="text-2xl font-bold text-purple-600 mt-2">
                  {quantidadeCargos}
                </p>
                <p className="text-xs text-gray-500 mt-2">Tipos diferentes</p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg text-2xl">👔</div>
            </div>
          </div>

          {/* Card 10: Fornecedores */}
          <button
            onClick={() => router.push(`/prefeituras/${id}/fornecedores`)}
            className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition cursor-pointer text-left w-full"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">
                  Fornecedores
                </p>
                <p className="text-2xl font-bold text-blue-600 mt-2">
                  {quantidadeFornecedores}
                </p>
                <p className="text-xs text-gray-500 mt-2">Cadastrados</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg text-2xl">🏢</div>
            </div>
          </button>

          {/* Card 11: Contratos */}
          <button
            onClick={() => router.push(`/prefeituras/${id}/contratos`)}
            className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition cursor-pointer text-left w-full"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">
                  Contratos
                </p>
                <p className="text-2xl font-bold text-indigo-600 mt-2">
                  {quantidadeContratos}
                </p>
                <p className="text-xs text-gray-500 mt-2">Cadastrados</p>
              </div>
              <div className="bg-indigo-100 p-3 rounded-lg text-2xl">📋</div>
            </div>
          </button>
        </div>

        {/* Modal: Todos os Funcionários */}
        {mostrarTodosFuncionarios && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full max-h-96 overflow-y-auto p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">👥 Todos os Colaboradores</h2>
                <button
                  onClick={() => setMostrarTodosFuncionarios(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Nome</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Cargo</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Secretaria</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todosFuncionarios.map((func) => (
                      <tr key={func.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-900">{func.nome}</td>
                        <td className="py-3 px-4 text-gray-600 capitalize">{func.cargo}</td>
                        <td className="py-3 px-4 text-gray-600">{func.secretaria || "-"}</td>
                        <td className="py-3 px-4 text-gray-600">{func.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Detalhes de Cargos */}
        {mostrarDetalheCargos && (
          <div className="bg-white rounded-xl shadow-sm p-8 mb-8 animate-in fade-in">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">👔 Cargos por Tipo</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-full">
              {todosOsCargos.map((cargo) => (
                <button
                  key={cargo.nome}
                  onClick={() => handleAbrirEditarCargo(cargo)}
                  className="flex flex-col items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-transparent rounded-lg border border-purple-200 hover:border-purple-400 hover:shadow-md transition cursor-pointer"
                  style={{ maxWidth: "400px" }}
                >
                  <div className="text-center">
                    <p className="font-medium text-gray-900 capitalize">{cargo.nome}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {cargo.quantidade} {cargo.quantidade === 1 ? "funcionário" : "funcionários"}
                    </p>
                  </div>
                  <div className="bg-purple-100 px-4 py-2 rounded-lg mt-3">
                    <p className="text-2xl font-bold text-purple-600">{cargo.quantidade}</p>
                  </div>
                </button>
              ))}
            </div>

            {todosOsCargos.length === 0 && (
              <p className="text-center text-gray-500 py-8">
                Nenhum cargo registrado
              </p>
            )}
          </div>
        )}

        {/* Modal: Editar Cargo */}
        {modalEditarCargo && cargoEditando && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                ✏️ Editar Cargo
              </h2>

              <form onSubmit={(e) => { e.preventDefault(); handleSalvarEditarCargo(); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome do Cargo *
                  </label>
                  <input
                    type="text"
                    value={novoNomeCargo}
                    onChange={(e) => setNovoNomeCargo(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={salvandoCargo}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                  >
                    {salvandoCargo ? "Salvando..." : "Salvar"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeletarCargo}
                    disabled={salvandoCargo}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                  >
                    Deletar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalEditarCargo(false);
                      setCargoEditando(null);
                      setNovoNomeCargo("");
                    }}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-medium py-2 px-4 rounded-lg transition"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Seção de Solicitações de Vinculação */}
        {activeTab === "solicitacoes" && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Solicitações de Vinculação</h2>

            {solicitacoesPendentes.length > 0 ? (
              <div className="space-y-4">
                {solicitacoesPendentes.map((solicitacao: any) => (
                  <div
                    key={solicitacao.id}
                    className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-orange-400"
                  >
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-bold text-gray-900">
                            {solicitacao.funcionarios?.nome || "Funcionário"}
                          </h3>
                          <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                            Pendente
                          </span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                          <div>
                            <p className="text-xs text-gray-600 font-medium">Cargo</p>
                            <p className="text-sm text-gray-900">{solicitacao.funcionarios?.cargo || "N/A"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 font-medium">Email</p>
                            <p className="text-sm text-blue-600">{solicitacao.funcionarios?.email || "N/A"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 font-medium">Secretaria</p>
                            <p className="text-sm text-gray-900">{solicitacao.secretarias?.nome || "N/A"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 font-medium">Solicitante</p>
                            <p className="text-sm text-gray-900">{solicitacao.solicitantes?.nome || "N/A"}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            aprovarSolicitacao(
                              solicitacao.id,
                              solicitacao.funcionarios.id,
                              solicitacao.secretarias.id
                            )
                          }
                          disabled={processandoSolicitacao === solicitacao.id}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium disabled:opacity-50"
                        >
                          {processandoSolicitacao === solicitacao.id ? "..." : "✓ Aprovar"}
                        </button>
                        <button
                          onClick={() => rejeitarSolicitacao(solicitacao.id)}
                          disabled={processandoSolicitacao === solicitacao.id}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-medium disabled:opacity-50"
                        >
                          {processandoSolicitacao === solicitacao.id ? "..." : "✕ Rejeitar"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-200">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-gray-600 font-medium">Nenhuma solicitação pendente</p>
                <p className="text-sm text-gray-500 mt-2">Todas as solicitações foram processadas</p>
              </div>
            )}
          </div>
        )}

        {/* Seção de Avisos (Dashboard) */}
        {activeTab === "dashboard" && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">📢 Avisos</h2>
          <div className="space-y-3">
            {/* Aviso de Solicitações Pendentes */}
            {solicitacoesPendentes.length > 0 && (
              <button
                onClick={() => setActiveTab("solicitacoes")}
                className="w-full text-left flex items-start gap-3 p-3 bg-orange-50 rounded-lg border-l-4 border-orange-400 hover:bg-orange-100 transition"
              >
                <span className="text-xl">📋</span>
                <div>
                  <p className="font-medium text-gray-900">
                    Solicitações de vinculação pendentes
                  </p>
                  <p className="text-sm text-gray-600">
                    {solicitacoesPendentes.length} {solicitacoesPendentes.length === 1 ? "solicitação" : "solicitações"} aguardando sua aprovação
                  </p>
                </div>
              </button>
            )}

            <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="font-medium text-gray-900">
                  Renovação de licenças vencendo
                </p>
                <p className="text-sm text-gray-600">
                  3 licenças vencerão nos próximos 7 dias
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border-l-4 border-blue-400">
              <span className="text-xl">ℹ️</span>
              <div>
                <p className="font-medium text-gray-900">
                  Documentos pendentes
                </p>
                <p className="text-sm text-gray-600">
                  5 notas fiscais aguardando aprovação do financeiro
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border-l-4 border-green-400">
              <span className="text-xl">✅</span>
              <div>
                <p className="font-medium text-gray-900">
                  Processos em dia
                </p>
                <p className="text-sm text-gray-600">
                  Todos os processos de aprovação estão em dia
                </p>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Modais */}
        <AdicionarFuncionarioModal
          isOpen={modalPrefeito}
          cargo="prefeito"
          onClose={() => setModalPrefeito(false)}
          onSubmit={(nome, email, telefone) =>
            handleAddFuncionario("prefeito", nome, email, telefone)
          }
          onAtualizarSenha={handleAtualizarSenhaCustomizada}
        />
        <AdicionarFuncionarioModal
          isOpen={modalVicePrefeito}
          cargo="vice-prefeito"
          onClose={() => setModalVicePrefeito(false)}
          onSubmit={(nome, email, telefone) =>
            handleAddFuncionario("vice-prefeito", nome, email, telefone)
          }
          onAtualizarSenha={handleAtualizarSenhaCustomizada}
        />
        <EditarFuncionarioModal
          isOpen={modalEditarPrefeito}
          funcionario={prefeito}
          cargo="prefeito"
          onClose={() => setModalEditarPrefeito(false)}
          onSubmit={handleEditarFuncionario}
        />
        <EditarFuncionarioModal
          isOpen={modalEditarVicePrefeito}
          funcionario={vicePrefeito}
          cargo="vice-prefeito"
          onClose={() => setModalEditarVicePrefeito(false)}
          onSubmit={handleEditarFuncionario}
        />
        <CompartilharLinkModal
          isOpen={mostrarCompartilharLink}
          onClose={() => setMostrarCompartilharLink(false)}
          prefeituraNome={prefeitura?.nome || ""}
          link={`${process.env.NEXT_PUBLIC_BASE_URL}/login`}
        />
      </div>
    </div>
  );
}

export default function DetalhePrefeitura() {
  return (
    <ProtectedRoute>
      <DetalhePrefeituraContent />
    </ProtectedRoute>
  );
}
