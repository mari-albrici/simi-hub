"use client";

import {
  useMemo,
  useState,
} from "react";

import Link from "@/components/ui/app-link";
import { SubmitButton } from "@/components/ui/submit-button";

type GuideCategory = {
  id: string;
  name: string;
  parent_id: string | null;
};

type ChecklistItem = {
  id?: string;
  label: string;
  description: string;
};

type GuideFormInitialValues = {
  id?: string;
  title?: string;
  summary?: string;
  content?: string;
  category_id?: string | null;
  status?: "draft" | "published";
  is_important?: boolean;
  checklist?: ChecklistItem[];
};

type Props = {
  categories: GuideCategory[];

  action: (
    formData: FormData,
  ) => void | Promise<void>;

  initialValues?: GuideFormInitialValues;

  mode?: "create" | "edit";
};

export function GuideForm({
  categories,
  action,
  initialValues,
  mode = "create",
}: Props) {
  const [checklist, setChecklist] =
    useState<ChecklistItem[]>(
      initialValues?.checklist?.map(
        (item) => ({
          id: item.id,
          label: item.label,
          description:
            item.description ?? "",
        }),
      ) ?? [],
    );

  const rootCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          !category.parent_id,
      ),
    [categories],
  );

  const childrenByParent =
    useMemo(() => {
      const map =
        new Map<
          string,
          GuideCategory[]
        >();

      for (const category of categories) {
        if (
          !category.parent_id
        ) {
          continue;
        }

        const current =
          map.get(
            category.parent_id,
          ) ?? [];

        current.push(category);

        map.set(
          category.parent_id,
          current,
        );
      }

      return map;
    }, [categories]);

  function addChecklistItem() {
    setChecklist(
      (current) => [
        ...current,
        {
          label: "",
          description: "",
        },
      ],
    );
  }

  function updateChecklistItem(
    index: number,
    field:
      | "label"
      | "description",
    value: string,
  ) {
    setChecklist(
      (current) =>
        current.map(
          (
            item,
            itemIndex,
          ) =>
            itemIndex ===
            index
              ? {
                  ...item,
                  [field]:
                    value,
                }
              : item,
        ),
    );
  }

  function removeChecklistItem(
    index: number,
  ) {
    setChecklist(
      (current) =>
        current.filter(
          (
            _,
            itemIndex,
          ) =>
            itemIndex !==
            index,
        ),
    );
  }

  function moveChecklistItem(
    index: number,
    direction:
      | "up"
      | "down",
  ) {
    const targetIndex =
      direction === "up"
        ? index - 1
        : index + 1;

    if (
      targetIndex < 0 ||
      targetIndex >=
        checklist.length
    ) {
      return;
    }

    setChecklist(
      (current) => {
        const next =
          [...current];

        const currentItem =
          next[index];

        const targetItem =
          next[targetIndex];

        next[index] =
          targetItem;

        next[targetIndex] =
          currentItem;

        return next;
      },
    );
  }

  const cancelHref =
    mode === "edit" &&
    initialValues?.id
      ? `/guide/${initialValues.id}`
      : "/guide";

  return (
    <form
      action={action}
      className="d-flex flex-column gap-4"
    >
      {initialValues?.id && (
        <input
          type="hidden"
          name="id"
          value={
            initialValues.id
          }
        />
      )}

      <input
        type="hidden"
        name="checklist_json"
        value={JSON.stringify(
          checklist.map(
            (item) => ({
              label:
                item.label,
              description:
                item.description,
            }),
          ),
        )}
      />

      {/* ================================
          INFORMAZIONI PRINCIPALI
      ================================= */}

      <div className="app-card p-4">
        <div className="mb-4">
          <h2 className="h5 mb-1">
            Informazioni guida
          </h2>

          <p className="text-muted small mb-0">
            Titolo, categoria e
            descrizione della
            procedura.
          </p>
        </div>

        <div className="row g-3">
          <div className="col-12">
            <label
              className="form-label"
              htmlFor="guide-title"
            >
              Titolo
            </label>

            <input
              id="guide-title"
              type="text"
              name="title"
              className="form-control"
              required
              maxLength={250}
              defaultValue={
                initialValues?.title ??
                ""
              }
              placeholder="Es. Registrazione fattura fornitore"
            />
          </div>

          <div className="col-md-6">
            <label
              className="form-label"
              htmlFor="guide-category"
            >
              Categoria
            </label>

            <select
              id="guide-category"
              name="category_id"
              className="form-select"
              defaultValue={
                initialValues?.category_id ??
                ""
              }
            >
              <option value="">
                Nessuna categoria
              </option>

              {rootCategories.map(
                (root) => {
                  const children =
                    childrenByParent.get(
                      root.id,
                    ) ?? [];

                  if (
                    children.length ===
                    0
                  ) {
                    return (
                      <option
                        key={
                          root.id
                        }
                        value={
                          root.id
                        }
                      >
                        {
                          root.name
                        }
                      </option>
                    );
                  }

                  return (
                    <optgroup
                      key={
                        root.id
                      }
                      label={
                        root.name
                      }
                    >
                      <option
                        value={
                          root.id
                        }
                      >
                        {
                          root.name
                        }{" "}
                        — Generale
                      </option>

                      {children.map(
                        (
                          child,
                        ) => (
                          <option
                            key={
                              child.id
                            }
                            value={
                              child.id
                            }
                          >
                            {
                              child.name
                            }
                          </option>
                        ),
                      )}
                    </optgroup>
                  );
                },
              )}
            </select>
          </div>

          <div className="col-md-3">
            <label
              className="form-label"
              htmlFor="guide-status"
            >
              Stato
            </label>

            <select
              id="guide-status"
              name="status"
              className="form-select"
              defaultValue={
                initialValues?.status ??
                "draft"
              }
            >
              <option value="draft">
                Bozza
              </option>

              <option value="published">
                Pubblicata
              </option>
            </select>
          </div>

          <div className="col-md-3 d-flex align-items-end">
            <label className="form-check mb-2">
              <input
                type="checkbox"
                name="is_important"
                value="1"
                className="form-check-input"
                defaultChecked={
                  initialValues?.is_important ??
                  false
                }
              />

              <span className="form-check-label">
                Importante
              </span>
            </label>
          </div>

          <div className="col-12">
            <label
              className="form-label"
              htmlFor="guide-summary"
            >
              Descrizione breve
            </label>

            <textarea
              id="guide-summary"
              name="summary"
              className="form-control"
              rows={3}
              maxLength={1000}
              defaultValue={
                initialValues?.summary ??
                ""
              }
              placeholder="Breve descrizione della guida e del suo utilizzo."
            />
          </div>
        </div>
      </div>

      {/* ================================
          PROCEDURA
      ================================= */}

      <div className="app-card p-4">
        <div className="mb-3">
          <h2 className="h5 mb-1">
            Procedura
          </h2>

          <p className="text-muted small mb-0">
            Scrivi qui le
            istruzioni operative
            complete.
          </p>
        </div>

        <textarea
          name="content"
          className="form-control"
          rows={16}
          maxLength={50000}
          defaultValue={
            initialValues?.content ??
            ""
          }
          placeholder={`Esempio:

1. Aprire eSolver.
2. Accedere alla registrazione fatture.
3. Verificare il fornitore.
4. Inserire numero e data fattura.
5. Collegare la commessa.
6. Salvare il progressivo eSolver in SIMI Hub.`}
        />
      </div>

      {/* ================================
          CHECKLIST
      ================================= */}

      <div className="app-card p-4">
        <div className="d-flex justify-content-between align-items-start gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="h5 mb-1">
              Checklist
            </h2>

            <p className="text-muted small mb-0">
              Passaggi rapidi da
              controllare durante
              l'esecuzione della
              procedura.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={
              addChecklistItem
            }
          >
            <i className="bi bi-plus-lg me-2" />

            Aggiungi voce
          </button>
        </div>

        {checklist.length ===
        0 ? (
          <div className="border rounded p-4 text-center text-muted">
            <i className="bi bi-list-check fs-3 d-block mb-2" />

            Nessuna voce nella
            checklist.
          </div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {checklist.map(
              (
                item,
                index,
              ) => (
                <div
                  key={
                    item.id ??
                    `new-${index}`
                  }
                  className="border rounded p-3"
                >
                  <div className="d-flex align-items-start gap-3">
                    <div
                      className="d-flex align-items-center justify-content-center rounded bg-body-secondary flex-shrink-0 mt-4"
                      style={{
                        width:
                          32,
                        height:
                          32,
                      }}
                    >
                      {index +
                        1}
                    </div>

                    <div className="flex-grow-1">
                      <div className="mb-2">
                        <label className="form-label small">
                          Voce
                        </label>

                        <input
                          type="text"
                          className="form-control"
                          value={
                            item.label
                          }
                          required
                          maxLength={
                            500
                          }
                          placeholder="Es. Controllare la P.IVA"
                          onChange={(
                            event,
                          ) =>
                            updateChecklistItem(
                              index,
                              "label",
                              event
                                .target
                                .value,
                            )
                          }
                        />
                      </div>

                      <div>
                        <label className="form-label small">
                          Nota
                          opzionale
                        </label>

                        <input
                          type="text"
                          className="form-control"
                          value={
                            item.description
                          }
                          maxLength={
                            2000
                          }
                          placeholder="Dettaglio o indicazione aggiuntiva"
                          onChange={(
                            event,
                          ) =>
                            updateChecklistItem(
                              index,
                              "description",
                              event
                                .target
                                .value,
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className="d-flex flex-column gap-1 mt-4">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        aria-label="Sposta su"
                        title="Sposta su"
                        disabled={
                          index ===
                          0
                        }
                        onClick={() =>
                          moveChecklistItem(
                            index,
                            "up",
                          )
                        }
                      >
                        <i className="bi bi-chevron-up" />
                      </button>

                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        aria-label="Sposta giù"
                        title="Sposta giù"
                        disabled={
                          index ===
                          checklist.length -
                            1
                        }
                        onClick={() =>
                          moveChecklistItem(
                            index,
                            "down",
                          )
                        }
                      >
                        <i className="bi bi-chevron-down" />
                      </button>

                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        aria-label="Rimuovi voce"
                        title="Rimuovi voce"
                        onClick={() =>
                          removeChecklistItem(
                            index,
                          )
                        }
                      >
                        <i className="bi bi-trash" />
                      </button>
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {/* ================================
          AZIONI
      ================================= */}

      <div className="d-flex justify-content-end gap-2">
        <Link
          href={cancelHref}
          className="btn btn-outline-secondary"
        >
          Annulla
        </Link>

        <SubmitButton
          className="btn btn-primary"
          pendingLabel={
            mode === "edit"
              ? "Salvataggio…"
              : "Creazione…"
          }
        >
          <i className="bi bi-check-lg me-2" />

          {mode === "edit"
            ? "Salva modifiche"
            : "Crea guida"}
        </SubmitButton>
      </div>
    </form>
  );
}