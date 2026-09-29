import { redirect } from "next/navigation";

export default function RequisicaoDetalhesPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/requisicoes/${params.id}`);
}
