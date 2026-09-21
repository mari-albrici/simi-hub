import { logoutAction } from "@/app/login/actions";
import { Suspense } from "react";
import { PortalNavigation, MobileNavigationClose, MobileMenuButton } from "@/components/ui/portal-navigation";
import { SubmitButton } from "@/components/ui/submit-button";
import Image from "next/image";
import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { getSessionUser } from "@/lib/session";
import { canAccessPage } from "@/lib/permissions";
import { ToastNotifications } from "@/components/ui/toast-notifications";
import CurrentDateTime from "@/components/CurrentDateTime";

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
      <aside className="sidebar desktop-sidebar d-none d-lg-block px-3 py-4">
        <div className="d-flex align-items-center gap-3 px-2 pb-4">
          <Link href="/dashboard" className="d-flex align-items-center text-decoration-none" aria-label="SIMI Hub home">
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

        <PortalNavigation items={visibleNav} />
      </aside>

      <div className="portal-content flex-grow-1 d-flex flex-column">
        <div id="navigation-feedback" aria-live="polite" />
        <header className="topbar px-4 py-3 d-flex align-items-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-3">
            <MobileMenuButton />
          </div>

          <div className="flex-grow-1" />

          <div className="d-flex align-items-center gap-3">
  <CurrentDateTime />

  <div className="dropdown">
    <button
      className="btn p-0 border-0 dropdown-toggle user-avatar-dropdown"
      type="button"
      data-bs-toggle="dropdown"
      aria-expanded="false"
      aria-label={`Menu utente ${sessionUser.name}`}
    >
      <span className="user-avatar">
        {sessionUser.name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => word[0])
          .join("")
          .toUpperCase()}
      </span>
    </button>

    <ul className="dropdown-menu dropdown-menu-end">
      <li>
        <hr className="dropdown-divider" />
      </li>
      <li>
        <form action={logoutAction}>
          <SubmitButton
            className="dropdown-item text-start"
            pendingLabel="Uscita…"
          >
            Logout
          </SubmitButton>
        </form>
      </li>
    </ul>
  </div>
</div>
        </header>

        <div className="offcanvas offcanvas-start sidebar" tabIndex={-1} id="mobileSidebar" aria-labelledby="mobileMenuTitle">
          <MobileNavigationClose />
          <div className="offcanvas-header border-bottom"><span id="mobileMenuTitle" className="visually-hidden">Menu principale</span>
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
            <button type="button" className="btn-close" data-bs-dismiss="offcanvas" aria-label="Chiudi menu"></button>
          </div>
          <div className="offcanvas-body">
            <PortalNavigation items={visibleNav} mobile />
          </div>
        </div>

        <main className="portal-main flex-grow-1 p-3 p-lg-4">{children}</main>
      </div>

      <Suspense fallback={null}>
        <ToastNotifications />
      </Suspense>
    </div>
  );
}
