import {
  Suspense,
} from "react";

import Image from "next/image";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/login/actions";
import CurrentDateTime from "@/components/CurrentDateTime";
import {
  MobileMenuButton,
  MobileNavigationClose,
  PortalNavigation,
} from "@/components/ui/portal-navigation";
import { GlobalSearch } from "@/components/ui/global-search";
import Link from "@/components/ui/app-link";
import { SubmitButton } from "@/components/ui/submit-button";
import { ToastNotifications } from "@/components/ui/toast-notifications";
import { NAV_ITEMS } from "@/lib/constants";
import { canAccessPage } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";

export default async function PortalLayout({
  children,
}: Readonly<{
  children:
    React.ReactNode;
}>) {
  const sessionUser =
    await getSessionUser();

  if (!sessionUser) {
    redirect("/login");
  }

  const allowedItems =
    await Promise.all(
      NAV_ITEMS.map(
        async (
          item,
        ) => ({
          ...item,

          allowed:
            await canAccessPage(
              item.href,
            ),
        }),
      ),
    );

  const visibleNav =
    allowedItems.filter(
      (item) =>
        item.allowed,
    );

  return (
    <div className="portal-shell d-flex">
      <aside className="sidebar desktop-sidebar d-none d-lg-block px-3 py-4">
        <div className="d-flex align-items-center gap-3 px-2 pb-4">
          <Link
            href="/dashboard"
            className="d-flex align-items-center text-decoration-none"
            aria-label="SIMI Hub home"
          >
            <Image
              src="/images/branding/LogoSimi.png"
              alt="SIMI Hub logo"
              width={150}
              height={42}
              priority
              style={{
                objectFit:
                  "contain",
                maxWidth:
                  "100%",
                height:
                  "auto",
              }}
            />
          </Link>
        </div>

        <PortalNavigation
          items={
            visibleNav
          }
        />
      </aside>

      <div className="portal-content flex-grow-1 d-flex flex-column">
        <div
          id="navigation-feedback"
          aria-live="polite"
        />

        <header className="topbar px-3 px-lg-4 py-3 d-flex flex-wrap align-items-center gap-3">
          {/* Sinistra */}
          <div className="topbar-left d-flex align-items-center">
            <MobileMenuButton />
          </div>

          {/* Logo mobile */}
          <Link
            href="/dashboard"
            className="topbar-mobile-logo d-lg-none"
            aria-label="SIMI Hub home"
          >
            <Image
              src="/images/branding/LogoSimi.png"
              alt="SIMI"
              width={
                125
              }
              height={
                65
              }
              priority
              style={{
                objectFit:
                  "contain",
                width:
                  "auto",
                height:
                  "65px",
              }}
            />
          </Link>

          {/* Ricerca globale desktop */}
          <div
            className="d-none d-lg-block flex-grow-1 mx-lg-3"
            style={{
              maxWidth:
                620,
            }}
          >
            <GlobalSearch />
          </div>

          {/* Destra */}
          <div className="topbar-right d-flex align-items-center gap-3 ms-auto">
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
                    .split(
                      /\s+/,
                    )
                    .slice(
                      0,
                      2,
                    )
                    .map(
                      (
                        word,
                      ) =>
                        word[0],
                    )
                    .join(
                      "",
                    )
                    .toUpperCase()}
                </span>
              </button>

              <ul className="dropdown-menu dropdown-menu-end">
                <li>
                  <hr className="dropdown-divider" />
                </li>

                <li>
                  <form
                    action={
                      logoutAction
                    }
                  >
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

          {/* Ricerca globale mobile */}
          <div className="d-lg-none w-100">
            <GlobalSearch />
          </div>
        </header>

        <div
          className="offcanvas offcanvas-start sidebar"
          tabIndex={
            -1
          }
          id="mobileSidebar"
          aria-labelledby="mobileMenuTitle"
        >
          <MobileNavigationClose />

          <div className="offcanvas-header border-bottom">
            <span
              id="mobileMenuTitle"
              className="visually-hidden"
            >
              Menu principale
            </span>

            <Link
              href="/dashboard"
              className="d-flex align-items-center text-decoration-none"
              aria-label="SIMI Hub home"
            >
              <Image
                src="/images/branding/LogoSimi.png"
                alt="SIMI Hub logo"
                width={
                  120
                }
                height={
                  34
                }
                priority
                style={{
                  objectFit:
                    "contain",
                  maxWidth:
                    "100%",
                  height:
                    "auto",
                }}
              />
            </Link>

            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="offcanvas"
              aria-label="Chiudi menu"
            />
          </div>

          <div className="offcanvas-body">
            <PortalNavigation
              items={
                visibleNav
              }
              mobile
            />
          </div>
        </div>

        <main className="portal-main flex-grow-1 p-3 p-lg-4">
          {children}
        </main>
      </div>

      <Suspense
        fallback={null}
      >
        <ToastNotifications />
      </Suspense>
    </div>
  );
}