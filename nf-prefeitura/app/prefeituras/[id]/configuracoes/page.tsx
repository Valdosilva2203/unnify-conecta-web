"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { X, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isAuthenticated } from "@/lib/auth";
import { usePrefeituraAuth } from "@/hooks/usePrefeituraAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import TopNavBar from "@/components/TopNavBar";

interface ConfiguracaoPrefeitura {
  id: string;
  prefeitura_id: string;
  logo_url?: string;
  cor_primaria: string;
  cor_secundaria: string;
  cor_botao_primario: string;
  cor_botao_secundario: string;
  created_at: string;
  updated_at: string;
}

function ConfiguracoesContent() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { session: prefeituraSession } = usePrefeituraAuth();

  const [loading, setLoading] = useState(true);
  const [autenticado, setAutenticado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [uploadandoLogo, setUploadandoLogo] = useState(false);
  const [logoPrevisualizacao, setLogoPrevisualizacao] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    cor_primaria: "#FF6B35",
    cor_secundaria: "#004E89",
    cor_botao_primario: "#FF6B35",
    cor_botao_secundario: "#6B7280",
  });

  const [configuracao, setConfiguracao] = useState<ConfiguracaoPrefeitura | null>(null);

  useEffect(() => {
    const isAdminCheck = isAuthenticated();
    const isPrefeituraUser = prefeituraSession && prefeituraSession.prefeitura_id === id;

    if (isAdminCheck || isPrefeituraUser) {
      setAutenticado(true);
      loadConfiguracao();
    } else {
      router.push("/login");
    }
  }, [id, prefeituraSession, router]);

  const loadConfiguracao = async () => {
    try {
      const { data, error } = await supabase
        .from("configuracao_prefeitura")
        .select("*")
        .eq("prefeitura_id", id)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setConfiguracao(data);
        setFormData({
          cor_primaria: data.cor_primaria || "#FF6B35",
          cor_secundaria: data.cor_secundaria || "#004E89",
          cor_botao_primario: data.cor_botao_primario || "#FF6B35",
          cor_botao_secundario: data.cor_botao_secundario || "#6B7280",
        });
        if (data.logo_url) {
          setLogoPrevisualizacao(data.logo_url);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar configuração:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("A imagem deve ter no máximo 2MB");
      return;
    }

    setUploadandoLogo(true);
    try {
      const fileName = `logo-${id}-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from("prefeituras_logos")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("prefeituras_logos")
        .getPublicUrl(fileName);

      setLogoPrevisualizacao(data.publicUrl);
    } catch (error) {
      console.error("Erro ao fazer upload da logo:", error);
      alert("Erro ao fazer upload da logo");
    } finally {
      setUploadandoLogo(false);
    }
  };

  const handleColorChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    try {
      const dataToSave = {
        prefeitura_id: id,
        logo_url: logoPrevisualizacao || null,
        cor_primaria: formData.cor_primaria,
        cor_secundaria: formData.cor_secundaria,
        cor_botao_primario: formData.cor_botao_primario,
        cor_botao_secundario: formData.cor_botao_secundario,
      };

      if (configuracao) {
        const { error } = await supabase
          .from("configuracao_prefeitura")
          .update(dataToSave)
          .eq("id", configuracao.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("configuracao_prefeitura")
          .insert([dataToSave]);

        if (error) throw error;
      }

      // Salvar logo_url também na tabela prefeituras
      const { error: logoError } = await supabase
        .from("prefeituras")
        .update({ logo_url: logoPrevisualizacao || null })
        .eq("id", id);

      if (logoError) throw logoError;

      alert("Configurações salvas com sucesso!");
      router.push(`/prefeituras/${id}`);
    } catch (error) {
      console.error("Erro ao salvar configurações:", error);
      alert("Erro ao salvar configurações");
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Carregando...</p>
      </div>
    );
  }

  if (!autenticado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Acesso negado</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNavBar
        title="Configurações"
        subtitle="Personalize a aparência da sua prefeitura"
        tabs={[]}
        activeTab="config"
        onTabChange={() => {}}
        userName={prefeituraSession?.nome || "Usuário"}
        userRole={prefeituraSession?.role || prefeituraSession?.cargo || "Usuário"}
      />

      <div className="app-container p-8">
        {/* Botão Voltar */}
        <button
          onClick={() => router.back()}
          className="bg-white text-orange-600 hover:bg-orange-50 hover:text-orange-700 border border-orange-600 shadow-sm hover:shadow-md transition font-medium px-4 py-2 rounded-lg flex items-center gap-2 mb-6"
        >
          <span>←</span>
          Voltar
        </button>

        <div className="bg-white rounded-xl shadow-sm p-8 max-w-2xl">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">⚙️ Configurações da Prefeitura</h1>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Logo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Logo da Prefeitura
              </label>
              <div className="flex items-start gap-6">
                <div className="flex-1">
                  <label className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-orange-500 transition">
                    <div className="flex flex-col items-center gap-2">
                      <Upload size={24} className="text-gray-400" />
                      <span className="text-sm text-gray-600">Clique para fazer upload da logo</span>
                      <span className="text-xs text-gray-500">PNG, JPG ou GIF (máx 2MB)</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      disabled={uploadandoLogo}
                      className="hidden"
                    />
                  </label>
                </div>
                {logoPrevisualizacao && (
                  <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 border border-gray-200">
                    <img
                      src={logoPrevisualizacao}
                      alt="Logo preview"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Cores */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">🎨 Cores</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { key: "cor_primaria", label: "Cor Primária", description: "Cor principal da marca" },
                  { key: "cor_secundaria", label: "Cor Secundária", description: "Cor complementar" },
                  { key: "cor_botao_primario", label: "Cor Botão Primário", description: "Cor dos botões principais" },
                  { key: "cor_botao_secundario", label: "Cor Botão Secundário", description: "Cor dos botões secundários" },
                ].map((color) => (
                  <div key={color.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {color.label}
                    </label>
                    <p className="text-xs text-gray-500 mb-2">{color.description}</p>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={formData[color.key as keyof typeof formData]}
                        onChange={(e) => handleColorChange(color.key, e.target.value)}
                        className="w-16 h-10 border border-gray-300 rounded-lg cursor-pointer"
                      />
                      <input
                        type="text"
                        value={formData[color.key as keyof typeof formData]}
                        onChange={(e) => handleColorChange(color.key, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">👁️ Pré-visualização</h2>
              <div className="bg-gray-50 p-6 rounded-lg space-y-3">
                <button
                  type="button"
                  style={{ backgroundColor: formData.cor_botao_primario }}
                  className="w-full text-white font-medium py-2 px-4 rounded-lg"
                >
                  Botão Primário
                </button>
                <button
                  type="button"
                  style={{ backgroundColor: formData.cor_botao_secundario }}
                  className="w-full text-white font-medium py-2 px-4 rounded-lg"
                >
                  Botão Secundário
                </button>
              </div>
            </div>

            {/* Botões */}
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={salvando || uploadandoLogo}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
              >
                {salvando ? "Salvando..." : "💾 Salvar Configurações"}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-medium py-2 px-4 rounded-lg transition"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function Configuracoes() {
  return (
    <ProtectedRoute>
      <ConfiguracoesContent />
    </ProtectedRoute>
  );
}
