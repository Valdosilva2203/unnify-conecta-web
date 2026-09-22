"use client";

import { useState } from "react";

interface MudarSenhaModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
}

export default function MudarSenhaModal({
  isOpen,
  onClose,
  email,
}: MudarSenhaModalProps) {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const handleMudarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSucesso(false);

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      setErro("Preencha todos os campos");
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setErro("Nova senha e confirmação não coincidem");
      return;
    }

    if (novaSenha.length < 6) {
      setErro("Nova senha deve ter pelo menos 6 caracteres");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/mudar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          senhaAtual,
          novaSenha,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.message || "Erro ao mudar senha");
        return;
      }

      setSucesso(true);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");

      setTimeout(() => {
        onClose();
        setSucesso(false);
      }, 2000);
    } catch (error) {
      setErro("Erro ao conectar com servidor");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Mudar Senha</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleMudarSenha} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Senha Atual
            </label>
            <input
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Digite sua senha atual"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nova Senha
            </label>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Digite a nova senha"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirmar Nova Senha
            </label>
            <input
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Confirme a nova senha"
            />
          </div>

          {erro && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {erro}
            </div>
          )}

          {sucesso && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              Senha alterada com sucesso!
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition disabled:opacity-50"
            >
              {loading ? "Alterando..." : "Alterar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
