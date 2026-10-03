"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import FornecedorSidebar from "@/app/components/FornecedorSidebar";
import LoadingSpinner from "@/app/components/LoadingSpinner";

interface SessionData {
  id: string;
  email: string;
  nome: string;
  prefeitura_id: string;
}

interface NotaFiscal {
  id: string;
  numero: string;
  arquivo: string;
  created_at: string;
  requisicao_id: string;
  numero_requisicao: string;
  titulo: string;
  fornecedor_id: string;
}

export default function FornecedorNotasFiscais() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [notasFiscais, setNotasFiscais] = useState<NotaFiscal[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuAberto, setMenuAberto] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [baixando, setBaixando] = useState<string | null>(null);

  useEffect(() => {
    verificarSessao();
  }, []);

  const verificarSessao = async () => {
    try {
      const sessionStr = localStorage.getItem("fornecedor_session");
      if (!sessionStr) {
        router.push("/login");
        return;
      }

      const sessionData: SessionData = JSON.parse(sessionStr);
      setSession(sessionData);

      // Buscar notas fiscais do fornecedor
      const response = await fetch(
        `/api/fornecedor/notas-fiscais?fornecedor_id=${sessionData.id}&prefeitura_id=${sessionData.prefeitura_id}`
      );

      const json = await response.json();

      if (!response.ok) {
        console.error("Erro na API:", response.status, json);
        throw new Error(json?.error || `Erro ${response.status}`);
      }

      setNotasFiscais(json?.notasFiscais || []);
    } catch (error) {
      console.error("Erro ao buscar notas fiscais:", error);
    } finally {
      setLoading(false);
    }
  };

  const notasFiscaisFiltradas = notasFiscais.filter((nf) =>
    nf.numero_requisicao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    nf.numero?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const baixarNotaFiscal = async (notaFiscalId: string, requisicaoId: string) => {
    try {
      setBaixando(notaFiscalId);
      const response = await fetch("/api/fornecedor/download-nota-fiscal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requisicaoId })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao gerar URL");
      }

      const data = await response.json();
      window.open(data.url, "_blank");
    } catch (error) {
      console.error("Erro ao baixar:", error);
      alert("Erro ao baixar nota fiscal");
    } finally {
      setBaixando(null);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <FornecedorSidebar
        menuAberto={menuAberto}
        onToggleMenu={() => setMenuAberto(!menuAberto)}
        currentPage="notas-fiscais"
        prefeituraId={session?.prefeitura_id}
      />

      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">📄 Notas Fiscais</h1>
              <p className="text-gray-600 mt-2">Histórico de todas as notas fiscais enviadas</p>
            </div>
          </div>

          <div className="mb-6">
            <input
              type="text"
              placeholder="Buscar por requisição ou número da nota..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {notasFiscaisFiltradas.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">Nenhuma nota fiscal encontrada</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Requisição</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Nota Nº</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Data</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {notasFiscaisFiltradas.map((nf) => (
                    <tr key={nf.id} className="border-b border-gray-200 hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <button
                          onClick={() =>
                            window.open(
                              `/fornecedor/requisicoes?req=${nf.requisicao_id}`,
                              "_blank"
                            )
                          }
                          className="text-blue-600 hover:underline font-medium cursor-pointer"
                        >
                          {nf.numero_requisicao}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-gray-900 font-medium">{nf.numero}</td>
                      <td className="px-6 py-4 text-gray-600">
                        {new Date(nf.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => baixarNotaFiscal(nf.id, nf.requisicao_id)}
                          disabled={baixando === nf.id}
                          className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-medium rounded-full transition cursor-pointer disabled:opacity-50"
                          title="Baixar nota fiscal"
                        >
                          {baixando === nf.id ? "⏳ Preparando..." : "📥 Baixar nota"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
