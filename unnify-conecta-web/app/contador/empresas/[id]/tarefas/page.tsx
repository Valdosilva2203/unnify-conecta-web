import Link from 'next/link';

// Mesmo conteúdo da antiga aba "Tarefas" do espaço da empresa
export default function TarefasEmpresaPage() {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6 text-sm text-gray-700 space-y-2">
      <p>As tarefas internas da empresa pertencem à equipe dela. Organize o trabalho do seu escritório em <Link href="/contador/tarefas" className="font-semibold text-orange-600 hover:underline">Tarefas</Link>.</p>
      <p className="text-gray-500">Quando a empresa transforma uma obrigação em tarefa, o vínculo aparece na própria obrigação.</p>
    </section>
  );
}
