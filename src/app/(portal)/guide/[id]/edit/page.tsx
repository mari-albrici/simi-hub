import {
  notFound,
  redirect,
} from "next/navigation";

import Link from "@/components/ui/app-link";
import { GuideForm } from "@/components/guides/guide-form";

import { updateGuideAction } from "@/lib/crud";
import {
  getGuideById,
  getGuideCategories,
} from "@/lib/data";
import { requirePagePermission } from "@/lib/permissions";

export default async function EditGuidePage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  await requirePagePermission(
    "document.update",
  );

  const { id } =
    await params;

  const [guide, categories] =
    await Promise.all([
      getGuideById(id),
      getGuideCategories(),
    ]);

  if (!guide) {
    notFound();
  }

  /*
   * Le guide archiviate non vengono modificate
   * da questa pagina.
   */
  if (
    guide.archived_at
  ) {
    redirect(
      `/guide/${guide.id}`,
    );
  }

  return (
    <>
      <div className="d-flex align-items-start justify-content-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="mb-2">
            <Link
              href={`/guide/${guide.id}`}
              className="small text-decoration-none"
            >
              <i className="bi bi-arrow-left me-2" />

              {guide.title}
            </Link>
          </div>

          <h1 className="h3 mb-1">
            Modifica guida
          </h1>

          <p className="text-muted mb-0">
            Modifica contenuto,
            categoria e checklist
            della procedura.
          </p>
        </div>
      </div>

      <GuideForm
        categories={categories}
        action={updateGuideAction}
        mode="edit"
        initialValues={{
          id:
            guide.id,

          title:
            guide.title,

          summary:
            guide.summary ??
            "",

          content:
            guide.content,

          category_id:
            guide.category_id,

          status:
            guide.status ===
            "published"
              ? "published"
              : "draft",

          is_important:
            guide.is_important,

          checklist:
            guide.checklist.map(
              (item) => ({
                id:
                  item.id,

                label:
                  item.label,

                description:
                  item.description ??
                  "",
              }),
            ),
        }}
      />
    </>
  );
}