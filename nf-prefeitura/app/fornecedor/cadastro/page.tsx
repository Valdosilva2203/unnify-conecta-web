"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface FornecedorData {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  especialidades?: string[];
}

interface PrefeituraData {
  id: string;
  nome: string;
  estado: string;
}

export default function CadastroContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const fornecedorId = searchParams.get("fornecedor_id");
  const prefeituraId = searchParams.get("prefeitura_id");
  const token = searchParams.get("token");

  const [fornecedor, setFornecedor] = useState<FornecedorData | null>(null);
  const [prefeitura, setPrefeitura] = useState<PrefeituraData | null>(null);
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    loadDados();
  }, []);

  const loadDados = async () => {
    try {
      if (!fornecedorId || !prefeituraId || !token) {
        setErro("Link inválido ou expirado");
        setLoading(false);
        return;
      }

      // TODO: Verificar token e carregar dados
      const { data: fornecedorData } = await supabase
        .from("fornecedores")
        .select("*")
        .eq("id", fornecedorId)
        .single();

      if (fornecedorData) {
        setFornecedor(fornecedorData);
      }

      const { data: prefeituraData } = await supabase
        .from("prefeituras")
        .select("id, nome, estado")
        .eq("id", prefeituraId)
        .single();

      if (prefeituraData) {
        setPrefeitura(prefeituraData);
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      setErro("Erro ao carregar dados de cadastro");
    } finally {
      setLoading(false);
    }
  };

  const hashSenha = async (senhaText: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(senhaText);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const handleCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);

    try {
      if (!senha || !confirmarSenha) {
        setErro("Preencha todos os campos");
        setSalvando(false);
        return;
      }

      if (senha !== confirmarSenha) {
        setErro("As senhas não coincidem");
        setSalvando(false);
        return;
      }

      if (senha.length < 6) {
        setErro("Senha deve ter no mínimo 6 caracteres");
        setSalvando(false);
        return;
      }

      const senhaHash = await hashSenha(senha);

      // Verificar se já existe credencial para este fornecedor
      const { data: existingCred } = await supabase
        .from("fornecedor_credenciais")
        .select("id")
        .eq("fornecedor_id", fornecedorId)
        .single();

      if (!existingCred) {
        // Inserir credenciais do fornecedor
        const { error: credError } = await supabase
          .from("fornecedor_credenciais")
          .insert([
            {
              fornecedor_id: fornecedorId,
              email: fornecedor?.email,
              senha_hash: senhaHash,
              status: "ativo",
            },
          ]);

        if (credError) {
          setErro("Erro ao salvar credenciais");
          setSalvando(false);
          return;
        }
      } else {
        // Atualizar senha se já existir
        const { error: updateError } = await supabase
          .from("fornecedor_credenciais")
          .update({ senha_hash: senhaHash })
          .eq("fornecedor_id", fornecedorId);

        if (updateError) {
          setErro("Erro ao atualizar credenciais");
          setSalvando(false);
          return;
        }
      }

      // Vincular fornecedor à prefeitura
      const { error: prefError } = await supabase
        .from("fornecedor_prefeituras")
        .upsert(
          [
            {
              fornecedor_id: fornecedorId,
              prefeitura_id: prefeituraId,
              status: "ativo",
            },
          ],
          { onConflict: "fornecedor_id,prefeitura_id" }
        );

      if (prefError && !prefError.message.includes("duplicate")) {
        setErro("Erro ao vincular à prefeitura");
        setSalvando(false);
        return;
      }

      // Criar sessão do fornecedor automaticamente
      const sessionData = {
        id: fornecedorId,
        email: fornecedor?.email,
        nome: fornecedor?.nome,
        prefeitura_id: prefeituraId,
        tipo: "fornecedor",
      };

      localStorage.setItem("fornecedor_session", JSON.stringify(sessionData));

      // Redirecionar para dashboard ou seleção de prefeituras
      // Se tem apenas 1 prefeitura, vai direto ao dashboard
      // Se tem mais, vai para a página de seleção
      router.push("/fornecedor/prefeituras");
    } catch (error: any) {
      console.error("Erro ao cadastrar:", error);
      setErro(error?.message || "Erro ao realizar cadastro");
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">⏳</div>
          <p className="text-white text-lg font-medium">Carregando dados...</p>
        </div>
      </div>
    );
  }

  if (erro && !fornecedor) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <p className="text-6xl mb-4">❌</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Link Inválido</h1>
          <p className="text-gray-600 mb-6">{erro}</p>
          <a
            href="/login"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition"
          >
            Voltar ao Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center mb-8">
          <div className="text-5xl font-bold text-blue-600 mb-2">📦</div>
          <h1 className="text-3xl font-bold text-gray-900">Cadastro</h1>
          <p className="text-gray-600 mt-2">{fornecedor?.nome}</p>
        </div>

        {/* Informações do Fornecedor */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="mb-3">
            <p className="text-sm text-gray-600">Email</p>
            <p className="text-gray-900 font-medium">{fornecedor?.email}</p>
          </div>
          <div className="mb-3">
            <p className="text-sm text-gray-600">Prefeitura</p>
            <p className="text-gray-900 font-medium">{prefeitura?.nome} - {prefeitura?.estado}</p>
          </div>
          {fornecedor?.especialidades && fornecedor.especialidades.length > 0 && (
            <div>
              <p className="text-sm text-gray-600 mb-2">Especialidades</p>
              <div className="flex flex-wrap gap-1">
                {fornecedor.especialidades.map((esp, idx) => (
                  <span
                    key={idx}
                    className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium"
                  >
                    {esp}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {erro}
          </div>
        )}

        <form onSubmit={handleCadastro} className="space-y-4">
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirmar Senha
            </label>
            <input
              type={mostrarSenha ? "text" : "password"}
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={salvando}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
          >
            {salvando ? "Cadastrando..." : "Concluir Cadastro"}
          </button>
        </form>
      </div>
    </div>
  );
}
