"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type ToastItem = { id: number; kind: "success" | "error"; message: string };

// Legge ?success= / ?error= dall'URL dopo un redirect di una server action, mostra un toast e ripulisce l'URL.
export function ToastNotifications() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    if (!success && !error) return;

    // Sincronizza lo stato interno con i parametri dell'URL (sistema esterno), non stato derivabile a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToasts((prev) => [
      ...prev,
      ...(success ? [{ id: Date.now(), kind: "success" as const, message: success }] : []),
      ...(error ? [{ id: Date.now() + 1, kind: "error" as const, message: error }] : []),
    ]);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("success");
    params.delete("error");
    const query = params.toString();
    // Only remove notification parameters; fetching the page again is unnecessary.
    window.history.replaceState(null, "", `${query ? `${pathname}?${query}` : pathname}${window.location.hash}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (toasts.length === 0) return undefined;
    const timer = setTimeout(() => setToasts((prev) => prev.slice(1)), 4000);
    return () => clearTimeout(timer);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container position-fixed bottom-0 end-0 p-3" style={{ zIndex: 1080 }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast show text-white ${toast.kind === "success" ? "bg-success" : "bg-danger"}`}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <div className="d-flex">
            <div className="toast-body">{toast.message}</div>
            <button
              type="button"
              className="btn-close btn-close-white me-2 m-auto"
              aria-label="Chiudi"
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== toast.id))}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
