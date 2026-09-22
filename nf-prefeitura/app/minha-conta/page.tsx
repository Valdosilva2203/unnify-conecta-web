"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, Settings, LogOut, Mail, Phone, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { logout as logoutAuth } from "@/lib/auth";
import { usePrefeituraAuth } from "@/hooks/usePrefeituraAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import TopNavBar from "@/components/TopNavBar";

interface Prefeitura {
  id: string;
  nome: string;
  cnpj: string;
  email: string;
  telefone: string;
  endereco: string;
  cidade: string;
  estado: string;
}

interface Secretaria {
  id: string;
  nome: string;
}

function MinhaContaContent() {
  const router = useRouter();
  const { session, loading: sessionLoading } = usePrefeituraAuth();
  const [prefeitura, setPrefeitura] = useState<Prefeitura | null>(null);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [secretariaAtualId, setSecretariaAtualId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mostrarAlterarSenha, setMostrarAlterarSenha] = useState(false);
  const [alterandoSenha, setAlterandoSenha] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);
  const [mostrarSenhas, setMostrarSenhas] = useState({ atual: false, nova: false, confirmar: false });
  const [mostrarAlterarEmail, setMostrarAlterarEmail] = useState(false);
  const [novoEmail, setNovoEmail] = useState("");
  const [alterandoEmail, setAlterandoEmail] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;

    if (!session) {
      router.push("/login");
      return;
    }

    // Buscar ID da secretária atual do localStorage (quando visitou a página de uma secretária)
    const secretariaAtual = localStorage.getItem("secretaria_atual_id");
    if (secretariaAtual) {
      setSecretariaAtualId(secretariaAtual);
    }

    loadPrefeitura();
    loadSecretarias();
  }, [session, sessionLoading, router]);

  const loadPrefeitura = async () => {
    try {
      if (!session?.prefeitura_id) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("prefeituras")
        .select("*")
        .eq("id", session.prefeitura_id)
        .single();

      if (error) throw error;
      setPrefeitura(data);
    } catch (error) {
      console.error("Erro ao carregar prefeitura:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadSecretarias = async () => {
    if (!session?.id) return;

    try {
      const secretariasList: Secretaria[] = [];

      // Buscar pela secretaria principal (secretaria_id)
      if (session?.tipo === "funcionario") {
        const { data: funcionario } = await supabase
          .from("funcionarios")
          .select("secretaria_id")
          .eq("id", session.id)
          .single();

        if (funcionario?.secretaria_id) {
          const { data: secretaria } = await supabase
            .from("secretarias")
            .select("id, nome")
            .eq("id", funcionario.secretaria_id)
            .single();
          if (secretaria) {
            secretariasList.push(secretaria);
          }
        }
      }

      // Buscar secretarias adicionais via funcionario_secretarias
      const { data: secretariasAdicionais } = await supabase
        .from("funcionario_secretarias")
        .select("secretaria_id")
        .eq("funcionario_id", session.id);

      if (secretariasAdicionais && secretariasAdicionais.length > 0) {
        for (const item of secretariasAdicionais) {
          const { data: secretaria } = await supabase
            .from("secretarias")
            .select("id, nome")
            .eq("id", item.secretaria_id)
            .single();
          if (secretaria && !secretariasList.find(s => s.id === secretaria.id)) {
            secretariasList.push(secretaria);
          }
        }
      }

      setSecretarias(secretariasList);
    } catch (error) {
      console.error("Erro ao carregar secretarias:", error);
    }
  };

  const handleLogout = () => {
    // Remover todas as sessões do usuário logado
    logoutAuth(); // Remove admin_session
    localStorage.removeItem("prefeitura_session");
    localStorage.removeItem("secretaria_atual_id");

    // Redirecionar para página de login apropriada
    const tipo = session?.tipo || "funcionario";
    router.push(tipo === "admin" ? "/auth" : "/login");
  };

  const handleAlterarEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensagem(null);

    if (!novoEmail) {
      setMensagem({ tipo: "erro", texto: "Digite um novo email" });
      return;
    }

    if (novoEmail === session?.email) {
      setMensagem({ tipo: "erro", texto: "O novo email não pode ser igual ao atual" });
      return;
    }

    setAlterandoEmail(true);

    try {
      // Determinar qual tabela o usuário pertence
      let tabelaUsuario = "prefeitura_users";

      // Tentar encontrar em funcionarios primeiro
      const { data: funcionario } = await supabase
        .from("funcionarios")
        .select("id")
        .eq("id", session?.id)
        .single();

      if (funcionario) {
        tabelaUsuario = "funcionarios";
      }

      // Chamar API route para alterar email (usa service_role, contorna RLS)
      const res = await fetch("/api/alterar-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session?.id,
          novoEmail,
          tabela: tabelaUsuario,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao alterar email");
      }

      // Atualizar na sessão do localStorage
      const prefeituraSession = localStorage.getItem("prefeitura_session");
      if (prefeituraSession) {
        const sessionData = JSON.parse(prefeituraSession);
        sessionData.email = novoEmail;
        localStorage.setItem("prefeitura_session", JSON.stringify(sessionData));
      }

      setMensagem({ tipo: "sucesso", texto: "Email alterado com sucesso! Fazendo logout..." });
      setNovoEmail("");

      // Remover sessão antes de redirecionar
      localStorage.removeItem("prefeitura_session");
      localStorage.removeItem("admin_session");
      localStorage.removeItem("secretaria_atual_id");

      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
    } catch (error) {
      console.error("Erro ao alterar email:", error);
      setMensagem({ tipo: "erro", texto: "Erro ao alterar email" });
    } finally {
      setAlterandoEmail(false);
    }
  };

  const handleAlterarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensagem(null);

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      setMensagem({ tipo: "erro", texto: "Preencha todos os campos" });
      return;
    }

    if (novaSenha.length < 6) {
      setMensagem({ tipo: "erro", texto: "Senha deve ter no mínimo 6 caracteres" });
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setMensagem({ tipo: "erro", texto: "As senhas não conferem" });
      return;
    }

    if (novaSenha === senhaAtual) {
      setMensagem({ tipo: "erro", texto: "A nova senha não pode ser igual à atual" });
      return;
    }

    setAlterandoSenha(true);

    try {
      // Determinar qual tabela o usuário pertence
      let tabelaUsuario = "prefeitura_users";

      // Tentar funcionarios primeiro
      const { data: funcionario, error: errFunc } = await supabase
        .from("funcionarios")
        .select("id")
        .eq("id", session?.id)
        .single();

      if (funcionario) {
        tabelaUsuario = "funcionarios";
        console.log("Usuário encontrado em funcionarios");
      } else {
        // Tentar em admins (usuário master)
        const { data: admin, error: errAdmin } = await supabase
          .from("admins")
          .select("id")
          .eq("id", session?.id)
          .single();

        if (admin) {
          tabelaUsuario = "admins";
          console.log("Usuário encontrado em admins");
        } else {
          // Tentar em prefeitura_users
          const { data: prefUser, error: errPref } = await supabase
            .from("prefeitura_users")
            .select("id")
            .eq("id", session?.id)
            .single();

          if (prefUser) {
            tabelaUsuario = "prefeitura_users";
            console.log("Usuário encontrado em prefeitura_users");
          } else {
            console.error("Usuário não encontrado em nenhuma tabela");
            throw new Error("Usuário não encontrado no sistema");
          }
        }
      }

      // Chamar API route para alterar senha (usa service_role, contorna RLS)
      const res = await fetch("/api/alterar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session?.id,
          senhaAtual,
          novaSenha,
          tabela: tabelaUsuario,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao alterar senha");
      }

      setMensagem({
        tipo: "sucesso",
        texto: "Email de confirmação enviado! Você será desconectado para segurança. Confirme a mudança de senha no email e faça login novamente."
      });
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");

      // Fazer logout após 2 segundos (por segurança)
      setTimeout(() => {
        localStorage.removeItem("prefeitura_session");
        localStorage.removeItem("admin_session");
        localStorage.removeItem("secretaria_atual_id");
        window.location.href = "/login";
      }, 2000);
    } catch (error) {
      console.error("Erro ao alterar senha:", error);
      setMensagem({ tipo: "erro", texto: error instanceof Error ? error.message : "Erro ao alterar senha" });
    } finally {
      setAlterandoSenha(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNavBar
        title="Minha Conta"
        subtitle="Gerenciar perfil e configurações"
        tabs={[]}
        activeTab=""
        onTabChange={() => {}}
        userName={session?.nome || "Usuário"}
        userRole={session?.cargo || session?.role || "Acesso"}
      />

      <div className="app-container p-8">
        {/* Botão Voltar */}
        <button
          onClick={() => router.back()}
          className="mb-8 text-orange-600 hover:text-orange-700 font-medium flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-orange-50 transition"
        >
          ← Voltar
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Coluna Esquerda - Informações Pessoais */}
          <div className="lg:col-span-1">
            {/* Card do Perfil */}
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-8 text-white mb-6 shadow-lg">
              <div className="text-5xl mb-4">👤</div>
              <h2 className="text-2xl font-bold mb-2">{session?.nome}</h2>
              <p className="text-orange-100 text-sm mb-4 capitalize">{session?.cargo || session?.role || "Sem cargo"}</p>
              <div className="bg-white/20 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Mail size={16} />
                  <span className="truncate">{session?.email}</span>
                </div>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="space-y-3">
              <button
                onClick={() => setMostrarAlterarSenha(!mostrarAlterarSenha)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition font-medium ${
                  mostrarAlterarSenha
                    ? "bg-orange-100 text-orange-700"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                } border border-gray-200 shadow-sm`}
              >
                <Lock size={20} />
                <span>Alterar Senha</span>
              </button>
              <button
                onClick={() => setMostrarAlterarEmail(!mostrarAlterarEmail)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition font-medium ${
                  mostrarAlterarEmail
                    ? "bg-orange-100 text-orange-700"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                } border border-gray-200 shadow-sm`}
              >
                <Mail size={20} />
                <span>Alterar Email</span>
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 shadow-sm"
              >
                <LogOut size={20} />
                <span>Sair</span>
              </button>
            </div>
          </div>

          {/* Coluna Direita */}
          <div className="lg:col-span-2 space-y-8">
            {/* Secretárias Vinculadas */}
            {secretarias.length > 0 && (
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-6">📋 Suas Secretárias</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {secretarias.map((secretaria) => {
                    const isAtual = secretariaAtualId === secretaria.id;
                    return (
                      <div
                        key={secretaria.id}
                        onClick={() => {
                          if (!isAtual) {
                            router.push(`/secretaria/${secretaria.id}`);
                          }
                        }}
                        className={`p-6 rounded-xl border-2 transition ${
                          isAtual
                            ? "bg-orange-50 border-orange-400 ring-2 ring-orange-200 shadow-md"
                            : "bg-white border-gray-200 hover:border-orange-300 hover:shadow-md cursor-pointer"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <span className="text-3xl">{isAtual ? "⭐" : "🏢"}</span>
                          {isAtual && <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-1 rounded">ATUAL</span>}
                        </div>
                        <h4 className={`font-bold text-lg ${isAtual ? "text-orange-700" : "text-gray-900"}`}>
                          {secretaria.nome}
                        </h4>
                        {isAtual && <p className="text-xs text-orange-600 mt-2">Você está nesta secretária</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Informações da Prefeitura */}
            {prefeitura && (
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-6">🏛️ Prefeitura</h3>
                <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Nome</p>
                      <p className="text-lg font-semibold text-gray-900">{prefeitura.nome}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">CNPJ</p>
                      <p className="text-lg font-semibold text-gray-900">{prefeitura.cnpj}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <MapPin size={20} className="text-orange-600" />
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Localização</p>
                        <p className="text-gray-900">{prefeitura.cidade}/{prefeitura.estado}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Phone size={20} className="text-orange-600" />
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Telefone</p>
                        <p className="text-gray-900">{prefeitura.telefone}</p>
                      </div>
                    </div>

                    <div className="md:col-span-2 flex items-center gap-2">
                      <Mail size={20} className="text-orange-600" />
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Email</p>
                        <p className="text-gray-900">{prefeitura.email}</p>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Endereço</p>
                      <p className="text-gray-900">{prefeitura.endereco}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Seção de Alterar Senha */}

        {/* Modal de Alterar Senha */}
        {mostrarAlterarSenha && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">🔐 Alterar Senha</h2>
                <button
                  onClick={() => {
                    setMostrarAlterarSenha(false);
                    setSenhaAtual("");
                    setNovaSenha("");
                    setConfirmarSenha("");
                    setMensagem(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleAlterarSenha} className="space-y-4">
                {mensagem && (
                  <div
                    className={`p-4 rounded-lg text-sm ${
                      mensagem.tipo === "sucesso"
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {mensagem.texto}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Senha Atual
                  </label>
                  <div className="relative">
                    <input
                      type={mostrarSenhas.atual ? "text" : "password"}
                      value={senhaAtual}
                      onChange={(e) => setSenhaAtual(e.target.value)}
                      className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Digite sua senha atual"
                      required
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setMostrarSenhas({ ...mostrarSenhas, atual: !mostrarSenhas.atual })
                      }
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {mostrarSenhas.atual ? "👁️" : "👁️‍🗨️"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nova Senha
                  </label>
                  <div className="relative">
                    <input
                      type={mostrarSenhas.nova ? "text" : "password"}
                      value={novaSenha}
                      onChange={(e) => setNovaSenha(e.target.value)}
                      className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Digite sua nova senha"
                      required
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setMostrarSenhas({ ...mostrarSenhas, nova: !mostrarSenhas.nova })
                      }
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {mostrarSenhas.nova ? "👁️" : "👁️‍🗨️"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirmar Nova Senha
                  </label>
                  <div className="relative">
                    <input
                      type={mostrarSenhas.confirmar ? "text" : "password"}
                      value={confirmarSenha}
                      onChange={(e) => setConfirmarSenha(e.target.value)}
                      className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Confirme sua nova senha"
                      required
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setMostrarSenhas({ ...mostrarSenhas, confirmar: !mostrarSenhas.confirmar })
                      }
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {mostrarSenhas.confirmar ? "👁️" : "👁️‍🗨️"}
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={alterandoSenha}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                  >
                    {alterandoSenha ? "Alterando..." : "Alterar Senha"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarAlterarSenha(false);
                      setSenhaAtual("");
                      setNovaSenha("");
                      setConfirmarSenha("");
                      setMensagem(null);
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

        {/* Modal de Alterar Email */}
        {mostrarAlterarEmail && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">✉️ Alterar Email</h2>
                <button
                  onClick={() => {
                    setMostrarAlterarEmail(false);
                    setNovoEmail("");
                    setMensagem(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleAlterarEmail} className="space-y-4">
                {mensagem && (
                  <div
                    className={`p-4 rounded-lg text-sm ${
                      mensagem.tipo === "sucesso"
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {mensagem.texto}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Atual
                  </label>
                  <input
                    type="email"
                    value={session?.email}
                    disabled
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Novo Email
                  </label>
                  <input
                    type="email"
                    value={novoEmail}
                    onChange={(e) => setNovoEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Digite seu novo email"
                    required
                  />
                </div>

                <p className="text-xs text-gray-600 bg-blue-50 p-3 rounded-lg">
                  ℹ️ Você será desconectado após alterar o email e precisará fazer login novamente.
                </p>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={alterandoEmail}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                  >
                    {alterandoEmail ? "Alterando..." : "Alterar Email"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarAlterarEmail(false);
                      setNovoEmail("");
                      setMensagem(null);
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

export default function MinhaContaPage() {
  return (
    <ProtectedRoute>
      <MinhaContaContent />
    </ProtectedRoute>
  );
}
