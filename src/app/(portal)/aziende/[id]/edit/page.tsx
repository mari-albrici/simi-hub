import { notFound } from "next/navigation";
import { authorizedClient, requirePagePermission } from "@/lib/permissions";
import { checkDatabase } from "@/lib/errors";
import { updateLegalEntityAction } from "@/lib/crud";

export default async function EditLegalEntityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("legal_entity.update");

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
      <div className="mb-3">
        <h1 className="h3 mb-1">Modifica {entity.business_name}</h1>
        <p className="text-muted mb-0">
          Modifica i dati della società / sede SIMI.
        </p>
      </div>

<div className="app-card p-3">
  <form action={updateLegalEntityAction} className="row g-3">
    <input type="hidden" name="id" value={entity.id} />

    <div className="col-md-4">
      <label className="form-label" htmlFor="code">
        Codice
      </label>
      <input
        id="code"
        name="code"
        className="form-control"
        defaultValue={entity.code ?? ""}
        required
      />
    </div>

    <div className="col-md-8">
      <label className="form-label" htmlFor="business_name">
        Ragione sociale
      </label>
      <input
        id="business_name"
        name="business_name"
        className="form-control"
        defaultValue={entity.business_name ?? ""}
        required
      />
    </div>

    <div className="col-md-4">
      <label className="form-label" htmlFor="country">
        Paese
      </label>
      <input
        id="country"
        name="country"
        className="form-control"
        defaultValue={entity.country ?? ""}
      />
    </div>

    <div className="col-md-4">
      <label className="form-label" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        className="form-control"
        defaultValue={entity.email ?? ""}
      />
    </div>

    <div className="col-md-4">
      <label className="form-label" htmlFor="phone">
        Telefono
      </label>
      <input
        id="phone"
        name="phone"
        className="form-control"
        defaultValue={entity.phone ?? ""}
      />
    </div>

    <div className="col-12">
      <div className="form-check">
        <input
          id="active"
          name="active"
          type="checkbox"
          className="form-check-input"
          defaultChecked={Boolean(entity.active)}
          value="true"
        />
        <label className="form-check-label" htmlFor="active">
          Sede attiva
        </label>
      </div>
    </div>

    <div className="col-12">
      <button type="submit" className="btn btn-dark">
        Salva modifiche
      </button>
    </div>
  </form>
</div>
    </>
  );
}