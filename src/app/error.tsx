"use client";
export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return <div className="alert alert-danger" role="alert"><h1 className="h5">Impossibile caricare i dati</h1><p>Si è verificato un errore di accesso o del servizio. Questo messaggio non indica un archivio vuoto.</p><button className="btn btn-outline-danger" onClick={reset}>Riprova</button></div>;
}
