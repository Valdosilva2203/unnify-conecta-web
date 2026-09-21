"use client";

interface CompartilharLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefeituraNome: string;
  link: string;
}

export default function CompartilharLinkModal({
  isOpen,
  onClose,
  prefeituraNome,
  link,
}: CompartilharLinkModalProps) {
  const copiarLink = () => {
    navigator.clipboard.writeText(link);
    alert("Link copiado!");
  };

  const compartilharLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: prefeituraNome,
          text: `Acesse a página da ${prefeituraNome}`,
          url: link,
        });
      } catch (err) {
        console.log("Erro ao compartilhar:", err);
      }
    } else {
      alert("Compartilhamento não disponível no seu navegador");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Liberar Acesso</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-2">
              <strong>Prefeitura:</strong> {prefeituraNome}
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Link de Acesso
            </label>
            <div className="flex gap-2">
              <div className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 break-all">
                <input
                  type="text"
                  value={link}
                  readOnly
                  className="w-full outline-none text-gray-900 text-sm bg-transparent"
                />
              </div>
              <button
                onClick={copiarLink}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium transition"
              >
                📋
              </button>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>⚠️ Instruções:</strong>
            </p>
            <ul className="text-xs text-yellow-700 mt-2 space-y-1 list-disc list-inside">
              <li>Compartilhe este link com o Prefeito</li>
              <li>Envie também o email e a senha definida</li>
              <li>Ele fará login com email + senha</li>
              <li>Será redirecionado automaticamente</li>
            </ul>
          </div>

          <div className="flex gap-2">
            {typeof navigator !== "undefined" && navigator.share && (
              <button
                onClick={compartilharLink}
                className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition"
              >
                📤 Compartilhar
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
