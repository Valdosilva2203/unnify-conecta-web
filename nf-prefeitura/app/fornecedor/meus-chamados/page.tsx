"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import FornecedorSidebar from "@/app/components/FornecedorSidebar";
import LoadingSpinner from "@/app/components/LoadingSpinner";

interface SessionData {
  id: string;
  email: string;
  nome: string;
  prefeitura_id: string;
}

interface Chamado {
  id: string;
  titulo: string;
  descricao: string;
  status: string;
  prioridade: string;
  created_at: string;
  criador_nome?: string;
  secretarias?: { nome: string };
}

export default function MeusChamados() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuAberto, setMenuAberto] = useState(true);
  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    verificarSessao();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuAbertoId(null);
      }
    };

    if (menuAbertoId) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [menuAbertoId]);

  const verificarSessao = async () => {
    try {
      const sessionStr = localStorage.getItem("fornecedor_session");
      if (!sessionStr) {
        router.push("/login");
        return;
      }

      const sessionData: SessionData = JSON.parse(sessionStr);
      setSession(sessionData);

      const response = await fetch(
        `/api/fornecedor/meus-chamados?fornecedor_id=${sessionData.id}&prefeitura_id=${sessionData.prefeitura_id}`
      );

      const json = await response.json();
      setChamados(json?.chamados || []);
    } catch (error) {
      console.error("Erro ao buscar chamados:", error);
    } finally {
      setLoading(false);
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
        currentPage="meus-chamados"
      />

      <main className="flex-1 overflow-auto">
        <div className="p-8 w-full">
          <h1 className="text-4xl font-bold text-gray-900 mb-8">🎫 Meus Chamados</h1>

          {chamados.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">Nenhum chamado encontrado</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-blue-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-bold text-blue-600">CHAMADO</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-blue-600">DESCRIÇÃO</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-blue-600">PRIORIDADE</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-blue-600">STATUS</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-blue-600">CRIADOR</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-blue-600">VINCULADO A</th>
                    <th className="px-6 py-4 text-right text-sm font-bold text-blue-600">AÇÕES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {chamados.map((chamado) => (
                    <tr key={chamado.id} className="hover:bg-blue-50 transition cursor-pointer" onClick={() => router.push(`/fornecedor/meus-chamados/${chamado.id}`)}>
                      <td className="px-6 py-4">
                        <span className="font-bold text-gray-900">{chamado.titulo}</span>
                      </td>
                      <td className="px-6 py-4 text-gray-700 line-clamp-2">{chamado.descricao}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          chamado.prioridade === "urgente"
                            ? "bg-red-50 text-red-700"
                            : chamado.prioridade === "normal"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}>
                          {chamado.prioridade === "urgente" ? "🔴 Urgente" : chamado.prioridade === "normal" ? "🟠 Normal" : "🟢 Baixa"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          chamado.status === "pendente"
                            ? "bg-orange-100 text-orange-700"
                            : chamado.status === "em_andamento"
                            ? "bg-blue-100 text-blue-700"
                            : chamado.status === "finalizada"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                        }`}>
                          {chamado.status === "em_andamento" ? "Em Andamento" : chamado.status === "finalizada" ? "Finalizada" : chamado.status === "pendente" ? "Pendente" : chamado.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                        {chamado.criador_nome || "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                          {chamado.secretarias?.nome || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            setMenuPos({
                              top: rect.bottom + 8,
                              left: rect.left - 180
                            });
                            setMenuAbertoId(menuAbertoId === chamado.id ? null : chamado.id);
                          }}
                          className="p-2 rounded-full hover:bg-gray-200 text-gray-600 font-bold text-lg"
                        >
                          ⋮
                        </button>
                        {menuAbertoId === chamado.id && menuPos && (
                          <div
                            ref={menuRef}
                            className="fixed bg-white border-2 border-gray-200 rounded-lg shadow-2xl z-[9999] w-56"
                            style={{
                              top: `${menuPos.top}px`,
                              left: `${menuPos.left}px`
                            }}
                          >
                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                              <p className="text-sm font-bold text-gray-800">AÇÕES</p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/fornecedor/meus-chamados/${chamado.id}`);
                                setMenuAbertoId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100"
                            >
                              👁️ Visualizar Detalhes
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`/fornecedor/meus-chamados/${chamado.id}`, "_blank");
                                setMenuAbertoId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg"
                            >
                              📤 Abrir em Nova Aba
                            </button>
                          </div>
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
