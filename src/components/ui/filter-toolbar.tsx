"use client";

import { useId, useState, type ReactNode } from "react";

/** Shared compact toolbar; active advanced filters stay applied while collapsed. */
export function FilterToolbar({ children, advanced, activeCount = 0 }: { children: ReactNode; advanced?: ReactNode; activeCount?: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="filter-toolbar mb-3"><div className="filter-primary">
    {children}
    {advanced && <div className="col-auto"><button type="button" className="btn btn-outline-secondary" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><i className="bi bi-funnel" aria-hidden="true"/>Filtri{activeCount > 0 && <span className="badge text-bg-secondary">{activeCount}<span className="visually-hidden"> filtri avanzati attivi</span></span>}</button></div>}
    <div className="col-auto"><button className="btn btn-dark" type="submit">Applica</button></div>
    {advanced && <div id={id} className="filter-advanced" hidden={!open}><div className="border-top pt-3 mt-2"><h2 className="h6">Filtri avanzati</h2><div className="row g-2">{advanced}</div></div></div>}
  </div></div>;
}
