import MediaDetail from "@/components/MediaDetail";

export default async function PaginaDeFilme({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MediaDetail mediaType="movie" id={Number(id)} />;
}
