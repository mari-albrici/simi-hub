"use client";

import { useMemo, useState } from "react";

import Link from "@/components/ui/app-link";

import {
  archiveFolderAction,
  moveFolderAction,
  renameFolderAction,
} from "@/lib/folder-actions";

import type {
  Folder,
  FolderTreeItem,
  FolderUsage,
} from "@/lib/folders";


export function FolderCard({
  folder,
  currentFolderId,
  canManage,
  usage,
  folderTree,
}: {
  folder: Folder;
  currentFolderId: string | null;
  canManage: boolean;
  usage: FolderUsage;
  folderTree: FolderTreeItem[];
}) {
  const [menuOpen, setMenuOpen] =
    useState(false);

  const [renameOpen, setRenameOpen] =
    useState(false);

  const [moveOpen, setMoveOpen] =
    useState(false);

  const [deleteOpen, setDeleteOpen] =
    useState(false);


  /* ==========================================================
   * DESTINAZIONI VALIDE
   * ==========================================================
   *
   * Nascondiamo:
   *
   * - la cartella stessa;
   * - tutti i suoi discendenti.
   *
   * Il DB impedirebbe comunque il ciclo, ma non ha senso
   * proporre all'utente destinazioni impossibili.
   * ========================================================== */

  const moveDestinations =
    useMemo(() => {
      const excludedIds =
        new Set<string>([
          folder.id,
        ]);

      /*
       * folderTree è ordinato depth-first.
       *
       * Quando incontriamo la cartella corrente, tutti gli
       * elementi successivi con depth maggiore sono suoi
       * discendenti fino al ritorno allo stesso livello.
       */
      const folderIndex =
        folderTree.findIndex(
          (item) =>
            item.id === folder.id,
        );


      if (folderIndex >= 0) {
        const sourceDepth =
          folderTree[
            folderIndex
          ].depth;


        for (
          let i =
            folderIndex + 1;
          i < folderTree.length;
          i += 1
        ) {
          const item =
            folderTree[i];


          if (
            item.depth <=
            sourceDepth
          ) {
            break;
          }


          excludedIds.add(
            item.id,
          );
        }
      }


      return folderTree.filter(
        (item) =>
          !excludedIds.has(
            item.id,
          ),
      );
    }, [
      folder.id,
      folderTree,
    ]);


  return (
    <>
      <div className="position-relative h-100">

        {/* ===================================================
            CARTELLA
            =================================================== */}

        <Link
          href={`/documenti?folder=${encodeURIComponent(
            folder.id,
          )}`}
          className="text-decoration-none d-block h-100"
        >
          <div className="border rounded p-3 h-100 d-flex align-items-center gap-3 bg-body folder-card">

            <i
              className="bi bi-folder-fill fs-3 flex-shrink-0"
              aria-hidden="true"
            />

            <div
              className="min-w-0 flex-grow-1"
              style={{
                paddingRight:
                  canManage
                    ? "2rem"
                    : undefined,
              }}
            >
              <div className="fw-semibold text-body text-truncate">
                {folder.name}
              </div>

              <div className="small text-muted">
                {usage.empty
                  ? "Cartella vuota"
                  : `${usage.total} ${
                      usage.total === 1
                        ? "elemento"
                        : "elementi"
                    }`}
              </div>
            </div>

          </div>
        </Link>


        {/* ===================================================
            MENU
            =================================================== */}

        {canManage && (
          <div
            className="position-absolute"
            style={{
              top: "0.5rem",
              right: "0.5rem",
              zIndex: 5,
            }}
          >
            <button
              type="button"
              className="btn btn-sm btn-light border-0"
              aria-label={`Azioni cartella ${folder.name}`}
              aria-expanded={menuOpen}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();

                setMenuOpen(
                  (value) =>
                    !value,
                );
              }}
            >
              <i
                className="bi bi-three-dots-vertical"
                aria-hidden="true"
              />
            </button>


            {menuOpen && (
              <div
                className="dropdown-menu show end-0"
                style={{
                  position:
                    "absolute",
                  right: 0,
                  left: "auto",
                  minWidth:
                    "180px",
                }}
              >
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setMenuOpen(false);
                    setRenameOpen(true);
                  }}
                >
                  <i
                    className="bi bi-pencil me-2"
                    aria-hidden="true"
                  />

                  Rinomina
                </button>


                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setMenuOpen(false);
                    setMoveOpen(true);
                  }}
                >
                  <i
                    className="bi bi-folder-symlink me-2"
                    aria-hidden="true"
                  />

                  Sposta
                </button>


                <div className="dropdown-divider" />


                <button
                  type="button"
                  className="dropdown-item text-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                >
                  <i
                    className="bi bi-trash me-2"
                    aria-hidden="true"
                  />

                  Elimina
                </button>
              </div>
            )}
          </div>
        )}

      </div>


      {/* =====================================================
          MODALE RINOMINA
          ===================================================== */}

      {renameOpen && (
        <div
          className="modal d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-backdrop show" />

          <div
            className="modal-dialog modal-dialog-centered position-relative"
            style={{
              zIndex: 1060,
            }}
          >
            <div className="modal-content">

              <div className="modal-header">
                <h2 className="modal-title fs-5">
                  Rinomina cartella
                </h2>

                <button
                  type="button"
                  className="btn-close"
                  aria-label="Chiudi"
                  onClick={() =>
                    setRenameOpen(false)
                  }
                />
              </div>


              <form
                action={
                  renameFolderAction
                }
              >
                <div className="modal-body">

                  <input
                    type="hidden"
                    name="folder_id"
                    value={folder.id}
                  />

                  {currentFolderId && (
                    <input
                      type="hidden"
                      name="current_folder_id"
                      value={
                        currentFolderId
                      }
                    />
                  )}


                  <label
                    className="form-label"
                    htmlFor={`rename-folder-${folder.id}`}
                  >
                    Nome cartella
                  </label>

                  <input
                    id={`rename-folder-${folder.id}`}
                    name="name"
                    type="text"
                    className="form-control"
                    defaultValue={
                      folder.name
                    }
                    required
                    maxLength={255}
                    autoComplete="off"
                    autoFocus
                  />

                </div>


                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() =>
                      setRenameOpen(
                        false,
                      )
                    }
                  >
                    Annulla
                  </button>

                  <button
                    type="submit"
                    className="btn btn-primary"
                  >
                    Salva
                  </button>
                </div>
              </form>

            </div>
          </div>
        </div>
      )}


      {/* =====================================================
          MODALE SPOSTA
          ===================================================== */}

      {moveOpen && (
        <div
          className="modal d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-backdrop show" />

          <div
            className="modal-dialog modal-dialog-centered position-relative"
            style={{
              zIndex: 1060,
            }}
          >
            <div className="modal-content">

              <div className="modal-header">

                <h2 className="modal-title fs-5">
                  Sposta cartella
                </h2>

                <button
                  type="button"
                  className="btn-close"
                  aria-label="Chiudi"
                  onClick={() =>
                    setMoveOpen(false)
                  }
                />

              </div>


              <form
                action={
                  moveFolderAction
                }
              >
                <div className="modal-body">

                  <input
                    type="hidden"
                    name="folder_id"
                    value={folder.id}
                  />

                  {currentFolderId && (
                    <input
                      type="hidden"
                      name="current_folder_id"
                      value={
                        currentFolderId
                      }
                    />
                  )}


                  <p className="mb-3">
                    Scegli dove spostare{" "}
                    <strong>
                      {folder.name}
                    </strong>
                    .
                  </p>


                  <label
                    className="form-label"
                    htmlFor={`move-folder-${folder.id}`}
                  >
                    Destinazione
                  </label>


                  <select
                    id={`move-folder-${folder.id}`}
                    name="destination_folder_id"
                    className="form-select"
                    defaultValue={
                      folder.parent_id ??
                      ""
                    }
                  >
                    <option value="">
                      📂 Documenti
                    </option>


                    {moveDestinations.map(
                      (
                        destination,
                      ) => (
                        <option
                          key={
                            destination.id
                          }
                          value={
                            destination.id
                          }
                        >
                          {`${"— ".repeat(
                            destination.depth +
                              1,
                          )}${destination.name}`}
                        </option>
                      ),
                    )}

                  </select>


                  <div className="form-text">
                    La cartella e tutto il
                    suo contenuto verranno
                    mantenuti invariati.
                  </div>

                </div>


                <div className="modal-footer">

                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() =>
                      setMoveOpen(false)
                    }
                  >
                    Annulla
                  </button>

                  <button
                    type="submit"
                    className="btn btn-primary"
                  >
                    Sposta
                  </button>

                </div>
              </form>

            </div>
          </div>
        </div>
      )}


      {/* =====================================================
          MODALE ELIMINA
          ===================================================== */}

      {deleteOpen && (
        <div
          className="modal d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-backdrop show" />

          <div
            className="modal-dialog modal-dialog-centered position-relative"
            style={{
              zIndex: 1060,
            }}
          >
            <div className="modal-content">

              <div className="modal-header">

                <h2 className="modal-title fs-5">
                  Elimina cartella
                </h2>

                <button
                  type="button"
                  className="btn-close"
                  aria-label="Chiudi"
                  onClick={() =>
                    setDeleteOpen(
                      false,
                    )
                  }
                />

              </div>


              <form
                action={
                  archiveFolderAction
                }
              >
                <div className="modal-body">

                  <input
                    type="hidden"
                    name="folder_id"
                    value={folder.id}
                  />

                  {currentFolderId && (
                    <input
                      type="hidden"
                      name="current_folder_id"
                      value={
                        currentFolderId
                      }
                    />
                  )}


                  {usage.empty ? (
                    <>
                      <p>
                        Vuoi eliminare la
                        cartella{" "}
                        <strong>
                          {folder.name}
                        </strong>
                        ?
                      </p>

                      <p className="small text-muted mb-0">
                        La cartella è vuota
                        e può essere
                        eliminata.
                      </p>
                    </>
                  ) : (
                    <>
                      <div
                        className="alert alert-warning"
                        role="alert"
                      >
                        <div className="fw-semibold mb-1">
                          La cartella non
                          può essere
                          eliminata.
                        </div>

                        <div>
                          Contiene{" "}
                          {usage.total}{" "}
                          {usage.total ===
                          1
                            ? "elemento"
                            : "elementi"}
                          .
                        </div>
                      </div>


                      <ul className="small text-muted mb-0">

                        {usage.folders >
                          0 && (
                          <li>
                            {
                              usage.folders
                            }{" "}
                            {usage.folders ===
                            1
                              ? "sottocartella"
                              : "sottocartelle"}
                          </li>
                        )}


                        {usage.documents >
                          0 && (
                          <li>
                            {
                              usage.documents
                            }{" "}
                            {usage.documents ===
                            1
                              ? "documento"
                              : "documenti"}
                          </li>
                        )}

                      </ul>
                    </>
                  )}

                </div>


                <div className="modal-footer">

                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() =>
                      setDeleteOpen(
                        false,
                      )
                    }
                  >
                    Annulla
                  </button>


                  <button
                    type="submit"
                    className="btn btn-danger"
                    disabled={
                      !usage.empty
                    }
                  >
                    Elimina cartella
                  </button>

                </div>
              </form>

            </div>
          </div>
        </div>
      )}
    </>
  );
}