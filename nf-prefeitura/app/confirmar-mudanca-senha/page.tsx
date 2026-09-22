"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function ConfirmarMudancaContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(true);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setMensagem({ tipo: "erro", texto: "Token não fornecido" });
      setLoading(false);
      return;
    }

    const confirmarMudanca = async () => {
      try {
        const res = await fetch(`/api/confirmar-mudanca-senha?token=${token}`);
        const data = await res.json();

        if (res.ok) {
          setMensagem({ tipo: "sucesso", texto: "Senha alterada com sucesso!" });
          setTimeout(() => {
            router.push("/login");
          }, 2000);
        } else {
          setMensagem({ tipo: "erro", texto: data.error || "Erro ao confirmar mudança" });
        }
      } catch (error) {
        setMensagem({ tipo: "erro", texto: "Erro ao conectar com servidor" });
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    confirmarMudanca();
  }, [token, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-600 to-orange-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center mb-8">
          <div className="text-5xl font-bold text-orange-600 mb-2">🔐</div>
          <h1 className="text-3xl font-bold text-gray-900">Confirmar Mudança</h1>
          <p className="text-gray-600 mt-2">Alteração de Senha</p>
        </div>

        {loading ? (
          <div className="text-center">
            <div className="inline-block animate-spin">
              <div className="h-8 w-8 border-4 border-orange-600 border-t-transparent rounded-full"></div>
            </div>
            <p className="text-gray-600 mt-4">Processando...</p>
          </div>
        ) : mensagem ? (
          <div
            className={`p-4 rounded-lg text-center ${
              mensagem.tipo === "sucesso"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            <p className="font-medium">{mensagem.texto}</p>
            {mensagem.tipo === "sucesso" && (
              <p className="text-sm mt-2">Redirecionando para login...</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConfirmarMudancaSenhaPageLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-600 to-orange-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center mb-8">
          <div className="text-5xl font-bold text-orange-600 mb-2">🔐</div>
          <h1 className="text-3xl font-bold text-gray-900">Confirmar Mudança</h1>
          <p className="text-gray-600 mt-2">Alteração de Senha</p>
        </div>
        <div className="text-center">
          <div className="inline-block animate-spin">
            <div className="h-8 w-8 border-4 border-orange-600 border-t-transparent rounded-full"></div>
          </div>
          <p className="text-gray-600 mt-4">Processando...</p>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmarMudancaSenhaPage() {
  return (
    <Suspense fallback={<ConfirmarMudancaSenhaPageLoading />}>
      <ConfirmarMudancaContent />
    </Suspense>
  );
}
