"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/ui/app-link";
import {
  uploadDocumentAction,
  reserveDocumentUploadAction,
  finalizeDirectDocumentUploadAction,
  type UploadState,
} from "@/lib/upload";
import {
  DocumentFields,
  ContextFields,
  type DocumentOptions,
} from "./document-fields";
import { LoadingSpinner } from "@/components/ui/loading";
import { createClient } from "@/lib/supabase/client";
import {
  validateDocumentFile,
  documentHash,
} from "@/lib/files";

function serializeForm(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    /*
     * Il File NON deve mai essere serializzato e inviato
     * alla Server Action.
     */
    if (value instanceof File) continue;

    result[key] = value;
  }

  return result;
}

export function UploadDocumentForm({
  options,
  values = {},
  scopes,
  documentId,
}: {
  options: DocumentOptions;
  values?: Record<string, unknown>;
  scopes: string[];
  documentId?: string;
}) {
  const router = useRouter();

  const [state, setState] = useState<UploadState>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (pending) return;

    const formElement = event.currentTarget;

    const nativeEvent = event.nativeEvent as SubmitEvent;
    const submitter = nativeEvent.submitter as
      | HTMLButtonElement
      | null;

    const form = new FormData(
      formElement,
      submitter ?? undefined,
    );

    /*
     * Il pulsante di riuso NON carica alcun file.
     * Manteniamo quindi la Server Action esistente.
     */
    const intent = String(form.get("intent") || "");

    if (intent.startsWith("reuse:")) {
      setPending(true);
      setState({});

      try {
        const result = await uploadDocumentAction({}, form);

        if (result) {
          setState(result);
        }
      } catch (error) {
        console.error(error);

        setState({
          error:
            "Impossibile collegare il documento esistente.",
        });
      } finally {
        setPending(false);
      }

      return;
    }

    const file = form.get("file");

   if (!(file instanceof File) || file.size === 0) {
  setState({
    error: "Seleziona un file.",
  });

  return;
}

try {
  await validateDocumentFile(file);
} catch (error) {
  setState({
    error:
      error instanceof Error
        ? error.message
        : "Il file selezionato non è valido.",
  });

  return;
}

    setPending(true);
    setState({});

    let reserved:
      | {
          documentId: string;
          versionId: string;
          storagePath: string;
        }
      | undefined;

    try {
      /*
       * 1. Calcolo SHA-256 direttamente nel browser.
       *
       * I byte del file restano sul client.
       */
const hash = await documentHash(file);
      /*
       * 2. Rimuoviamo completamente il File dai dati
       * inviati alla Server Action.
       */
      const serializedForm = serializeForm(form);

      /*
       * 3. Prenotazione server-side.
       *
       * Questa richiesta contiene soltanto metadata,
       * dimensione, MIME type e hash.
       */
      const reserve =
        await reserveDocumentUploadAction({
          form: serializedForm,
          file: {
            name: file.name,
            type: file.type,
            size: file.size,
            hash,
          },
        });

      if (!reserve.ok) {
        if ("duplicates" in reserve && reserve.duplicates) {
          setState({
            duplicates: reserve.duplicates,
          });

          return;
        }

        setState({
          error:
            ("error" in reserve && reserve.error) ||
            "Impossibile preparare il caricamento.",
        });

        return;
      }

      reserved = {
        documentId: reserve.documentId,
        versionId: reserve.versionId,
        storagePath: reserve.storagePath,
      };

      /*
       * 4. Upload DIRETTO:
       *
       * Browser -> Supabase Storage
       *
       * Il file NON attraversa Vercel.
       */
      const supabase = createClient();

      const { error: uploadError } = await supabase.storage
        .from("simi-documents")
        .upload(reserve.storagePath, file, {
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        console.error(
          "Errore upload Supabase Storage:",
          uploadError,
        );

        setState({
          error:
            "Il caricamento del file non è riuscito. Riprova.",
        });

        return;
      }

      /*
       * 5. File presente nello Storage.
       * Ora finalizziamo la versione lato server.
       */
      const finalized =
        await finalizeDirectDocumentUploadAction({
          documentId: reserve.documentId,
          versionId: reserve.versionId,
          acknowledgeDuplicate:
            form.get("acknowledge_duplicate") === "1",
        });

      if (!finalized.ok) {
        setState({
          error:
            finalized.error ||
            "Il file è stato caricato ma non è stato possibile finalizzare il documento.",
        });

        return;
      }

      /*
       * 6. Successo.
       */
      router.push(
        `/documenti/${finalized.documentId}?success=${encodeURIComponent(
          "Documento salvato",
        )}`,
      );

      router.refresh();
    } catch (error) {
      console.error(
        "Errore caricamento documento:",
        error,
      );

      setState({
        error:
          reserved
            ? `Si è verificato un errore durante il caricamento. La prenotazione del documento ${reserved.documentId} è stata creata.`
            : "Si è verificato un errore durante il caricamento del documento.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="row g-3"
    >
      {[
        "order",
        "delivery_note",
        "offer",
        "contract",
        "employee",
      ].map((key) =>
        values[key] ? (
          <input
            key={key}
            type="hidden"
            name={key}
            value={String(values[key])}
          />
        ) : null,
      )}

      {documentId ? (
        <input
          type="hidden"
          name="document_id"
          value={documentId}
        />
      ) : (
        <>
          <DocumentFields
            options={options}
            values={values}
            scopes={scopes}
          />

          <ContextFields
            options={options}
            values={values}
          />
        </>
      )}

      <div className="col-12">
        <label
          className="form-label"
          htmlFor="file"
        >
          File originale — PDF, JPEG, PNG, WebP · massimo
          10 MB
        </label>

        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="form-control"
          required
          disabled={pending}
        />
      </div>

      <div className="col-md-6">
        <label
          className="form-label"
          htmlFor="version_label"
        >
          Etichetta versione (es. firmata)
        </label>

        <input
          id="version_label"
          name="version_label"
          className="form-control"
          maxLength={200}
          disabled={pending}
        />
      </div>

      <div className="col-md-6">
        <label
          className="form-label"
          htmlFor="version_notes"
        >
          Note versione
        </label>

        <input
          id="version_notes"
          name="version_notes"
          className="form-control"
          maxLength={2000}
          disabled={pending}
        />
      </div>

      {state.error && (
        <div className="col-12">
          <p
            className="alert alert-danger"
            role="alert"
          >
            {state.error}
          </p>
        </div>
      )}

      {state.duplicates && (
        <div className="col-12">
          <div className="alert alert-warning">
            <strong>
              Questo file risulta già presente
              nell&apos;archivio.
            </strong>

            <ul>
              {state.duplicates.map((duplicate) => (
                <li key={duplicate.id}>
                  <Link
                    href={`/documenti/${duplicate.id}`}
                  >
                    {duplicate.title}
                  </Link>
                  {" — "}
                  {duplicate.where}

                  {duplicate.archived &&
                    " · Archiviato"}

                  {!documentId &&
                    !duplicate.archived && (
                      <button
                        className="btn btn-sm btn-outline-dark ms-2"
                        name="intent"
                        value={`reuse:${duplicate.id}`}
                        disabled={pending}
                        formNoValidate
                      >
                        Usa questo documento e aggiungi i
                        collegamenti
                      </button>
                    )}
                </li>
              ))}
            </ul>

            <p className="small">
              Il riuso conserva i metadata esistenti e
              aggiunge soltanto i collegamenti selezionati.
            </p>

            <label className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                name="acknowledge_duplicate"
                value="1"
                disabled={pending}
              />
              Confermo che serve un nuovo file/versione con
              lo stesso contenuto.
            </label>
          </div>
        </div>
      )}

      <div className="col-12">
        <button
          className="btn btn-dark"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? (
            <LoadingSpinner label="Caricamento documento…" />
          ) : documentId ? (
            "Carica nuova versione"
          ) : (
            "Carica documento"
          )}
        </button>
      </div>
    </form>
  );
}