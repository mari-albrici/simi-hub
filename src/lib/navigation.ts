export type NavigationItem = { label: string; href: string };
export const navigationGroups = [
  { label: "Contabilità", routes: ["/ordini", "/ddt", "/fatture", "/paghe", "/pagamenti"] },
  { label: "Anagrafiche", routes: ["/clienti", "/fornitori", "/aziende"] },
  { label: "Lavoro", routes: ["/attivita", "/scadenze", "/anomalie"] },
];
export function isActiveRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
