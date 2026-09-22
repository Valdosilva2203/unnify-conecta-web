"use client";

import { useState } from "react";
import Link from "next/link";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMensagem(null);

    try {
      const res = await fetch("/api/recuperar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        setMensagem({
          tipo: "sucesso",
          texto: "Email de recuperação enviado! Verifique sua caixa de entrada.",
        });
        setEnviado(true);
        setEmail("");
      } else {
        setMensagem({
          tipo: "erro",
          texto: data.error || "Erro ao enviar email",
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
          <p className="text-gray-600 mt-2">Recuperar Senha</p>
        </div>

        {!enviado ? (
          <>
            <p className="text-gray-600 text-sm mb-6 text-center">
              Digite seu email para receber um link de recuperação de senha
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="seu@email.com"
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
                {loading ? "Enviando..." : "Enviar Link de Recuperação"}
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
        ) : (
          <>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-700 text-sm">
                ✅ Email enviado com sucesso! Verifique sua caixa de entrada e spam.
              </p>
            </div>

            <p className="text-gray-600 text-sm mb-6 text-center">
              O link de recuperação expira em 1 hora. Se não receber o email, tente novamente.
            </p>

            <button
              onClick={() => {
                setEnviado(false);
                setMensagem(null);
              }}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg transition"
            >
              Enviar Outro Email
            </button>

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
