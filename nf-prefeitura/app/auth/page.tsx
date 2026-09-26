"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cadastroAdmin, loginAdmin, adminJaExiste } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function AuthPage() {
  const router = useRouter();
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [existeAdmin, setExisteAdmin] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [isMasterUser, setIsMasterUser] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmarSenha, setMostrarConfirmarSenha] = useState(false);
  const [emailValido, setEmailValido] = useState(false);
  const [verificandoEmail, setVerificandoEmail] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    nome: "",
    senha: "",
    confirmarSenha: "",
  });

  useEffect(() => {
    const verificarAdmin = async () => {
      const existe = await adminJaExiste();
      setExisteAdmin(existe);
      setCarregando(false);
    };
    verificarAdmin();
  }, []);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErro("");

    // Se é mudança no email E é LOGIN (não signup), verificar se é admin
    if (name === "email" && value.trim() && !isSignup) {
      setVerificandoEmail(true);
      try {
        // Tentar login para verificar se é admin
        const { data: admin } = await supabase
          .from("admins")
          .select("id")
          .eq("email", value.toLowerCase().trim())
          .single();

        if (admin) {
          setEmailValido(true);
        } else {
          // Email não é admin, redirecionar para login
          setEmailValido(false);
          setTimeout(() => {
            router.push("/login");
          }, 500);
        }
      } catch (error) {
        // Email não encontrado como admin, redirecionar para login
        setEmailValido(false);
        setTimeout(() => {
          router.push("/login");
        }, 500);
      } finally {
        setVerificandoEmail(false);
      }
    } else if (name === "email" && value.trim() && isSignup) {
      // Em signup, apenas validar o email
      setEmailValido(true);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErro("");

    try {
      if (isSignup) {
        // Validações
        if (!formData.email || !formData.nome || !formData.senha) {
          setErro("Preencha todos os campos");
          setLoading(false);
          return;
        }

        if (formData.senha.length < 6) {
          setErro("Senha deve ter no mínimo 6 caracteres");
          setLoading(false);
          return;
        }

        if (formData.senha !== formData.confirmarSenha) {
          setErro("As senhas não conferem");
          setLoading(false);
          return;
        }

        const resultado = await cadastroAdmin(
          formData.email,
          formData.nome,
          formData.senha
        );

        if (!resultado.sucesso) {
          setErro(resultado.erro || "Erro ao cadastrar");
          setLoading(false);
          return;
        }

        // Marcar que admin foi criado
        setExisteAdmin(true);
        router.push("/");
      } else {
        // Login via API com rate limiting
        if (!formData.email || !formData.senha) {
          setErro("Preencha email e senha");
          setLoading(false);
          return;
        }

        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: formData.email,
            senha: formData.senha,
          }),
        });

        const resultado = await response.json();

        if (!resultado.sucesso) {
          setErro(resultado.erro);
          setLoading(false);
          return;
        }

        // Salvar sessão no localStorage
        if (resultado.admin) {
          localStorage.setItem(
            "admin_session",
            JSON.stringify({
              id: resultado.admin.id,
              email: resultado.admin.email,
              nome: resultado.admin.nome,
            })
          );
        }

        router.push("/");
      }
    } catch (error) {
      setErro("Erro ao processar requisição");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-600 to-orange-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center mb-8">
          <div className="text-5xl font-bold text-orange-600 mb-2">📦</div>
          <h1 className="text-3xl font-bold text-gray-900">Unnify</h1>
          <p className="text-gray-600 mt-2">
            {carregando
              ? "Carregando..."
              : isSignup
              ? "Criar conta de acesso"
              : "Login"}
          </p>
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {erro}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="seu@email.com"
              required
            />
            {verificandoEmail && (
              <p className="text-sm text-gray-500 mt-2">Verificando...</p>
            )}
          </div>

          {(emailValido || (isSignup && !existeAdmin)) && (
            <>
              {isSignup && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome
                  </label>
                  <input
                    type="text"
                    name="nome"
                    value={formData.nome}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Seu nome"
                    required
                  />
                </div>
              )}

              {isSignup && !existeAdmin && (
                <label className="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={isMasterUser}
                    onChange={(e) => setIsMasterUser(e.target.checked)}
                    className="w-5 h-5 text-orange-600 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    👨‍💼 Sou um usuário Master
                  </span>
                </label>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Senha
                </label>
                <div className="relative">
                  <input
                    type={mostrarSenha ? "text" : "password"}
                    name="senha"
                    value={formData.senha}
                    onChange={handleChange}
                    className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha(!mostrarSenha)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 transition"
                  >
                    {mostrarSenha ? "👁️" : "👁️‍🗨️"}
                  </button>
                </div>
              </div>

              {isSignup && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirmar Senha
                  </label>
                  <div className="relative">
                    <input
                      type={mostrarConfirmarSenha ? "text" : "password"}
                      name="confirmarSenha"
                      value={formData.confirmarSenha}
                      onChange={handleChange}
                      className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarConfirmarSenha(!mostrarConfirmarSenha)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 transition"
                    >
                      {mostrarConfirmarSenha ? "👁️" : "👁️‍🗨️"}
                    </button>
                  </div>
                </div>
              )}

              {!isSignup && (
                <div className="text-right">
                  <Link
                    href="/recuperar-senha"
                    className="text-sm text-orange-600 hover:text-orange-700 font-medium"
                  >
                    Esqueceu a senha?
                  </Link>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || carregando}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
              >
                {loading
                  ? "Processando..."
                  : isSignup
                  ? "Cadastrar"
                  : "Entrar"}
              </button>
            </>
          )}
        </form>

        {!existeAdmin && (
          <div className="mt-6 text-center">
            <p className="text-gray-600 text-sm">
              {isSignup ? "Já tem conta? " : "Não tem conta? "}
              <button
                onClick={() => {
                  const novoIsSignup = !isSignup;
                  setIsSignup(novoIsSignup);
                  setErro("");
                  // Se entrando em signup e não há admin, mostrar formulário completo
                  if (novoIsSignup && !existeAdmin) {
                    setEmailValido(true);
                  } else {
                    setEmailValido(false);
                  }
                  setFormData({
                    email: "",
                    nome: "",
                    senha: "",
                    confirmarSenha: "",
                  });
                }}
                className="text-orange-600 hover:text-orange-700 font-medium"
              >
                {isSignup ? "Faça login" : "Crie uma conta"}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
