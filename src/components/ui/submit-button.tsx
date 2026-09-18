"use client";

import { useFormStatus } from "react-dom";
import { LoadingSpinner } from "./loading";

export function SubmitButton({
  children,
  pendingLabel = "Caricamento…",
  className = "btn btn-dark w-100",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (
        <LoadingSpinner label={pendingLabel} />
      ) : (
        children
      )}
    </button>
  );
}
