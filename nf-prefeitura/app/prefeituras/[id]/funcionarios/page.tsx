/* @ts-nocheck */
"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, X, CheckCircle } from "lucide-react";
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
  cpf?: string;
  tipo_pessoa?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  estado?: string;
  cidade?: string;
  foto_url?: string;
}

interface Cargo {
  id: string;
  nome: string;
  prefeitura_id: string;
}

interface Secretaria {
  id: string;
  nome: string;
  prefeitura_id: string;
}

function FuncionariosContent() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { session: prefeituraSession } = usePrefeituraAuth();

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [autenticado, setAutenticado] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editando, setEditando] = useState<Funcionario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [deletando, setDeletando] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [mostrarNovoCargoModal, setMostrarNovoCargoModal] = useState(false);
  const [novoCargoNome, setNovoCargoNome] = useState("");
  const [criandoCargo, setCriandoCargo] = useState(false);
  const [usarSenhaPersonalizada, setUsarSenhaPersonalizada] = useState(false);
  const [senhaPersonalizada, setSenhaPersonalizada] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [fotoPrevisualizacao, setFotoPrevisualizacao] = useState<string | null>(null);
  const [uploadandoFoto, setUploadandoFoto] = useState(false);
  const [secretariasSelecionadas, setSecretariasSelecionadas] = useState<Set<string>>(new Set());
  const [secretariasComSecretario, setSecretariasComSecretario] = useState<Set<string>>(new Set());
  const [senhaGerada, setSenhaGerada] = useState<{ senha: string; email: string } | null>(null);

  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    telefone: "",
    cargo: "Usuario comum",
    secretaria_id: "",
    cpf: "",
    tipo_pessoa: "Usuário",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    estado: "",
    cidade: "",
  });

  useEffect(() => {
    const isAdminCheck = isAuthenticated();
    const isPrefeituraUser = prefeituraSession && prefeituraSession.prefeitura_id === id;

    if (isAdminCheck || isPrefeituraUser) {
      setIsAdmin(isAdminCheck);
      setAutenticado(true);
      loadFuncionarios();
      loadCargos();
      loadSecretarias();
      garantirCargoComum();
    } else {
      setLoading(false);
    }
  }, [id, prefeituraSession]);

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

  const garantirCargoComum = async () => {
    try {
      const { data } = await supabase
        .from("cargos")
        .select("id")
        .eq("prefeitura_id", id)
        .eq("nome", "Usuario comum")
        .single();

      if (!data) {
        await supabase.from("cargos").insert([
          {
            prefeitura_id: id,
            nome: "Usuario comum",
          },
        ]);
      }
    } catch (error) {
      console.error("Erro ao garantir cargo comum:", error);
    }
  };

  const loadFuncionarios = async () => {
    try {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("*")
        .eq("prefeitura_id", id)
        .order("nome", { ascending: true });

      if (error) throw error;

      // Carregar nomes das secretarias (principal + adicionais)
      const funcionariosComSecretaria = await Promise.all(
        (data || []).map(async (func) => {
          const secretariasList: string[] = [];

          // Carregar secretaria principal
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
              console.error("Erro ao carregar secretaria principal:", error);
            }
          }

          // Carregar secretarias adicionais
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
            console.error("Erro ao carregar secretarias adicionais:", error);
          }

          return {
            ...func,
            secretaria: secretariasList.length > 0 ? secretariasList.join(", ") : "-",
          };
        })
      );

      setFuncionarios(funcionariosComSecretaria);
    } catch (error) {
      console.error("Erro ao carregar funcionários:", error);
    } finally {
      setLoading(false);
    }
  };

  const gerarSenhaAleatoria = () => {
    const tamanho = 12;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%";
    let senha = "";
    for (let i = 0; i < tamanho; i++) {
      senha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return senha;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Mostrar preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setFotoPrevisualizacao(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload para Supabase Storage
    setUploadandoFoto(true);
    try {
      const nomeArquivo = `${id}/${editando?.id || Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage
        .from("funcionarios_fotos")
        .upload(nomeArquivo, file, { upsert: true });

      if (error) throw error;

      // Obter URL pública
      const { data: publicData } = supabase.storage
        .from("funcionarios_fotos")
        .getPublicUrl(nomeArquivo);

      setFormData((prev) => ({ ...prev, foto_url: publicData.publicUrl }));
    } catch (error) {
      console.error("Erro ao fazer upload da foto:", error);
      alert("Erro ao fazer upload da foto");
    } finally {
      setUploadandoFoto(false);
    }
  };

  const handleCriarNovoCargo = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!novoCargoNome.trim()) {
      alert("Digite o nome do cargo");
      return;
    }

    setCriandoCargo(true);

    try {
      const { data, error } = await supabase
        .from("cargos")
        .insert([{ prefeitura_id: id, nome: novoCargoNome.trim() }])
        .select("*")
        .single();

      if (error) throw error;

      setCargos([...cargos, data]);
      setFormData((prev) => ({ ...prev, cargo: data.nome }));
      setNovoCargoNome("");
      setMostrarNovoCargoModal(false);
      alert(`Cargo "${data.nome}" criado com sucesso!`);
    } catch (error) {
      console.error("Erro ao criar cargo:", error);
      alert("Erro ao criar cargo");
    } finally {
      setCriandoCargo(false);
    }
  };

  const hashSenha = async (senha: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(senha);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    try {
      if (!formData.nome || !formData.email || !formData.cargo) {
        alert("Preencha todos os campos obrigatórios");
        setSalvando(false);
        return;
      }

      if (editando) {
        // Atualizar funcionário - remover foto_url se estiver vazio
        const dataToUpdate = { ...formData };

        // Normalizar email (minúsculas e sem espaços)
        if (dataToUpdate.email) {
          dataToUpdate.email = dataToUpdate.email.trim().toLowerCase();
        }

        if (!dataToUpdate.foto_url) {
          delete dataToUpdate.foto_url;
        }

        // Vincular a primeira secretaria marcada como secretaria_id principal
        if (secretariasSelecionadas.size > 0) {
          dataToUpdate.secretaria_id = Array.from(secretariasSelecionadas)[0];
        } else {
            // @ts-ignore
          dataToUpdate.secretaria_id = null;
        }

        const { error } = await supabase
          .from("funcionarios")
          .update(dataToUpdate)
          .eq("id", editando.id);

        if (error) throw error;

        // Atualizar secretarias
        // 1. Deletar secretarias antigas
        await supabase
          .from("funcionario_secretarias")
          .delete()
          .eq("funcionario_id", editando.id);

        // 2. Inserir novas secretarias selecionadas
        if (secretariasSelecionadas.size > 0) {
          const novasSecretarias = Array.from(secretariasSelecionadas).map(secretaria_id => ({
            funcionario_id: editando.id,
            secretaria_id,
          }));

          const { error: errorSecretarias } = await supabase
            .from("funcionario_secretarias")
            .insert(novasSecretarias);

          if (errorSecretarias) throw errorSecretarias;
        }

        alert("Funcionário atualizado com sucesso!");
      } else {
        // Criar novo
        let dataToInsert: any = { ...formData, prefeitura_id: id };

        // Normalizar email (minúsculas e sem espaços)
        if (dataToInsert.email) {
          dataToInsert.email = dataToInsert.email.trim().toLowerCase();
        }

        // Vincular a primeira secretaria marcada como secretaria_id principal
        if (secretariasSelecionadas.size > 0) {
          dataToInsert.secretaria_id = Array.from(secretariasSelecionadas)[0];
        } else {
          dataToInsert.secretaria_id = null;
        }

        // Remover foto_url se estiver vazio
        if (!dataToInsert.foto_url) {
          delete dataToInsert.foto_url;
        }

        // Remover campos vazios que podem causar erro
        Object.keys(dataToInsert).forEach(key => {
          if (dataToInsert[key] === "" && key !== "complemento") {
            dataToInsert[key] = null;
          }
        });

        // Gerar ou usar senha personalizada
        let senhaFinal: string;
        if (usarSenhaPersonalizada && senhaPersonalizada) {
          senhaFinal = senhaPersonalizada;
        } else {
          senhaFinal = gerarSenhaAleatoria();
        }

        const senhaHash = await hashSenha(senhaFinal);
        dataToInsert.senha = senhaHash;

        console.log("Criando funcionário com email:", formData.email, "e senha:", senhaFinal);

        const { data: novoFuncionario, error } = await supabase
          .from("funcionarios")
          .insert([dataToInsert])
          .select()
          .single();

        if (error) {
          console.error("Erro ao criar funcionário:", error);
          throw error;
        }

        console.log("Funcionário criado com sucesso!");

        // Inserir secretarias selecionadas
        if (secretariasSelecionadas.size > 0) {
          const novasSecretarias = Array.from(secretariasSelecionadas).map(secretaria_id => ({
            funcionario_id: novoFuncionario.id,
            secretaria_id,
          }));

          const { error: errorSecretarias } = await supabase
            .from("funcionario_secretarias")
            .insert(novasSecretarias);

          if (errorSecretarias) throw errorSecretarias;
        }

        setSenhaGerada({ senha: senhaFinal, email: formData.email });
      }

      setFormData({
        nome: "",
        email: "",
        telefone: "",
        cargo: "Usuario comum",
        secretaria_id: "",
        cpf: "",
        tipo_pessoa: "Usuário",
        cep: "",
        logradouro: "",
        numero: "",
        complemento: "",
        bairro: "",
        estado: "",
        cidade: "",
      });
      setEditando(null);
      setMostrarFormulario(false);
      setSecretariasSelecionadas(new Set());
      setSecretariasComSecretario(new Set());
      setUsarSenhaPersonalizada(false);
      setSenhaPersonalizada("");
      setMostrarSenha(false);
      await loadFuncionarios();
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      const mensagem = error?.message || error?.details || JSON.stringify(error);
      alert(`Erro ao salvar funcionário:\n${mensagem}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleNovoFuncionario = async () => {
    // Carregar quais secretarias já têm secretários
    try {
      const comSecretario = new Set<string>();

      // Carregar secretarias que têm secretários (do campo secretaria_id)
      const { data: todasSecretarias } = await supabase
        .from("funcionarios")
        .select("secretaria_id")
        .eq("prefeitura_id", id)
        .not("secretaria_id", "is", null);

      if (todasSecretarias) {
        todasSecretarias.forEach((func: any) => {
          comSecretario.add(func.secretaria_id);
        });
      }

      // Carregar também as secretarias adicionais de outros funcionários
      const { data: outrasSecretarias } = await supabase
        .from("funcionario_secretarias")
        .select("secretaria_id");

      if (outrasSecretarias) {
        outrasSecretarias.forEach((s: any) => {
          comSecretario.add(s.secretaria_id);
        });
      }

      setSecretariasComSecretario(comSecretario);
      setSecretariasSelecionadas(new Set());
      setMostrarFormulario(true);
    } catch (error) {
      console.error("Erro ao carregar secretarias:", error);
      setMostrarFormulario(true);
    }
  };

  const handleEdit = async (funcionario: Funcionario) => {
    setEditando(funcionario);
    setFormData({
      nome: funcionario.nome,
      email: funcionario.email,
      telefone: funcionario.telefone,
      cargo: funcionario.cargo,
      secretaria_id: funcionario.secretaria_id || "",
      cpf: funcionario.cpf || "",
      tipo_pessoa: funcionario.tipo_pessoa || "Usuário",
      cep: funcionario.cep || "",
      logradouro: funcionario.logradouro || "",
      numero: funcionario.numero || "",
      complemento: funcionario.complemento || "",
      bairro: funcionario.bairro || "",
      estado: funcionario.estado || "",
            // @ts-ignore
      cidade: funcionario.cidade || "",
      foto_url: funcionario.foto_url || "",
    });

    // Carregar secretarias do funcionário e secretarias que já têm secretário
    try {
      const ids = new Set<string>();
      const comSecretario = new Set<string>();

      // Adicionar a secretaria_id atual do funcionário
      if (funcionario.secretaria_id) {
        ids.add(funcionario.secretaria_id);
      }

      // Carregar secretarias adicionais da tabela
      const { data: secretariasFunc } = await supabase
        .from("funcionario_secretarias")
        .select("secretaria_id")
        .eq("funcionario_id", funcionario.id);

      if (secretariasFunc && secretariasFunc.length > 0) {
        secretariasFunc.forEach((s: any) => ids.add(s.secretaria_id));
      }

      // Carregar quais secretarias já têm secretários (do campo secretaria_id)
      const { data: todasSecretarias } = await supabase
        .from("funcionarios")
        .select("id, secretaria_id")
        .eq("prefeitura_id", id)
        .not("secretaria_id", "is", null);

      if (todasSecretarias) {
        todasSecretarias.forEach((func: any) => {
          // Excluir apenas as secretarias do funcionário sendo editado
          if (func.id !== funcionario.id) {
            comSecretario.add(func.secretaria_id);
          }
        });
      }

      // Carregar também as secretarias adicionais de outros funcionários
      const { data: outrasSecretarias } = await supabase
        .from("funcionario_secretarias")
        .select("secretaria_id")
        .neq("funcionario_id", funcionario.id);

      if (outrasSecretarias) {
        outrasSecretarias.forEach((s: any) => {
          comSecretario.add(s.secretaria_id);
        });
      }

      setSecretariasSelecionadas(ids);
      setSecretariasComSecretario(comSecretario);
    } catch (error) {
      console.error("Erro ao carregar secretarias:", error);
      // Mesmo com erro, marcar a secretaria atual
      if (funcionario.secretaria_id) {
        setSecretariasSelecionadas(new Set([funcionario.secretaria_id]));
      } else {
        setSecretariasSelecionadas(new Set());
      }
      setSecretariasComSecretario(new Set());
    }

    setFotoPrevisualizacao(funcionario.foto_url || null);
    setMostrarFormulario(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja deletar este funcionário?")) return;

    setDeletando(id);
    try {
      const { error } = await supabase.from("funcionarios").delete().eq("id", id);

      if (error) throw error;
      alert("Funcionário deletado com sucesso!");
      await loadFuncionarios();
    } catch (error) {
      console.error("Erro:", error);
      alert("Erro ao deletar funcionário");
    } finally {
      setDeletando(null);
    }
  };

  const handleCancel = () => {
    setMostrarFormulario(false);
    setEditando(null);
    setFormData({
      nome: "",
      email: "",
      telefone: "",
      cargo: "Usuario comum",
      secretaria_id: "",
      cpf: "",
      tipo_pessoa: "Usuário",
      cep: "",
      logradouro: "",
      numero: "",
      complemento: "",
      bairro: "",
            // @ts-ignore
      estado: "",
      cidade: "",
      foto_url: "",
    });
    setSecretariasSelecionadas(new Set());
    setSecretariasComSecretario(new Set());
    setUsarSenhaPersonalizada(false);
    setSenhaPersonalizada("");
    setMostrarSenha(false);
    setFotoPrevisualizacao(null);
  };

  const handleResetarSenha = async () => {
    if (!editando) return;

    if (!confirm("Tem certeza que deseja redefinir a senha temporária deste funcionário?")) {
      return;
    }

    setSalvando(true);
    try {
      const novaSenha = gerarSenhaAleatoria();
      const senhaHash = await hashSenha(novaSenha);

      const { error } = await supabase
        .from("funcionarios")
        .update({ senha: senhaHash })
        .eq("id", editando.id);

      if (error) throw error;

      setSenhaGerada({ senha: novaSenha, email: editando.email });
      alert("Senha temporária redefinida com sucesso!");
    } catch (error) {
      console.error("Erro ao redefinir senha:", error);
      alert("Erro ao redefinir senha");
    } finally {
      setSalvando(false);
    }
  };

  const funcionariosFiltrados = funcionarios.filter((func) =>
    func.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    func.cargo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    func.email.toLowerCase().includes(searchTerm.toLowerCase())
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

  const tabs = [
    { id: "todos", label: "Todos" },
    { id: "ativos", label: "Ativos" },
    { id: "recentes", label: "Recentes" },
  ];

  const handleExport = () => {
    console.log("Exportando funcionários...");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNavBar
        title="Funcionários"
        subtitle="Gerencie todos os funcionários da prefeitura"
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

        {/* Botão Adicionar */}
        <div className="flex items-center justify-end mb-8">
          {!mostrarFormulario && (
            <button
              onClick={handleNovoFuncionario}
              className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 px-6 rounded-lg transition flex items-center gap-2"
            >
              ➕ Adicionar Funcionário
            </button>
          )}
        </div>

        {/* Formulário */}
        {mostrarFormulario && (
          <div className="bg-white rounded-xl shadow-sm p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="p-2 hover:bg-gray-100 rounded-lg transition text-gray-600 hover:text-gray-900"
                  title="Voltar"
                >
                  <ArrowLeft size={24} />
                </button>
                <h2 className="text-2xl font-bold text-gray-900">
                  {editando ? `✏️ Editar Funcionário - ${formData.nome}` : "➕ Novo Funcionário"}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="p-2 hover:bg-gray-100 rounded-lg transition text-gray-600 hover:text-gray-900"
                title="Fechar"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Botão de Redefinir Senha - Apenas ao Editar */}
              {editando && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-blue-800 mb-3">
                    💡 <strong>Redefinir Senha Temporária</strong>
                  </p>
                  <p className="text-sm text-blue-700 mb-4">
                    Clique no botão abaixo para gerar uma nova senha temporária caso o funcionário tenha perdido a senha anterior.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetarSenha}
                    disabled={salvando}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                  >
                    🔑 Gerar Nova Senha Temporária
                  </button>
                </div>
              )}

              {/* Foto do Funcionário */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Foto do Funcionário
                </label>
            // @ts-ignore
                <div className="flex items-start gap-6">
                  {/* Preview da Foto */}
                  <div className="flex-shrink-0">
                    {fotoPrevisualizacao || formData.foto_url ? (
                      <img
                        src={fotoPrevisualizacao || formData.foto_url}
                        alt="Preview"
                        className="w-32 h-32 rounded-lg object-cover border-2 border-gray-300"
                      />
                    ) : (
                      <div className="w-32 h-32 rounded-lg bg-gray-200 border-2 border-gray-300 flex items-center justify-center text-gray-400">
                        <span className="text-4xl">📷</span>
                      </div>
                    )}
                  </div>
                  {/* Input de Upload */}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFotoChange}
                      disabled={uploadandoFoto}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-orange-600 file:text-white hover:file:bg-orange-700 cursor-pointer"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      {uploadandoFoto ? "Enviando foto..." : "Formatos aceitos: JPG, PNG, GIF (máx. 5MB)"}
                    </p>
                  </div>
                </div>
              </div>

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
                    Cargo *
                  </label>
                  <div className="flex gap-2">
                    <select
                      name="cargo"
                      value={formData.cargo}
                      onChange={handleChange}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    >
                      <option value="">Selecione um cargo</option>
                      {cargos.map((cargo) => (
                        <option key={cargo.id} value={cargo.nome}>
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

                {editando && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Secretarias que gerencia
                    </label>
                    <div className="space-y-2 bg-gray-50 p-4 rounded-lg">
                      {secretarias.length === 0 ? (
                        <p className="text-sm text-gray-600">Nenhuma secretaria disponível</p>
                      ) : (
                        secretarias
                          .filter((secretaria) =>
                            // Mostrar apenas secretarias que:
                            // 1. Não têm secretário, OU
                            // 2. Já são gerenciadas pelo funcionário atual
                            !secretariasComSecretario.has(secretaria.id) ||
                            secretariasSelecionadas.has(secretaria.id)
                          )
                          .map((secretaria) => (
                            <label key={secretaria.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-100 p-2 rounded">
                              <input
                                type="checkbox"
                                checked={secretariasSelecionadas.has(secretaria.id)}
                                onChange={() => {
                                  const novo = new Set(secretariasSelecionadas);
                                  if (novo.has(secretaria.id)) {
                                    novo.delete(secretaria.id);
                                  } else {
                                    novo.add(secretaria.id);
                                  }
                                  setSecretariasSelecionadas(novo);
                                }}
                                className="w-4 h-4 cursor-pointer"
                              />
                              <span className="text-sm text-gray-700">{secretaria.nome}</span>
                            </label>
                          ))
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    CPF
                  </label>
                  <input
                    type="text"
                    name="cpf"
                    value={formData.cpf}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="000.000.000-00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de Pessoa
                  </label>
                  <select
                    name="tipo_pessoa"
                    value={formData.tipo_pessoa}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="Usuário">Usuário</option>
                    <option value="Servidor Público">Servidor Público</option>
                    <option value="Contratado">Contratado</option>
                  </select>
                </div>
              </div>

              {/* Endereço */}
              <div className="space-y-6 pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Endereço</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      CEP
                    </label>
                    <input
                      type="text"
                      name="cep"
                      value={formData.cep}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="00.000-000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Logradouro
                    </label>
                    <input
                      type="text"
                      name="logradouro"
                      value={formData.logradouro}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Rua, Avenida..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Número
                    </label>
                    <input
                      type="text"
                      name="numero"
                      value={formData.numero}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Número"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Complemento
                    </label>
                    <input
                      type="text"
                      name="complemento"
                      value={formData.complemento}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Complemento"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bairro
                    </label>
                    <input
                      type="text"
                      name="bairro"
                      value={formData.bairro}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Bairro"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Estado
                    </label>
                    <input
                      type="text"
                      name="estado"
                      value={formData.estado}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Estado"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cidade
                    </label>
                    <input
                      type="text"
                      name="cidade"
                      value={formData.cidade}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Cidade"
                    />
                  </div>
                </div>
              </div>

              {!editando && (
                <div className="space-y-4 mt-6 pt-6 border-t border-gray-200">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="usarSenha"
                      checked={usarSenhaPersonalizada}
                      onChange={(e) => {
                        setUsarSenhaPersonalizada(e.target.checked);
                        if (e.target.checked && !senhaPersonalizada) {
                          setSenhaPersonalizada(gerarSenhaAleatoria());
                        }
                      }}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="usarSenha" className="text-sm font-medium text-gray-700 cursor-pointer">
                      🔐 Criar senha temporária personalizada
                    </label>
                  </div>

                  {usarSenhaPersonalizada && (
                    <div className="bg-orange-50 rounded-lg p-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Senha Temporária
                      </label>
                      <div className="flex gap-2">
                        <input
                          type={mostrarSenha ? "text" : "password"}
                          value={senhaPersonalizada}
                          onChange={(e) => setSenhaPersonalizada(e.target.value)}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                          placeholder="Senha temporária"
                        />
                        <button
                          type="button"
                          onClick={() => setMostrarSenha(!mostrarSenha)}
                          className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition"
                          title={mostrarSenha ? "Ocultar" : "Mostrar"}
                        >
                          {mostrarSenha ? "👁️" : "👁️‍🗨️"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSenhaPersonalizada(gerarSenhaAleatoria())}
                          className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition font-medium"
                          title="Gerar nova"
                        >
                          🔄
                        </button>
                      </div>
                      <p className="text-xs text-gray-600 mt-2">
                        ℹ️ Esta senha será exibida após criar o funcionário
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                >
                  {salvando ? "Salvando..." : "Salvar Funcionário"}
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
        )}

        {/* Modal: Novo Cargo */}
        {mostrarNovoCargoModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">➕ Criar Novo Cargo</h2>

              <form onSubmit={handleCriarNovoCargo} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome do Cargo *
                  </label>
                  <input
                    type="text"
                    value={novoCargoNome}
                    onChange={(e) => setNovoCargoNome(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Ex: Diretor, Coordenador"
                    required
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={criandoCargo}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                  >
                    {criandoCargo ? "Criando..." : "Criar Cargo"}
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

        {/* Busca */}
        {!mostrarFormulario && (
          <div className="mb-6">
            <input
              type="text"
              placeholder="Buscar por nome, cargo ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        )}

        {/* Tabela */}
        {!mostrarFormulario && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-4 px-6 font-semibold text-gray-700">Nome</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-700">Cargo</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-700">Secretaria</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-700">Email</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-700">Telefone</th>
                    <th className="text-center py-4 px-6 font-semibold text-gray-700">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {funcionariosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-500">
                        Nenhum funcionário encontrado
                      </td>
                    </tr>
                  ) : (
                    funcionariosFiltrados.map((func) => (
                      <tr key={func.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-4 px-6 text-gray-900 font-medium">{func.nome}</td>
                        <td className="py-4 px-6 text-gray-600 capitalize">{func.cargo}</td>
                        <td className="py-4 px-6 text-gray-600">{func.secretaria || "-"}</td>
                        <td className="py-4 px-6 text-gray-600">{func.email}</td>
                        <td className="py-4 px-6 text-gray-600">{func.telefone || "-"}</td>
                        <td className="py-4 px-6 text-center">
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => handleEdit(func)}
                              className="text-blue-600 hover:text-blue-700 font-medium text-sm px-3 py-2 bg-blue-50 rounded-lg transition"
                            >
                              ✏️ Editar
                            </button>
                            <button
                              className="text-teal-600 hover:text-teal-700 font-medium text-sm px-3 py-2 bg-teal-50 rounded-lg transition"
                              title="Ativo"
                            >
                              <CheckCircle size={18} />
                            </button>
                            <button
                              onClick={() => handleDelete(func.id)}
                              disabled={deletando === func.id}
                              className="text-red-600 hover:text-red-700 font-medium text-sm disabled:opacity-50"
                            >
                              🗑️ Deletar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {senhaGerada && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-8">
              <div className="text-center mb-6">
                <div className="text-5xl mb-4">✅</div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Funcionário Cadastrado!</h2>
                <p className="text-gray-600">Compartilhe as credenciais abaixo com o usuário</p>
              </div>

              <div className="space-y-4 bg-gray-50 rounded-lg p-4 mb-6">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-2">📧 Email</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white px-3 py-2 rounded border border-gray-300 text-gray-900 font-mono text-sm break-all">
                      {senhaGerada.email}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(senhaGerada.email);
                        alert("Email copiado!");
                      }}
                      className="text-gray-500 hover:text-gray-700 px-2 py-2"
                      title="Copiar"
                    >
                      📋
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-600 mb-2">🔐 Senha Temporária</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white px-3 py-2 rounded border border-gray-300 text-gray-900 font-mono text-sm font-bold break-all">
                      {senhaGerada.senha}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(senhaGerada.senha);
                        alert("Senha copiada!");
                      }}
                      className="text-gray-500 hover:text-gray-700 px-2 py-2"
                      title="Copiar"
                    >
                      📋
                    </button>
                  </div>
                </div>

                <div className="border-t border-gray-300 pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="checkbox"
                      id="usarSenhaPersonalizadaModal"
                      checked={usarSenhaPersonalizada}
                      onChange={(e) => setUsarSenhaPersonalizada(e.target.checked)}
                      className="rounded cursor-pointer"
                    />
                    <label htmlFor="usarSenhaPersonalizadaModal" className="text-sm font-medium text-gray-700 cursor-pointer">
                      🔑 Usar senha personalizada
                    </label>
                  </div>

                  {usarSenhaPersonalizada && (
                    <div className="space-y-2">
                      <input
                        type={mostrarSenha ? "text" : "password"}
                        value={senhaPersonalizada}
                        onChange={(e) => setSenhaPersonalizada(e.target.value)}
                        placeholder="Digite a senha personalizada"
                        className="w-full px-3 py-2 rounded border border-gray-300 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarSenha(!mostrarSenha)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        {mostrarSenha ? "👁️ Ocultar" : "👁️ Mostrar"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={async () => {
                  // Se usar senha personalizada, atualizar no banco antes de fechar
                  if (usarSenhaPersonalizada && senhaPersonalizada && editando) {
                    try {
                      const senhaHash = await hashSenha(senhaPersonalizada);
                      await supabase
                        .from("funcionarios")
                        .update({ senha: senhaHash })
                        .eq("id", editando.id);
                      alert("Senha personalizada definida com sucesso!");
                    } catch (error) {
                      console.error("Erro ao atualizar senha:", error);
                      alert("Erro ao atualizar senha");
                      return;
                    }
                  }
                  // Limpar estados
                  setSenhaGerada(null);
                  setUsarSenhaPersonalizada(false);
                  setSenhaPersonalizada("");
                  setMostrarSenha(false);
                }}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                ✓ Entendido
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FuncionariosPage() {
  return (
    <ProtectedRoute>
      <FuncionariosContent />
    </ProtectedRoute>
  );
}
