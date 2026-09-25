import { FilterForm } from "@/components/ui/filter-form";
import { FilterToolbar } from "@/components/ui/filter-toolbar";
import Link from "@/components/ui/app-link";
import { CreateFolderTrigger } from "@/components/documents/create-folder-trigger";
import { FolderCard } from "@/components/documents/folder-card";

import {
    getAccessScope,
    requirePagePermission,
} from "@/lib/permissions";

import {
    searchDocuments,
    documentOptions,
    getDocumentsInFolder,
} from "@/lib/documents";

import {
    getFolderContents,
    getFolderUsageMap,
    getFolderTree,
} from "@/lib/folders";

import { DocumentsTable } from "@/components/documents/documents-table";
import { UploadDocumentTrigger } from "@/components/documents/upload-document-trigger";

import { documentStatusLabels } from "@/lib/document-validation";


export default async function Page({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    await requirePagePermission("document.read");

    const p = await searchParams;

    /*
     * folder è separato dai filtri normali.
     *
     * Assenza di folder = root Documenti.
     */
    const folderId =
        typeof p.folder === "string" && p.folder
            ? p.folder
            : null;

    /*
     * Se è presente una ricerca o un filtro, manteniamo il
     * comportamento globale già esistente.
     *
     * Senza ricerca/filtri siamo invece in modalità
     * "Esplora file".
     */
    const hasFilters = Boolean(
        p.q ||
        p.category ||
        p.status ||
        p.country ||
        p.from ||
        p.to ||
        p.entity ||
        p.project ||
        p.company ||
        p.invoice ||
        p.expiry ||
        p.sort ||
        p.direction ||
        p.page,
    );

    const [
        result,
        options,
        access,
        folderContents,
        directoryDocuments,
        folderTree,
    ] = await Promise.all([
        searchDocuments(p),

        documentOptions(),

        getAccessScope("document"),

        getFolderContents(
            folderId,
            "documents",
        ),

        getDocumentsInFolder(
            folderId,
        ),

        getFolderTree(
            "documents",
        ),
    ]);

    const folderUsage =
        await getFolderUsageMap(
            folderContents.folders.map(
                (folder) => folder.id,
            ),
        );


    const select = (
        name: string,
        label: string,
        rows: {
            id: string;
            label: string;
        }[],
    ) => (
        <div
            className="col-md-3"
            key={name}
        >
            <label
                className="form-label small"
                htmlFor={name}
            >
                {label}
            </label>

            <select
                className="form-select form-select-sm"
                id={name}
                name={name}
                defaultValue={
                    p[name] ||
                    (
                        name === "sort"
                            ? "created_at"
                            : ""
                    )
                }
            >
                {name !== "sort" && (
                    <option value="">
                        Tutti
                    </option>
                )}

                {rows.map((x) => (
                    <option
                        key={x.id}
                        value={x.id}
                    >
                        {x.label}
                    </option>
                ))}
            </select>
        </div>
    );


    const href = (
        page: number,
    ) =>
        `/documenti?${new URLSearchParams({
            ...Object.fromEntries(
                Object.entries(p).filter(
                    (entry): entry is [string, string] =>
                        Boolean(entry[1]),
                ),
            ),
            page: String(page),
        })}`;


    /*
     * Mantiene la cartella corrente quando l'utente utilizza
     * "Azzera".
     */
    const resetHref =
        folderId
            ? `/documenti?folder=${encodeURIComponent(folderId)}`
            : "/documenti";


    return (
        <>
            {/* =====================================================
          HEADER
          ===================================================== */}

            <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3">
                <h1 className="h3 mb-0">
                    Documenti
                </h1>

                {access.canUpload && (
                    <div className="d-flex align-items-center gap-2">
                        <CreateFolderTrigger
                            parentId={folderId}
                        />

                        <UploadDocumentTrigger />
                    </div>
                )}
            </div>


            {p.error && (
                <p
                    role="alert"
                    className="alert alert-danger"
                >
                    {p.error}
                </p>
            )}


            {/* =====================================================
          BREADCRUMB CARTELLE
          ===================================================== */}

            <nav
                aria-label="Percorso cartella"
                className="mb-3"
            >
                <ol className="breadcrumb mb-0">

                    <li
                        className={
                            folderId === null
                                ? "breadcrumb-item active"
                                : "breadcrumb-item"
                        }
                        aria-current={
                            folderId === null
                                ? "page"
                                : undefined
                        }
                    >
                        {folderId === null ? (
                            <>
                                <i
                                    className="bi bi-folder2-open me-2"
                                    aria-hidden="true"
                                />
                                Documenti
                            </>
                        ) : (
                            <Link href="/documenti">
                                <i
                                    className="bi bi-folder2-open me-2"
                                    aria-hidden="true"
                                />
                                Documenti
                            </Link>
                        )}
                    </li>


                    {folderContents.breadcrumb.map(
                        (folder, index) => {
                            const isLast =
                                index ===
                                folderContents.breadcrumb.length - 1;

                            return (
                                <li
                                    key={folder.id}
                                    className={
                                        isLast
                                            ? "breadcrumb-item active"
                                            : "breadcrumb-item"
                                    }
                                    aria-current={
                                        isLast
                                            ? "page"
                                            : undefined
                                    }
                                >
                                    {isLast ? (
                                        folder.name
                                    ) : (
                                        <Link
                                            href={`/documenti?folder=${encodeURIComponent(
                                                folder.id,
                                            )}`}
                                        >
                                            {folder.name}
                                        </Link>
                                    )}
                                </li>
                            );
                        },
                    )}

                </ol>
            </nav>


            {/* =====================================================
          FILTRI
          ===================================================== */}

            <FilterForm>

                {/*
         * Manteniamo folder nel form quando siamo dentro
         * una cartella.
         */}
                {folderId && (
                    <input
                        type="hidden"
                        name="folder"
                        value={folderId}
                    />
                )}

                <FilterToolbar
                    activeCount={[
                        p.country,
                        p.from,
                        p.to,
                        p.entity,
                        p.project,
                        p.company,
                        p.invoice,
                        p.expiry,
                        p.sort &&
                        p.sort !== "created_at",
                        p.direction === "asc",
                    ].filter(Boolean).length}

                    advanced={
                        <>
                            {[
                                [
                                    "country",
                                    "Paese",
                                    "text",
                                ],
                                [
                                    "from",
                                    "Data documento dal",
                                    "date",
                                ],
                                [
                                    "to",
                                    "Al",
                                    "date",
                                ],
                            ].map(
                                ([
                                    name,
                                    label,
                                    type,
                                ]) => (
                                    <div
                                        key={name}
                                        className="col-md-3"
                                    >
                                        <label
                                            className="form-label small"
                                            htmlFor={name}
                                        >
                                            {label}
                                        </label>

                                        <input
                                            id={name}
                                            name={name}
                                            type={type}
                                            className="form-control form-control-sm"
                                            defaultValue={
                                                p[name]
                                            }
                                        />
                                    </div>
                                ),
                            )}


                            {select(
                                "entity",
                                "Società SIMI",
                                options.entities.map(
                                    (x) => ({
                                        id: x.id,
                                        label:
                                            x.business_name,
                                    }),
                                ),
                            )}


                            {select(
                                "project",
                                "Commessa",
                                options.projects.map(
                                    (x) => ({
                                        id: x.id,
                                        label:
                                            x.project_code,
                                    }),
                                ),
                            )}


                            {select(
                                "company",
                                "Controparte",
                                options.companies.map(
                                    (x) => ({
                                        id: x.id,
                                        label:
                                            x.business_name,
                                    }),
                                ),
                            )}


                            {select(
                                "invoice",
                                "Fattura",
                                options.invoices.map(
                                    (x) => ({
                                        id: x.id,
                                        label:
                                            x.invoice_number,
                                    }),
                                ),
                            )}


                            {select(
                                "expiry",
                                "Scadenza",
                                [
                                    {
                                        id: "none",
                                        label:
                                            "Senza scadenza",
                                    },
                                    {
                                        id: "overdue",
                                        label:
                                            "Scaduti",
                                    },
                                    {
                                        id: "30",
                                        label:
                                            "Entro 30 giorni",
                                    },
                                ],
                            )}


                            {select(
                                "sort",
                                "Ordina per",
                                [
                                    {
                                        id: "created_at",
                                        label:
                                            "Caricamento",
                                    },
                                    {
                                        id: "document_date",
                                        label:
                                            "Data documento",
                                    },
                                    {
                                        id: "title",
                                        label:
                                            "Titolo",
                                    },
                                    {
                                        id: "expiry_date",
                                        label:
                                            "Scadenza",
                                    },
                                    {
                                        id: "reference",
                                        label:
                                            "Riferimento",
                                    },
                                ],
                            )}


                            <div className="col-md-3">

                                <label
                                    className="form-label small"
                                    htmlFor="direction"
                                >
                                    Direzione
                                </label>

                                <select
                                    id="direction"
                                    name="direction"
                                    className="form-select form-select-sm"
                                    defaultValue={
                                        result.filters.direction
                                    }
                                >
                                    <option value="desc">
                                        Decrescente
                                    </option>

                                    <option value="asc">
                                        Crescente
                                    </option>
                                </select>

                            </div>
                        </>
                    }
                >

                    <div>
                        <label
                            className="form-label"
                            htmlFor="q"
                        >
                            Ricerca
                        </label>

                        <input
                            id="q"
                            name="q"
                            className="form-control"
                            defaultValue={p.q}
                        />
                    </div>


                    {select(
                        "category",
                        "Categoria",
                        options.categories.map(
                            (x) => ({
                                id: x.id,
                                label:
                                    `${x.code} — ${x.name}`,
                            }),
                        ),
                    )}


                    {select(
                        "status",
                        "Stato",
                        Object.entries(
                            documentStatusLabels,
                        ).map(
                            ([id, label]) => ({
                                id,
                                label,
                            }),
                        ),
                    )}


                    <div className="col-auto">
                        <Link
                            className="btn btn-outline-secondary"
                            href={resetHref}
                        >
                            Azzera
                        </Link>
                    </div>

                </FilterToolbar>

            </FilterForm>


            {!access.canUpload && (
                <p className="small text-muted">
                    Il tuo ruolo consente la consultazione
                    dei documenti, non il caricamento.
                </p>
            )}


            {/* =====================================================
    CARTELLE
    ===================================================== */}

            {!hasFilters &&
                folderContents.folders.length > 0 && (
                    <div className="row g-3 mb-4">

                        {folderContents.folders.map(
                            (folder) => (
                                <div
                                    key={folder.id}
                                    className="col-12 col-sm-6 col-lg-4 col-xl-3"
                                >
                                    <FolderCard
                                        folder={folder}
                                        currentFolderId={folderId}
                                        canManage={access.canUpload}
                                        usage={
                                            folderUsage[folder.id] ?? {
                                                folders: 0,
                                                documents: 0,
                                                total: 0,
                                                empty: true,
                                            }
                                        }
                                        folderTree={folderTree}
                                    />
                                </div>
                            ),
                        )}

                    </div>
                )}

            {/* =====================================================
          RISULTATI
          ===================================================== */}

            {hasFilters ? (
                <>
                    {!result.count && (
                        <div className="app-card p-3 mb-3">

                            <p>
                                Nessun documento presente per
                                i filtri selezionati.
                            </p>

                            {access.canUpload && (
                                <UploadDocumentTrigger />
                            )}

                        </div>
                    )}


                    <p className="small text-muted">
                        {result.count} documenti
                    </p>


                    <DocumentsTable
                        documents={result.rows}
                        folderTree={folderTree}
                        currentFolderId={folderId}
                        canManage={access.canUpload}
                    />


                    <nav className="d-flex gap-3">

                        {result.filters.page > 1 && (
                            <Link
                                href={href(
                                    result.filters.page - 1,
                                )}
                            >
                                Precedente
                            </Link>
                        )}


                        <span>
                            Pagina {result.filters.page}
                        </span>


                        {result.filters.page * 50 <
                            result.count && (
                                <Link
                                    href={href(
                                        result.filters.page + 1,
                                    )}
                                >
                                    Successiva
                                </Link>
                            )}

                    </nav>
                </>
            ) : (
                <>
                    {!folderContents.folders.length &&
                        !directoryDocuments.count && (
                            <div className="app-card p-3 mb-3">
                                <p className="mb-0 text-muted">
                                    Questa cartella è vuota.
                                </p>
                            </div>
                        )}


                    {directoryDocuments.count > 0 && (
                        <>
                            <p className="small text-muted">
                                {directoryDocuments.count}{" "}
                                {directoryDocuments.count === 1
                                    ? "documento"
                                    : "documenti"}
                            </p>

                            <DocumentsTable
                                documents={directoryDocuments.documents}
                                folderTree={folderTree}
                                currentFolderId={folderId}
                                canManage={access.canUpload}
                            />
                        </>
                    )}
                </>
            )}
        </>
    );
}