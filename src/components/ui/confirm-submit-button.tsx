"use client";

import { useFormStatus } from "react-dom";
import { LoadingSpinner } from "./loading";

export function ConfirmSubmitButton({
  children,
  confirmMessage,
  pendingLabel,
  className = "btn btn-sm btn-outline-danger",
}: {
  children: React.ReactNode;
  confirmMessage: string;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const inferredLabel = typeof children === "string" ? ({ Archivia: "Archiviazione…", Ripristina: "Ripristino…", "Elimina documento": "Eliminazione…", "Scollega": "Scollegamento…" } as Record<string,string>)[children] ?? "Operazione…" : "Operazione…";

  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {pending ? (
        <LoadingSpinner label={pendingLabel ?? inferredLabel} />
      ) : (
        children
      )}
    </button>
  );
}
