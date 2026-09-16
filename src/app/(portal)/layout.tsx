import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { getSessionUser } from "@/lib/session";
import { canAccessPage } from "@/lib/permissions";

export default async function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect("/login");
  }

  const allowedItems = await Promise.all(
    NAV_ITEMS.map(async (item) => ({
      ...item,
      allowed: await canAccessPage(item.href),
    })),
  );

  const visibleNav = allowedItems.filter((item) => item.allowed);

  return (
    <div className="portal-shell d-flex">
      <aside className="sidebar d-none d-lg-block px-3 py-4" style={{ width: 260 }}>
        <div className="d-flex align-items-center gap-3 px-2 pb-4 text-white">
          <Link href="/dashboard" className="d-flex align-items-center text-decoration-none text-white" aria-label="SIMI Hub home">
            <Image
              src="/images/branding/LogoSimi.png"
              alt="SIMI Hub logo"
              width={150}
              height={42}
              priority
              style={{ objectFit: "contain", maxWidth: "100%", height: "auto" }}
            />
          </Link>
        </div>

        <nav className="nav flex-column gap-1">
          {visibleNav.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex-grow-1 d-flex flex-column">
        <header className="topbar px-4 py-3 d-flex align-items-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-3">
            <button className="btn btn-outline-secondary d-lg-none" type="button" data-bs-toggle="offcanvas" data-bs-target="#mobileSidebar">
              ☰
            </button>
            <div className="d-none d-md-block">
              <div className="fw-semibold">SIMI Hub</div>
            </div>
          </div>

          <div className="flex-grow-1 d-flex justify-content-center">
            <div className="input-group wide-search">
              <span className="input-group-text bg-white">🔎</span>
              <input className="form-control" type="search" placeholder="Cerca commessa, fattura, azienda, documento..." aria-label="Cerca" />
            </div>
          </div>

          <div className="dropdown">
            <button className="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              {sessionUser.name}
            </button>
            <ul className="dropdown-menu dropdown-menu-end">
              <li><a className="dropdown-item" href="#">Profilo</a></li>
              <li><a className="dropdown-item" href="#">Impostazioni</a></li>
              <li><hr className="dropdown-divider" /></li>
              <li>
                <form action="/logout" method="post">
                  <button className="dropdown-item text-start" type="submit">Logout</button>
                </form>
              </li>
            </ul>
          </div>
        </header>

        <div className="offcanvas offcanvas-start sidebar" tabIndex={-1} id="mobileSidebar">
          <div className="offcanvas-header text-white border-bottom border-secondary">
            <Link href="/dashboard" className="d-flex align-items-center text-decoration-none" aria-label="SIMI Hub home">
              <Image
                src="/images/branding/LogoSimi.png"
                alt="SIMI Hub logo"
                width={120}
                height={34}
                priority
                style={{ objectFit: "contain", maxWidth: "100%", height: "auto" }}
              />
            </Link>
            <button type="button" className="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Close"></button>
          </div>
          <div className="offcanvas-body">
            <nav className="nav flex-column gap-1">
              {visibleNav.map((item) => (
                <Link key={item.href} href={item.href} className="nav-link">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <main className="flex-grow-1 p-4">{children}</main>
      </div>
    </div>
  );
}
