import { redirect } from "next/navigation";

export default async function RequisicaoDetalhesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/requisicoes/${id}`);
}
