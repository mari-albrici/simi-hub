"use client";

import { useFormStatus } from "react-dom";

export function ConfirmSubmitButton({
  children,
  confirmMessage,
  pendingLabel = "Attendere…",
  className = "btn btn-sm btn-outline-danger",
}: {
  children: React.ReactNode;
  confirmMessage: string;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

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
        <>
          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
