"use client";

import { useState, useEffect } from "react";

interface Camera {
  id: string;
  name: string;
  ip: string;
  port: number;
  username?: string;
  password?: string;
  protocol: "http" | "rtsp";
}

export default function Home() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    ip: "",
    port: 80,
    username: "",
    password: "",
    protocol: "http" as const,
  });
  const [showForm, setShowForm] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("cameras");
    if (saved) {
      setCameras(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    if (cameras.length === 0) return;
    localStorage.setItem("cameras", JSON.stringify(cameras));
  }, [cameras]);

  const addCamera = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.ip) return;

    if (editingId) {
      setCameras(
        cameras.map((c) =>
          c.id === editingId
            ? {
                ...c,
                name: formData.name,
                ip: formData.ip,
                port: formData.port,
                username: formData.username,
                password: formData.password,
                protocol: formData.protocol,
              }
            : c
        )
      );
      setEditingId(null);
    } else {
      const newCamera: Camera = {
        id: Date.now().toString(),
        name: formData.name,
        ip: formData.ip,
        port: formData.port,
        username: formData.username,
        password: formData.password,
        protocol: formData.protocol,
      };
      setCameras([...cameras, newCamera]);
    }

    setFormData({
      name: "",
      ip: "",
      port: 80,
      username: "",
      password: "",
      protocol: "http",
    });
    setShowForm(false);
  };

  const startEdit = (camera: Camera) => {
    setFormData({
      name: camera.name,
      ip: camera.ip,
      port: camera.port,
      username: camera.username || "",
      password: camera.password || "",
      protocol: camera.protocol,
    });
    setEditingId(camera.id);
    setShowForm(true);
  };

  const cancelEdit = () => {
    setFormData({
      name: "",
      ip: "",
      port: 80,
      username: "",
      password: "",
      protocol: "http",
    });
    setEditingId(null);
    setShowForm(false);
  };

  const removeCamera = (id: string) => {
    setCameras(cameras.filter((c) => c.id !== id));
    if (selectedCamera?.id === id) {
      setSelectedCamera(null);
    }
  };

  const getCameraUrl = (camera: Camera) => {
    const auth = camera.username
      ? `${camera.username}:${camera.password}@`
      : "";
    return `${camera.protocol}://${auth}${camera.ip}:${camera.port}/video`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            📹 Câmeras IP
          </h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition"
          >
            {showForm ? "Cancelar" : "+ Adicionar Câmera"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={addCamera}
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nome da Câmera
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Ex: Câmera Entrada"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  IP da Câmera
                </label>
                <input
                  type="text"
                  value={formData.ip}
                  onChange={(e) =>
                    setFormData({ ...formData, ip: e.target.value })
                  }
                  placeholder="Ex: 192.168.1.100"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Porta
                </label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={(e) =>
                    setFormData({ ...formData, port: parseInt(e.target.value) })
                  }
                  placeholder="Ex: 80"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Protocolo
                </label>
                <select
                  value={formData.protocol}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      protocol: e.target.value as "http" | "rtsp",
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="http">HTTP</option>
                  <option value="rtsp">RTSP</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Usuário (opcional)
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                  placeholder="admin"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Senha (opcional)
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  placeholder="••••••••"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                {editingId ? "Atualizar Câmera" : "Adicionar Câmera"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="flex-1 bg-gray-400 hover:bg-gray-500 text-white font-medium py-2 px-4 rounded-lg transition"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Câmeras
            </h2>
            <div className="space-y-2">
              {cameras.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Nenhuma câmera adicionada
                </p>
              ) : (
                cameras.map((camera) => (
                  <div
                    key={camera.id}
                    onClick={() => setSelectedCamera(camera)}
                    className={`p-3 rounded-lg cursor-pointer transition ${
                      selectedCamera?.id === camera.id
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                  >
                    <p className="font-medium text-sm">{camera.name}</p>
                    <p className="text-xs opacity-75">{camera.ip}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(camera);
                        }}
                        className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded transition"
                      >
                        Editar
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCamera(camera.id);
                        }}
                        className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded transition"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-3">
            {selectedCamera ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                  {selectedCamera.name}
                </h2>
                <div className="bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-white mb-4">
                      📹 Visualizador de Câmera
                    </p>
                    <p className="text-gray-400 text-sm mb-4">
                      Para usar RTSP, é necessário um player JavaScript compatível
                    </p>
                    <div className="bg-gray-900 p-4 rounded text-gray-300 text-xs text-left font-mono">
                      <p>IP: {selectedCamera.ip}:{selectedCamera.port}</p>
                      <p>Protocolo: {selectedCamera.protocol.toUpperCase()}</p>
                      <p className="mt-2">
                        URL: {getCameraUrl(selectedCamera)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 bg-gray-100 dark:bg-gray-700 p-4 rounded">
                  <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                    ℹ️ Informações
                  </h3>
                  <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    <li>IP: {selectedCamera.ip}</li>
                    <li>Porta: {selectedCamera.port}</li>
                    <li>Protocolo: {selectedCamera.protocol.toUpperCase()}</li>
                    {selectedCamera.username && (
                      <li>Usuário: {selectedCamera.username}</li>
                    )}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
                <p className="text-gray-600 dark:text-gray-400">
                  Selecione uma câmera para visualizar
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
