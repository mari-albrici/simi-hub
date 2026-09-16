import Link from "next/link";

export default function ResetPasswordPage() {
  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="card shadow-sm border-0">
          <div className="card-body p-4 p-md-5">
            <h1 className="h3 mb-3">Recupero password</h1>
            <p className="text-muted">Inserisci l’indirizzo email aziendale per ricevere le istruzioni di reset.</p>

            <form>
              <div className="mb-3">
                <label htmlFor="resetEmail" className="form-label">Email aziendale</label>
                <input id="resetEmail" type="email" className="form-control" placeholder="nome@azienda.it" />
              </div>

              <button type="button" className="btn btn-dark w-100 mb-3">Invia link</button>
              <Link href="/login" className="btn btn-outline-secondary w-100">Torna al login</Link>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
