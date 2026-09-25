import "server-only";
import { z } from "zod";
import { authorizedClient } from "@/lib/permissions";
import { AppError, checkDatabase } from "@/lib/errors";
import { readAll } from "@/lib/data";
import { managementAssetSchema, managementAssetMovementSchema, managementAssetUsageSchema, uuidSchema } from "@/lib/validations";

export type AssetProject = { id: string; project_code: string; name: string };
export type ManagementAsset = Omit<z.output<typeof managementAssetSchema>, "description" | "notes"> & {
  id: string; current_project_id: string | null; physical_project: AssetProject | null;
  description: string | null; notes: string | null;
};
export type AssetMovement = {
  id: string; asset_id: string; from_project_id: string | null; to_project_id: string | null;
  from_project: AssetProject | null; to_project: AssetProject | null; movement_date: string; notes: string | null;
};
export type AssetUsage = {
  id: string; asset_id: string; project_id: string; project: AssetProject | null;
  start_date: string; end_date: string | null; usage_quantity: number | null;
  usage_unit: "hours" | "days" | "months" | "manual"; rate: number; amount: number; currency: string;
  status: "active" | "closed" | "cancelled"; notes: string | null;
};
const assetSelect = "*,physical_project:projects!management_assets_current_project_id_fkey(id,project_code,name)";
function relation<T>(value: T | T[] | null): T | null { return (Array.isArray(value) ? value[0] : value) ?? null; }
function checkAssetMutation(error: { code?: string; message: string } | null) {
  if (error?.code === "22023" && ["Attrezzatura non trovata.", "Commessa non disponibile.",
    "Utilizzo non trovato o annullato.", "Importo manuale non valido.", "Quantità utilizzo non valida.",
    "Tariffa attrezzatura non disponibile.", "Date o stato utilizzo non validi.", "Dati movimento non validi."].includes(error.message)) {
    throw new AppError("validation", error.message);
  }
  checkDatabase(error, "Aggiornamento attrezzature");
}

export async function getManagementAssets(): Promise<ManagementAsset[]> {
  const db = await authorizedClient("management.read");
  const rows = await readAll((from, to) => db.from("management_assets").select(assetSelect).order("asset_code").order("id").range(from, to));
  return rows.map(row => ({ ...row, physical_project: relation(row.physical_project) })) as ManagementAsset[];
}
export async function getManagementAssetById(id: string): Promise<ManagementAsset | null> {
  const db = await authorizedClient("management.read");
  const result = await db.from("management_assets").select(assetSelect).eq("id", uuidSchema.parse(id)).maybeSingle();
  checkDatabase(result.error, "Lettura attrezzatura");
  return result.data ? { ...result.data, physical_project: relation(result.data.physical_project) } as ManagementAsset : null;
}
export async function createManagementAsset(input: z.input<typeof managementAssetSchema>) {
  const db = await authorizedClient("management.update");
  const result = await db.from("management_assets").insert(managementAssetSchema.parse(input)).select("id").single();
  checkAssetMutation(result.error);
  return String(result.data!.id);
}
export async function updateManagementAsset(id: string, input: z.input<typeof managementAssetSchema>) {
  const db = await authorizedClient("management.update");
  const result = await db.from("management_assets").update(managementAssetSchema.parse(input)).eq("id", uuidSchema.parse(id)).select("id").maybeSingle();
  checkAssetMutation(result.error);
  if (!result.data) throw new AppError("conflict", "Attrezzatura non trovata.");
  return String(result.data.id);
}
export async function moveManagementAsset(input: z.input<typeof managementAssetMovementSchema>) {
  const db = await authorizedClient("management.update");
  const value = managementAssetMovementSchema.parse(input);
  const result = await db.rpc("move_management_asset", { p_asset_id: value.asset_id, p_to_project_id: value.to_project_id,
    p_movement_date: value.movement_date, p_notes: value.notes });
  checkAssetMutation(result.error);
  return String(result.data);
}
export async function getManagementAssetMovements(assetId: string): Promise<AssetMovement[]> {
  const db = await authorizedClient("management.read");
  const id = uuidSchema.parse(assetId);
  const rows = await readAll((from, to) => db.from("management_asset_movements")
    .select("*,from_project:projects!management_asset_movements_from_project_id_fkey(id,project_code,name),to_project:projects!management_asset_movements_to_project_id_fkey(id,project_code,name)")
    .eq("asset_id", id).order("movement_date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(from, to));
  return rows.map(row => ({ ...row, from_project: relation(row.from_project), to_project: relation(row.to_project) })) as AssetMovement[];
}
export async function getManagementAssetUsages(assetId: string): Promise<AssetUsage[]> {
  const db = await authorizedClient("management.read");
  const id = uuidSchema.parse(assetId);
  const rows = await readAll((from, to) => db.from("management_asset_usage").select("*,project:projects(id,project_code,name)")
    .eq("asset_id", id).order("start_date", { ascending: false }).order("id").range(from, to));
  return rows.map(row => ({ ...row, project: relation(row.project) })) as AssetUsage[];
}
async function saveUsage(input: z.input<typeof managementAssetUsageSchema>, id: string | null) {
  const db = await authorizedClient("management.update");
  const value = managementAssetUsageSchema.parse(input);
  const result = await db.rpc("save_management_asset_usage", { p_id: id, p_asset_id: value.asset_id, p_project_id: value.project_id,
    p_start_date: value.start_date, p_end_date: value.end_date, p_usage_quantity: value.usage_quantity,
    p_manual_amount: value.manual_amount, p_status: value.status, p_notes: value.notes });
  checkAssetMutation(result.error);
  return String(result.data);
}
export async function createManagementAssetUsage(input: z.input<typeof managementAssetUsageSchema>) { return saveUsage(input, null); }
export async function updateManagementAssetUsage(id: string, input: z.input<typeof managementAssetUsageSchema>) { return saveUsage(input, uuidSchema.parse(id)); }
export async function cancelManagementAssetUsage(id: string) {
  const db = await authorizedClient("management.update");
  const result = await db.rpc("cancel_management_asset_usage", { p_id: uuidSchema.parse(id) });
  checkAssetMutation(result.error);
}
export async function getManagementAssetProjects(): Promise<AssetProject[]> {
  const db = await authorizedClient("management.update");
  return await readAll((from, to) => db.from("projects").select("id,project_code,name").is("archived_at", null)
    .order("project_code").order("id").range(from, to)) as AssetProject[];
}
export async function getManagementAssetUsageTotals(assetId?: string) {
  const db = await authorizedClient("management.read");
  if (assetId) {
    const id = uuidSchema.parse(assetId);
    return await readAll((from, to) => db.from("management_asset_usage_totals").select("currency,total_usage").eq("asset_id", id)
      .order("currency").range(from, to)) as { currency: string; total_usage: number }[];
  }
  const result = await db.rpc("management_asset_usage_summary");
  checkDatabase(result.error, "Totali utilizzo attrezzature");
  return (result.data ?? []) as { currency: string; total_usage: number }[];
}
