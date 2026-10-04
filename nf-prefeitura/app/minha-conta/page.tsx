"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, LogOut, Mail, Phone, MapPin, Settings, BookOpen, FileText, MessageSquare, Activity, Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { logout as logoutAuth } from "@/lib/auth";
import { usePrefeituraAuth } from "@/hooks/usePrefeituraAuth";
import ProtectedRoute from "@/components/ProtectedRoute";

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
    logoutAuth();
    localStorage.removeItem("prefeitura_session");
    localStorage.removeItem("secretaria_atual_id");

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
      let tabelaUsuario = "prefeitura_users";

      const { data: funcionario } = await supabase
        .from("funcionarios")
        .select("id")
        .eq("id", session?.id)
        .single();

      if (funcionario) {
        tabelaUsuario = "funcionarios";
      }

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

      const prefeituraSession = localStorage.getItem("prefeitura_session");
      if (prefeituraSession) {
        const sessionData = JSON.parse(prefeituraSession);
        sessionData.email = novoEmail;
        localStorage.setItem("prefeitura_session", JSON.stringify(sessionData));
      }

      setMensagem({ tipo: "sucesso", texto: "Email alterado com sucesso! Fazendo logout..." });
      setNovoEmail("");

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
      let tabelaUsuario = "prefeitura_users";

      const { data: funcionario, error: errFunc } = await supabase
        .from("funcionarios")
        .select("id")
        .eq("id", session?.id)
        .single();

      if (funcionario) {
        tabelaUsuario = "funcionarios";
      } else {
        const { data: admin, error: errAdmin } = await supabase
          .from("admins")
          .select("id")
          .eq("id", session?.id)
          .single();

        if (admin) {
          tabelaUsuario = "admins";
        } else {
          const { data: prefUser, error: errPref } = await supabase
            .from("prefeitura_users")
            .select("id")
            .eq("id", session?.id)
            .single();

          if (prefUser) {
            tabelaUsuario = "prefeitura_users";
          } else {
            console.error("Usuário não encontrado em nenhuma tabela");
            throw new Error("Usuário não encontrado no sistema");
          }
        }
      }

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

  const menuItems = [
    { icon: <Lock size={20} />, label: "Alterar Senha", action: () => setMostrarAlterarSenha(true), count: null },
    { icon: <Mail size={20} />, label: "Alterar Email", action: () => setMostrarAlterarEmail(true), count: null },
    { icon: <BookOpen size={20} />, label: "Meus Cursos", action: () => {}, count: 0 },
    { icon: <FileText size={20} />, label: "Documentos", action: () => {}, count: 0 },
    { icon: <MessageSquare size={20} />, label: "Mensagens", action: () => {}, count: 1 },
    { icon: <Settings size={20} />, label: "Preferências", action: () => {}, count: null },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-64 bg-gradient-to-br from-orange-500 to-orange-600 text-white p-8 overflow-y-auto">
          {/* Perfil Resumido */}
          <div className="bg-white/10 rounded-lg p-4 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl">👤</div>
              <div>
                <p className="font-bold text-sm">{session?.nome}</p>
                <p className="text-xs text-purple-200">{session?.cargo}</p>
              </div>
            </div>
            <p className="text-xs text-purple-200 truncate">{session?.email}</p>
          </div>

          {/* Menu */}
          <nav className="space-y-2 mb-8">
            {menuItems.map((item, idx) => (
              <button
                key={idx}
                onClick={item.action}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-white/10 transition text-sm"
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                {item.count !== null && (
                  <span className="bg-white/30 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                    {item.count}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Sair */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/20 text-red-200 hover:bg-red-500/30 transition mt-auto"
          >
            <LogOut size={20} />
            <span className="text-sm">Sair</span>
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-8 max-w-6xl mx-auto">
            {/* Header com Perfil */}
            <div className="bg-white rounded-2xl p-8 mb-8 shadow-sm">
              <div className="flex items-start gap-8">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-6xl">
                  👤
                </div>
                <div className="flex-1">
                  <h1 className="text-4xl font-bold text-gray-900 mb-2">{session?.nome}</h1>
                  <p className="text-gray-600 mb-4">Registro: 24 de setembro de 2024</p>
                  <p className="text-sm text-gray-500 mb-6">{session?.email}</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setMostrarAlterarSenha(true)}
                      className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition"
                    >
                      ✏️ Editar Perfil
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Grid Principal - 3 colunas */}
            <div className="grid grid-cols-3 gap-6 mb-8">
              {/* Prefeitura */}
              {prefeitura && (
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <span>🏛️</span> Prefeitura
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 font-semibold">NOME</p>
                      <p className="text-gray-900 font-medium">{prefeitura.nome}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-semibold">CNPJ</p>
                      <p className="text-gray-900">{prefeitura.cnpj}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-semibold">LOCALIZAÇÃO</p>
                      <p className="text-gray-900">{prefeitura.cidade}/{prefeitura.estado}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Status */}
              <div className={`rounded-xl p-6 border ${secretarias.length > 0
                ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'
                : 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200'}`}>
                <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${secretarias.length > 0 ? 'text-green-900' : 'text-blue-900'}`}>
                  <span>{secretarias.length > 0 ? '✅' : '🔗'}</span> Status
                </h3>
                <p className={`text-sm font-semibold mb-2 ${secretarias.length > 0 ? 'text-green-900' : 'text-blue-900'}`}>
                  {secretarias.length > 0 ? 'Vinculado' : 'Aguardando Vinculação'}
                </p>
                <p className={`text-xs ${secretarias.length > 0 ? 'text-green-700' : 'text-blue-700'}`}>
                  {secretarias.length > 0 ? 'Sua solicitação está aprovada' : 'Sua solicitação está pendente de aprovação'}
                </p>
              </div>

              {/* Perfil Pessoal */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span>👥</span> Perfil
                </h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 font-semibold">CPF</p>
                    <p className="text-gray-900">-</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-semibold">TELEFONE</p>
                    <p className="text-gray-900">-</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Grid Secundária - 2 colunas */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {/* Secretárias */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span>📋</span> Suas Secretárias
                </h3>
                {secretarias.length > 0 ? (
                  <div className="space-y-3">
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
                          className={`p-4 rounded-lg border-2 transition ${
                            isAtual
                              ? "bg-orange-50 border-orange-400 cursor-default"
                              : "bg-white border-gray-200 hover:border-orange-300 cursor-pointer"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className={`font-bold ${isAtual ? "text-orange-700" : "text-gray-900"}`}>
                                {secretaria.nome}
                              </h4>
                              {isAtual && <p className="text-xs text-orange-600 mt-1">✓ Secretária atual</p>}
                            </div>
                            <span className="text-2xl">{isAtual ? "⭐" : "🏢"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-center">
                    <p className="text-4xl mb-2">🔗</p>
                    <p className="text-gray-600 font-medium mb-1">Ainda não vinculado</p>
                    <p className="text-xs text-gray-500">Aguarde aprovação de um administrador</p>
                  </div>
                )}
              </div>

              {/* Atividades */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span>📊</span> Atividades Recentes
                </h3>
                <div className="bg-white rounded-lg p-6 border border-gray-200 text-center">
                  <p className="text-gray-500 py-8">Nenhuma atividade registrada</p>
                </div>
              </div>
            </div>

            {/* Grid Terciária - 2 colunas */}
            <div className="grid grid-cols-2 gap-6">
              {/* Comunicados */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span>📢</span> Comunicados
                </h3>
                <div className="bg-white rounded-lg p-6 border border-gray-200 text-center">
                  <p className="text-gray-500 py-8">Nenhum comunicado no momento</p>
                </div>
              </div>

              {/* Requisições */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span>📝</span> Requisições Pendentes
                </h3>
                <div className="bg-white rounded-lg p-6 border border-gray-200 text-center">
                  <p className="text-gray-500 py-8">Nenhuma requisição pendente</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Alterar Senha */}
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Senha Atual</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Nova Senha</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Confirmar Nova Senha</label>
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

      {/* Modal Alterar Email */}
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Atual</label>
                <input
                  type="email"
                  value={session?.email}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Novo Email</label>
                <input
                  type="email"
                  value={novoEmail}
                  onChange={(e) => setNovoEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
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
  );
}

export default function MinhaContaPage() {
  return (
    <ProtectedRoute>
      <MinhaContaContent />
    </ProtectedRoute>
  );
}
