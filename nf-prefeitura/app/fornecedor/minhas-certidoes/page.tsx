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

interface Certidao {
  id: string;
  tipo: string;
  data_emissao: string;
  data_vencimento: string;
  status: string;
  arquivo_url?: string;
  requisicao_numero?: string;
}

export default function MinhasCertidoes() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [certidoes, setCertidoes] = useState<Certidao[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuAberto, setMenuAberto] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

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

      // Buscar certidões do fornecedor
      const response = await fetch(
        `/api/fornecedor/minhas-certidoes?fornecedor_id=${sessionData.id}&prefeitura_id=${sessionData.prefeitura_id}`
      );

      const json = await response.json();

      if (!response.ok) {
        console.error("Erro na API:", response.status, json);
        throw new Error(json?.error || `Erro ${response.status}`);
      }

      setCertidoes(json?.certidoes || []);
    } catch (error) {
      console.error("Erro ao buscar certidões:", error);
    } finally {
      setLoading(false);
    }
  };

  const certidoesFiltradas = certidoes.filter((cert) =>
    cert.tipo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cert.requisicao_numero?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "vigente":
        return "bg-green-100 text-green-700";
      case "vencida":
        return "bg-red-100 text-red-700";
      case "proxima_vencer":
        return "bg-yellow-100 text-yellow-700";
      default:
        return "bg-gray-100 text-gray-700";
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
        currentPage="minhas-certidoes"
        prefeituraId={session?.prefeitura_id}
      />

      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">📋✓ Minhas Certidões</h1>
              <p className="text-gray-600 mt-2">Histórico de certidões e documentos comprobatórios</p>
            </div>
          </div>

          <div className="mb-6">
            <input
              type="text"
              placeholder="Buscar por tipo ou requisição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {certidoesFiltradas.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">Nenhuma certidão encontrada</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Data Emissão</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Vencimento</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {certidoesFiltradas.map((cert) => (
                    <tr key={cert.id} className="border-b border-gray-200 hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-gray-900 font-medium">{cert.tipo}</td>
                      <td className="px-6 py-4 text-gray-600">
                        {new Date(cert.data_emissao).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {new Date(cert.data_vencimento).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                            cert.status
                          )}`}
                        >
                          {cert.status === "vigente"
                            ? "✅ Vigente"
                            : cert.status === "vencida"
                            ? "❌ Vencida"
                            : cert.status === "proxima_vencer"
                            ? "⚠️ Próximo Vencimento"
                            : cert.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {cert.arquivo_url && (
                          <a
                            href={cert.arquivo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-medium rounded-full transition cursor-pointer"
                            title="Baixar certidão"
                          >
                            📥 Baixar
                          </a>
                        )}
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
