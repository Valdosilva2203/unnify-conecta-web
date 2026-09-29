import { redirect } from "next/navigation";

export default function RequisicaoDetalhesPage({
  params,
}: {
  params: { id: string; requisicaoId: string };
}) {
  redirect(`/requisicoes/${params.requisicaoId}`);
}
