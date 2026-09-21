"use client";

import { useRef, useState, type ComponentProps } from "react";
import { LoadingSpinner } from "@/components/ui/loading";

/** Retains the existing link and authorization route, adding signing feedback. */
export function FileLink({ href, children, target, ...props }: ComponentProps<"a"> & { href: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  return <><a {...props} href={href} target={target} aria-busy={pending} aria-disabled={pending} onClick={async event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    const tab = target === "_blank" ? window.open("about:blank", "_blank") : null;
    if (tab) { tab.opener = null; tab.document.title = "Caricamento documento…"; tab.document.body.textContent = "Caricamento documento…"; }
    setPending(true); setError("");
    try {
      const url = new URL(href, window.location.origin); url.searchParams.set("resolve", "1");
      const response = await fetch(url, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || "Impossibile aprire il documento. Riprova.");
      if (tab) tab.location.replace(result.url);
      else window.location.assign(result.url);
    } catch (error) { tab?.close(); setError(error instanceof Error ? error.message : "Impossibile aprire il documento. Riprova."); }
    finally { inFlight.current = false; setPending(false); }
  }}>{pending ? <LoadingSpinner label="Preparazione file…" /> : children}</a>{error && <span className="small text-danger d-block" role="alert">{error}</span>}</>;
}
