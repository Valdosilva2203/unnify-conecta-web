"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LoadingSpinner from "@/app/components/LoadingSpinner";
import FornecedorSidebar from "@/app/components/FornecedorSidebar";

interface SessionData {
  id: string;
  email: string;
  nome: string;
  tipo: string;
}

interface PrefeituraData {
  id: string;
  nome: string;
  estado: string;
}

export default function FornecedorPrefeiturasPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [prefeituras, setPrefeituras] = useState<PrefeituraData[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuAberto, setMenuAberto] = useState(true);

  useEffect(() => {
    verificarSessaoECarregarPrefeituras();
  }, []);

  const verificarSessaoECarregarPrefeituras = async () => {
    try {
      const sessionStr = localStorage.getItem("fornecedor_session");
      if (!sessionStr) {
        router.push("/login");
        return;
      }

      const sessionData: SessionData = JSON.parse(sessionStr);
      setSession(sessionData);

      const { data: fornecedorPrefeituras } = await supabase
        .from("fornecedor_prefeituras")
        .select("prefeitura_id")
        .eq("fornecedor_id", sessionData.id)
        .eq("status", "ativo");

      if (fornecedorPrefeituras && fornecedorPrefeituras.length > 0) {
        const prefeituraIds = fornecedorPrefeituras.map((fp) => fp.prefeitura_id);

        const { data: prefData } = await supabase
          .from("prefeituras")
          .select("id, nome, estado")
          .in("id", prefeituraIds);

        if (prefData) {
          setPrefeituras(prefData);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar prefeituras:", error);
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPrefeitura = (prefeituraId: string) => {
    if (session) {
      const updatedSession = {
        ...session,
        prefeitura_id: prefeituraId,
      };
      localStorage.setItem("fornecedor_session", JSON.stringify(updatedSession));
      router.push("/fornecedor/dashboard");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("fornecedor_session");
    router.push("/login");
  };

  if (loading) {
    return <LoadingSpinner message="Carregando prefeituras..." />;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <FornecedorSidebar
        menuAberto={menuAberto}
        onToggleMenu={() => setMenuAberto(!menuAberto)}
        currentPage="prefeituras"
        onLogout={handleLogout}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="bg-white shadow px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Selecione uma Prefeitura</h1>
            <p className="text-gray-600 mt-1">Bem-vindo, {session?.nome}!</p>
          </div>
          <button
            onClick={() => setMenuAberto(!menuAberto)}
            className="text-2xl hover:bg-gray-100 p-2 rounded-lg transition"
          >
            ☰
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-8">
          {prefeituras.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-gray-500 text-xl mb-4">Você não tem acesso a nenhuma prefeitura</p>
                <button
                  onClick={handleLogout}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition"
                >
                  Sair
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
              {prefeituras.map((pref, idx) => {
                const cores = [
                  { border: "border-cyan-300", hover: "hover:border-cyan-500", text: "text-cyan-600", bg: "hover:bg-cyan-50" },
                  { border: "border-rose-300", hover: "hover:border-rose-500", text: "text-rose-600", bg: "hover:bg-rose-50" },
                  { border: "border-purple-300", hover: "hover:border-purple-500", text: "text-purple-600", bg: "hover:bg-purple-50" },
                  { border: "border-blue-300", hover: "hover:border-blue-500", text: "text-blue-600", bg: "hover:bg-blue-50" },
                ];
                const corAtual = cores[idx % cores.length];

                return (
                  <button
                    key={pref.id}
                    onClick={() => handleSelectPrefeitura(pref.id)}
                    className={`bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-8 text-left group border-2 ${corAtual.border} ${corAtual.hover} ${corAtual.bg}`}
                  >
                    <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">
                      🏢
                    </div>
                    <h2 className={`text-2xl font-bold text-gray-900 mb-2 group-hover:${corAtual.text} transition`}>
                      {pref.nome}
                    </h2>
                    <p className="text-gray-600 text-lg font-medium">{pref.estado}</p>
                    <div className="mt-6 pt-6 border-t">
                      <p className={`text-sm ${corAtual.text} font-semibold group-hover:opacity-80`}>
                        Clique para acessar →
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
