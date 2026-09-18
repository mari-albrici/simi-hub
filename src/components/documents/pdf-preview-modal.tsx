"use client";

import { useEffect, useRef, useState } from "react";
import { LoadingSpinner } from "@/components/ui/loading";

type PdfPreviewModalProps = {
  versionId: string;
  filename: string;
  label?: string;
};

export function PdfPreviewModal({ versionId, filename, label = "Visualizza PDF" }: PdfPreviewModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const fileUrl = `/documenti/versioni/${versionId}/file`;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKeyDown);
    closeButton.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return <>
    <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => { setLoading(true); setError(false); setAttempt((value) => value + 1); setOpen(true); }}>
      <i className="bi bi-file-earmark-pdf me-1" aria-hidden="true" />{label}
    </button>
    {open && <div className="modal d-block pdf-preview-modal" role="dialog" aria-modal="true" aria-labelledby="pdf-preview-title">
      <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h2 className="modal-title fs-6 text-truncate" id="pdf-preview-title">{filename}</h2>
            <div className="d-flex align-items-center gap-2 ms-auto">
              <a className="btn btn-sm btn-outline-secondary" href={`${fileUrl}?download=1`}><i className="bi bi-download me-1" aria-hidden="true" />Scarica</a>
              <a className="btn btn-sm btn-outline-secondary" href={fileUrl} target="_blank" rel="noreferrer"><i className="bi bi-box-arrow-up-right me-1" aria-hidden="true" />Apri</a>
              <button ref={closeButton} type="button" className="btn-close" aria-label="Chiudi anteprima PDF" onClick={() => setOpen(false)} />
            </div>
          </div>
          <div className="modal-body p-0 pdf-preview-body position-relative" aria-busy={loading}>
            {loading && <div className="pdf-loading-state"><LoadingSpinner label="Caricamento PDF…" /></div>}
            {error ? <div className="pdf-error-state"><p className="mb-2">Impossibile caricare il PDF.</p><button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setError(false); setLoading(true); setAttempt((value) => value + 1); }}>Riprova</button></div> : <iframe key={attempt} title={`Anteprima PDF ${filename}`} src={fileUrl} className="pdf-preview-frame" onLoad={() => setLoading(false)} onError={() => { setLoading(false); setError(true); }} />}
          </div>
        </div>
      </div>
      <button type="button" className="modal-backdrop fade show" aria-label="Chiudi anteprima PDF" onClick={() => setOpen(false)} />
    </div>}
  </>;
}
