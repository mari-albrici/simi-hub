"use client";

import { useId, useRef, type ReactNode } from "react";

export function RowActionsMenu({ label = "Azioni", children }: { label?: string; children: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  return <div className="row-actions">
    <button ref={trigger} type="button" popoverTarget={id} className="btn btn-sm btn-outline-secondary" aria-label={label} title={label}><i className="bi bi-three-dots-vertical" aria-hidden="true" /></button>
    <div id={id} popover="auto" className="row-actions-menu" onToggle={event => {
      if (event.newState !== "open" || !trigger.current) return;
      const menu = event.currentTarget;
      const rect = trigger.current.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${Math.max(8, rect.bottom + menu.offsetHeight + 8 <= window.innerHeight ? rect.bottom + 4 : rect.top - menu.offsetHeight - 4)}px`;
    }}>{children}</div>
  </div>;
}
