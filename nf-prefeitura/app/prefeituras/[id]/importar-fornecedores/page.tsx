"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Upload, CheckCircle, AlertCircle, Loader } from "lucide-react";

interface Resumo {
  total: number;
  inseridos: number;
  duplicados: number;
  erros: number;
}

export default function ImportarFornecedoresPage() {
  const params = useParams();
  const router = useRouter();
  const prefeituraId = params.id as string;

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<{
    sucesso: boolean;
    mensagem: string;
    resumo: Resumo;
  } | null>(null);
  const [erro, setErro] = useState<string>("");

  const handleArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".csv")) {
        setErro("Por favor, selecione um arquivo CSV válido");
        setArquivo(null);
        return;
      }
      setArquivo(file);
      setErro("");
      setResultado(null);
    }
  };

  const handleImportar = async () => {
    if (!arquivo) {
      setErro("Selecione um arquivo CSV");
      return;
    }

    setCarregando(true);
    setErro("");

    try {
      const formData = new FormData();
      formData.append("file", arquivo);
      formData.append("prefeituraId", prefeituraId);

      const response = await fetch("/api/importar-fornecedores", {
        method: "POST",
        body: formData,
      });

      const dados = await response.json();

      if (!response.ok) {
        setErro(dados.erro || "Erro ao importar fornecedores");
        setCarregando(false);
        return;
      }

      setResultado({
        sucesso: dados.sucesso,
        mensagem: dados.mensagem,
        resumo: dados.resumo,
      });
      setArquivo(null);
    } catch (erro) {
      console.error("Erro:", erro);
      setErro("Erro ao processar arquivo");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Cabeçalho */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-orange-600 hover:text-orange-700 font-medium mb-4 flex items-center gap-2"
          >
            ← Voltar
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            Importar Fornecedores
          </h1>
          <p className="text-gray-600 mt-2">
            Importe fornecedores a partir de um arquivo CSV
          </p>
        </div>

        {/* Card Principal */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Upload Area */}
          {!resultado && (
            <div className="mb-8">
              <label className="block">
                <div className="border-2 border-dashed border-orange-300 rounded-lg p-8 text-center cursor-pointer hover:border-orange-500 hover:bg-orange-50 transition">
                  <Upload className="w-12 h-12 text-orange-600 mx-auto mb-4" />
                  <p className="text-lg font-semibold text-gray-900">
                    {arquivo ? arquivo.name : "Clique para selecionar arquivo CSV"}
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    ou arraste o arquivo aqui
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleArquivo}
                    className="hidden"
                  />
                </div>
              </label>
            </div>
          )}

          {/* Mensagem de Erro */}
          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900">Erro</p>
                <p className="text-red-700 text-sm">{erro}</p>
              </div>
            </div>
          )}

          {/* Resultado da Importação */}
          {resultado && (
            <div
              className={`rounded-lg p-6 mb-6 ${
                resultado.sucesso
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              <div className="flex gap-3 mb-4">
                {resultado.sucesso ? (
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                )}
                <div>
                  <p
                    className={`font-bold text-lg ${
                      resultado.sucesso
                        ? "text-green-900"
                        : "text-red-900"
                    }`}
                  >
                    {resultado.mensagem}
                  </p>
                </div>
              </div>

              {/* Resumo */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded p-4">
                  <p className="text-sm text-gray-600">Total de registros</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {resultado.resumo.total}
                  </p>
                </div>

                <div className="bg-white rounded p-4">
                  <p className="text-sm text-green-600">Importados</p>
                  <p className="text-2xl font-bold text-green-600">
                    {resultado.resumo.inseridos}
                  </p>
                </div>

                <div className="bg-white rounded p-4">
                  <p className="text-sm text-yellow-600">Duplicados</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {resultado.resumo.duplicados}
                  </p>
                </div>

                <div className="bg-white rounded p-4">
                  <p className="text-sm text-red-600">Erros</p>
                  <p className="text-2xl font-bold text-red-600">
                    {resultado.resumo.erros}
                  </p>
                </div>
              </div>

              {/* Info sobre duplicados */}
              {resultado.resumo.duplicados > 0 && (
                <div className="mt-4 p-3 bg-yellow-100 rounded text-sm text-yellow-800">
                  ℹ️ <strong>{resultado.resumo.duplicados}</strong> fornecedores
                  já estavam cadastrados (verificados por email + razão social)
                </div>
              )}
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex gap-4">
            {!resultado ? (
              <>
                <button
                  onClick={handleImportar}
                  disabled={!arquivo || carregando}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {carregando ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Importar Fornecedores
                    </>
                  )}
                </button>

                <button
                  onClick={() => router.back()}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-semibold py-3 px-4 rounded-lg transition"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setResultado(null);
                    setArquivo(null);
                  }}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-lg transition"
                >
                  Importar Outro Arquivo
                </button>

                <button
                  onClick={() => router.push(`/prefeituras/${prefeituraId}/fornecedores`)}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition"
                >
                  Ver Fornecedores
                </button>
              </>
            )}
          </div>

          {/* Info de Ajuda */}
          <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900">
              <strong>📝 Formato esperado do CSV:</strong>
            </p>
            <p className="text-xs text-blue-800 mt-2 font-mono">
              nome, email, telefone, endereco, cidade, estado
            </p>
            <p className="text-xs text-blue-800 mt-3">
              <strong>Colunas obrigatórias:</strong> nome, email
            </p>
            <p className="text-xs text-blue-800 mt-2">
              💡 Fornecedores duplicados (mesmo email + nome) serão
              automaticamente ignorados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
