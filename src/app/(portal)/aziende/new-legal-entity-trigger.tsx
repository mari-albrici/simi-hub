"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { createLegalEntityAction } from "@/lib/crud";

export function NewLegalEntityTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn btn-dark" onClick={() => setOpen(true)}>+ Nuova azienda</button>
      {open && (
        <Modal title="Nuova azienda SIMI" onClose={() => setOpen(false)}>
          <form action={createLegalEntityAction} className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Ragione sociale</label>
              <input name="business_name" className="form-control" required />
            </div>
            <div className="col-md-6">
              <label className="form-label">Codice</label>
              <input name="code" className="form-control" placeholder="es. SIMI-02" />
            </div>
            <div className="col-md-6">
              <label className="form-label">P. IVA</label>
              <input name="vat_number" className="form-control" />
            </div>
            <div className="col-md-6">
              <label className="form-label">Codice fiscale</label>
              <input name="tax_code" className="form-control" />
            </div>
            <div className="col-md-8">
              <label className="form-label">Indirizzo</label>
              <input name="address" className="form-control" />
            </div>
            <div className="col-md-4">
              <label className="form-label">Città</label>
              <input name="city" className="form-control" />
            </div>
            <div className="col-md-4">
              <label className="form-label">Paese</label>
              <input name="country" className="form-control" defaultValue="Italia" />
            </div>
            <div className="col-md-4">
              <label className="form-label">Email</label>
              <input name="email" type="email" className="form-control" />
            </div>
            <div className="col-md-4">
              <label className="form-label">Telefono</label>
              <input name="phone" className="form-control" />
            </div>
            <div className="col-12 d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-secondary" onClick={() => setOpen(false)}>Annulla</button>
              <SubmitButton className="btn btn-dark">Salva</SubmitButton>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
