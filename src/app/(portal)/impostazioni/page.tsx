import { requirePagePermission } from "@/lib/permissions";
export default async function SettingsPage() {
  await requirePagePermission("admin.settings");
  return <><h1 className="h3">Impostazioni</h1><div className="app-card p-3">La configurazione dal portale non è ancora disponibile. Ruoli e accessi sono gestiti dall’amministratore sul database.</div></>;
}
