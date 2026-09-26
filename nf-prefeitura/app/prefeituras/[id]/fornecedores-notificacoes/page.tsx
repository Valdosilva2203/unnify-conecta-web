"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import TopNavBar from "@/components/TopNavBar";

interface Fornecedor {
  id: string;
  nome: string;
  especialidade: string;
  localizacao: string;
  chamadosAbertos: number;
  rating: number;
  anosExperiencia: number;
  totalAtendimentos: number;
  tags: string[];
  preco: string;
  corGradiente: string;
}

export default function FornecedoresChamadosPage() {
  const params = useParams();
  const prefeituraId = params.id as string;

  // Dados estáticos de exemplo
  const fornecedores: Fornecedor[] = [
    {
      id: "1",
      nome: "TechSolve Sistemas",
      especialidade: "Especialista em Informática",
      localizacao: "São Paulo, SP",
      chamadosAbertos: 3,
      rating: 4.8,
      anosExperiencia: 10,
      totalAtendimentos: 1000,
      tags: ["Informática", "Reparos", "Manutenção"],
      preco: "R$ 150/h",
      corGradiente: "from-blue-400 to-blue-600",
    },
    {
      id: "2",
      nome: "Eletro Fix Serviços",
      especialidade: "Serviços Elétricos",
      localizacao: "São Paulo, SP",
      chamadosAbertos: 5,
      rating: 4.6,
      anosExperiencia: 8,
      totalAtendimentos: 800,
      tags: ["Elétrica", "Instalação", "Emergências"],
      preco: "R$ 120/h",
      corGradiente: "from-orange-400 to-orange-600",
    },
    {
      id: "3",
      nome: "Hidráulica Brasil",
      especialidade: "Encanador Profissional",
      localizacao: "São Bernardo do Campo, SP",
      chamadosAbertos: 2,
      rating: 4.9,
      anosExperiencia: 12,
      totalAtendimentos: 2000,
      tags: ["Hidráulica", "Encanamento", "Manutenção"],
      preco: "R$ 130/h",
      corGradiente: "from-green-400 to-green-600",
    },
    {
      id: "4",
      nome: "Pintura & Reforma",
      especialidade: "Pintor Especializado",
      localizacao: "Guarulhos, SP",
      chamadosAbertos: 4,
      rating: 4.5,
      anosExperiencia: 6,
      totalAtendimentos: 500,
      tags: ["Pintura", "Reforma", "Acabamento"],
      preco: "R$ 100/h",
      corGradiente: "from-red-400 to-red-600",
    },
    {
      id: "5",
      nome: "Marcenaria Premium",
      especialidade: "Marceneiro Master",
      localizacao: "São Paulo, SP",
      chamadosAbertos: 1,
      rating: 4.7,
      anosExperiencia: 15,
      totalAtendimentos: 1500,
      tags: ["Marcenaria", "Móveis", "Design"],
      preco: "R$ 160/h",
      corGradiente: "from-purple-400 to-purple-600",
    },
    {
      id: "6",
      nome: "Ar Condicionado Expert",
      especialidade: "Técnico em Refrigeração",
      localizacao: "Osasco, SP",
      chamadosAbertos: 6,
      rating: 4.4,
      anosExperiencia: 9,
      totalAtendimentos: 900,
      tags: ["HVAC", "Ar Condicionado", "Manutenção"],
      preco: "R$ 140/h",
      corGradiente: "from-cyan-400 to-cyan-600",
    },
  ];

  const getRatingBadgeColor = (rating: number) => {
    if (rating >= 4.8) return "bg-green-100 text-green-700";
    if (rating >= 4.5) return "bg-blue-100 text-blue-700";
    if (rating >= 4.0) return "bg-yellow-100 text-yellow-700";
    return "bg-orange-100 text-orange-700";
  };

  const getChamadoBadgeColor = (count: number) => {
    if (count >= 5) return "bg-red-100 text-red-700";
    if (count >= 3) return "bg-orange-100 text-orange-700";
    return "bg-green-100 text-green-700";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNavBar
        title="Fornecedores com Chamados"
        subtitle="Encontre os melhores fornecedores para suas necessidades"
        tabs={[{ id: "fornecedores", label: "Fornecedores" }]}
        activeTab="fornecedores"
        onTabChange={() => {}}
        onExport={() => console.log("Exportando...")}
        userName="Usuário"
        userRole="Prefeitura"
      />

      <div className="px-8 py-8 max-w-7xl mx-auto">
        {/* Header com descrição */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Fornecedores Disponíveis
          </h1>
          <p className="text-gray-600 mb-6">
            Explore nossos fornecedores parceiros com chamados abertos e encontre a melhor solução
          </p>

          {/* Filtros */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Tipo de Serviço
              </label>
              <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700">
                <option>Todos os tipos</option>
                <option>Informática</option>
                <option>Elétrica</option>
                <option>Hidráulica</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Localização
              </label>
              <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700">
                <option>Todas as cidades</option>
                <option>São Paulo, SP</option>
                <option>Guarulhos, SP</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Avaliação
              </label>
              <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700">
                <option>Todas</option>
                <option>4.8+</option>
                <option>4.5+</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Gênero
              </label>
              <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700">
                <option>Todos</option>
              </select>
            </div>
            <div className="flex items-end">
              <button className="w-full px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition">
                🔍
              </button>
            </div>
          </div>
        </div>

        {/* Grid de Fornecedores */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {fornecedores.map((fornecedor) => (
            <div
              key={fornecedor.id}
              className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition overflow-hidden border border-gray-100"
            >
              {/* Avatar e Info Top */}
              <div className="p-6 text-center">
                <div className={`w-16 h-16 bg-gradient-to-br ${fornecedor.corGradiente} rounded-full mx-auto mb-4 flex items-center justify-center text-2xl font-bold text-white shadow-md`}>
                  {fornecedor.nome.charAt(0)}
                </div>
                <h3 className="text-lg font-bold text-gray-900">{fornecedor.nome}</h3>
                <p className="text-sm text-gray-600 mt-1">{fornecedor.especialidade}</p>

                {/* Rating Badge */}
                <div className="mt-4">
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getRatingBadgeColor(fornecedor.rating)}`}>
                    ⭐ {fornecedor.rating}
                  </span>
                </div>
              </div>

              {/* Localização */}
              <div className="px-6 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-600">
                  📍 {fornecedor.localizacao}
                </p>
              </div>

              {/* Experiência */}
              <div className="px-6 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-600">
                  {fornecedor.anosExperiencia} anos de experiência
                </p>
                <p className="text-sm text-gray-600">
                  {fornecedor.totalAtendimentos}+ atendimentos
                </p>
              </div>

              {/* Tags/Especialidades */}
              <div className="px-6 py-3 border-t border-gray-100">
                <div className="flex flex-wrap gap-2">
                  {fornecedor.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Badge Chamados */}
              <div className="px-6 py-3 border-t border-gray-100">
                <span className={`inline-block px-3 py-1.5 rounded-full text-sm font-bold ${getChamadoBadgeColor(fornecedor.chamadosAbertos)}`}>
                  🔔 {fornecedor.chamadosAbertos} chamados
                </span>
              </div>

              {/* Preço */}
              <div className="px-6 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">Valores a partir de</p>
                <p className="text-lg font-bold text-gray-900">{fornecedor.preco}</p>
              </div>

              {/* Botão CTA */}
              <div className="px-6 py-4 border-t border-gray-100">
                <button className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition shadow-md hover:shadow-lg">
                  Ver Chamados
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Info Footer */}
        <div className="mt-12 text-center">
          <p className="text-gray-600">
            Mostrando <span className="font-bold text-gray-900">{fornecedores.length} fornecedores</span> com chamados abertos
          </p>
        </div>
      </div>
    </div>
  );
}
