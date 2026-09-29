import { redirect } from "next/navigation";

export default async function RequisicaoDetalhesPage({
  params,
}: {
  params: Promise<{ id: string; requisicaoId: string }>;
}) {
  const { requisicaoId } = await params;
  redirect(`/requisicoes/${requisicaoId}`);
}
