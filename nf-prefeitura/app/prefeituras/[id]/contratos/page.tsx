/* @ts-nocheck */
"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { X, ArrowUpDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isAuthenticated } from "@/lib/auth";
import { usePrefeituraAuth } from "@/hooks/usePrefeituraAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import TopNavBar from "@/components/TopNavBar";

interface Contrato {
  id: string;
  numero: string;
  descricao: string;
  valor: number;
  data_inicio: string;
  data_fim: string;
  fornecedor_id?: string;
  status: "ativo" | "concluido" | "cancelado";
  prefeitura_id: string;
  modalidade?: string;
  numero_processo?: string;
  origem?: string;
  objeto?: string;
}

interface Fornecedor {
  id: string;
  nome: string;
  razao_social?: string;
  email: string;
  cnpj_cpf: string;
}

function ContratosContent() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { session: prefeituraSession } = usePrefeituraAuth();

  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [valoresTotaisContratos, setValoresTotaisContratos] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [autenticado, setAutenticado] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editando, setEditando] = useState<Contrato | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [deletando, setDeletando] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFornecedor, setSearchFornecedor] = useState("");
  const [mostrarListaFornecedores, setMostrarListaFornecedores] = useState(false);
  const [ordenarDataFinal, setOrdenarDataFinal] = useState<"asc" | "desc" | null>(null);
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

  const [formData, setFormData] = useState({
    fornecedor_id: "",
    numero: "",
    descricao: "",
    data_inicio: "",
    data_fim: "",
    status: "ativo" as const,
    modalidade: "",
    numero_processo: "",
    origem: "",
  });

  interface ObjetoTemporario {
    id: string;
    descricao: string;
    quantidade: number;
    valor_unitario: number;
  }

  const [objetosTemporarios, setObjetosTemporarios] = useState<ObjetoTemporario[]>([]);
  const [formObjeto, setFormObjeto] = useState({
    descricao: "",
    quantidade: "",
    valor_unitario: "",
  });

  useEffect(() => {
    const isAdminCheck = isAuthenticated();
    const isPrefeituraUser = prefeituraSession && prefeituraSession.tipo === "admin" && prefeituraSession.prefeitura_id === id;

    if (isAdminCheck || isPrefeituraUser) {
      setIsAdmin(isAdminCheck);
      setAutenticado(true);
      loadContratos();
      loadFornecedores();
    } else {
      setLoading(false);
    }
  }, [id, prefeituraSession]);

  const loadContratos = async () => {
    try {
      const { data, error } = await supabase
        .from("contratos")
        .select("*")
        .eq("prefeitura_id", id)
        .order("numero", { ascending: true });

      if (error) throw error;
      setContratos(data || []);

      // Carregar valores totais dos objetos
      if (data && data.length > 0) {
        await loadValoresTotaisContratos(data.map((c) => c.id));
      }
    } catch (error) {
      console.error("Erro ao carregar contratos:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadValoresTotaisContratos = async (contratoIds: string[]) => {
    try {
      const { data, error } = await supabase
        .from("objetos_contratos")
        .select("contrato_id, quantidade, valor_unitario")
        .in("contrato_id", contratoIds);

      if (error) throw error;

      // Calcular totais por contrato
      const totais: { [key: string]: number } = {};
      (data || []).forEach((obj) => {
        totais[obj.contrato_id] = (totais[obj.contrato_id] || 0) + obj.quantidade * obj.valor_unitario;
      });

      setValoresTotaisContratos(totais);
    } catch (error) {
      console.error("Erro ao carregar valores totais:", error);
    }
  };

  const loadFornecedores = async () => {
    try {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("id, nome, razao_social, email, cnpj_cpf")
        .eq("prefeitura_id", id)
        .order("nome", { ascending: true });

      if (error) throw error;
      setFornecedores(data || []);
    } catch (error) {
      console.error("Erro ao carregar fornecedores:", error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAdicionarObjeto = () => {
    if (!formObjeto.descricao || !formObjeto.quantidade || !formObjeto.valor_unitario) {
      alert("Preencha todos os campos do objeto");
      return;
    }

    const quantidade = parseFloat(formObjeto.quantidade);
    const valorUnitario = parseFloat(formObjeto.valor_unitario.replace("R$ ", "").replace(/\./g, "").replace(",", "."));

    const novoObjeto: ObjetoTemporario = {
      id: Date.now().toString(),
      descricao: formObjeto.descricao,
      quantidade,
      valor_unitario: valorUnitario,
    };

    setObjetosTemporarios([...objetosTemporarios, novoObjeto]);
    setFormObjeto({ descricao: "", quantidade: "", valor_unitario: "" });
  };

  const handleRemoverObjeto = (id: string) => {
    setObjetosTemporarios(objetosTemporarios.filter((obj) => obj.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    try {
      if (!formData.numero) {
        alert("⚠️ Preencha o campo: Número do Contrato");
        setSalvando(false);
        return;
      }
      if (!formData.descricao) {
        alert("⚠️ Preencha o campo: Descrição");
        setSalvando(false);
        return;
      }

      // Calcular valor a partir dos objetos
      const valorTotal = objetosTemporarios.reduce((acc, obj) => acc + obj.quantidade * obj.valor_unitario, 0);

      const contratoData = {
        prefeitura_id: id,
        fornecedor_id: formData.fornecedor_id || null,
        numero: formData.numero,
        descricao: formData.descricao,
        valor: valorTotal,
        data_inicio: formData.data_inicio || null,
        data_fim: formData.data_fim || null,
        status: formData.status,
        modalidade: formData.modalidade || null,
        numero_processo: formData.numero_processo || null,
        origem: formData.origem || null,
      };

      if (editando) {
        const { error } = await supabase
          .from("contratos")
          .update(contratoData)
          .eq("id", editando.id);

        if (error) throw error;
        alert("Contrato atualizado com sucesso!");
      } else {
        const { data: novoContrato, error: erroContrato } = await supabase
          .from("contratos")
          .insert([contratoData])
          .select();

        if (erroContrato) throw erroContrato;

        // Salvar objetos se houver
        if (novoContrato && novoContrato[0] && objetosTemporarios.length > 0) {
          const objetosSalvar = objetosTemporarios.map((obj) => ({
            contrato_id: novoContrato[0].id,
            descricao: obj.descricao,
            quantidade: obj.quantidade,
            valor_unitario: obj.valor_unitario,
          }));

          const { error: erroObjetos } = await supabase
            .from("objetos_contratos")
            .insert(objetosSalvar);

          if (erroObjetos) throw erroObjetos;
        }

        alert("Contrato criado com sucesso!");
      }

      setFormData({
        fornecedor_id: "",
        numero: "",
        descricao: "",
        data_inicio: "",
        data_fim: "",
        status: "ativo",
        modalidade: "",
        numero_processo: "",
        origem: "",
      });
      setObjetosTemporarios([]);
      setFormObjeto({ descricao: "", quantidade: "", valor_unitario: "" });
      setEditando(null);
      setMostrarFormulario(false);
      await loadContratos();
    } catch (error: any) {
      console.error("Erro ao salvar contrato:", error);
      alert(`Erro: ${error.message}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleEdit = (contrato: Contrato) => {
    if (editando?.id === contrato.id) {
      setMostrarFormulario(false);
      setEditando(null);
      return;
    }

    setEditando(contrato);
    const valorFormatado = "R$ " + contrato.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setFormData({
      fornecedor_id: contrato.fornecedor_id || "",
      numero: contrato.numero,
      descricao: contrato.descricao,
      valor: valorFormatado,
      data_inicio: contrato.data_inicio || "",
      data_fim: contrato.data_fim || "",
      status: contrato.status,
      modalidade: contrato.modalidade || "",
      numero_processo: contrato.numero_processo || "",
      origem: contrato.origem || "",
    });
    setMostrarFormulario(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja deletar este contrato?")) return;

    setDeletando(id);
    try {
      const { error } = await supabase.from("contratos").delete().eq("id", id);

      if (error) throw error;
      alert("Contrato deletado com sucesso!");
      await loadContratos();
    } catch (error) {
      console.error("Erro:", error);
      alert("Erro ao deletar contrato");
    } finally {
      setDeletando(null);
    }
  };

  const handleCancel = () => {
    setMostrarFormulario(false);
    setEditando(null);
    setFormData({
      fornecedor_id: "",
      numero: "",
      descricao: "",
      data_inicio: "",
      data_fim: "",
      status: "ativo",
      modalidade: "",
      numero_processo: "",
      origem: "",
    });
    setObjetosTemporarios([]);
    setFormObjeto({ descricao: "", quantidade: "", valor_unitario: "" });
  };

  const contratosFiltrados = contratos
    .filter((c) => {
      const fornecedor = fornecedores.find(f => f.id === c.fornecedor_id);
      const searchLower = searchTerm.toLowerCase();

      return (
        c.numero.toLowerCase().includes(searchLower) ||
        c.descricao.toLowerCase().includes(searchLower) ||
        fornecedor?.nome.toLowerCase().includes(searchLower) ||
        fornecedor?.razao_social?.toLowerCase().includes(searchLower) ||
        fornecedor?.cnpj_cpf.includes(searchTerm)
      );
    })
    .sort((a, b) => {
      if (!ordenarDataFinal) return 0;

      const dataA = new Date(a.data_fim).getTime();
      const dataB = new Date(b.data_fim).getTime();

      return ordenarDataFinal === "asc" ? dataA - dataB : dataB - dataA;
    });

  const [fornecedoresFiltrados, setFornecedoresFiltrados] = useState<Fornecedor[]>([]);

  const buscarFornecedores = async (termo: string) => {
    if (!termo.trim()) {
      setFornecedoresFiltrados([]);
      return;
    }

    try {
      const termoLower = termo.toLowerCase();
      const termoSemFormatacao = termo.replace(/\D/g, "");

      const { data, error } = await supabase
        .from("fornecedores")
        .select("id, nome, razao_social, email, cnpj_cpf")
        .eq("prefeitura_id", id)
        .or(
          `nome.ilike.%${termoLower}%,razao_social.ilike.%${termoLower}%,cnpj_cpf.ilike.%${termo}%`
        );

      if (error) throw error;
      setFornecedoresFiltrados(data || []);
    } catch (error) {
      console.error("Erro ao buscar fornecedores:", error);
      setFornecedoresFiltrados([]);
    }
  };

  const getNomeFornecedor = (fornecedor: Fornecedor) => {
    return fornecedor.razao_social || fornecedor.nome;
  };

  const getProgressoContrato = (dataInicio: string, dataFim: string) => {
    const inicio = new Date(dataInicio).getTime();
    const fim = new Date(dataFim).getTime();
    const agora = new Date().getTime();

    const duracao = fim - inicio;
    const decorrido = agora - inicio;
    const restante = fim - agora;

    const porcentagem = Math.max(0, Math.min(100, (decorrido / duracao) * 100));
    const diasRestantes = Math.ceil(restante / (1000 * 60 * 60 * 24));

    let cor = "bg-green-500";
    if (diasRestantes <= 0) {
      cor = "bg-red-700";
    } else if (diasRestantes <= 30) {
      cor = "bg-red-500";
    } else if (diasRestantes <= 90) {
      cor = "bg-orange-500";
    } else if (diasRestantes <= 180) {
      cor = "bg-yellow-500";
    }

    return { porcentagem, diasRestantes, cor };
  };

  const handleSelectFornecedor = (fornecedorId: string) => {
    setFormData((prev) => ({ ...prev, fornecedor_id: fornecedorId }));
    setSearchFornecedor("");
    setMostrarListaFornecedores(false);
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
        handleSelectFornecedor(data[0].id);
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

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNavBar
        title="Contratos"
        subtitle="Gerencie todos os contratos da prefeitura"
        tabs={[]}
        activeTab=""
        onTabChange={() => {}}
        userName={prefeituraSession?.nome || "Usuário"}
        userRole={prefeituraSession?.role || "Acesso"}
      />

      <div className="app-container p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <button
              onClick={() => router.back()}
              className="bg-white text-orange-600 hover:bg-orange-50 hover:text-orange-700 border border-orange-600 shadow-sm hover:shadow-md transition font-medium px-4 py-2 rounded-lg flex items-center gap-2 mb-4"
            >
              <span>←</span>
              Voltar
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Gerenciar Contratos</h1>
            <p className="text-gray-600 mt-2">Gerencie todos os contratos da prefeitura</p>
          </div>
          <button
            onClick={() => {
              setMostrarFormulario(true);
              setEditando(null);
              setFormData({
                fornecedor_id: "",
                numero: "",
                descricao: "",
                data_inicio: "",
                data_fim: "",
                status: "ativo",
                modalidade: "",
                numero_processo: "",
                origem: "",
              });
            }}
            className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 px-6 rounded-lg transition"
          >
            + Novo Contrato
          </button>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Buscar por número ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            📋 Contratos ({contratosFiltrados.length})
          </h2>

          {contratos.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">Nenhum contrato cadastrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Número</th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Fornecedor</th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">CNPJ</th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Nº Processo</th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Valor</th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">
                      <button
                        onClick={() => {
                          if (ordenarDataFinal === "asc") {
                            setOrdenarDataFinal("desc");
                          } else if (ordenarDataFinal === "desc") {
                            setOrdenarDataFinal(null);
                          } else {
                            setOrdenarDataFinal("asc");
                          }
                        }}
                        className="flex items-center gap-2 hover:text-orange-600 transition"
                      >
                        Data Final
                        <ArrowUpDown size={16} />
                      </button>
                    </th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Status</th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {contratosFiltrados.map((contrato) => {
                    const fornecedor = fornecedores.find(f => f.id === contrato.fornecedor_id);
                    return (
                    <tr
                      key={contrato.id}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/prefeituras/${id}/contratos/${contrato.id}`)}
                    >
                      <td className="py-4 px-4 text-gray-900 font-medium text-blue-600 hover:underline">{contrato.numero}</td>
                      <td className="py-4 px-4 text-gray-600 text-sm">{fornecedor?.nome || "-"}</td>
                      <td className="py-4 px-4 text-gray-600 text-sm">{fornecedor?.cnpj_cpf || "-"}</td>
                      <td className="py-4 px-4 text-gray-600 text-sm">{contrato.numero_processo || "-"}</td>
                      <td className="py-4 px-4 text-gray-600 font-medium">R$ {(valoresTotaisContratos[contrato.id] || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-4 px-4">
                        {contrato.data_fim && contrato.data_inicio ? (
                          <div className="flex flex-col gap-2">
                            <div className="text-sm text-gray-600">
                              {new Date(contrato.data_fim).toLocaleDateString("pt-BR")}
                            </div>
                            {(() => {
                              const { porcentagem, diasRestantes, cor } = getProgressoContrato(contrato.data_inicio, contrato.data_fim);
                              return (
                                <div className="flex flex-col gap-1">
                                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                    <div
                                      className={`h-full ${cor} transition-all duration-300`}
                                      style={{ width: `${porcentagem}%` }}
                                    />
                                  </div>
                                  <span className={`text-xs font-medium ${
                                    diasRestantes <= 0 ? "text-red-700" :
                                    diasRestantes <= 30 ? "text-red-500" :
                                    diasRestantes <= 90 ? "text-orange-500" :
                                    diasRestantes <= 180 ? "text-yellow-500" :
                                    "text-green-500"
                                  }`}>
                                    {diasRestantes <= 0 ? "Expirado" : `${diasRestantes} dias`}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          contrato.status === "ativo"
                            ? "bg-green-100 text-green-800"
                            : contrato.status === "concluido"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {contrato.status}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleEdit(contrato)}
                            className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                          >
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal de Formulário */}
        {mostrarFormulario && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  ✏️ {editando ? "Editar" : "Novo"} Contrato
                </h2>
                <button
                  onClick={handleCancel}
                  className="text-gray-400 hover:text-gray-600 transition"
                  title="Fechar formulário"
                >
                  <X size={28} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fornecedor *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Buscar por nome (ex: Wada) ou CNPJ (ex: 39011027929139 ou 39.011.027/9291-39)..."
                      value={searchFornecedor}
                      onChange={(e) => {
                        const valor = e.target.value;
                        setSearchFornecedor(valor);
                        setMostrarListaFornecedores(true);
                        setFormData((prev) => ({ ...prev, fornecedor_id: "" }));
                        buscarFornecedores(valor);
                      }}
                      onFocus={() => {
                        setMostrarListaFornecedores(true);
                        setFormData((prev) => ({ ...prev, fornecedor_id: "" }));
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 pr-10"
                    />
                    {formData.fornecedor_id && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, fornecedor_id: "" }));
                          setSearchFornecedor("");
                          setMostrarListaFornecedores(false);
                        }}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        title="Limpar seleção"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {mostrarListaFornecedores && searchFornecedor.trim() && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                      {fornecedoresFiltrados.length > 0 ? (
                        fornecedoresFiltrados.map((fornecedor) => (
                          <button
                            key={fornecedor.id}
                            type="button"
                            onClick={() => handleSelectFornecedor(fornecedor.id)}
                            className="w-full text-left px-4 py-3 hover:bg-orange-50 border-b border-gray-100 last:border-b-0 transition"
                          >
                            <div className="font-medium text-gray-900">{getNomeFornecedor(fornecedor)}</div>
                            <div className="text-sm text-gray-500">{fornecedor.cnpj_cpf}</div>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-6 text-center">
                          <p className="text-red-600 font-medium">❌ Nenhum fornecedor encontrado</p>
                          <p className="text-xs text-gray-500 mt-1">Buscando por: "{searchFornecedor}"</p>
                          <button
                            type="button"
                            onClick={() => setMostrarFormNovoFornecedor(true)}
                            className="mt-3 text-blue-600 hover:text-blue-700 font-medium text-sm"
                          >
                            + Adicionar novo fornecedor
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {formData.fornecedor_id && (
                    <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-800">
                        ✓ Fornecedor selecionado: <span className="font-medium">{fornecedores.find(f => f.id === formData.fornecedor_id)?.nome}</span>
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Número do Contrato *
                        </label>
                        <input
                          type="text"
                          name="numero"
                          value={formData.numero}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="Ex: 2024-001"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Valor Total (R$) - Calculado automaticamente
                        </label>
                        <input
                          type="text"
                          disabled
                          value={
                            objetosTemporarios.length > 0
                              ? "R$ " + objetosTemporarios
                                  .reduce((acc, obj) => acc + obj.quantidade * obj.valor_unitario, 0)
                                  .toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : "R$ 0,00"
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed focus:outline-none"
                          placeholder="Será calculado a partir dos objetos"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Data Início
                        </label>
                        <input
                          type="date"
                          name="data_inicio"
                          value={formData.data_inicio}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Data Fim
                        </label>
                        <input
                          type="date"
                          name="data_fim"
                          value={formData.data_fim}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Status
                        </label>
                        <select
                          name="status"
                          value={formData.status}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          <option value="ativo">Ativo</option>
                          <option value="concluido">Concluído</option>
                          <option value="cancelado">Cancelado</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Modalidade
                        </label>
                        <select
                          name="modalidade"
                          value={formData.modalidade}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          <option value="">Selecione uma modalidade</option>
                          <option value="dispensa-sem-disputa">Dispensa sem Disputa</option>
                          <option value="convite">Convite</option>
                          <option value="tomada-preco">Tomada de Preço</option>
                          <option value="concorrencia">Concorrência</option>
                          <option value="pregao">Pregão</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Nº Processo
                        </label>
                        <input
                          type="text"
                          name="numero_processo"
                          value={formData.numero_processo}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="Ex: 029/2026"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Origem
                        </label>
                        <input
                          type="text"
                          name="origem"
                          value={formData.origem}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="Ex: Contrato nº 060/2026"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Descrição *
                      </label>
                      <textarea
                        name="descricao"
                        value={formData.descricao}
                        onChange={handleChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="Descrição do contrato"
                        rows={4}
                      />
                    </div>

                    {/* Seção de Objetos */}
                    <div className="border-t border-gray-200 pt-6 mt-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">📦 Adicionar Objetos ao Contrato</h3>

                      <div className="space-y-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Descrição do Objeto
                          </label>
                          <textarea
                            value={formObjeto.descricao}
                            onChange={(e) => setFormObjeto((prev) => ({ ...prev, descricao: e.target.value }))}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                            placeholder="Descrição do objeto"
                            rows={2}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Quantidade
                            </label>
                            <input
                              type="number"
                              value={formObjeto.quantidade}
                              onChange={(e) => setFormObjeto((prev) => ({ ...prev, quantidade: e.target.value }))}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                              placeholder="0"
                              step="0.01"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Valor Unitário
                            </label>
                            <input
                              type="text"
                              value={formObjeto.valor_unitario}
                              onChange={(e) => {
                                const entrada = e.target.value;
                                const apenasNumeros = entrada.replace(/\D/g, "");
                                if (!apenasNumeros) {
                                  setFormObjeto((prev) => ({ ...prev, valor_unitario: "" }));
                                  return;
                                }
                                const valorPadronizado = apenasNumeros.padStart(3, "0");
                                const inteira = valorPadronizado.slice(0, -2) || "0";
                                const centavos = valorPadronizado.slice(-2);
                                const numero = parseFloat(`${inteira}.${centavos}`);
                                const formatado = "R$ " + numero.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                setFormObjeto((prev) => ({ ...prev, valor_unitario: formatado }));
                              }}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                              placeholder="R$ 0,00"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleAdicionarObjeto}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition"
                        >
                          + Adicionar Objeto
                        </button>
                      </div>

                      {/* Lista de Objetos Adicionados */}
                      {objetosTemporarios.length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="font-semibold text-gray-900 mb-3">Objetos Adicionados ({objetosTemporarios.length})</h4>
                          <div className="space-y-2">
                            {objetosTemporarios.map((obj) => (
                              <div key={obj.id} className="flex justify-between items-center bg-white p-3 rounded border border-gray-200">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{obj.descricao}</p>
                                  <p className="text-xs text-gray-500">
                                    Qtd: {obj.quantidade} × R$ {obj.valor_unitario.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} =
                                    R$ {(obj.quantidade * obj.valor_unitario).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoverObjeto(obj.id)}
                                  className="text-red-600 hover:text-red-700 text-sm font-medium"
                                >
                                  Remover
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    disabled={salvando}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                  >
                    {salvando ? "Salvando..." : "Salvar Contrato"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-medium py-2 px-4 rounded-lg transition"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Novo Fornecedor */}
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
      </div>
    </div>
  );
}

export default function ContratosPage() {
  return (
    <ProtectedRoute>
      <ContratosContent />
    </ProtectedRoute>
  );
}
