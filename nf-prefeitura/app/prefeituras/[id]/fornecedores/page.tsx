/* @ts-nocheck */
"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { X, ArrowUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isAuthenticated } from "@/lib/auth";
import { usePrefeituraAuth } from "@/hooks/usePrefeituraAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import TopNavBar from "@/components/TopNavBar";

interface Fornecedor {
  id: string;
  nome: string;
  cnpj_cpf: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  tipo?: string;
  prefeitura_id: string;
}

function FornecedoresContent() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { session: prefeituraSession } = usePrefeituraAuth();

  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [autenticado, setAutenticado] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [deletando, setDeletando] = useState(false);
  const [editando, setEditando] = useState<Fornecedor | null>(null);
  const [contratosAtivos, setContratosAtivos] = useState<{ [key: string]: number }>({});
  const [filtrarApenasAtivos, setFiltrarApenasAtivos] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    razao_social: "",
    cnpj_cpf: "",
    email: "",
    telefone: "",
    endereco: "",
    bairro: "",
    cidade: "",
    estado: "",
    tipo: "PJ",
  });
  const [mostrarFormNovoFornecedor, setMostrarFormNovoFornecedor] = useState(false);
  const [novoFornecedor, setNovoFornecedor] = useState({
    nome: "",
    razao_social: "",
    email: "",
    cnpj_cpf: "",
    telefone: "",
    endereco: "",
    bairro: "",
    cidade: "",
    estado: "",
    tipo: "Pessoa Jurídica",
  });
  const [salvandoFornecedor, setSalvandoFornecedor] = useState(false);

  useEffect(() => {
    const isAdminCheck = isAuthenticated();
    const isPrefeituraUser = prefeituraSession && prefeituraSession.tipo === "admin" && prefeituraSession.prefeitura_id === id;

    if (isAdminCheck || isPrefeituraUser) {
      setIsAdmin(isAdminCheck);
      setAutenticado(true);
      loadFornecedores();
    } else {
      setLoading(false);
    }
  }, [id, prefeituraSession]);

  const loadFornecedores = async () => {
    try {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("*")
        .eq("prefeitura_id", id)
        .order("nome", { ascending: true });

      if (error) throw error;
      setFornecedores(data || []);

      // Carregar contratos ativos
      if (data && data.length > 0) {
        await loadContratosAtivos(data.map((f) => f.id));
      }
    } catch (error) {
      console.error("Erro ao carregar fornecedores:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadContratosAtivos = async (fornecedorIds: string[]) => {
    try {
      const { data, error } = await supabase
        .from("contratos")
        .select("fornecedor_id")
        .in("fornecedor_id", fornecedorIds)
        .eq("prefeitura_id", id)
        .eq("status", "ativo");

      if (error) throw error;

      const contatos: { [key: string]: number } = {};
      (data || []).forEach((c) => {
        if (c.fornecedor_id) {
          contatos[c.fornecedor_id] = (contatos[c.fornecedor_id] || 0) + 1;
        }
      });

      setContratosAtivos(contatos);
    } catch (error) {
      console.error("Erro ao carregar contratos ativos:", error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editando) {
      await handleAtualizarFornecedor(e);
    } else {
      await handleCriarFornecedor(e);
    }
  };

  const handleCriarFornecedor = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome || !formData.cnpj_cpf) {
      alert("Preencha os campos obrigatórios (Nome e CNPJ/CPF)");
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase.from("fornecedores").insert([
        {
          prefeitura_id: id,
          nome: formData.nome,
          cnpj_cpf: formData.cnpj_cpf,
          email: formData.email || null,
          telefone: formData.telefone || null,
          endereco: formData.endereco || null,
          cidade: formData.cidade || null,
          estado: formData.estado || null,
          tipo: formData.tipo,
        },
      ]);

      if (error) throw error;

      alert("Fornecedor cadastrado com sucesso!");
      setFormData({
        nome: "",
        razao_social: "",
        cnpj_cpf: "",
        email: "",
        telefone: "",
        endereco: "",
        bairro: "",
        cidade: "",
        estado: "",
        tipo: "PJ",
      });
      setMostrarFormulario(false);
      await loadFornecedores();
    } catch (error: any) {
      console.error("Erro ao cadastrar fornecedor:", error);
      alert(`Erro: ${error.message}`);
    } finally {
      setSalvando(false);
    }
  };

  const fornecedoresFiltrados = fornecedores
    .filter((f) =>
      f.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.cnpj_cpf.includes(searchTerm)
    )
    .sort((a, b) => {
      if (!filtrarApenasAtivos) {
        // Se filtro não está ativo, retorna ordem normal
        return 0;
      }
      // Se filtro está ativo, ordena com contratos ativos primeiro
      const temContratoA = (contratosAtivos[a.id] || 0) >= 1 ? 1 : 0;
      const temContratoB = (contratosAtivos[b.id] || 0) >= 1 ? 1 : 0;
      return temContratoB - temContratoA;
    });

  const tabs = [
    { id: "todos", label: "Todos" },
    { id: "ativos", label: "Ativos" },
    { id: "recentes", label: "Recentes" },
  ];

  const handleExport = () => {
    console.log("Exportando fornecedores...");
  };

  const toggleSelecionado = (id: string) => {
    const novo = new Set(selecionados);
    if (novo.has(id)) {
      novo.delete(id);
    } else {
      novo.add(id);
    }
    setSelecionados(novo);
  };

  const toggleTodosSelecionados = () => {
    if (selecionados.size === fornecedoresFiltrados.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(fornecedoresFiltrados.map(f => f.id)));
    }
  };

  const handleAbrirEdicao = (fornecedor: Fornecedor) => {
    setEditando(fornecedor);
    setFormData({
      nome: fornecedor.nome || "",
      razao_social: fornecedor.razao_social || "",
      cnpj_cpf: fornecedor.cnpj_cpf,
      email: fornecedor.email || "",
      telefone: fornecedor.telefone || "",
      endereco: fornecedor.endereco || "",
      bairro: fornecedor.bairro || "",
      cidade: fornecedor.cidade || "",
      estado: fornecedor.estado || "",
      tipo: fornecedor.tipo || "PJ",
    });
    setMostrarFormulario(true);
  };

  const handleAtualizarFornecedor = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editando) return;

    if (!formData.nome || !formData.cnpj_cpf) {
      alert("Preencha os campos obrigatórios (Nome e CNPJ/CPF)");
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase
        .from("fornecedores")
        .update({
          nome: formData.nome,
          razao_social: formData.razao_social || null,
          cnpj_cpf: formData.cnpj_cpf,
          email: formData.email || null,
          telefone: formData.telefone || null,
          endereco: formData.endereco || null,
          bairro: formData.bairro || null,
          cidade: formData.cidade || null,
          estado: formData.estado || null,
          tipo: formData.tipo,
        })
        .eq("id", editando.id);

      if (error) throw error;

      alert("Fornecedor atualizado com sucesso!");
      setFormData({
        nome: "",
        razao_social: "",
        cnpj_cpf: "",
        email: "",
        telefone: "",
        endereco: "",
        bairro: "",
        cidade: "",
        estado: "",
        tipo: "PJ",
      });
      setEditando(null);
      setMostrarFormulario(false);
      await loadFornecedores();
    } catch (error: any) {
      console.error("Erro ao atualizar fornecedor:", error);
      alert(`Erro: ${error.message}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleDeletarSelecionados = async () => {
    if (selecionados.size === 0) {
      alert("Selecione pelo menos um fornecedor");
      return;
    }

    if (!confirm(`Tem certeza que deseja deletar ${selecionados.size} fornecedor(es)? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setDeletando(true);
    try {
      const { error } = await supabase
        .from("fornecedores")
        .delete()
        .in("id", Array.from(selecionados));

      if (error) throw error;

      alert(`${selecionados.size} fornecedor(es) deletado(s) com sucesso!`);
      setSelecionados(new Set());
      await loadFornecedores();
    } catch (error: any) {
      console.error("Erro ao deletar:", error);
      alert(`Erro ao deletar: ${error.message}`);
    } finally {
      setDeletando(false);
    }
  };

  const handleBuscaCNPJ = async (cnpj: string) => {
    if (cnpj.length < 14) return;

    try {
      const cnpjLimpo = cnpj.replace(/\D/g, "");
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);

      if (!response.ok) {
        console.warn("CNPJ não encontrado na API");
        return;
      }

      const dados = await response.json();

      setNovoFornecedor((prev) => ({
        ...prev,
        razao_social: dados.nome || prev.razao_social,
        nome: dados.nome_fantasia || dados.nome || prev.nome,
        telefone: dados.telefone || prev.telefone,
        endereco: `${dados.logradouro || ""} ${dados.numero || ""}`.trim() || prev.endereco,
        cidade: dados.municipio || prev.cidade,
        estado: dados.uf || prev.estado,
      }));
    } catch (error) {
      console.log("Erro ao buscar CNPJ:", error);
    }
  };

  const handleAdicionarFornecedor = async () => {
    if (!novoFornecedor.nome || !novoFornecedor.cnpj_cpf) {
      alert("Preencha os campos obrigatórios: Nome e CNPJ/CPF");
      return;
    }

    setSalvandoFornecedor(true);
    try {
      const { data, error } = await supabase
        .from("fornecedores")
        .insert([
          {
            prefeitura_id: id,
            nome: novoFornecedor.nome,
            razao_social: novoFornecedor.razao_social || null,
            email: novoFornecedor.email || null,
            cnpj_cpf: novoFornecedor.cnpj_cpf,
            telefone: novoFornecedor.telefone || null,
            endereco: novoFornecedor.endereco || null,
            bairro: novoFornecedor.bairro || null,
            cidade: novoFornecedor.cidade || null,
            estado: novoFornecedor.estado || null,
            tipo: novoFornecedor.tipo || null,
          },
        ])
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        alert("Fornecedor adicionado com sucesso!");
        await loadFornecedores();
        setNovoFornecedor({
          nome: "",
          razao_social: "",
          email: "",
          cnpj_cpf: "",
          telefone: "",
          endereco: "",
          bairro: "",
          cidade: "",
          estado: "",
          tipo: "Pessoa Jurídica",
        });
        setMostrarFormNovoFornecedor(false);
      }
    } catch (error: any) {
      console.error("Erro ao adicionar fornecedor:", error);
      const mensagem = error?.message || error?.error_description || JSON.stringify(error) || "Erro desconhecido";
      alert(`Erro ao adicionar fornecedor: ${mensagem}`);
    } finally {
      setSalvandoFornecedor(false);
    }
  };

  if (!autenticado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Acesso negado</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNavBar
        title="Fornecedores"
        subtitle="Gerencie todos os fornecedores da prefeitura"
        tabs={tabs}
        activeTab="todos"
        onTabChange={() => {}}
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

        {/* Busca e Botões de Ação */}
        <div className="flex items-center justify-between mb-8 gap-4">
          <input
            type="text"
            placeholder="Buscar por nome ou CNPJ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMostrarFormNovoFornecedor(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white border-2 border-orange-600 rounded-lg transition font-medium text-sm"
            >
              <span>➕</span>
              Adicionar Fornecedor
            </button>
            <button
              onClick={() => router.push(`/prefeituras/${id}/importar-fornecedores`)}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white border-2 border-purple-600 rounded-lg transition font-medium text-sm"
            >
              <span>🔒</span>
              Importar Seguro
            </button>
          </div>
        </div>

        {/* Modal de Adicionar Fornecedor */}
        {mostrarFormulario && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-screen overflow-y-auto p-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {editando ? "✏️ Editar Fornecedor" : "➕ Adicionar Fornecedor"}
                </h2>
                <button
                  onClick={() => {
                    setMostrarFormulario(false);
                    setEditando(null);
                    setFormData({
                      nome: "",
                      razao_social: "",
                      cnpj_cpf: "",
                      email: "",
                      telefone: "",
                      endereco: "",
                      bairro: "",
                      cidade: "",
                      estado: "",
                      tipo: "PJ",
                    });
                  }}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Razão Social *
                    </label>
                    <input
                      type="text"
                      name="razao_social"
                      value={formData.razao_social}
                      onChange={handleChange}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Razão social"
                      required
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Nome Fantasia
                    </label>
                    <input
                      type="text"
                      name="nome"
                      value={formData.nome}
                      onChange={handleChange}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Nome fantasia (opcional)"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      CNPJ/CPF *
                    </label>
                    <input
                      type="text"
                      name="cnpj_cpf"
                      value={formData.cnpj_cpf}
                      onChange={handleChange}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="00.000.000/0000-00"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="email@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Telefone
                    </label>
                    <input
                      type="tel"
                      name="telefone"
                      value={formData.telefone}
                      onChange={handleChange}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="(XX) XXXXX-XXXX"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Endereço
                    </label>
                    <input
                      type="text"
                      name="endereco"
                      value={formData.endereco}
                      onChange={handleChange}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Rua, número..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Bairro
                    </label>
                    <input
                      type="text"
                      name="bairro"
                      value={formData.bairro}
                      onChange={handleChange}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Bairro"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Cidade
                    </label>
                    <input
                      type="text"
                      name="cidade"
                      value={formData.cidade}
                      onChange={handleChange}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Cidade"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Estado
                    </label>
                    <input
                      type="text"
                      name="estado"
                      value={formData.estado}
                      onChange={handleChange}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="UF"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Tipo
                    </label>
                    <select
                      name="tipo"
                      value={formData.tipo}
                      onChange={handleChange}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="PJ">Pessoa Jurídica</option>
                      <option value="PF">Pessoa Física</option>
                      <option value="MEI">MEI</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-gray-200 col-span-full">
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarFormulario(false);
                      setFormData({
                        nome: "",
                        razao_social: "",
                        cnpj_cpf: "",
                        email: "",
                        telefone: "",
                        endereco: "",
                        bairro: "",
                        cidade: "",
                        estado: "",
                        tipo: "PJ",
                      });
                    }}
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-gray-700 font-medium hover:bg-gray-50 text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvando}
                    className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:opacity-50 text-xs"
                  >
                    {salvando ? "Salvando..." : editando ? "Atualizar" : "Salvar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Novo Fornecedor Completo */}
        {mostrarFormNovoFornecedor && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  ➕ Adicionar Fornecedor
                </h2>
                <button
                  onClick={() => {
                    setMostrarFormNovoFornecedor(false);
                    setNovoFornecedor({
                      nome: "",
                      razao_social: "",
                      email: "",
                      cnpj_cpf: "",
                      telefone: "",
                      endereco: "",
                      bairro: "",
                      cidade: "",
                      estado: "",
                      tipo: "Pessoa Jurídica",
                    });
                  }}
                  className="text-gray-400 hover:text-gray-600 transition"
                  title="Fechar formulário"
                >
                  <X size={28} />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAdicionarFornecedor();
                }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Razão Social *
                    </label>
                    <input
                      type="text"
                      value={novoFornecedor.razao_social}
                      onChange={(e) =>
                        setNovoFornecedor((prev) => ({ ...prev, razao_social: e.target.value }))
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Razão social da empresa"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nome Fantasia
                    </label>
                    <input
                      type="text"
                      value={novoFornecedor.nome}
                      onChange={(e) =>
                        setNovoFornecedor((prev) => ({ ...prev, nome: e.target.value }))
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Nome fantasia (opcional)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      CNPJ/CPF *
                    </label>
                    <input
                      type="text"
                      value={novoFornecedor.cnpj_cpf}
                      onChange={(e) =>
                        setNovoFornecedor((prev) => ({ ...prev, cnpj_cpf: e.target.value }))
                      }
                      onBlur={(e) => handleBuscaCNPJ(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="00.000.000/0000-00"
                    />
                    <p className="text-xs text-gray-500 mt-1">💡 Ao sair deste campo, os dados serão preenchidos automaticamente</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={novoFornecedor.email}
                      onChange={(e) =>
                        setNovoFornecedor((prev) => ({ ...prev, email: e.target.value }))
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="email@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Telefone
                    </label>
                    <input
                      type="tel"
                      value={novoFornecedor.telefone}
                      onChange={(e) =>
                        setNovoFornecedor((prev) => ({ ...prev, telefone: e.target.value }))
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="(XX) XXXXX-XXXX"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Endereço
                    </label>
                    <input
                      type="text"
                      value={novoFornecedor.endereco}
                      onChange={(e) =>
                        setNovoFornecedor((prev) => ({ ...prev, endereco: e.target.value }))
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Rua, número..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bairro
                    </label>
                    <input
                      type="text"
                      value={novoFornecedor.bairro}
                      onChange={(e) =>
                        setNovoFornecedor((prev) => ({ ...prev, bairro: e.target.value }))
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Bairro"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cidade
                    </label>
                    <input
                      type="text"
                      value={novoFornecedor.cidade}
                      onChange={(e) =>
                        setNovoFornecedor((prev) => ({ ...prev, cidade: e.target.value }))
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Cidade"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Estado
                    </label>
                    <input
                      type="text"
                      value={novoFornecedor.estado}
                      onChange={(e) =>
                        setNovoFornecedor((prev) => ({ ...prev, estado: e.target.value }))
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="UF"
                      maxLength={2}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo
                    </label>
                    <select
                      value={novoFornecedor.tipo}
                      onChange={(e) =>
                        setNovoFornecedor((prev) => ({ ...prev, tipo: e.target.value }))
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="Pessoa Jurídica">Pessoa Jurídica</option>
                      <option value="Pessoa Física">Pessoa Física</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={salvandoFornecedor}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                  >
                    {salvandoFornecedor ? "Adicionando..." : "Adicionar Fornecedor"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarFormNovoFornecedor(false);
                      setNovoFornecedor({
                        nome: "",
                        razao_social: "",
                        email: "",
                        cnpj_cpf: "",
                        telefone: "",
                        endereco: "",
                        bairro: "",
                        cidade: "",
                        estado: "",
                        tipo: "Pessoa Jurídica",
                      });
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

        {/* Tabela de Fornecedores */}
        <div className="bg-white rounded-xl shadow-sm p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              Fornecedores ({fornecedoresFiltrados.length})
            </h2>
            {selecionados.size > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  {selecionados.size} selecionado(s)
                </span>
                <button
                  onClick={handleDeletarSelecionados}
                  disabled={deletando}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm transition disabled:opacity-50"
                >
                  <span>🗑️</span>
                  {deletando ? "Deletando..." : "Deletar Selecionados"}
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <p className="text-gray-600">Carregando...</p>
          ) : fornecedoresFiltrados.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">Nenhum fornecedor cadastrado</p>
              <p className="text-gray-500 mt-2">Clique em "Importar CSV" para adicionar fornecedores</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 w-12">
                      <input
                        type="checkbox"
                        checked={selecionados.size === fornecedoresFiltrados.length && fornecedoresFiltrados.length > 0}
                        onChange={toggleTodosSelecionados}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Nome</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">CNPJ/CPF</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Email</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Telefone</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Cidade</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">
                      <button
                        onClick={() => setFiltrarApenasAtivos(!filtrarApenasAtivos)}
                        className={`flex items-center gap-2 hover:text-orange-600 transition ${
                          filtrarApenasAtivos ? "text-orange-600" : "text-gray-700"
                        }`}
                      >
                        Contrato Ativo
                        <ArrowUp
                          size={18}
                          className={`transition-transform ${filtrarApenasAtivos ? "rotate-0" : "rotate-180 opacity-50"}`}
                        />
                      </button>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {fornecedoresFiltrados.map((fornecedor) => (
                    <tr
                      key={fornecedor.id}
                      onClick={() => router.push(`/prefeituras/${id}/fornecedores/${fornecedor.id}`)}
                      className={`border-b border-gray-100 hover:bg-orange-50 cursor-pointer transition ${selecionados.has(fornecedor.id) ? "bg-blue-50" : ""}`}
                    >
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selecionados.has(fornecedor.id)}
                          onChange={() => toggleSelecionado(fornecedor.id)}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-900">{fornecedor.nome}</td>
                      <td className="py-3 px-4 text-gray-600 text-sm">{fornecedor.cnpj_cpf}</td>
                      <td className="py-3 px-4 text-gray-600 text-sm">{fornecedor.email || "—"}</td>
                      <td className="py-3 px-4 text-gray-600 text-sm">{fornecedor.telefone || "—"}</td>
                      <td className="py-3 px-4 text-gray-600 text-sm">{fornecedor.cidade || "—"}</td>
                      <td className="py-3 px-4 text-sm">
                        {(contratosAtivos[fornecedor.id] || 0) >= 1 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                            ✅ Ativo
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleAbrirEdicao(fornecedor)}
                          className="text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Editar
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
    </div>
  );
}

export default function Fornecedores() {
  return (
    <ProtectedRoute>
      <FornecedoresContent />
    </ProtectedRoute>
  );
}
