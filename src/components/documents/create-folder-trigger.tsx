import { createFolderAction } from "@/lib/folder-actions";
import { SubmitButton } from "@/components/ui/submit-button";


export function CreateFolderTrigger({
  parentId,
}: {
  parentId: string | null;
}) {
  return (
    <details className="position-relative">
      <summary
        className="btn btn-outline-secondary list-unstyled"
        style={{
          cursor: "pointer",
        }}
      >
        <i
          className="bi bi-folder-plus me-2"
          aria-hidden="true"
        />

        Nuova cartella
      </summary>

      <div
        className="position-absolute end-0 mt-2 bg-body border rounded shadow-sm p-3"
        style={{
          width: "320px",
          zIndex: 20,
        }}
      >
        <form
          action={createFolderAction}
          className="d-flex flex-column gap-3"
        >
          {parentId && (
            <input
              type="hidden"
              name="parent_id"
              value={parentId}
            />
          )}

          <div>
            <label
              htmlFor="new-folder-name"
              className="form-label small"
            >
              Nome cartella
            </label>

            <input
              id="new-folder-name"
              name="name"
              type="text"
              className="form-control"
              required
              autoComplete="off"
              maxLength={255}
              placeholder="Nuova cartella"
            />
          </div>

          <div className="d-flex justify-content-end">
            <SubmitButton>
              Crea cartella
            </SubmitButton>
          </div>
        </form>
      </div>
    </details>
  );
}