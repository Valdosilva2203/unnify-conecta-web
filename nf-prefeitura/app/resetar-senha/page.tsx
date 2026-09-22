"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetarSenhaPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);
  const [tokenValido, setTokenValido] = useState(true);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenValido(false);
      setMensagem({
        tipo: "erro",
        texto: "Token inválido ou não fornecido",
      });
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensagem(null);

    if (!novaSenha || !confirmarSenha) {
      setMensagem({
        tipo: "erro",
        texto: "Preencha todos os campos",
      });
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setMensagem({
        tipo: "erro",
        texto: "As senhas não coincidem",
      });
      return;
    }

    if (novaSenha.length < 6) {
      setMensagem({
        tipo: "erro",
        texto: "Senha deve ter no mínimo 6 caracteres",
      });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/resetar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          novaSenha,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMensagem({
          tipo: "sucesso",
          texto: "Senha resetada com sucesso! Redirecionando para login...",
        });
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      } else {
        setMensagem({
          tipo: "erro",
          texto: data.error || "Erro ao resetar senha",
        });
      }
    } catch (error) {
      setMensagem({
        tipo: "erro",
        texto: "Erro ao conectar com servidor",
      });
      console.error(error);
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
          <p className="text-gray-600 mt-2">Resetar Senha</p>
        </div>

        {!tokenValido ? (
          <>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-700 text-sm">
                ❌ Link inválido ou expirado. Por favor, solicite uma nova recuperação de senha.
              </p>
            </div>

            <Link
              href="/recuperar-senha"
              className="w-full block text-center bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg transition"
            >
              Solicitar Novo Link
            </Link>

            <div className="text-center mt-6">
              <Link
                href="/login"
                className="text-teal-600 hover:text-teal-700 font-medium text-sm transition"
              >
                Voltar ao login
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-gray-600 text-sm mb-6 text-center">
              Digite sua nova senha abaixo
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nova Senha
                </label>
                <div className="relative">
                  <input
                    type={mostrarSenha ? "text" : "password"}
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Digite a nova senha"
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
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Confirme a nova senha"
                  required
                />
              </div>

              {mensagem && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    mensagem.tipo === "sucesso"
                      ? "bg-green-50 border border-green-200 text-green-700"
                      : "bg-red-50 border border-red-200 text-red-700"
                  }`}
                >
                  {mensagem.texto}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
              >
                {loading ? "Resetando..." : "Resetar Senha"}
              </button>
            </form>

            <div className="text-center mt-6">
              <Link
                href="/login"
                className="text-teal-600 hover:text-teal-700 font-medium text-sm transition"
              >
                Voltar ao login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
