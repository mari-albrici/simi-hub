"use client";
import NextLink, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import type { ComponentProps } from "react";
import { LoadingSpinner } from "./loading";
function LinkFeedback() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  const target = typeof document !== "undefined" ? document.getElementById("navigation-feedback") : null;
  return target ? createPortal(<div className="navigation-progress"><LoadingSpinner label="Caricamento pagina…" /></div>, target) : <LoadingSpinner label="Caricamento…" />;
}
export default function AppLink({ children, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink {...props}>{children}<LinkFeedback /></NextLink>;
}
