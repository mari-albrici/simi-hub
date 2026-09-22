export default async function LegalEntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <h1 className="h3">Dettaglio azienda SIMI</h1>
      <p>ID: {id}</p>
    </div>
  );
}