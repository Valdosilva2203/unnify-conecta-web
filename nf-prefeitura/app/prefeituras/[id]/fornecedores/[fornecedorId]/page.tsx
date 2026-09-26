"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Edit2, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePrefeituraAuth } from "@/hooks/usePrefeituraAuth";
import TopNavBar from "@/components/TopNavBar";

interface Fornecedor {
  id: string;
  nome: string;
  razao_social?: string;
  cnpj_cpf: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  tipo?: string;
  prefeitura_id: string;
  especialidades?: string[];
}

interface Contrato {
  id: string;
  numero: string;
  descricao: string;
  valor: number;
  data_inicio: string;
  data_fim: string;
  status: "ativo" | "concluido" | "cancelado";
}

interface ObjetoTemporario {
  id: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
}

interface Chamado {
  id: string;
  status: string;
  fornecedor_id: string;
}

export default function DetalhesFornecedorPage() {
  const router = useRouter();
  const params = useParams();
  const prefeituraId = params.id as string;
  const fornecedorId = params.fornecedorId as string;
  const { session: prefeituraSession } = usePrefeituraAuth();

  const [fornecedor, setFornecedor] = useState<Fornecedor | null>(null);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratosAtivos, setContratosAtivos] = useState(0);
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarFormEditar, setMostrarFormEditar] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [deletando, setDeletando] = useState<string | null>(null);

  const [formEdicao, setFormEdicao] = useState({
    nome: "",
    razao_social: "",
    cnpj_cpf: "",
    email: "",
    telefone: "",
    endereco: "",
    bairro: "",
    cidade: "",
    estado: "",
    tipo: "",
    especialidades: [] as string[],
  });
  const [novaEspecialidadeFormEdicao, setNovaEspecialidadeFormEdicao] = useState("");

  const [formData, setFormData] = useState({
    numero: "",
    descricao: "",
    data_inicio: "",
    data_fim: "",
    status: "ativo" as const,
    modalidade: "",
    numero_processo: "",
    origem: "",
  });

  const [objetosTemporarios, setObjetosTemporarios] = useState<ObjetoTemporario[]>([]);
  const [formObjeto, setFormObjeto] = useState({
    descricao: "",
    quantidade: "",
    valor_unitario: "",
  });

  useEffect(() => {
    loadFornecedor();
  }, [fornecedorId]);

  const loadFornecedor = async () => {
    try {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("*")
        .eq("id", fornecedorId)
        .eq("prefeitura_id", prefeituraId)
        .single();

      if (error) throw error;
      setFornecedor(data);

      // Carrega contratos
      await loadContratos();

      // Carrega chamados
      await loadChamados();
    } catch (error) {
      console.error("Erro ao carregar fornecedor:", error);
      setErro("Fornecedor não encontrado");
    } finally {
      setLoading(false);
    }
  };

  const loadChamados = async () => {
    try {
      const { data, error } = await supabase
        .from("chamados")
        .select("id, status, fornecedor_id")
        .eq("fornecedor_id", fornecedorId)
        .eq("prefeitura_id", prefeituraId);

      if (error) throw error;
      setChamados(data || []);
    } catch (error) {
      console.error("Erro ao carregar chamados:", error);
    }
  };

  const loadContratos = async () => {
    try {
      const { data, error } = await supabase
        .from("contratos")
        .select("*")
        .eq("fornecedor_id", fornecedorId)
        .eq("prefeitura_id", prefeituraId)
        .order("numero", { ascending: true });

      if (error) throw error;

      setContratos(data || []);
      setContratosAtivos((data || []).filter((c) => c.status === "ativo").length);
    } catch (error) {
      console.error("Erro ao carregar contratos:", error);
    }
  };

  const handleAdicionarEspecialidadeEdicao = () => {
    if (novaEspecialidadeFormEdicao.trim() && formEdicao.especialidades.length < 4) {
      setFormEdicao(prev => ({
        ...prev,
        especialidades: [...prev.especialidades, novaEspecialidadeFormEdicao.trim()]
      }));
      setNovaEspecialidadeFormEdicao("");
    }
  };

  const handleRemoverEspecialidadeEdicao = (index: number) => {
    setFormEdicao(prev => ({
      ...prev,
      especialidades: prev.especialidades.filter((_, i) => i !== index)
    }));
  };

  const handleAbrirEdicao = () => {
    if (fornecedor) {
      setFormEdicao({
        nome: fornecedor.nome || "",
        razao_social: fornecedor.razao_social || "",
        cnpj_cpf: fornecedor.cnpj_cpf,
        email: fornecedor.email || "",
        telefone: fornecedor.telefone || "",
        endereco: fornecedor.endereco || "",
        bairro: fornecedor.bairro || "",
        cidade: fornecedor.cidade || "",
        estado: fornecedor.estado || "",
        tipo: fornecedor.tipo || "",
        especialidades: fornecedor.especialidades || [],
      });
      setNovaEspecialidadeFormEdicao("");
      setMostrarFormEditar(true);
    }
  };

  const handleSalvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    try {
      const { error } = await supabase
        .from("fornecedores")
        .update({
          nome: formEdicao.nome,
          razao_social: formEdicao.razao_social || null,
          cnpj_cpf: formEdicao.cnpj_cpf,
          email: formEdicao.email || null,
          telefone: formEdicao.telefone || null,
          endereco: formEdicao.endereco || null,
          bairro: formEdicao.bairro || null,
          cidade: formEdicao.cidade || null,
          estado: formEdicao.estado || null,
          tipo: formEdicao.tipo || null,
          especialidades: formEdicao.especialidades.length > 0 ? formEdicao.especialidades : null,
        })
        .eq("id", fornecedorId);

      if (error) throw error;

      alert("Fornecedor atualizado com sucesso!");
      setMostrarFormEditar(false);
      await loadFornecedor();
    } catch (error: any) {
      alert(`Erro ao atualizar: ${error?.message || "Erro desconhecido"}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleDeletar = async () => {
    if (!confirm("Tem certeza que deseja deletar este fornecedor?")) return;

    try {
      const { error } = await supabase
        .from("fornecedores")
        .delete()
        .eq("id", fornecedorId);

      if (error) throw error;
      alert("Fornecedor deletado com sucesso!");
      router.push(`/prefeituras/${prefeituraId}/fornecedores`);
    } catch (error: any) {
      alert(`Erro ao deletar: ${error?.message || "Erro desconhecido"}`);
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

    const novoObjeto: ObjetoTemporario = {
      id: Math.random().toString(),
      descricao: formObjeto.descricao,
      quantidade: parseFloat(formObjeto.quantidade),
      valor_unitario: parseFloat(formObjeto.valor_unitario.replace("R$ ", "").replace(/\./g, "").replace(",", ".")),
    };

    setObjetosTemporarios([...objetosTemporarios, novoObjeto]);
    setFormObjeto({ descricao: "", quantidade: "", valor_unitario: "" });
  };

  const handleRemoverObjeto = (id: string) => {
    setObjetosTemporarios(objetosTemporarios.filter((obj) => obj.id !== id));
  };

  const handleCancel = () => {
    setMostrarFormulario(false);
    setFormData({
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.numero || !formData.descricao) {
      alert("Preencha os campos obrigatórios: Número e Descrição");
      return;
    }

    setSalvando(true);
    try {
      const valorTotal = objetosTemporarios.reduce((acc, obj) => acc + obj.quantidade * obj.valor_unitario, 0);

      const dadosContrato = {
        prefeitura_id: prefeituraId,
        fornecedor_id: fornecedorId,
        numero: formData.numero,
        descricao: formData.descricao,
        valor: valorTotal,
        data_inicio: formData.data_inicio || null,
        data_fim: formData.data_fim || null,
        numero_processo: formData.numero_processo || null,
        origem: formData.origem || null,
        modalidade: formData.modalidade || null,
        status: formData.status,
      };

      console.log("Dados sendo enviados:", dadosContrato);

      const { data: contratoData, error: erroContrato } = await supabase
        .from("contratos")
        .insert([dadosContrato])
        .select();

      console.log("Resposta do Supabase - dados:", contratoData);
      console.log("Resposta do Supabase - erro:", erroContrato);

      if (erroContrato) {
        console.error("Erro completo:", JSON.stringify(erroContrato, null, 2));
        throw new Error(erroContrato?.message || JSON.stringify(erroContrato) || "Erro desconhecido ao inserir contrato");
      }

      if (!contratoData || contratoData.length === 0) {
        throw new Error("Nenhum dado foi retornado após inserir o contrato");
      }

      const contratoId = contratoData[0].id;

      if (objetosTemporarios.length > 0 && contratoId) {
        const objetosParaInserir = objetosTemporarios.map((obj) => ({
          contrato_id: contratoId,
          descricao: obj.descricao,
          quantidade: obj.quantidade,
          valor_unitario: obj.valor_unitario,
        }));

        const { error: erroObjetos } = await supabase
          .from("objetos_contratos")
          .insert(objetosParaInserir);

        if (erroObjetos) {
          console.error("Erro detalhado dos objetos:", erroObjetos);
          throw new Error(erroObjetos?.message || "Erro ao inserir objetos do contrato");
        }
      }

      alert("Contrato criado com sucesso!");
      handleCancel();
      await loadContratos();
    } catch (error: any) {
      console.error("Erro ao criar contrato:", error);
      alert(`Erro: ${error?.message || "Erro desconhecido"}`);
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Carregando...</p>
      </div>
    );
  }

  if (erro || !fornecedor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">⚠️ Erro</h1>
          <p className="text-gray-600 mb-6">{erro || "Fornecedor não encontrado"}</p>
          <button
            onClick={() => router.back()}
            className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-6 rounded-lg transition"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNavBar
        title={`Fornecedor: ${fornecedor.nome}`}
        subtitle={fornecedor.razao_social || "Detalhes do fornecedor"}
        tabs={[]}
        activeTab=""
        onTabChange={() => {}}
        userName={prefeituraSession?.nome || "Usuário"}
        userRole={prefeituraSession?.role || prefeituraSession?.cargo || "Usuário"}
      />

      <div className="max-w-6xl mx-auto p-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-orange-600 hover:text-orange-700 font-medium mb-6"
        >
          <ArrowLeft size={20} />
          Voltar
        </button>

        <div className="bg-white rounded-lg shadow p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">📋 Informações do Fornecedor</h2>
            <div className="flex gap-3">
              <button
                onClick={handleAbrirEdicao}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                <Edit2 size={18} />
                Editar
              </button>
              <button
                onClick={handleDeletar}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                <Trash2 size={18} />
                Deletar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Nome Fantasia</p>
              <p className="text-gray-900 text-lg">{fornecedor.nome || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Razão Social</p>
              <p className="text-gray-900 text-lg">{fornecedor.razao_social || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">CNPJ/CPF</p>
              <p className="text-gray-900 text-lg font-mono">{fornecedor.cnpj_cpf}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Email</p>
              <p className="text-gray-900">{fornecedor.email || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Telefone</p>
              <p className="text-gray-900">{fornecedor.telefone || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Tipo</p>
              <p className="text-gray-900">{fornecedor.tipo || "—"}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm font-semibold text-gray-700 mb-2">Endereço</p>
              <p className="text-gray-900">
                {fornecedor.endereco && fornecedor.bairro && fornecedor.cidade && fornecedor.estado
                  ? `${fornecedor.endereco}, ${fornecedor.bairro}, ${fornecedor.cidade} - ${fornecedor.estado}`
                  : fornecedor.endereco || "—"}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm font-semibold text-gray-700 mb-2">🎯 Especialidades</p>
              {fornecedor.especialidades && fornecedor.especialidades.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {fornecedor.especialidades.map((esp, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                    >
                      {esp}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">Nenhuma especialidade cadastrada</p>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">📞 Chamados em Aberto</p>
              <p className="text-gray-900 text-lg font-bold">
                {chamados.filter(c => c.status === "pendente").length} aberto{chamados.filter(c => c.status === "pendente").length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">📋 Contratos Ativos ({contratosAtivos})</h2>
            <button
              onClick={() => setMostrarFormulario(true)}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition"
            >
              ➕ Adicionar Contrato
            </button>
          </div>

          {contratos.filter((c) => c.status === "ativo").length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Número</th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Descrição</th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Valor</th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Data Fim</th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Status</th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {contratos
                    .filter((c) => c.status === "ativo")
                    .map((contrato) => {
                      const dataFim = new Date(contrato.data_fim).getTime();
                      const agora = new Date().getTime();
                      const diasRestantes = Math.ceil((dataFim - agora) / (1000 * 60 * 60 * 24));

                      let corProgresso = "bg-green-500";
                      if (diasRestantes <= 30) {
                        corProgresso = "bg-red-500";
                      } else if (diasRestantes <= 60) {
                        corProgresso = "bg-orange-500";
                      } else if (diasRestantes < 100) {
                        corProgresso = "bg-yellow-500";
                      }

                      return (
                        <tr key={contrato.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-4 px-4 font-semibold text-gray-900">{contrato.numero}</td>
                          <td className="py-4 px-4 text-gray-600 text-sm">{contrato.descricao}</td>
                          <td className="py-4 px-4 font-medium text-gray-900">
                            R$ {contrato.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex flex-col gap-2">
                              <span className="text-gray-900 font-medium text-sm">
                                {new Date(contrato.data_fim).toLocaleDateString("pt-BR")}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="w-20 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-full ${corProgresso} transition-all`}
                                    style={{ width: `${Math.min(100, Math.max(0, 100 - (diasRestantes / 365) * 100))}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-medium ${
                                  diasRestantes <= 30 ? "text-red-600" : diasRestantes <= 60 ? "text-orange-600" : "text-green-600"
                                }`}>
                                  {diasRestantes > 0 ? `${diasRestantes} dias` : "Expirado"}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                              {contrato.status}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <button
                              onClick={() => router.push(`/prefeituras/${prefeituraId}/contratos/${contrato.id}`)}
                              className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                            >
                              Editar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-gray-600 text-lg">Nenhum contrato ativo para este fornecedor</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Edição do Fornecedor */}
      {mostrarFormEditar && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">✏️ Editar Fornecedor</h2>
              <button
                onClick={() => setMostrarFormEditar(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X size={28} />
              </button>
            </div>

            <form onSubmit={handleSalvarEdicao} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nome Fantasia *</label>
                  <input
                    type="text"
                    value={formEdicao.nome}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, nome: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Razão Social</label>
                  <input
                    type="text"
                    value={formEdicao.razao_social}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, razao_social: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">CNPJ/CPF *</label>
                  <input
                    type="text"
                    value={formEdicao.cnpj_cpf}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, cnpj_cpf: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={formEdicao.email}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Telefone</label>
                  <input
                    type="tel"
                    value={formEdicao.telefone}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, telefone: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
                  <select
                    value={formEdicao.tipo}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, tipo: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Selecione</option>
                    <option value="Pessoa Jurídica">Pessoa Jurídica</option>
                    <option value="Pessoa Física">Pessoa Física</option>
                    <option value="MEI">MEI</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Endereço</label>
                  <input
                    type="text"
                    value={formEdicao.endereco}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, endereco: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Bairro</label>
                  <input
                    type="text"
                    value={formEdicao.bairro}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, bairro: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cidade</label>
                  <input
                    type="text"
                    value={formEdicao.cidade}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, cidade: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
                  <input
                    type="text"
                    value={formEdicao.estado}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, estado: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">🎯 Especialidades (máximo 4)</label>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={novaEspecialidadeFormEdicao}
                      onChange={(e) => setNovaEspecialidadeFormEdicao(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAdicionarEspecialidadeEdicao();
                        }
                      }}
                      placeholder="Ex: Redes, Manutenção de computador..."
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <button
                      type="button"
                      onClick={handleAdicionarEspecialidadeEdicao}
                      disabled={formEdicao.especialidades.length >= 4 || !novaEspecialidadeFormEdicao.trim()}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
                    >
                      +
                    </button>
                  </div>
                  {formEdicao.especialidades.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formEdicao.especialidades.map((esp, idx) => (
                        <div
                          key={idx}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-full text-sm font-medium"
                        >
                          {esp}
                          <button
                            type="button"
                            onClick={() => handleRemoverEspecialidadeEdicao(idx)}
                            className="ml-1 text-orange-700 hover:text-orange-900 font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setMostrarFormEditar(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition disabled:opacity-50"
                >
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Novo Contrato - IGUAL AO DA PÁGINA DE CONTRATOS, SEM O CAMPO FORNECEDOR */}
      {mostrarFormulario && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                ✏️ Novo Contrato
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
    </div>
  );
}
