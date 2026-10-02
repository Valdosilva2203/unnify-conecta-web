"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function FornecedorLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const hashSenha = async (senhaText: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(senhaText);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErro("");

    try {
      const emailTrimmed = email.trim().toLowerCase();
      const senhaTrimmed = senha.trim();

      if (!emailTrimmed || !senhaTrimmed) {
        setErro("Preencha todos os campos");
        setLoading(false);
        return;
      }

      const senhaHash = await hashSenha(senhaTrimmed);

      // Buscar credenciais do fornecedor
      const { data: credenciais, error: credError } = await supabase
        .from("fornecedor_credenciais")
        .select("fornecedor_id, email, senha_hash, status")
        .eq("email", emailTrimmed)
        .single();

      if (credError || !credenciais) {
        setErro("Email ou senha inválidos");
        setLoading(false);
        return;
      }

      if (senhaHash !== credenciais.senha_hash) {
        setErro("Email ou senha inválidos");
        setLoading(false);
        return;
      }

      if (credenciais.status !== "ativo") {
        setErro("Acesso desativado");
        setLoading(false);
        return;
      }

      // Buscar informações do fornecedor
      const { data: fornecedor } = await supabase
        .from("fornecedores")
        .select("id, nome, email")
        .eq("id", credenciais.fornecedor_id)
        .single();

      if (!fornecedor) {
        setErro("Fornecedor não encontrado");
        setLoading(false);
        return;
      }

      // Criar sessão do fornecedor (prefeitura_id será preenchida depois)
      const sessionData = {
        id: fornecedor.id,
        email: fornecedor.email,
        nome: fornecedor.nome,
        prefeitura_id: "",
        tipo: "fornecedor",
      };

      console.log("🔐 FORNECEDOR LOGIN");

      // Buscar quantas prefeituras este fornecedor tem acesso
      const { data: prefeituraData } = await supabase
        .from("fornecedor_prefeituras")
        .select("prefeitura_id", { count: "exact" })
        .eq("fornecedor_id", fornecedor.id)
        .eq("status", "ativo");

      localStorage.setItem("fornecedor_session", JSON.stringify(sessionData));

      // Se tem apenas 1 prefeitura, vir direto para o dashboard com ela
      // Se tem mais, ir para a página de seleção
      if (prefeituraData && prefeituraData.length === 1) {
        const updatedSession = {
          ...sessionData,
          prefeitura_id: prefeituraData[0].prefeitura_id,
        };
        localStorage.setItem("fornecedor_session", JSON.stringify(updatedSession));
        router.push("/fornecedor/dashboard");
      } else if (prefeituraData && prefeituraData.length > 1) {
        router.push("/fornecedor/prefeituras");
      } else {
        setErro("Nenhuma prefeitura vinculada");
        setLoading(false);
        return;
      }
    } catch (error: any) {
      console.error("Erro ao fazer login:", error);
      setErro(error?.message || "Erro ao processar login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="seu@email.com"
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
              className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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

        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
