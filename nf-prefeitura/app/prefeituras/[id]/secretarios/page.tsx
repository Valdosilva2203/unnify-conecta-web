"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isAuthenticated } from "@/lib/auth";
import { usePrefeituraAuth } from "@/hooks/usePrefeituraAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import TopNavBar from "@/components/TopNavBar";

interface Funcionario {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cargo: string;
  secretaria_id?: string;
  secretaria?: string;
  prefeitura_id: string;
}

interface Secretaria {
  id: string;
  nome: string;
  prefeitura_id: string;
}

function SecretariosContent() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { session: prefeituraSession } = usePrefeituraAuth();

  const [secretarios, setSecretarios] = useState<Funcionario[]>([]);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [autenticado, setAutenticado] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editando, setEditando] = useState<Funcionario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [deletando, setDeletando] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    telefone: "",
    secretaria_id: "",
  });

  useEffect(() => {
    const isAdminCheck = isAuthenticated();
    const isPrefeituraUser = prefeituraSession && prefeituraSession.prefeitura_id === id;

    if (isAdminCheck || isPrefeituraUser) {
      setIsAdmin(isAdminCheck);
      setAutenticado(true);
      loadSecretarios();
      loadSecretarias();
    } else {
      setLoading(false);
    }
  }, [id, prefeituraSession]);

  const loadSecretarias = async () => {
    try {
      const { data, error } = await supabase
        .from("secretarias")
        .select("*")
        .eq("prefeitura_id", id)
        .order("nome", { ascending: true });

      if (error) throw error;
      setSecretarias(data || []);
    } catch (error) {
      console.error("Erro ao carregar secretarias:", error);
    }
  };

  const loadSecretarios = async () => {
    try {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("*")
        .eq("prefeitura_id", id)
        .order("nome", { ascending: true });

      if (error) throw error;

      // Filtrar apenas secretários e carregar nomes das secretarias
      const secretariosFiltered = (data || []).filter((func) => {
        const cargoLower = func.cargo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        return cargoLower.includes("secretario");
      });

      const secretariosComSecretaria = await Promise.all(
        secretariosFiltered.map(async (func) => {
          const secretariasList: string[] = [];

          // 1. Buscar secretaria principal (via secretaria_id)
          if (func.secretaria_id) {
            try {
              const { data: secretaria } = await supabase
                .from("secretarias")
                .select("nome")
                .eq("id", func.secretaria_id)
                .single();
              if (secretaria?.nome) {
                secretariasList.push(secretaria.nome);
              }
            } catch (error) {
              console.error("Erro ao buscar secretaria_id:", error);
            }
          }

          // 2. Buscar secretarias adicionais via funcionario_secretarias
          try {
            const { data: secretariasAdicionais } = await supabase
              .from("funcionario_secretarias")
              .select("secretaria_id")
              .eq("funcionario_id", func.id);

            if (secretariasAdicionais && secretariasAdicionais.length > 0) {
              for (const item of secretariasAdicionais) {
                const { data: secretaria } = await supabase
                  .from("secretarias")
                  .select("nome")
                  .eq("id", item.secretaria_id)
                  .single();

                if (secretaria?.nome && !secretariasList.includes(secretaria.nome)) {
                  secretariasList.push(secretaria.nome);
                }
              }
            }
          } catch (error) {
            console.error("Erro ao buscar funcionario_secretarias:", error);
          }

          return {
            ...func,
            secretaria: secretariasList.length > 0 ? secretariasList.join(", ") : "-",
          };
        })
      );

      setSecretarios(secretariosComSecretaria);
    } catch (error) {
      console.error("Erro ao carregar secretários:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    try {
      if (!formData.nome || !formData.email) {
        alert("Preencha todos os campos obrigatórios");
        setSalvando(false);
        return;
      }

      if (editando) {
        // Atualizar
        const { error } = await supabase
          .from("funcionarios")
          .update(formData)
          .eq("id", editando.id);

        if (error) throw error;
        alert("Secretário atualizado com sucesso!");
      }

      setFormData({ nome: "", email: "", telefone: "", secretaria_id: "" });
      setEditando(null);
      setMostrarFormulario(false);
      await loadSecretarios();
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      const mensagem = error?.message || error?.details || JSON.stringify(error);
      alert(`Erro ao salvar secretário:\n${mensagem}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleEdit = (funcionario: Funcionario) => {
    // Toggle: se já está editando este secretário, fecha
    if (editando?.id === funcionario.id) {
      setMostrarFormulario(false);
      setEditando(null);
      return;
    }

    // Caso contrário, abre o formulário
    setEditando(funcionario);
    setFormData({
      nome: funcionario.nome,
      email: funcionario.email,
      telefone: funcionario.telefone,
      secretaria_id: funcionario.secretaria_id || "",
    });
    setMostrarFormulario(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja deletar este secretário?")) return;

    setDeletando(id);
    try {
      const { error } = await supabase.from("funcionarios").delete().eq("id", id);

      if (error) throw error;
      alert("Secretário deletado com sucesso!");
      await loadSecretarios();
    } catch (error) {
      console.error("Erro:", error);
      alert("Erro ao deletar secretário");
    } finally {
      setDeletando(null);
    }
  };

  const handleDesvinculaSecretario = async () => {
    if (!editando) return;

    if (!confirm("Tem certeza que deseja desvincular este secretário? O cargo será alterado para 'Usuario comum'.")) {
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase
        .from("funcionarios")
        .update({
          secretaria_id: null,
          cargo: "Usuario comum",
        })
        .eq("id", editando.id);

      if (error) throw error;
      alert("Secretário desvinculado com sucesso!");
      handleCancel();
      await loadSecretarios();
    } catch (error) {
      console.error("Erro ao desvincular:", error);
      alert("Erro ao desvincular secretário");
    } finally {
      setSalvando(false);
    }
  };

  const handleCancel = () => {
    setMostrarFormulario(false);
    setEditando(null);
    setFormData({ nome: "", email: "", telefone: "", secretaria_id: "" });
  };

  const secretariosFiltrados = secretarios.filter((sec) =>
    sec.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sec.cargo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sec.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        title="Secretários"
        subtitle="Gerencie todos os secretários da prefeitura"
        tabs={[]}
        activeTab="todos"
        onTabChange={() => {}}
        userName={prefeituraSession?.nome || "Usuário"}
        userRole={prefeituraSession?.role || prefeituraSession?.cargo || "Usuário"}
      />

      <div className="app-container p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <button
              onClick={() => router.back()}
              className="bg-white text-orange-600 hover:bg-orange-50 hover:text-orange-700 border border-orange-600 shadow-sm hover:shadow-md transition font-medium px-4 py-2 rounded-lg flex items-center gap-2 mb-4"
            >
              <span>←</span>
              Voltar
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Gerenciar Secretários</h1>
            <p className="text-gray-600 mt-2">Gerencie todos os secretários da prefeitura</p>
          </div>
        </div>

        {/* Busca */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Buscar por nome, cargo ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-xl shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            🎩 Secretários ({secretariosFiltrados.length})
          </h2>

          {secretarios.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">
                Nenhum secretário cadastrado
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">
                      Nome
                    </th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">
                      Cargo
                    </th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">
                      Secretaria
                    </th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">
                      Email
                    </th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">
                      Telefone
                    </th>
                    <th className="text-left py-4 px-4 font-semibold text-gray-700">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {secretariosFiltrados.map((secretario) => (
                    <tr
                      key={secretario.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-4 px-4 text-gray-900 font-medium">
                        {secretario.nome}
                      </td>
                      <td className="py-4 px-4 text-gray-600">
                        {secretario.cargo}
                      </td>
                      <td className="py-4 px-4 text-gray-600">
                        {secretario.secretaria || "-"}
                      </td>
                      <td className="py-4 px-4 text-gray-600">
                        {secretario.email}
                      </td>
                      <td className="py-4 px-4 text-gray-600">
                        {secretario.telefone}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleEdit(secretario)}
                            className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDelete(secretario.id)}
                            disabled={deletando === secretario.id}
                            className="text-red-600 hover:text-red-700 font-medium text-sm disabled:opacity-50"
                          >
                            {deletando === secretario.id ? "Deletando..." : "Deletar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal de Edição */}
        {mostrarFormulario && editando && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  ✏️ Editar Secretário
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
                      Nome *
                    </label>
                    <input
                      type="text"
                      name="nome"
                      value={formData.nome}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Nome completo"
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
                      placeholder="email@example.com"
                      required
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
                      Secretaria
                    </label>
                    <select
                      name="secretaria_id"
                      value={formData.secretaria_id}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="">Selecione uma secretaria (opcional)</option>
                      {secretarias.map((secretaria) => (
                        <option key={secretaria.id} value={secretaria.id}>
                          {secretaria.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={salvando}
                      className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                    >
                      {salvando ? "Salvando..." : "Salvar Secretário"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-medium py-2 px-4 rounded-lg transition"
                    >
                      Cancelar
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleDesvinculaSecretario}
                    disabled={salvando}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                  >
                    🔗 Desvincular Secretário
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

export default function Secretarios() {
  return (
    <ProtectedRoute>
      <SecretariosContent />
    </ProtectedRoute>
  );
}
