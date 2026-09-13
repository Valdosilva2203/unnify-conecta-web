"use client";

import { useState, useEffect } from "react";

interface Host {
  id: string;
  name: string;
  address: string;
  port: number;
  online: boolean;
  lastCheck: Date;
}

export default function Home() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [formData, setFormData] = useState({ name: "", address: "", port: 80 });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("hosts");
    if (saved) {
      setHosts(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    if (hosts.length === 0) return;
    localStorage.setItem("hosts", JSON.stringify(hosts));
  }, [hosts]);

  useEffect(() => {
    if (hosts.length === 0) return;

    const interval = setInterval(async () => {
      for (const host of hosts) {
        try {
          const response = await fetch("/api/ping", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              address: host.address,
              port: host.port,
            }),
          });

          const data = await response.json();
          setHosts((prev) =>
            prev.map((h) =>
              h.id === host.id
                ? {
                    ...h,
                    online: data.online,
                    lastCheck: new Date(),
                  }
                : h
            )
          );
        } catch (err) {
          setHosts((prev) =>
            prev.map((h) =>
              h.id === host.id
                ? { ...h, online: false, lastCheck: new Date() }
                : h
            )
          );
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [hosts]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.address) return;

    if (editingId) {
      setHosts(
        hosts.map((h) =>
          h.id === editingId
            ? { ...h, name: formData.name, address: formData.address, port: formData.port }
            : h
        )
      );
      setEditingId(null);
    } else {
      const newHost: Host = {
        id: Date.now().toString(),
        name: formData.name,
        address: formData.address,
        port: formData.port,
        online: false,
        lastCheck: new Date(),
      };
      setHosts([...hosts, newHost]);
    }

    setFormData({ name: "", address: "", port: 80 });
    setShowForm(false);
  };

  const startEdit = (host: Host) => {
    setFormData({ name: host.name, address: host.address, port: host.port });
    setEditingId(host.id);
    setShowForm(true);
  };

  const cancelEdit = () => {
    setFormData({ name: "", address: "", port: 80 });
    setEditingId(null);
    setShowForm(false);
  };

  const removeHost = (id: string) => {
    setHosts(hosts.filter((h) => h.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            Monitorar ISP
          </h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition"
          >
            {showForm ? "Cancelar" : "+ Adicionar Host"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nome do Host
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Ex: Google DNS"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Endereço (IP ou Domínio)
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  placeholder="Ex: 8.8.8.8 ou localhost"
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
            </div>

            <div className="flex gap-4 mt-6">
              <button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                {editingId ? "Atualizar Host" : "Adicionar Host"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="flex-1 bg-gray-400 hover:bg-gray-500 text-white font-medium py-2 px-4 rounded-lg transition"
                >
                  Cancelar Edição
                </button>
              )}
            </div>
          </form>
        )}

        {hosts.length === 0 ? (
          <p className="text-center text-gray-600 dark:text-gray-400 py-12">
            Nenhum host adicionado ainda
          </p>
        ) : (
          <div className="flex flex-wrap gap-8">
            {hosts.map((host) => (
              <div
                key={host.id}
                className={`rounded-lg shadow p-6 flex flex-col justify-between transition max-w-sm w-full ${
                  host.online
                    ? "bg-green-50 dark:bg-green-900 border-l-4 border-green-500"
                    : "bg-red-50 dark:bg-red-900 border-l-4 border-red-500"
                }`}
              >
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {host.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {host.address}:{host.port}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                    Última verificação:{" "}
                    {new Date(host.lastCheck).toLocaleTimeString("pt-BR")}
                  </p>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div
                    className={`w-6 h-6 rounded-full ${
                      host.online ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(host)}
                      className="px-3 py-1 bg-blue-300 dark:bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-400 dark:hover:bg-blue-700 transition text-sm"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => removeHost(host.id)}
                      className="px-3 py-1 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded hover:bg-gray-400 dark:hover:bg-gray-700 transition text-sm"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
