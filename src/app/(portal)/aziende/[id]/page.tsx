import { notFound } from "next/navigation";
import { authorizedClient, requirePagePermission } from "@/lib/permissions";
import { checkDatabase } from "@/lib/errors";
import Link from "@/components/ui/app-link";
import { hasPermission } from "@/lib/auth";

export default async function LegalEntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePagePermission("legal_entity.read");
  const { id } = await params;

  const db = await authorizedClient("legal_entity.read");

  const result = await db
    .from("legal_entities")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  checkDatabase(result.error, "Lettura azienda SIMI");

  if (!result.data) {
    notFound();
  }

  const entity = result.data;

  return (
    <>
      <div className="d-flex justify-content-between align-items-start gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">{entity.business_name}</h1>
          <p className="text-muted mb-0">Dettaglio società / sede SIMI.</p>
        </div>

        {hasPermission(user.role, "legal_entity.update") && (
          <Link
            href={`/aziende/${entity.id}/edit`}
            className="btn btn-dark"
          >
            Modifica
          </Link>
        )}
      </div>

      <div className="app-card p-3">
        <dl className="row mb-0">
          <dt className="col-sm-3">Codice</dt>
          <dd className="col-sm-9">{entity.code ?? "—"}</dd>

          <dt className="col-sm-3">Ragione sociale</dt>
          <dd className="col-sm-9">{entity.business_name ?? "—"}</dd>

          <dt className="col-sm-3">Paese</dt>
          <dd className="col-sm-9">{entity.country ?? "—"}</dd>

          <dt className="col-sm-3">Email</dt>
          <dd className="col-sm-9">{entity.email ?? "—"}</dd>

          <dt className="col-sm-3">Telefono</dt>
          <dd className="col-sm-9">{entity.phone ?? "—"}</dd>

          <dt className="col-sm-3">Stato</dt>
          <dd className="col-sm-9">
            <span
              className={`badge text-bg-${entity.active ? "success" : "secondary"}`}
            >
              {entity.active ? "Attiva" : "Non attiva"}
            </span>
          </dd>
        </dl>
      </div>
    </>
  );
}