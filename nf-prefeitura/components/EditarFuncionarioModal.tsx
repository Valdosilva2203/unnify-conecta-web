"use client";

import { useState, useEffect } from "react";

interface Funcionario {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cargo: string;
}

interface EditarFuncionarioModalProps {
  isOpen: boolean;
  funcionario: Funcionario | null;
  cargo: "prefeito" | "vice-prefeito";
  onClose: () => void;
  onSubmit: (id: string, nome: string, email: string, telefone: string) => Promise<void>;
}

export default function EditarFuncionarioModal({
  isOpen,
  funcionario,
  cargo,
  onClose,
  onSubmit,
}: EditarFuncionarioModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    telefone: "",
  });

  useEffect(() => {
    if (funcionario && isOpen) {
      setFormData({
        nome: funcionario.nome,
        email: funcionario.email,
        telefone: funcionario.telefone,
      });
    }
  }, [funcionario, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!funcionario) return;

    setLoading(true);
    try {
      await onSubmit(funcionario.id, formData.nome, formData.email, formData.telefone);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !funcionario) return null;

  const cargoLabel = cargo === "prefeito" ? "Prefeito" : "Vice-Prefeito";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            Editar {cargoLabel}
          </h2>
          <button
            onClick={onClose}
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
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
