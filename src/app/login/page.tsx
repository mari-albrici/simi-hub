import Link from "next/link";
import { loginAction } from "@/app/login/actions";

export default function LoginPage() {
  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="card shadow-sm border-0">
          <div className="card-body p-4 p-md-5">
            <div className="text-center mb-4">
              <div className="d-inline-flex align-items-center justify-content-center rounded-circle bg-dark text-white fw-bold mb-3" style={{ width: 56, height: 56 }}>
                S
              </div>
              <h1 className="h3 mb-1">SIMI Hub</h1>
              <p className="text-muted mb-0">Accesso portale amministrativo</p>
            </div>

            <form action={loginAction} method="post">
              <div className="mb-3">
                <label htmlFor="email" className="form-label">Email aziendale</label>
                <input id="email" name="email" type="email" className="form-control" defaultValue="admin@simisrl.eu" required />
              </div>

              <div className="mb-3">
                <label htmlFor="password" className="form-label">Password</label>
                <input id="password" name="password" type="password" className="form-control" defaultValue="password123" required minLength={8} />
              </div>

              <div className="d-flex justify-content-between align-items-center mb-3">
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="remember" />
                  <label className="form-check-label" htmlFor="remember">Ricordami</label>
                </div>
                <Link href="/reset-password" className="small text-decoration-none">Password dimenticata?</Link>
              </div>

              <button type="submit" className="btn btn-dark w-100">Accedi</button>
            </form>

            <div className="mt-4 small text-muted">
              Domini autorizzati: <strong>simisrl.eu</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
