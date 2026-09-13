import MediaDetail from "@/components/MediaDetail";

export default async function PaginaDeSerie({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MediaDetail mediaType="tv" id={Number(id)} />;
}
