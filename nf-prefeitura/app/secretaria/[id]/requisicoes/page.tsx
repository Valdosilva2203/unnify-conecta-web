"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import TopNavBar from "@/components/TopNavBar";

interface Requisicao {
  id: string;
  titulo: string;
  descricao: string;
  status: string;
  created_at: string;
  numero_requisicao: string;
}

interface Fornecedor {
  id: string;
  nome: string;
  cnpj_cpf: string;
  email: string;
  telefone: string;
  endereco: string;
  cidade: string;
  estado: string;
}

export default function RequisicoesPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const secretariaId = params.id as string;

  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [secretariaNome, setSecretariaNome] = useState("");

  const [formData, setFormData] = useState({
    titulo: "",
    descricao: "",
  });
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [buscaFornecedor, setBuscaFornecedor] = useState("");
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<Fornecedor | null>(null);
  const [mostraListaFornecedores, setMostraListaFornecedores] = useState(false);

  useEffect(() => {
    loadSecretaria();
    loadRequisicoes();
  }, [secretariaId]);

  const loadSecretaria = async () => {
    try {
      const { data } = await supabase
        .from("secretarias")
        .select("nome")
        .eq("id", secretariaId)
        .single();

      if (data) {
        setSecretariaNome(data.nome);
      }
    } catch (error) {
      console.error("Erro ao carregar secretaria:", error);
    }
  };

  const loadRequisicoes = async () => {
    try {
      let query = supabase
        .from("requisicoes")
        .select("*")
        .eq("secretaria_id", secretariaId);

      // Se usuário NÃO é secretário, mostrar apenas suas requisições
      const prefeituraSession = localStorage.getItem("prefeitura_session");
      const session = prefeituraSession ? JSON.parse(prefeituraSession) : null;

      if (session && session.cargo !== "Secretário" && session.cargo !== "secretario") {
        query = query.eq("criada_por", session.id);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;
      setRequisicoes(data || []);
    } catch (error) {
      console.error("Erro ao carregar requisições:", error);
    } finally {
      setLoading(false);
    }
  };

  const buscarFornecedores = async (termo: string) => {
    if (termo.trim().length < 2) {
      setFornecedores([]);
      return;
    }

    try {
      const prefeituraSession = localStorage.getItem("prefeitura_session");
      const session = prefeituraSession ? JSON.parse(prefeituraSession) : null;

      const { data, error } = await supabase
        .from("fornecedores")
        .select("*")
        .eq("prefeitura_id", session?.prefeitura_id)
        .or(`nome.ilike.%${termo}%,cnpj_cpf.ilike.%${termo}%`)
        .limit(10);

      if (error) throw error;
      setFornecedores(data || []);
    } catch (error) {
      console.error("Erro ao buscar fornecedores:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.titulo.trim()) {
      alert("Título é obrigatório");
      return;
    }

    setSalvando(true);
    try {
      const prefeituraSession = localStorage.getItem("prefeitura_session");
      const session = prefeituraSession ? JSON.parse(prefeituraSession) : null;

      const { error } = await supabase
        .from("requisicoes")
        .insert([
          {
            secretaria_id: secretariaId,
            prefeitura_id: session?.prefeitura_id,
            titulo: formData.titulo,
            descricao: formData.descricao,
            status: "pendente",
            solicitante_id: session?.id,
          },
        ]);

      if (error) throw error;

      setFormData({ titulo: "", descricao: "" });
      setMostrarFormulario(false);
      await loadRequisicoes();
    } catch (error) {
      console.error("Erro ao criar requisição:", error);
      alert("Erro ao criar requisição");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNavBar
        title="Requisições"
        subtitle={`Gerenciar requisições de ${secretariaNome}`}
        tabs={[]}
        activeTab=""
        onTabChange={() => {}}
        userName="Usuário"
        userRole="Acesso"
      />

      <div className="p-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-orange-600 hover:text-orange-700 font-medium mb-6"
        >
          ← Voltar
        </button>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📋 Requisições</h1>
            <p className="text-gray-600 mt-2">Gerencie as requisições da secretaria {secretariaNome}</p>
          </div>
          <button
            onClick={() => setMostrarFormulario(!mostrarFormulario)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition font-medium"
          >
            <Plus size={20} />
            Nova Requisição
          </button>
        </div>

        {/* Formulário */}
        {mostrarFormulario && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Criar Requisição</h2>
              <button
                onClick={() => setMostrarFormulario(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Buscar Fornecedor
                </label>
                <input
                  type="text"
                  value={buscaFornecedor}
                  onChange={(e) => {
                    setBuscaFornecedor(e.target.value);
                    buscarFornecedores(e.target.value);
                    setMostraListaFornecedores(true);
                  }}
                  onFocus={() => setMostraListaFornecedores(true)}
                  placeholder="Digite nome ou CNPJ do fornecedor"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />

                {mostraListaFornecedores && fornecedores.length > 0 && (
                  <div className="absolute top-full mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                    {fornecedores.map((forn) => (
                      <button
                        key={forn.id}
                        type="button"
                        onClick={() => {
                          setFornecedorSelecionado(forn);
                          setBuscaFornecedor(forn.nome);
                          setMostraListaFornecedores(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-orange-50 transition border-b last:border-b-0"
                      >
                        <p className="font-medium text-gray-900">{forn.nome}</p>
                        <p className="text-xs text-gray-500">{forn.cnpj_cpf}</p>
                      </button>
                    ))}
                  </div>
                )}

                {fornecedorSelecionado && (
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="font-medium text-gray-900 mb-2">Fornecedor Selecionado:</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-gray-600">Nome:</p>
                        <p className="font-medium">{fornecedorSelecionado.nome}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">CPF/CNPJ:</p>
                        <p className="font-medium">{fornecedorSelecionado.cnpj_cpf}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Telefone:</p>
                        <p className="font-medium">{fornecedorSelecionado.telefone}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">E-mail:</p>
                        <p className="font-medium">{fornecedorSelecionado.email}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-gray-600">Endereço:</p>
                        <p className="font-medium">{fornecedorSelecionado.endereco}, {fornecedorSelecionado.cidade} - {fornecedorSelecionado.estado}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Título *
                </label>
                <input
                  type="text"
                  value={formData.titulo}
                  onChange={(e) =>
                    setFormData({ ...formData, titulo: e.target.value })
                  }
                  placeholder="Digite o título da requisição"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descrição
                </label>
                <textarea
                  value={formData.descricao}
                  onChange={(e) =>
                    setFormData({ ...formData, descricao: e.target.value })
                  }
                  placeholder="Digite a descrição da requisição (opcional)"
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition font-medium disabled:opacity-50"
                >
                  {salvando ? "Salvando..." : "Criar Requisição"}
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarFormulario(false)}
                  className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista de Requisições */}
        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <div className="p-8 text-center">
              <p className="text-gray-600">Carregando...</p>
            </div>
          ) : requisicoes.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-600 text-lg">Nenhuma requisição criada</p>
              <p className="text-gray-500 mt-2">Clique em "Nova Requisição" para criar uma</p>
            </div>
          ) : (
            <div className="divide-y">
              {requisicoes.map((req) => (
                <div key={req.id} className="p-6 hover:bg-gray-50 transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-gray-900">{req.titulo}</h3>
                        <span className="text-xs font-mono bg-gray-200 text-gray-800 px-2 py-1 rounded">
                          {req.numero_requisicao}
                        </span>
                      </div>
                      {req.descricao && (
                        <p className="text-gray-600 mt-2">{req.descricao}</p>
                      )}
                      <div className="flex items-center gap-4 mt-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          req.status === "pendente"
                            ? "bg-yellow-100 text-yellow-800"
                            : req.status === "aprovado"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {req.status}
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(req.created_at).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
