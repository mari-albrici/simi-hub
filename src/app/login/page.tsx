import Image from "next/image";
import Link from "@/components/ui/app-link";
import { loginAction } from "@/app/login/actions";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="card shadow-sm border-0">
          <div className="card-body p-4 p-md-5">
            <div className="text-center mb-4">
              <Image
                src="/images/branding/LogoSimi.png"
                alt="SIMI Hub logo"
                width={180}
                height={50}
                priority
                className="mb-3"
                style={{ objectFit: "contain", maxWidth: "100%", height: "auto" }}
              />
              <h1 className="h3 mb-1">SIMI Hub</h1>
              <p className="text-muted mb-0">Accesso portale amministrativo</p>
            </div>

            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            <form action={loginAction}>
              <div className="mb-3">
                <label htmlFor="email" className="form-label">Email aziendale</label>
                <input id="email" name="email" type="email" className="form-control" autoComplete="username" required />
              </div>

              <div className="mb-3">
                <label htmlFor="password" className="form-label">Password</label>
                <input id="password" name="password" type="password" className="form-control" autoComplete="current-password" required minLength={8} />
              </div>

              <div className="d-flex justify-content-between align-items-center mb-3">

                <Link href="/reset-password" className="small text-decoration-none">Password dimenticata?</Link>
              </div>

              <SubmitButton className="btn btn-dark w-100" pendingLabel="Accesso…">Accedi</SubmitButton>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
