"use client";
import { useTransition, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "./loading";
/** GET navigation preserves bookmarkable filters and gives immediate transition feedback. */
export function FilterForm({ children, ...props }: Omit<ComponentProps<"form">, "action" | "onSubmit">) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <form {...props} method="get" aria-busy={pending} onSubmit={event => {
    event.preventDefault();
    const query = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => { if (typeof value === "string" && value) query.append(key, value); });
    startTransition(() => router.push(`${window.location.pathname}?${query}`));
  }}>{children}{pending && <div role="status" className="mb-2"><LoadingSpinner label="Aggiornamento elenco…" /></div>}</form>;
}
