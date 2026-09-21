/* @ts-nocheck */
"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Plus, Edit2, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
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
  cnpj_cpf: string;
}

interface Objeto {
  id: string;
  contrato_id: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  created_at?: string;
}

export default function DetalheContratoPage() {
  const router = useRouter();
  const params = useParams();
  const prefeituraId = params.id as string;
  const contratoId = params.contratoId as string;

  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [fornecedor, setFornecedor] = useState<Fornecedor | null>(null);
  const [objetos, setObjetos] = useState<Objeto[]>([]);
  const [valorTotal, setValorTotal] = useState(0);
  const [consumoObjetos, setConsumoObjetos] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarFormObjeto, setMostrarFormObjeto] = useState(false);
  const [mostrarFormEditar, setMostrarFormEditar] = useState(false);
  const [editandoObjeto, setEditandoObjeto] = useState<Objeto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [deletando, setDeletando] = useState<string | null>(null);

  const [formObjeto, setFormObjeto] = useState({
    descricao: "",
    quantidade: "",
    valor_unitario: "",
  });

  const [formEdicao, setFormEdicao] = useState({
    numero: "",
    descricao: "",
    data_inicio: "",
    data_fim: "",
    status: "ativo" as const,
    numero_processo: "",
    origem: "",
  });

  useEffect(() => {
    loadContrato();
    loadObjetos();
  }, [contratoId]);

  const loadContrato = async () => {
    try {
      const { data, error } = await supabase
        .from("contratos")
        .select("*")
        .eq("id", contratoId)
        .eq("prefeitura_id", prefeituraId)
        .single();

      if (error) throw error;
      setContrato(data);

      if (data.fornecedor_id) {
        const { data: fornecedorData } = await supabase
          .from("fornecedores")
          .select("*")
          .eq("id", data.fornecedor_id)
          .single();
        setFornecedor(fornecedorData);
      }
    } catch (error) {
      console.error("Erro ao carregar contrato:", error);
      setErro("Contrato não encontrado");
    } finally {
      setLoading(false);
    }
  };

  const loadObjetos = async () => {
    try {
      const { data, error } = await supabase
        .from("objetos_contratos")
        .select("*")
        .eq("contrato_id", contratoId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setObjetos(data || []);

      // Calcular valor total
      const total = (data || []).reduce((acc, obj) => acc + obj.quantidade * obj.valor_unitario, 0);
      setValorTotal(total);

      // Carregar consumo de cada objeto
      if (data && data.length > 0) {
        await loadConsumoObjetos(data.map((o) => o.id));
      }
    } catch (error) {
      console.error("Erro ao carregar objetos:", error);
    }
  };

  const loadConsumoObjetos = async (objetoIds: string[]) => {
    try {
      const { data, error } = await supabase
        .from("consumo_objetos")
        .select("objeto_id, quantidade_usada")
        .in("objeto_id", objetoIds);

      if (error) throw error;

      const consumo: { [key: string]: number } = {};
      (data || []).forEach((c) => {
        consumo[c.objeto_id] = (consumo[c.objeto_id] || 0) + c.quantidade_usada;
      });

      setConsumoObjetos(consumo);
    } catch (error) {
      console.error("Erro ao carregar consumo:", error);
    }
  };

  const handleSubmitObjeto = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formObjeto.descricao || !formObjeto.quantidade || !formObjeto.valor_unitario) {
      alert("Preencha todos os campos obrigatórios");
      return;
    }

    setSalvando(true);
    try {
      const quantidade = parseFloat(formObjeto.quantidade);
      const valorUnitario = parseFloat(formObjeto.valor_unitario.replace("R$ ", "").replace(/\./g, "").replace(",", "."));

      if (editandoObjeto) {
        const { error } = await supabase
          .from("objetos_contratos")
          .update({
            descricao: formObjeto.descricao,
            quantidade,
            valor_unitario: valorUnitario,
          })
          .eq("id", editandoObjeto.id);

        if (error) throw error;
        alert("Objeto atualizado com sucesso!");
      } else {
        const { error } = await supabase
          .from("objetos_contratos")
          .insert([
            {
              contrato_id: contratoId,
              descricao: formObjeto.descricao,
              quantidade,
              valor_unitario: valorUnitario,
            },
          ]);

        if (error) throw error;
        alert("Objeto adicionado com sucesso!");
      }

      setFormObjeto({ descricao: "", quantidade: "", valor_unitario: "" });
      setEditandoObjeto(null);
      setMostrarFormObjeto(false);
      await loadObjetos();
    } catch (error: any) {
      console.error("Erro ao salvar objeto:", error);
      alert(`Erro: ${error?.message || "Erro desconhecido"}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleEdit = (objeto: Objeto) => {
    setEditandoObjeto(objeto);
    setFormObjeto({
      descricao: objeto.descricao,
      quantidade: objeto.quantidade.toString(),
      valor_unitario: "R$ " + objeto.valor_unitario.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    });
    setMostrarFormObjeto(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja deletar este objeto?")) return;

    setDeletando(id);
    try {
      const { error } = await supabase
        .from("objetos_contratos")
        .delete()
        .eq("id", id);

      if (error) throw error;
      alert("Objeto deletado com sucesso!");
      await loadObjetos();
    } catch (error: any) {
      console.error("Erro ao deletar objeto:", error);
      alert(`Erro: ${error?.message || "Erro desconhecido"}`);
    } finally {
      setDeletando(null);
    }
  };

  const handleAbrirEdicao = () => {
    if (contrato) {
      setFormEdicao({
        numero: contrato.numero,
        descricao: contrato.descricao,
        data_inicio: contrato.data_inicio || "",
        data_fim: contrato.data_fim || "",
        status: contrato.status,
        numero_processo: contrato.numero_processo || "",
        origem: contrato.origem || "",
      });
      setMostrarFormEditar(true);
    }
  };

  const handleSalvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    try {
      const { error } = await supabase
        .from("contratos")
        .update({
          numero: formEdicao.numero,
          descricao: formEdicao.descricao,
          data_inicio: formEdicao.data_inicio || null,
          data_fim: formEdicao.data_fim || null,
          status: formEdicao.status,
          numero_processo: formEdicao.numero_processo || null,
          origem: formEdicao.origem || null,
        })
        .eq("id", contratoId);

      if (error) throw error;

      alert("Contrato atualizado com sucesso!");
      setMostrarFormEditar(false);
      await loadContrato();
    } catch (error: any) {
      alert(`Erro ao atualizar: ${error?.message || "Erro desconhecido"}`);
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

  if (erro || !contrato) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">⚠️ Erro</h1>
          <p className="text-gray-600 mb-6">{erro || "Contrato não encontrado"}</p>
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
        title={`Contrato ${contrato.numero}`}
        subtitle={contrato.descricao || "Detalhes do contrato"}
        tabs={[]}
        activeTab=""
        onTabChange={() => {}}
        userName="Admin"
        userRole="Acesso"
      />

      <div className="max-w-6xl mx-auto p-8">
        {/* Botão Voltar */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-orange-600 hover:text-orange-700 font-medium mb-6"
        >
          <ArrowLeft size={20} />
          Voltar
        </button>

        {/* Informações do Contrato */}
        <div className="bg-white rounded-lg shadow p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">📋 Informações do Contrato</h2>
            <div className="flex gap-3">
              <button
                onClick={handleAbrirEdicao}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                ✏️ Editar
              </button>
              <button
                onClick={async () => {
                  if (!confirm("Tem certeza que deseja deletar este contrato?")) return;
                  try {
                    const { error } = await supabase
                      .from("contratos")
                      .delete()
                      .eq("id", contratoId);

                    if (error) throw error;
                    alert("Contrato deletado com sucesso!");
                    router.push(`/prefeituras/${prefeituraId}/contratos`);
                  } catch (error: any) {
                    alert(`Erro ao deletar: ${error?.message || "Erro desconhecido"}`);
                  }
                }}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                🗑️ Deletar
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Número</p>
              <p className="text-gray-900 text-lg">{contrato.numero}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Valor Total (Calculado dos Objetos)</p>
              <p className="text-gray-900 text-lg font-medium mb-3">
                R$ {valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {contrato?.data_inicio && contrato?.data_fim && (() => {
                const inicio = new Date(contrato.data_inicio).getTime();
                const fim = new Date(contrato.data_fim).getTime();
                const agora = new Date().getTime();
                const duracao = fim - inicio;
                const decorrido = Math.max(0, agora - inicio);
                const progresso = Math.min(100, (decorrido / duracao) * 100);

                let cor = "bg-green-500";
                if (progresso >= 90) {
                  cor = "bg-red-500";
                } else if (progresso >= 70) {
                  cor = "bg-orange-500";
                } else if (progresso >= 50) {
                  cor = "bg-yellow-500";
                }

                return (
                  <div className="flex flex-col gap-2">
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full ${cor} transition-all duration-300`}
                        style={{ width: `${progresso}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-600">
                      Execução: {progresso.toFixed(0)}%
                    </span>
                  </div>
                );
              })()}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Fornecedor</p>
              <p className="text-gray-900">{fornecedor?.razao_social || fornecedor?.nome || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">CNPJ Fornecedor</p>
              <p className="text-gray-900">{fornecedor?.cnpj_cpf || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Data Início</p>
              <p className="text-gray-900">
                {contrato.data_inicio ? new Date(contrato.data_inicio).toLocaleDateString("pt-BR") : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Data Fim</p>
              <p className="text-gray-900">
                {contrato.data_fim ? new Date(contrato.data_fim).toLocaleDateString("pt-BR") : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Status</p>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                contrato.status === "ativo"
                  ? "bg-green-100 text-green-800"
                  : contrato.status === "concluido"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-red-100 text-red-800"
              }`}>
                {contrato.status}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Nº Processo</p>
              <p className="text-gray-900">{contrato.numero_processo || "-"}</p>
            </div>
          </div>
        </div>

        {/* Objetos do Contrato */}
        <div className="bg-white rounded-lg shadow p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">📦 Objetos ({objetos.length})</h2>
            <button
              onClick={() => {
                setMostrarFormObjeto(!mostrarFormObjeto);
                setEditandoObjeto(null);
                setFormObjeto({ descricao: "", quantidade: "", valor_unitario: "" });
              }}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition"
            >
              <Plus size={20} />
              {mostrarFormObjeto ? "Cancelar" : "Adicionar Objeto"}
            </button>
          </div>

          {/* Formulário Objeto */}
          {mostrarFormObjeto && (
            <form onSubmit={handleSubmitObjeto} className="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Descrição *</label>
                  <textarea
                    value={formObjeto.descricao}
                    onChange={(e) => setFormObjeto((prev) => ({ ...prev, descricao: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Descrição do objeto"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Quantidade *</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Valor Unitário *</label>
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
                  type="submit"
                  disabled={salvando}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 rounded-lg transition disabled:opacity-50"
                >
                  {salvando ? "Salvando..." : editandoObjeto ? "Atualizar Objeto" : "Adicionar Objeto"}
                </button>
              </div>
            </form>
          )}

          {/* Tabela Objetos */}
          {objetos.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Descrição</th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Quantidade</th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Valor Unitário</th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Saldo / Consumo</th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {objetos.map((objeto) => (
                    <tr key={objeto.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-4 px-4 text-gray-900">{objeto.descricao}</td>
                      <td className="py-4 px-4 text-gray-600">{objeto.quantidade}</td>
                      <td className="py-4 px-4 text-gray-600">
                        R$ {objeto.valor_unitario.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-2">
                          <p className="text-gray-900 font-medium">
                            R$ {(objeto.quantidade * objeto.valor_unitario).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          {(() => {
                            const consumida = consumoObjetos[objeto.id] || 0;
                            const restante = objeto.quantidade - consumida;
                            const porcentagemUsada = (consumida / objeto.quantidade) * 100;

                            let cor = "bg-green-500";
                            if (porcentagemUsada >= 90) {
                              cor = "bg-red-500";
                            } else if (porcentagemUsada >= 70) {
                              cor = "bg-orange-500";
                            } else if (porcentagemUsada >= 50) {
                              cor = "bg-yellow-500";
                            }

                            return (
                              <div className="flex flex-col gap-1">
                                <div className="w-32 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-full ${cor} transition-all duration-300`}
                                    style={{ width: `${porcentagemUsada}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-500">
                                  {consumida.toFixed(2)} / {objeto.quantidade.toFixed(2)} ({porcentagemUsada.toFixed(0)}%)
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleEdit(objeto)}
                            className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
                          >
                            <Edit2 size={16} />
                            Editar
                          </button>
                          <button
                            onClick={() => handleDelete(objeto.id)}
                            disabled={deletando === objeto.id}
                            className="text-red-600 hover:text-red-700 font-medium text-sm flex items-center gap-1 disabled:opacity-50"
                          >
                            <Trash2 size={16} />
                            {deletando === objeto.id ? "Deletando..." : "Deletar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600">Nenhum objeto cadastrado para este contrato</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Edição do Contrato */}
      {mostrarFormEditar && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">✏️ Editar Contrato</h2>
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Número do Contrato *</label>
                  <input
                    type="text"
                    value={formEdicao.numero}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, numero: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Ex: 2024-001"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select
                    value={formEdicao.status}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, status: e.target.value as any }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="concluido">Concluído</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Data Início</label>
                  <input
                    type="date"
                    value={formEdicao.data_inicio}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, data_inicio: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Data Fim</label>
                  <input
                    type="date"
                    value={formEdicao.data_fim}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, data_fim: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nº Processo</label>
                  <input
                    type="text"
                    value={formEdicao.numero_processo}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, numero_processo: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Ex: 029/2026"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Origem</label>
                  <input
                    type="text"
                    value={formEdicao.origem}
                    onChange={(e) => setFormEdicao((prev) => ({ ...prev, origem: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Ex: Contrato nº 060/2026"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Descrição *</label>
                <textarea
                  value={formEdicao.descricao}
                  onChange={(e) => setFormEdicao((prev) => ({ ...prev, descricao: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Descrição do contrato"
                  rows={4}
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                >
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarFormEditar(false)}
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
