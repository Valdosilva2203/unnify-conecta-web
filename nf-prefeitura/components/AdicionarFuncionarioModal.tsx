"use client";

import { useState } from "react";

interface AdicionarFuncionarioModalProps {
  isOpen: boolean;
  cargo: "prefeito" | "vice-prefeito";
  onClose: () => void;
  onSubmit: (
    nome: string,
    email: string,
    telefone: string
  ) => Promise<{ senha: string }>;
  onAtualizarSenha?: (novaSenha: string) => Promise<void>;
}

export default function AdicionarFuncionarioModal({
  isOpen,
  cargo,
  onClose,
  onSubmit,
  onAtualizarSenha,
}: AdicionarFuncionarioModalProps) {
  const [loading, setLoading] = useState(false);
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);
  const [usuarioCriado, setUsuarioCriado] = useState<{
    nome: string;
    email: string;
  } | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [senhaCustomizada, setSenhaCustomizada] = useState("");
  const [mostrarSenhaCustomizada, setMostrarSenhaCustomizada] = useState(false);
  const [usarSenhaCustomizada, setUsarSenhaCustomizada] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    telefone: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const resultado = await onSubmit(
        formData.nome,
        formData.email,
        formData.telefone
      );
      setSenhaGerada(resultado.senha);
      setUsuarioCriado({
        nome: formData.nome,
        email: formData.email,
      });
      setFormData({ nome: "", email: "", telefone: "" });
    } finally {
      setLoading(false);
    }
  };

  const handleFecharModal = () => {
    setSenhaGerada(null);
    setUsuarioCriado(null);
    setMostrarSenha(false);
    setSenhaCustomizada("");
    setUsarSenhaCustomizada(false);
    onClose();
  };

  const copiarSenha = () => {
    const senha = usarSenhaCustomizada ? senhaCustomizada : senhaGerada;
    if (senha) {
      navigator.clipboard.writeText(senha);
    }
  };

  const validarSenhaCustomizada = () => {
    if (senhaCustomizada.length < 6) {
      alert("Senha deve ter no mínimo 6 caracteres");
      return false;
    }
    return true;
  };

  const handleConfirmarSenhaCustomizada = async () => {
    if (!validarSenhaCustomizada()) return;

    setLoading(true);
    try {
      if (onAtualizarSenha) {
        await onAtualizarSenha(senhaCustomizada);
      }
      handleFecharModal();
    } catch (error) {
      console.error("Erro ao confirmar senha:", error);
      alert("Erro ao confirmar senha");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const cargoLabel = cargo === "prefeito" ? "Prefeito" : "Vice-Prefeito";

  // Tela de senha gerada
  if (senhaGerada && usuarioCriado) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-2xl font-bold text-gray-900">
              {cargoLabel} Criado!
            </h2>
            <p className="text-gray-600 mt-2">
              Usuário cadastrado com sucesso
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 space-y-4">
            <div>
              <p className="text-sm text-gray-700 mb-2">
                <strong>Nome:</strong> {usuarioCriado.nome}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Email:</strong> {usuarioCriado.email}
              </p>
            </div>

            {!usarSenhaCustomizada ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Senha Gerada
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 flex items-center gap-2">
                      <input
                        type={mostrarSenha ? "text" : "password"}
                        value={senhaGerada}
                        readOnly
                        className="flex-1 bg-transparent outline-none text-gray-900 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarSenha(!mostrarSenha)}
                        className="text-gray-500 hover:text-gray-700 text-sm"
                      >
                        {mostrarSenha ? "👁️" : "👁️‍🗨️"}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={copiarSenha}
                      className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium transition"
                    >
                      📋
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setUsarSenhaCustomizada(true)}
                  className="w-full text-sm text-teal-600 hover:text-teal-700 font-medium py-2 px-3 rounded-lg border border-teal-200 hover:bg-teal-50 transition"
                >
                  ✏️ Criar minha própria senha
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sua Senha
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 flex items-center gap-2">
                      <input
                        type={mostrarSenhaCustomizada ? "text" : "password"}
                        value={senhaCustomizada}
                        onChange={(e) => setSenhaCustomizada(e.target.value)}
                        className="flex-1 bg-transparent outline-none text-gray-900 font-mono text-sm"
                        placeholder="Digite a senha..."
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setMostrarSenhaCustomizada(!mostrarSenhaCustomizada)
                        }
                        className="text-gray-500 hover:text-gray-700 text-sm"
                      >
                        {mostrarSenhaCustomizada ? "👁️" : "👁️‍🗨️"}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Mínimo 6 caracteres</p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setUsarSenhaCustomizada(false)}
                    className="flex-1 text-sm text-gray-600 hover:text-gray-700 font-medium py-2 px-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition"
                  >
                    Usar gerada
                  </button>
                  <button
                    type="button"
                    onClick={copiarSenha}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium transition text-sm"
                  >
                    📋 Copiar
                  </button>
                </div>
              </>
            )}

            <p className="text-xs text-gray-600">
              ⚠️ O usuário pode mudar a senha quando desejar
            </p>
          </div>

          <button
            type="button"
            onClick={
              usarSenhaCustomizada
                ? handleConfirmarSenhaCustomizada
                : handleFecharModal
            }
            disabled={loading || (usarSenhaCustomizada && senhaCustomizada.length < 6)}
            className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition disabled:opacity-50"
          >
            {loading ? "Salvando..." : "Fechar"}
          </button>
        </div>
      </div>
    );
  }

  // Tela de formulário
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            Adicionar {cargoLabel}
          </h2>
          <button
            onClick={handleFecharModal}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nome
            </label>
            <input
              type="text"
              name="nome"
              value={formData.nome}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder={`Nome do ${cargoLabel}`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Telefone
            </label>
            <input
              type="tel"
              name="telefone"
              value={formData.telefone}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="(00) 0000-0000"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleFecharModal}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition disabled:opacity-50"
            >
              {loading ? "Salvando..." : "Adicionar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
