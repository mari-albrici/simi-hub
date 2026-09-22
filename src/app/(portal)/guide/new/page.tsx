import Link from "@/components/ui/app-link";
import { GuideForm } from "@/components/guides/guide-form";

import { createGuideAction } from "@/lib/crud";
import { getGuideCategories } from "@/lib/data";
import { requirePagePermission } from "@/lib/permissions";

export default async function NewGuidePage() {
  await requirePagePermission(
    "document.update",
  );

  const categories =
    await getGuideCategories();

  return (
    <>
      <div className="d-flex align-items-start justify-content-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="mb-2">
            <Link
              href="/guide"
              className="small text-decoration-none"
            >
              <i className="bi bi-arrow-left me-2" />

              Guide e Procedure
            </Link>
          </div>

          <h1 className="h3 mb-1">
            Nuova guida
          </h1>

          <p className="text-muted mb-0">
            Crea una nuova procedura
            operativa interna.
          </p>
        </div>
      </div>

      <GuideForm
        categories={categories}
        action={createGuideAction}
      />
    </>
  );
}