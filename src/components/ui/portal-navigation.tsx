"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "@/components/ui/app-link";
import { isActiveRoute, navigationGroups, type NavigationItem } from "@/lib/navigation";

async function closeMobileMenu() {
  const element = document.getElementById("mobileSidebar");
  if (element) { const { Offcanvas } = await import("bootstrap"); Offcanvas.getInstance(element)?.hide(); }
}
export function MobileMenuButton() {
  return <button className="btn btn-outline-secondary d-lg-none" type="button" aria-label="Apri menu" aria-controls="mobileSidebar" onClick={async () => {
    const element = document.getElementById("mobileSidebar");
    if (element) { const { Offcanvas } = await import("bootstrap"); Offcanvas.getOrCreateInstance(element).show(); }
  }}><i className="bi bi-list" aria-hidden="true" /></button>;
}
export function MobileNavigationClose() {
  const pathname = usePathname();
  useEffect(() => { void closeMobileMenu(); }, [pathname]);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 992px)");
    const close = () => { if (query.matches) void closeMobileMenu(); };
    query.addEventListener("change", close);
    return () => query.removeEventListener("change", close);
  }, []);
  return null;
}
export function PortalNavigation({ items, mobile = false }: { items: NavigationItem[]; mobile?: boolean }) {
  const pathname = usePathname();
  return <NavigationTree key={pathname} pathname={pathname} items={items} mobile={mobile} />;
}
function NavigationTree({ items, mobile, pathname }: { items: NavigationItem[]; mobile: boolean; pathname: string }) {
  const [opened, setOpened] = useState<string[]>(navigationGroups.filter(g => g.routes.some(r => isActiveRoute(pathname, r))).map(g => g.label));
  const link = (item: NavigationItem) => <Link key={item.href} href={item.href} className={`nav-link${isActiveRoute(pathname, item.href) ? " active" : ""}`} aria-current={isActiveRoute(pathname, item.href) ? "page" : undefined} onClick={mobile ? () => void closeMobileMenu() : undefined}>{item.label}</Link>;
  const single = (href: string) => { const item = items.find(i => i.href === href); return item ? link(item) : null; };
  const group = (index: number) => {
    const g = navigationGroups[index], children = g.routes.flatMap(r => items.filter(i => i.href === r));
    if (!children.length) return null;
    const open = opened.includes(g.label), active = g.routes.some(r => isActiveRoute(pathname, r)), id = `${mobile ? "mobile" : "desktop"}-nav-${index}`;
    return <div><button className={`nav-link nav-group w-100 d-flex justify-content-between${active ? " group-active" : ""}`} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpened(open ? opened.filter(x => x !== g.label) : [...opened, g.label])}>{g.label}<i aria-hidden="true" className={`bi bi-chevron-${open ? "up" : "down"}`} /></button><div id={id} className={`collapse${open ? " show" : ""}`}><div className="nav flex-column ps-3">{children.map(link)}</div></div></div>;
  };
  return (
    <nav
      aria-label="Navigazione principale"
      className="nav flex-column gap-1"
    >
      {single("/dashboard")}
      {single("/commesse")}
      {group(0)}
      {single("/documenti")}
      {group(1)}
      {group(2)}
      {single("/personale")}
      {single("/guide")}
      {single("/report")}
      {single("/impostazioni")}
    </nav>
  );
}
