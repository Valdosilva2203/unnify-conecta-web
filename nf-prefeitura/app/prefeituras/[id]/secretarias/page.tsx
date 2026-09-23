"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Share2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isAuthenticated } from "@/lib/auth";
import { usePrefeituraAuth } from "@/hooks/usePrefeituraAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import TopNavBar from "@/components/TopNavBar";

interface Secretaria {
  id: string;
  prefeitura_id: string;
  nome: string;
  email: string;
  cnpj?: string;
  telefone: string;
  descricao: string;
}

interface Funcionario {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cargo: string;
}

interface NotaFiscal {
  id: string;
  numero: string;
  data: string;
  valor: number;
}

interface Cargo {
  id: string;
  nome: string;
  prefeitura_id: string;
}

function SecretariasContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const { session: prefeituraSession } = usePrefeituraAuth();

  const hashSenha = async (senha: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(senha);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const loadFuncionariosSemSecretaria = async () => {
    try {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("*")
        .eq("prefeitura_id", id)
        .is("secretaria_id", null)
        .order("nome", { ascending: true });

      if (error) throw error;
      setFuncionariosSemSecretaria(data || []);
    } catch (error) {
      console.error("Erro ao carregar funcionários sem secretaria:", error);
    }
  };

  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [selectedSecretaria, setSelectedSecretaria] = useState<Secretaria | null>(null);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [notasFiscais, setNotasFiscais] = useState<NotaFiscal[]>([]);
  const [loading, setLoading] = useState(true);
  const [autenticado, setAutenticado] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    cnpj: "",
    telefone: "",
    descricao: "",
  });
  const [editandoSecretaria, setEditandoSecretaria] = useState<Secretaria | null>(null);
  const [mostrarFormularioSecretario, setMostrarFormularioSecretario] = useState(false);
  const [formSecretario, setFormSecretario] = useState({
    funcionario_id: "",
    cargo_id: "",
  });
  const [salvandoSecretario, setSalvandoSecretario] = useState(false);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [funcionariosSemSecretaria, setFuncionariosSemSecretaria] = useState<Funcionario[]>([]);
  const [mostrarNovoCargoModal, setMostrarNovoCargoModal] = useState(false);
  const [novoCargoNome, setNovoCargoNome] = useState("");
  const [criadoNovoCargoModal, setCriadoNovoCargoModal] = useState(false);
  const [usarSenhaPersonalizada, setUsarSenhaPersonalizada] = useState(false);
  const [senhaPersonalizada, setSenhaPersonalizada] = useState("");
  const [mostrarSenhaPersonalizada, setMostrarSenhaPersonalizada] = useState(false);
  const [secretariosResponsaveis, setSecretariosResponsaveis] = useState<
    Record<string, string>
  >({});
  const [viceSecretariosResponsaveis, setViceSecretariosResponsaveis] = useState<
    Record<string, string>
  >({});
  const [mostrarFormularioViceSecretario, setMostrarFormularioViceSecretario] = useState(false);
  const [formViceSecretario, setFormViceSecretario] = useState({
    funcionario_id: "",
    cargo_id: "",
  });
  const [salvandoViceSecretario, setSalvandoViceSecretario] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("todas");
  const [mostrarCompartilharModal, setMostrarCompartilharModal] = useState(false);
  const [secretariaCompartilhar, setSecretariaCompartilhar] = useState<Secretaria | null>(null);
  const [linkCompartilhado, setLinkCompartilhado] = useState<string | null>(null);

  useEffect(() => {
    const isAdminCheck = isAuthenticated();
    const isPrefeituraUser = prefeituraSession && prefeituraSession.tipo === "admin" && prefeituraSession.prefeitura_id === id;

    if (isAdminCheck) {
      setIsAdmin(true);
      setAutenticado(true);
      loadSecretarias();
    } else if (isPrefeituraUser) {
      setIsAdmin(false);
      setAutenticado(true);
      loadSecretarias();
    } else {
      setLoading(false);
    }
  }, [id, prefeituraSession]);

  useEffect(() => {
    if (secretarias.length === 0) return;

    const secretariaId = searchParams.get("secretaria_id");
    if (secretariaId) {
      const secretaria = secretarias.find(s => s.id === secretariaId);
      if (secretaria) {
        setSelectedSecretaria(secretaria);
        loadFuncionariosBySecretaria(secretaria.id);
        loadNotasFiscaisBySecretaria(secretaria.id);
      }
    }
  }, [secretarias]);

  useEffect(() => {
    if (editandoSecretaria?.id) {
      const buscarSecretaria = async () => {
        try {
          const { data } = await supabase
            .from("secretarias")
            .select("*")
            .eq("id", editandoSecretaria.id)
            .single();
          if (data) setEditandoSecretaria(data);
        } catch (error) {
          console.error("Erro ao buscar secretaria:", error);
        }
      };
      buscarSecretaria();
    }
  }, [editandoSecretaria?.id]);

  const loadSecretarias = async () => {
    try {
      const { data, error } = await supabase
        .from("secretarias")
        .select("*")
        .eq("prefeitura_id", id)
        .order("nome", { ascending: true });

      if (error) throw error;

      const secretariasData = data || [];
      setSecretarias(secretariasData);

      // Carregar os nomes do secretário e vice-secretário para cada secretaria
      const responsaveis: Record<string, string> = {};
      const viceResponsaveis: Record<string, string> = {};

      for (const secretaria of secretariasData) {
        try {
          const { data: funcionarios, error } = await supabase
            .from("funcionarios")
            .select("nome, cargo")
            .eq("secretaria_id", secretaria.id)
            .order("cargo", { ascending: true })
            .limit(2);

          if (funcionarios && funcionarios.length > 0) {
            responsaveis[secretaria.id] = funcionarios[0].nome;

            if (funcionarios.length > 1) {
              viceResponsaveis[secretaria.id] = funcionarios[1].nome;
            }
          }
        } catch (error) {
          console.error("Erro ao carregar secretário de", secretaria.nome, error);
        }
      }
      setSecretariosResponsaveis(responsaveis);
      setViceSecretariosResponsaveis(viceResponsaveis);

      // Se houver secretarias, selecionar a primeira automaticamente
      if (secretariasData.length > 0) {
        handleSelectSecretaria(secretariasData[0]);
      }
    } catch (error) {
      console.error("Erro ao carregar secretarias:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSecretaria = async (secretaria: Secretaria) => {
    setSelectedSecretaria(secretaria);
    loadFuncionariosBySecretaria(secretaria.id);
    loadNotasFiscaisBySecretaria(secretaria.id);
  };

  const loadSecretariosResponsaveisPorSecretaria = async (secretariaId: string) => {
    try {
      // 1. Carregar secretário principal (do campo secretaria_id)
      const { data: funcionarios } = await supabase
        .from("funcionarios")
        .select("nome, cargo")
        .eq("secretaria_id", secretariaId)
        .order("cargo", { ascending: true })
        .limit(1);

      if (funcionarios && funcionarios.length > 0) {
        setSecretariosResponsaveis((prev) => ({
          ...prev,
          [secretariaId]: funcionarios[0].nome,
        }));
      }

      // 2. Carregar vice (da tabela funcionario_secretarias)
      const { data: viceLinkage } = await supabase
        .from("funcionario_secretarias")
        .select("funcionario_id")
        .eq("secretaria_id", secretariaId)
        .limit(1);

      if (viceLinkage && viceLinkage.length > 0) {
        // Buscar o nome do funcionário
        const { data: viceFunc } = await supabase
          .from("funcionarios")
          .select("nome")
          .eq("id", viceLinkage[0].funcionario_id)
          .single();

        if (viceFunc?.nome) {
          setViceSecretariosResponsaveis((prev) => ({
            ...prev,
            [secretariaId]: viceFunc.nome,
          }));
        }
      } else {
        // Se não há vice, limpar do estado
        setViceSecretariosResponsaveis((prev) => {
          const newState = { ...prev };
          delete newState[secretariaId];
          return newState;
        });
      }
    } catch (error) {
      console.error("Erro ao carregar secretários responsáveis:", error);
    }
  };

  const loadFuncionariosBySecretaria = async (secretariaId: string) => {
    try {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("*")
        .eq("secretaria_id", secretariaId);

      if (!error) {
        setFuncionarios(data || []);
      }
    } catch (error) {
      console.error("Erro ao carregar funcionários:", error);
    }
  };

  const loadNotasFiscaisBySecretaria = async (secretariaId: string) => {
    try {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*")
        .eq("secretaria_id", secretariaId);

      if (error) {
        // Silenciosamente ignora erros de coluna não encontrada
        setNotasFiscais([]);
      } else {
        setNotasFiscais(data || []);
      }
    } catch (error) {
      setNotasFiscais([]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const loadCargos = async () => {
    try {
      const { data, error } = await supabase
        .from("cargos")
        .select("*")
        .eq("prefeitura_id", id)
        .order("nome", { ascending: true });

      if (error) throw error;
      setCargos(data || []);
    } catch (error) {
      console.error("Erro ao carregar cargos:", error);
    }
  };

  const handleChangeSecretario = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormSecretario((prev) => ({ ...prev, [name]: value }));
  };

  const handleAbrirFormularioSecretario = async () => {
    setMostrarFormularioSecretario(true);
    await loadCargos();
    await loadFuncionariosSemSecretaria();
    setFormSecretario({ funcionario_id: "", cargo_id: "" });
  };

  const handleCriarNovoCargoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!novoCargoNome.trim()) {
      alert("Digite o nome do cargo");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("cargos")
        .insert([
          {
            prefeitura_id: id,
            nome: novoCargoNome.trim(),
          },
        ])
        .select("*")
        .single();

      if (error) throw error;

      setCargos([...cargos, data]);
      setFormSecretario((prev) => ({ ...prev, cargo: data.id }));
      setNovoCargoNome("");
      setMostrarNovoCargoModal(false);
      alert(`Cargo "${data.nome}" criado com sucesso!`);
    } catch (error) {
      console.error("Erro ao criar cargo:", error);
      alert("Erro ao criar cargo");
    }
  };

  const handleSubmitSecretario = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvandoSecretario(true);

    try {
      if (!formSecretario.funcionario_id) {
        alert("Selecione um funcionário");
        setSalvandoSecretario(false);
        return;
      }

      if (!formSecretario.cargo_id) {
        alert("Selecione um cargo");
        setSalvandoSecretario(false);
        return;
      }

      if (!selectedSecretaria) {
        alert("Selecione uma secretaria");
        setSalvandoSecretario(false);
        return;
      }

      const cargoSelecionado = cargos.find((c) => c.id === formSecretario.cargo_id);
      if (!cargoSelecionado) {
        alert("Cargo não encontrado");
        setSalvandoSecretario(false);
        return;
      }

      // Atualizar funcionário com novo cargo e secretaria
      const { error: updateError } = await supabase
        .from("funcionarios")
        .update({
          cargo: cargoSelecionado.nome,
          secretaria_id: selectedSecretaria.id,
        })
        .eq("id", formSecretario.funcionario_id);

      if (updateError) throw updateError;

      alert(`Secretário vinculado com sucesso!\n\nCargo: ${cargoSelecionado.nome}\nSecretaria: ${selectedSecretaria.nome}`);
      setFormSecretario({ funcionario_id: "", cargo_id: "" });
      setSenhaPersonalizada("");
      setUsarSenhaPersonalizada(false);
      setMostrarFormularioSecretario(false);
      await loadSecretariosResponsaveisPorSecretaria(selectedSecretaria.id);
    } catch (error) {
      console.error("Erro ao cadastrar funcionário:", error);
      alert("Erro ao cadastrar funcionário");
    } finally {
      setSalvandoSecretario(false);
    }
  };

  const handleRemoverSecretario = async () => {
    if (!selectedSecretaria) return;

    if (!confirm(`Tem certeza que deseja remover o secretário desta secretaria?`)) {
      return;
    }

    setSalvandoSecretario(true);

    try {
      // Encontrar o funcionário responsável por essa secretaria
      const { data: funcionarios } = await supabase
        .from("funcionarios")
        .select("id")
        .eq("secretaria_id", selectedSecretaria.id)
        .eq("prefeitura_id", id);

      if (funcionarios && funcionarios.length > 0) {
        const funcionarioId = funcionarios[0].id;

        // Remover a secretaria do funcionário
        const { error: updateError } = await supabase
          .from("funcionarios")
          .update({
            secretaria_id: null,
          })
          .eq("id", funcionarioId);

        if (updateError) throw updateError;

        alert("Secretário removido com sucesso!");
        await loadSecretariosResponsaveisPorSecretaria(selectedSecretaria.id);
      }
    } catch (error) {
      console.error("Erro ao remover secretário:", error);
      alert("Erro ao remover secretário");
    } finally {
      setSalvandoSecretario(false);
    }
  };

  const handleAbrirFormularioViceSecretario = async () => {
    setMostrarFormularioViceSecretario(true);
    await loadCargos();
    await loadFuncionariosSemSecretaria();
    setFormViceSecretario({ funcionario_id: "", cargo_id: "" });
  };

  const handleChangeViceSecretario = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormViceSecretario((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmitViceSecretario = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvandoViceSecretario(true);

    try {
      if (!formViceSecretario.funcionario_id) {
        alert("Selecione um funcionário");
        setSalvandoViceSecretario(false);
        return;
      }

      if (!formViceSecretario.cargo_id) {
        alert("Selecione um cargo");
        setSalvandoViceSecretario(false);
        return;
      }

      if (!selectedSecretaria) {
        alert("Selecione uma secretaria");
        setSalvandoViceSecretario(false);
        return;
      }

      const cargoSelecionado = cargos.find((c) => c.id === formViceSecretario.cargo_id);
      if (!cargoSelecionado) {
        alert("Cargo não encontrado");
        setSalvandoViceSecretario(false);
        return;
      }

      // 1. Atualizar funcionário com novo cargo
      const { error: updateError } = await supabase
        .from("funcionarios")
        .update({
          cargo: cargoSelecionado.nome,
        })
        .eq("id", formViceSecretario.funcionario_id);

      if (updateError) throw updateError;

      // 2. Deletar qualquer registro existente (para evitar duplicata)
      await supabase
        .from("funcionario_secretarias")
        .delete()
        .eq("funcionario_id", formViceSecretario.funcionario_id)
        .eq("secretaria_id", selectedSecretaria.id);

      // 3. Inserir na tabela funcionario_secretarias (relação muitos-para-muitos)
      const { error: insertError } = await supabase
        .from("funcionario_secretarias")
        .insert([{
          funcionario_id: formViceSecretario.funcionario_id,
          secretaria_id: selectedSecretaria.id,
        }]);

      if (insertError) throw insertError;

      alert(`Vice-secretário vinculado com sucesso!\n\nCargo: ${cargoSelecionado.nome}\nSecretaria: ${selectedSecretaria.nome}`);
      setFormViceSecretario({ funcionario_id: "", cargo_id: "" });
      setMostrarFormularioViceSecretario(false);
      await loadSecretariosResponsaveisPorSecretaria(selectedSecretaria.id);
    } catch (error: any) {
      console.error("Erro ao cadastrar vice-secretário:", error);
      const mensagem = error?.message || error?.details || JSON.stringify(error);
      alert(`Erro ao cadastrar vice-secretário:\n${mensagem}`);
    } finally {
      setSalvandoViceSecretario(false);
    }
  };

  const handleRemoverViceSecretario = async () => {
    if (!selectedSecretaria) return;

    if (!confirm(`Tem certeza que deseja remover o vice-secretário desta secretaria?`)) {
      return;
    }

    setSalvandoViceSecretario(true);

    try {
      let funcionarioId: string | null = null;
      let metodo: "funcionario_secretarias" | "secretaria_id" | null = null;

      // 1. Procurar na tabela funcionario_secretarias (novo método)
      const { data: vicesNovos } = await supabase
        .from("funcionario_secretarias")
        .select("funcionario_id")
        .eq("secretaria_id", selectedSecretaria.id);

      if (vicesNovos && vicesNovos.length > 0) {
        funcionarioId = vicesNovos[0].funcionario_id;
        metodo = "funcionario_secretarias";
      } else {
        // 2. Se não encontrar, procurar pelo campo secretaria_id (vices antigos)
        const { data: funcionariosAntigos } = await supabase
          .from("funcionarios")
          .select("id")
          .eq("secretaria_id", selectedSecretaria.id)
          .eq("prefeitura_id", id)
          .neq("id", "00000000-0000-0000-0000-000000000000"); // Excluir IDs inválidos

        // Pegar o segundo funcionário (o primeiro é o secretário principal)
        if (funcionariosAntigos && funcionariosAntigos.length > 1) {
          funcionarioId = funcionariosAntigos[1].id;
          metodo = "secretaria_id";
        }
      }

      if (!funcionarioId) {
        alert("Nenhum vice-secretário encontrado!");
        setSalvandoViceSecretario(false);
        return;
      }

      // Remover baseado no método encontrado
      if (metodo === "funcionario_secretarias") {
        const { error: deleteError } = await supabase
          .from("funcionario_secretarias")
          .delete()
          .eq("secretaria_id", selectedSecretaria.id)
          .eq("funcionario_id", funcionarioId);

        if (deleteError) throw deleteError;
      } else if (metodo === "secretaria_id") {
        const { error: updateError } = await supabase
          .from("funcionarios")
          .update({ secretaria_id: null })
          .eq("id", funcionarioId);

        if (updateError) throw updateError;
      }

      // Atualizar cargo do funcionário para "Usuario comum"
      const { error: updateCargoError } = await supabase
        .from("funcionarios")
        .update({ cargo: "Usuario comum" })
        .eq("id", funcionarioId);

      if (updateCargoError) throw updateCargoError;

      alert("Vice-secretário removido com sucesso e cargo atualizado para Usuário comum!");
      await loadSecretariosResponsaveisPorSecretaria(selectedSecretaria.id);
    } catch (error) {
      console.error("Erro ao remover vice-secretário:", error);
      alert("Erro ao remover vice-secretário");
    } finally {
      setSalvandoViceSecretario(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    try {
      if (!formData.nome || !formData.email) {
        alert("Preencha nome e email");
        setSalvando(false);
        return;
      }

      const { error } = await supabase.from("secretarias").insert([
        {
          prefeitura_id: id,
          nome: formData.nome,
          email: formData.email,
          cnpj: formData.cnpj,
          telefone: formData.telefone,
          descricao: formData.descricao,
        },
      ]);

      if (error) {
        console.error("Erro do Supabase:", error);
        throw new Error(error.message || "Erro ao adicionar secretaria");
      }

      alert("Secretaria adicionada com sucesso!");
      setFormData({ nome: "", email: "", cnpj: "", telefone: "", descricao: "" });
      setMostrarFormulario(false);
      await loadSecretarias();
    } catch (error) {
      console.error("Erro ao adicionar secretaria:", error);
      const errorMsg = error instanceof Error ? error.message : "Erro desconhecido";
      alert(`Erro ao adicionar secretaria: ${errorMsg}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleCompartilhar = (secretaria: Secretaria) => {
    const link = `${typeof window !== "undefined" ? window.location.origin : ""}/secretaria/${secretaria.id}`;
    setLinkCompartilhado(link);
    setSecretariaCompartilhar(secretaria);
    setMostrarCompartilharModal(true);
  };

  const handleCopiarLink = () => {
    if (linkCompartilhado) {
      navigator.clipboard.writeText(linkCompartilhado);
      alert("Link copiado para a área de transferência!");
      setMostrarCompartilharModal(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Carregando...</p>
      </div>
    );
  }

  if (!autenticado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Acesso negado</p>
      </div>
    );
  }

  const tabs = [
    { id: "todas", label: "Todas" },
    { id: "ativas", label: "Ativas" },
    { id: "recentes", label: "Recentes" },
  ];

  const handleExport = () => {
    // TODO: Implementar exportação de secretarias
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNavBar
        title="Secretarias"
        subtitle="Gerenciar secretarias da prefeitura"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onExport={handleExport}
        userName={prefeituraSession?.nome || "Usuário"}
        userRole={prefeituraSession?.role || prefeituraSession?.cargo || "Usuário"}
      />

      <div className="app-container p-8">
        {/* Botão Voltar */}
        <button
          onClick={() => router.back()}
          className="bg-white text-orange-600 hover:bg-orange-50 hover:text-orange-700 border border-orange-600 shadow-sm hover:shadow-md transition font-medium px-4 py-2 rounded-lg flex items-center gap-2 mb-6"
        >
          <span>←</span>
          Voltar
        </button>

        {(isAdmin || prefeituraSession?.role === "admin") && (
          <div className="mt-12 mb-12 flex justify-end">
            <button
              onClick={() => setMostrarFormulario(!mostrarFormulario)}
              className="flex items-center gap-2 px-5 py-2.5 text-green-600 hover:text-green-700 border-2 border-green-600 hover:border-green-700 rounded-lg transition bg-white hover:bg-green-50 font-medium text-sm"
            >
              <span className="text-lg">✨</span>
              Adicionar Secretaria
            </button>
          </div>
        )}

        {/* Formulário de Adicionar Secretaria */}
        {mostrarFormulario && (
          <div className="bg-white rounded-xl shadow-sm p-8 mb-8 animate-in fade-in">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">➕ Adicionar Secretaria</h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome *
                  </label>
                  <input
                    type="text"
                    name="nome"
                    value={formData.nome}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Ex: Secretaria de Educação"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="email@secretaria.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    CNPJ
                  </label>
                  <input
                    type="text"
                    name="cnpj"
                    value={formData.cnpj}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="XX.XXX.XXX/XXXX-XX"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Telefone
                  </label>
                  <input
                    type="tel"
                    name="telefone"
                    value={formData.telefone}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="(XX) XXXXX-XXXX"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descrição
                  </label>
                  <input
                    type="text"
                    name="descricao"
                    value={formData.descricao}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Descrição da secretaria"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                >
                  {salvando ? "Salvando..." : "Salvar Secretaria"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMostrarFormulario(false);
                    setFormData({ nome: "", email: "", cnpj: "", telefone: "", descricao: "" });
                  }}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-medium py-2 px-4 rounded-lg transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Modal Editar Secretaria */}
        {editandoSecretaria && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Editar Secretaria</h2>

              <form onSubmit={async (e) => {
                e.preventDefault();
                setSalvando(true);
                try {
                  const { error } = await supabase
                    .from("secretarias")
                    .update({
                      nome: editandoSecretaria.nome,
                      email: editandoSecretaria.email,
                      cnpj: editandoSecretaria.cnpj || "",
                      telefone: editandoSecretaria.telefone,
                      descricao: editandoSecretaria.descricao,
                    })
                    .eq("id", editandoSecretaria.id);

                  if (error) throw error;
                  alert("Secretaria atualizada com sucesso!");
                  setEditandoSecretaria(null);
                  await loadSecretarias();
                } catch (error) {
                  console.error("Erro ao atualizar:", error);
                  alert("Erro ao atualizar secretaria");
                } finally {
                  setSalvando(false);
                }
              }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nome</label>
                  <input
                    type="text"
                    value={editandoSecretaria.nome}
                    onChange={(e) => setEditandoSecretaria({ ...editandoSecretaria, nome: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={editandoSecretaria.email}
                    onChange={(e) => setEditandoSecretaria({ ...editandoSecretaria, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">CNPJ</label>
                  <input
                    type="text"
                    value={editandoSecretaria.cnpj || ""}
                    onChange={(e) => setEditandoSecretaria({ ...editandoSecretaria, cnpj: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Telefone</label>
                  <input
                    type="tel"
                    value={editandoSecretaria.telefone || ""}
                    onChange={(e) => setEditandoSecretaria({ ...editandoSecretaria, telefone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Descrição</label>
                  <input
                    type="text"
                    value={editandoSecretaria.descricao || ""}
                    onChange={(e) => setEditandoSecretaria({ ...editandoSecretaria, descricao: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={salvando}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                  >
                    {salvando ? "Salvando..." : "Salvar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoSecretaria(null)}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-medium py-2 px-4 rounded-lg transition"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Lista de Secretarias */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">📂 Secretarias</h2>

              {/* Campo de Busca */}
              <input
                type="text"
                placeholder="🔍 Buscar secretaria..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4 text-sm"
              />

              <div className="space-y-2">
                {secretarias.length === 0 ? (
                  <p className="text-gray-500 text-sm">Nenhuma secretaria cadastrada</p>
                ) : (
                  secretarias
                    .filter((secretaria) =>
                      secretaria.nome.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((secretaria) => (
                    <button
                      key={secretaria.id}
                      onClick={() => handleSelectSecretaria(secretaria)}
                      className={`w-full text-left p-3 rounded-lg transition ${
                        selectedSecretaria?.id === secretaria.id
                          ? "bg-orange-50 border-2 border-orange-600"
                          : "bg-gray-100 hover:bg-gray-200 border-2 border-transparent"
                      }`}
                    >
                      <p className="font-medium text-gray-900">{secretaria.nome}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Detalhes da Secretaria */}
          <div className="lg:col-span-4">
            {selectedSecretaria ? (
              <div className="space-y-6">
                {/* Informações da Secretaria */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-gray-900">
                      {selectedSecretaria.nome}
                    </h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditandoSecretaria(selectedSecretaria)}
                        className="text-blue-600 hover:text-blue-700 font-medium text-sm px-3 py-2 bg-blue-50 rounded-lg transition"
                      >
                        ✏️ Editar
                      </button>
                      {(isAdmin || prefeituraSession?.role === "admin") && (
                        <>
                          {secretariosResponsaveis[selectedSecretaria.id] ? (
                            <button
                              onClick={handleRemoverSecretario}
                              disabled={salvandoSecretario}
                              className="text-red-600 hover:text-red-700 font-medium text-sm px-3 py-2 bg-red-50 rounded-lg transition disabled:opacity-50"
                            >
                              🗑️ Remover secretário
                            </button>
                          ) : (
                            <button
                              onClick={handleAbrirFormularioSecretario}
                              className="text-blue-600 hover:text-blue-700 font-medium text-sm px-3 py-2 bg-blue-50 rounded-lg transition"
                            >
                              ➕ Adicionar secretário
                            </button>
                          )}
                          {viceSecretariosResponsaveis[selectedSecretaria.id] ? (
                            <button
                              onClick={handleRemoverViceSecretario}
                              disabled={salvandoViceSecretario}
                              className="text-red-600 hover:text-red-700 font-medium text-sm px-3 py-2 bg-red-50 rounded-lg transition disabled:opacity-50"
                            >
                              🗑️ Remover vice
                            </button>
                          ) : (
                            <button
                              onClick={handleAbrirFormularioViceSecretario}
                              className="text-blue-600 hover:text-blue-700 font-medium text-sm px-3 py-2 bg-blue-50 rounded-lg transition"
                            >
                              ➕ Adicionar vice
                            </button>
                          )}
                          <button
                            onClick={() => handleCompartilhar(selectedSecretaria)}
                            className="text-green-600 hover:text-green-700 font-medium text-sm px-3 py-2 bg-green-50 rounded-lg transition flex items-center gap-1"
                            title="Compartilhar link da secretaria"
                          >
                            <Share2 size={16} />
                            Compartilhar
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {secretariosResponsaveis[selectedSecretaria.id] && (
                    <div className="mb-4 pb-2 border-b border-gray-200">
                      <p className="text-sm text-orange-600 font-semibold">
                        👤 {secretariosResponsaveis[selectedSecretaria.id]}
                      </p>
                    </div>
                  )}

                  {viceSecretariosResponsaveis[selectedSecretaria.id] && (
                    <div className="mb-4 pb-4 border-b border-gray-200">
                      <p className="text-sm text-amber-600 font-semibold">
                        👥 Vice: {viceSecretariosResponsaveis[selectedSecretaria.id]}
                      </p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Email</p>
                      <p className="text-gray-900">{selectedSecretaria.email}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Telefone</p>
                      <p className="text-gray-900">{selectedSecretaria.telefone}</p>
                    </div>
                    {selectedSecretaria.descricao && (
                      <div>
                        <p className="text-sm font-medium text-gray-600">Descrição</p>
                        <p className="text-gray-900">{selectedSecretaria.descricao}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Dashboard de Análise */}
                <div className="grid gap-6 auto-rows-max" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))' }}>
                  {/* Orçamento */}
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-sm p-6 border border-blue-200">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-blue-600">Orçamento Anual</p>
                        <p className="text-3xl font-bold text-blue-900 mt-2">R$ 450.000</p>
                        <p className="text-xs text-blue-700 mt-2">2024</p>
                      </div>
                      <div className="text-4xl">💰</div>
                    </div>
                  </div>

                  {/* Gastos */}
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl shadow-sm p-6 border border-orange-200">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-orange-600">Gasto Acumulado</p>
                        <p className="text-3xl font-bold text-orange-900 mt-2">R$ 287.500</p>
                        <p className="text-xs text-orange-700 mt-2">64% do orçamento</p>
                      </div>
                      <div className="text-4xl">📊</div>
                    </div>
                    <div className="w-full bg-orange-200 rounded-full h-2">
                      <div className="bg-orange-600 h-2 rounded-full" style={{ width: "64%" }}></div>
                    </div>
                  </div>

                  {/* Funcionários */}
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl shadow-sm p-6 border border-purple-200">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-purple-600">Total de Funcionários</p>
                        <p className="text-3xl font-bold text-purple-900 mt-2">{funcionarios.length > 0 ? funcionarios.length : "0"}</p>
                        <p className="text-xs text-purple-700 mt-2">Ativos</p>
                      </div>
                      <div className="text-4xl">👥</div>
                    </div>
                  </div>

                  {/* Notas Fiscais */}
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-sm p-6 border border-green-200">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-green-600">Notas Fiscais</p>
                        <p className="text-3xl font-bold text-green-900 mt-2">{notasFiscais.length > 0 ? notasFiscais.length : "0"}</p>
                        <p className="text-xs text-green-700 mt-2">Este mês</p>
                      </div>
                      <div className="text-4xl">📄</div>
                    </div>
                  </div>

                  {/* Meta de Eficiência */}
                  <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl shadow-sm p-6 border border-red-200">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-red-600">Meta de Eficiência</p>
                        <p className="text-3xl font-bold text-red-900 mt-2">85%</p>
                        <p className="text-xs text-red-700 mt-2">Atingido: 78%</p>
                      </div>
                      <div className="text-4xl">🎯</div>
                    </div>
                    <div className="w-full bg-red-200 rounded-full h-2">
                      <div className="bg-red-600 h-2 rounded-full" style={{ width: "78%" }}></div>
                    </div>
                  </div>

                  {/* Conformidade */}
                  <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl shadow-sm p-6 border border-teal-200">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-teal-600">Conformidade</p>
                        <p className="text-3xl font-bold text-teal-900 mt-2">92%</p>
                        <p className="text-xs text-teal-700 mt-2">Documentação OK</p>
                      </div>
                      <div className="text-4xl">✅</div>
                    </div>
                  </div>
                </div>

                {/* Modal Adicionar Secretário */}
                {mostrarFormularioSecretario && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8">
                      <h2 className="text-2xl font-bold text-gray-900 mb-6">
                        ➕ Adicionar usuário
                      </h2>

                      <form onSubmit={handleSubmitSecretario} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Funcionário *
                          </label>
                          <select
                            name="funcionario_id"
                            value={formSecretario.funcionario_id}
                            onChange={handleChangeSecretario}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          >
                            <option value="">Selecione um funcionário</option>
                            {funcionariosSemSecretaria
                              .filter(
                                (func) =>
                                  !func.cargo.toLowerCase().includes("prefeito") &&
                                  !func.cargo.toLowerCase().includes("vice")
                              )
                              .map((func) => (
                                <option key={func.id} value={func.id}>
                                  {func.nome} - {func.cargo}
                                </option>
                              ))}
                          </select>
                          {funcionariosSemSecretaria.filter(
                            (func) =>
                              !func.cargo.toLowerCase().includes("prefeito") &&
                              !func.cargo.toLowerCase().includes("vice")
                          ).length === 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              Nenhum funcionário disponível sem secretaria
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Cargo *
                          </label>
                          <div className="flex gap-2">
                            <select
                              name="cargo_id"
                              value={formSecretario.cargo_id}
                              onChange={handleChangeSecretario}
                              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              required
                            >
                              <option value="">Selecione um cargo</option>
                              {cargos
                                .filter(
                                  (cargo) =>
                                    !cargo.nome.toLowerCase().includes("prefeito") &&
                                    !cargo.nome.toLowerCase().includes("vice")
                                )
                                .map((cargo) => (
                                  <option key={cargo.id} value={cargo.id}>
                                    {cargo.nome}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setMostrarNovoCargoModal(true)}
                              className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition font-medium"
                              title="Criar novo cargo"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                          <button
                            type="submit"
                            disabled={salvandoSecretario}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                          >
                            {salvandoSecretario ? "Salvando..." : "Salvar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMostrarFormularioSecretario(false);
                              setFormSecretario({ funcionario_id: "", cargo_id: "" });
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

                {/* Modal Adicionar Vice-Secretário */}
                {mostrarFormularioViceSecretario && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8">
                      <h2 className="text-2xl font-bold text-gray-900 mb-6">
                        ➕ Adicionar Vice-Secretário
                      </h2>

                      <form onSubmit={handleSubmitViceSecretario} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Funcionário *
                          </label>
                          <select
                            name="funcionario_id"
                            value={formViceSecretario.funcionario_id}
                            onChange={handleChangeViceSecretario}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          >
                            <option value="">Selecione um funcionário</option>
                            {funcionariosSemSecretaria
                              .filter(
                                (func) => {
                                  const cargoLower = func.cargo.toLowerCase();
                                  return (
                                    !cargoLower.includes("prefeito") &&
                                    (cargoLower.includes("usuario comum") ||
                                     cargoLower.includes("vice secretário") ||
                                     cargoLower.includes("vice secretario"))
                                  );
                                }
                              )
                              .map((func) => (
                                <option key={func.id} value={func.id}>
                                  {func.nome} - {func.cargo}
                                </option>
                              ))}
                          </select>
                          {funcionariosSemSecretaria.filter(
                            (func) => {
                              const cargoLower = func.cargo.toLowerCase();
                              return (
                                !cargoLower.includes("prefeito") &&
                                (cargoLower.includes("usuario comum") ||
                                 cargoLower.includes("vice secretário") ||
                                 cargoLower.includes("vice secretario"))
                              );
                            }
                          ).length === 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              Nenhum funcionário disponível sem secretaria
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Cargo *
                          </label>
                          <div className="flex gap-2">
                            <select
                              name="cargo_id"
                              value={formViceSecretario.cargo_id}
                              onChange={handleChangeViceSecretario}
                              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              required
                            >
                              <option value="">Selecione um cargo</option>
                              {cargos
                                .filter(
                                  (cargo) => {
                                    const cargoLower = cargo.nome.toLowerCase();
                                    return (
                                      !cargoLower.includes("prefeito") &&
                                      (cargoLower.includes("usuario comum") ||
                                       cargoLower.includes("vice secretário") ||
                                       cargoLower.includes("vice secretario"))
                                    );
                                  }
                                )
                                .map((cargo) => (
                                  <option key={cargo.id} value={cargo.id}>
                                    {cargo.nome}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setMostrarNovoCargoModal(true)}
                              className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition font-medium"
                              title="Criar novo cargo"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                          <button
                            type="submit"
                            disabled={salvandoViceSecretario}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                          >
                            {salvandoViceSecretario ? "Salvando..." : "Salvar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMostrarFormularioViceSecretario(false);
                              setFormViceSecretario({ funcionario_id: "", cargo_id: "" });
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

                {/* Modal Criar Novo Cargo */}
                {mostrarNovoCargoModal && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8">
                      <h2 className="text-2xl font-bold text-gray-900 mb-6">
                        ➕ Criar Novo Cargo
                      </h2>

                      <form onSubmit={handleCriarNovoCargoSubmit} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Nome do Cargo *
                          </label>
                          <input
                            type="text"
                            value={novoCargoNome}
                            onChange={(e) => setNovoCargoNome(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                            placeholder="Ex: Diretor, Coordenador, etc"
                            required
                          />
                        </div>

                        <div className="flex gap-3 pt-4">
                          <button
                            type="submit"
                            className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition"
                          >
                            Criar Cargo
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMostrarNovoCargoModal(false);
                              setNovoCargoNome("");
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
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm p-12 flex items-center justify-center min-h-96">
                <p className="text-gray-500 text-lg">
                  Selecione uma secretaria para ver os detalhes
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Compartilhamento */}
      {mostrarCompartilharModal && secretariaCompartilhar && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              📤 Compartilhar Secretaria
            </h2>
            <p className="text-gray-600 mb-4">
              Compartilhe este link com o secretário responsável:
            </p>

            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <p className="text-sm text-gray-600 mb-2">
                <strong>Secretaria:</strong> {secretariaCompartilhar.nome}
              </p>
              <input
                type="text"
                readOnly
                value={linkCompartilhado || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-mono text-gray-700"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCopiarLink}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                ✓ Copiar Link
              </button>
              <button
                onClick={() => setMostrarCompartilharModal(false)}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-medium py-2 px-4 rounded-lg transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  async function deletarSecretaria(secretariaId: string) {
    try {
      const { error } = await supabase
        .from("secretarias")
        .delete()
        .eq("id", secretariaId);

      if (error) throw error;
      setSelectedSecretaria(null);
      setFuncionarios([]);
      setNotasFiscais([]);
      await loadSecretarias();
    } catch (error) {
      console.error("Erro ao deletar secretaria:", error);
      alert("Erro ao deletar secretaria");
    }
  }
}

export default function SecretariasPage() {
  return (
    <ProtectedRoute>
      <SecretariasContent />
    </ProtectedRoute>
  );
}
