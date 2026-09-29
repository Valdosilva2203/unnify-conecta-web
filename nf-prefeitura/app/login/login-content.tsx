"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [verificando, setVerificando] = useState(true);

  const isCnpj = (valor: string): boolean => {
    return /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^\d{14}$/.test(valor.trim());
  };

  const isEmail = (valor: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());
  };

  const hashSenha = async (senhaText: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(senhaText);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  useEffect(() => {
    const fornecedorSession = localStorage.getItem("fornecedor_session");
    if (fornecedorSession) {
      try {
        router.push(`/fornecedor/dashboard`);
      } catch (error) {
        console.error("Erro ao verificar sessão:", error);
        setVerificando(false);
      }
    } else {
      const prefeituraSession = localStorage.getItem("prefeitura_session");
      if (prefeituraSession) {
        try {
          const session = JSON.parse(prefeituraSession);
          router.push(`/prefeituras/${session.prefeitura_id}`);
        } catch (error) {
          console.error("Erro ao verificar sessão:", error);
          setVerificando(false);
        }
      } else {
        setVerificando(false);
      }
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErro("");

    try {
      const loginTrimmed = login.trim();
      const senhaTrimmed = senha.trim();

      if (!loginTrimmed || !senhaTrimmed) {
        setErro("Preencha todos os campos");
        setLoading(false);
        return;
      }

      const senhaHash = await hashSenha(senhaTrimmed);

      // Login de Fornecedor (detectado por email)
      if (isEmail(loginTrimmed)) {
        const emailTrimmed = loginTrimmed.toLowerCase();

        const { data: credenciais, error: credError } = await supabase
          .from("fornecedor_credenciais")
          .select("*, fornecedores(*)")
          .eq("email", emailTrimmed)
          .single();

        if (credenciais && !credError) {
          if (senhaHash !== credenciais.senha_hash) {
            setErro("Email ou senha inválidos");
            setLoading(false);
            return;
          }

          if (credenciais.status !== "ativo") {
            setErro("Usuário inativo");
            setLoading(false);
            return;
          }

          const fornecedor = credenciais.fornecedores;
          const sessionData = {
            id: fornecedor.id,
            cnpj: fornecedor.cnpj_cpf,
            nome: fornecedor.nome,
            email: fornecedor.email,
            tipo: "fornecedor",
            credencial_id: credenciais.id,
            prefeitura_id: fornecedor.prefeitura_id,
          };

          console.log("🔐 FORNECEDOR LOGIN");
          console.log("📛 Nome:", fornecedor.nome);
          console.log("🏢 CNPJ:", fornecedor.cnpj_cpf);
          localStorage.removeItem("prefeitura_session");
          localStorage.setItem("fornecedor_session", JSON.stringify(sessionData));

          router.push(`/fornecedor/dashboard`);
          return;
        }

        // Se não for fornecedor, tenta como prefeitura
        const { data: admin, error: adminError } = await supabase
          .from("prefeitura_users")
          .select("*")
          .eq("email", emailTrimmed)
          .single();

        if (admin && !adminError) {
          if (senhaHash !== admin.senha) {
            setErro("Email ou senha inválidos");
            setLoading(false);
            return;
          }

          if (admin.status !== "ativo") {
            setErro("Usuário inativo");
            setLoading(false);
            return;
          }

          const sessionData = {
            id: admin.id,
            email: admin.email,
            nome: admin.nome,
            prefeitura_id: admin.prefeitura_id,
            role: admin.role,
            tipo: "admin",
            secretaria_id: admin.secretaria_id || null,
          };

          console.log("🔐 Admin login - sessionData:", sessionData);
          localStorage.removeItem("fornecedor_session");
          localStorage.setItem("prefeitura_session", JSON.stringify(sessionData));

          if (redirect) {
            router.push(redirect);
          } else {
            router.push(`/prefeituras/${admin.prefeitura_id}`);
          }
          return;
        }

        const { data: funcionario, error: funcError } = await supabase
          .from("funcionarios")
          .select("*")
          .eq("email", emailTrimmed)
          .single();

        if (funcionario && !funcError) {
          if (senhaHash !== funcionario.senha) {
            setErro("Email ou senha inválidos");
            setLoading(false);
            return;
          }

          let secretariaId = funcionario.secretaria_id;

          if (!secretariaId) {
            const { data: secretarias, error: secError } = await supabase
              .from("funcionario_secretarias")
              .select("secretaria_id")
              .eq("funcionario_id", funcionario.id)
              .limit(1)
              .single();

            if (secretarias && !secError) {
              secretariaId = secretarias.secretaria_id;
            }
          }

          const sessionData = {
            id: funcionario.id,
            email: funcionario.email,
            nome: funcionario.nome,
            prefeitura_id: funcionario.prefeitura_id,
            cargo: funcionario.cargo,
            tipo: "funcionario",
            secretaria_id: secretariaId || null,
          };

          console.log("🔐 FUNCIONÁRIO LOGIN");
          console.log("📛 Nome:", funcionario.nome);
          localStorage.removeItem("fornecedor_session");
          localStorage.setItem("prefeitura_session", JSON.stringify(sessionData));

          if (redirect) {
            router.push(redirect);
            return;
          }

          let redirectUrl = ``;
          if (secretariaId) {
            redirectUrl = `/secretaria/${secretariaId}`;
          }

          if (redirectUrl) {
            router.push(redirectUrl);
          } else {
            router.push(`/minha-conta`);
          }
          return;
        }

        setErro("Email ou senha inválidos");
        return;
      }

      // Se não for email, retorna erro
      setErro("Email ou CNPJ inválido");
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      setErro("Erro ao processar login");
    } finally {
      setLoading(false);
    }
  };

  if (verificando) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-600 to-orange-700 flex items-center justify-center">
        <p className="text-white text-lg">Verificando sessão...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-600 to-orange-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center mb-8">
          <div className="text-5xl font-bold text-orange-600 mb-2">📦</div>
          <h1 className="text-3xl font-bold text-gray-900">Unnify</h1>
          <p className="text-gray-600 mt-2">Login</p>
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {erro}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email ou CNPJ
            </label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900 placeholder-gray-500"
              placeholder="seu@email.com ou 00.000.000/0000-00"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Senha
            </label>
            <div className="relative">
              <input
                type={mostrarSenha ? "text" : "password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900 placeholder-gray-500"
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

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="text-center mt-6">
          <a
            href="/recuperar-senha"
            className="text-teal-600 hover:text-teal-700 font-medium text-sm transition"
          >
            Esqueci minha senha
          </a>
        </div>
      </div>
    </div>
  );
}
